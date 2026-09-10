-- Business verticals (işletme türü), digital menus (QR menü), hotel rooms and events.
-- Additive and re-runnable.

-- ---------------------------------------------------------------------------
-- 1. Business profile extras
-- ---------------------------------------------------------------------------
alter table public.businesses add column if not exists vertical text;
alter table public.businesses add column if not exists price_level smallint;
alter table public.businesses add column if not exists amenities text[] not null default '{}';
alter table public.businesses add column if not exists star_rating smallint;
alter table public.businesses add column if not exists website text;
alter table public.businesses add column if not exists instagram text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'businesses_vertical_check') then
    alter table public.businesses add constraint businesses_vertical_check
      check (vertical is null or vertical in ('yemek', 'restoran', 'kafe', 'otel', 'hizmet', 'magaza', 'etkinlik', 'diger'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'businesses_price_level_check') then
    alter table public.businesses add constraint businesses_price_level_check check (price_level is null or price_level between 1 and 4);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'businesses_star_rating_check') then
    alter table public.businesses add constraint businesses_star_rating_check check (star_rating is null or star_rating between 1 and 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'businesses_amenities_len') then
    alter table public.businesses add constraint businesses_amenities_len check (cardinality(amenities) <= 30);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'businesses_website_len') then
    alter table public.businesses add constraint businesses_website_len check (
      (website is null or char_length(website) <= 200) and (instagram is null or char_length(instagram) <= 60));
  end if;
end $$;

create index if not exists businesses_vertical_idx on public.businesses (vertical) where status = 'approved';

-- Backfill existing businesses from their kinds.
update public.businesses
   set vertical = case when 'service' = any (kinds) then 'hizmet' when 'shop' = any (kinds) then 'magaza' else 'diger' end
 where vertical is null;

-- ---------------------------------------------------------------------------
-- 2. Digital menu (kafe / restoran / yemek) -> QR menü
-- ---------------------------------------------------------------------------
create table if not exists public.business_menu_sections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_menu_sections_id_business_uq unique (id, business_id)
);
create index if not exists business_menu_sections_business_idx on public.business_menu_sections (business_id, sort);

create table if not exists public.business_menu_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  section_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text check (description is null or char_length(description) <= 300),
  price_try numeric(10, 2) check (price_try is null or price_try >= 0),
  photo_url text,
  tags text[] not null default '{}' check (cardinality(tags) <= 8),
  is_available boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- An item always belongs to a section of the same business.
  constraint business_menu_items_section_fk foreign key (section_id, business_id)
    references public.business_menu_sections (id, business_id) on delete cascade
);
create index if not exists business_menu_items_section_idx on public.business_menu_items (section_id, sort);
create index if not exists business_menu_items_business_idx on public.business_menu_items (business_id);

