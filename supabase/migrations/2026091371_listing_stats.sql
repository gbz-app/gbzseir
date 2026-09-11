-- Detailed owner statistics for listings (2. el + iş ilanları), like sahibinden / letgo.
--
-- a) public.listing_daily_stats: one row per listing per Istanbul day (views, unique_views, calls, phone_reveals,
--    favorites_added, shares). Readable by the listing owner and admins only; nobody writes it directly.
-- b) private.bump_listing_stat(listing, field, n): the only writer (whitelisted fields, no dynamic SQL).
-- c) Hooks, each built on today's live (hardened) definition with every existing check kept:
--    - increment_listing_view: a raw view on every counted call (capped per viewer per day), a unique view when the
--      per-viewer-per-day mark is new (the public view_count keeps its unique-per-day meaning).
--    - reveal_listing_phone: phone_reveals, once per person (or guest) per listing per day; owner and admins not counted.
--    - calls: an AFTER INSERT trigger on contact_events (listing / job call_click rows, which log_contact_event already
--      writes once per caller per day); owner and admins not counted. A trigger instead of another copy of
--      log_contact_event, so a later migration that replaces log_contact_event (2026091372) cannot drop the stat.
--    - favorites insert trigger: favorites_added (once per user per listing per day; the owner's own favourite not counted).
--    - public.log_listing_share(listing): shares, anon + authenticated, once per caller per listing per day, 30 per day.
-- d) Backfill from contact_events, favorites and the current view marks (daily history did not exist before).
-- e) public.listing_owner_stats(listing, days): {ok, totals, days[], listing{...}} for the owner or an admin.

-- ---------------------------------------------------------------------------
-- a) Table
-- ---------------------------------------------------------------------------

create table if not exists public.listing_daily_stats (
  listing_id uuid not null references public.listings (id) on delete cascade,
  day date not null,
  views int not null default 0,
  unique_views int not null default 0,
  calls int not null default 0,
  phone_reveals int not null default 0,
  favorites_added int not null default 0,
  shares int not null default 0,
  primary key (listing_id, day)
);

comment on table public.listing_daily_stats is
  'Per listing per Europe/Istanbul day owner statistics. Written only by private.bump_listing_stat; read by the owner or an admin.';

alter table public.listing_daily_stats enable row level security;

revoke all on table public.listing_daily_stats from public, anon, authenticated;
grant select on table public.listing_daily_stats to authenticated;

drop policy if exists "owner or admin read" on public.listing_daily_stats;
create policy "owner or admin read" on public.listing_daily_stats
  for select to authenticated
  using (public.owns_listing(listing_id) or (select public.is_admin()));

-- Once-per-day dedupe marks for reveals, favourites and shares (actor = 'u:<uid>' or 'ip:<daily ip hash>').
-- The primary key starts with (actor, day) so the per-caller daily cap is an index range count.
create table if not exists private.listing_stat_marks (
  actor text not null,
  day date not null,
  kind text not null check (kind in ('reveal', 'fav', 'share')),
  listing_id uuid not null,
  primary key (actor, day, kind, listing_id)
);

alter table private.listing_stat_marks enable row level security;
revoke all on table private.listing_stat_marks from public, anon, authenticated;

-- Raw views per viewer per day (the first one is the unique view); capped so a loop cannot inflate the owner's numbers.
alter table private.listing_view_marks add column if not exists hits smallint not null default 1;

-- ---------------------------------------------------------------------------
-- b) Writer
-- ---------------------------------------------------------------------------

create or replace function private.bump_listing_stat(p_listing uuid, p_field text, p_n int default 1)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_day date := (now() at time zone 'Europe/Istanbul')::date;
  v_n int := least(coalesce(p_n, 1), 1000);
