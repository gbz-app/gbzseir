-- Kocaeli districts, phase A (database + data). The app now covers the 12 districts (ilçe) of Kocaeli, and a row's
-- location becomes district + address + map pin; mahalle leaves the app in phase B (code) and C (cleanup).
-- This migration is ADDITIVE and backward compatible: every neighbourhood table, column, RPC parameter and view column
-- stays and keeps working, so the deployed app and the current code run unchanged.
--
--  1) public.districts (12 rows, slug ids) + private.district_boundaries (OSM admin_level=6 polygons, loaded by
--     scripts/db/seed-districts.mjs) + private.district_of(geometry) / public.district_for_point(lat, lng).
--  2) district_id on businesses, listings, service_requests (+ an optional map pin), events, poi and profiles;
--     announcements.district_ids; public.business_service_districts. Backfill: every current row is in Gebze.
--  3) zz_fill_district triggers: rows written by old clients (neighbourhood only) or with a pin get their district.
--  4) RPCs: optional district parameters (old signatures dropped in the same transaction, same grants), district fields
--     appended to outputs, service dispatch by district with a distance cap on the out-of-area fallback.
--  5) roll_demo_duty stays in Gebze: the duty screens cannot filter by district yet.
-- Re-runnable.

-- 1) Districts ------------------------------------------------------------------------------------------------------
create table if not exists public.districts (
  id text primary key check (id ~ '^[a-z]{2,20}$'),
  name text not null unique check (char_length(btrim(name)) between 2 and 40),
  province text not null default 'Kocaeli',
  kbb_ilce_id int unique,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  center extensions.geography(Point, 4326)
    generated always as (extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography) stored,
  osm_relation_id bigint unique,
  sort smallint not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.districts is
  'Kocaeli districts (ilçe). id = readable slug used as district_id everywhere (URL ?ilce=gebze). kbb_ilce_id = KBB open-data ilce_id; osm_relation_id = OSM admin_level=6 relation (boundary in private.district_boundaries); lat/lng = the admin centre. Inactive = hidden from pickers.';
create index if not exists districts_center_gix on public.districts using gist (center);
drop trigger if exists set_updated_at on public.districts;
create trigger set_updated_at before update on public.districts for each row execute function private.set_updated_at();

-- Centres: the relation's admin_centre node (Nominatim label point for Darıca, Kartepe and Başiskele).
insert into public.districts (id, name, kbb_ilce_id, lat, lng, osm_relation_id, sort) values
  ('izmit',      'İzmit',      2062, 40.7721, 29.9506, 1211493,  10),
  ('gebze',      'Gebze',      1338, 40.8007, 29.4318, 1211496,  20),
  ('darica',     'Darıca',     2060, 40.7575, 29.3841, 1211490,  30),
  ('cayirova',   'Çayırova',   2059, 40.8337, 29.3815, 1211204,  40),
  ('dilovasi',   'Dilovası',   2061, 40.7756, 29.5261, 1211488,  50),
  ('korfez',     'Körfez',     1821, 40.7608, 29.7839, 1211492,  60),
  ('derince',    'Derince',    2030, 40.7574, 29.8308, 1211495,  70),
  ('kartepe',    'Kartepe',    2063, 40.7454, 30.0113, 1211033,  80),
  ('basiskele',  'Başiskele',  2058, 40.7129, 29.9287, 1211497,  90),
  ('golcuk',     'Gölcük',     1355, 40.7169, 29.8196, 1211494, 100),
  ('karamursel', 'Karamürsel', 1440, 40.6913, 29.6166, 1211489, 110),
  ('kandira',    'Kandıra',    1430, 41.0704, 30.1523, 1211491, 120)
on conflict (id) do nothing;

alter table public.districts enable row level security;
drop policy if exists "public read" on public.districts;
create policy "public read" on public.districts for select to anon, authenticated using (true);
drop policy if exists "admin write" on public.districts;
create policy "admin write" on public.districts for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- Read-only for clients (unlike neighbourhoods, which hands every privilege to anon/authenticated and relies on RLS).
revoke all on table public.districts from anon, authenticated;
grant select on table public.districts to anon, authenticated;

-- Polygons are private (large); used for point-in-district lookups. Seeded by scripts/db/seed-districts.mjs.
create table if not exists private.district_boundaries (
  district_id text primary key references public.districts(id) on update cascade on delete cascade,
  boundary extensions.geometry(MultiPolygon, 4326) not null,
  osm_relation_id bigint,
  fetched_at timestamptz not null default now()
);
create index if not exists district_boundaries_gix on private.district_boundaries using gist (boundary);
revoke all on table private.district_boundaries from anon, authenticated;

-- Point -> district: inside a polygon; else the nearest polygon within 3 km (piers, the shore, GPS noise); else, only
-- for districts whose polygon is not loaded yet, the nearest centre within 20 km. Null = outside Kocaeli.
create or replace function private.district_lookup(p_geom extensions.geometry, out district_id text, out method text)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_g extensions.geometry;
  v_d double precision;
begin
  if p_geom is null or extensions.st_isempty(p_geom) then
    return;
  end if;
  v_g := case when extensions.st_srid(p_geom) in (0, 4326) then extensions.st_setsrid(p_geom, 4326)
              else extensions.st_transform(p_geom, 4326) end;
  if extensions.geometrytype(v_g) <> 'POINT' then
    v_g := extensions.st_pointonsurface(v_g);
  end if;

  select b.district_id into district_id
    from private.district_boundaries b
   where extensions.st_intersects(b.boundary, v_g)
   order by b.district_id
   limit 1;
  if district_id is not null then
    method := 'polygon';
    return;
  end if;

  select x.district_id, x.d into district_id, v_d
    from (select b.district_id, extensions.st_distance(b.boundary::extensions.geography, v_g::extensions.geography) as d
            from private.district_boundaries b
           order by b.boundary <-> v_g
           limit 3) x
   order by x.d
   limit 1;
  if district_id is not null and v_d <= 3000 then
    method := 'near_polygon';
    return;
  end if;
  district_id := null;

  select d.id into district_id
    from public.districts d
   where not exists (select 1 from private.district_boundaries b where b.district_id = d.id)
     and extensions.st_dwithin(d.center, v_g::extensions.geography, 20000)
   order by extensions.st_distance(d.center, v_g::extensions.geography)
   limit 1;
  if district_id is not null then
    method := 'center';
  end if;
end $$;

create or replace function private.district_of(p_geom extensions.geometry)
returns text
language sql
stable
security definer
set search_path = public, extensions
as $$
  select l.district_id from private.district_lookup(p_geom) l
$$;

create or replace function public.district_for_point(p_lat double precision, p_lng double precision)
returns table (id text, name text, method text)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select d.id, d.name, l.method
    from private.district_lookup(case when p_lat between -90 and 90 and p_lng between -180 and 180
                                      then extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326) end) l
    join public.districts d on d.id = l.district_id
$$;
comment on function public.district_for_point(double precision, double precision) is
  'District of a map point: method polygon | near_polygon (within 3 km of one) | center (district without a loaded polygon, centre within 20 km). No row = outside Kocaeli.';

revoke all on function private.district_lookup(extensions.geometry) from public, anon, authenticated;
revoke all on function private.district_of(extensions.geometry) from public, anon, authenticated;
revoke all on function public.district_for_point(double precision, double precision) from public;
grant execute on function public.district_for_point(double precision, double precision) to anon, authenticated, service_role;

-- 2) District columns -----------------------------------------------------------------------------------------------
alter table public.businesses add column if not exists district_id text
  references public.districts(id) on update cascade on delete set null;
alter table public.listings add column if not exists district_id text
  references public.districts(id) on update cascade on delete set null;
alter table public.service_requests add column if not exists district_id text
  references public.districts(id) on update cascade on delete set null;
alter table public.events add column if not exists district_id text
  references public.districts(id) on update cascade on delete set null;
alter table public.poi add column if not exists district_id text
  references public.districts(id) on update cascade on delete set null;
alter table public.profiles add column if not exists district_id text
  references public.districts(id) on update cascade on delete set null;
comment on column public.profiles.district_id is 'Home district preference (optional), like the old neighbourhood_id.';

-- Optional map pin of a service request (private: the customer and admins; firms only see the district).
alter table public.service_requests add column if not exists location extensions.geography(Point, 4326);
alter table public.service_requests add column if not exists lat double precision
  generated always as (extensions.st_y(location::extensions.geometry)) stored;
alter table public.service_requests add column if not exists lng double precision
  generated always as (extensions.st_x(location::extensions.geometry)) stored;

-- Empty = all of Kocaeli (like an empty neighbourhood_ids meant all of Gebze).
alter table public.announcements add column if not exists district_ids text[] not null default '{}';

create index if not exists businesses_district_idx on public.businesses (district_id);
create index if not exists listings_district_idx on public.listings (district_id);
create index if not exists service_requests_district_idx on public.service_requests (district_id);
create index if not exists events_district_idx on public.events (district_id);
create index if not exists poi_kind_district_idx on public.poi (kind, district_id);
create index if not exists profiles_district_idx on public.profiles (district_id);

-- events has column-level SELECT grants (contact_phone stays private); the new column is public like neighbourhood_id.
grant select (district_id) on public.events to anon, authenticated;

-- Service districts of a business (replaces business_service_areas in phase C).
create table if not exists public.business_service_districts (
  business_id uuid not null references public.businesses(id) on delete cascade,
  district_id text not null references public.districts(id) on update cascade on delete cascade,
  primary key (business_id, district_id)
);
create index if not exists business_service_districts_district_idx on public.business_service_districts (district_id);
alter table public.business_service_districts enable row level security;
drop policy if exists "public read" on public.business_service_districts;
create policy "public read" on public.business_service_districts for select to anon, authenticated
  using (public.business_is_public(business_id) or public.owns_business(business_id) or public.is_admin());
drop policy if exists "admin write" on public.business_service_districts;
create policy "admin write" on public.business_service_districts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- Written only by apply_business / set_business_service_scope (SECURITY DEFINER).
revoke all on table public.business_service_districts from anon, authenticated;
grant select on table public.business_service_districts to anon, authenticated;

