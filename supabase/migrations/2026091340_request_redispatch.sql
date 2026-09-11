-- Service request follow-up (audit step 24). Re-runnable.
--
-- 1) app_settings.request_redispatch_hours (default 6, 1-72): an open request with no accepted firm gets a next wave
--    this many hours after its last wave; when every firm declined it gets one at the next run.
-- 2) service_requests.stalled_at: set when a next wave found no new firm (one 'request_stalled' admin notice);
--    cleared by any dispatch that creates leads.
-- 3) pg_cron job gebzem-request-redispatch (every 30 min, pure SQL): expires 14-day-old requests (customer gets
--    'request_expired'), then outside 22:00-08:00 Istanbul sends next waves (firms are not woken at night).
--    no_match requests are retried silently when a matching firm appears.
-- 4) customer_remove_lead: firms whose leads re-open get 'lead_reopened'.
-- 5) get_request_for_customer: + stalled_at. service_provider_counts(): approved firms per category (public).
-- Texts of the new notification types: see private.redispatch_request, private.expire_service_requests,
-- public.customer_remove_lead. Push goes through the existing notifications_push_webhook trigger.

set search_path = public, extensions;

insert into public.app_settings (key, value) values ('request_redispatch_hours', '6'::jsonb)
on conflict (key) do nothing;

alter table public.service_requests add column if not exists stalled_at timestamptz;

-- ---------------------------------------------------------------------------
-- 1) Helpers
-- ---------------------------------------------------------------------------
-- 22:00-08:00 Europe/Istanbul: no automatic lead pushes to firms, expiry notices stay in-app.
create or replace function private.is_quiet_hours()
returns boolean
language sql
stable
set search_path = ''
as $$
  select extract(hour from (now() at time zone 'Europe/Istanbul')) not between 8 and 21
$$;

revoke all on function private.is_quiet_hours() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) dispatch_request: latest body (2026091251_business_open_fixes) + stalled_at reset
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
  v_has_area boolean;
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

  select coalesce(bool_or(c.area_match), false) into v_has_area
    from private.match_candidates(p_request_id, p_only) c;

  if not v_has_area and exists (select 1 from private.match_candidates(p_request_id, p_only)) then
    v_fallback := true;
  end if;

  for rec in
    select c.* from private.match_candidates(p_request_id, p_only) c
     where (p_only is not null or not v_has_area or c.area_match)
     order by c.score desc
     limit case when p_only is null then v_cat.notify_pool_size else 50 end
  loop
    v_lead := null;
    insert into public.leads (request_id, business_id, status, wave_no, match_score)
    values (v_req.id, rec.business_id, 'sent', coalesce(p_wave, 1), round(rec.score, 3))
    on conflict (request_id, business_id) do nothing
    returning id into v_lead;
    if v_lead is not null then
      v_count := v_count + 1;
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
-- 3) Next wave for one request. Returns {ok, result: dispatched | stalled | none | closed, ...}.
-- ---------------------------------------------------------------------------
create or replace function private.redispatch_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_r public.service_requests;
  v_wave int;
  v_res jsonb;
  v_cat text;
  v_nb text;
begin
  select * into v_r from public.service_requests where id = p_request_id for update;
  if not found or v_r.status not in ('open', 'no_match') then
    return jsonb_build_object('ok', false, 'result', 'closed');
  end if;
  select coalesce(max(wave_no), 0) into v_wave from public.leads where request_id = v_r.id;

  -- match_candidates skips owners that already have a lead for this request.
  if exists (select 1 from private.match_candidates(v_r.id, null)) then
    v_res := private.dispatch_request(v_r.id, v_wave + 1, null);
    if coalesce((v_res ->> 'lead_count')::int, 0) > 0 then
      return jsonb_build_object('ok', true, 'result', 'dispatched', 'wave', v_wave + 1,
                                'lead_count', (v_res ->> 'lead_count')::int);
    end if;
  end if;

  -- No new firm: one admin notice per stall (no_match already sent 'request_no_match').
  if v_r.status = 'open' and v_r.stalled_at is null then
    update public.service_requests set stalled_at = now() where id = v_r.id;
    select name into v_cat from public.service_categories where id = v_r.category_id;
    select name into v_nb from public.neighbourhoods where id = v_r.neighbourhood_id;
    perform private.notify_admins('request_stalled', 'Firma bekleyen talep: ' || coalesce(v_cat, 'Hizmet'),
      coalesce(v_nb, 'Gebze') || ' - kod ' || v_r.public_code
        || '. Gönderilen firmalar ilgilenmedi ve yeni uygun firma yok; elle firma seç.',
      '/admin/talepler');
    return jsonb_build_object('ok', true, 'result', 'stalled');
  end if;
  return jsonb_build_object('ok', true, 'result', 'none');
