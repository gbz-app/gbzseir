-- Şehir rehberi (city guide) on public.poi: resmî kurumlar, bank branches, fuel and EV charging stations, the guide place
-- categories and the emergency numbers. Additive and re-runnable; seeds never overwrite admin edits.
--  * poi.kind: + institution (resmî kurum, okul, sağlık kurumu, üniversite, kütüphane, noter), fuel (akaryakıt),
--    ev_charge (elektrikli araç şarjı), bank (banka şubesi). ATMs and banks keep the normalized bank key in details.bank,
--    fuel details.brand, ev_charge details.operator (+ sockets / power_kw / capacity when known).
--  * poi.location is optional now: guide records without a published address still list (and wait in the admin
--    "konumu eksik" queue). Map-only kinds (pharmacy, mosque, bus_stop, taxi) still need a pin.
--  * poi.verified_at, source_urls, email, website. hours, description and photos stay in details (they already live there
--    for places): photos are [{url, alt, credit, author, licence, licence_url, source_page}].
--  * public.institution_categories: values of details->>'category' for kind institution (trigger, like place categories),
--    grouped by group_key; details.ownership is 'devlet' | 'ozel'.
--  * place_categories: + tabiat_parki, sahil, kultur, spor, pazar, mezarlik, ulasim and a subkinds list (tarihi, ulasim).
--  * Every kind list is updated together: poi_kind_check, poi_sync_apply (both whitelists), tr_label, poi_before_write's
--    locked keys. global_search is left alone (owned by the search work).
--  * poi_sync_apply also skips an OSM row whose element an imported guide row already carries (details.osm_id), so the
--    monthly OSM sync does not add a duplicate next to it.
--  * app_settings.emergency_numbers: [{number, label, description, website?}] for the guide page.
-- Latest live bodies were read with pg_get_functiondef before each replace; only the noted parts changed.

set search_path = public, extensions;

-- ===========================================================================
-- 1. poi: kinds, optional location, new columns
-- ===========================================================================
alter table public.poi drop constraint if exists poi_kind_check;
alter table public.poi add constraint poi_kind_check
  check (kind in ('pharmacy', 'mosque', 'bus_stop', 'place', 'taxi', 'atm', 'institution', 'fuel', 'ev_charge', 'bank'));

alter table public.poi alter column location drop not null;
alter table public.poi drop constraint if exists poi_location_required;
alter table public.poi add constraint poi_location_required
  check (location is not null or kind in ('institution', 'fuel', 'ev_charge', 'bank', 'atm', 'place'));

alter table public.poi add column if not exists verified_at timestamptz;
alter table public.poi add column if not exists source_urls text[] not null default '{}'::text[];
alter table public.poi add column if not exists email text;
alter table public.poi add column if not exists website text;

