-- Security hardening pack (audit 2026-09-11).
-- a) push_subscriptions: endpoint must be a real push service + at most 10 rows per user   (DBAUTH-2, uploads-push-subscriptions-any-endpoint)
-- b) reviews: the owner is notified only for a NEW review; at most 20 new reviews per 24 h (EP-2, uploads-review-notification-spam)
-- c) listings of a non-public business are hidden; reveal_listing_phone refuses them and demo listings
--    (uploads-suspended-business-job-ads, uploads-demo-aranamaz-ui-only)
-- d) storage: at most 100 uploads per bucket per 24 h per user                             (uploads-storage-unbounded-uploads)
-- e) log_contact_event: daily cap per caller; nothing stored without a user or ip hash      (uploads-contact-events-unbounded-anon)
-- f) delete_my_account: needs an SMS code verified in the last 10 minutes                  (EP-4, AUTH-4)
-- Every replaced function keeps its signature, SECURITY DEFINER, search_path and grants (CREATE OR REPLACE keeps the ACL).


-- a) push_subscriptions ------------------------------------------------------------------------------------------------
-- All live rows pass (fcm.googleapis.com, web.push.apple.com). web.push.apple.com is covered by *.push.apple.com.
alter table public.push_subscriptions drop constraint if exists push_subscriptions_endpoint_host;
alter table public.push_subscriptions add constraint push_subscriptions_endpoint_host check (
  char_length(endpoint) <= 1000
  and endpoint ~ '^https://(fcm\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)/'
);

-- Runs as the caller (not SECURITY DEFINER) so current_user tells API callers apart and RLS limits it to own rows.
-- A new device beyond 10 evicts the caller's oldest subscriptions instead of failing, so a user with stale devices
-- can still subscribe, while one account can never make the push sender fan out to more than 10 endpoints.
create or replace function private.push_subscriptions_cap()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new; -- service role / migrations are not limited
  end if;
  perform pg_advisory_xact_lock(hashtext('push_subscriptions:' || new.user_id::text));
  -- Re-saving a known endpoint (the client upserts on endpoint) is not a new device.
  if exists (select 1 from public.push_subscriptions where endpoint = new.endpoint) then
    return new;
  end if;
  delete from public.push_subscriptions
   where id in (select s.id from public.push_subscriptions s
                 where s.user_id = new.user_id
                 order by s.created_at desc, s.id desc
                 offset 9);
  return new;
end $$;
-- Trigger-only; nobody calls it directly (EXECUTE is not checked when a trigger fires).
revoke all on function private.push_subscriptions_cap() from public, anon, authenticated;

drop trigger if exists push_subscriptions_cap on public.push_subscriptions;
create trigger push_subscriptions_cap
  before insert on public.push_subscriptions
  for each row execute function private.push_subscriptions_cap();


-- b) reviews -----------------------------------------------------------------------------------------------------------
-- audit_log gets a 'review.created' row for every INSERT into reviews (audit_reviews trigger) and keeps it after the
-- review is deleted, so a delete + resubmit loop is counted too. Called only from the SECURITY DEFINER RPCs below.
create or replace function private.review_quota_exceeded(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*) from public.audit_log a
           where a.user_id = p_uid and a.action = 'review.created' and a.created_at > now() - interval '24 hours') >= 20
      or (select count(*) from public.reviews r
           where r.author_id = p_uid and r.created_at > now() - interval '24 hours') >= 20