end $$;

revoke all on function private.redispatch_request(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) Expiry (14 days) with a customer notice. Returns the number of expired requests.
-- ---------------------------------------------------------------------------
create or replace function private.expire_service_requests()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
  v_quiet boolean := private.is_quiet_hours();
begin
  with x as (
    update public.service_requests set status = 'expired', closed_at = now()
     where status in ('admin_review', 'open', 'no_match') and created_at < now() - interval '14 days'
    returning id, customer_id, category_id, public_code, accepted_count
  ), n as (
    -- At night the notice is in-app only (push_sent_at set = the push webhook skips it).
    insert into public.notifications (user_id, type, title, body, link, push_sent_at)
    select x.customer_id, 'request_expired', 'Talebinin süresi doldu',
           c.name || case when x.accepted_count > 0
                          then ' talebin 14 gün dolduğu için kapandı. İlgilenen firmaları talep sayfanda görmeye devam edebilirsin.'
                          else ' talebin 14 gün içinde sonuçlanmadığı için kapandı. İstersen yeni bir talep oluşturabilirsin.' end,
           '/talep/' || x.public_code,
           case when v_quiet then now() end
      from x
      join public.service_categories c on c.id = x.category_id
     where x.customer_id is not null
    returning 1
  )
  select count(*) into v_n from x;

  update public.leads set status = 'closed_full'
   where status in ('sent', 'seen')
     and request_id in (select id from public.service_requests where status = 'expired');
  return v_n;
end $$;

revoke all on function private.expire_service_requests() from public, anon, authenticated;

-- Latest body (20260910000003_rpc.sql); the request part moved to private.expire_service_requests().
create or replace function public.expire_listings()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  update public.listings set status = 'expired'
   where status in ('active', 'paused') and expires_at < now();
  get diagnostics v_n = row_count;

  perform private.expire_service_requests();
  delete from public.demo_otp where created_at < now() - interval '1 day';
  return v_n;
end $$;

revoke all on function public.expire_listings() from public, anon, authenticated;
grant execute on function public.expire_listings() to service_role;

-- ---------------------------------------------------------------------------
-- 5) Cron batch: expiry, then next waves (daytime only unless p_ignore_quiet).
-- ---------------------------------------------------------------------------
create or replace function private.redispatch_requests(p_ignore_quiet boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hours int := least(greatest(private.app_setting_int('request_redispatch_hours', 6), 1), 72);
  v_expired int;
  v_res jsonb;
  v_dispatched int := 0;
  v_stalled int := 0;
  rec record;
begin
  v_expired := private.expire_service_requests();
  if not coalesce(p_ignore_quiet, false) and private.is_quiet_hours() then
    return jsonb_build_object('ok', true, 'quiet', true, 'expired', v_expired);
  end if;

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
                            'dispatched', v_dispatched, 'stalled', v_stalled);
end $$;

revoke all on function private.redispatch_requests(boolean) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'gebzem-request-redispatch';
    perform cron.schedule('gebzem-request-redispatch', '13,43 * * * *', 'select private.redispatch_requests()');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6) customer_remove_lead: latest body (20260910000003_rpc.sql) + notice to re-opened firms