begin
  if p_field is null or p_field not in ('views', 'unique_views', 'calls', 'phone_reveals', 'favorites_added', 'shares') then
    raise exception 'Geçersiz istatistik alanı' using errcode = '22023';
  end if;
  if p_listing is null or v_n <= 0 then
    return;
  end if;

  -- insert ... select: a missing listing (random id, hard-deleted row) writes nothing instead of failing the FK.
  insert into public.listing_daily_stats as s
         (listing_id, day, views, unique_views, calls, phone_reveals, favorites_added, shares)
  select l.id, v_day,
         case when p_field = 'views' then v_n else 0 end,
         case when p_field = 'unique_views' then v_n else 0 end,
         case when p_field = 'calls' then v_n else 0 end,
         case when p_field = 'phone_reveals' then v_n else 0 end,
         case when p_field = 'favorites_added' then v_n else 0 end,
         case when p_field = 'shares' then v_n else 0 end
    from public.listings l
   where l.id = p_listing
  on conflict (listing_id, day) do update
     set views = s.views + excluded.views,
         unique_views = s.unique_views + excluded.unique_views,
         calls = s.calls + excluded.calls,
         phone_reveals = s.phone_reveals + excluded.phone_reveals,
         favorites_added = s.favorites_added + excluded.favorites_added,
         shares = s.shares + excluded.shares;
exception
  -- A listing hard-deleted by the purge job at the same moment: statistics must never break the caller.
  when foreign_key_violation then
    return;
end $function$;

revoke all on function private.bump_listing_stat(uuid, text, int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- c) Hooks
-- ---------------------------------------------------------------------------

-- Live definition (2026091305) + raw / unique views for the owner statistics.
create or replace function public.increment_listing_view(p_listing_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_viewer text := coalesce('u:' || v_uid::text, 'ip:' || private.request_ip_hash());
  v_day date := (now() at time zone 'Europe/Istanbul')::date;
  v_n int;
begin
  if not exists (select 1 from public.listings
                  where id = p_listing_id and status = 'active' and owner_id is distinct from v_uid) then
    return;
  end if;
  if v_viewer is not null then
    insert into private.listing_view_marks (listing_id, viewer, view_day)
    values (p_listing_id, v_viewer, v_day)
    on conflict do nothing;
    get diagnostics v_n = row_count;
    if v_n = 0 then
      -- Already counted today: a raw view only (the owner sees it), at most 20 per viewer per day.
      update private.listing_view_marks
         set hits = hits + 1
       where listing_id = p_listing_id and viewer = v_viewer and view_day = v_day and hits < 20;
      get diagnostics v_n = row_count;
      if v_n > 0 then
        perform private.bump_listing_stat(p_listing_id, 'views');
      end if;
      return; -- already counted today
    end if;
  end if;
  update public.listings set view_count = view_count + 1 where id = p_listing_id and status = 'active';
  perform private.bump_listing_stat(p_listing_id, 'views');
  perform private.bump_listing_stat(p_listing_id, 'unique_views');
end $function$;

-- Live definition (2026091369) + phone_reveals (once per person / guest per listing per day; owner and admins not counted).
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
    -- Owner statistics: one reveal per person (or guest) per listing per day; admins are not counted.
    if (v_uid is not null or v_ip is not null) and not public.is_admin() then
      insert into private.listing_stat_marks (actor, day, kind, listing_id)
      values (coalesce('u:' || v_uid::text, 'ip:' || v_ip), (now() at time zone 'Europe/Istanbul')::date, 'reveal', v_l.id)
      on conflict do nothing;
      get diagnostics v_n = row_count;
      if v_n > 0 then
        perform private.bump_listing_stat(v_l.id, 'phone_reveals');
      end if;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'phone', v_phone, 'display_name', v_name);
end $function$;

-- Calls: log_contact_event (left as it is live) writes one call_click row per caller per listing per day; each such row
-- is one call in the owner statistics. The owner's own test calls and admins are not counted.
create or replace function private.contact_events_listing_stats()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_owner uuid;
begin
  select l.owner_id into v_owner from public.listings l where l.id = new.subject_id;
  if not found or v_owner is not distinct from new.user_id or public.is_admin() then
    return null;
  end if;
  perform private.bump_listing_stat(new.subject_id, 'calls');
  return null;
end $function$;

revoke all on function private.contact_events_listing_stats() from public, anon, authenticated;

drop trigger if exists contact_events_listing_stats on public.contact_events;
create trigger contact_events_listing_stats
  after insert on public.contact_events
  for each row
  when (new.event = 'call_click' and new.subject_type in ('listing', 'job'))
  execute function private.contact_events_listing_stats();

