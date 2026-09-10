-- Admin core (A1): analytics (sessions, page views, installs), store stats, audit log with triggers,
-- finance (categories + entries), settings seed and admin RPCs. Additive and re-runnable.

-- ===========================================================================
-- 1. Analytics
-- ===========================================================================
create table if not exists public.analytics_sessions (
  id uuid primary key,                       -- generated on the device (rotates after 30 min of inactivity)
  user_id uuid references public.profiles (id) on delete set null,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  page_views int not null default 0,
  first_path text,
  last_path text,
  referrer_host text,
  device text check (device is null or device in ('mobile', 'tablet', 'desktop')),
  os text,
  browser text,
  standalone boolean not null default false
);
create index if not exists analytics_sessions_seen_idx on public.analytics_sessions (last_seen_at desc);
create index if not exists analytics_sessions_started_idx on public.analytics_sessions (started_at desc);
create index if not exists analytics_sessions_user_idx on public.analytics_sessions (user_id, started_at desc);

create table if not exists public.analytics_page_views (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.analytics_sessions (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  path text not null check (char_length(path) between 1 and 300),
  created_at timestamptz not null default now(),
  duration_s int                             -- time until the next page view of the session (max 30 min)
);
create index if not exists analytics_page_views_created_idx on public.analytics_page_views (created_at desc);
create index if not exists analytics_page_views_session_idx on public.analytics_page_views (session_id, id desc);
create index if not exists analytics_page_views_user_idx on public.analytics_page_views (user_id, created_at desc);

create table if not exists public.app_installs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid,
  user_id uuid references public.profiles (id) on delete set null,
  platform text not null check (platform in ('pwa_android', 'pwa_ios', 'pwa_desktop', 'android', 'ios')),
  source text not null check (source in ('appinstalled', 'standalone', 'store')),
  created_at timestamptz not null default now(),
  constraint app_installs_session_source_uq unique (session_id, source)
);
create index if not exists app_installs_created_idx on public.app_installs (created_at desc);

-- Google Play / App Store numbers, entered by admins until the store APIs are connected.
create table if not exists public.store_stats (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('google_play', 'app_store')),
  stat_date date not null,
  downloads int check (downloads is null or downloads >= 0),
  active_installs int check (active_installs is null or active_installs >= 0),
  rating numeric(2, 1) check (rating is null or rating between 0 and 5),
  ratings_count int check (ratings_count is null or ratings_count >= 0),
  reviews_count int check (reviews_count is null or reviews_count >= 0),
  note text check (note is null or char_length(note) <= 300),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint store_stats_platform_date_uq unique (platform, stat_date)
);

alter table public.analytics_sessions enable row level security;
alter table public.analytics_page_views enable row level security;
alter table public.app_installs enable row level security;
alter table public.store_stats enable row level security;

drop policy if exists "admin read" on public.analytics_sessions;
create policy "admin read" on public.analytics_sessions for select to authenticated using (public.is_admin());
drop policy if exists "admin read" on public.analytics_page_views;
create policy "admin read" on public.analytics_page_views for select to authenticated using (public.is_admin());
drop policy if exists "admin read" on public.app_installs;
create policy "admin read" on public.app_installs for select to authenticated using (public.is_admin());
drop policy if exists "admin all" on public.store_stats;
create policy "admin all" on public.store_stats for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.analytics_sessions, public.analytics_page_views, public.app_installs to authenticated;
grant select, insert, update, delete on public.store_stats to authenticated;

