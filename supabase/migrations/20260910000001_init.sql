-- Gebzem: core schema (tables, indexes, helper functions, triggers).
-- Re-runnable: uses IF NOT EXISTS / CREATE OR REPLACE everywhere.
set search_path = public, extensions;

create extension if not exists postgis with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Internal schema (not exposed through PostgREST).
create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

-- Turkish-aware search normalisation: "İstanbul Çarşı" -> "istanbul carsi".
-- Must stay in sync with src/core/tr.ts trNormalize().
create or replace function public.tr_norm(t text)
returns text
language sql
immutable
parallel safe
set search_path = public, extensions
as $$
  select btrim(regexp_replace(
    lower(extensions.unaccent('extensions.unaccent'::regdictionary,
      translate(coalesce(t, ''), 'İIıĞğÜüŞşÖöÇçÂâÎîÛû', 'iiigguussooccaaiiuu'))),
    '\s+', ' ', 'g'))
$$;

-- URL slug from Turkish text.
create or replace function public.tr_slug(t text)
returns text
language sql
immutable
parallel safe
set search_path = public, extensions
as $$
  select left(btrim(regexp_replace(public.tr_norm(t), '[^a-z0-9]+', '-', 'g'), '-'), 80)
$$;

-- "Ayşe Kaya" -> "Ayşe K."; null -> 'Kullanıcı'
create or replace function public.short_name(p_full_name text)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when p_full_name is null or btrim(p_full_name) = '' then 'Kullanıcı'
    when position(' ' in btrim(p_full_name)) = 0 then btrim(p_full_name)
    else split_part(btrim(p_full_name), ' ', 1) || ' ' ||
         upper(left(regexp_replace(btrim(p_full_name), '^.*\s', ''), 1)) || '.'
  end
$$;

-- Digits of a TR phone in "90XXXXXXXXXX" form (auth.users.phone format), or the raw digits.
create or replace function private.phone_digits(p text)
returns text
language plpgsql
immutable
as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if d like '0090%' then d := substr(d, 3); end if;
  if length(d) = 11 and d like '0%' then d := '90' || substr(d, 2); end if;
  if length(d) = 10 and d ~ '^[2-58]' then d := '90' || d; end if;
  return d;
end $$;

-- E.164 (+90...) or null
create or replace function private.phone_e164(p text)
returns text
language sql
immutable
as $$
  select case when p is null or btrim(p) = '' then null
              when private.phone_digits(p) ~ '^90\d{10}$' then '+' || private.phone_digits(p)
              else null end
$$;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Reference / geography
-- ---------------------------------------------------------------------------
create table if not exists public.neighbourhoods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  district text not null default 'Gebze',
  center extensions.geography(Point, 4326),
  lat double precision generated always as (extensions.st_y(center::extensions.geometry)) stored,
  lng double precision generated always as (extensions.st_x(center::extensions.geometry)) stored,
  osm_id bigint unique,
  created_at timestamptz not null default now()
);
create index if not exists neighbourhoods_center_gix on public.neighbourhoods using gist (center);
create index if not exists neighbourhoods_district_idx on public.neighbourhoods (district, name);

