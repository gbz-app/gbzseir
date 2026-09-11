-- Gebzem: service request dispatch fix. Owner bug: a su tesisatı request never reached the firm that serves it.
-- Re-runnable. Function bodies are the live ones (pg_get_functiondef, 2026-09-11) plus the changes below.
--
-- 1) Every category dispatches automatically: service_categories.auto_dispatch defaults to true and every row is set to
--    true. The column stays, so an admin can still put a category in Concierge mode (admin category table toggle).
-- 2) Concierge safety net: private.redispatch_requests (cron gebzem-request-redispatch, 13,43 * * * *) also dispatches
--    'admin_review' requests older than app_settings.request_review_minutes (default 30, kept within 5-1440). It runs
--    inside the existing quiet-hours gate like the other waves (firms are not woken at night by the cron).
-- 3) private.dispatch_request: the area is for priority, not exclusion. Firms serving the request's neighbourhood come
--    first; when fewer of them than the pool size (notify_pool_size) exist, the other firms of the category fill the
--    pool, ranked after them. dispatch_note 'area_fallback' now means: this dispatch sent a lead to a firm outside its
--    chosen neighbourhoods (admin badge "Bölge dışı eşleşme").
-- 4) private.match_candidates: demo firms (businesses.is_demo) never get a non-demo request. A request is demo when
--    service_requests.is_demo or its customer's profile is_demo. public.service_provider_counts is unchanged.
-- 5) Web push (sender: /api/notifications/push):
--    - A notification of a user with no live push subscription is no longer marked sent. The sender stores
--      push_error = 'no_subscription' and leaves push_sent_at null ("parked"). A parked row is claimed again only when
--      the user has a push subscription created after its last attempt, the row is unread and younger than 24 hours
--      (at most 10 attempts). So it is sent once when the user turns notifications on, never in a loop.
--    - Failed sends keep 3 attempts with the 5 minute lease; the window is now 24 hours (was 6).
--    - The claim clears push_error, so 'no_subscription' always means "the last finished attempt found no
--      subscription" and an in-flight row is never claimed twice.
--    - Subscribe flush: a new push_subscriptions row pings the sender at once when that user has claimable rows.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1) Automatic dispatch for every category
-- ---------------------------------------------------------------------------
alter table public.service_categories alter column auto_dispatch set default true;
update public.service_categories set auto_dispatch = true where not auto_dispatch;