-- Page view (+ session upsert). Called by the in-app tracker for every route change; admin paths are ignored.
create or replace function public.track_page_view(p_session uuid, p_path text, p_meta jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
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

  insert into public.analytics_sessions as s (id, user_id, first_path, last_path, referrer_host, device, os, browser, standalone, page_views)
  values (
    p_session, v_uid, v_path, v_path,
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
    if v_last.duration_s is null then
      update public.analytics_page_views
         set duration_s = least(greatest(extract(epoch from now() - v_last.created_at)::int, 0), 1800)
       where id = v_last.id;
    end if;
  end if;

  insert into public.analytics_page_views (session_id, user_id, path) values (p_session, v_uid, v_path);
  update public.analytics_sessions set page_views = page_views + 1, last_seen_at = now() where id = p_session;
end $$;

-- Heartbeat every minute while the app is visible (drives "online now" and session duration).
create or replace function public.track_heartbeat(p_session uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.analytics_sessions
     set last_seen_at = now(), user_id = coalesce(user_id, auth.uid())
   where id = p_session and last_seen_at > now() - interval '12 hours';
$$;

create or replace function public.track_install(p_session uuid, p_platform text, p_source text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_platform not in ('pwa_android', 'pwa_ios', 'pwa_desktop') or p_source not in ('appinstalled', 'standalone') then
    return;
  end if;
  insert into public.app_installs (session_id, user_id, platform, source)
  values (p_session, auth.uid(), p_platform, p_source)
  on conflict on constraint app_installs_session_source_uq do nothing;
end $$;

revoke all on function public.track_page_view(uuid, text, jsonb) from public;
revoke all on function public.track_heartbeat(uuid) from public;
revoke all on function public.track_install(uuid, text, text) from public;
grant execute on function public.track_page_view(uuid, text, jsonb) to anon, authenticated;
grant execute on function public.track_heartbeat(uuid) to anon, authenticated;
grant execute on function public.track_install(uuid, text, text) to anon, authenticated;

-- ===========================================================================
-- 2. Audit log (account and content activity; written only by triggers / security definer code)
-- ===========================================================================
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor_id uuid,              -- who did it (null = system)
  user_id uuid,               -- whose account it concerns (no FK: rows survive account deletion)
  action text not null,
  entity_type text,
  entity_id uuid,
  summary text not null,
  details jsonb not null default '{}'::jsonb
);
create index if not exists audit_log_user_idx on public.audit_log (user_id, created_at desc);
create index if not exists audit_log_created_idx on public.audit_log (created_at desc);
create index if not exists audit_log_action_idx on public.audit_log (action, created_at desc);

alter table public.audit_log enable row level security;
drop policy if exists "admin read" on public.audit_log;
create policy "admin read" on public.audit_log for select to authenticated using (public.is_admin());
drop policy if exists "own read" on public.audit_log;
create policy "own read" on public.audit_log for select to authenticated using (user_id = (select auth.uid()));
grant select on public.audit_log to authenticated;

create or replace function private.audit(p_user uuid, p_action text, p_entity_type text, p_entity_id uuid, p_summary text, p_details jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (actor_id, user_id, action, entity_type, entity_id, summary, details)
  values (auth.uid(), p_user, p_action, p_entity_type, p_entity_id, p_summary, coalesce(p_details, '{}'::jsonb));
exception when others then
  null; -- auditing must never break the original write
end $$;

-- Profiles
create or replace function private.audit_profiles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform private.audit(new.id, 'profile.created', 'profile', new.id, 'Hesap oluşturuldu', jsonb_build_object('phone', new.phone));
    return new;
  elsif tg_op = 'DELETE' then
    perform private.audit(old.id, 'profile.deleted', 'profile', old.id, 'Hesap silindi', jsonb_build_object('phone', old.phone, 'name', old.full_name));
    return old;
  end if;
  if new.avatar_url is distinct from old.avatar_url then
    perform private.audit(new.id, 'profile.avatar', 'profile', new.id,
      case when new.avatar_url is null then 'Profil fotoğrafı kaldırıldı' else 'Profil fotoğrafı değiştirildi' end,
      jsonb_build_object('from', old.avatar_url, 'to', new.avatar_url));
  end if;
  if new.full_name is distinct from old.full_name then
    perform private.audit(new.id, 'profile.name', 'profile', new.id, 'Ad soyad değiştirildi', jsonb_build_object('from', old.full_name, 'to', new.full_name));
  end if;
  if new.phone is distinct from old.phone then
    perform private.audit(new.id, 'profile.phone', 'profile', new.id, 'Telefon numarası değiştirildi', jsonb_build_object('from', old.phone, 'to', new.phone));
  end if;
  if new.email is distinct from old.email then
    perform private.audit(new.id, 'profile.email', 'profile', new.id, 'E-posta değiştirildi', jsonb_build_object('from', old.email, 'to', new.email));
  end if;
  if new.neighbourhood_id is distinct from old.neighbourhood_id then
    perform private.audit(new.id, 'profile.neighbourhood', 'profile', new.id, 'Mahalle değiştirildi',
      jsonb_build_object('to', (select name from public.neighbourhoods where id = new.neighbourhood_id)));
  end if;
  if new.status is distinct from old.status then
    perform private.audit(new.id, 'profile.status', 'profile', new.id, 'Hesap durumu: ' || old.status || ' → ' || new.status, jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  if new.role is distinct from old.role then
    perform private.audit(new.id, 'profile.role', 'profile', new.id, 'Rol: ' || old.role || ' → ' || new.role, jsonb_build_object('from', old.role, 'to', new.role));
  end if;
  if new.marketing_consent is distinct from old.marketing_consent then
    perform private.audit(new.id, 'profile.consent', 'profile', new.id,
      case when new.marketing_consent then 'Ticari ileti izni verildi' else 'Ticari ileti izni geri alındı' end, '{}'::jsonb);
  end if;
  if new.trusted_publisher is distinct from old.trusted_publisher then
    perform private.audit(new.id, 'profile.trusted', 'profile', new.id,
      case when new.trusted_publisher then 'Güvenilir yayıncı yapıldı' else 'Güvenilir yayıncılık kaldırıldı' end, '{}'::jsonb);
  end if;
  return new;
end $$;

drop trigger if exists audit_profiles on public.profiles;
create trigger audit_profiles after insert or update on public.profiles for each row execute function private.audit_profiles();
drop trigger if exists audit_profiles_delete on public.profiles;
create trigger audit_profiles_delete before delete on public.profiles for each row execute function private.audit_profiles();

-- Sign-ins (GoTrue updates auth.users.last_sign_in_at on every OTP login)
create or replace function private.audit_auth_login()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (actor_id, user_id, action, entity_type, entity_id, summary, details)
  values (new.id, new.id, 'auth.login', 'profile', new.id, 'Giriş yapıldı',
          jsonb_build_object('provider', coalesce(new.raw_app_meta_data ->> 'provider', 'phone')));
  return new;
exception when others then
  return new;
end $$;

drop trigger if exists audit_auth_login on auth.users;
create trigger audit_auth_login after update of last_sign_in_at on auth.users
  for each row when (new.last_sign_in_at is distinct from old.last_sign_in_at)
  execute function private.audit_auth_login();

-- Businesses
create or replace function private.audit_businesses()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fields text[];
begin
  if tg_op = 'INSERT' then
    perform private.audit(new.owner_id, 'business.created', 'business', new.id, 'İşletme kaydı oluşturuldu: ' || new.name, jsonb_build_object('status', new.status));
    return new;
  end if;
  if new.status is distinct from old.status then
    perform private.audit(new.owner_id, 'business.status', 'business', new.id, 'İşletme durumu: ' || old.status || ' → ' || new.status,
      jsonb_build_object('from', old.status, 'to', new.status, 'reason', new.rejection_reason));
  end if;
  if new.vacation_mode is distinct from old.vacation_mode then
    perform private.audit(new.owner_id, 'business.vacation', 'business', new.id,
      case when new.vacation_mode then 'Tatil modu açıldı' else 'Tatil modu kapatıldı' end, '{}'::jsonb);
  end if;
  v_fields := array_remove(array[
    case when new.name is distinct from old.name then 'ad' end,
    case when new.description is distinct from old.description then 'açıklama' end,
    case when new.phone is distinct from old.phone then 'telefon' end,
    case when new.address is distinct from old.address or new.location is distinct from old.location then 'konum' end,
    case when new.logo_url is distinct from old.logo_url then 'logo' end,
    case when new.cover_url is distinct from old.cover_url then 'kapak' end,
    case when new.working_hours is distinct from old.working_hours then 'saatler' end,
    case when new.vertical is distinct from old.vertical then 'tür' end,
    case when new.category_label is distinct from old.category_label then 'kısa tanım' end,
    case when new.amenities is distinct from old.amenities then 'olanaklar' end,
    case when new.price_level is distinct from old.price_level or new.star_rating is distinct from old.star_rating then 'fiyat/yıldız' end,
    case when new.website is distinct from old.website or new.instagram is distinct from old.instagram then 'web' end
  ], null);
  if cardinality(v_fields) > 0 then
    perform private.audit(new.owner_id, 'business.updated', 'business', new.id, 'İşletme bilgileri güncellendi: ' || array_to_string(v_fields, ', '),
      jsonb_build_object('fields', v_fields));
  end if;
  return new;
end $$;

drop trigger if exists audit_businesses on public.businesses;
create trigger audit_businesses after insert or update on public.businesses for each row execute function private.audit_businesses();

-- Listings
create or replace function private.audit_listings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform private.audit(new.owner_id, 'listing.created', 'listing', new.id,
      (case when new.type = 'job' then 'İş ilanı verildi: ' else 'İlan verildi: ' end) || new.title, jsonb_build_object('status', new.status));
  elsif new.status is distinct from old.status then
    perform private.audit(new.owner_id, 'listing.status', 'listing', new.id, 'İlan durumu: ' || old.status || ' → ' || new.status || ' (' || new.title || ')',
      jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return new;
end $$;

drop trigger if exists audit_listings on public.listings;
create trigger audit_listings after insert or update on public.listings for each row execute function private.audit_listings();

-- Reviews, support messages, events
create or replace function private.audit_misc()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'reviews' then
    perform private.audit(new.author_id, 'review.created', 'business', new.business_id, 'Yorum yazdı (' || new.rating || ' yıldız)', '{}'::jsonb);
  elsif tg_table_name = 'contact_messages' then
    perform private.audit(new.user_id, 'support.message', 'support', new.id, 'Destek mesajı gönderdi (' || new.topic || ')', '{}'::jsonb);
  elsif tg_table_name = 'events' then
    perform private.audit(new.created_by, 'event.created', 'event', new.id, 'Etkinlik ekledi: ' || new.title, '{}'::jsonb);
  end if;
  return new;
end $$;

drop trigger if exists audit_reviews on public.reviews;
create trigger audit_reviews after insert on public.reviews for each row execute function private.audit_misc();
drop trigger if exists audit_contact_messages on public.contact_messages;
create trigger audit_contact_messages after insert on public.contact_messages for each row execute function private.audit_misc();
drop trigger if exists audit_events on public.events;
create trigger audit_events after insert on public.events for each row execute function private.audit_misc();

-- ===========================================================================
-- 3. Finance (muhasebe)
-- ===========================================================================
create table if not exists public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('income', 'expense')),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  color text not null default '#8c6cf0' check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint finance_categories_kind_name_uq unique (kind, name)
);

create table if not exists public.finance_entries (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('income', 'expense')),
  category_id uuid references public.finance_categories (id) on delete set null,
  amount numeric(14, 2) not null check (amount > 0 and amount < 1000000000),
  vat_rate numeric(5, 2) not null default 0 check (vat_rate between 0 and 100),
  occurred_on date not null default current_date,
  description text check (description is null or char_length(description) <= 300),
  counterparty text check (counterparty is null or char_length(counterparty) <= 120),
  business_id uuid references public.businesses (id) on delete set null,
  payment_method text not null default 'havale' check (payment_method in ('nakit', 'havale', 'kart', 'diger')),
  document_url text check (document_url is null or char_length(document_url) <= 500),
  is_demo boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists finance_entries_date_idx on public.finance_entries (occurred_on desc);
create index if not exists finance_entries_kind_idx on public.finance_entries (kind, occurred_on desc);

drop trigger if exists set_updated_at on public.finance_entries;
create trigger set_updated_at before update on public.finance_entries for each row execute function private.set_updated_at();

alter table public.finance_categories enable row level security;
alter table public.finance_entries enable row level security;
drop policy if exists "admin all" on public.finance_categories;
create policy "admin all" on public.finance_categories for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin all" on public.finance_entries;
create policy "admin all" on public.finance_entries for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.finance_categories, public.finance_entries to authenticated;

insert into public.finance_categories (kind, name, color, sort) values
  ('income', 'Reklam geliri', '#8c6cf0', 1),
  ('income', 'Öne çıkarma', '#22c55e', 2),
  ('income', 'Sponsorluk', '#0ea5e9', 3),
  ('income', 'Etkinlik tanıtımı', '#f59e0b', 4),
  ('income', 'Diğer gelir', '#64748b', 9),
  ('expense', 'Sunucu ve altyapı', '#ef4444', 1),
  ('expense', 'SMS ve bildirim', '#f97316', 2),
  ('expense', 'Pazarlama', '#ec4899', 3),
  ('expense', 'Personel', '#a855f7', 4),
  ('expense', 'Vergi ve harçlar', '#eab308', 5),
  ('expense', 'Yazılım ve lisans', '#06b6d4', 6),
  ('expense', 'Ofis', '#84cc16', 7),
  ('expense', 'Diğer gider', '#64748b', 9)
on conflict on constraint finance_categories_kind_name_uq do nothing;

create or replace function private.audit_finance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.finance_entries := case when tg_op = 'DELETE' then old else new end;
begin
  perform private.audit(null, 'finance.' || lower(tg_op), 'finance', r.id,
    (case r.kind when 'income' then 'Gelir ' else 'Gider ' end)
      || (case tg_op when 'INSERT' then 'eklendi' when 'UPDATE' then 'güncellendi' else 'silindi' end)
      || ': ' || r.amount || ' TL', jsonb_build_object('kind', r.kind, 'amount', r.amount, 'date', r.occurred_on));
  return r;
end $$;

drop trigger if exists audit_finance on public.finance_entries;
create trigger audit_finance after insert or update or delete on public.finance_entries for each row execute function private.audit_finance();

-- ===========================================================================
-- 4. Settings (keys used by the admin settings screen)
-- ===========================================================================
insert into public.app_settings (key, value) values
  ('support_phone', '"+908500000000"'::jsonb),
  ('support_email', '"destek@gebzem.app"'::jsonb),
  ('maintenance_banner', '""'::jsonb),
  ('feature_business_applications', 'false'::jsonb),
  ('analytics_retention_days', '180'::jsonb)
on conflict (key) do nothing;

alter table public.app_settings enable row level security;
drop policy if exists "admin write" on public.app_settings;
create policy "admin write" on public.app_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ===========================================================================
-- 5. Admin RPCs
-- ===========================================================================
create or replace function private.assert_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;
end $$;

create or replace function public.admin_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
  v_today_start timestamptz := v_today::timestamp at time zone 'Europe/Istanbul';
begin
  perform private.assert_admin();
  return jsonb_build_object(
    'generated_at', now(),
    'users', jsonb_build_object(
      'total', (select count(*) from public.profiles),
      'today', (select count(*) from public.profiles where created_at >= v_today_start),
      'week', (select count(*) from public.profiles where created_at >= v_today_start - interval '6 days'),
      'business_owners', (select count(distinct owner_id) from public.businesses where status = 'approved'),
      'restricted', (select count(*) from public.profiles where status <> 'active'),
      'demo', (select count(*) from public.profiles where is_demo)),
    'businesses', jsonb_build_object(
      'approved', (select count(*) from public.businesses where status = 'approved'),
      'pending', (select count(*) from public.businesses where status = 'pending'),
      'by_vertical', (select coalesce(jsonb_object_agg(v, n), '{}'::jsonb) from (
        select coalesce(vertical, 'diger') as v, count(*)::int as n from public.businesses where status = 'approved' group by 1) x)),
    'content', jsonb_build_object(
      'listings_active', (select count(*) from public.listings where status = 'active'),
      'listings_pending', (select count(*) from public.listings where status = 'pending_review'),
      'reports_open', (select count(*) from public.reports where status = 'open'),
      'support_new', (select count(*) from public.contact_messages where status = 'new'),
      'events_upcoming', (select count(*) from public.events where status = 'published' and coalesce(ends_at, starts_at) >= now()),
      'requests_open', (select count(*) from public.service_requests where status in ('admin_review', 'open'))),
    'live', jsonb_build_object(
      'online_now', (select count(*) from public.analytics_sessions where last_seen_at > now() - interval '2 minutes'),
      'online_users', (select count(distinct user_id) from public.analytics_sessions where last_seen_at > now() - interval '2 minutes' and user_id is not null)),
    'today', (select jsonb_build_object(
        'sessions', count(*),
        'visitors', count(distinct coalesce(user_id::text, id::text)),
        'signed_in', count(distinct user_id),
        'avg_duration_s', coalesce(round(avg(extract(epoch from last_seen_at - started_at)) filter (where page_views > 0))::int, 0))
      from public.analytics_sessions where started_at >= v_today_start),
    'page_views_today', (select count(*) from public.analytics_page_views where created_at >= v_today_start),
    'installs', jsonb_build_object(
      'total', (select count(*) from public.app_installs),
      'week', (select count(*) from public.app_installs where created_at >= v_today_start - interval '6 days'),
      'by_platform', (select coalesce(jsonb_object_agg(platform, n), '{}'::jsonb) from (select platform, count(*)::int as n from public.app_installs group by 1) x),
      'store', (select coalesce(jsonb_object_agg(platform, to_jsonb(s) - 'platform' - 'id' - 'created_by' - 'created_at'), '{}'::jsonb) from (
        select distinct on (platform) * from public.store_stats order by platform, stat_date desc) s)),
    'series', (select coalesce(jsonb_agg(jsonb_build_object('date', d::date, 'signups', su, 'sessions', se, 'page_views', pv) order by d), '[]'::jsonb) from (
        select d,
          (select count(*) from public.profiles p where (p.created_at at time zone 'Europe/Istanbul')::date = d::date) as su,
          (select count(*) from public.analytics_sessions s where (s.started_at at time zone 'Europe/Istanbul')::date = d::date) as se,
          (select count(*) from public.analytics_page_views v where (v.created_at at time zone 'Europe/Istanbul')::date = d::date) as pv
        from generate_series(v_today - 13, v_today, interval '1 day') d) x),
    'top_pages', (select coalesce(jsonb_agg(jsonb_build_object('path', path, 'views', n) order by n desc), '[]'::jsonb) from (
        select path, count(*)::int as n from public.analytics_page_views where created_at >= now() - interval '7 days' group by 1 order by 2 desc limit 8) x)
  );
end $$;

create or replace function public.admin_online_now()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform private.assert_admin();
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'session', left(s.id::text, 8), 'user_id', s.user_id, 'name', p.full_name, 'path', s.last_path, 'started_at', s.started_at,
      'last_seen_at', s.last_seen_at, 'page_views', s.page_views, 'device', s.device, 'os', s.os, 'standalone', s.standalone)
      order by s.last_seen_at desc), '[]'::jsonb)
    from (select * from public.analytics_sessions where last_seen_at > now() - interval '2 minutes' order by last_seen_at desc limit 100) s
    left join public.profiles p on p.id = s.user_id);