-- ---------------------------------------------------------------------------
-- 3. Hotel rooms (otel)
-- ---------------------------------------------------------------------------
create table if not exists public.business_rooms (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  description text check (description is null or char_length(description) <= 600),
  price_try numeric(10, 2) check (price_try is null or price_try >= 0),
  capacity int not null default 2 check (capacity between 1 and 20),
  bed_info text check (bed_info is null or char_length(bed_info) <= 80),
  size_m2 int check (size_m2 is null or size_m2 between 5 and 1000),
  amenities text[] not null default '{}' check (cardinality(amenities) <= 20),
  photos text[] not null default '{}' check (cardinality(photos) <= 10),
  is_available boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists business_rooms_business_idx on public.business_rooms (business_id, sort);

-- ---------------------------------------------------------------------------
-- 4. Events (etkinlikler)
-- ---------------------------------------------------------------------------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  slug text unique,
  title text not null check (char_length(btrim(title)) between 3 and 120),
  description text check (description is null or char_length(description) <= 3000),
  category text not null default 'diger'
    check (category in ('konser', 'tiyatro', 'festival', 'spor', 'cocuk', 'sergi', 'atolye', 'soylesi', 'diger')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  venue_name text check (venue_name is null or char_length(venue_name) <= 120),
  address text check (address is null or char_length(address) <= 200),
  lat double precision check (lat is null or lat between -90 and 90),
  lng double precision check (lng is null or lng between -180 and 180),
  neighbourhood_id uuid references public.neighbourhoods (id) on delete set null,
  is_free boolean not null default false,
  price_try numeric(10, 2) check (price_try is null or price_try >= 0),
  price_note text check (price_note is null or char_length(price_note) <= 80),
  ticket_url text check (ticket_url is null or char_length(ticket_url) <= 300),
  phone text,
  cover_url text,
  status text not null default 'published' check (status in ('draft', 'published', 'cancelled')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists events_starts_idx on public.events (starts_at) where status = 'published';
create index if not exists events_business_idx on public.events (business_id);

create or replace function private.events_before_write()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
declare
  v_base text;
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    if current_user in ('authenticated', 'anon') then
      new.is_demo := false;
    end if;
  end if;
  if new.slug is null or btrim(new.slug) = '' then
    v_base := public.tr_slug(new.title);
    new.slug := left(coalesce(nullif(v_base, ''), 'etkinlik'), 60) || '-' || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;
  if new.ends_at is not null and new.ends_at < new.starts_at then
    raise exception 'Bitiş zamanı başlangıçtan önce olamaz' using errcode = 'P0001', hint = 'invalid_dates';
  end if;
  if new.is_free then
    new.price_try := null;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists events_before_write on public.events;
create trigger events_before_write before insert or update on public.events
  for each row execute function private.events_before_write();

-- updated_at for the business sub-tables.
drop trigger if exists set_updated_at on public.business_menu_sections;
create trigger set_updated_at before update on public.business_menu_sections for each row execute function private.set_updated_at();
drop trigger if exists set_updated_at on public.business_menu_items;
create trigger set_updated_at before update on public.business_menu_items for each row execute function private.set_updated_at();
drop trigger if exists set_updated_at on public.business_rooms;
create trigger set_updated_at before update on public.business_rooms for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. RLS: public reads what an approved business publishes; only the owner (or an admin) writes.
-- ---------------------------------------------------------------------------
alter table public.business_menu_sections enable row level security;
alter table public.business_menu_items enable row level security;
alter table public.business_rooms enable row level security;
alter table public.events enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['business_menu_sections', 'business_menu_items', 'business_rooms'] loop
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format('drop policy if exists "owner write" on public.%I', t);
    execute format($p$create policy "public read" on public.%I for select to anon, authenticated
      using (public.business_is_public(business_id) or public.owns_business(business_id) or public.is_admin())$p$, t);
    execute format($p$create policy "owner write" on public.%I for all to authenticated
      using (public.owns_business(business_id) or public.is_admin())
      with check (public.owns_business(business_id) or public.is_admin())$p$, t);
  end loop;
end $$;

drop policy if exists "public read" on public.events;
drop policy if exists "owner insert" on public.events;
drop policy if exists "owner update" on public.events;
drop policy if exists "owner delete" on public.events;
create policy "public read" on public.events for select to anon, authenticated
  using (
    (status = 'published' and (business_id is null or public.business_is_public(business_id)))
    or created_by = (select auth.uid())
    or (business_id is not null and public.owns_business(business_id))
    or public.is_admin()
  );
create policy "owner insert" on public.events for insert to authenticated
  with check ((business_id is not null and public.owns_business(business_id) and public.business_is_public(business_id)) or public.is_admin());
create policy "owner update" on public.events for update to authenticated
  using ((business_id is not null and public.owns_business(business_id)) or public.is_admin())
  with check ((business_id is not null and public.owns_business(business_id)) or public.is_admin());
create policy "owner delete" on public.events for delete to authenticated
  using ((business_id is not null and public.owns_business(business_id)) or public.is_admin());

grant select on public.business_menu_sections, public.business_menu_items, public.business_rooms, public.events to anon, authenticated;
grant insert, update, delete on public.business_menu_sections, public.business_menu_items, public.business_rooms, public.events to authenticated;