-- Favourites: counted when a listing is added (once per user per listing per day, not the owner's own).
create or replace function private.favorites_listing_stats()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_owner uuid;
  v_n int;
begin
  if new.target_type <> 'listing' then
    return null;
  end if;
  select l.owner_id into v_owner from public.listings l where l.id = new.target_id;
  if not found or v_owner = new.user_id then
    return null;
  end if;
  insert into private.listing_stat_marks (actor, day, kind, listing_id)
  values ('u:' || new.user_id::text, (now() at time zone 'Europe/Istanbul')::date, 'fav', new.target_id)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    perform private.bump_listing_stat(new.target_id, 'favorites_added');
  end if;
  return null;
end $function$;

revoke all on function private.favorites_listing_stats() from public, anon, authenticated;

drop trigger if exists favorites_listing_stats on public.favorites;
create trigger favorites_listing_stats
  after insert on public.favorites
  for each row
  when (new.target_type = 'listing')
  execute function private.favorites_listing_stats();

-- Shares: the detail page's share button calls this after a successful share / link copy (fire and forget).
create or replace function public.log_listing_share(p_listing uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_actor text := coalesce('u:' || v_uid::text, 'ip:' || private.request_ip_hash());
  v_day date := (now() at time zone 'Europe/Istanbul')::date;
  v_n int;
begin
  if p_listing is null or v_actor is null then
    return;
  end if;
  -- Only live, public listings; the owner's own shares are not counted.
  if not exists (select 1 from public.listings l
                  where l.id = p_listing and l.status = 'active' and l.owner_id is distinct from v_uid
                    and not private.is_banned(l.owner_id)) then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('listing_share:' || v_actor));
  -- Cheap per-caller cap (primary key range): at most 30 counted shares per caller per day.
  select count(*) into v_n from private.listing_stat_marks
   where actor = v_actor and day = v_day and kind = 'share';
  if v_n >= 30 then
    return;
  end if;

  insert into private.listing_stat_marks (actor, day, kind, listing_id)
  values (v_actor, v_day, 'share', p_listing)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    perform private.bump_listing_stat(p_listing, 'shares');
  end if;
end $function$;

revoke all on function public.log_listing_share(uuid) from public;
grant execute on function public.log_listing_share(uuid) to anon, authenticated;

-- Dedupe marks older than yesterday are not needed (same retention as the view marks).
create or replace function private.cleanup_listing_stat_marks()
returns void
language sql
security definer
set search_path to ''
as $function$
  delete from private.listing_stat_marks where day < (now() at time zone 'Europe/Istanbul')::date - 1;
$function$;

revoke all on function private.cleanup_listing_stat_marks() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'gebzem-listing-stat-marks';
    perform cron.schedule('gebzem-listing-stat-marks', '29 3 * * *', 'select private.cleanup_listing_stat_marks()');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- d) Backfill (idempotent: greatest() never lowers a number already counted live)
-- ---------------------------------------------------------------------------

with ev as (
  select e.subject_id as listing_id,
         (e.created_at at time zone 'Europe/Istanbul')::date as day,
         count(*) filter (where e.event = 'call_click') as calls,
         count(distinct coalesce('u:' || e.user_id::text, 'ip:' || e.ip_hash, e.id::text)) filter (where e.event = 'phone_reveal') as phone_reveals
    from public.contact_events e
    join public.listings l on l.id = e.subject_id
   where e.subject_type in ('listing', 'job')
     and e.event in ('call_click', 'phone_reveal')
     and e.user_id is distinct from l.owner_id
     and not exists (select 1 from public.profiles p where p.id = e.user_id and p.role = 'admin')
   group by 1, 2
), fav as (
  select f.target_id as listing_id,
         (f.created_at at time zone 'Europe/Istanbul')::date as day,
         count(*) as favorites_added
    from public.favorites f
    join public.listings l on l.id = f.target_id
   where f.target_type = 'listing' and f.user_id <> l.owner_id
   group by 1, 2
), vw as (
  -- Today's / yesterday's per-viewer marks (older ones were purged, so earlier days cannot be rebuilt).
  select m.listing_id, m.view_day as day, count(*) as unique_views, sum(m.hits) as views
    from private.listing_view_marks m
    join public.listings l on l.id = m.listing_id
   where m.viewer like 'u:%' or m.viewer like 'ip:%'
   group by 1, 2
), k as (
  select listing_id, day from ev
  union
  select listing_id, day from fav
  union
  select listing_id, day from vw
)
insert into public.listing_daily_stats as s (listing_id, day, views, unique_views, calls, phone_reveals, favorites_added)
select k.listing_id, k.day,
       coalesce(vw.views, 0), coalesce(vw.unique_views, 0),
       coalesce(ev.calls, 0), coalesce(ev.phone_reveals, 0),
       coalesce(fav.favorites_added, 0)
  from k
  left join ev on ev.listing_id = k.listing_id and ev.day = k.day
  left join fav on fav.listing_id = k.listing_id and fav.day = k.day
  left join vw on vw.listing_id = k.listing_id and vw.day = k.day