end $$;

create or replace function public.admin_analytics(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days int := least(greatest(coalesce(p_days, 30), 1), 365);
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
  v_from timestamptz := (v_today - (v_days - 1))::timestamp at time zone 'Europe/Istanbul';
begin
  perform private.assert_admin();
  return jsonb_build_object(
    'days', v_days,
    'totals', (select jsonb_build_object(
        'sessions', count(*),
        'visitors', count(distinct coalesce(user_id::text, id::text)),
        'signed_in', count(distinct user_id),
        'page_views', coalesce(sum(page_views), 0),
        'avg_duration_s', coalesce(round(avg(extract(epoch from last_seen_at - started_at)) filter (where page_views > 0))::int, 0),
        'bounce_rate', case when count(*) filter (where page_views > 0) = 0 then 0
          else round(100.0 * count(*) filter (where page_views = 1) / count(*) filter (where page_views > 0), 1) end,
        'standalone_share', case when count(*) = 0 then 0 else round(100.0 * count(*) filter (where standalone) / count(*), 1) end)
      from public.analytics_sessions where started_at >= v_from),
    'series', (select coalesce(jsonb_agg(jsonb_build_object('date', d::date, 'sessions', se, 'visitors', vi, 'page_views', pv, 'installs', ins) order by d), '[]'::jsonb) from (
        select d,
          (select count(*) from public.analytics_sessions s where (s.started_at at time zone 'Europe/Istanbul')::date = d::date) as se,
          (select count(distinct coalesce(s.user_id::text, s.id::text)) from public.analytics_sessions s where (s.started_at at time zone 'Europe/Istanbul')::date = d::date) as vi,
          (select count(*) from public.analytics_page_views v where (v.created_at at time zone 'Europe/Istanbul')::date = d::date) as pv,
          (select count(*) from public.app_installs i where (i.created_at at time zone 'Europe/Istanbul')::date = d::date) as ins
        from generate_series(v_today - (v_days - 1), v_today, interval '1 day') d) x),
    'top_pages', (select coalesce(jsonb_agg(jsonb_build_object('path', path, 'views', n, 'avg_s', a) order by n desc), '[]'::jsonb) from (
        select path, count(*)::int as n, coalesce(round(avg(duration_s))::int, 0) as a
          from public.analytics_page_views where created_at >= v_from group by 1 order by 2 desc limit 15) x),
    'devices', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (select coalesce(device, 'bilinmiyor') as k, count(*)::int as n from public.analytics_sessions where started_at >= v_from group by 1) x),
    'os', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (select coalesce(os, 'Diğer') as k, count(*)::int as n from public.analytics_sessions where started_at >= v_from group by 1) x),
    'browsers', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (select coalesce(browser, 'Diğer') as k, count(*)::int as n from public.analytics_sessions where started_at >= v_from group by 1) x),
    'referrers', (select coalesce(jsonb_agg(jsonb_build_object('host', k, 'sessions', n) order by n desc), '[]'::jsonb) from (
        select referrer_host as k, count(*)::int as n from public.analytics_sessions where started_at >= v_from and referrer_host is not null group by 1 order by 2 desc limit 10) x),
    'installs', (select coalesce(jsonb_object_agg(platform, n), '{}'::jsonb) from (select platform, count(*)::int as n from public.app_installs where created_at >= v_from group by 1) x),
    'store', (select coalesce(jsonb_agg(to_jsonb(s) order by s.stat_date desc), '[]'::jsonb) from (select * from public.store_stats order by stat_date desc limit 30) s)
  );