-- Polygons are kept private (large); used for point-in-neighbourhood lookups.
create table if not exists private.neighbourhood_boundaries (
  neighbourhood_id uuid primary key references public.neighbourhoods(id) on delete cascade,
  boundary extensions.geometry(MultiPolygon, 4326) not null
);
create index if not exists neighbourhood_boundaries_gix on private.neighbourhood_boundaries using gist (boundary);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create or replace function private.app_setting_int(p_key text, p_default int)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (value #>> '{}')::int from public.app_settings where key = p_key), p_default)
$$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text check (full_name is null or char_length(full_name) <= 80),
  phone text unique check (phone is null or phone ~ '^\+\d{10,15}$'),
  avatar_url text,
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  neighbourhood_id uuid references public.neighbourhoods(id) on delete set null,
  role text not null default 'user' check (role in ('user', 'admin')),
  status text not null default 'active' check (status in ('active', 'restricted', 'banned')),
  trusted_publisher boolean not null default false,
  marketing_consent boolean not null default false,
  kvkk_accepted_at timestamptz,
  onboarded boolean not null default false,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists profiles_role_idx on public.profiles (role) where role = 'admin';

-- New auth user -> profile row with E.164 phone.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  insert into public.profiles (id, phone, email)
  values (new.id,
          case when new.phone is null or new.phone = '' then null else '+' || regexp_replace(new.phone, '\D', '', 'g') end,
          nullif(new.email, ''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Phone change in auth -> mirror to profile.
create or replace function private.handle_user_phone_change()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.phone is distinct from old.phone then
    update public.profiles
       set phone = case when new.phone is null or new.phone = '' then null else '+' || regexp_replace(new.phone, '\D', '', 'g') end
     where id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_phone_changed on auth.users;
create trigger on_auth_user_phone_changed
  after update of phone on auth.users
  for each row execute function private.handle_user_phone_change();

-- Users may only change their safe columns.
create or replace function private.profiles_protect()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    new.id := old.id;
    new.phone := old.phone;
    new.role := old.role;
    new.status := old.status;
    new.trusted_publisher := old.trusted_publisher;
    new.is_demo := old.is_demo;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Service categories (needed by businesses)
-- ---------------------------------------------------------------------------
create table if not exists public.service_categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.service_categories(id) on delete cascade,
  name text not null,
  slug text not null unique,
  icon text,
  description text,
  synonyms text[] not null default '{}',
  sort int not null default 0,
  popular boolean not null default false,
  active boolean not null default true,
  max_providers int not null default 5 check (max_providers between 1 and 10),
  notify_pool_size int not null default 8 check (notify_pool_size between 1 and 50),
  auto_dispatch boolean not null default false,
  search_norm text,
  created_at timestamptz not null default now()
);
create index if not exists service_categories_parent_idx on public.service_categories (parent_id, sort);
create index if not exists service_categories_norm_trgm on public.service_categories using gin (search_norm extensions.gin_trgm_ops);

create or replace function private.service_categories_norm()
returns trigger
language plpgsql
as $$
begin
  new.search_norm := public.tr_norm(new.name || ' ' || coalesce(array_to_string(new.synonyms, ' '), '') || ' ' || coalesce(new.description, ''));
  return new;
end $$;
drop trigger if exists service_categories_norm on public.service_categories;
create trigger service_categories_norm before insert or update on public.service_categories
  for each row execute function private.service_categories_norm();

create table if not exists public.question_flows (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.service_categories(id) on delete cascade,
  version int not null default 1,
  schema jsonb not null,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  unique (category_id, version)
);

-- ---------------------------------------------------------------------------
-- Businesses
-- ---------------------------------------------------------------------------
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles(id) on delete cascade,
  slug text not null unique,
  name text not null check (char_length(name) between 2 and 80),
  logo_url text,
  cover_url text,
  description text check (description is null or char_length(description) <= 2000),
  phone text check (phone is null or phone ~ '^\+\d{10,15}$'),
  address text,
  location extensions.geography(Point, 4326),
  lat double precision generated always as (extensions.st_y(location::extensions.geometry)) stored,
  lng double precision generated always as (extensions.st_x(location::extensions.geometry)) stored,
  neighbourhood_id uuid references public.neighbourhoods(id) on delete set null,
  kinds text[] not null default '{}' check (kinds <@ array['service', 'shop', 'employer']::text[]),
  category_label text,
  working_hours jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'suspended')),
  rejection_reason text,
  verification_level int not null default 0 check (verification_level between 0 and 3),
  vacation_mode boolean not null default false,
  rating_avg numeric(3, 2) not null default 0,
  rating_count int not null default 0,
  leads_accepted_count int not null default 0,
  search_norm text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz
);
create index if not exists businesses_status_idx on public.businesses (status);
create index if not exists businesses_norm_trgm on public.businesses using gin (search_norm extensions.gin_trgm_ops);
create index if not exists businesses_location_gix on public.businesses using gist (location);

create table if not exists public.business_service_categories (
  business_id uuid not null references public.businesses(id) on delete cascade,
  category_id uuid not null references public.service_categories(id) on delete cascade,
  primary key (business_id, category_id)
);
create index if not exists bsc_category_idx on public.business_service_categories (category_id);

create table if not exists public.business_service_areas (
  business_id uuid not null references public.businesses(id) on delete cascade,
  neighbourhood_id uuid not null references public.neighbourhoods(id) on delete cascade,
  primary key (business_id, neighbourhood_id)
);
create index if not exists bsa_neighbourhood_idx on public.business_service_areas (neighbourhood_id);