-- ---------------------------------------------------------------------------
create or replace function public.customer_remove_lead(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_l public.leads;
  v_r public.service_requests;
  v_cat text;
  v_nb text;
begin
  select * into v_l from public.leads where id = p_lead_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  select * into v_r from public.service_requests where id = v_l.request_id for update;
  if v_r.customer_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_l.status <> 'accepted' or v_r.status not in ('open', 'filled') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_status');
  end if;
  update public.leads set status = 'removed_by_customer' where id = v_l.id;
  update public.service_requests
     set accepted_count = greatest(accepted_count - 1, 0),
         status = case when status = 'filled' then 'open' else status end
   where id = v_r.id;
  if v_r.status = 'filled' then
    select name into v_cat from public.service_categories where id = v_r.category_id;
    select name into v_nb from public.neighbourhoods where id = v_r.neighbourhood_id;
    with u as (
      update public.leads set status = 'seen'
       where request_id = v_r.id and status = 'closed_full'
      returning id, business_id
    )
    insert into public.notifications (user_id, type, title, body, link)
    select b.owner_id, 'lead_reopened',
           'Talepte yer açıldı: ' || coalesce(v_cat, 'Hizmet') || ' - ' || coalesce(v_nb, 'Gebze'),
           b.name || ' için: müşteri bir firmayı listeden çıkardı. Hâlâ ilgileniyorsan talebi kabul edebilirsin.',
           '/isletme/talepler/' || u.id
      from u
      join public.businesses b on b.id = u.business_id
     where not private.is_banned(b.owner_id);
  end if;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.customer_remove_lead(uuid) from public, anon;
grant execute on function public.customer_remove_lead(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7) get_request_for_customer: latest body (20260910000003_rpc.sql) + stalled_at
-- ---------------------------------------------------------------------------
create or replace function public.get_request_for_customer(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_r public.service_requests;
  v_cat public.service_categories;
  v_parent public.service_categories;
  v_schema jsonb;
  v_nb public.neighbourhoods;
  v_review public.reviews;
begin
  select * into v_r from public.service_requests where public_code = upper(btrim(p_code));
  if not found or (v_r.customer_id is distinct from auth.uid() and not public.is_admin()) then
    return null;
  end if;
  select * into v_cat from public.service_categories where id = v_r.category_id;
  select * into v_parent from public.service_categories where id = v_cat.parent_id;
  select schema into v_schema from public.question_flows where id = v_r.flow_id;
  select * into v_nb from public.neighbourhoods where id = v_r.neighbourhood_id;
  if v_r.hired_business_id is not null then
    select * into v_review from public.reviews where request_id = v_r.id and business_id = v_r.hired_business_id;
  end if;

  return jsonb_build_object(
    'request', jsonb_build_object(
      'id', v_r.id,
      'public_code', v_r.public_code,
      'status', v_r.status,
      'category', jsonb_build_object('id', v_cat.id, 'name', v_cat.name, 'slug', v_cat.slug, 'icon', v_cat.icon,
                                     'parent_name', v_parent.name, 'parent_slug', v_parent.slug),
      'neighbourhood', case when v_nb.id is null then null else
                         jsonb_build_object('id', v_nb.id, 'name', v_nb.name, 'district', v_nb.district) end,
      'address_note', v_r.address_note,
      'when_type', v_r.when_type,
      'when_date', v_r.when_date,
      'note', v_r.note,
      'photos', to_jsonb(v_r.photos),
      'hide_phone', v_r.hide_phone,
      'answers', private.resolve_answers(v_schema, v_r.answers),
      'accepted_count', v_r.accepted_count,
      'max_providers', v_r.max_providers,
      'sent_count', (select count(*) from public.leads where request_id = v_r.id),
      'hired_business_id', v_r.hired_business_id,
      'stalled_at', v_r.stalled_at,
      'created_at', v_r.created_at,
      'closed_at', v_r.closed_at),
    'providers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'lead_id', l.id,
               'status', l.status,
               'offer_price_try', l.offer_price_try,
               'offer_note', l.offer_note,
               'accepted_at', l.accepted_at,
               'business', jsonb_build_object(
                 'id', b.id, 'name', b.name, 'slug', b.slug, 'logo_url', b.logo_url,
                 'rating_avg', b.rating_avg, 'rating_count', b.rating_count,
                 'verification_level', b.verification_level, 'phone', b.phone,
                 'category_label', b.category_label))
             order by l.accepted_at)
        from public.leads l
        join public.businesses b on b.id = l.business_id
       where l.request_id = v_r.id and l.status = 'accepted'), '[]'::jsonb),
    'review', case when v_review.id is null then null else
                jsonb_build_object('id', v_review.id, 'rating', v_review.rating, 'comment', v_review.comment,
                                   'reply', v_review.reply, 'created_at', v_review.created_at) end
  );
end $$;

revoke all on function public.get_request_for_customer(text) from public, anon;
grant execute on function public.get_request_for_customer(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8) Approved firms per active category (public catalog: 0 = "Yakında").
--    Same eligibility as private.match_candidates; a sub also counts firms of its parent category.
-- ---------------------------------------------------------------------------
create or replace function public.service_provider_counts()
returns table (category_id uuid, provider_count int)
language sql
stable
security definer
set search_path = public
as $$
  select c.id,
         (select count(distinct b.id)::int
            from public.business_service_categories bc
            join public.businesses b on b.id = bc.business_id
           where (bc.category_id = c.id
                  or bc.category_id = c.parent_id
                  or bc.category_id in (select ch.id from public.service_categories ch where ch.parent_id = c.id))
             and b.status = 'approved'
             and not b.vacation_mode
             and 'service' = any (b.kinds)
             and not private.is_banned(b.owner_id))
    from public.service_categories c
   where c.active
$$;

revoke all on function public.service_provider_counts() from public;
grant execute on function public.service_provider_counts() to anon, authenticated, service_role;