end $$;

create or replace function public.admin_user_overview(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform private.assert_admin();
  if not exists (select 1 from public.profiles where id = p_user) then
    return null;
  end if;
  return jsonb_build_object(
    'profile', (select to_jsonb(p) - 'search_norm' || jsonb_build_object(
        'neighbourhood', (select name from public.neighbourhoods where id = p.neighbourhood_id),
        'last_sign_in_at', (select last_sign_in_at from auth.users where id = p.id))
      from public.profiles p where p.id = p_user),
    'counts', jsonb_build_object(
      'listings', (select count(*) from public.listings where owner_id = p_user),
      'listings_active', (select count(*) from public.listings where owner_id = p_user and status = 'active'),
      'reviews', (select count(*) from public.reviews where author_id = p_user),
      'requests', (select count(*) from public.service_requests where customer_id = p_user),
      'favorites', (select count(*) from public.favorites where user_id = p_user),
      'reports_made', (select count(*) from public.reports where reporter_id = p_user),
      'reports_against', (select count(*) from public.reports r where r.target_type = 'user' and r.target_id = p_user),
      'support_messages', (select count(*) from public.contact_messages where user_id = p_user)),
    'businesses', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'slug', slug, 'status', status, 'vertical', vertical)), '[]'::jsonb)
      from public.businesses where owner_id = p_user),
    'usage', (select jsonb_build_object(
        'sessions', count(*),
        'page_views', coalesce(sum(page_views), 0),
        'total_s', coalesce(sum(extract(epoch from last_seen_at - started_at))::int, 0),
        'avg_s', coalesce(round(avg(extract(epoch from last_seen_at - started_at)))::int, 0),
        'last_seen_at', max(last_seen_at),
        'devices', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (select coalesce(device, 'bilinmiyor') k, count(*)::int n from public.analytics_sessions where user_id = p_user group by 1) d))
      from public.analytics_sessions where user_id = p_user),
    'sessions', (select coalesce(jsonb_agg(jsonb_build_object('id', left(id::text, 8), 'started_at', started_at, 'last_seen_at', last_seen_at,
        'page_views', page_views, 'device', device, 'os', os, 'browser', browser, 'standalone', standalone) order by started_at desc), '[]'::jsonb)
      from (select * from public.analytics_sessions where user_id = p_user order by started_at desc limit 20) s),
    'page_views', (select coalesce(jsonb_agg(jsonb_build_object('path', path, 'at', created_at, 'duration_s', duration_s) order by created_at desc), '[]'::jsonb)
      from (select * from public.analytics_page_views where user_id = p_user order by created_at desc limit 60) v),
    'top_pages', (select coalesce(jsonb_agg(jsonb_build_object('path', path, 'views', n) order by n desc), '[]'::jsonb)
      from (select path, count(*)::int n from public.analytics_page_views where user_id = p_user group by 1 order by 2 desc limit 8) t),
    'audit', (select coalesce(jsonb_agg(jsonb_build_object('at', created_at, 'action', action, 'summary', summary, 'actor', actor_id, 'details', details) order by created_at desc), '[]'::jsonb)
      from (select * from public.audit_log where user_id = p_user order by created_at desc limit 100) a)
  );