$$;
revoke all on function private.review_quota_exceeded(uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_business_review(p_business_id uuid, p_rating integer, p_comment text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_b public.businesses;
  v_id uuid;
  v_inserted boolean;
  v_comment text := nullif(left(btrim(coalesce(p_comment, '')), 1000), '');
begin
  if v_uid is null then
    raise exception 'Yorum yapmak için giriş yapmalısın' using errcode = '42501', hint = 'login_required';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and status in ('banned', 'restricted')) then
    return jsonb_build_object('ok', false, 'reason', 'restricted');
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_rating');
  end if;
  select * into v_b from public.businesses where id = p_business_id;
  if not found or not public.business_is_public(v_b.id) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_b.owner_id = v_uid then
    return jsonb_build_object('ok', false, 'reason', 'own_business');
  end if;

  -- At most 20 NEW reviews per 24 h per account; editing an existing review is always allowed.
  perform pg_advisory_xact_lock(hashtext('review:' || v_uid::text));
  if not exists (select 1 from public.reviews where business_id = p_business_id and author_id = v_uid and request_id is null)
     and private.review_quota_exceeded(v_uid) then
    raise exception 'Bugün çok fazla değerlendirme yaptın. Yarın tekrar dene.' using errcode = 'P0001', hint = 'rate_limited';
  end if;

  insert into public.reviews (business_id, author_id, rating, comment)
  values (p_business_id, v_uid, p_rating, v_comment)
  on conflict (business_id, author_id) where request_id is null
    do update set rating = excluded.rating, comment = excluded.comment
  returning id, (xmax = 0) into v_id, v_inserted;

  perform private.recompute_business_rating(p_business_id);

  -- Only a new review notifies the owner; edits and repeated submits do not.
  if v_inserted then
    perform private.notify(v_b.owner_id, 'review_new', 'Yeni değerlendirme: ' || p_rating || ' yıldız',
      v_b.name || ' için bir kullanıcı değerlendirme yaptı.', '/isletme/sec?b=' || v_b.id || '&next=/isletme/yorumlar');
  end if;
  return jsonb_build_object('ok', true, 'review_id', v_id);
end $function$;

CREATE OR REPLACE FUNCTION public.submit_review(p_request_code text, p_business_id uuid, p_rating integer, p_comment text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_r public.service_requests;
  v_id uuid;
  v_inserted boolean;
  v_owner uuid;
  v_name text;
begin
  if private.is_banned(auth.uid()) then
    raise exception 'Hesabın engellendiği için değerlendirme yapamazsın' using errcode = '42501', hint = 'banned';
  end if;
  select * into v_r from public.service_requests where public_code = upper(btrim(p_request_code));
  if not found or v_r.customer_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_r.status <> 'closed_hired' or v_r.hired_business_id is distinct from p_business_id then
    return jsonb_build_object('ok', false, 'reason', 'not_hired');
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_rating');
  end if;

  -- Same per-account cap as submit_business_review; editing the existing review is always allowed.
  perform pg_advisory_xact_lock(hashtext('review:' || auth.uid()::text));
  if not exists (select 1 from public.reviews where request_id = v_r.id and business_id = p_business_id)
     and private.review_quota_exceeded(auth.uid()) then
    raise exception 'Bugün çok fazla değerlendirme yaptın. Yarın tekrar dene.' using errcode = 'P0001', hint = 'rate_limited';
  end if;

  insert into public.reviews (business_id, request_id, author_id, rating, comment)
  values (p_business_id, v_r.id, auth.uid(), p_rating, nullif(left(btrim(coalesce(p_comment, '')), 1000), ''))
  on conflict (request_id, business_id)
    do update set rating = excluded.rating, comment = excluded.comment
  returning id, (xmax = 0) into v_id, v_inserted;
  perform private.recompute_business_rating(p_business_id);
  -- Only a new review notifies the owner; edits do not.
  if v_inserted then
    select owner_id, name into v_owner, v_name from public.businesses where id = p_business_id;
    perform private.notify(v_owner, 'review_new', 'Yeni değerlendirme: ' || p_rating || ' yıldız',
      v_name || ' için bir müşterin değerlendirme yaptı.', '/isletme/sec?b=' || p_business_id || '&next=/isletme/yorumlar');
  end if;
  return jsonb_build_object('ok', true, 'review_id', v_id);
end $function$;


-- c) listings of non-public businesses, demo phones ---------------------------------------------------------------------
-- The owner and admins keep access through the separate "owner read" policy. search_listings (SECURITY INVOKER) inherits it.
drop policy if exists "public read published" on public.listings;
create policy "public read published" on public.listings
  for select to anon, authenticated
  using (
    status = any (array['active'::text, 'sold'::text, 'filled'::text])
    and not private.is_banned(owner_id)
    and (business_id is null or public.business_is_public(business_id))
  );

CREATE OR REPLACE FUNCTION public.reveal_listing_phone(p_listing_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_l public.listings;
  v_uid uuid := auth.uid();
  v_ip text := private.request_ip_hash();
  v_n int;
  v_phone text;
  v_name text;
  v_is_owner boolean;
begin
  select * into v_l from public.listings where id = p_listing_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  v_is_owner := v_uid is not null and v_uid = v_l.owner_id;
  if (v_l.status <> 'active' or private.is_banned(v_l.owner_id)) and not v_is_owner and not public.is_admin() then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  -- A suspended / pending / rejected business (or a banned owner's): its ads are not public, neither is its phone.
  if v_l.business_id is not null and not public.business_is_public(v_l.business_id) and not v_is_owner and not public.is_admin() then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  -- Sample listings are not callable ("Örnek kayıt - aranamaz"): their numbers are not real.
  if v_l.is_demo and not v_is_owner and not public.is_admin() then
    return jsonb_build_object('ok', false, 'reason', 'demo');
  end if;

  if v_l.type = 'classified' and not v_is_owner and not public.is_admin() then
    if v_uid is not null then
      select count(*) into v_n from public.contact_events
       where user_id = v_uid and event = 'phone_reveal' and created_at > now() - interval '24 hours';
      if v_n >= 30 then
        return jsonb_build_object('ok', false, 'reason', 'rate_limited');
      end if;
    else
      if v_ip is null then
        return jsonb_build_object('ok', false, 'reason', 'login_required');
      end if;
      select count(*) into v_n from public.contact_events
       where user_id is null and ip_hash = v_ip and event = 'phone_reveal' and created_at > now() - interval '24 hours';
      if v_n >= 5 then
        return jsonb_build_object('ok', false, 'reason', 'login_required');
      end if;
    end if;
  end if;

  if v_l.business_id is not null then
    select phone, name into v_phone, v_name from public.businesses where id = v_l.business_id;
  end if;
  if v_phone is null then
    select phone, public.short_name(full_name) into v_phone, v_name from public.profiles where id = v_l.owner_id;
  end if;
  if v_phone is null then
    return jsonb_build_object('ok', false, 'reason', 'no_phone');
  end if;

  if not v_is_owner then
    insert into public.contact_events (user_id, subject_type, subject_id, event, ip_hash)
    values (v_uid, case when v_l.type = 'job' then 'job' else 'listing' end, v_l.id, 'phone_reveal', v_ip);
  end if;
  return jsonb_build_object('ok', true, 'phone', v_phone, 'display_name', v_name);
end $function$;


-- d) storage daily upload cap --------------------------------------------------------------------------------------------
-- Counts the caller's objects created in the bucket in the last 24 h under their own <uid>/ folder (the only folder the
-- owner insert policies allow). Admins are not limited; the admin/ and finance/ policies are unchanged.
create or replace function private.storage_upload_quota_ok(p_bucket text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin()
      or (select count(*) from storage.objects o
           where o.bucket_id = p_bucket
             and o.name like ((select auth.uid())::text || '/%')
             and o.created_at > now() - interval '24 hours') < 100
$$;
revoke all on function private.storage_upload_quota_ok(text) from public, anon;
grant execute on function private.storage_upload_quota_ok(text) to authenticated;

drop policy if exists "media owner insert" on storage.objects;
create policy "media owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = ((select auth.uid()))::text
    and private.storage_upload_quota_ok(bucket_id)
  );

drop policy if exists "docs owner insert" on storage.objects;
create policy "docs owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'private-docs'
    and (storage.foldername(name))[1] = ((select auth.uid()))::text
    and private.storage_upload_quota_ok(bucket_id)
  );