on conflict (listing_id, day) do update
   set views = greatest(s.views, excluded.views),
       unique_views = greatest(s.unique_views, excluded.unique_views),
       calls = greatest(s.calls, excluded.calls),
       phone_reveals = greatest(s.phone_reveals, excluded.phone_reveals),
       favorites_added = greatest(s.favorites_added, excluded.favorites_added);

-- ---------------------------------------------------------------------------
-- e) Owner read
-- ---------------------------------------------------------------------------

create or replace function public.listing_owner_stats(p_listing uuid, p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_l public.listings;
  v_days int := least(greatest(coalesce(p_days, 30), 7), 90);
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
  v_from date;
  v_series jsonb;
  v_totals jsonb;
begin
  if v_uid is null then
    raise exception 'Giriş yapmalısın' using errcode = '42501', hint = 'login_required';
  end if;
  select * into v_l from public.listings where id = p_listing;
  if not found or (v_l.owner_id <> v_uid and not public.is_admin()) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  v_from := v_today - (v_days - 1);
  with d as (
    select v_from + i as day from generate_series(0, v_days - 1) as i
  ), r as (
    select d.day,
           coalesce(s.views, 0) as views,
           coalesce(s.unique_views, 0) as unique_views,
           coalesce(s.calls, 0) as calls,
           coalesce(s.phone_reveals, 0) as phone_reveals,
           coalesce(s.favorites_added, 0) as favorites_added,
           coalesce(s.shares, 0) as shares
      from d
      left join public.listing_daily_stats s on s.listing_id = v_l.id and s.day = d.day
  )
  select jsonb_agg(jsonb_build_object('day', r.day, 'views', r.views, 'unique_views', r.unique_views, 'calls', r.calls,
                                      'phone_reveals', r.phone_reveals, 'favorites_added', r.favorites_added,
                                      'shares', r.shares) order by r.day),
         jsonb_build_object('views', sum(r.views), 'unique_views', sum(r.unique_views), 'calls', sum(r.calls),
                            'phone_reveals', sum(r.phone_reveals), 'favorites_added', sum(r.favorites_added),
                            'shares', sum(r.shares))
    into v_series, v_totals
    from r;

  return jsonb_build_object(
    'ok', true,
    'from', v_from,
    'to', v_today,
    'totals', v_totals,
    'days', coalesce(v_series, '[]'::jsonb),
    'listing', jsonb_build_object(
      'id', v_l.id,
      'type', v_l.type,
      'title', v_l.title,
      'status', v_l.status,
      'price_try', v_l.price_try,
      'published_at', v_l.published_at,
      'expires_at', v_l.expires_at,
      'photos', (select count(*) from public.listing_media m where m.listing_id = v_l.id),
      'view_count', v_l.view_count,
      'call_count', v_l.call_count,
      'favorites_now', (select count(*) from public.favorites f
                         where f.target_type = 'listing' and f.target_id = v_l.id and f.user_id <> v_l.owner_id)
    )
  );
end $function$;

revoke all on function public.listing_owner_stats(uuid, int) from public, anon;
grant execute on function public.listing_owner_stats(uuid, int) to authenticated;
