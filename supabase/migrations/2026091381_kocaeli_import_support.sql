-- Kocaeli open-data import support (phase A: database + data). Used by scripts/db/import-kocaeli.mjs, which imports the
-- Kocaeli Büyükşehir Belediyesi open data (kocaeli/*.json and the toplu-ulasim GTFS bundle) into public.poi with
-- district_id. ADDITIVE and backward compatible: no column, view or RPC signature changes; the deployed app keeps working.
--
--  1) Place categories for the KBB files: otopark (ücretsiz otoparklar), toplanma_alani (AFAD acil toplanma alanları),
--     kocaelikart (KocaeliKart dolum noktaları); subkind plaj under sahil. The institution categories exist already.
--  2) public.transit_routes (GTFS routes.txt + agency.txt) and public.transit_route_stops (route -> stop links). The
--     bundle has no stop_times.txt, so no timetables: the links are geometric (the stop lies within 25 m of one of the
--     route's shapes) and flagged method = 'geometric'. Public read, SELECT-only grants, written by private.transit_import.
--  3) private.kocaeli_poi_import: the importer's write path (rows it created are refreshed; every other stored row only
--     gets what it misses plus details.kbb_ref). Index on details->>'kbb_ref'.
--  4) public.poi_sync_apply (monthly cron gebzem-poi-sync, the admin sync button, the seed scripts), same signature and
--     grants: the kinds now imported from KBB open data for the whole province (pharmacy, mosque, taxi, fuel, bus_stop)
--     are skipped - neither written nor hidden - and a KBB group is never complete (the Gebze-only pull must not hide the
--     other districts' rows); the Gebze box becomes Kocaeli (district polygons, 3 km tolerance, like
--     district_for_point); the nearest-mahalle fallback only applies inside Gebze.
-- Re-runnable.

-- 1) Place categories ------------------------------------------------------------------------------------------------
insert into public.place_categories (key, label, icon, sort, active) values
  ('otopark', 'Otopark', 'car', 54, true),
  ('toplanma_alani', 'Acil toplanma alanı', 'tent', 56, true),
  ('kocaelikart', 'KocaeliKart dolum noktası', 'credit-card', 58, true)
on conflict (key) do nothing;

update public.place_categories
   set subkinds = subkinds || '[{"key": "plaj", "label": "Plaj"}]'::jsonb
 where key = 'sahil' and not subkinds @> '[{"key": "plaj"}]'::jsonb;

-- 2) Public transport --------------------------------------------------------------------------------------------------
create table if not exists public.transit_routes (
  route_id text primary key check (route_id ~ '^[A-Za-z0-9_.:-]{1,40}$'),
  agency_id text check (agency_id is null or char_length(agency_id) <= 40),
  agency_name text check (agency_name is null or char_length(agency_name) <= 200),
  short_name text not null check (char_length(btrim(short_name)) between 1 and 40),
  long_name text check (long_name is null or char_length(long_name) <= 300),
  route_type smallint not null default 3 check (route_type between 0 and 1702),
  description text check (description is null or char_length(description) <= 200),
  color text check (color is null or color ~ '^[0-9A-F]{6}$'),
  text_color text check (text_color is null or text_color ~ '^[0-9A-F]{6}$'),
  source text not null default 'kbb_gtfs' check (source in ('kbb_gtfs', 'manual')),
  license text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.transit_routes is
  'Public transport lines of Kocaeli (KBB GTFS routes.txt + agency.txt; scripts/db/import-kocaeli.mjs). route_type = GTFS (0 tram, 3 bus, 4 ferry, 6/7 cable car); color / text_color = hex without #. No timetables: the bundle has no stop_times.txt.';
create index if not exists transit_routes_short_name_idx on public.transit_routes (short_name);
drop trigger if exists set_updated_at on public.transit_routes;
create trigger set_updated_at before update on public.transit_routes for each row execute function private.set_updated_at();

create table if not exists public.transit_route_stops (
  route_id text not null references public.transit_routes(route_id) on update cascade on delete cascade,
  stop_id text not null check (stop_id ~ '^[A-Za-z0-9_.:-]{1,40}$'),
  poi_id uuid references public.poi(id) on delete set null,
  method text not null default 'geometric' check (method in ('geometric', 'timetable')),
  distance_m real check (distance_m is null or distance_m >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (route_id, stop_id)
);
comment on table public.transit_route_stops is
  'Route -> stop links. method geometric = the stop lies within 25 m of one of the route''s shapes (the line passes by; not proof that it stops there), timetable = from stop_times (none yet). stop_id = GTFS stop_id; poi_id = the stop''s public.poi row (source_ref or details.kbb_ref = durak:<stop_id>).';
create index if not exists transit_route_stops_stop_idx on public.transit_route_stops (stop_id);
create index if not exists transit_route_stops_poi_idx on public.transit_route_stops (poi_id);

alter table public.transit_routes enable row level security;
drop policy if exists "public read" on public.transit_routes;
create policy "public read" on public.transit_routes for select to anon, authenticated using (true);
drop policy if exists "admin write" on public.transit_routes;
create policy "admin write" on public.transit_routes for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on table public.transit_routes from anon, authenticated;
grant select on table public.transit_routes to anon, authenticated;

alter table public.transit_route_stops enable row level security;
drop policy if exists "public read" on public.transit_route_stops;
create policy "public read" on public.transit_route_stops for select to anon, authenticated using (true);
drop policy if exists "admin write" on public.transit_route_stops;
create policy "admin write" on public.transit_route_stops for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on table public.transit_route_stops from anon, authenticated;
grant select on table public.transit_route_stops to anon, authenticated;

-- 3) The importer's write path ------------------------------------------------------------------------------------------
-- Rows merged with a KBB record carry its key (import-kocaeli.mjs finds them again by it).
create index if not exists poi_kbb_ref_idx on public.poi ((details ->> 'kbb_ref')) where details ? 'kbb_ref';

-- p_rows: [{ref, match: key|link|merge|new, target (uuid of the stored row; not for new), rename (optional: the stored
-- name is only a placeholder such as "Otobüs Durağı"), kind, name, slug (new only), address, phone, email, website, lng,
-- lat (WGS84), district, details, license}]. New rows: source 'kbb', source_ref = ref, details.import =
-- 'kocaeli-acik-veri' + details.kbb_ref. Stored rows: those the importer created (details.import) are refreshed from the
-- file; any other row only gets what it misses (address, phone, e-mail, website, pin, district, details keys; a 'diger' /
-- 'diger_kamu' category is replaced; the name only with rename) plus details.kbb_ref. Locked rows keep their fields
-- (poi_before_write). Never deletes, never hides (a row a sync hid is shown again, as poi_sync_apply does).
-- p_dry_run: everything is written and rolled back, the counts stay.
create or replace function private.kocaeli_poi_import(p_rows jsonb, p_dry_run boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_rows jsonb := coalesce(p_rows, '[]'::jsonb);
  v_dry boolean := coalesce(p_dry_run, false);
  v_bad int;
  v_upd jsonb := '{}'::jsonb;
  v_ins jsonb := '{}'::jsonb;
  v_kinds jsonb := '{}'::jsonb;
  v_totals jsonb;
begin
  if jsonb_typeof(v_rows) <> 'array' then
    raise exception 'kocaeli_poi_import: p_rows must be an array' using errcode = '22023';
  end if;
  select count(*) into v_bad
    from jsonb_array_elements(v_rows) as t(e)
   where jsonb_typeof(e) <> 'object'
      or coalesce(e ->> 'kind', '') not in ('pharmacy', 'mosque', 'bus_stop', 'place', 'taxi', 'institution', 'fuel')
      or coalesce(btrim(e ->> 'name'), '') = '' or char_length(e ->> 'name') > 200
      or coalesce(e ->> 'ref', '') !~ '^[a-z][a-z0-9-]{1,30}:[A-Za-z0-9_.-]{1,60}$'
      or coalesce(e ->> 'match', '') not in ('key', 'link', 'merge', 'new')
      or ((e ->> 'match') = 'new') <> ((e ->> 'target') is null)
      or ((e ->> 'target') is not null and (e ->> 'target') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
      or ((e ->> 'target') is null and coalesce(e ->> 'slug', '') !~ '^[a-z0-9]+(-[a-z0-9]+)*$')
      or char_length(coalesce(e ->> 'slug', '')) > 200
      or jsonb_typeof(e -> 'lng') is distinct from 'number' or jsonb_typeof(e -> 'lat') is distinct from 'number'
      or not exists (select 1 from public.districts d where d.id = e ->> 'district')
      or jsonb_typeof(coalesce(nullif(e -> 'details', 'null'::jsonb), '{}'::jsonb)) <> 'object'
      or char_length(coalesce(e ->> 'address', '')) > 300
      or (e ? 'rename' and jsonb_typeof(e -> 'rename') <> 'boolean')
      or ((e ->> 'email') is not null and (e ->> 'email') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
      or ((e ->> 'website') is not null and (e ->> 'website') !~* '^https?://[^[:space:]]+$');
  if v_bad > 0 then
    raise exception 'kocaeli_poi_import: % invalid row(s)', v_bad using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(v_rows) as t(e) group by e ->> 'ref' having count(*) > 1)
     or exists (select 1 from jsonb_array_elements(v_rows) as t(e) where (e ->> 'target') is not null
                 group by e ->> 'target' having count(*) > 1) then
    raise exception 'kocaeli_poi_import: duplicate ref or target in p_rows' using errcode = '22023';
  end if;
  select count(*) into v_bad
    from jsonb_array_elements(v_rows) as t(e)
   where (e ->> 'target') is not null
     and not exists (select 1 from public.poi q where q.id = (e ->> 'target')::uuid and q.kind = e ->> 'kind');
  if v_bad > 0 then
    raise exception 'kocaeli_poi_import: % stored row(s) gone or of another kind - plan again', v_bad using errcode = '22023';
  end if;
  select count(*) into v_bad
    from jsonb_array_elements(v_rows) as t(e)
   where private.district_of(extensions.st_setsrid(extensions.st_makepoint((e ->> 'lng')::float8, (e ->> 'lat')::float8), 4326)) is null;
  if v_bad > 0 then
    raise exception 'kocaeli_poi_import: % row(s) outside Kocaeli', v_bad using errcode = '22023';
  end if;

  -- Never at the same time as a POI sync.
  perform pg_advisory_xact_lock(hashtext('gebzem:poi_sync'));

  begin
    -- 1) Stored rows (key / link / merge).
    with s as (
      select (e ->> 'target')::uuid as id, e ->> 'kind' as kind, e ->> 'ref' as ref, btrim(e ->> 'name') as name,
             coalesce((e -> 'rename') = 'true'::jsonb, false) as rename,
             nullif(btrim(e ->> 'address'), '') as address, nullif(btrim(e ->> 'phone'), '') as phone,
             nullif(btrim(e ->> 'email'), '') as email, nullif(btrim(e ->> 'website'), '') as website,
             extensions.st_setsrid(extensions.st_makepoint((e ->> 'lng')::float8, (e ->> 'lat')::float8), 4326) as g,
             e ->> 'district' as district,
             coalesce(nullif(e -> 'details', 'null'::jsonb), '{}'::jsonb) - 'import' - 'kbb_ref' - 'photos' as details,
             nullif(e ->> 'license', '') as license
        from jsonb_array_elements(v_rows) as t(e)
       where (e ->> 'target') is not null
    ),
    pre as (
      select q.id, q.updated_at,
             coalesce(q.details ->> 'import' = 'kocaeli-acik-veri', false) as own,
             (q.source = 'kbb' and q.source_ref = s.ref) as keyed
        from public.poi q
        join s on s.id = q.id
    ),
    up as (
      update public.poi q set
        name = case when pre.own or s.rename then s.name else q.name end,
        address = case when pre.own then coalesce(s.address, q.address) else coalesce(q.address, s.address) end,
        phone = case when pre.own then coalesce(s.phone, q.phone) else coalesce(q.phone, s.phone) end,
        email = case when pre.own then coalesce(s.email, q.email) else coalesce(q.email, s.email) end,
        website = case when pre.own then coalesce(s.website, q.website) else coalesce(q.website, s.website) end,
        location = case when pre.own or q.location is null then s.g::extensions.geography else q.location end,
        district_id = case when pre.own then s.district else coalesce(q.district_id, s.district) end,
        -- Legacy (the current app): a Gebze mahalle polygon only, and only on a row whose district is Gebze (a KBB record
        -- can name a neighbouring district for a point just inside Gebze; its mahalle would then contradict it).
        neighbourhood_id = case
          when pre.own then case when s.district = 'gebze' then
                              (select b.neighbourhood_id from private.neighbourhood_boundaries b
                                where extensions.st_contains(b.boundary, s.g) limit 1) end
          when q.location is null then case when coalesce(q.district_id, s.district) = 'gebze' and private.district_of(s.g) = 'gebze' then
                                         coalesce((select b.neighbourhood_id from private.neighbourhood_boundaries b
                                                    where extensions.st_contains(b.boundary, s.g) limit 1), q.neighbourhood_id) end
          else q.neighbourhood_id end,
        details = case
          when pre.own then q.details || s.details
          else s.details
               || coalesce((select jsonb_object_agg(x.key, x.value)
                              from jsonb_each(case when jsonb_typeof(q.details) = 'object' then q.details else '{}'::jsonb end) x
                             where x.value not in ('[]'::jsonb, '""'::jsonb, 'null'::jsonb, '{}'::jsonb)), '{}'::jsonb)
               -- 'diger' / 'diger_kamu' are the uncategorized fallbacks: the KBB category replaces them.
               || case when s.details ? 'category' and coalesce(q.details ->> 'category', 'diger') in ('diger', 'diger_kamu')
                       then jsonb_build_object('category', s.details -> 'category') else '{}'::jsonb end
          end
          || case when pre.keyed then '{}'::jsonb else jsonb_build_object('kbb_ref', s.ref) end,
        license = case when pre.own then coalesce(s.license, q.license) else coalesce(q.license, s.license) end,
        last_seen_at = now(),
        hidden = case when q.missing_since is not null then false else q.hidden end
      from s
      join pre on pre.id = s.id
      where q.id = s.id and q.kind = s.kind
      returning q.id, q.kind, q.updated_at
    )
    select coalesce(jsonb_object_agg(x.kind, x.st), '{}'::jsonb) into v_upd
      from (select up.kind,
                   jsonb_build_object('rows', count(*),
                     'updated', count(*) filter (where up.updated_at is distinct from pre.updated_at),
                     'unchanged', count(*) filter (where up.updated_at is not distinct from pre.updated_at)) as st
              from up
              join pre on pre.id = up.id
             group by up.kind) x;

    -- 2) New rows. Stored meanwhile (a retried chunk, a stale plan): they only get what they miss.
    with s as (
      select e ->> 'kind' as kind, e ->> 'ref' as ref, btrim(e ->> 'name') as name, e ->> 'slug' as slug,
             nullif(btrim(e ->> 'address'), '') as address, nullif(btrim(e ->> 'phone'), '') as phone,
             nullif(btrim(e ->> 'email'), '') as email, nullif(btrim(e ->> 'website'), '') as website,
             extensions.st_setsrid(extensions.st_makepoint((e ->> 'lng')::float8, (e ->> 'lat')::float8), 4326) as g,
             e ->> 'district' as district,
             (coalesce(nullif(e -> 'details', 'null'::jsonb), '{}'::jsonb) - 'photos')
               || jsonb_build_object('import', 'kocaeli-acik-veri', 'kbb_ref', e ->> 'ref') as details,
             coalesce(nullif(e ->> 'license', ''), 'CC BY 4.0 - Kocaeli Büyükşehir Belediyesi Açık Veri') as license,
             t.ord
        from jsonb_array_elements(v_rows) with ordinality as t(e, ord)
       where (e ->> 'target') is null
    ),
    pre as (
      select q.id, q.source_ref, q.updated_at
        from public.poi q
        join s on q.source = 'kbb' and q.source_ref = s.ref
    ),
    v as (
      select s.*,
             -- A taken slug gets a stable suffix (as in poi_sync_apply).
             case when pre.id is null
                       and (exists (select 1 from public.poi q where q.slug = s.slug)
                            or row_number() over (partition by s.slug order by s.ord) > 1)
                  then left(s.slug, 180) || '-' || left(md5('kbb:' || s.ref), 6)
                  else s.slug end as slug_final
        from s
        left join pre on pre.source_ref = s.ref
    ),
    up as (
      insert into public.poi as q (kind, name, slug, address, phone, email, website, location, district_id, neighbourhood_id,
                                   details, source, source_ref, license, last_seen_at)
      select v.kind, v.name, v.slug_final, v.address, v.phone, v.email, v.website, v.g::extensions.geography, v.district,
             case when v.district = 'gebze' then
               (select b.neighbourhood_id from private.neighbourhood_boundaries b where extensions.st_contains(b.boundary, v.g) limit 1) end,
             v.details, 'kbb', v.ref, v.license, now()
        from v
      on conflict (source, source_ref) do update set
        address = coalesce(q.address, excluded.address),
        phone = coalesce(q.phone, excluded.phone),
        email = coalesce(q.email, excluded.email),
        website = coalesce(q.website, excluded.website),
        district_id = coalesce(q.district_id, excluded.district_id),
        details = excluded.details || q.details,
        last_seen_at = excluded.last_seen_at
      returning q.id, q.kind, (xmax = 0) as inserted, q.updated_at
    )
    select coalesce(jsonb_object_agg(x.kind, x.st), '{}'::jsonb) into v_ins
      from (select up.kind,
                   jsonb_build_object('rows', count(*),
                     'added', count(*) filter (where up.inserted),
                     'updated', count(*) filter (where not up.inserted and up.updated_at is distinct from pre.updated_at),
                     'unchanged', count(*) filter (where not up.inserted and up.updated_at is not distinct from pre.updated_at)) as st
              from up
              left join pre on pre.id = up.id
             group by up.kind) x;

    select coalesce(jsonb_object_agg(k.kind, jsonb_build_object(
             'fetched', coalesce((v_upd -> k.kind ->> 'rows')::int, 0) + coalesce((v_ins -> k.kind ->> 'rows')::int, 0),
             'added', coalesce((v_ins -> k.kind ->> 'added')::int, 0),
             'updated', coalesce((v_upd -> k.kind ->> 'updated')::int, 0) + coalesce((v_ins -> k.kind ->> 'updated')::int, 0),
             'unchanged', coalesce((v_upd -> k.kind ->> 'unchanged')::int, 0) + coalesce((v_ins -> k.kind ->> 'unchanged')::int, 0),
             'matched', coalesce((v_upd -> k.kind ->> 'rows')::int, 0))), '{}'::jsonb)
      into v_kinds
      from (select jsonb_object_keys(v_upd) as kind union select jsonb_object_keys(v_ins)) k;

    if v_dry then
      raise exception using errcode = 'GZDRY', message = 'kocaeli_poi_import dry run';
    end if;
  exception when sqlstate 'GZDRY' then
    null; -- dry run: every write above is rolled back, the counts stay
  end;

  select jsonb_build_object(
           'fetched', coalesce(sum((x.value ->> 'fetched')::int), 0),
           'added', coalesce(sum((x.value ->> 'added')::int), 0),
           'updated', coalesce(sum((x.value ->> 'updated')::int), 0),
           'unchanged', coalesce(sum((x.value ->> 'unchanged')::int), 0),
           'matched', coalesce(sum((x.value ->> 'matched')::int), 0))
    into v_totals
    from jsonb_each(v_kinds) x;
  return jsonb_build_object('dry_run', v_dry, 'kinds', v_kinds, 'totals', v_totals);
end $$;
revoke all on function private.kocaeli_poi_import(jsonb, boolean) from public, anon, authenticated;

-- p_routes: [{route_id, agency_id, agency_name, short_name, long_name, route_type, description, color, text_color}] (GTFS
-- lines; manual rows are never overwritten). p_links: [{route_id, stop_id, distance_m}] geometric links; the stop's POI
-- is found by its key durak:<stop_id> (source_ref, or details.kbb_ref of a stored stop it was merged into). Upsert only.
create or replace function private.transit_import(p_routes jsonb, p_links jsonb default '[]'::jsonb, p_dry_run boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_routes jsonb := coalesce(p_routes, '[]'::jsonb);
  v_links jsonb := coalesce(p_links, '[]'::jsonb);
  v_dry boolean := coalesce(p_dry_run, false);
  v_r_added int := 0;
  v_r_updated int := 0;
  v_l_added int := 0;
  v_l_updated int := 0;
  v_l_poi int := 0;
  v_l_no_route int := 0;
begin
  if jsonb_typeof(v_routes) <> 'array' or jsonb_typeof(v_links) <> 'array' then
    raise exception 'transit_import: p_routes and p_links must be arrays' using errcode = '22023';
  end if;

  begin
    with s as (
      select x.* from jsonb_to_recordset(v_routes) as x(route_id text, agency_id text, agency_name text, short_name text,
                                                       long_name text, route_type int, description text, color text, text_color text)
    ),
    up as (
      insert into public.transit_routes as t (route_id, agency_id, agency_name, short_name, long_name, route_type, description,
                                              color, text_color, source, license)
      select s.route_id, nullif(btrim(s.agency_id), ''), nullif(btrim(s.agency_name), ''), btrim(s.short_name),
             nullif(btrim(s.long_name), ''), coalesce(s.route_type, 3), nullif(btrim(s.description), ''),
             upper(nullif(btrim(s.color), '')), upper(nullif(btrim(s.text_color), '')), 'kbb_gtfs',
             'CC BY 4.0 - Kocaeli Büyükşehir Belediyesi Açık Veri'
        from s
      on conflict (route_id) do update set
        agency_id = excluded.agency_id, agency_name = excluded.agency_name, short_name = excluded.short_name,
        long_name = excluded.long_name, route_type = excluded.route_type, description = excluded.description,
        color = excluded.color, text_color = excluded.text_color, license = excluded.license
      where t.source = 'kbb_gtfs'
        and (t.agency_id, t.agency_name, t.short_name, t.long_name, t.route_type, t.description, t.color, t.text_color, t.license)
            is distinct from
            (excluded.agency_id, excluded.agency_name, excluded.short_name, excluded.long_name, excluded.route_type,
             excluded.description, excluded.color, excluded.text_color, excluded.license)
      returning (xmax = 0) as inserted
    )
    select count(*) filter (where inserted), count(*) filter (where not inserted) into v_r_added, v_r_updated from up;

    select count(*) into v_l_no_route
      from jsonb_to_recordset(v_links) as x(route_id text)
     where not exists (select 1 from public.transit_routes r where r.route_id = x.route_id);

    with s as (
      select distinct on (x.route_id, x.stop_id) x.route_id, x.stop_id, x.distance_m
        from jsonb_to_recordset(v_links) as x(route_id text, stop_id text, distance_m real)
       where exists (select 1 from public.transit_routes r where r.route_id = x.route_id)
       order by x.route_id, x.stop_id, x.distance_m
    ),
    m as (
      select distinct on (z.ref) z.ref, z.id
        from (select case when q.source = 'kbb' and q.source_ref like 'durak:%' then q.source_ref else q.details ->> 'kbb_ref' end as ref,
                     q.id, q.source = 'kbb' as own
                from public.poi q
               where q.kind = 'bus_stop'
                 and ((q.source = 'kbb' and q.source_ref like 'durak:%') or q.details ->> 'kbb_ref' like 'durak:%')) z
       where z.ref is not null
       order by z.ref, z.own desc
    ),
    up as (
      insert into public.transit_route_stops as t (route_id, stop_id, poi_id, method, distance_m)
      select s.route_id, s.stop_id, m.id, 'geometric', s.distance_m
        from s
        left join m on m.ref = 'durak:' || s.stop_id
      on conflict (route_id, stop_id) do update set
        poi_id = coalesce(excluded.poi_id, t.poi_id), distance_m = excluded.distance_m, updated_at = now()
      where t.method = 'geometric'
        and (t.poi_id, t.distance_m) is distinct from (coalesce(excluded.poi_id, t.poi_id), excluded.distance_m)
      returning (xmax = 0) as inserted, t.poi_id
    )
    select count(*) filter (where inserted), count(*) filter (where not inserted), count(*) filter (where poi_id is not null)
      into v_l_added, v_l_updated, v_l_poi
      from up;

    if v_dry then
      raise exception using errcode = 'GZDRY', message = 'transit_import dry run';
    end if;
  exception when sqlstate 'GZDRY' then
    null;
  end;

  return jsonb_build_object('dry_run', v_dry, 'routes_added', v_r_added, 'routes_updated', v_r_updated,
    'links_added', v_l_added, 'links_updated', v_l_updated, 'links_written_with_poi', v_l_poi, 'links_unknown_route', v_l_no_route);
end $$;
revoke all on function private.transit_import(jsonb, jsonb, boolean) from public, anon, authenticated;

-- 4) poi_sync_apply: skip the KBB-imported kinds, Kocaeli instead of the Gebze box -----------------------------------
-- Live body (2026091376 / 2026091352) with four changes: v_skip_kinds (rows and groups of those kinds are dropped, KBB
-- groups are never complete), the Kocaeli check, the Gebze-only nearest-mahalle fallback, summary.skipped.
create or replace function public.poi_sync_apply(p_rows jsonb, p_groups jsonb default '[]'::jsonb, p_trigger text default 'script'::text,
  p_dry_run boolean default false, p_errors jsonb default '[]'::jsonb, p_run_id uuid default null::uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_rows jsonb := coalesce(p_rows, '[]'::jsonb);
  v_groups jsonb := coalesce(p_groups, '[]'::jsonb);
  v_errors jsonb := '[]'::jsonb;
  v_trigger text := p_trigger;
  v_dry boolean := coalesce(p_dry_run, false);
  v_request boolean := false;
  v_refs text[];
  v_bad int;
  v_stats jsonb := '{}'::jsonb;
  v_groups_out jsonb := '[]'::jsonb;
  v_totals jsonb := '{}'::jsonb;
  v_summary jsonb;
  v_status text;
  v_message text;
  v_actor uuid;
  v_run uuid;
  v_any_guard boolean := false;
  g record;
  v_key text;
  v_fetched int;
  v_visible int;
  v_to_hide int;
  v_locked int;
  v_hidden int;
  v_guard boolean;
  -- Imported for all of Kocaeli from KBB open data (scripts/db/import-kocaeli.mjs): a sync neither writes nor hides them.
  v_skip_kinds constant text[] := array['pharmacy', 'mosque', 'taxi', 'fuel', 'bus_stop'];
  v_skipped_rows int := 0;
  v_skipped_groups jsonb := '[]'::jsonb;
begin
  if p_trigger is null or p_trigger not in ('cron', 'admin', 'script') then
    raise exception 'poi_sync_apply: invalid trigger %', p_trigger using errcode = '22023';
  end if;
  if jsonb_typeof(v_rows) <> 'array' or jsonb_typeof(v_groups) <> 'array' then
    raise exception 'poi_sync_apply: p_rows and p_groups must be arrays' using errcode = '22023';
  end if;
  if jsonb_typeof(p_errors) = 'array' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'source', left(coalesce(x.e ->> 'source', '-'), 60),
             'message', left(coalesce(x.e ->> 'message', '-'), 300))), '[]'::jsonb)
      into v_errors
      from (select t.e from jsonb_array_elements(p_errors) as t(e) where jsonb_typeof(t.e) = 'object' limit 20) x;
  end if;

  -- Rows
  select count(*) into v_bad
    from jsonb_array_elements(v_rows) as t(e)
   where jsonb_typeof(e) <> 'object'
      or coalesce(e ->> 'kind', '') not in ('pharmacy', 'mosque', 'bus_stop', 'place', 'taxi', 'atm', 'institution', 'fuel', 'ev_charge', 'bank')
      or coalesce(e ->> 'source', '') not in ('kbb', 'osm', 'manual')
      or coalesce(btrim(e ->> 'name'), '') = '' or char_length(e ->> 'name') > 200
      or coalesce(e ->> 'source_ref', '') = '' or char_length(e ->> 'source_ref') > 200
      or coalesce(e ->> 'slug', '') = '' or char_length(e ->> 'slug') > 200
      or jsonb_typeof(e -> 'x') is distinct from 'number' or jsonb_typeof(e -> 'y') is distinct from 'number'
      or coalesce(e ->> 'srid', '4326') not in ('4326', '5254')
      or jsonb_typeof(coalesce(nullif(e -> 'details', 'null'::jsonb), '{}'::jsonb)) <> 'object';
  if v_bad > 0 then
    raise exception 'poi_sync_apply: % invalid row(s)', v_bad using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(v_rows) as t(e) group by e ->> 'source', e ->> 'source_ref' having count(*) > 1) then
    raise exception 'poi_sync_apply: duplicate (source, source_ref) in p_rows' using errcode = '22023';
  end if;
  -- Kinds imported from KBB open data are not synced.
  select count(*) into v_skipped_rows from jsonb_array_elements(v_rows) as t(e) where e ->> 'kind' = any(v_skip_kinds);
  if v_skipped_rows > 0 then
    select coalesce(jsonb_agg(t.e order by t.ord), '[]'::jsonb) into v_rows
      from jsonb_array_elements(v_rows) with ordinality as t(e, ord)
     where not (t.e ->> 'kind' = any(v_skip_kinds));
  end if;
  -- Inside Kocaeli: a district polygon or within 3 km of one (private.district_of, as district_for_point).
  select count(*) into v_bad
    from (select extensions.st_transform(extensions.st_setsrid(extensions.st_makepoint((e ->> 'x')::float8, (e ->> 'y')::float8),
                   coalesce((e ->> 'srid')::int, 4326)), 4326) as g
            from jsonb_array_elements(v_rows) as t(e)) p
   where private.district_of(p.g) is null;
  if v_bad > 0 then
    raise exception 'poi_sync_apply: % row(s) outside Kocaeli', v_bad using errcode = '22023';
  end if;
  -- Groups: only source data can go missing (manual rows are never hidden by a sync).
  if exists (select 1 from jsonb_array_elements(v_groups) as t(e)
              where jsonb_typeof(e) <> 'object'
                 or coalesce(e ->> 'source', '') not in ('kbb', 'osm')
                 or coalesce(e ->> 'kind', '') not in ('pharmacy', 'mosque', 'bus_stop', 'place', 'taxi', 'atm', 'institution', 'fuel', 'ev_charge', 'bank')) then
    raise exception 'poi_sync_apply: invalid group' using errcode = '22023';
  end if;
  -- A skipped kind is not a group, and a KBB list is never complete here: KBB rows are imported for the whole province
  -- and a pull listing only Gebze must not hide the other districts' rows.
  select coalesce(jsonb_agg(t.e) filter (where t.e ->> 'kind' = any(v_skip_kinds) or t.e ->> 'source' = 'kbb'), '[]'::jsonb),
         coalesce(jsonb_agg(t.e) filter (where not (t.e ->> 'kind' = any(v_skip_kinds) or t.e ->> 'source' = 'kbb')), '[]'::jsonb)
    into v_skipped_groups, v_groups
    from jsonb_array_elements(v_groups) as t(e);

  select coalesce(array_agg((e ->> 'source') || '|' || (e ->> 'source_ref')), '{}'::text[]) into v_refs
    from jsonb_array_elements(v_rows) as t(e);

  -- One sync at a time (cron, admin button, scripts).
  perform pg_advisory_xact_lock(hashtext('gebzem:poi_sync'));

  -- The admin request this pull answers (a request that already got its answer or timed out is ignored).
  if p_run_id is not null then
    select r.triggered_by, r.actor_id, v_dry or r.dry_run, true
      into v_trigger, v_actor, v_dry, v_request
      from public.data_sync_runs r
     where r.id = p_run_id and r.dataset = 'poi' and r.status = 'running'
     for update;
    if not found then
      v_request := false;
      v_trigger := p_trigger;
      v_actor := null;
      v_dry := coalesce(p_dry_run, false);
    end if;
  end if;

  begin
    -- 1) Upsert, with per (source, kind) counts of what it did.
    with r as (
      select e ->> 'kind' as kind, btrim(e ->> 'name') as name, e ->> 'slug' as slug,
             nullif(btrim(e ->> 'address'), '') as address,
             e ? 'phone' as has_phone, nullif(btrim(e ->> 'phone'), '') as phone,
             extensions.st_transform(extensions.st_setsrid(extensions.st_makepoint((e ->> 'x')::float8, (e ->> 'y')::float8),
               coalesce((e ->> 'srid')::int, 4326)), 4326) as g,
             coalesce(nullif(e -> 'details', 'null'::jsonb), '{}'::jsonb) as details,
             e ->> 'source' as source, e ->> 'source_ref' as source_ref, nullif(e ->> 'license', '') as license, t.ord
        from jsonb_array_elements(v_rows) with ordinality as t(e, ord)
       -- An OSM element a guide row already carries (scripts/db/import-city-guide.mjs) is not added a second time.
       where not (e ->> 'source' = 'osm'
                  and exists (select 1 from public.poi q
                               where q.source <> 'osm' and q.details ? 'osm_id' and q.details ->> 'osm_id' = e ->> 'source_ref'))
    ),
    pre as (
      select q.id, q.source, q.source_ref, q.phone, q.updated_at, q.missing_since
        from public.poi q
        join r on r.source = q.source and r.source_ref = q.source_ref
    ),
    v as (
      select r.*,
             case when r.has_phone then r.phone else pre.phone end as phone_final,
             -- New rows: a taken slug gets a stable suffix.
             case when pre.id is null
                       and (exists (select 1 from public.poi q where q.slug = r.slug)
                            or row_number() over (partition by r.slug order by r.ord) > 1)
                  then left(r.slug, 180) || '-' || left(md5(r.source || ':' || r.source_ref), 6)
                  else r.slug end as slug_final
        from r
        left join pre on pre.source = r.source and pre.source_ref = r.source_ref
    ),
    up as (
      insert into public.poi as q (kind, name, slug, address, phone, location, neighbourhood_id, details, source, source_ref, license, last_seen_at)
      select v.kind, v.name, v.slug_final, v.address, v.phone_final, v.g::extensions.geography,
             coalesce(
               (select b.neighbourhood_id from private.neighbourhood_boundaries b where extensions.st_contains(b.boundary, v.g) limit 1),
               -- The nearest mahalle centre only inside Gebze (the mahalle list is Gebze's).
               case when private.district_of(v.g) = 'gebze' then
                 (select n.id from public.neighbourhoods n order by n.center operator(extensions.<->) v.g::extensions.geography limit 1) end),
             v.details, v.source, v.source_ref, v.license, now()
        from v
      on conflict (source, source_ref) do update set
        kind = excluded.kind, name = excluded.name, address = excluded.address, phone = excluded.phone,
        location = excluded.location, neighbourhood_id = excluded.neighbourhood_id,
        details = q.details || excluded.details, license = excluded.license,
        last_seen_at = excluded.last_seen_at,
        -- Listed again after a sync hid it: show it (on a locked row the lock keeps the admin's choice).
        hidden = case when q.missing_since is not null then false else q.hidden end
      returning q.id, q.source, q.kind, (xmax = 0) as inserted, q.updated_at, q.hidden
    )
    select coalesce(jsonb_object_agg(x.k, x.st), '{}'::jsonb) into v_stats
      from (
        select up.source || '/' || up.kind as k,
               jsonb_build_object(
                 'fetched', count(*),
                 'added', count(*) filter (where up.inserted),
                 'restored', count(*) filter (where not up.inserted and pre.missing_since is not null and not up.hidden),
                 'updated', count(*) filter (where not up.inserted and up.updated_at is distinct from pre.updated_at
                                               and not (pre.missing_since is not null and not up.hidden)),
                 'unchanged', count(*) filter (where not up.inserted and up.updated_at is not distinct from pre.updated_at
                                                 and not (pre.missing_since is not null and not up.hidden))) as st
          from up
          left join pre on pre.id = up.id
         group by up.source, up.kind) x;

    -- 2) Complete groups: hide the unlocked visible rows the pull no longer lists.
    for g in
      select distinct t.e ->> 'source' as source, t.e ->> 'kind' as kind from jsonb_array_elements(v_groups) as t(e)
    loop
      v_key := g.source || '/' || g.kind;
      select count(*) into v_fetched
        from jsonb_array_elements(v_rows) as t(e)
       where e ->> 'source' = g.source and e ->> 'kind' = g.kind;
      select count(*) filter (where not q.hidden),
             count(*) filter (where not q.hidden and not q.locked and not ((q.source || '|' || q.source_ref) = any(v_refs))),
             count(*) filter (where not q.hidden and q.locked and not ((q.source || '|' || q.source_ref) = any(v_refs)))
        into v_visible, v_to_hide, v_locked
        from public.poi q
       where q.source = g.source and q.kind = g.kind;
      -- A pull that looks truncated hides nothing: under half of the visible rows, or more than 30% (min. 5) missing.
      v_guard := v_to_hide > 0 and (v_fetched * 2 < v_visible or v_to_hide > greatest(5, ceil(v_visible * 0.3)));
      v_hidden := 0;
      if v_to_hide > 0 and not v_guard then
        update public.poi q
           set hidden = true, missing_since = now()
         where q.source = g.source and q.kind = g.kind and not q.hidden and not q.locked
           and not ((q.source || '|' || q.source_ref) = any(v_refs));
        get diagnostics v_hidden = row_count;
      end if;
      v_any_guard := v_any_guard or v_guard;
      v_stats := jsonb_set(v_stats, array[v_key],
        coalesce(v_stats -> v_key, jsonb_build_object('fetched', 0, 'added', 0, 'restored', 0, 'updated', 0, 'unchanged', 0))
          || jsonb_build_object('complete', true, 'missing', v_to_hide + v_locked, 'hidden', v_hidden, 'locked', v_locked, 'guarded', v_guard));
    end loop;

    -- 3) Summary
    select coalesce(jsonb_agg(
             jsonb_build_object('source', split_part(s.key, '/', 1), 'kind', split_part(s.key, '/', 2),
                                'complete', false, 'missing', 0, 'hidden', 0, 'locked', 0, 'guarded', false)
               || s.value
             order by s.key), '[]'::jsonb)
      into v_groups_out
      from jsonb_each(v_stats) s;
    select jsonb_build_object(
             'fetched', coalesce(sum((x ->> 'fetched')::int), 0),
             'added', coalesce(sum((x ->> 'added')::int), 0),
             'updated', coalesce(sum((x ->> 'updated')::int), 0),
             'unchanged', coalesce(sum((x ->> 'unchanged')::int), 0),
             'restored', coalesce(sum((x ->> 'restored')::int), 0),
             'missing', coalesce(sum((x ->> 'missing')::int), 0),
             'hidden', coalesce(sum((x ->> 'hidden')::int), 0),
             'locked', coalesce(sum((x ->> 'locked')::int), 0))
      into v_totals
      from jsonb_array_elements(v_groups_out) as t(x);
    v_status := case
      when jsonb_array_length(v_rows) = 0 and jsonb_array_length(v_errors) > 0 then 'error'
      when jsonb_array_length(v_errors) > 0 or v_any_guard then 'partial'
      else 'ok' end;
    v_summary := jsonb_build_object('totals', v_totals, 'groups', v_groups_out, 'errors', v_errors,
      'skipped', jsonb_build_object('rows', v_skipped_rows, 'kinds', to_jsonb(v_skip_kinds), 'groups', v_skipped_groups));

    if v_dry then
      raise exception using errcode = 'GZDRY', message = 'poi_sync_apply dry run';
    end if;
  exception when sqlstate 'GZDRY' then
    null; -- dry run: every write above is rolled back, the summary stays
  end;

  select left(string_agg((t.e ->> 'source') || ': ' || (t.e ->> 'message'), '; '), 500) into v_message
    from jsonb_array_elements(v_errors) as t(e);
  delete from public.data_sync_runs where created_at < now() - interval '2 years';
  if v_request then
    -- The admin's request (a preview too) gets its answer.
    update public.data_sync_runs
       set status = v_status, summary = v_summary, message = v_message, finished_at = now()
     where id = p_run_id
    returning id into v_run;
  elsif not v_dry then
    insert into public.data_sync_runs (dataset, triggered_by, dry_run, status, summary, message, finished_at)
    values ('poi', v_trigger, false, v_status, v_summary, v_message, now())
    returning id into v_run;
  end if;
  -- The admin's run in /admin/denetim (the row writes above have no session, so audit_content skips them).
  if v_actor is not null and not v_dry then
    insert into public.audit_log (actor_id, user_id, action, entity_type, entity_id, summary, details)
    values (v_actor, null, 'place.sync', 'place', null,
      'Yer verisi eşitlendi: ' || (v_totals ->> 'added') || ' yeni, ' || (v_totals ->> 'updated') || ' güncellendi, '
        || (v_totals ->> 'hidden') || ' gizlendi',
      jsonb_strip_nulls(jsonb_build_object('note', v_message)));
  end if;

  return v_summary || jsonb_build_object('run_id', v_run, 'dry_run', v_dry, 'status', v_status);
end $function$;

notify pgrst, 'reload schema';