end $$;

create or replace function public.admin_finance_summary(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_to date := coalesce(p_to, (now() at time zone 'Europe/Istanbul')::date);
  v_from date := coalesce(p_from, date_trunc('month', v_to)::date);
begin
  perform private.assert_admin();
  return jsonb_build_object(
    'from', v_from,
    'to', v_to,
    'totals', (select jsonb_build_object(
        'income', coalesce(sum(amount) filter (where kind = 'income'), 0),
        'expense', coalesce(sum(amount) filter (where kind = 'expense'), 0),
        'vat_income', coalesce(sum(amount * vat_rate / (100 + vat_rate)) filter (where kind = 'income'), 0),
        'vat_expense', coalesce(sum(amount * vat_rate / (100 + vat_rate)) filter (where kind = 'expense'), 0),
        'count', count(*))
      from public.finance_entries where occurred_on between v_from and v_to),
    'by_category', (select coalesce(jsonb_agg(jsonb_build_object('kind', x.kind, 'name', x.name, 'color', x.color, 'total', x.total) order by x.kind, x.total desc), '[]'::jsonb) from (
        select e.kind, coalesce(c.name, 'Kategorisiz') as name, coalesce(c.color, '#94a3b8') as color, sum(e.amount) as total
          from public.finance_entries e left join public.finance_categories c on c.id = e.category_id
         where e.occurred_on between v_from and v_to group by 1, 2, 3) x),
    'monthly', (select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'), 'income', i, 'expense', ex) order by m), '[]'::jsonb) from (
        select m,
          (select coalesce(sum(amount), 0) from public.finance_entries where kind = 'income' and date_trunc('month', occurred_on) = m) as i,
          (select coalesce(sum(amount), 0) from public.finance_entries where kind = 'expense' and date_trunc('month', occurred_on) = m) as ex
        from generate_series(date_trunc('month', v_to) - interval '11 months', date_trunc('month', v_to), interval '1 month') m) x)
  );
end $$;

revoke all on function public.admin_dashboard() from public;
revoke all on function public.admin_online_now() from public;
revoke all on function public.admin_analytics(int) from public;
revoke all on function public.admin_user_overview(uuid) from public;
revoke all on function public.admin_finance_summary(date, date) from public;
grant execute on function public.admin_dashboard() to authenticated;
grant execute on function public.admin_online_now() to authenticated;
grant execute on function public.admin_analytics(int) to authenticated;
grant execute on function public.admin_user_overview(uuid) to authenticated;
grant execute on function public.admin_finance_summary(date, date) to authenticated;

-- ===========================================================================
-- 6. Retention: analytics older than analytics_retention_days (default 180) are removed nightly.
-- ===========================================================================
create or replace function private.cleanup_analytics()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days int := private.app_setting_int('analytics_retention_days', 180);
begin
  delete from public.analytics_page_views where created_at < now() - make_interval(days => v_days);
  delete from public.analytics_sessions where last_seen_at < now() - make_interval(days => v_days);
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'gebzem-analytics-retention';
    perform cron.schedule('gebzem-analytics-retention', '17 3 * * *', 'select private.cleanup_analytics()');
  end if;
end $$;