-- e) contact events ------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_contact_event(p_subject_type text, p_subject_id uuid, p_event text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_ip text := private.request_ip_hash();
  v_day_start timestamptz := date_trunc('day', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul';
  v_n int;
begin
  if p_subject_type not in ('listing', 'job', 'business', 'poi', 'lead')
     or p_event not in ('phone_reveal', 'call_click', 'directions') or p_subject_id is null then
    raise exception 'Geçersiz olay' using errcode = '22023';
  end if;

  -- Nobody to count it against: drop it instead of storing an unbounded anonymous row.
  if v_uid is null and v_ip is null then
    return;
  end if;

  -- One lock per caller (not per subject): parallel calls with many random subject ids are serialized, so the daily
  -- cap below cannot be overshot by a burst; the once-per-day dedupe stays race-free as well.
  perform pg_advisory_xact_lock(hashtext('contact:' || coalesce(v_uid::text, v_ip)));

  -- Daily cap per caller (user, or anonymous ip hash), so random subject ids cannot grow the table without bound.
  if v_uid is not null then
    select count(*) into v_n from public.contact_events where user_id = v_uid and created_at >= v_day_start;
  else
    select count(*) into v_n from public.contact_events where ip_hash = v_ip and user_id is null and created_at >= v_day_start;
  end if;
  if v_n >= 300 then
    return;
  end if;

  if v_uid is not null then
    if exists (select 1 from public.contact_events
                where user_id = v_uid and event = p_event and created_at >= v_day_start
                  and subject_id = p_subject_id and subject_type = p_subject_type) then
      return; -- already counted today
    end if;
  elsif exists (select 1 from public.contact_events
                 where ip_hash = v_ip and user_id is null and event = p_event and created_at >= v_day_start
                   and subject_id = p_subject_id and subject_type = p_subject_type) then
    return; -- already counted today
  end if;

  insert into public.contact_events (user_id, subject_type, subject_id, event, ip_hash)
  values (v_uid, p_subject_type, p_subject_id, p_event, v_ip);
  if p_event = 'call_click' and p_subject_type in ('listing', 'job') then
    update public.listings set call_count = call_count + 1 where id = p_subject_id;
  end if;
end $function$;


-- f) account delete needs a fresh SMS code -------------------------------------------------------------------------------
-- A phone verifyOtp gives the new session an amr entry {"method":"otp","timestamp":<unix>} (auth.mfa_amr_claims shows
-- method 'otp' for the demo and real phone logins). The browser verifies the code right before calling this, so the
-- JWT it sends carries an otp entry from seconds ago; a session that is merely held (refreshed later) does not.
CREATE OR REPLACE FUNCTION public.delete_my_account()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Giriş yapmalısın' using errcode = '42501';
  end if;
  if not exists (
    select 1
      from jsonb_array_elements(case when jsonb_typeof(auth.jwt() -> 'amr') = 'array' then auth.jwt() -> 'amr' else '[]'::jsonb end) a
     where a ->> 'method' = 'otp'
       and (a ->> 'timestamp') ~ '^[0-9]+$'
       and (a ->> 'timestamp')::bigint >= extract(epoch from now())::bigint - 600
  ) then
    raise exception 'Hesabını silmek için telefonuna gelen kodu yeniden doğrulaman gerekiyor' using errcode = '42501', hint = 'reauth_required';
  end if;
  update public.leads set status = 'closed_full'
   where status in ('sent', 'seen')
     and request_id in (select id from public.service_requests where customer_id = v_uid);
  update public.service_requests
     set note = null, address_note = null, photos = '{}',
         status = case when status in ('admin_review', 'open', 'filled', 'no_match') then 'closed_cancelled' else status end,
         closed_at = coalesce(closed_at, now())
   where customer_id = v_uid;
  update public.listings set status = 'deleted' where owner_id = v_uid;
  -- Events would otherwise stay public (business_id / created_by -> null) with the business phone.
  -- An admin's city events (no business) are city content and stay (created_by -> null).
  delete from public.events
   where business_id in (select b.id from public.businesses b where b.owner_id = v_uid)
      or (created_by = v_uid and business_id is null
          and not exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'admin'));
  update public.profiles
     set full_name = null, email = null, avatar_url = null, phone = null, marketing_consent = false
   where id = v_uid;
  delete from auth.users where id = v_uid;  -- cascades: profile, listings, business, favorites, notifications ...
  perform private.audit_forget_user(v_uid);
  return jsonb_build_object('ok', true);
end $function$;
