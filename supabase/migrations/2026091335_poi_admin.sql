-- Admin POI editor (audit step 23): /admin/yerler edits every poi kind (place, pharmacy, mosque, bus_stop, taxi, atm).
--  * poi.hidden: hidden rows are left out of public reads (RLS: detail pages 404, lists, sitemap, favourites), nearby_pois,
--    the duty RPCs, global_search and the demo duty roll. Admins still read them through the "admin write" (FOR ALL) policy.
--  * poi.locked: set by the admin editor. On a locked row a write without an admin session (the seed / sync scripts'
--    upsert) keeps the admin-edited fields: name, address, phone, location, neighbourhood, hidden and the place
--    texts / photos in details. Other columns and details keys still update. Setting locked = false in the same
--    statement lets everything through.
-- Builds on 20260910000001_init.sql (poi_before_write), 20260910000003_rpc.sql (nearby_pois, global_search) and
-- 2026091320_duty_mode_gate.sql (duty RPCs with the mode filter, roll_demo_duty). Re-runnable.

-- ===========================================================================
-- 1. Columns
-- ===========================================================================
alter table public.poi add column if not exists hidden boolean not null default false;
alter table public.poi add column if not exists locked boolean not null default false;

comment on column public.poi.hidden is 'Hidden by an admin: not in public reads, nearby / duty / search RPCs.';
comment on column public.poi.locked is 'Edited by an admin: non-admin writes (syncs) keep the admin-edited fields.';

-- ===========================================================================
-- 2. Public read skips hidden rows ("admin write" stays FOR ALL, so admins see everything)
-- ===========================================================================
drop policy if exists "public read" on public.poi;
create policy "public read" on public.poi for select to anon, authenticated using (not hidden);

-- ===========================================================================
-- 3. Trigger: same as 20260910000001_init.sql, plus the lock
-- ===========================================================================
create or replace function private.poi_before_write()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if tg_op = 'UPDATE' and old.locked and new.locked and not public.is_admin() then
    new.name := old.name;
    new.address := old.address;
    new.phone := old.phone;
    new.location := old.location;
    new.neighbourhood_id := old.neighbourhood_id;
    new.hidden := old.hidden;
    if jsonb_typeof(old.details) = 'object' and jsonb_typeof(new.details) = 'object' then
      new.details := new.details || coalesce((
        select jsonb_object_agg(e.key, e.value) from jsonb_each(old.details) e
         where e.key in ('category', 'description', 'hours', 'fee', 'curated', 'photos')), '{}'::jsonb);
    end if;
  end if;
  new.search_norm := public.tr_norm(new.name || ' ' || coalesce(new.address, '') || ' ' || coalesce(new.details ->> 'category', ''));
  new.updated_at := now();
  return new;
end $$;

revoke all on function private.poi_before_write() from public, anon, authenticated;

drop trigger if exists poi_before_write on public.poi;
create trigger poi_before_write before insert or update on public.poi
  for each row execute function private.poi_before_write();

-- ===========================================================================
-- 4. Public RPCs: latest bodies, plus "not p.hidden"
-- ===========================================================================
-- Nearest POIs of a kind (null = all kinds). Without coordinates: ordered by name, distance_m null.
create or replace function public.nearby_pois(
  p_kind text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_radius_m int default 5000,
  p_limit int default 50)
returns table (
  id uuid, kind text, name text, slug text, address text, phone text,
  lat double precision, lng double precision, neighbourhood_id uuid, neighbourhood_name text,
  details jsonb, source text, license text, updated_at timestamptz, distance_m double precision)
language sql
stable
set search_path = public, extensions
as $$
  with pt as (
    select case when p_lat is null or p_lng is null then null
                else extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography end as g
  )
  select p.id, p.kind, p.name, p.slug, p.address, p.phone, p.lat, p.lng, p.neighbourhood_id, n.name,
         p.details, p.source, p.license, p.updated_at,
         case when pt.g is null then null else round(extensions.st_distance(p.location, pt.g)::numeric, 0)::double precision end
    from public.poi p
    cross join pt
    left join public.neighbourhoods n on n.id = p.neighbourhood_id
   where (p_kind is null or p.kind = p_kind)
     and not p.hidden
     and (pt.g is null or extensions.st_dwithin(p.location, pt.g, greatest(1, least(coalesce(p_radius_m, 5000), 50000))))
   order by case when pt.g is null then null else extensions.st_distance(p.location, pt.g) end nulls last, p.name
   limit greatest(1, least(coalesce(p_limit, 50), 500))
$$;