create table if not exists public.business_photos (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  url text not null,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists business_photos_business_idx on public.business_photos (business_id, sort);

create table if not exists public.business_documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  path text not null,
  kind text not null default 'diger' check (kind in ('vergi_levhasi', 'kimlik', 'meslek_belgesi', 'diger')),
  created_at timestamptz not null default now()
);
create index if not exists business_documents_business_idx on public.business_documents (business_id);

-- Owner-side protection + normalisation for businesses.
create or replace function private.businesses_before_write()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_enforce boolean := current_user in ('authenticated', 'anon') and not public.is_admin();
  v_base text;
  v_slug text;
  i int := 1;
begin
  if tg_op = 'INSERT' then
    if v_enforce then
      new.owner_id := auth.uid();
      new.status := 'pending';
      new.verification_level := 0;
      new.rating_avg := 0;
      new.rating_count := 0;
      new.leads_accepted_count := 0;
      new.approved_at := null;
      new.rejection_reason := null;
      new.is_demo := false;
      new.slug := null;
    end if;
    if new.slug is null or new.slug = '' then
      v_base := coalesce(nullif(public.tr_slug(new.name), ''), 'isletme');
      v_slug := v_base;
      while exists (select 1 from public.businesses where slug = v_slug) loop
        i := i + 1;
        v_slug := v_base || '-' || i;
      end loop;
      new.slug := v_slug;
    end if;
  else
    if v_enforce then
      new.id := old.id;
      new.owner_id := old.owner_id;
      new.status := old.status;
      new.verification_level := old.verification_level;
      new.rating_avg := old.rating_avg;
      new.rating_count := old.rating_count;
      new.leads_accepted_count := old.leads_accepted_count;
      new.approved_at := old.approved_at;
      new.rejection_reason := old.rejection_reason;
      new.is_demo := old.is_demo;
      new.created_at := old.created_at;
      new.slug := old.slug;
      -- A rejected application that is edited goes back to review.
      if old.status = 'rejected' then
        new.status := 'pending';
        new.rejection_reason := null;
      end if;
    end if;
    new.updated_at := now();
  end if;
  new.phone := coalesce(private.phone_e164(new.phone), case when new.phone ~ '^\+\d{10,15}$' then new.phone end);
  new.search_norm := public.tr_norm(new.name || ' ' || coalesce(new.category_label, '') || ' ' || coalesce(new.description, ''));
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Points of interest
-- ---------------------------------------------------------------------------
create table if not exists public.poi (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('pharmacy', 'mosque', 'bus_stop', 'place')),
  name text not null,
  slug text not null unique,
  address text,
  phone text,
  location extensions.geography(Point, 4326) not null,
  lat double precision generated always as (extensions.st_y(location::extensions.geometry)) stored,
  lng double precision generated always as (extensions.st_x(location::extensions.geometry)) stored,
  neighbourhood_id uuid references public.neighbourhoods(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  source text not null default 'manual' check (source in ('kbb', 'osm', 'manual', 'demo')),
  source_ref text,
  license text,
  search_norm text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_ref)
);
create index if not exists poi_location_gix on public.poi using gist (location);
create index if not exists poi_kind_idx on public.poi (kind, name);
create index if not exists poi_norm_trgm on public.poi using gin (search_norm extensions.gin_trgm_ops);

create or replace function private.poi_before_write()
returns trigger
language plpgsql
as $$
begin
  new.search_norm := public.tr_norm(new.name || ' ' || coalesce(new.address, '') || ' ' || coalesce(new.details ->> 'category', ''));
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists poi_before_write on public.poi;
create trigger poi_before_write before insert or update on public.poi
  for each row execute function private.poi_before_write();

create table if not exists public.pharmacy_duty (
  id uuid primary key default gen_random_uuid(),
  poi_id uuid not null references public.poi(id) on delete cascade,
  duty_start timestamptz not null,
  duty_end timestamptz not null,
  source text not null default 'demo',
  note text,
  fetched_at timestamptz not null default now(),
  unique (poi_id, duty_start),
  check (duty_end > duty_start)
);
create index if not exists pharmacy_duty_window_idx on public.pharmacy_duty (duty_start, duty_end);