-- Backfill. Every neighbourhood is in Gebze and all current content is Gebze, so: the neighbourhood's district, else
-- 'gebze' (profiles without a neighbourhood stay empty). Pinned rows are re-checked against the polygons by
-- private.district_reassign_pinned() once seed-districts.mjs has loaded them. The row triggers are off for the
-- backfill (all of them are enabled today), so no audit entries, no updated_at bumps and no listing re-checks.
alter table public.businesses disable trigger user;
update public.businesses t
   set district_id = coalesce((select d.id from public.neighbourhoods n join public.districts d on d.name = n.district
                                where n.id = t.neighbourhood_id), 'gebze')
 where t.district_id is null;
alter table public.businesses enable trigger user;

alter table public.listings disable trigger user;
update public.listings t
   set district_id = coalesce((select d.id from public.neighbourhoods n join public.districts d on d.name = n.district
                                where n.id = t.neighbourhood_id), 'gebze')
 where t.district_id is null;
alter table public.listings enable trigger user;

alter table public.service_requests disable trigger user;
update public.service_requests t
   set district_id = coalesce((select d.id from public.neighbourhoods n join public.districts d on d.name = n.district
                                where n.id = t.neighbourhood_id), 'gebze')
 where t.district_id is null;
alter table public.service_requests enable trigger user;

alter table public.events disable trigger user;
update public.events t
   set district_id = coalesce((select d.id from public.neighbourhoods n join public.districts d on d.name = n.district
                                where n.id = t.neighbourhood_id), 'gebze')
 where t.district_id is null;
alter table public.events enable trigger user;

alter table public.poi disable trigger user;
update public.poi t
   set district_id = coalesce((select d.id from public.neighbourhoods n join public.districts d on d.name = n.district
                                where n.id = t.neighbourhood_id), 'gebze')
 where t.district_id is null;
alter table public.poi enable trigger user;

alter table public.profiles disable trigger user;
update public.profiles t
   set district_id = (select d.id from public.neighbourhoods n join public.districts d on d.name = n.district
                       where n.id = t.neighbourhood_id)
 where t.district_id is null and t.neighbourhood_id is not null;
alter table public.profiles enable trigger user;

update public.announcements a
   set district_ids = coalesce(array(
         select distinct d.id
           from unnest(a.neighbourhood_ids) u(id)
           join public.neighbourhoods n on n.id = u.id
           join public.districts d on d.name = n.district
          order by d.id), '{}')
 where cardinality(a.neighbourhood_ids) > 0 and cardinality(a.district_ids) = 0;

insert into public.business_service_districts (business_id, district_id)
select distinct a.business_id, d.id
  from public.business_service_areas a
  join public.neighbourhoods n on n.id = a.neighbourhood_id
  join public.districts d on d.name = n.district
on conflict do nothing;

-- 3) Keep district_id filled during the transition ------------------------------------------------------------------
-- Order: a district the client sends is kept; else the row's map pin decides (on insert, when the pin moves, or when
-- the district is empty); else the legacy neighbourhood (old clients). Clearing the neighbourhood of a row without a
-- pin clears its district too ("delete my location"). Locked guide rows: a non-admin write cannot move the district
-- away from the (frozen) pin. Named zz_ so it runs after the other BEFORE triggers (alphabetical order).
create or replace function private.fill_district()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_point extensions.geometry;
  v_point_changed boolean := false;
  v_explicit boolean;
  v_d text;
begin
  if tg_table_name in ('businesses', 'poi', 'service_requests') then
    v_point := new.location::extensions.geometry;
    v_point_changed := tg_op = 'INSERT' or new.location::text is distinct from old.location::text;
  elsif tg_table_name = 'events' then
    if new.lat is not null and new.lng is not null then
      v_point := extensions.st_setsrid(extensions.st_makepoint(new.lng, new.lat), 4326);
    end if;
    v_point_changed := tg_op = 'INSERT' or new.lat is distinct from old.lat or new.lng is distinct from old.lng;
  end if;

  if tg_op = 'INSERT' then
    v_explicit := new.district_id is not null;
  else
    v_explicit := new.district_id is distinct from old.district_id;
  end if;

  -- Nested: PL/pgSQL evaluates a whole condition, and only poi has a locked column.
  if tg_table_name = 'poi' and tg_op = 'UPDATE' then
    if old.locked and new.locked and not public.is_admin() then
      if v_explicit then
        new.district_id := coalesce(private.district_of(v_point), old.district_id);
      end if;
      return new;
    end if;
  end if;

  if v_explicit then
    return new;
  end if;

  if v_point is not null and (v_point_changed or new.district_id is null) then
    v_d := private.district_of(v_point);
    if v_d is not null then
      new.district_id := v_d;
      return new;
    end if;
  end if;

  if new.neighbourhood_id is not null then
    if (tg_op = 'INSERT' or new.neighbourhood_id is distinct from old.neighbourhood_id or new.district_id is null)
       and (v_point is null or new.district_id is null) then
      select d.id into v_d
        from public.neighbourhoods n
        join public.districts d on d.name = n.district
       where n.id = new.neighbourhood_id;
      new.district_id := coalesce(v_d, new.district_id);
    end if;
  elsif tg_op = 'UPDATE' and old.neighbourhood_id is not null and v_point is null then
    new.district_id := null;
  end if;
  return new;
end $$;
revoke all on function private.fill_district() from public, anon, authenticated;

drop trigger if exists zz_fill_district on public.businesses;
create trigger zz_fill_district before insert or update of location, neighbourhood_id, district_id on public.businesses
  for each row execute function private.fill_district();
drop trigger if exists zz_fill_district on public.poi;
create trigger zz_fill_district before insert or update of location, neighbourhood_id, district_id on public.poi
  for each row execute function private.fill_district();
drop trigger if exists zz_fill_district on public.service_requests;
create trigger zz_fill_district before insert or update of location, neighbourhood_id, district_id on public.service_requests
  for each row execute function private.fill_district();
drop trigger if exists zz_fill_district on public.events;
create trigger zz_fill_district before insert or update of lat, lng, neighbourhood_id, district_id on public.events
  for each row execute function private.fill_district();
drop trigger if exists zz_fill_district on public.listings;
create trigger zz_fill_district before insert or update of neighbourhood_id, district_id on public.listings
  for each row execute function private.fill_district();
drop trigger if exists zz_fill_district on public.profiles;
create trigger zz_fill_district before insert or update of neighbourhood_id, district_id on public.profiles
  for each row execute function private.fill_district();

-- Announcements written by the old admin editor (neighbourhood_ids only) get the matching district_ids; district ids
-- are checked like a foreign key.
create or replace function private.announcements_fill_districts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT' and cardinality(new.district_ids) = 0)
     or (tg_op = 'UPDATE' and new.district_ids is not distinct from old.district_ids
         and new.neighbourhood_ids is distinct from old.neighbourhood_ids) then
    new.district_ids := coalesce(array(
      select distinct d.id
        from unnest(new.neighbourhood_ids) u(id)
        join public.neighbourhoods n on n.id = u.id
        join public.districts d on d.name = n.district
       order by d.id), '{}');
  end if;
  new.district_ids := coalesce(new.district_ids, '{}');
  if exists (select 1 from unnest(new.district_ids) x where not exists (select 1 from public.districts d where d.id = x)) then
    raise exception 'Geçersiz ilçe' using errcode = '23503', hint = 'invalid_district';
  end if;
  return new;
end $$;
revoke all on function private.announcements_fill_districts() from public, anon, authenticated;
drop trigger if exists zz_fill_districts on public.announcements;
create trigger zz_fill_districts before insert or update of neighbourhood_ids, district_ids on public.announcements
  for each row execute function private.announcements_fill_districts();