alter table public.poi drop constraint if exists poi_email_check;
alter table public.poi add constraint poi_email_check
  check (email is null or (char_length(email) <= 200 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'));
alter table public.poi drop constraint if exists poi_website_check;
alter table public.poi add constraint poi_website_check
  check (website is null or (char_length(website) <= 500 and website ~* '^https?://[^[:space:]]+$'));
alter table public.poi drop constraint if exists poi_source_urls_check;
alter table public.poi add constraint poi_source_urls_check check (cardinality(source_urls) <= 20);
alter table public.poi drop constraint if exists poi_ownership_check;
alter table public.poi add constraint poi_ownership_check
  check (jsonb_typeof(details) <> 'object' or details ->> 'ownership' is null or details ->> 'ownership' in ('devlet', 'ozel'));

comment on column public.poi.location is 'Pin (null: no published address yet; only guide kinds and places may lack it).';
comment on column public.poi.verified_at is 'When phone and address were last checked against an official source (null: not verified).';
comment on column public.poi.source_urls is 'Pages the facts come from (official sites, OSM); shown as the data source.';
comment on column public.poi.email is 'Public e-mail of the place (institutions).';
comment on column public.poi.website is 'Official website (http/https).';

create index if not exists poi_institution_category_idx on public.poi ((details ->> 'category')) where kind = 'institution';
create index if not exists poi_osm_id_idx on public.poi ((details ->> 'osm_id')) where details ? 'osm_id';
create index if not exists poi_guide_key_idx on public.poi ((details ->> 'key')) where details ? 'key';

-- ===========================================================================
-- 2. Institution categories (admin-managed vocabulary, same pattern as place_categories)
-- ===========================================================================
create table if not exists public.institution_categories (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label_tr text not null check (char_length(btrim(label_tr)) between 1 and 60),
  group_key text not null check (group_key in ('yonetim', 'guvenlik', 'adalet', 'saglik', 'egitim', 'iletisim')),
  icon text check (icon is null or icon ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  sort int not null default 100 check (sort between 0 and 10000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.institution_categories is 'Values of poi.details->>''category'' for kind institution (trigger poi_institution_category). group_key: yonetim | guvenlik | adalet | saglik | egitim | iletisim. Inactive categories are hidden from the editor but still label existing rows. icon = lucide name.';

drop trigger if exists set_updated_at on public.institution_categories;
create trigger set_updated_at before update on public.institution_categories for each row execute function private.set_updated_at();

-- Same order, labels and icons as INSTITUTION_CATEGORY_DEFS (src/features/guide/lib/constants.ts).
insert into public.institution_categories (key, label_tr, group_key, icon, sort) values
  ('belediye', 'Belediye', 'yonetim', 'building-2', 10),
  ('kaymakamlik', 'Kaymakamlık', 'yonetim', 'landmark', 20),
  ('nufus', 'Nüfus müdürlüğü', 'yonetim', 'id-card', 30),
  ('tapu', 'Tapu ve kadastro', 'yonetim', 'file-text', 40),
  ('vergi', 'Vergi dairesi', 'yonetim', 'hand-coins', 50),
  ('sgk', 'SGK', 'yonetim', 'heart-handshake', 60),
  ('iskur', 'İŞKUR', 'yonetim', 'briefcase', 70),
  ('muftuluk', 'Müftülük', 'yonetim', 'moon-star', 80),
  ('tarim', 'Tarım ve orman', 'yonetim', 'sprout', 90),
  ('ticaret_odasi', 'Ticaret odası', 'yonetim', 'handshake', 100),
  ('osb', 'Organize sanayi', 'yonetim', 'factory', 110),
  ('kent_konseyi', 'Kent konseyi', 'yonetim', 'users', 120),
  ('diger_kamu', 'Diğer kamu kurumu', 'yonetim', 'building', 130),
  ('emniyet', 'Emniyet', 'guvenlik', 'siren', 200),
  ('jandarma', 'Jandarma', 'guvenlik', 'shield', 210),
  ('itfaiye', 'İtfaiye', 'guvenlik', 'flame', 220),
  ('adliye', 'Adliye', 'adalet', 'scale', 300),
  ('icra', 'İcra dairesi', 'adalet', 'gavel', 310),
  ('noter', 'Noter', 'adalet', 'stamp', 320),
  ('hastane', 'Hastane', 'saglik', 'hospital', 400),
  ('aile_sagligi_merkezi', 'Aile sağlığı merkezi', 'saglik', 'stethoscope', 410),
  ('toplum_sagligi', 'Toplum sağlığı', 'saglik', 'heart-pulse', 420),
  ('agiz_dis', 'Ağız ve diş sağlığı', 'saglik', 'smile', 430),
  ('ilce_saglik', 'İlçe sağlık müdürlüğü', 'saglik', 'cross', 440),
  ('acil_saglik', '112 istasyonu', 'saglik', 'ambulance', 450),
  ('anaokulu', 'Anaokulu', 'egitim', 'baby', 500),
  ('ilkokul', 'İlkokul', 'egitim', 'school', 510),
  ('ortaokul', 'Ortaokul', 'egitim', 'school', 520),
  ('lise', 'Lise', 'egitim', 'book-open', 530),
  ('ozel_egitim', 'Özel eğitim', 'egitim', 'hand-heart', 540),
  ('universite', 'Üniversite', 'egitim', 'graduation-cap', 550),
  ('egitim_kurumu', 'Eğitim kurumu', 'egitim', 'presentation', 560),
  ('kutuphane', 'Kütüphane', 'egitim', 'library', 570),
  ('ptt', 'PTT', 'iletisim', 'mail', 600)
on conflict (key) do nothing;

alter table public.institution_categories enable row level security;
drop policy if exists "public read" on public.institution_categories;
drop policy if exists "admin write" on public.institution_categories;
create policy "public read" on public.institution_categories for select to anon, authenticated using (true);
create policy "admin write" on public.institution_categories for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on table public.institution_categories from anon, authenticated;
grant select on table public.institution_categories to anon, authenticated;
grant insert, update, delete on table public.institution_categories to authenticated;
grant all on table public.institution_categories to service_role;

-- institution category: must be an institution_categories key. Runs after poi_before_write (trigger names sort), so it
-- sees the value a locked row keeps. An unchanged value passes; a data sync / import (no admin session) gets
-- "diger_kamu" instead of failing its batch; the admin editor gets an error.
create or replace function private.poi_institution_category()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_key text := case when jsonb_typeof(new.details) = 'object' then new.details ->> 'category' end;
begin
  if v_key is null or exists (select 1 from public.institution_categories c where c.key = v_key) then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.kind = 'institution' and jsonb_typeof(old.details) = 'object' and old.details ->> 'category' = v_key then
    return new;
  end if;
  if not public.is_admin() then
    new.details := jsonb_set(new.details, '{category}', '"diger_kamu"'::jsonb);
    return new;
  end if;
  raise exception 'Bu kurum kategorisi yok. Sayfayı yenileyip listeden seç.' using errcode = 'P0001', hint = 'invalid_category';
end $$;

revoke all on function private.poi_institution_category() from public, anon, authenticated;

drop trigger if exists poi_institution_category on public.poi;
create trigger poi_institution_category before insert or update on public.poi
  for each row when (new.kind = 'institution') execute function private.poi_institution_category();

-- ===========================================================================
-- 3. Place categories of the guide (+ subkinds)
-- ===========================================================================
alter table public.place_categories add column if not exists subkinds jsonb not null default '[]'::jsonb;
alter table public.place_categories drop constraint if exists place_categories_subkinds_check;
alter table public.place_categories add constraint place_categories_subkinds_check
  check (jsonb_typeof(subkinds) = 'array' and jsonb_array_length(subkinds) <= 30);
comment on column public.place_categories.subkinds is 'Optional finer kinds [{key, label}] stored in poi.details->>''subkind'' (e.g. tarihi: cami, kale, türbe).';

-- Same order, labels and icons as PLACE_CATEGORIES (src/features/nearby/config.ts); "diger" (60) stays last.
insert into public.place_categories (key, label, icon, sort) values
  ('tabiat_parki', 'Tabiat parkı', 'tent-tree', 25),
  ('sahil', 'Sahil', 'waves', 35),
  ('kultur', 'Kültür ve sanat', 'drama', 42),
  ('spor', 'Spor', 'trophy', 44),
  ('pazar', 'Pazar yeri', 'shopping-basket', 46),
  ('mezarlik', 'Mezarlık', 'flower-2', 48),
  ('ulasim', 'Ulaşım', 'train-front', 52)
on conflict (key) do nothing;

update public.place_categories
   set subkinds = '[{"key":"cami","label":"Cami"},{"key":"kale","label":"Kale"},{"key":"turbe","label":"Türbe"},
                    {"key":"cesme","label":"Çeşme"},{"key":"hamam","label":"Hamam"},{"key":"kulliye","label":"Külliye"},
                    {"key":"anit","label":"Anıt"},{"key":"antik_kent","label":"Antik kent"},{"key":"kopru","label":"Köprü"}]'::jsonb
 where key = 'tarihi' and subkinds = '[]'::jsonb;
update public.place_categories
   set subkinds = '[{"key":"tren","label":"Tren istasyonu"},{"key":"otogar","label":"Otogar"},{"key":"iskele","label":"İskele"}]'::jsonb
 where key = 'ulasim' and subkinds = '[]'::jsonb;

-- ===========================================================================
-- 4. poi_before_write (latest body from 2026091352): the new columns and guide keys are kept on locked rows and count
--    as content; search_norm also carries subkind / bank / brand / operator (underscores read as spaces).
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
     and (new.kind, new.name, new.slug, new.address, new.phone, new.neighbourhood_id, new.details, new.source,
          new.source_ref, new.license, new.hidden, new.locked, new.email, new.website, new.verified_at, new.source_urls)
         is not distinct from
         (old.kind, old.name, old.slug, old.address, old.phone, old.neighbourhood_id, old.details, old.source,
          old.source_ref, old.license, old.hidden, old.locked, old.email, old.website, old.verified_at, old.source_urls)
     and new.location::text is not distinct from old.location::text then
    new.updated_at := old.updated_at;
  else
    new.updated_at := now();
  end if;
  return new;
end $$;

revoke all on function private.poi_before_write() from public, anon, authenticated;

-- ===========================================================================
-- 5. poi_sync_apply (latest live body, 2026091352): the four new kinds in both whitelists, and OSM rows whose element
--    a guide row already carries (details.osm_id on a non-OSM row) are skipped instead of added a second time.
-- ===========================================================================
create or replace function public.poi_sync_apply(
  p_rows jsonb,
  p_groups jsonb default '[]'::jsonb,
  p_trigger text default 'script',
  p_dry_run boolean default false,
  p_errors jsonb default '[]'::jsonb,
  p_run_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
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
  -- Around Gebze (same box as the admin editor).
  select count(*) into v_bad
    from (select extensions.st_transform(extensions.st_setsrid(extensions.st_makepoint((e ->> 'x')::float8, (e ->> 'y')::float8),
                   coalesce((e ->> 'srid')::int, 4326)), 4326) as g
            from jsonb_array_elements(v_rows) as t(e)) p
   where extensions.st_y(p.g) not between 40.5 and 41.2 or extensions.st_x(p.g) not between 29 and 30;
  if v_bad > 0 then
    raise exception 'poi_sync_apply: % row(s) outside the Gebze area', v_bad using errcode = '22023';
  end if;
  -- Groups: only source data can go missing (manual rows are never hidden by a sync).
  if exists (select 1 from jsonb_array_elements(v_groups) as t(e)
              where jsonb_typeof(e) <> 'object'
                 or coalesce(e ->> 'source', '') not in ('kbb', 'osm')
                 or coalesce(e ->> 'kind', '') not in ('pharmacy', 'mosque', 'bus_stop', 'place', 'taxi', 'atm', 'institution', 'fuel', 'ev_charge', 'bank')) then
    raise exception 'poi_sync_apply: invalid group' using errcode = '22023';
  end if;

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
               (select n.id from public.neighbourhoods n order by n.center operator(extensions.<->) v.g::extensions.geography limit 1)),
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
    v_summary := jsonb_build_object('totals', v_totals, 'groups', v_groups_out, 'errors', v_errors);

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
end $$;

revoke all on function public.poi_sync_apply(jsonb, jsonb, text, boolean, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.poi_sync_apply(jsonb, jsonb, text, boolean, jsonb, uuid) to service_role;

-- nearby_pois (latest live body): rows without a pin (guide records, location is optional now) are never map rows, also
-- when the call has no point. Only the "p.location is not null" line is new; grants stay (create or replace keeps them).
create or replace function public.nearby_pois(p_kind text default null::text, p_lat double precision default null::double precision,
  p_lng double precision default null::double precision, p_radius_m integer default 5000, p_limit integer default 50)
returns table(id uuid, kind text, name text, slug text, address text, phone text, lat double precision, lng double precision,
  neighbourhood_id uuid, neighbourhood_name text, details jsonb, source text, license text, updated_at timestamp with time zone,
  distance_m double precision)
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
     and p.location is not null
     and (pt.g is null or extensions.st_dwithin(p.location, pt.g, greatest(1, least(coalesce(p_radius_m, 5000), 50000))))
   order by case when pt.g is null then null else extensions.st_distance(p.location, pt.g) end nulls last, p.name
   limit greatest(1, least(coalesce(p_limit, 50), 500))
$$;

-- ===========================================================================
-- 6. Labels (latest live bodies): the new poi kinds and the new column names
-- ===========================================================================
create or replace function private.tr_label(p_kind text, p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(case p_kind
    when 'profile' then case p_value when 'active' then 'Aktif' when 'restricted' then 'Kısıtlı' when 'banned' then 'Engelli' end
    when 'role' then case p_value when 'user' then 'Kullanıcı' when 'admin' then 'Yönetici' end
    when 'business' then case p_value when 'pending' then 'Onay bekliyor' when 'approved' then 'Onaylı' when 'rejected' then 'Reddedildi' when 'suspended' then 'Askıda' end
    when 'listing' then case p_value when 'draft' then 'Taslak' when 'pending_review' then 'Onay bekliyor' when 'active' then 'Yayında'
      when 'rejected' then 'Reddedildi' when 'expired' then 'Süresi doldu' when 'sold' then 'Satıldı' when 'filled' then 'Pozisyon doldu'
      when 'paused' then 'Durduruldu' when 'deleted' then 'Silindi' end
    when 'topic' then case p_value when 'sikayet' then 'şikayet' when 'teknik_destek' then 'teknik destek' when 'reklam' then 'reklam'
      when 'isletme' then 'işletme' when 'oneri' then 'öneri' when 'diger' then 'diğer' when 'bilgi_duzeltme' then 'yer bilgisi düzeltme' end
    when 'report' then case p_value when 'open' then 'Açık' when 'resolved' then 'Çözüldü' when 'dismissed' then 'Yoksayıldı' end
    when 'support' then case p_value when 'new' then 'Yeni' when 'in_progress' then 'İnceleniyor' when 'resolved' then 'Çözüldü' when 'spam' then 'Spam' end
    when 'event' then case p_value when 'draft' then 'Taslak' when 'pending_review' then 'Onay bekliyor' when 'published' then 'Yayında'
      when 'rejected' then 'Reddedildi' when 'cancelled' then 'İptal edildi' end
    when 'news' then case p_value when 'draft' then 'Taslak' when 'published' then 'Yayında' end
    when 'duty' then case p_value when 'demo' then 'Örnek veri' when 'off' then 'Kapalı' when 'live' then 'Canlı' end
    when 'target' then case p_value when 'listing' then 'ilan' when 'business' then 'işletme' when 'review' then 'yorum' when 'user' then 'kullanıcı'
      when 'event' then 'etkinlik' end
    when 'poi' then case p_value when 'pharmacy' then 'eczane' when 'mosque' then 'cami' when 'bus_stop' then 'durak' when 'place' then 'gezilecek yer'
      when 'taxi' then 'taksi' when 'atm' then 'ATM' when 'institution' then 'resmî kurum' when 'fuel' then 'akaryakıt istasyonu'
      when 'ev_charge' then 'şarj istasyonu' when 'bank' then 'banka şubesi' end
  end, p_value)
$$;

create or replace function private.audit_field_label(p_key text)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(case p_key
    when 'name' then 'ad' when 'title' then 'başlık' when 'slug' then 'bağlantı' when 'icon' then 'simge'
    when 'description' then 'açıklama' when 'synonyms' then 'eş anlamlılar' when 'sort' then 'sıra' when 'popular' then 'popüler'
    when 'active' then 'aktiflik' when 'max_providers' then 'firma sayısı' when 'notify_pool_size' then 'bildirim havuzu'
    when 'auto_dispatch' then 'otomatik dağıtım' when 'parent_id' then 'üst kategori' when 'type' then 'tür' when 'kind' then 'tür'
    when 'is_banned' then 'yasaklı' when 'attributes_schema' then 'filtre alanları' when 'schema' then 'sorular'
    when 'published' then 'yayın' when 'version' then 'sürüm' when 'category_id' then 'kategori' when 'category' then 'kategori'
    when 'summary' then 'özet' when 'body' then 'metin' when 'body_md' then 'metin' when 'cover_url' then 'kapak'
    when 'status' then 'durum' when 'published_at' then 'yayın tarihi' when 'author_id' then 'yazar'
    when 'neighbourhood_ids' then 'mahalleler' when 'neighbourhood_id' then 'mahalle' when 'source_label' then 'kaynak'
    when 'starts_at' then 'başlangıç' when 'ends_at' then 'bitiş' when 'address' then 'adres' when 'phone' then 'telefon'
    when 'lat' then 'konum' when 'lng' then 'konum' when 'details' then 'ayrıntılar'
    when 'source' then 'kaynak' when 'source_ref' then 'kaynak kimliği' when 'license' then 'lisans'
    when 'platform' then 'mağaza' when 'stat_date' then 'tarih' when 'downloads' then 'indirme' when 'active_installs' then 'aktif kurulum'
    when 'rating' then 'puan' when 'ratings_count' then 'puan sayısı' when 'reviews_count' then 'yorum sayısı' when 'note' then 'not'
    when 'pending_review' then 'hukuki inceleme' when 'hidden' then 'gizleme' when 'locked' then 'kilit'
    when 'label' then 'ad' when 'key' then 'anahtar' when 'keywords' then 'anahtar kelimeler' when 'exclude' then 'hariç ifadeler'
    when 'vertical' then 'işletme türü' when 'verticals' then 'işletme türleri' when 'scope' then 'kapsam'
    when 'label_tr' then 'ad' when 'group_key' then 'grup' when 'subkinds' then 'alt türler'
    when 'verified_at' then 'doğrulama' when 'source_urls' then 'kaynak bağlantıları' when 'email' then 'e-posta'
    when 'website' then 'web sitesi'
  end, p_key)
$$;

revoke all on function private.tr_label(text, text) from public, anon, authenticated;
revoke all on function private.audit_field_label(text) from public, anon, authenticated;

-- ===========================================================================
-- 7. Vocabulary guard and audit (latest live bodies + institution_categories)
-- ===========================================================================
create or replace function private.vocabulary_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := to_jsonb(old);
  v_new jsonb;
  v_n int;
begin
  if tg_op = 'UPDATE' then
    v_new := to_jsonb(new);
    if (v_new ->> 'key') is distinct from (v_old ->> 'key') or (v_new ->> 'scope') is distinct from (v_old ->> 'scope')
       or (v_new ->> 'vertical') is distinct from (v_old ->> 'vertical') then
      raise exception 'Anahtar, kapsam ve işletme türü sonradan değiştirilemez.' using errcode = 'P0001', hint = 'immutable_key';
    end if;
    return new;
  end if;
  if tg_table_name = 'event_categories' and v_old ->> 'key' = 'diger' then
    raise exception 'Diğer kategorisi etkinliklerin varsayılanıdır, silinemez.' using errcode = 'P0001', hint = 'in_use';
  end if;
  if tg_table_name = 'amenities' then
    if v_old ->> 'scope' = 'room' then
      select count(*) into v_n from public.business_rooms where amenities @> array[v_old ->> 'key'];
    else
      select count(*) into v_n from public.businesses where amenities @> array[v_old ->> 'key'];
    end if;
    if v_n > 0 then
      raise exception 'Bu olanak % % seçili. Silmek yerine pasife alabilirsin.', v_n, case when v_old ->> 'scope' = 'room' then 'odada' else 'işletmede' end
        using errcode = 'P0001', hint = 'in_use';
    end if;
  end if;
  if tg_table_name = 'news_categories' then
    if v_old ->> 'key' in ('gundem', 'siyaset', 'belediye', 'spor', 'etkinlik', 'duyuru') then
      raise exception 'Kaynak haberleri bu kategoriyle etiketlenir, silinemez. Haber eklerken görünmesin istersen pasife al.'
        using errcode = 'P0001', hint = 'in_use';
    end if;
    select count(*) into v_n from public.news_articles where category = v_old ->> 'key';
    if v_n > 0 then
      raise exception 'Bu kategoride % haber var. Silmek yerine pasife alabilirsin.', v_n using errcode = 'P0001', hint = 'in_use';
    end if;
  end if;
  if tg_table_name = 'place_categories' then
    if v_old ->> 'key' = 'diger' then
      raise exception 'Diğer kategorisi yerlerin varsayılanıdır, silinemez.' using errcode = 'P0001', hint = 'in_use';
    end if;
    select count(*) into v_n from public.poi where kind = 'place' and details ->> 'category' = v_old ->> 'key';
    if v_n > 0 then
      raise exception 'Bu kategoride % yer var. Silmek yerine pasife alabilirsin.', v_n using errcode = 'P0001', hint = 'in_use';
    end if;
  end if;
  if tg_table_name = 'institution_categories' then
    if v_old ->> 'key' = 'diger_kamu' then
      raise exception 'Diğer kamu kurumu kategorisi kurumların varsayılanıdır, silinemez.' using errcode = 'P0001', hint = 'in_use';
    end if;
    select count(*) into v_n from public.poi where kind = 'institution' and details ->> 'category' = v_old ->> 'key';
    if v_n > 0 then
      raise exception 'Bu kategoride % kurum var. Silmek yerine pasife alabilirsin.', v_n using errcode = 'P0001', hint = 'in_use';
    end if;
  end if;
  return old;
end $$;

revoke all on function private.vocabulary_guard() from public, anon, authenticated;

drop trigger if exists vocabulary_guard on public.institution_categories;
create trigger vocabulary_guard before update or delete on public.institution_categories for each row execute function private.vocabulary_guard();

create or replace function private.audit_content()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  r jsonb;
  v_prefix text;
  v_noun text;
  v_name text;
  v_fields text[];
  v_details jsonb;
begin
  -- Checked before the row images are built: bulk syncs (no session) stay cheap.
  if auth.uid() is null then
    return null;
  end if;
  v_old := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  r := coalesce(v_new, v_old);
  if coalesce((r ->> 'is_demo')::boolean, false) or (tg_table_name = 'poi' and r ->> 'source' = 'demo') then
    return null;
  end if;
  case tg_table_name
    when 'service_categories' then
      v_prefix := 'service_category'; v_noun := 'Hizmet kategorisi'; v_name := r ->> 'name';
    when 'listing_categories' then
      v_prefix := 'listing_category'; v_noun := 'İlan kategorisi'; v_name := r ->> 'name';
    when 'question_flows' then
      v_prefix := 'flow'; v_noun := 'Soru akışı';
      v_name := coalesce((select c.name from public.service_categories c where c.id = (r ->> 'category_id')::uuid), 'silinen kategori')
        || ' v' || (r ->> 'version');
    when 'news_articles' then
      v_prefix := 'news_article'; v_noun := 'Haber yazısı'; v_name := r ->> 'title';
    when 'announcements' then
      v_prefix := 'announcement'; v_noun := 'Duyuru'; v_name := r ->> 'title';
    when 'poi' then
      -- The kind is the noun: "Eczane güncellendi: ...", "Gezilecek yer eklendi: ...".
      v_prefix := 'place'; v_noun := private.tr_label('poi', r ->> 'kind');
      v_noun := upper(left(v_noun, 1)) || substr(v_noun, 2); v_name := r ->> 'name';
    when 'legal_texts' then
      v_prefix := 'legal_text'; v_noun := 'Yasal metin'; v_name := (r ->> 'title') || ' v' || (r ->> 'version');
    when 'store_stats' then
      v_prefix := 'store_stat'; v_noun := 'Mağaza verisi';
      v_name := (case r ->> 'platform' when 'google_play' then 'Google Play' when 'app_store' then 'App Store' else r ->> 'platform' end)
        || ' ' || to_char((r ->> 'stat_date')::date, 'DD.MM.YYYY');
    when 'vertical_subcategories' then
      v_prefix := 'subcategory'; v_noun := 'Keşfet alt kategorisi'; v_name := (r ->> 'label') || ' (' || (r ->> 'vertical') || ')';
    when 'amenities' then
      v_prefix := 'amenity'; v_noun := case when r ->> 'scope' = 'room' then 'Oda olanağı' else 'Olanak' end; v_name := r ->> 'label';
    when 'event_categories' then
      v_prefix := 'event_category'; v_noun := 'Etkinlik kategorisi'; v_name := r ->> 'label';
    when 'news_categories' then
      v_prefix := 'news_category'; v_noun := 'Haber kategorisi'; v_name := r ->> 'label';
    when 'place_categories' then
      v_prefix := 'place_category'; v_noun := 'Yer kategorisi'; v_name := r ->> 'label';
    when 'institution_categories' then
      v_prefix := 'institution_category'; v_noun := 'Kurum kategorisi'; v_name := r ->> 'label_tr';
    else
      return null;
  end case;
  v_name := coalesce(v_name, '-');
  v_details := jsonb_build_object('name', v_name);

  if tg_op = 'UPDATE' then
    v_fields := private.audit_changed_fields(v_old, v_new);
    if cardinality(v_fields) = 0 then
      return null;
    end if;
    -- Status-like changes read as what happened.
    if (v_old -> 'status') is distinct from (v_new -> 'status') then
      v_fields := array_replace(v_fields, 'durum', 'durum: ' || private.tr_label('news', v_old ->> 'status') || ' → ' || private.tr_label('news', v_new ->> 'status'));
      v_details := v_details || jsonb_build_object('from', v_old -> 'status', 'to', v_new -> 'status');
    end if;
    if (v_old -> 'published') is distinct from (v_new -> 'published') then
      v_fields := array_replace(v_fields, 'yayın', case when (v_new ->> 'published')::boolean then 'yayına alındı' else 'yayından kaldırıldı' end);
    end if;
    if (v_old -> 'active') is distinct from (v_new -> 'active') then
      v_fields := array_replace(v_fields, 'aktiflik', case when (v_new ->> 'active')::boolean then 'aktif edildi' else 'pasife alındı' end);
    end if;
    if tg_table_name = 'legal_texts' and v_old ->> 'published_at' is null and v_new ->> 'published_at' is not null then
      v_fields := array_replace(v_fields, 'yayın tarihi', 'yayımlandı');
    end if;
    v_details := v_details || jsonb_build_object('fields', v_fields);
  end if;

  perform private.audit(null, v_prefix || '.' || lower(tg_op), v_prefix, (r ->> 'id')::uuid,
    v_noun || ' ' || (case tg_op when 'INSERT' then 'eklendi' when 'UPDATE' then 'güncellendi' else 'silindi' end) || ': ' || v_name
      || (case when tg_op = 'UPDATE' then ' (' || array_to_string(v_fields, ', ') || ')' else '' end),
    v_details);
  return null;
end $$;

revoke all on function private.audit_content() from public, anon, authenticated;

drop trigger if exists audit_content on public.institution_categories;
create trigger audit_content after insert or update or delete on public.institution_categories for each row execute function private.audit_content();

-- ===========================================================================
-- 8. Emergency numbers for the guide page (app_settings: public read, admin write, audited)
-- ===========================================================================
create or replace function private.audit_setting_label(p_key text)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(case p_key
    when 'feature_business_applications' then 'Yeni işletme başvuruları'
    when 'business_max_per_owner' then 'Hesap başına işletme sayısı'
    when 'maintenance_banner' then 'Duyuru bandı'
    when 'support_phone' then 'Destek telefonu'
    when 'support_email' then 'Destek e-postası'
    when 'listing_days' then 'İlan yayın süresi (gün)'
    when 'first_listings_moderated' then 'Onaya düşen ilk ilan sayısı'
    when 'listing_daily_cap' then 'Günlük ilan sınırı'
    when 'listing_active_cap' then 'Açık ilan sınırı'
    when 'max_providers_default' then 'Bir talebe en fazla firma'
    when 'request_redispatch_hours' then 'Yanıtsız talebi yeniden gönderme (saat)'
    when 'analytics_retention_days' then 'Analitik saklama süresi (gün)'
    when 'audit_retention_days' then 'İşlem kaydı saklama süresi (gün)'
    when 'duty_data_mode' then 'Nöbet listesi verisi'
    when 'otp_demo_mode' then 'Demo giriş modu'
    when 'emergency_numbers' then 'Acil ve önemli numaralar'
  end, p_key)
$$;

revoke all on function private.audit_setting_label(text) from public, anon, authenticated;

alter table public.app_settings drop constraint if exists app_settings_emergency_numbers_check;
alter table public.app_settings add constraint app_settings_emergency_numbers_check
  check (key <> 'emergency_numbers' or (jsonb_typeof(value) = 'array' and jsonb_array_length(value) <= 40));

-- From the verified research list (112.gov.tr, kocaeli.bel.tr, gebze.bel.tr, isu.gov.tr, sedas.com, palgaz.com.tr; 11.09.2026).
insert into public.app_settings (key, value) values ('emergency_numbers', $json$[
  {"number": "112", "label": "112 Acil Çağrı", "description": "Ambulans, itfaiye, polis, jandarma, AFAD, orman yangını ve sahil güvenlik. Kocaeli'de hepsi 112'de karşılanır.", "website": "https://www.112.gov.tr/kocaeli"},
  {"number": "155", "label": "155 Polis İmdat", "description": "Çağrılar Kocaeli 112 Acil Çağrı Merkezi'nde karşılanır."},
  {"number": "156", "label": "156 Jandarma İmdat", "description": "Çağrılar Kocaeli 112 Acil Çağrı Merkezi'nde karşılanır."},
  {"number": "110", "label": "110 İtfaiye", "description": "Çağrılar Kocaeli 112 Acil Çağrı Merkezi'nde karşılanır."},
  {"number": "177", "label": "177 Orman Yangını İhbar", "description": "Çağrılar Kocaeli 112 Acil Çağrı Merkezi'nde karşılanır."},
  {"number": "153", "label": "Alo 153 Büyükşehir Çağrı Merkezi", "description": "Kocaeli Büyükşehir Belediyesi: ulaşım, sosyal hizmet, ilaçlama. 7/24. Kocaeli dışından 0262 153 00 00.", "website": "https://www.kocaeli.bel.tr/hizmet/153-cagri-merkezi-2.html"},
  {"number": "+902626420430", "label": "Gebze Belediyesi Santral", "description": "Talep ve şikâyetler için. Çözüm Masası'na internetten de başvurabilirsin.", "website": "https://ebelediye.gebze.bel.tr/NicoPortal/faces/portal/beyazMasa/CozumMasasi.xhtml"},
  {"number": "185", "label": "Alo 185 Su Arıza (İSU)", "description": "Su kesintisi, boru patlağı ve kanalizasyon arızası. 7/24.", "website": "https://www.isu.gov.tr"},
  {"number": "186", "label": "Alo 186 Elektrik Arıza (SEDAŞ)", "description": "Elektrik kesintisi ve arıza. 7/24.", "website": "https://www.sedas.com"},
  {"number": "187", "label": "187 Doğalgaz Acil (Palgaz)", "description": "Gaz kokusu ve kaçak. Gebze'de doğalgaz dağıtımı Palgaz'dadır. 7/24.", "website": "https://www.palgaz.com.tr"}
]$json$::jsonb)
on conflict (key) do nothing;

notify pgrst, 'reload schema';