insert into public.app_settings (key, value) values ('request_review_minutes', '30'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 4) match_candidates: live body + demo firms only for demo requests
-- ---------------------------------------------------------------------------
create or replace function private.match_candidates(p_request_id uuid, p_only uuid[] default null)
returns table (business_id uuid, owner_id uuid, business_name text, area_match boolean, score numeric)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with r as (
    select sr.*, sc.parent_id as cat_parent,
           (sr.is_demo or coalesce(pr.is_demo, false)) as demo_request
      from public.service_requests sr
      join public.service_categories sc on sc.id = sr.category_id
      left join public.profiles pr on pr.id = sr.customer_id
     where sr.id = p_request_id
  ),
  c as (
    select b.id as business_id, b.owner_id, b.name as business_name,
           exists (select 1 from public.business_service_areas a
                    where a.business_id = b.id and a.neighbourhood_id = r.neighbourhood_id) as area_match,
           (case when exists (select 1 from public.business_service_areas a
                               where a.business_id = b.id and a.neighbourhood_id = r.neighbourhood_id) then 0.5 else 0 end)
           + 0.20 * (coalesce(b.rating_avg, 0) / 5.0)
           + 0.15 * (1.0 / (1 + (select count(*) from public.leads l2
                                  where l2.business_id = b.id and l2.created_at > now() - interval '7 days')))
           + 0.10 * (b.verification_level / 3.0) as base_score
      from r
      join public.businesses b on true
     where b.status = 'approved'
       and not private.is_banned(b.owner_id)
       and not b.vacation_mode
       and 'service' = any (b.kinds)
       and b.owner_id is distinct from r.customer_id
       -- Demo firms only ever get demo requests (a real customer's request never goes to a demo firm).
       and (not b.is_demo or r.demo_request)
       and (p_only is null or b.id = any (p_only))
       and exists (select 1 from public.business_service_categories bc
                    where bc.business_id = b.id and bc.category_id in (r.category_id, r.cat_parent))
       -- An owner who already got a lead for this request (through any of their businesses) is skipped.
       and not exists (select 1 from public.leads l
                         join public.businesses b2 on b2.id = l.business_id
                        where l.request_id = r.id and b2.owner_id = b.owner_id)
  ),
  pick as (
    select distinct on (c.owner_id) c.*
      from c
     order by c.owner_id, c.area_match desc, c.base_score desc, c.business_id
  )
  select pick.business_id, pick.owner_id, pick.business_name, pick.area_match,
         (pick.base_score + 0.05 * random())::numeric as score
    from pick
$$;

revoke all on function private.match_candidates(uuid, uuid[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) dispatch_request: live body, area-matched firms first, the rest of the category fills the pool
-- ---------------------------------------------------------------------------
create or replace function private.dispatch_request(p_request_id uuid, p_wave int default 1, p_only uuid[] default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_req public.service_requests;
  v_cat public.service_categories;
  v_nb text;
  v_fallback boolean := false;
  v_count int := 0;
  v_total int;
  v_lead uuid;
  v_status text;
  rec record;
begin
  select * into v_req from public.service_requests where id = p_request_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_req.status not in ('admin_review', 'open', 'no_match') then
    return jsonb_build_object('ok', false, 'reason', 'closed', 'status', v_req.status);
  end if;
  select * into v_cat from public.service_categories where id = v_req.category_id;
  select name into v_nb from public.neighbourhoods where id = v_req.neighbourhood_id;

  -- The area is for priority, not exclusion: firms serving the neighbourhood first, then the other firms of the
  -- category fill the pool (notify_pool_size; 50 for an admin's hand-picked list).
  for rec in
    select c.* from private.match_candidates(p_request_id, p_only) c
     order by c.area_match desc, c.score desc
     limit case when p_only is null then v_cat.notify_pool_size else 50 end
  loop
    v_lead := null;
    insert into public.leads (request_id, business_id, status, wave_no, match_score)
    values (v_req.id, rec.business_id, 'sent', coalesce(p_wave, 1), round(rec.score, 3))
    on conflict (request_id, business_id) do nothing
    returning id into v_lead;
    if v_lead is not null then
      v_count := v_count + 1;
      if not rec.area_match then
        v_fallback := true;
      end if;
      perform private.notify(rec.owner_id, 'lead_new',
        'Yeni hizmet talebi: ' || v_cat.name || ' - ' || coalesce(v_nb, 'Gebze'),
        rec.business_name || ' için yeni talep. İncele, ilgileniyorsan kabul et.',
        '/isletme/talepler/' || v_lead);
    end if;
  end loop;

  select count(*) into v_total from public.leads where request_id = v_req.id;
  v_status := case when v_total > 0 then
                     case when v_req.status in ('admin_review', 'no_match') then 'open' else v_req.status end
                   else 'no_match' end;
  update public.service_requests
     set status = v_status,
         dispatch_note = case when v_fallback then 'area_fallback' else dispatch_note end,
         stalled_at = case when v_count > 0 then null else stalled_at end
   where id = v_req.id;

  if v_status = 'no_match' then
    perform private.notify_admins('request_no_match', 'Eşleşen firma yok: ' || v_cat.name,
      coalesce(v_nb, 'Gebze') || ' için uygun firma bulunamadı.', '/admin/talepler');
  end if;

  return jsonb_build_object('ok', true, 'lead_count', v_count, 'total_leads', v_total,
                            'fallback', v_fallback, 'status', v_status);
end $$;

revoke all on function private.dispatch_request(uuid, int, uuid[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) redispatch_requests: live body + Concierge safety net for unreviewed 'admin_review' requests
-- ---------------------------------------------------------------------------
create or replace function private.redispatch_requests(p_ignore_quiet boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hours int := least(greatest(private.app_setting_int('request_redispatch_hours', 6), 1), 72);
  v_review int := least(greatest(private.app_setting_int('request_review_minutes', 30), 5), 1440);
  v_expired int;
  v_res jsonb;
  v_dispatched int := 0;
  v_stalled int := 0;
  v_reviewed int := 0;
  rec record;
begin
  v_expired := private.expire_service_requests();
  if not coalesce(p_ignore_quiet, false) and private.is_quiet_hours() then
    return jsonb_build_object('ok', true, 'quiet', true, 'expired', v_expired);
  end if;

  -- Concierge safety net: a request nobody reviewed within request_review_minutes goes out like an automatic one
  -- (dispatch_request turns it into 'open', or 'no_match' with the admin notice when no firm fits).
  for rec in
    select r.id
      from public.service_requests r
     where r.status = 'admin_review'
       and r.created_at < now() - make_interval(mins => v_review)
       and not private.is_banned(r.customer_id)
     order by r.created_at
     limit 200
  loop
    perform private.dispatch_request(rec.id, 1, null);
    v_reviewed := v_reviewed + 1;
  end loop;

  for rec in
    select r.id
      from public.service_requests r
      cross join lateral (
        select max(l.created_at) as last_at,
               count(*) filter (where l.status in ('sent', 'seen', 'accepted')) as live
          from public.leads l
         where l.request_id = r.id) w
     where (r.status = 'no_match'
            or (r.status = 'open' and r.accepted_count = 0
                and (w.live = 0 or w.last_at is null or w.last_at < now() - make_interval(hours => v_hours))))
       and not private.is_banned(r.customer_id)
       -- Only rows with work to do (a new firm, or a first stall notice), so waiting rows never fill the batch.
       and ((r.status = 'open' and r.stalled_at is null)
            or exists (select 1 from private.match_candidates(r.id, null)))
     order by r.created_at
     limit 200
  loop
    v_res := private.redispatch_request(rec.id);
    if v_res ->> 'result' = 'dispatched' then
      v_dispatched := v_dispatched + 1;
    elsif v_res ->> 'result' = 'stalled' then
      v_stalled := v_stalled + 1;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'quiet', false, 'expired', v_expired, 'hours', v_hours,
                            'review_minutes', v_review, 'reviewed', v_reviewed,
                            'dispatched', v_dispatched, 'stalled', v_stalled);
end $$;

revoke all on function private.redispatch_requests(boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) Web push: park rows of users without a subscription, send them once the user subscribes (24 h window)
-- ---------------------------------------------------------------------------
-- The claimable rule. Keep it identical to the WHERE of public.claim_push_notifications below (the claim has to
-- inline it so the row lock re-checks it on the latest row version).
create or replace function private.push_has_claimable(p_user uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.notifications c
     where c.push_sent_at is null
       and c.created_at > now() - interval '24 hours'
       and (p_user is null or c.user_id = p_user)
       and ((c.push_error is distinct from 'no_subscription'
             and c.push_attempts < 3
             and (c.push_attempted_at is null or c.push_attempted_at < now() - interval '5 minutes'))
         or (c.push_error = 'no_subscription'
             and c.push_attempts < 10
             and c.read_at is null
             and exists (select 1 from public.push_subscriptions s
                          where s.user_id = c.user_id
                            and s.created_at > coalesce(c.push_attempted_at, c.created_at)))))
$$;

revoke all on function private.push_has_claimable(uuid) from public, anon, authenticated;

create or replace function public.claim_push_notifications(p_limit integer default 100)
returns table (id uuid, user_id uuid, type text, title text, body text, link text, push_attempts smallint)
language sql
volatile
security definer
set search_path = public
as $$
  update public.notifications n
     set push_attempts = n.push_attempts + 1,
         push_attempted_at = now(),
         push_error = null
   where n.id in (
     select c.id
       from public.notifications c
      where c.push_sent_at is null
        and c.created_at > now() - interval '24 hours'
        -- Failed sends: at most 3 attempts, 5 minute lease.
        and ((c.push_error is distinct from 'no_subscription'
              and c.push_attempts < 3
              and (c.push_attempted_at is null or c.push_attempted_at < now() - interval '5 minutes'))
          -- Parked (no subscription at the last attempt): once per subscription created after that attempt.
          or (c.push_error = 'no_subscription'
              and c.push_attempts < 10
              and c.read_at is null
              and exists (select 1 from public.push_subscriptions s
                           where s.user_id = c.user_id
                             and s.created_at > coalesce(c.push_attempted_at, c.created_at))))
      order by c.created_at
      limit least(greatest(coalesce(p_limit, 100), 1), 200)
      for update skip locked)
  returning n.id, n.user_id, n.type, n.title, n.body, n.link, n.push_attempts
$$;

revoke execute on function public.claim_push_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_push_notifications(integer) to service_role;

-- Live body; the pending check is now the shared claimable rule.
create or replace function private.push_retry_webhook()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
begin
  if not private.push_has_claimable(null) then
    return;
  end if;
  select ds.decrypted_secret into v_secret
    from vault.decrypted_secrets ds
   where ds.name = 'gebzem_push_webhook_secret'
   order by ds.created_at desc
   limit 1;
  if v_secret is null or v_secret = '' then
    return;
  end if;
  -- Asynchronous: pg_net sends it after the cron transaction commits.
  perform net.http_post(
    url := 'https://gbzsehir.vercel.app/api/notifications/push',
    body := jsonb_build_object('source', 'pg_cron'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 30000);
end $$;

revoke all on function private.push_retry_webhook() from public, anon, authenticated;

-- Subscribe flush: a new subscription sends that user's parked notifications (last 24 h) right away.
create or replace function private.push_subscription_flush()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
begin
  if not private.push_has_claimable(new.user_id) then
    return null;
  end if;
  select ds.decrypted_secret into v_secret
    from vault.decrypted_secrets ds
   where ds.name = 'gebzem_push_webhook_secret'
   order by ds.created_at desc
   limit 1;
  if v_secret is null or v_secret = '' then
    return null;
  end if;
  -- Asynchronous: pg_net sends it after the subscribe transaction commits.
  perform net.http_post(
    url := 'https://gbzsehir.vercel.app/api/notifications/push',
    body := jsonb_build_object('source', 'subscribe'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 8000);
  return null;
exception when others then
  -- Best effort: never let it break saving the subscription (the 10 minute retry job catches up).
  return null;
end $$;

revoke all on function private.push_subscription_flush() from public, anon, authenticated;

drop trigger if exists push_subscriptions_flush on public.push_subscriptions;
create trigger push_subscriptions_flush
  after insert on public.push_subscriptions
  for each row execute function private.push_subscription_flush();