-- ---------------------------------------------------------------------------
-- News + announcements
-- ---------------------------------------------------------------------------
create table if not exists public.news_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  site_url text not null,
  feed_url text not null unique,
  active boolean not null default true,
  last_fetched_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create table if not exists public.news_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.news_sources(id) on delete cascade,
  guid text not null,
  title text not null,
  summary text check (summary is null or char_length(summary) <= 280),
  url text not null,
  published_at timestamptz,
  title_hash text,
  created_at timestamptz not null default now(),
  unique (source_id, guid)
);
create index if not exists news_items_published_idx on public.news_items (published_at desc);
create index if not exists news_items_title_hash_idx on public.news_items (title_hash);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'genel' check (kind in ('su_kesintisi', 'elektrik_kesintisi', 'belediye', 'genel')),
  title text not null,
  body text,
  neighbourhood_ids uuid[] not null default '{}',
  source_label text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists announcements_active_idx on public.announcements (starts_at, ends_at);

-- ---------------------------------------------------------------------------
-- Listings (2. el + iş ilanı)
-- ---------------------------------------------------------------------------
create table if not exists public.listing_categories (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('classified', 'job')),
  parent_id uuid references public.listing_categories(id) on delete cascade,
  name text not null,
  slug text not null unique,
  icon text,
  sort int not null default 0,
  is_banned boolean not null default false,
  attributes_schema jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists listing_categories_parent_idx on public.listing_categories (type, parent_id, sort);

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('classified', 'job')),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete set null,
  category_id uuid not null references public.listing_categories(id),
  title text not null check (char_length(title) between 3 and 100),
  description text check (description is null or char_length(description) <= 4000),
  price_try numeric(12, 2) check (price_try is null or price_try >= 0),
  attributes jsonb not null default '{}'::jsonb,
  neighbourhood_id uuid references public.neighbourhoods(id) on delete set null,
  status text not null default 'pending_review'
    check (status in ('draft', 'pending_review', 'active', 'rejected', 'expired', 'sold', 'filled', 'paused', 'deleted')),
  rejection_reason text,
  flags text[] not null default '{}',
  expires_at timestamptz not null default (now() + interval '30 days'),
  published_at timestamptz,
  view_count int not null default 0,
  call_count int not null default 0,
  -- job-specific
  job_work_type text check (job_work_type is null or job_work_type in ('tam_zamanli', 'yari_zamanli', 'vardiyali', 'stajyer', 'gunluk')),
  job_salary_min numeric(12, 2) check (job_salary_min is null or job_salary_min >= 0),
  job_salary_max numeric(12, 2) check (job_salary_max is null or job_salary_max >= 0),
  job_salary_hidden boolean not null default false,
  job_experience text check (job_experience is null or job_experience in ('farketmez', '0-1', '1-3', '3+')),
  job_benefits text[] not null default '{}',
  job_location_label text,
  search_norm text,
  search_tsv tsvector,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (job_salary_min is null or job_salary_max is null or job_salary_max >= job_salary_min)
);
create index if not exists listings_feed_idx on public.listings (type, status, published_at desc);
create index if not exists listings_owner_idx on public.listings (owner_id, created_at desc);
create index if not exists listings_category_idx on public.listings (category_id);
create index if not exists listings_neighbourhood_idx on public.listings (neighbourhood_id);
create index if not exists listings_business_idx on public.listings (business_id);
create index if not exists listings_tsv_idx on public.listings using gin (search_tsv);
create index if not exists listings_norm_trgm on public.listings using gin (search_norm extensions.gin_trgm_ops);
create index if not exists listings_expiry_idx on public.listings (expires_at) where status in ('active', 'paused');