-- Pharmacies on duty right now (never returns an expired window). Mode filter from 2026091320.
create or replace function public.duty_pharmacies_now(
  p_lat double precision default null,
  p_lng double precision default null)
returns table (
  duty_id uuid, poi_id uuid, name text, slug text, address text, phone text,
  lat double precision, lng double precision, neighbourhood_id uuid, neighbourhood_name text,
  duty_start timestamptz, duty_end timestamptz, source text, note text, fetched_at timestamptz,
  distance_m double precision)
language sql
stable
set search_path = public, extensions
as $$
  with pt as (
    select case when p_lat is null or p_lng is null then null
                else extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography end as g
  ),
  mode as (
    select coalesce((select value #>> '{}' from public.app_settings where key = 'duty_data_mode'), 'demo') as m
  )
  select d.id, p.id, p.name, p.slug, p.address, p.phone, p.lat, p.lng, p.neighbourhood_id, n.name,
         d.duty_start, d.duty_end, d.source, d.note, d.fetched_at,
         case when pt.g is null then null else round(extensions.st_distance(p.location, pt.g)::numeric, 0)::double precision end
    from public.pharmacy_duty d
    join public.poi p on p.id = d.poi_id
    cross join pt
    cross join mode
    left join public.neighbourhoods n on n.id = p.neighbourhood_id
   where now() >= d.duty_start and now() < d.duty_end
     and not p.hidden
     and mode.m <> 'off'
     and (d.source <> 'demo' or mode.m = 'demo')
   order by case when pt.g is null then null else extensions.st_distance(p.location, pt.g) end nulls last, p.name
$$;

-- Duty pharmacies of a duty day (the day's window is p_date 08:30 -> p_date+1 08:30, Europe/Istanbul).
create or replace function public.duty_pharmacies_for_day(
  p_date date,
  p_lat double precision default null,
  p_lng double precision default null)
returns table (
  duty_id uuid, poi_id uuid, name text, slug text, address text, phone text,
  lat double precision, lng double precision, neighbourhood_id uuid, neighbourhood_name text,
  duty_start timestamptz, duty_end timestamptz, source text, note text, fetched_at timestamptz,
  distance_m double precision)
language sql
stable
set search_path = public, extensions
as $$
  with pt as (
    select case when p_lat is null or p_lng is null then null
                else extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography end as g
  ),
  win as (
    select (p_date + time '08:30') at time zone 'Europe/Istanbul' as s,
           ((p_date + 1) + time '08:30') at time zone 'Europe/Istanbul' as e
  ),
  mode as (
    select coalesce((select value #>> '{}' from public.app_settings where key = 'duty_data_mode'), 'demo') as m
  )
  select d.id, p.id, p.name, p.slug, p.address, p.phone, p.lat, p.lng, p.neighbourhood_id, n.name,
         d.duty_start, d.duty_end, d.source, d.note, d.fetched_at,
         case when pt.g is null then null else round(extensions.st_distance(p.location, pt.g)::numeric, 0)::double precision end
    from public.pharmacy_duty d
    join public.poi p on p.id = d.poi_id
    cross join pt
    cross join win
    cross join mode
    left join public.neighbourhoods n on n.id = p.neighbourhood_id
   where d.duty_start < win.e and d.duty_end > win.s
     and d.duty_end > now()
     and not p.hidden
     and mode.m <> 'off'
     and (d.source <> 'demo' or mode.m = 'demo')
   order by case when pt.g is null then null else extensions.st_distance(p.location, pt.g) end nulls last, p.name
$$;

-- Global search. Returns {listings:[...], businesses:[...], services:[...], pois:[...]}
create or replace function public.global_search(p_q text, p_limit int default 5)
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  with q as (select public.tr_norm(p_q) as q, greatest(1, least(coalesce(p_limit, 5), 20)) as lim)
  select case when char_length((select q from q)) < 2 then
    jsonb_build_object('listings', '[]'::jsonb, 'businesses', '[]'::jsonb, 'services', '[]'::jsonb, 'pois', '[]'::jsonb)
  else jsonb_build_object(
    'listings', coalesce((
      select jsonb_agg(x) from (
        select l.id, l.type, l.title, l.price_try, l.published_at, l.job_location_label,
               c.name as category_name, n.name as neighbourhood_name,
               (select m.thumb_url from public.listing_media m where m.listing_id = l.id order by m.sort limit 1) as thumb_url
          from public.listings l
          left join public.listing_categories c on c.id = l.category_id
          left join public.neighbourhoods n on n.id = l.neighbourhood_id, q
         where l.status = 'active' and l.expires_at > now()
           and (public.tr_match(l.search_norm, q.q) or l.search_tsv @@ plainto_tsquery('turkish'::regconfig, q.q))
         order by extensions.similarity(l.search_norm, q.q) desc, l.published_at desc
         limit (select lim from q)) x), '[]'::jsonb),
    'businesses', coalesce((
      select jsonb_agg(x) from (
        select b.id, b.slug, b.name, b.category_label, b.logo_url, b.rating_avg, b.rating_count, b.verification_level, b.kinds,
               n.name as neighbourhood_name
          from public.businesses b
          left join public.neighbourhoods n on n.id = b.neighbourhood_id, q
         where b.status = 'approved' and public.tr_match(b.search_norm, q.q)
         order by extensions.similarity(b.search_norm, q.q) desc, b.rating_avg desc
         limit (select lim from q)) x), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(x) from (
        select s.id, s.slug, s.name, s.icon, s.parent_id, pc.name as parent_name, pc.slug as parent_slug
          from public.service_categories s
          left join public.service_categories pc on pc.id = s.parent_id, q
         where s.active and public.tr_match(s.search_norm, q.q)
         order by (s.parent_id is not null) desc, extensions.similarity(s.search_norm, q.q) desc, s.sort
         limit (select lim from q)) x), '[]'::jsonb),
    'pois', coalesce((
      select jsonb_agg(x) from (
        select p.id, p.kind, p.slug, p.name, p.address, p.lat, p.lng, n.name as neighbourhood_name,
               p.details ->> 'category' as category
          from public.poi p
          left join public.neighbourhoods n on n.id = p.neighbourhood_id, q
         where p.kind in ('place', 'pharmacy', 'mosque') and not p.hidden and public.tr_match(p.search_norm, q.q)
         order by (p.kind = 'place') desc, extensions.similarity(p.search_norm, q.q) desc, p.name
         limit (select lim from q)) x), '[]'::jsonb)
  ) end
$$;

-- ===========================================================================
-- 5. roll_demo_duty: same as 2026091320_duty_mode_gate.sql, but hidden pharmacies get no sample duty
-- ===========================================================================
create or replace function public.roll_demo_duty()
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_today date := private.current_duty_day();
  v_day date;
  v_start timestamptz;
  v_n int := 0;
  v_k int;
begin
  if coalesce((select value #>> '{}' from public.app_settings where key = 'duty_data_mode'), 'demo') <> 'demo' then
    return 0;
  end if;
  delete from public.pharmacy_duty where source = 'demo' and duty_end < now() - interval '7 days';
  for v_day in select generate_series(v_today - 1, v_today + 60, interval '1 day')::date loop
    v_start := (v_day + time '08:30') at time zone 'Europe/Istanbul';
    continue when exists (select 1 from public.pharmacy_duty where source = 'demo' and duty_start = v_start);
    insert into public.pharmacy_duty (poi_id, duty_start, duty_end, source, note, fetched_at)
    select x.id, v_start, v_start + interval '1 day', 'demo', 'Örnek veri - gerçek nöbet listesi değildir', now()
      from (
        select p.id,
               row_number() over (partition by p.sector order by md5(p.id::text || v_day::text)) as rn
          from (
            select poi.id,
                   floor((atan2(poi.lat - 40.8027, poi.lng - 29.4307) + pi()) / (2 * pi() / 6))::int as sector
              from public.poi
             where poi.kind = 'pharmacy' and not poi.hidden
          ) p
      ) x
     where x.rn = 1
    on conflict (poi_id, duty_start) do nothing;
    get diagnostics v_k = row_count;
    v_n := v_n + v_k;
  end loop;
  return v_n;
end $$;

-- ===========================================================================
-- 6. Grants (unchanged: public RPCs for guests, the roll for cron / service role only)
-- ===========================================================================
revoke execute on function public.nearby_pois(text, double precision, double precision, int, int) from public;
revoke execute on function public.duty_pharmacies_now(double precision, double precision) from public;
revoke execute on function public.duty_pharmacies_for_day(date, double precision, double precision) from public;
revoke execute on function public.global_search(text, int) from public;
grant execute on function public.nearby_pois(text, double precision, double precision, int, int) to anon, authenticated, service_role;
grant execute on function public.duty_pharmacies_now(double precision, double precision) to anon, authenticated, service_role;
grant execute on function public.duty_pharmacies_for_day(date, double precision, double precision) to anon, authenticated, service_role;
grant execute on function public.global_search(text, int) to anon, authenticated, service_role;
revoke execute on function public.roll_demo_duty() from public, anon, authenticated;
grant execute on function public.roll_demo_duty() to service_role;
