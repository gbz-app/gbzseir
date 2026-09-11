-- Duty mode gate (audit step 14). app_settings.duty_data_mode now drives the duty data:
--   demo: roll_demo_duty keeps the random sample list; the RPCs return it (the app labels it "Örnek veri").
--   off:  no duty list at all (the app shows the official Eczacı Odası link); the demo roll stops.
--   live: only real (source <> 'demo') rows; the demo roll stops.
-- A missing key counts as 'demo' (same default as the app). Re-runnable.

-- ===========================================================================
-- 1. Allowed values
-- ===========================================================================
insert into public.app_settings (key, value) values ('duty_data_mode', '"demo"'::jsonb)
on conflict (key) do nothing;

alter table public.app_settings drop constraint if exists app_settings_duty_data_mode_check;
alter table public.app_settings add constraint app_settings_duty_data_mode_check
  check (key <> 'duty_data_mode' or value in ('"demo"'::jsonb, '"off"'::jsonb, '"live"'::jsonb));

-- ===========================================================================
-- 2. Public RPCs: same as 20260910000003_rpc.sql, plus the mode filter
-- ===========================================================================
-- Pharmacies on duty right now (never returns an expired window).
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
     and mode.m <> 'off'
     and (d.source <> 'demo' or mode.m = 'demo')
   order by case when pt.g is null then null else extensions.st_distance(p.location, pt.g) end nulls last, p.name
$$;

-- ===========================================================================
-- 3. roll_demo_duty: same as 20260910000003_rpc.sql, but does nothing unless the mode is 'demo'
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
             where poi.kind = 'pharmacy'
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
-- 4. Grants (unchanged: public RPCs for guests, the roll for cron / service role only)
-- ===========================================================================
revoke execute on function public.duty_pharmacies_now(double precision, double precision) from public;
revoke execute on function public.duty_pharmacies_for_day(date, double precision, double precision) from public;
grant execute on function public.duty_pharmacies_now(double precision, double precision) to anon, authenticated, service_role;
grant execute on function public.duty_pharmacies_for_day(date, double precision, double precision) to anon, authenticated, service_role;
revoke execute on function public.roll_demo_duty() from public, anon, authenticated;
grant execute on function public.roll_demo_duty() to service_role;