create table if not exists public.listing_media (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  url text not null,
  thumb_url text,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists listing_media_listing_idx on public.listing_media (listing_id, sort);

-- Moderation flags from free text.
create or replace function private.listing_flags(p_title text, p_desc text)
returns text[]
language plpgsql
immutable
set search_path = public, extensions
as $$
declare
  t text := coalesce(p_title, '') || ' ' || coalesce(p_desc, '');
  n text := public.tr_norm(coalesce(p_title, '') || ' ' || coalesce(p_desc, ''));
  compact text := regexp_replace(coalesce(p_title, '') || ' ' || coalesce(p_desc, ''), '[\s().\-/]', '', 'g');
  f text[] := '{}';
begin
  if t ~* 'TR\s?\d{2}[0-9 ]{20,}' then f := f || 'iban'::text; end if;
  if n ~ '(kapora|on odeme|onodeme|kargo ile|kayit ucreti)' then f := f || 'odeme'::text; end if;
  if compact ~ '(^|\D)(\+?90|0)?5\d{9}(\D|$)' or compact ~ '(^|\D)(\+?90|0)[2-4]\d{9}(\D|$)' or compact ~ '(^|\D)0?850\d{7}(\D|$)' then
    f := f || 'telefon'::text;
  end if;
  if t ~* '(https?://|www\.|\m[a-z0-9-]+\.(com|net|org|com\.tr|tr|io|me|link|ly)\M)' then f := f || 'url'::text; end if;
  if n ~ '(satilik (daire|ev|arsa|villa|dukkan)|kiralik (daire|ev|dukkan))' then f := f || 'emlak_vasita'::text; end if;
  if n ~ '(bay eleman|bayan eleman|erkek eleman|kadin eleman|yas siniri|\d{2} ?- ?\d{2} yas)' then f := f || 'ayrimcilik'::text; end if;
  return f;
end $$;

-- Initial status for a listing that is submitted (not a draft).
create or replace function private.initial_listing_status(p_owner uuid, p_flags text[])
returns text
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_profile public.profiles;
  v_published int;
begin
  select * into v_profile from public.profiles where id = p_owner;
  if v_profile.status = 'banned' then
    raise exception 'Hesabın askıya alınmış, ilan veremezsin' using errcode = '42501';
  end if;
  if coalesce(array_length(p_flags, 1), 0) > 0 or v_profile.status <> 'active' then
    return 'pending_review';
  end if;
  if v_profile.trusted_publisher then
    return 'active';
  end if;
  select count(*) into v_published from public.listings
   where owner_id = p_owner and published_at is not null;
  if v_published >= private.app_setting_int('first_listings_moderated', 3) then
    return 'active';
  end if;
  return 'pending_review';
end $$;

create or replace function private.listings_search_fields(l public.listings)
returns public.listings
language plpgsql
immutable
set search_path = public, extensions
as $$
begin
  l.search_norm := public.tr_norm(l.title || ' ' || coalesce(l.description, '') || ' ' || coalesce(l.job_location_label, ''));
  l.search_tsv := setweight(to_tsvector('turkish'::regconfig, public.tr_norm(l.title)), 'A')
               || setweight(to_tsvector('turkish'::regconfig, public.tr_norm(coalesce(l.description, '') || ' ' || coalesce(l.job_location_label, ''))), 'B');
  return l;
end $$;

create or replace function private.listings_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_enforce boolean := current_user in ('authenticated', 'anon') and not public.is_admin();
  v_cat public.listing_categories;
  v_biz uuid;
  v_days int := private.app_setting_int('listing_days', 30);
begin
  if v_enforce then
    if auth.uid() is null then
      raise exception 'İlan vermek için giriş yapmalısın' using errcode = '42501';
    end if;
    new.owner_id := auth.uid();
    new.view_count := 0;
    new.call_count := 0;
    new.published_at := null;
    new.rejection_reason := null;
    new.is_demo := false;
    if new.status is distinct from 'draft' then
      new.status := 'pending_review';
    end if;
  end if;

  select * into v_cat from public.listing_categories where id = new.category_id;
  if not found then
    raise exception 'Kategori bulunamadı' using errcode = '23503';
  end if;
  if v_cat.is_banned then
    raise exception 'Bu kategoride ilan verilemez' using errcode = 'P0001', hint = 'banned_category';
  end if;
  if v_cat.type <> new.type then
    raise exception 'Kategori ilan türüyle uyuşmuyor' using errcode = 'P0001', hint = 'category_type_mismatch';
  end if;

  if new.type = 'job' then
    if new.business_id is not null and exists (
         select 1 from public.businesses where id = new.business_id and owner_id = new.owner_id and status = 'approved') then
      v_biz := new.business_id;
    else
      select id into v_biz from public.businesses where owner_id = new.owner_id and status = 'approved' limit 1;
    end if;
    if v_biz is null then
      raise exception 'İş ilanı yalnız onaylı işletme hesabıyla verilebilir' using errcode = '42501', hint = 'business_required';
    end if;
    new.business_id := v_biz;
    new.price_try := null;
  else
    new.job_work_type := null;
    new.job_salary_min := null;
    new.job_salary_max := null;
    new.job_experience := null;
    new.job_benefits := '{}';
    new.job_location_label := null;
    if new.business_id is not null and not exists (
         select 1 from public.businesses where id = new.business_id and owner_id = new.owner_id and status = 'approved') then
      new.business_id := null;
    end if;
  end if;

  new.flags := private.listing_flags(new.title, new.description);

  if v_enforce and new.status = 'pending_review' then
    new.status := private.initial_listing_status(new.owner_id, new.flags);
  end if;

  if new.status = 'active' then
    new.published_at := coalesce(new.published_at, now());
    if v_enforce then
      new.expires_at := now() + make_interval(days => v_days);
    end if;
  end if;

  new := private.listings_search_fields(new);
  new.updated_at := now();
  return new;
end $$;

create or replace function private.listings_before_update()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_enforce boolean := current_user in ('authenticated', 'anon') and not public.is_admin();
  v_cat public.listing_categories;
  v_days int := private.app_setting_int('listing_days', 30);
  v_old_flags int := coalesce(array_length(old.flags, 1), 0);
begin
  if v_enforce then
    new.id := old.id;
    new.owner_id := old.owner_id;
    new.type := old.type;
    new.business_id := old.business_id;
    new.view_count := old.view_count;
    new.call_count := old.call_count;
    new.published_at := old.published_at;
    new.expires_at := old.expires_at;
    new.rejection_reason := old.rejection_reason;
    new.is_demo := old.is_demo;
    new.created_at := old.created_at;

    if old.status = 'deleted' then
      raise exception 'Silinmiş ilan düzenlenemez' using errcode = '42501';
    end if;

    if new.category_id is distinct from old.category_id then
      select * into v_cat from public.listing_categories where id = new.category_id;
      if not found or v_cat.is_banned or v_cat.type <> old.type then
        raise exception 'Bu kategoride ilan verilemez' using errcode = 'P0001', hint = 'banned_category';
      end if;
    end if;

    if new.status is distinct from old.status then
      if new.status = 'deleted' then
        null;
      elsif new.status = 'paused' and old.status = 'active' then
        null;
      elsif new.status = 'active' and old.status = 'paused' and old.expires_at > now() then
        null;
      elsif new.status = 'sold' and old.type = 'classified' and old.status in ('active', 'paused', 'expired') then
        null;
      elsif new.status = 'filled' and old.type = 'job' and old.status in ('active', 'paused', 'expired') then
        null;
      elsif new.status = 'draft' and old.status in ('draft', 'rejected') then
        null;
      elsif new.status = 'pending_review' and old.status in ('draft', 'rejected') then
        new.flags := private.listing_flags(new.title, new.description);
        new.status := private.initial_listing_status(old.owner_id, new.flags);
        new.rejection_reason := null;
        if new.status = 'active' then
          new.published_at := coalesce(old.published_at, now());
          new.expires_at := now() + make_interval(days => v_days);
        end if;
      else
        raise exception 'Bu durum değişikliği yapılamaz (% -> %)', old.status, new.status using errcode = '42501', hint = 'invalid_status_transition';
      end if;
    end if;
  end if;

  new.flags := private.listing_flags(new.title, new.description);
  -- Editing an active listing so that it gets new red flags sends it back to review.
  if v_enforce and new.status = 'active'
     and coalesce(array_length(new.flags, 1), 0) > v_old_flags then
    new.status := 'pending_review';
  end if;
  if new.status = 'active' and new.published_at is null then
    new.published_at := now();
  end if;

  new := private.listings_search_fields(new);
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Favorites, reports, contact events
-- ---------------------------------------------------------------------------
create table if not exists public.favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('listing', 'business', 'poi')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  target_type text not null check (target_type in ('listing', 'business', 'review', 'user')),
  target_id uuid not null,
  reason text not null check (reason in ('dolandiricilik', 'yanlis_kategori', 'uygunsuz', 'yaniltici', 'diger')),
  detail text check (detail is null or char_length(detail) <= 1000),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  admin_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists reports_status_idx on public.reports (status, created_at desc);

create table if not exists public.contact_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  subject_type text not null check (subject_type in ('listing', 'job', 'business', 'poi', 'lead')),
  subject_id uuid not null,
  event text not null check (event in ('phone_reveal', 'call_click', 'directions')),
  ip_hash text,
  created_at timestamptz not null default now()
);
create index if not exists contact_events_subject_idx on public.contact_events (subject_type, subject_id);
create index if not exists contact_events_user_idx on public.contact_events (user_id, event, created_at desc);
create index if not exists contact_events_ip_idx on public.contact_events (ip_hash, event, created_at desc);