-- Pinned rows still on the Gebze backfill (or without a district) move to the district polygon their pin is in.
-- p_all = true re-checks every pinned row. seed-districts.mjs calls it after loading the polygons.
create or replace function private.district_reassign_pinned(p_all boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_b int;
  v_p int;
  v_e int;
  v_r int;
begin
  if not exists (select 1 from private.district_boundaries) then
    return jsonb_build_object('ok', false, 'reason', 'no_boundaries');
  end if;

  with x as (
    select t.id, l.district_id as d
      from public.businesses t
      cross join lateral private.district_lookup(t.location::extensions.geometry) l
     where t.location is not null and l.method = 'polygon' and l.district_id is distinct from t.district_id
       and (coalesce(p_all, false) or t.district_id is null or t.district_id = 'gebze'))
  update public.businesses t set district_id = x.d from x where x.id = t.id;
  get diagnostics v_b = row_count;

  with x as (
    select t.id, l.district_id as d
      from public.poi t
      cross join lateral private.district_lookup(t.location::extensions.geometry) l
     where t.location is not null and l.method = 'polygon' and l.district_id is distinct from t.district_id
       and (coalesce(p_all, false) or t.district_id is null or t.district_id = 'gebze'))
  update public.poi t set district_id = x.d from x where x.id = t.id;
  get diagnostics v_p = row_count;

  with x as (
    select t.id, l.district_id as d
      from public.events t
      cross join lateral private.district_lookup(extensions.st_setsrid(extensions.st_makepoint(t.lng, t.lat), 4326)) l
     where t.lat is not null and t.lng is not null and l.method = 'polygon' and l.district_id is distinct from t.district_id
       and (coalesce(p_all, false) or t.district_id is null or t.district_id = 'gebze'))
  update public.events t set district_id = x.d from x where x.id = t.id;
  get diagnostics v_e = row_count;

  with x as (
    select t.id, l.district_id as d
      from public.service_requests t
      cross join lateral private.district_lookup(t.location::extensions.geometry) l
     where t.location is not null and l.method = 'polygon' and l.district_id is distinct from t.district_id
       and (coalesce(p_all, false) or t.district_id is null or t.district_id = 'gebze'))
  update public.service_requests t set district_id = x.d from x where x.id = t.id;
  get diagnostics v_r = row_count;

  return jsonb_build_object('ok', true, 'businesses', v_b, 'poi', v_p, 'events', v_e, 'service_requests', v_r);
end $$;
revoke all on function private.district_reassign_pinned(boolean) from public, anon, authenticated;

-- A district change is a content change of a guide row (updated_at), like the neighbourhood.
create or replace function private.poi_before_write()
 returns trigger
 language plpgsql
 set search_path to 'public', 'extensions'
as $function$
begin
  if tg_op = 'UPDATE' and old.locked and new.locked and not public.is_admin() then
    new.name := old.name;
    new.address := old.address;
    new.phone := old.phone;
    new.location := old.location;
    new.neighbourhood_id := old.neighbourhood_id;
    new.hidden := old.hidden;
    new.email := old.email;
    new.website := old.website;
    new.verified_at := old.verified_at;
    new.source_urls := old.source_urls;
    if jsonb_typeof(old.details) = 'object' and jsonb_typeof(new.details) = 'object' then
      new.details := new.details || coalesce((
        select jsonb_object_agg(e.key, e.value) from jsonb_each(old.details) e
         where e.key in ('category', 'description', 'hours', 'fee', 'curated', 'photos',
                         'subkind', 'ownership', 'phones', 'fax', 'bank', 'brand', 'operator', 'sockets', 'power_kw',
                         'capacity', 'period', 'note')), '{}'::jsonb);
    end if;
  end if;
  -- missing_since marks sync-hidden rows only.
  if not new.hidden then
    new.missing_since := null;
  end if;
  new.search_norm := public.tr_norm(new.name || ' ' || coalesce(new.address, '') || ' ' ||
    replace(concat_ws(' ', new.details ->> 'category', new.details ->> 'subkind', new.details ->> 'bank',
                      new.details ->> 'brand', new.details ->> 'operator'), '_', ' '));
  -- Sync bookkeeping alone (last_seen_at) is not a content change.
  if tg_op = 'UPDATE'
     and (new.kind, new.name, new.slug, new.address, new.phone, new.neighbourhood_id, new.district_id, new.details, new.source,
          new.source_ref, new.license, new.hidden, new.locked, new.email, new.website, new.verified_at, new.source_urls)
         is not distinct from
         (old.kind, old.name, old.slug, old.address, old.phone, old.neighbourhood_id, old.district_id, old.details, old.source,
          old.source_ref, old.license, old.hidden, old.locked, old.email, old.website, old.verified_at, old.source_urls)
     and new.location::text is not distinct from old.location::text then
    new.updated_at := old.updated_at;
  else
    new.updated_at := now();
  end if;
  return new;
end $function$;

-- A user event whose district changes goes back to review, like a neighbourhood change (only v_changed differs).
create or replace function private.events_before_write()
 returns trigger
 language plpgsql
 set search_path to 'public', 'extensions'
as $function$
declare
  v_base text;
  v_uid uuid := auth.uid();
  -- API callers (PostgREST roles). Seeds / service role / SECURITY DEFINER admin RPCs are trusted.
  v_api boolean := current_user in ('authenticated', 'anon');
  v_admin boolean := false;
  v_changed boolean := false;
  v_req text;
  v_n int;
  v_media text := 'https://fboythglcjofakbskstg.supabase.co/storage/v1/object/public/media/';
begin
  if new.is_free then
    new.price_try := null;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    if v_api then
      new.is_demo := false;
    end if;
  end if;

  if v_api then
    v_admin := public.is_admin();
  end if;

  if v_api and not v_admin then
    if v_uid is null then
      raise exception 'Etkinlik eklemek için giriş yapmalısın' using errcode = '42501', hint = 'login_required';
    end if;

    -- Moderation and ownership columns are not the caller's to set.
    if tg_op = 'INSERT' then
      new.created_by := v_uid;
      new.created_at := now();
      new.slug := null;
      new.admin_hidden := false;
      new.rejection_reason := null;
      new.reviewed_by := null;
      new.reviewed_at := null;
    else
      new.id := old.id;
      new.created_by := old.created_by;
      new.created_at := old.created_at;
      new.business_id := old.business_id;
      new.slug := old.slug;
      new.is_demo := old.is_demo;
      new.admin_hidden := old.admin_hidden;
      new.rejection_reason := old.rejection_reason;
      new.reviewed_by := old.reviewed_by;
      new.reviewed_at := old.reviewed_at;
      new.organizer_name := old.organizer_name;
      v_changed := (new.title, new.description, new.category, new.starts_at, new.ends_at, new.venue_name, new.address,
                    new.lat, new.lng, new.neighbourhood_id, new.district_id, new.venue_business_id, new.is_free, new.price_try,
                    new.price_note, new.ticket_url, new.contact_phone, new.cover_url)
                   is distinct from
                   (old.title, old.description, old.category, old.starts_at, old.ends_at, old.venue_name, old.address,
                    old.lat, old.lng, old.neighbourhood_id, old.district_id, old.venue_business_id, old.is_free, old.price_try,
                    old.price_note, old.ticket_url, old.contact_phone, old.cover_url);
    end if;

    -- Dates: from one hour ago up to 400 days ahead; at most 60 days long.
    if (tg_op = 'INSERT' or new.starts_at is distinct from old.starts_at)
       and (new.starts_at < now() - interval '1 hour' or new.starts_at > now() + interval '400 days') then
      raise exception 'Etkinlik tarihi geçersiz' using errcode = 'P0001', hint = 'invalid_dates';
    end if;
    if new.ends_at is not null and new.ends_at > new.starts_at + interval '60 days'
       and (tg_op = 'INSERT' or new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at) then
      raise exception 'Etkinlik en fazla 60 gün sürebilir' using errcode = 'P0001', hint = 'invalid_dates';
    end if;

    -- Cover: only a photo the caller uploaded to their own media folder.
    if new.cover_url is not null and (tg_op = 'INSERT' or new.cover_url is distinct from old.cover_url)
       and (left(new.cover_url, length(v_media) + 37) <> v_media || v_uid::text || '/'
            or position('..' in new.cover_url) > 0 or new.cover_url ~ '\s') then
      raise exception 'Kapak fotoğrafı yalnızca senin yüklediğin bir fotoğraf olabilir' using errcode = '22023', hint = 'invalid_cover';
    end if;

    -- Ticket link: https only.
    if new.ticket_url is not null and (tg_op = 'INSERT' or new.ticket_url is distinct from old.ticket_url)
       and (new.ticket_url !~* '^https://[^/\s]+\.[^/\s]+' or new.ticket_url ~ '\s') then
      raise exception 'Bilet bağlantısı https:// ile başlamalı' using errcode = '22023', hint = 'invalid_ticket_url';
    end if;

    -- Place at a business: must be a public business.
    if new.venue_business_id is not null
       and (tg_op = 'INSERT' or new.venue_business_id is distinct from old.venue_business_id)
       and not public.business_is_public(new.venue_business_id) then
      raise exception 'Seçilen işletme bulunamadı' using errcode = '22023', hint = 'invalid_venue';
    end if;

    if new.business_id is not null then
      -- Business event (RLS: owner of a public business). Publishes directly; the phone is the business's own.
      new.contact_phone := null;
      new.organizer_name := null;
      new.phone := (select b.phone from public.businesses b where b.id = new.business_id);
      if tg_op = 'INSERT' then
        if new.status not in ('published', 'draft') then
          new.status := 'published';
        end if;
      else
        v_req := new.status;
        if old.admin_hidden then
          if v_req = 'published' and old.status <> 'published' then
            raise exception 'Bu etkinlik yönetici tarafından yayından kaldırıldı. Düzenleyip yeniden onaya gönderebilirsin.'
              using errcode = '42501', hint = 'admin_hidden';
          end if;
          if v_req not in ('draft', 'cancelled', 'pending_review') then
            v_req := old.status;
          end if;
          if v_changed and v_req not in ('draft', 'cancelled') then
            v_req := 'pending_review';
          end if;
        elsif v_req not in ('published', 'draft', 'cancelled') then
          v_req := old.status;
        end if;
        new.status := v_req;
      end if;

      if tg_op = 'INSERT' or (new.status = 'published' and old.status <> 'published') then
        perform pg_advisory_xact_lock(hashtextextended('events_business:' || new.business_id::text, 0));
      end if;
      if tg_op = 'INSERT' then
        select count(*) into v_n from public.events
         where business_id = new.business_id and created_at > now() - interval '24 hours';
        if v_n >= coalesce((select (value #>> '{}')::int from public.app_settings where key = 'event_business_daily_cap'), 10) then
          raise exception 'Son 24 saatte bu işletme için çok fazla etkinlik eklendi. Biraz sonra tekrar dene.'
            using errcode = 'P0001', hint = 'event_daily_cap';
        end if;
      end if;
      if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') then
        select count(*) into v_n from public.events
         where business_id = new.business_id and status = 'published' and coalesce(ends_at, starts_at) >= now() and id <> new.id;
        if v_n >= coalesce((select (value #>> '{}')::int from public.app_settings where key = 'event_business_active_cap'), 30) then
          raise exception 'Yayında en fazla 30 yaklaşan etkinliğin olabilir. Eski etkinliklerinden birini kaldır.'
            using errcode = 'P0001', hint = 'event_active_cap';
        end if;
      end if;
    else
      -- User event: always reviewed by an admin; the contact phone is private (reveal_event_phone).
      new.phone := null;
      if tg_op = 'INSERT' then
        new.organizer_name := public.short_name((select p.full_name from public.profiles p where p.id = v_uid));
        new.status := 'pending_review';
      else
        v_req := new.status;
        if v_req not in ('draft', 'cancelled', 'pending_review') then
          v_req := old.status;
        end if;
        if v_changed and v_req not in ('draft', 'cancelled') then
          v_req := 'pending_review';
        end if;
        new.status := v_req;
      end if;

      if new.status = 'pending_review' and (tg_op = 'INSERT' or old.status <> 'pending_review') then
        perform pg_advisory_xact_lock(hashtextextended('events_user:' || v_uid::text, 0));
        select count(*) into v_n from public.events
         where created_by = v_uid and business_id is null and status = 'pending_review' and id <> new.id;
        if v_n >= coalesce((select (value #>> '{}')::int from public.app_settings where key = 'event_user_pending_cap'), 3) then
          raise exception 'Onay bekleyen en fazla 3 etkinliğin olabilir. Önce onaylanmalarını bekle.'
            using errcode = 'P0001', hint = 'event_pending_cap';
        end if;
      end if;
      if tg_op = 'INSERT' then
        select count(*) into v_n from public.events
         where created_by = v_uid and business_id is null and status in ('pending_review', 'published')
           and coalesce(ends_at, starts_at) >= now();
        if v_n >= coalesce((select (value #>> '{}')::int from public.app_settings where key = 'event_user_active_cap'), 10) then
          raise exception 'En fazla 10 yaklaşan etkinliğin olabilir.' using errcode = 'P0001', hint = 'event_active_cap';
        end if;
      end if;
    end if;
  elsif new.status = 'published' then
    -- An admin (or a trusted job) publishing an event lifts an earlier take-down.
    new.admin_hidden := false;
  end if;

  if new.slug is null or btrim(new.slug) = '' then
    v_base := public.tr_slug(new.title);
    new.slug := left(coalesce(nullif(v_base, ''), 'etkinlik'), 60) || '-' || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;
  if new.ends_at is not null and new.ends_at < new.starts_at then
    raise exception 'Bitiş zamanı başlangıçtan önce olamaz' using errcode = 'P0001', hint = 'invalid_dates';
  end if;
  new.updated_at := now();
  return new;
end $function$;

-- 4) Service dispatch by district ----------------------------------------------------------------------------------
-- area_match (the request's neighbourhood, legacy) and district_match (business_service_districts has the request's
-- district) are the priority signals: 0.5 for serving the request's area, +0.1 when the exact neighbourhood is served.
-- Out-of-area firms only fill the pool when they are within app_settings.dispatch_fallback_km (default 30) of the
-- request: the firm's pin, else its district centre, to the request's pin, else its district centre. So a Kandıra
-- request never reaches a Gebze firm through the fallback. An admin's hand-picked list (p_only) and the admin candidate
-- list (p_any_distance) are not capped. Demo rules and the one-pick-per-owner rule are unchanged.
drop function if exists private.match_candidates(uuid, uuid[]);
create or replace function private.match_candidates(p_request_id uuid, p_only uuid[] default null,
                                                    p_any_distance boolean default false)
 returns table(business_id uuid, owner_id uuid, business_name text, area_match boolean, score numeric,
               district_match boolean, distance_m double precision)
 language sql
 stable security definer
 set search_path to 'public', 'extensions'
as $function$
  with r as (
    select sr.*, sc.parent_id as cat_parent,
           (sr.is_demo or coalesce(pr.is_demo, false)) as demo_request,
           coalesce(sr.location, rd.center) as req_point
      from public.service_requests sr
      join public.service_categories sc on sc.id = sr.category_id
      left join public.profiles pr on pr.id = sr.customer_id
      left join public.districts rd on rd.id = sr.district_id
     where sr.id = p_request_id
  ),
  cap as (
    select greatest(1, least(private.app_setting_int('dispatch_fallback_km', 30), 200)) * 1000.0 as m
  ),
  c as (
    select b.id as business_id, b.owner_id, b.name as business_name,
           m.area_match, m.district_match, m.distance_m,
           (case when m.area_match or m.district_match then 0.5 else 0 end)
           + (case when m.area_match then 0.1 else 0 end)
           + 0.20 * (coalesce(b.rating_avg, 0) / 5.0)
           + 0.15 * (1.0 / (1 + (select count(*) from public.leads l2
                                  where l2.business_id = b.id and l2.created_at > now() - interval '7 days')))
           + 0.10 * (b.verification_level / 3.0) as base_score
      from r
      join public.businesses b on true
      left join public.districts bd on bd.id = b.district_id
      cross join lateral (
        select exists (select 1 from public.business_service_areas a
                        where a.business_id = b.id and a.neighbourhood_id = r.neighbourhood_id) as area_match,
               exists (select 1 from public.business_service_districts sd
                        where sd.business_id = b.id and sd.district_id = r.district_id) as district_match,
               extensions.st_distance(coalesce(b.location, bd.center), r.req_point) as distance_m
      ) m
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
       -- Out-of-area firms only nearby (an unknown distance counts as far).
       and (m.area_match or m.district_match or p_only is not null or coalesce(p_any_distance, false)
            or m.distance_m <= (select cap.m from cap))
  ),
  pick as (
    select distinct on (c.owner_id) c.*
      from c
     order by c.owner_id, (c.area_match or c.district_match) desc, c.area_match desc, c.base_score desc, c.business_id
  )
  select pick.business_id, pick.owner_id, pick.business_name, pick.area_match,
         (pick.base_score + 0.05 * random())::numeric as score,
         pick.district_match, pick.distance_m
    from pick
$function$;
revoke all on function private.match_candidates(uuid, uuid[], boolean) from public, anon, authenticated;

create or replace function private.dispatch_request(p_request_id uuid, p_wave integer default 1, p_only uuid[] default null::uuid[])
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
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
  -- 2026091380: requests without a neighbourhood are named by their district.
  if v_nb is null then
    select name into v_nb from public.districts where id = v_req.district_id;
  end if;

  -- The area is for priority, not exclusion: firms serving the request's neighbourhood or district first, then the other
  -- nearby firms of the category (match_candidates caps them by distance) fill the pool (notify_pool_size; 50 for an
  -- admin's hand-picked list).
  for rec in
    select c.* from private.match_candidates(p_request_id, p_only) c
     order by (c.area_match or c.district_match) desc, c.area_match desc, c.score desc
     limit case when p_only is null then v_cat.notify_pool_size else 50 end
  loop
    v_lead := null;
    insert into public.leads (request_id, business_id, status, wave_no, match_score)
    values (v_req.id, rec.business_id, 'sent', coalesce(p_wave, 1), round(rec.score, 3))
    on conflict (request_id, business_id) do nothing
    returning id into v_lead;
    if v_lead is not null then
      v_count := v_count + 1;
      if not (rec.area_match or rec.district_match) then
        v_fallback := true;
      end if;
      perform private.notify(rec.owner_id, 'lead_new',
        'Yeni hizmet talebi: ' || v_cat.name || ' - ' || coalesce(v_nb, 'Kocaeli'),
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
      coalesce(v_nb, 'Kocaeli') || ' için uygun firma bulunamadı.', '/admin/talepler');
  end if;

  return jsonb_build_object('ok', true, 'lead_count', v_count, 'total_leads', v_total,
                            'fallback', v_fallback, 'status', v_status);
end $function$;

create or replace function private.redispatch_request(p_request_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
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
    if v_nb is null then
      select name into v_nb from public.districts where id = v_r.district_id;
    end if;
    perform private.notify_admins('request_stalled', 'Firma bekleyen talep: ' || coalesce(v_cat, 'Hizmet'),
      coalesce(v_nb, 'Kocaeli') || ' - kod ' || v_r.public_code
        || '. Gönderilen firmalar ilgilenmedi ve yeni uygun firma yok; elle firma seç.',
      '/admin/talepler');
    return jsonb_build_object('ok', true, 'result', 'stalled');
  end if;
  return jsonb_build_object('ok', true, 'result', 'none');
end $function$;

create or replace function public.customer_remove_lead(p_lead_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
    if v_nb is null then
      select name into v_nb from public.districts where id = v_r.district_id;
    end if;
    with u as (
      update public.leads set status = 'seen'
       where request_id = v_r.id and status = 'closed_full'
      returning id, business_id
    )
    insert into public.notifications (user_id, type, title, body, link)
    select b.owner_id, 'lead_reopened',
           'Talepte yer açıldı: ' || coalesce(v_cat, 'Hizmet') || ' - ' || coalesce(v_nb, 'Kocaeli'),
           b.name || ' için: müşteri bir firmayı listeden çıkardı. Hâlâ ilgileniyorsan talebi kabul edebilirsin.',
           '/isletme/talepler/' || u.id
      from u
      join public.businesses b on b.id = u.business_id
     where not private.is_banned(b.owner_id);
  end if;
  return jsonb_build_object('ok', true);
end $function$;

-- Admin candidate list: every firm of the category (no distance cap), in-area first ("Bölgede" = serves the request's
-- neighbourhood or district).
create or replace function public.admin_request_candidates(p_request_id uuid)
 returns table(business_id uuid, business_name text, area_match boolean, score numeric)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;
  return query
    select c.business_id, c.business_name, (c.area_match or c.district_match), round(c.score, 3)
      from private.match_candidates(p_request_id, null, true) c
     order by (c.area_match or c.district_match) desc, c.area_match desc, c.score desc
     limit 100;
end $function$;

-- 5) Write RPCs: optional district parameters ----------------------------------------------------------------------
-- The old signatures are dropped in the same transaction (a second overload would make PostgREST calls ambiguous,
-- PGRST203). Every old call still resolves: the parameter names stay and the new ones default to null.

-- submit_service_request: where = p_district_id (new clients), else the map pin, else the legacy neighbourhood.
drop function if exists public.submit_service_request(uuid, jsonb, uuid, text, text, date, text, text[], boolean);
create or replace function public.submit_service_request(
  p_category_id uuid, p_answers jsonb, p_neighbourhood_id uuid default null::uuid,
  p_address_note text default null::text, p_when_type text default 'esnek'::text, p_when_date date default null::date,
  p_note text default null::text, p_photos text[] default '{}'::text[], p_hide_phone boolean default false,
  p_district_id text default null::text, p_lat double precision default null::double precision,
  p_lng double precision default null::double precision)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_cat public.service_categories;
  v_flow public.question_flows;
  v_errors text[];
  v_clean jsonb;
  v_code text;
  v_id uuid;
  v_dispatch jsonb;
  v_status text;
  v_nb text;
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
  v_max int;
  v_district_id text;
  v_district_name text;
  v_location extensions.geography;
begin
  if v_uid is null then
    raise exception 'Talep göndermek için giriş yapmalısın' using errcode = '42501', hint = 'login_required';
  end if;
  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.status = 'banned' then
    raise exception 'Hesabın askıya alınmış' using errcode = '42501', hint = 'account_banned';
  end if;
  select * into v_cat from public.service_categories where id = p_category_id and active;
  if not found then
    raise exception 'Hizmet kategorisi bulunamadı' using errcode = 'P0001', hint = 'category_not_found';
  end if;
  if p_neighbourhood_id is not null then
    select name into v_nb from public.neighbourhoods where id = p_neighbourhood_id;
  end if;
  if p_lat is not null and p_lng is not null then
    if p_lat not between -90 and 90 or p_lng not between -180 and 180 then
      raise exception 'Konum geçersiz' using errcode = 'P0001', hint = 'invalid_location';
    end if;
    v_location := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  end if;
  if nullif(btrim(coalesce(p_district_id, '')), '') is not null then
    select id into v_district_id from public.districts where id = btrim(p_district_id) and active;
    if v_district_id is null then
      raise exception 'Geçerli bir ilçe seçmelisin' using errcode = 'P0001', hint = 'invalid_district';
    end if;
  elsif v_location is not null then
    v_district_id := private.district_of(v_location::extensions.geometry);
    if v_district_id is null then
      raise exception 'Konum Kocaeli sınırları dışında görünüyor' using errcode = 'P0001', hint = 'location_outside';
    end if;
  elsif v_nb is not null then
    select d.id into v_district_id
      from public.neighbourhoods n join public.districts d on d.name = n.district
     where n.id = p_neighbourhood_id;
  end if;
  if v_district_id is null then
    if p_district_id is null and p_lat is null and p_lng is null then
      -- Old clients only know neighbourhoods: the same message and hint as before.
      raise exception 'Mahalle seçmelisin' using errcode = 'P0001', hint = 'neighbourhood_required';
    end if;
    raise exception 'İlçe seçmelisin' using errcode = 'P0001', hint = 'district_required';
  end if;
  select name into v_district_name from public.districts where id = v_district_id;
  if p_when_type is null or p_when_type not in ('acil', 'bu_hafta', 'tarih', 'esnek')
     or (p_when_type = 'tarih' and (p_when_date is null or p_when_date < v_today or p_when_date > v_today + 180)) then
    raise exception 'Geçerli bir zaman seçmelisin' using errcode = 'P0001', hint = 'invalid_when';
  end if;
  if (select count(*) from public.service_requests
       where customer_id = v_uid and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'Bugün çok fazla talep gönderdin, lütfen daha sonra tekrar dene' using errcode = 'P0001', hint = 'rate_limited';
  end if;

  select * into v_flow from public.question_flows
   where category_id = p_category_id and published
   order by version desc limit 1;
  if found then
    select errors, cleaned into v_errors, v_clean from private.validate_answers(v_flow.schema, p_answers);
    if cardinality(v_errors) > 0 then
      raise exception 'Eksik veya geçersiz cevap: %', array_to_string(v_errors, ', ')
        using errcode = 'P0001', hint = 'invalid_answers';
    end if;
  else
    v_clean := coalesce(p_answers, '{}'::jsonb);
  end if;

  -- The category's own limit, else the admin default (kept within 1-10 like the category check).
  v_max := least(greatest(coalesce(v_cat.max_providers, private.app_setting_int('max_providers_default', 5)), 1), 10);

  v_code := private.new_public_code();
  insert into public.service_requests (
    public_code, customer_id, category_id, flow_id, answers, neighbourhood_id, address_note,
    when_type, when_date, note, photos, hide_phone, status, max_providers, district_id, location)
  values (
    v_code, v_uid, p_category_id, v_flow.id, v_clean, case when v_nb is not null then p_neighbourhood_id end,
    nullif(left(btrim(coalesce(p_address_note, '')), 200), ''),
    p_when_type, case when p_when_type = 'tarih' then p_when_date end,
    nullif(left(btrim(coalesce(p_note, '')), 1000), ''),
    coalesce((coalesce(p_photos, '{}'::text[]))[1:6], '{}'::text[]),
    coalesce(p_hide_phone, false),
    case when v_cat.auto_dispatch then 'open' else 'admin_review' end,
    v_max, v_district_id, v_location)
  returning id into v_id;

  if v_cat.auto_dispatch then
    v_dispatch := private.dispatch_request(v_id, 1, null);
  else
    perform private.notify_admins('request_review', 'Onay bekleyen talep: ' || v_cat.name,
      coalesce(v_nb, v_district_name) || ' - kod ' || v_code, '/admin/talepler');
  end if;

  select status into v_status from public.service_requests where id = v_id;
  perform private.notify(v_uid, 'request_created', 'Talebin alındı',
    v_cat.name || ' talebin uygun firmalara iletilecek. Kabul eden firmaları bu sayfada göreceksin.',
    '/talep/' || v_code);

  return jsonb_build_object('id', v_id, 'public_code', v_code, 'status', v_status,
                            'lead_count', coalesce((v_dispatch ->> 'lead_count')::int, 0));
end $function$;
revoke all on function public.submit_service_request(uuid, jsonb, uuid, text, text, date, text, text[], boolean, text, double precision, double precision) from public, anon;
grant execute on function public.submit_service_request(uuid, jsonb, uuid, text, text, date, text, text[], boolean, text, double precision, double precision) to authenticated, service_role;

-- apply_business: district = p_district_id, else the pin's district, else the neighbourhood's. Service districts =
-- p_service_district_ids, else the districts of the service areas (old clients), else the firm's own district.
drop function if exists public.apply_business(text, text[], text, text, text, text, uuid, uuid[], uuid[], jsonb, double precision, double precision, text, text, text, uuid);
create or replace function public.apply_business(
  p_name text, p_kinds text[], p_phone text default null::text, p_category_label text default null::text,
  p_description text default null::text, p_address text default null::text, p_neighbourhood_id uuid default null::uuid,
  p_service_category_ids uuid[] default '{}'::uuid[], p_service_area_ids uuid[] default '{}'::uuid[],
  p_working_hours jsonb default '{}'::jsonb, p_lat double precision default null::double precision,
  p_lng double precision default null::double precision, p_logo_url text default null::text,
  p_cover_url text default null::text, p_vertical text default null::text, p_business_id uuid default null::uuid,
  p_district_id text default null::text, p_service_district_ids text[] default null::text[])
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  v_existing public.businesses;
  v_phone text;
  v_id uuid;
  v_slug text;
  v_areas uuid[];
  -- 2026091370: 'employer' ("Personel arıyorum") is no longer a kind; older clients may still send it.
  v_kinds text[] := array_remove(coalesce(p_kinds, '{}'), 'employer');
  v_vertical text := nullif(btrim(coalesce(p_vertical, '')), '');
  v_location extensions.geography;
  v_count int;
  v_limit int;
  v_district text;
  v_sdistricts text[];
begin
  if v_uid is null then
    raise exception 'Giriş yapmalısın' using errcode = '42501', hint = 'login_required';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and status = 'banned') then
    raise exception 'Hesabın engelli olduğu için işletme açamazsın' using errcode = '42501', hint = 'banned';
  end if;
  if p_name is null or char_length(btrim(p_name)) < 2 or char_length(btrim(p_name)) > 80 then
    raise exception 'İşletme adı 2-80 karakter olmalı' using errcode = 'P0001', hint = 'invalid_name';
  end if;
  if v_vertical is not null and v_vertical not in ('yemek', 'restoran', 'kafe', 'otel', 'hizmet', 'magaza', 'saglik', 'dugun', 'egitim', 'diger') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_vertical');
  end if;
  -- Kinds follow the vertical when not given: service firms get leads, everything else is a place customers visit.
  if cardinality(v_kinds) = 0 and v_vertical is not null then
    v_kinds := case when v_vertical = 'hizmet' then array['service'] else array['shop'] end;
  end if;
  if cardinality(v_kinds) = 0 or not (v_kinds <@ array['service', 'shop', 'employer']) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_kinds');
  end if;
  v_vertical := coalesce(v_vertical, case when 'service' = any (v_kinds) then 'hizmet' when 'shop' = any (v_kinds) then 'magaza' else 'diger' end);
  v_phone := coalesce(private.phone_e164(p_phone), (select phone from public.profiles where id = v_uid));
  if v_phone is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_phone');
  end if;
  if 'service' = any (v_kinds) and cardinality(coalesce(p_service_category_ids, '{}')) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'categories_required');
  end if;
  v_location := case when p_lat is null or p_lng is null then null
                     else extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography end;
  -- 2026091380: the business's district.
  if nullif(btrim(coalesce(p_district_id, '')), '') is not null then
    select id into v_district from public.districts where id = btrim(p_district_id) and active;
    if v_district is null then
      return jsonb_build_object('ok', false, 'reason', 'invalid_district');
    end if;
  elsif v_location is not null then
    v_district := private.district_of(v_location::extensions.geometry);
  end if;
  if v_district is null and p_neighbourhood_id is not null then
    select d.id into v_district
      from public.neighbourhoods n join public.districts d on d.name = n.district
     where n.id = p_neighbourhood_id;
  end if;

  if p_business_id is not null then
    select * into v_existing from public.businesses where id = p_business_id and owner_id = v_uid for update;
    if not found then
      return jsonb_build_object('ok', false, 'reason', 'not_found');
    end if;
    if v_existing.status not in ('pending', 'rejected') then
      return jsonb_build_object('ok', false, 'reason', 'not_editable', 'status', v_existing.status);
    end if;
    -- 2026091370: the type of an existing business is locked (only admin_set_business_vertical changes it).
    if v_existing.vertical is not null then
      v_vertical := v_existing.vertical;
      v_kinds := case when v_vertical = 'hizmet' then array['service'] else array['shop'] end;
      if 'service' = any (v_kinds) and cardinality(coalesce(p_service_category_ids, '{}')) = 0 then
        return jsonb_build_object('ok', false, 'reason', 'categories_required');
      end if;
    end if;
    update public.businesses
       set name = btrim(p_name), kinds = v_kinds, vertical = v_vertical, phone = v_phone, category_label = p_category_label,
           description = p_description, address = p_address, neighbourhood_id = p_neighbourhood_id,
           working_hours = coalesce(p_working_hours, '{}'::jsonb), location = v_location, logo_url = p_logo_url,
           cover_url = coalesce(p_cover_url, cover_url), status = 'approved', approved_at = now(), rejection_reason = null,
           district_id = v_district
     where id = v_existing.id
     returning id, slug into v_id, v_slug;
    delete from public.business_service_categories where business_id = v_id;
    delete from public.business_service_areas where business_id = v_id;
    delete from public.business_service_districts where business_id = v_id;
  else
    -- Admin switch "Yeni işletme başvuruları" (missing key = closed, like the app default).
    if not public.is_admin()
       and not coalesce((select value = 'true'::jsonb from public.app_settings where key = 'feature_business_applications'), false) then
      raise exception 'Şu an yeni işletme başvurusu alınmıyor' using errcode = 'P0001', hint = 'applications_closed';
    end if;
    -- One new business at a time per user, so parallel calls cannot pass the cap.
    perform pg_advisory_xact_lock(hashtext('apply_business:' || v_uid::text));
    if exists (select 1 from public.businesses where owner_id = v_uid and status = 'suspended') then
      return jsonb_build_object('ok', false, 'reason', 'suspended');
    end if;
    -- 2026091370: businesses per account = app_settings.business_max_per_owner (default 1) + admin-granted slots.
    -- Admins are limited too (they can grant themselves a slot), so the flow can be tested with any account.
    select count(*) into v_count from public.businesses where owner_id = v_uid;
    v_limit := private.business_limit_for(v_uid);
    if v_count >= v_limit then
      raise exception 'Bir hesapla en fazla % işletme açabilirsin. Yeni işletme için destek ekibimize yaz, hesabına ekleyelim.', v_limit
        using errcode = 'P0001', hint = 'business_limit';
    end if;
    insert into public.businesses (owner_id, name, kinds, vertical, phone, category_label, description, address,
                                   neighbourhood_id, working_hours, location, logo_url, cover_url, status, approved_at,
                                   district_id)
    values (v_uid, btrim(p_name), v_kinds, v_vertical, v_phone, p_category_label, p_description, p_address,
            p_neighbourhood_id, coalesce(p_working_hours, '{}'::jsonb), v_location, p_logo_url, p_cover_url, 'approved', now(),
            v_district)
    returning id, slug into v_id, v_slug;
  end if;

  insert into public.business_service_categories (business_id, category_id)
  select v_id, c.id from public.service_categories c where c.id = any (coalesce(p_service_category_ids, '{}'))
  on conflict do nothing;

  v_areas := coalesce(p_service_area_ids, '{}');
  if cardinality(v_areas) = 0 and p_neighbourhood_id is not null and p_service_district_ids is null then
    v_areas := array[p_neighbourhood_id];
  end if;
  insert into public.business_service_areas (business_id, neighbourhood_id)
  select v_id, n.id from public.neighbourhoods n where n.id = any (v_areas)
  on conflict do nothing;

  if p_service_district_ids is not null then
    select coalesce(array_agg(d.id), '{}') into v_sdistricts
      from public.districts d where d.id = any (p_service_district_ids) and d.active;
  else
    select coalesce(array_agg(distinct d.id), '{}') into v_sdistricts
      from public.neighbourhoods n join public.districts d on d.name = n.district
     where n.id = any (v_areas);
  end if;
  if cardinality(v_sdistricts) = 0 and v_district is not null then
    v_sdistricts := array[v_district];
  end if;
  insert into public.business_service_districts (business_id, district_id)
  select v_id, x from unnest(v_sdistricts) x
  on conflict do nothing;

  perform private.notify_admins('business_application', 'Yeni işletme yayında: ' || btrim(p_name),
    'İşletme sayfası açıldı. Uygunsuz bir durum varsa askıya alabilirsin.', '/admin/isletmeler');
  return jsonb_build_object('ok', true, 'business_id', v_id, 'slug', v_slug, 'status', 'approved');
end $function$;
revoke all on function public.apply_business(text, text[], text, text, text, text, uuid, uuid[], uuid[], jsonb, double precision, double precision, text, text, text, uuid, text, text[]) from public, anon;
grant execute on function public.apply_business(text, text[], text, text, text, text, uuid, uuid[], uuid[], jsonb, double precision, double precision, text, text, text, uuid, text, text[]) to authenticated, service_role;

-- set_business_service_scope: p_district_ids (new clients) replaces the service districts and drops the service areas
-- of districts no longer served; p_neighbourhood_ids (old clients) replaces the areas as before and mirrors them to
-- the districts they are in (only those districts' rows change, so districts set by a new client survive).
drop function if exists public.set_business_service_scope(uuid, uuid[], uuid[]);
create or replace function public.set_business_service_scope(p_business_id uuid, p_category_ids uuid[],
                                                             p_neighbourhood_ids uuid[] default null::uuid[],
                                                             p_district_ids text[] default null::text[])
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_categories int;
  v_areas int;
  v_districts int;
begin
  if auth.uid() is null then
    raise exception 'Giriş yapmalısın' using errcode = '42501', hint = 'login_required';
  end if;
  if not (public.owns_business(p_business_id) or public.is_admin()) then
    raise exception 'İşletme bulunamadı' using errcode = '42501', hint = 'not_owner';
  end if;

  -- One save at a time per business.
  perform 1 from public.businesses where id = p_business_id for update;

  delete from public.business_service_categories where business_id = p_business_id;
  insert into public.business_service_categories (business_id, category_id)
  select p_business_id, c.id from public.service_categories c where c.id = any (coalesce(p_category_ids, '{}'))
  on conflict do nothing;
  get diagnostics v_categories = row_count;

  if p_neighbourhood_ids is not null then
    delete from public.business_service_areas where business_id = p_business_id;
    insert into public.business_service_areas (business_id, neighbourhood_id)
    select p_business_id, n.id from public.neighbourhoods n where n.id = any (p_neighbourhood_ids)
    on conflict do nothing;
  end if;

  if p_district_ids is not null then
    delete from public.business_service_districts where business_id = p_business_id;
    insert into public.business_service_districts (business_id, district_id)
    select p_business_id, d.id from public.districts d where d.id = any (p_district_ids) and d.active
    on conflict do nothing;
    if p_neighbourhood_ids is null then
      delete from public.business_service_areas a
       using public.neighbourhoods n
       where a.business_id = p_business_id and n.id = a.neighbourhood_id
         and not exists (select 1 from public.districts d where d.name = n.district and d.id = any (p_district_ids));
    end if;
  elsif p_neighbourhood_ids is not null then
    delete from public.business_service_districts s
     where s.business_id = p_business_id
       and s.district_id in (select d.id from public.districts d
                              where exists (select 1 from public.neighbourhoods n where n.district = d.name));
    insert into public.business_service_districts (business_id, district_id)
    select distinct p_business_id, d.id
      from public.neighbourhoods n join public.districts d on d.name = n.district
     where n.id = any (p_neighbourhood_ids)
    on conflict do nothing;
  end if;

  select count(*) into v_areas from public.business_service_areas where business_id = p_business_id;
  select count(*) into v_districts from public.business_service_districts where business_id = p_business_id;
  return jsonb_build_object('categories', v_categories, 'areas', v_areas, 'districts', v_districts);
end $function$;
revoke all on function public.set_business_service_scope(uuid, uuid[], uuid[], text[]) from public, anon;
grant execute on function public.set_business_service_scope(uuid, uuid[], uuid[], text[]) to authenticated, service_role;

-- 6) Read RPCs: district fields --------------------------------------------------------------------------------------
-- search_listings: + p_district_id (returns SETOF listings, so district_id is in the rows already).
drop function if exists public.search_listings(text, text, uuid, uuid, numeric, numeric, text, text, jsonb);
create or replace function public.search_listings(p_type text default 'classified'::text, p_q text default null::text,
  p_category_id uuid default null::uuid, p_neighbourhood_id uuid default null::uuid, p_min_price numeric default null::numeric,
  p_max_price numeric default null::numeric, p_work_type text default null::text, p_sort text default 'newest'::text,
  p_attrs jsonb default null::jsonb, p_district_id text default null::text)
 returns setof public.listings
 language sql
 stable
 set search_path to 'public', 'extensions'
as $function$
  with fields as materialized (
    -- Filterable fields of the chosen category with the raw values from p_attrs.
    select e->>'key' as key,
           e->>'type' as type,
           nullif(btrim(p_attrs->>(e->>'key')), '') as val,
           replace(btrim(p_attrs->>((e->>'key') || '_min')), ',', '.') as lo_txt,
           replace(btrim(p_attrs->>((e->>'key') || '_max')), ',', '.') as hi_txt
      from public.listing_categories c
      left join public.listing_categories pc on pc.id = c.parent_id
     cross join lateral jsonb_array_elements(case
         when jsonb_typeof(c.attributes_schema) = 'array' and jsonb_array_length(c.attributes_schema) > 0 then c.attributes_schema
         when jsonb_typeof(pc.attributes_schema) = 'array' then pc.attributes_schema
         else '[]'::jsonb end) e
     where jsonb_typeof(p_attrs) = 'object'
       and c.id = p_category_id
       and e->'filterable' = 'true'::jsonb
       and e->>'type' in ('select', 'number', 'boolean')
       and e->>'key' ~ '^[a-z][a-z0-9_]{0,39}$'
  ),
  eq as materialized (
    select jsonb_object_agg(f.key, case when f.type = 'boolean' then 'true'::jsonb else to_jsonb(f.val) end) as obj
      from fields f
     where (f.type = 'select' and f.val is not null)
        or (f.type = 'boolean' and f.val in ('1', 'true'))
  ),
  rng as materialized (
    select r.key,
           case when r.lo is not null then least(r.lo, r.hi) end as lo,
           case when r.hi is not null then greatest(r.lo, r.hi) end as hi
      from (
        select f.key,
               case when f.lo_txt ~ '^-?\d{1,15}(\.\d{1,6})?$' then f.lo_txt::numeric end as lo,
               case when f.hi_txt ~ '^-?\d{1,15}(\.\d{1,6})?$' then f.hi_txt::numeric end as hi
          from fields f
         where f.type = 'number'
      ) r
     where r.lo is not null or r.hi is not null
  )
  select l.*
    from public.listings l
   where l.status = 'active'
     and l.expires_at > now()
     and (p_type is null or l.type = p_type)
     and (p_category_id is null or l.category_id = p_category_id
          or l.category_id in (select c.id from public.listing_categories c where c.parent_id = p_category_id))
     and (p_neighbourhood_id is null or l.neighbourhood_id = p_neighbourhood_id)
     and (p_district_id is null or l.district_id = p_district_id)
     and (p_min_price is null or l.price_try >= p_min_price)
     and (p_max_price is null or l.price_try <= p_max_price)
     and (p_work_type is null or l.job_work_type = p_work_type)
     and (coalesce(btrim(p_q), '') = ''
          or public.tr_match(l.search_norm, public.tr_norm(p_q))
          or l.search_tsv @@ plainto_tsquery('turkish'::regconfig, public.tr_norm(p_q)))
     and (p_attrs is null or (select eq.obj from eq) is null or l.attributes @> (select eq.obj from eq))
     and (p_attrs is null or not exists (
          -- Number values are stored as typed ("55", "15,6"); a listing without a valid number is outside the range.
          select 1
            from rng r
            cross join lateral (select replace(btrim(l.attributes->>r.key), ',', '.') as t) v
           where not coalesce(
                   -- case: the cast only runs on a valid number (AND has no fixed evaluation order).
                   case when v.t ~ '^-?\d{1,15}(\.\d{1,6})?$'
                        then (r.lo is null or v.t::numeric >= r.lo) and (r.hi is null or v.t::numeric <= r.hi) end,
                   false)))
   order by
     case when p_sort = 'price_asc' then l.price_try end asc nulls last,
     case when p_sort = 'price_desc' then l.price_try end desc nulls last,
     l.published_at desc nulls last,
     l.id
$function$;
revoke all on function public.search_listings(text, text, uuid, uuid, numeric, numeric, text, text, jsonb, text) from public;
grant execute on function public.search_listings(text, text, uuid, uuid, numeric, numeric, text, text, jsonb, text) to anon, authenticated, service_role;

-- nearby_pois / duty_pharmacies_*: district_id and district_name appended (neighbourhood columns stay until phase C).
drop function if exists public.nearby_pois(text, double precision, double precision, integer, integer);
create or replace function public.nearby_pois(p_kind text default null::text, p_lat double precision default null::double precision,
  p_lng double precision default null::double precision, p_radius_m integer default 5000, p_limit integer default 50)
 returns table(id uuid, kind text, name text, slug text, address text, phone text, lat double precision, lng double precision,
               neighbourhood_id uuid, neighbourhood_name text, details jsonb, source text, license text,
               updated_at timestamp with time zone, distance_m double precision, district_id text, district_name text)
 language sql
 stable
 set search_path to 'public', 'extensions'
as $function$
  with pt as (
    select case when p_lat is null or p_lng is null then null
                else extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography end as g
  )
  select p.id, p.kind, p.name, p.slug, p.address, p.phone, p.lat, p.lng, p.neighbourhood_id, n.name,
         p.details, p.source, p.license, p.updated_at,
         case when pt.g is null then null else round(extensions.st_distance(p.location, pt.g)::numeric, 0)::double precision end,
         p.district_id, dd.name
    from public.poi p
    cross join pt
    left join public.neighbourhoods n on n.id = p.neighbourhood_id
    left join public.districts dd on dd.id = p.district_id
   where (p_kind is null or p.kind = p_kind)
     and not p.hidden
     and p.location is not null
     and (pt.g is null or extensions.st_dwithin(p.location, pt.g, greatest(1, least(coalesce(p_radius_m, 5000), 50000))))
   order by case when pt.g is null then null else extensions.st_distance(p.location, pt.g) end nulls last, p.name
   limit greatest(1, least(coalesce(p_limit, 50), 500))
$function$;
revoke all on function public.nearby_pois(text, double precision, double precision, integer, integer) from public;
grant execute on function public.nearby_pois(text, double precision, double precision, integer, integer) to anon, authenticated, service_role;

drop function if exists public.duty_pharmacies_now(double precision, double precision);
create or replace function public.duty_pharmacies_now(p_lat double precision default null::double precision,
  p_lng double precision default null::double precision)
 returns table(duty_id uuid, poi_id uuid, name text, slug text, address text, phone text, lat double precision,
               lng double precision, neighbourhood_id uuid, neighbourhood_name text, duty_start timestamp with time zone,
               duty_end timestamp with time zone, source text, note text, fetched_at timestamp with time zone,
               distance_m double precision, district_id text, district_name text)
 language sql
 stable
 set search_path to 'public', 'extensions'
as $function$
  with pt as (
    select case when p_lat is null or p_lng is null then null
                else extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography end as g
  ),
  mode as (
    select coalesce((select value #>> '{}' from public.app_settings where key = 'duty_data_mode'), 'demo') as m
  )
  select d.id, p.id, p.name, p.slug, p.address, p.phone, p.lat, p.lng, p.neighbourhood_id, n.name,
         d.duty_start, d.duty_end, d.source, d.note, d.fetched_at,
         case when pt.g is null then null else round(extensions.st_distance(p.location, pt.g)::numeric, 0)::double precision end,
         p.district_id, dd.name
    from public.pharmacy_duty d
    join public.poi p on p.id = d.poi_id
    cross join pt
    cross join mode
    left join public.neighbourhoods n on n.id = p.neighbourhood_id
    left join public.districts dd on dd.id = p.district_id
   where now() >= d.duty_start and now() < d.duty_end
     and not p.hidden
     and mode.m <> 'off'
     and (d.source <> 'demo' or mode.m = 'demo')
   order by case when pt.g is null then null else extensions.st_distance(p.location, pt.g) end nulls last, p.name
$function$;
revoke all on function public.duty_pharmacies_now(double precision, double precision) from public;
grant execute on function public.duty_pharmacies_now(double precision, double precision) to anon, authenticated, service_role;

drop function if exists public.duty_pharmacies_for_day(date, double precision, double precision);
create or replace function public.duty_pharmacies_for_day(p_date date, p_lat double precision default null::double precision,
  p_lng double precision default null::double precision)
 returns table(duty_id uuid, poi_id uuid, name text, slug text, address text, phone text, lat double precision,
               lng double precision, neighbourhood_id uuid, neighbourhood_name text, duty_start timestamp with time zone,
               duty_end timestamp with time zone, source text, note text, fetched_at timestamp with time zone,
               distance_m double precision, district_id text, district_name text)
 language sql
 stable
 set search_path to 'public', 'extensions'
as $function$
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
         case when pt.g is null then null else round(extensions.st_distance(p.location, pt.g)::numeric, 0)::double precision end,
         p.district_id, dd.name
    from public.pharmacy_duty d
    join public.poi p on p.id = d.poi_id
    cross join pt
    cross join win
    cross join mode
    left join public.neighbourhoods n on n.id = p.neighbourhood_id
    left join public.districts dd on dd.id = p.district_id
   where d.duty_start < win.e and d.duty_end > win.s
     and d.duty_end > now()
     and not p.hidden
     and mode.m <> 'off'
     and (d.source <> 'demo' or mode.m = 'demo')
   order by case when pt.g is null then null else extensions.st_distance(p.location, pt.g) end nulls last, p.name
$function$;
revoke all on function public.duty_pharmacies_for_day(date, double precision, double precision) from public;
grant execute on function public.duty_pharmacies_for_day(date, double precision, double precision) to anon, authenticated, service_role;

-- popular_places: district_id and district_name appended.
drop function if exists public.popular_places(integer);
create or replace function public.popular_places(p_limit integer default 10)
 returns table(kind text, id uuid, slug text, name text, category text, label text, image_url text, neighbourhood_name text,
               district_id text, district_name text)
 language sql
 stable security definer
 set search_path to ''
as $function$
  with lim as (select greatest(1, least(coalesce(p_limit, 10), 20)) as n),
  recent as (
    select v.path, v.user_id, coalesce(v.session_id::text, v.id::text) as sess
      from public.analytics_page_views v
     where v.created_at > now() - interval '30 days'
       and v.path ~ '^/(firma|gezilecek-yerler)/[a-z0-9-]+$'
  ),
  biz_views as (
    select b.id, count(distinct r.sess) as n
      from recent r
      join public.businesses b on r.path = '/firma/' || b.slug
     where r.user_id is distinct from b.owner_id
     group by b.id
  ),
  place_views as (
    select p.id, count(distinct r.sess) as n
      from recent r
      join public.poi p on p.kind = 'place' and r.path = '/gezilecek-yerler/' || p.slug
     group by p.id
  ),
  cand as (
    select 'business'::text as kind, b.id, b.slug, b.name, b.vertical as category, b.category_label as label,
           coalesce(b.cover_url, b.logo_url) as image_url, n.name as neighbourhood_name,
           b.district_id, dd.name as district_name,
           coalesce(bv.n, 0) as views,
           row_number() over (order by (b.cover_url is null), b.is_demo, b.verification_level desc,
                                       b.rating_count desc, b.rating_avg desc nulls last, b.name) as fb
      from public.businesses b
      left join biz_views bv on bv.id = b.id
      left join public.neighbourhoods n on n.id = b.neighbourhood_id
      left join public.districts dd on dd.id = b.district_id
     where b.status = 'approved' and not private.is_banned(b.owner_id)
    union all
    select 'place'::text, p.id, p.slug, p.name, p.details ->> 'category', null::text,
           p.details #>> '{photos,0,url}', n.name,
           p.district_id, dd.name,
           coalesce(pv.n, 0),
           -- coalesce: a place without the key would compare as null and sort first in "desc".
           row_number() over (order by coalesce((p.details -> 'curated') = 'true'::jsonb, false) desc,
                                       (p.details #>> '{photos,0,url}') is null, p.name)
      from public.poi p
      left join place_views pv on pv.id = p.id
      left join public.neighbourhoods n on n.id = p.neighbourhood_id
      left join public.districts dd on dd.id = p.district_id
     where p.kind = 'place' and not p.hidden
  )
  select c.kind, c.id, c.slug, c.name, c.category, c.label, c.image_url, c.neighbourhood_name, c.district_id, c.district_name
    from cand c
   order by case when c.views >= 2 then c.views else 0 end desc, c.fb, c.kind desc
   limit (select n from lim)
$function$;
revoke all on function public.popular_places(integer) from public;
grant execute on function public.popular_places(integer) to anon, authenticated, service_role;

-- global_search returns jsonb: district_id / district_name added next to neighbourhood_name.
create or replace function public.global_search(p_q text, p_limit integer default 5)
 returns jsonb
 language sql
 stable
 set search_path to 'public', 'extensions'
as $function$
  with q as (select public.tr_norm(p_q) as q, greatest(1, least(coalesce(p_limit, 5), 20)) as lim)
  select case when char_length((select q from q)) < 2 then
    jsonb_build_object('listings', '[]'::jsonb, 'businesses', '[]'::jsonb, 'services', '[]'::jsonb, 'pois', '[]'::jsonb,
                       'events', '[]'::jsonb, 'articles', '[]'::jsonb)
  else jsonb_build_object(
    'listings', coalesce((
      select jsonb_agg(x) from (
        select l.id, l.type, l.title, l.price_try, l.published_at, l.job_location_label,
               c.name as category_name, n.name as neighbourhood_name,
               (select m.thumb_url from public.listing_media m where m.listing_id = l.id order by m.sort limit 1) as thumb_url,
               l.district_id, dd.name as district_name
          from public.listings l
          left join public.listing_categories c on c.id = l.category_id
          left join public.neighbourhoods n on n.id = l.neighbourhood_id
          left join public.districts dd on dd.id = l.district_id, q
         where l.status = 'active' and l.expires_at > now()
           and (public.tr_match(l.search_norm, q.q) or l.search_tsv @@ plainto_tsquery('turkish'::regconfig, q.q))
         order by extensions.similarity(l.search_norm, q.q) desc, l.published_at desc
         limit (select lim from q)) x), '[]'::jsonb),
    'businesses', coalesce((
      select jsonb_agg(x) from (
        select b.id, b.slug, b.name, b.category_label, b.logo_url, b.rating_avg, b.rating_count, b.verification_level, b.kinds,
               n.name as neighbourhood_name,
               (b.vacation_mode and (b.vacation_until is null or b.vacation_until > now())) as vacation_mode, b.vacation_until,
               b.district_id, dd.name as district_name
          from public.businesses b
          left join public.neighbourhoods n on n.id = b.neighbourhood_id
          left join public.districts dd on dd.id = b.district_id, q
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
               p.details ->> 'category' as category,
               p.district_id, dd.name as district_name
          from public.poi p
          left join public.neighbourhoods n on n.id = p.neighbourhood_id
          left join public.districts dd on dd.id = p.district_id, q
         where p.kind in ('place', 'pharmacy', 'mosque', 'bus_stop', 'taxi', 'atm') and not p.hidden
           and public.tr_match(p.search_norm, q.q)
         order by (p.kind = 'place') desc, (p.kind in ('bus_stop', 'taxi', 'atm')),
                  extensions.similarity(p.search_norm, q.q) desc, p.name
         limit (select lim from q)) x), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(x) from (
        select e.id, e.slug, e.title, e.category, e.starts_at, e.ends_at, e.venue_name, e.cover_url, e.is_demo,
               n.name as neighbourhood_name,
               e.district_id, dd.name as district_name
          from public.events e
          cross join q
          cross join lateral (
            select public.tr_norm(e.title || ' ' || coalesce(e.venue_name, '') || ' ' || e.category) as norm) t
          left join public.neighbourhoods n on n.id = e.neighbourhood_id
          left join public.districts dd on dd.id = e.district_id
         where e.status = 'published' and e.slug is not null
           and (e.ends_at >= now() or (e.ends_at is null and e.starts_at >= now() - interval '3 hours'))
           and (e.business_id is null or public.business_is_public(e.business_id))
           and public.tr_match(t.norm, q.q)
         order by extensions.similarity(t.norm, q.q) desc, e.starts_at
         limit (select lim from q)) x), '[]'::jsonb),
    'articles', coalesce((
      select jsonb_agg(x) from (
        select a.id, a.slug, a.title, a.summary, a.category, a.cover_url, a.published_at
          from public.news_articles a
          cross join q
          cross join lateral (select public.tr_norm(a.title || ' ' || coalesce(a.summary, '')) as norm) t
         where a.status = 'published' and a.published_at is not null and a.published_at <= now()
           and public.tr_match(t.norm, q.q)
         order by extensions.similarity(t.norm, q.q) desc, a.published_at desc
         limit (select lim from q)) x), '[]'::jsonb)
  ) end
$function$;

-- Lead detail / customer request: a 'district' object next to 'neighbourhood' (kept until the code switches over).
create or replace function public.get_lead_detail(p_lead_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_l public.leads;
  v_b public.businesses;
  v_r public.service_requests;
  v_cat public.service_categories;
  v_parent public.service_categories;
  v_nb public.neighbourhoods;
  v_schema jsonb;
  v_cust public.profiles;
  v_acc boolean;
  v_dist public.districts;
begin
  select * into v_l from public.leads where id = p_lead_id;
  if not found then
    return null;
  end if;
  select * into v_b from public.businesses where id = v_l.business_id;
  if v_b.owner_id is distinct from auth.uid() and not public.is_admin() then
    return null;
  end if;
  select * into v_r from public.service_requests where id = v_l.request_id;
  select * into v_cat from public.service_categories where id = v_r.category_id;
  select * into v_parent from public.service_categories where id = v_cat.parent_id;
  select * into v_nb from public.neighbourhoods where id = v_r.neighbourhood_id;
  select * into v_dist from public.districts where id = v_r.district_id;
  select schema into v_schema from public.question_flows where id = v_r.flow_id;
  select * into v_cust from public.profiles where id = v_r.customer_id;

  if v_l.status = 'sent' and v_b.owner_id = auth.uid() then
    update public.leads set status = 'seen', seen_at = now() where id = v_l.id returning * into v_l;
  end if;
  v_acc := v_l.status = 'accepted';

  return jsonb_build_object(
    'lead', jsonb_build_object(
      'id', v_l.id, 'business_id', v_l.business_id, 'status', v_l.status,
      'offer_price_try', v_l.offer_price_try, 'offer_note', v_l.offer_note,
      'wave_no', v_l.wave_no, 'seen_at', v_l.seen_at, 'accepted_at', v_l.accepted_at, 'created_at', v_l.created_at),
    'request', jsonb_build_object(
      'id', v_r.id,
      'status', v_r.status,
      'category', jsonb_build_object('id', v_cat.id, 'name', v_cat.name, 'slug', v_cat.slug, 'icon', v_cat.icon,
                                     'parent_name', v_parent.name),
      'neighbourhood', case when v_nb.id is null then null else
                         jsonb_build_object('id', v_nb.id, 'name', v_nb.name, 'district', v_nb.district,
                                            'lat', v_nb.lat, 'lng', v_nb.lng) end,
      'district', case when v_dist.id is null then null else
                    jsonb_build_object('id', v_dist.id, 'name', v_dist.name, 'lat', v_dist.lat, 'lng', v_dist.lng) end,
      'when_type', v_r.when_type,
      'when_date', v_r.when_date,
      'note', v_r.note,
      'photos', to_jsonb(v_r.photos),
      'answers', private.resolve_answers(v_schema, v_r.answers),
      'accepted_count', v_r.accepted_count,
      'max_providers', v_r.max_providers,
      'address_note', case when v_acc then v_r.address_note end,
      'created_at', v_r.created_at),
    'customer', jsonb_build_object(
      'display_name', case when v_acc then coalesce(v_cust.full_name, public.short_name(v_cust.full_name))
                           else public.short_name(v_cust.full_name) end,
      'phone', case when v_acc and not v_r.hide_phone then v_cust.phone end,
      'hide_phone', v_r.hide_phone),
    'can_accept', v_l.status in ('sent', 'seen') and v_r.status = 'open' and v_r.accepted_count < v_r.max_providers
  );
end $function$;

create or replace function public.get_request_for_customer(p_code text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_r public.service_requests;
  v_cat public.service_categories;
  v_parent public.service_categories;
  v_schema jsonb;
  v_nb public.neighbourhoods;
  v_review public.reviews;
  v_dist public.districts;
begin
  select * into v_r from public.service_requests where public_code = upper(btrim(p_code));
  if not found or (v_r.customer_id is distinct from auth.uid() and not public.is_admin()) then
    return null;
  end if;
  select * into v_cat from public.service_categories where id = v_r.category_id;
  select * into v_parent from public.service_categories where id = v_cat.parent_id;
  select schema into v_schema from public.question_flows where id = v_r.flow_id;
  select * into v_nb from public.neighbourhoods where id = v_r.neighbourhood_id;
  select * into v_dist from public.districts where id = v_r.district_id;
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
      'district', case when v_dist.id is null then null else jsonb_build_object('id', v_dist.id, 'name', v_dist.name) end,
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
                 'verification_level', b.verification_level,
                 -- A banned owner's firm stays listed, but cannot be called.
                 'phone', case when private.is_banned(b.owner_id) then null else b.phone end,
                 'category_label', b.category_label))
             order by l.accepted_at)
        from public.leads l
        join public.businesses b on b.id = l.business_id
       where l.request_id = v_r.id and l.status = 'accepted'), '[]'::jsonb),
    'review', case when v_review.id is null then null else
                jsonb_build_object('id', v_review.id, 'rating', v_review.rating, 'comment', v_review.comment,
                                   'reply', v_review.reply, 'created_at', v_review.created_at) end
  );
end $function$;

-- my_leads: district_id and district_name appended (same leading columns, same grants and owner rights).
create or replace view public.my_leads with (security_invoker = false) as
 select l.id,
    l.request_id,
    l.business_id,
    l.status,
    l.offer_price_try,
    l.offer_note,
    l.wave_no,
    l.seen_at,
    l.accepted_at,
    l.created_at,
    r.status as request_status,
    r.when_type,
    r.when_date,
    r.accepted_count,
    r.max_providers,
    r.created_at as request_created_at,
    r.category_id,
    sc.name as category_name,
    sc.slug as category_slug,
    sc.icon as category_icon,
    r.neighbourhood_id,
    n.name as neighbourhood_name,
    coalesce(array_length(r.photos, 1), 0) as photo_count,
    r.note is not null and r.note <> ''::text as has_note,
    r.district_id,
    dd.name as district_name
   from public.leads l
     join public.businesses b on b.id = l.business_id
     join public.service_requests r on r.id = l.request_id
     left join public.service_categories sc on sc.id = r.category_id
     left join public.neighbourhoods n on n.id = r.neighbourhood_id
     left join public.districts dd on dd.id = r.district_id
  where b.owner_id = auth.uid() or public.is_admin();

-- 7) Demo duty stays in Gebze -----------------------------------------------------------------------------------------
-- The duty screens cannot filter by district yet: once the other districts' pharmacies are imported, demo duty rows
-- are still only drawn from Gebze pharmacies (6 sectors around the Gebze centre, as before).
create or replace function public.roll_demo_duty()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
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
             where poi.kind = 'pharmacy' and not poi.hidden and poi.district_id = 'gebze'
          ) p
      ) x
     where x.rn = 1
    on conflict (poi_id, duty_start) do nothing;
    get diagnostics v_k = row_count;
    v_n := v_n + v_k;
  end loop;
  return v_n;
end $function$;

-- A re-run after seed-districts.mjs also re-checks the pins (no-op until the polygons are loaded).
select private.district_reassign_pinned();

notify pgrst, 'reload schema';
