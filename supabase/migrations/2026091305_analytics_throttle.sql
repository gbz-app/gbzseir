-- Analytics throttle (audit step 6). A script rotating random session UUIDs could inflate online users,
-- sessions, page views, PWA installs and a listing's view_count / call_count. Adds per-IP limits using the
-- daily-salted IP hash (private.request_ip_hash, never the raw IP). Throttled calls return silently, so the
-- public app never shows an error. app_installs is never purged (download totals). Additive and re-runnable.

-- ===========================================================================
-- 0. Trustworthy caller IP. The first x-forwarded-for entry is whatever the client sends (verified live), so a
--    script could rotate it to dodge every IP limit. The edge sets cf-connecting-ip (a client-sent one is
--    rejected) and appends the real IP as the LAST x-forwarded-for entry. Same hash as before for normal clients.
-- ===========================================================================
create or replace function private.request_ip_hash()
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  h json;
  ip text;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    h := null;
  end;
  if h is null then
    return null;
  end if;
  ip := coalesce(nullif(btrim(h ->> 'cf-connecting-ip'), ''),
                 nullif(btrim(split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', -1)), ''),
                 nullif(btrim(h ->> 'x-real-ip'), ''));
  if ip is null then
    return null;
  end if;
  return encode(extensions.digest(ip || '|' || to_char(now() at time zone 'Europe/Istanbul', 'YYYY-MM-DD') || '|gebzem', 'sha256'), 'hex');
end $$;

-- ===========================================================================
-- 1. IP hash columns (cleared after 2 days by cleanup_analytics) + indexes
-- ===========================================================================
alter table public.analytics_sessions add column if not exists ip_hash text;
alter table public.app_installs add column if not exists ip_hash text;
comment on column public.analytics_sessions.ip_hash is 'Daily-salted IP hash, only for throttling; cleared after 2 days.';
comment on column public.app_installs.ip_hash is 'Daily-salted IP hash, only for throttling; cleared after 2 days.';

create index if not exists analytics_sessions_ip_idx on public.analytics_sessions (ip_hash, started_at desc) where ip_hash is not null;
create index if not exists app_installs_ip_idx on public.app_installs (ip_hash, platform, created_at desc) where ip_hash is not null;
create index if not exists contact_events_created_idx on public.contact_events (created_at);

-- A listing view counts once per member or IP per day (not exposed over the API).
create table if not exists private.listing_view_marks (
  listing_id uuid not null,
  viewer text not null,                      -- 'u:<user id>' or 'ip:<daily ip hash>'
  view_day date not null,                    -- Europe/Istanbul
  primary key (listing_id, viewer, view_day)
);
create index if not exists listing_view_marks_day_idx on private.listing_view_marks (view_day);
revoke all on table private.listing_view_marks from public, anon, authenticated;

-- ===========================================================================
-- 2. Page views: at most 30 new sessions per IP per hour, 30 page views per session per minute
-- ===========================================================================
create or replace function public.track_page_view(p_session uuid, p_path text, p_meta jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ip text := private.request_ip_hash();
  v_path text := left(split_part(split_part(coalesce(p_path, ''), '?', 1), '#', 1), 300);
  v_last public.analytics_page_views;
  v_views int;
  v_device text := nullif(left(coalesce(p_meta ->> 'device', ''), 10), '');
begin
  if p_session is null or v_path !~ '^/' or v_path like '/admin%' or v_path like '/api/%' or v_path = '/offline' then
    return;
  end if;
  if v_device is not null and v_device not in ('mobile', 'tablet', 'desktop') then
    v_device := null;
  end if;

  -- A new random session id must not mean a new visitor: cap new sessions per IP.
  if v_ip is not null and not exists (select 1 from public.analytics_sessions where id = p_session) then
    perform pg_advisory_xact_lock(hashtext('track_session:' || v_ip));
    if (select count(*) from public.analytics_sessions
         where ip_hash = v_ip and started_at > now() - interval '1 hour') >= 30 then
      return; -- throttled
    end if;
  end if;

  insert into public.analytics_sessions as s (id, user_id, ip_hash, first_path, last_path, referrer_host, device, os, browser, standalone, page_views)
  values (
    p_session, v_uid, v_ip, v_path, v_path,
    nullif(left(coalesce(p_meta ->> 'ref', ''), 120), ''),
    v_device,
    nullif(left(coalesce(p_meta ->> 'os', ''), 20), ''),
    nullif(left(coalesce(p_meta ->> 'browser', ''), 20), ''),
    coalesce((p_meta ->> 'standalone')::boolean, false),
    0)
  on conflict (id) do update
    set last_seen_at = now(),
        last_path = excluded.last_path,
        user_id = coalesce(s.user_id, excluded.user_id),
        standalone = s.standalone or excluded.standalone
  returning s.page_views into v_views;

  if v_views >= 3000 then
    return; -- abuse guard
  end if;

  select * into v_last from public.analytics_page_views where session_id = p_session order by id desc limit 1;
  if v_last.id is not null then
    if v_last.path = v_path and v_last.created_at > now() - interval '2 seconds' then
      return; -- duplicate (double render / quick refresh)
    end if;
    if exists (select 1
                 from (select created_at from public.analytics_page_views
                        where session_id = p_session order by id desc offset 29 limit 1) x
                where x.created_at > now() - interval '1 minute') then
      return; -- burst guard
    end if;
    if v_last.duration_s is null then
      update public.analytics_page_views
         set duration_s = least(greatest(extract(epoch from now() - v_last.created_at)::int, 0), 1800)
       where id = v_last.id;
    end if;
  end if;

  insert into public.analytics_page_views (session_id, user_id, path) values (p_session, v_uid, v_path);
  update public.analytics_sessions set page_views = page_views + 1, last_seen_at = now() where id = p_session;
end $$;

-- ===========================================================================
-- 3. Installs: one per IP and platform per day (the IP hash itself changes daily)
-- ===========================================================================
create or replace function public.track_install(p_session uuid, p_platform text, p_source text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ip text := private.request_ip_hash();
begin
  if p_session is null or p_platform is null or p_source is null
     or p_platform not in ('pwa_android', 'pwa_ios', 'pwa_desktop') or p_source not in ('appinstalled', 'standalone') then
    return;
  end if;
  if v_ip is not null then
    perform pg_advisory_xact_lock(hashtext('track_install:' || v_ip || ':' || p_platform));
    if exists (select 1 from public.app_installs
                where ip_hash = v_ip and platform = p_platform and created_at > now() - interval '1 day') then
      return; -- throttled
    end if;
  end if;
  insert into public.app_installs (session_id, user_id, platform, source, ip_hash)
  values (p_session, auth.uid(), p_platform, p_source, v_ip)
  on conflict on constraint app_installs_session_source_uq do nothing;
end $$;

-- ===========================================================================
-- 4. Contact events: each (member or IP, subject, event) counts once per day
-- ===========================================================================
create or replace function public.log_contact_event(p_subject_type text, p_subject_id uuid, p_event text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ip text := private.request_ip_hash();
  v_day_start timestamptz := date_trunc('day', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul';
begin
  if p_subject_type not in ('listing', 'job', 'business', 'poi', 'lead')
     or p_event not in ('phone_reveal', 'call_click', 'directions') or p_subject_id is null then
    raise exception 'Geçersiz olay' using errcode = '22023';
  end if;

  if v_uid is not null or v_ip is not null then
    perform pg_advisory_xact_lock(hashtext('contact:' || coalesce(v_uid::text, v_ip) || ':' || p_subject_id::text || ':' || p_event));
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
  end if;

  insert into public.contact_events (user_id, subject_type, subject_id, event, ip_hash)
  values (v_uid, p_subject_type, p_subject_id, p_event, v_ip);
  if p_event = 'call_click' and p_subject_type in ('listing', 'job') then
    update public.listings set call_count = call_count + 1 where id = p_subject_id;
  end if;
end $$;

-- ===========================================================================
-- 5. Listing views: once per member or IP per listing per day (owner's own views ignored)
-- ===========================================================================
create or replace function public.increment_listing_view(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_viewer text := coalesce('u:' || v_uid::text, 'ip:' || private.request_ip_hash());
  v_n int;
begin
  if not exists (select 1 from public.listings
                  where id = p_listing_id and status = 'active' and owner_id is distinct from v_uid) then
    return;
  end if;
  if v_viewer is not null then
    insert into private.listing_view_marks (listing_id, viewer, view_day)
    values (p_listing_id, v_viewer, (now() at time zone 'Europe/Istanbul')::date)
    on conflict do nothing;
    get diagnostics v_n = row_count;
    if v_n = 0 then
      return; -- already counted today
    end if;
  end if;
  update public.listings set view_count = view_count + 1 where id = p_listing_id and status = 'active';
end $$;

-- ===========================================================================
-- 6. Retention (same nightly cron job gebzem-analytics-retention): contact_events join the purge,
--    throttle data is dropped after 2 days. app_installs rows are kept forever.
-- ===========================================================================
create or replace function private.cleanup_analytics()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days int := private.app_setting_int('analytics_retention_days', 180);
begin
  delete from public.analytics_page_views where created_at < now() - make_interval(days => v_days);
  delete from public.analytics_sessions where last_seen_at < now() - make_interval(days => v_days);
  delete from public.contact_events where created_at < now() - make_interval(days => v_days);
  update public.analytics_sessions set ip_hash = null where ip_hash is not null and started_at < now() - interval '2 days';
  update public.app_installs set ip_hash = null where ip_hash is not null and created_at < now() - interval '2 days';
  update public.contact_events set ip_hash = null where ip_hash is not null and created_at < now() - interval '2 days';
  delete from private.listing_view_marks where view_day < (now() at time zone 'Europe/Istanbul')::date - 1;
end $$;

-- ===========================================================================
-- 7. Grants
-- ===========================================================================
revoke all on function public.track_page_view(uuid, text, jsonb) from public;
revoke all on function public.track_install(uuid, text, text) from public;
revoke all on function public.log_contact_event(text, uuid, text) from public;
revoke all on function public.increment_listing_view(uuid) from public;
grant execute on function public.track_page_view(uuid, text, jsonb) to anon, authenticated;
grant execute on function public.track_install(uuid, text, text) to anon, authenticated;
grant execute on function public.log_contact_event(text, uuid, text) to anon, authenticated;
grant execute on function public.increment_listing_view(uuid) to anon, authenticated;
revoke all on function private.cleanup_analytics() from public, anon, authenticated;
revoke all on function private.request_ip_hash() from public, anon, authenticated;