-- ---------------------------------------------------------------------------
-- Services (Armut-style)
-- ---------------------------------------------------------------------------
create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  public_code text not null unique,
  customer_id uuid references public.profiles(id) on delete set null,
  category_id uuid not null references public.service_categories(id),
  flow_id uuid references public.question_flows(id) on delete set null,
  answers jsonb not null default '{}'::jsonb,
  neighbourhood_id uuid references public.neighbourhoods(id) on delete set null,
  address_note text check (address_note is null or char_length(address_note) <= 200),
  when_type text not null default 'esnek' check (when_type in ('acil', 'bu_hafta', 'tarih', 'esnek')),
  when_date date,
  note text check (note is null or char_length(note) <= 1000),
  photos text[] not null default '{}',
  hide_phone boolean not null default false,
  status text not null default 'admin_review'
    check (status in ('admin_review', 'open', 'filled', 'closed_hired', 'closed_cancelled', 'expired', 'no_match')),
  accepted_count int not null default 0,
  max_providers int not null default 5,
  hired_business_id uuid references public.businesses(id) on delete set null,
  dispatch_note text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  check (accepted_count >= 0 and accepted_count <= max_providers)
);
create index if not exists service_requests_customer_idx on public.service_requests (customer_id, created_at desc);
create index if not exists service_requests_status_idx on public.service_requests (status, created_at desc);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  status text not null default 'sent'
    check (status in ('sent', 'seen', 'accepted', 'declined', 'closed_full', 'removed_by_customer')),
  offer_price_try numeric(12, 2) check (offer_price_try is null or offer_price_try >= 0),
  offer_note varchar(280),
  wave_no int not null default 1,
  match_score numeric,
  seen_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, business_id)
);
create index if not exists leads_business_idx on public.leads (business_id, created_at desc);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  request_id uuid references public.service_requests(id) on delete set null,
  author_id uuid references public.profiles(id) on delete set null,
  rating int not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 1000),
  reply text check (reply is null or char_length(reply) <= 1000),
  replied_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (request_id, business_id)
);
create index if not exists reviews_business_idx on public.reviews (business_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Notifications, push, contact form, demo OTP
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  push_sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;
create index if not exists notifications_push_idx on public.notifications (created_at) where push_sent_at is null;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  name text check (name is null or char_length(name) <= 80),
  phone text check (phone is null or char_length(phone) <= 20),
  message text not null check (char_length(message) between 3 and 2000),
  handled boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.demo_otp (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code text not null,
  created_at timestamptz not null default now()
);
create index if not exists demo_otp_phone_idx on public.demo_otp (phone, created_at desc);

-- ---------------------------------------------------------------------------
-- is_admin() (needed by triggers above; defined after profiles exists)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and role = 'admin' and status = 'active'
  )
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
drop trigger if exists profiles_protect on public.profiles;
create trigger profiles_protect before update on public.profiles
  for each row execute function private.profiles_protect();

drop trigger if exists businesses_before_write on public.businesses;
create trigger businesses_before_write before insert or update on public.businesses
  for each row execute function private.businesses_before_write();

drop trigger if exists listings_before_insert on public.listings;
create trigger listings_before_insert before insert on public.listings
  for each row execute function private.listings_before_insert();

drop trigger if exists listings_before_update on public.listings;
create trigger listings_before_update before update on public.listings
  for each row execute function private.listings_before_update();

drop trigger if exists service_requests_updated_at on public.service_requests;
create trigger service_requests_updated_at before update on public.service_requests
  for each row execute function private.set_updated_at();

drop trigger if exists leads_updated_at on public.leads;
create trigger leads_updated_at before update on public.leads
  for each row execute function private.set_updated_at();
