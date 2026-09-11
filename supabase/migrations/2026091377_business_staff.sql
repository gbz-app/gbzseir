-- Doctors of sağlık businesses (owner: "Sağlığa doktorlar ekle"). A doctor belongs to one clinic (a business with
-- vertical 'saglik'); calls always go to the clinic's phone, so there is no personal phone column. The owner confirms the
-- person's consent (KVKK) before publishing: consent_confirmed_at is required and stamped by the server. Admins can also
-- edit. Branches come from a small admin-managed vocabulary (same shape as place_categories). The table is generic
-- ("staff") so other types can get people later; for now only sağlık owners can add or edit rows.
-- Re-runnable: seeds never overwrite existing rows.

-- 1) Branch vocabulary ----------------------------------------------------------------------------------------------
create table if not exists public.doctor_branches (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label text not null check (char_length(btrim(label)) between 1 and 40),
  icon text check (icon is null or icon ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  sort int not null default 100 check (sort between 0 and 10000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.doctor_branches is 'Values of business_staff.branch (foreign key). icon = lucide name. Inactive branches are hidden from pickers but still label older rows.';

drop trigger if exists set_updated_at on public.doctor_branches;
create trigger set_updated_at before update on public.doctor_branches for each row execute function private.set_updated_at();
-- Keys never change (business_staff references them); a used branch cannot be deleted (foreign key).
drop trigger if exists vocabulary_guard on public.doctor_branches;
create trigger vocabulary_guard before update or delete on public.doctor_branches for each row execute function private.vocabulary_guard();

-- Friendly delete guard of its own (the shared vocabulary_guard is left untouched): "Diğer" is the column default, and a
-- branch somebody works in would otherwise only hit the raw foreign-key error.
create or replace function private.doctor_branch_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  if old.key = 'diger' then
    raise exception 'Diğer branşı varsayılandır, silinemez.' using errcode = 'P0001', hint = 'in_use';
  end if;
  select count(*) into v_n from public.business_staff where branch = old.key;
  if v_n > 0 then
    raise exception 'Bu branşta % kişi var. Silmek yerine pasife alabilirsin.', v_n using errcode = 'P0001', hint = 'in_use';
  end if;
  return old;
end $$;

revoke all on function private.doctor_branch_guard() from public, anon, authenticated;

drop trigger if exists doctor_branch_guard on public.doctor_branches;
create trigger doctor_branch_guard before delete on public.doctor_branches for each row execute function private.doctor_branch_guard();

insert into public.doctor_branches (key, label, icon, sort) values
  ('dis_hekimi', 'Diş hekimi', 'toothbrush', 10),
  ('goz', 'Göz', 'eye', 20),
  ('kadin_dogum', 'Kadın hastalıkları ve doğum', 'venus', 30),
  ('cocuk', 'Çocuk sağlığı', 'baby', 40),
  ('dahiliye', 'Dahiliye', 'stethoscope', 50),
  ('kardiyoloji', 'Kardiyoloji', 'heart-pulse', 60),
  ('ortopedi', 'Ortopedi', 'bone', 70),
  ('fizik_tedavi', 'Fizik tedavi', 'person-standing', 80),
  ('dermatoloji', 'Dermatoloji', 'scan-face', 90),
  ('kbb', 'KBB', 'ear', 100),
  ('noroloji', 'Nöroloji', 'brain', 110),
  ('psikiyatri', 'Psikiyatri', 'brain-cog', 120),
  ('psikolog', 'Psikolog', 'hand-heart', 130),
  ('diyetisyen', 'Diyetisyen', 'salad', 140),
  ('pratisyen', 'Genel pratisyen', 'hospital', 150),
  ('diger', 'Diğer', 'user-round', 160)
on conflict (key) do nothing;

-- 2) Staff ----------------------------------------------------------------------------------------------------------
create table if not exists public.business_staff (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  title text not null default 'Dr.'
    check (title in ('Dr.', 'Uzm. Dr.', 'Doç. Dr.', 'Prof. Dr.', 'Dt.', 'Uzm. Dt.', 'Fzt.', 'Psk.', 'Klinik Psk.', 'Dyt.', 'Ebe', 'Hemşire', 'Diğer')),
  branch text not null default 'diger' references public.doctor_branches (key),
  photo_url text check (photo_url is null or (photo_url ~ '^https://' and char_length(photo_url) <= 500)),
  bio text check (bio is null or char_length(bio) <= 300),
  days text[] not null default '{}'
    check (days <@ array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']::text[] and cardinality(days) <= 7),
  hours_note text check (hours_note is null or char_length(hours_note) <= 80),
  sort int not null default 0 check (sort between 0 and 10000),
  is_active boolean not null default true,
  consent_confirmed_at timestamptz not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.business_staff is 'People of a business (for now: doctors of sağlık clinics). No personal phone: the page calls the business. consent_confirmed_at = when the owner confirmed the person agreed to be listed (KVKK).';
comment on column public.business_staff.days is 'Weekday keys (mon..sun) the person works at this business, in week order.';

create index if not exists business_staff_business_idx on public.business_staff (business_id, sort);
create index if not exists business_staff_branch_idx on public.business_staff (branch);

-- Normalizes the row and keeps API writers honest: owners cannot mark rows as demo, move a person to another business
-- or back-date the consent (the server stamps it). Admins and the service role (migrations, seeds) are trusted.
create or replace function private.business_staff_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.name := btrim(new.name);
  new.bio := nullif(btrim(coalesce(new.bio, '')), '');
  new.hours_note := nullif(btrim(coalesce(new.hours_note, '')), '');
  -- Week order, no duplicates.
  new.days := coalesce(array(
    select d from unnest(array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) with ordinality as w(d, i)
     where d = any(coalesce(new.days, '{}'::text[])) order by i
  ), '{}'::text[]);
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    if tg_op = 'INSERT' then
      if new.consent_confirmed_at is null then
        raise exception 'Bu kişinin bilgilerini yayınlamak için onayı olduğunu işaretlemelisin.' using errcode = 'P0001', hint = 'consent_required';
      end if;
      new.consent_confirmed_at := now();
      new.is_demo := false;
      new.created_at := now();
    else
      new.business_id := old.business_id;
      new.is_demo := old.is_demo;
      new.created_at := old.created_at;
      if new.consent_confirmed_at is distinct from old.consent_confirmed_at then
        new.consent_confirmed_at := now();
      end if;
    end if;
  end if;
  return new;
end $$;

revoke all on function private.business_staff_before_write() from public, anon, authenticated;

drop trigger if exists business_staff_before_write on public.business_staff;
create trigger business_staff_before_write before insert or update on public.business_staff
  for each row execute function private.business_staff_before_write();
drop trigger if exists set_updated_at on public.business_staff;
create trigger set_updated_at before update on public.business_staff for each row execute function private.set_updated_at();

-- 3) RLS -------------------------------------------------------------------------------------------------------------
alter table public.doctor_branches enable row level security;
alter table public.business_staff enable row level security;

drop policy if exists "public read" on public.doctor_branches;
drop policy if exists "admin write" on public.doctor_branches;
create policy "public read" on public.doctor_branches for select to anon, authenticated using (true);
create policy "admin write" on public.doctor_branches for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Visitors see active people of public businesses; the owner and admins see every row.
drop policy if exists "public read" on public.business_staff;
drop policy if exists "owner insert" on public.business_staff;
drop policy if exists "owner update" on public.business_staff;
drop policy if exists "owner delete" on public.business_staff;
create policy "public read" on public.business_staff for select to anon, authenticated
  using ((is_active and public.business_is_public(business_id)) or public.owns_business(business_id) or public.is_admin());
-- Owners add and edit people only on their sağlık businesses; admins everywhere.
create policy "owner insert" on public.business_staff for insert to authenticated
  with check (
    (public.owns_business(business_id) and exists (select 1 from public.businesses b where b.id = business_id and b.vertical = 'saglik'))
    or public.is_admin()
  );
create policy "owner update" on public.business_staff for update to authenticated
  using (public.owns_business(business_id) or public.is_admin())
  with check (
    (public.owns_business(business_id) and exists (select 1 from public.businesses b where b.id = business_id and b.vertical = 'saglik'))
    or public.is_admin()
  );
-- Removing a person is always possible for the owner (KVKK: a listed person can ask to be taken down).
create policy "owner delete" on public.business_staff for delete to authenticated
  using (public.owns_business(business_id) or public.is_admin());

revoke all on table public.doctor_branches, public.business_staff from anon, authenticated;
grant select on table public.doctor_branches, public.business_staff to anon, authenticated;
grant insert, update, delete on table public.doctor_branches, public.business_staff to authenticated;

-- 4) Demo doctors for the demo sağlık businesses (generic names, is_demo: shown with the "Örnek" badge) ---------------
insert into public.business_staff (business_id, name, title, branch, bio, days, hours_note, sort, consent_confirmed_at, is_demo)
select b.id, s.name, s.title, s.branch, s.bio, s.days, s.hours_note, s.sort, now(), true
  from (values
    ('gulus-dis-klinigi', 'Zeynep Demir', 'Dt.', 'dis_hekimi', 'Dolgu, kanal tedavisi ve diş beyazlatma.', array['mon', 'tue', 'wed', 'thu', 'fri'], '09:00 - 18:00', 0),
    ('gulus-dis-klinigi', 'Emre Şahin', 'Uzm. Dt.', 'dis_hekimi', 'Ortodonti uzmanı. Şeffaf plak ve braket tedavisi.', array['tue', 'thu', 'sat'], '10:00 - 17:00', 1),
    ('gulus-dis-klinigi', 'Selin Arslan', 'Dt.', 'dis_hekimi', 'Çocuk hastalarla çalışıyor; ilk muayene ve koruyucu bakım.', array['wed', 'fri', 'sat'], '09:00 - 15:00', 2),
    ('isik-goz-merkezi', 'Mehmet Kaya', 'Uzm. Dr.', 'goz', 'Göz hastalıkları uzmanı. Katarakt ve göz tansiyonu takibi.', array['mon', 'wed', 'fri'], '09:00 - 17:00', 0),
    ('isik-goz-merkezi', 'Elif Çelik', 'Uzm. Dr.', 'goz', 'Çocuklarda göz muayenesi ve gözlük reçetesi.', array['tue', 'thu'], '09:00 - 17:00', 1),
    ('gebze-yildiz-poliklinigi', 'Ayşe Yılmaz', 'Uzm. Dr.', 'dahiliye', 'İç hastalıkları uzmanı. Check-up ve kronik hastalık takibi.', array['mon', 'tue', 'wed', 'thu', 'fri'], '08:30 - 17:30', 0),
    ('gebze-yildiz-poliklinigi', 'Burak Aydın', 'Uzm. Dr.', 'cocuk', 'Çocuk sağlığı ve hastalıkları uzmanı. Aşı takibi.', array['mon', 'wed', 'fri', 'sat'], '09:00 - 16:00', 1),
    ('gebze-yildiz-poliklinigi', 'Deniz Koç', 'Uzm. Dr.', 'kadin_dogum', 'Kadın hastalıkları ve doğum uzmanı. Gebelik takibi.', array['tue', 'thu'], '10:00 - 18:00', 2),
    ('denge-fizik-tedavi', 'Can Öztürk', 'Uzm. Dr.', 'fizik_tedavi', 'Fiziksel tıp ve rehabilitasyon uzmanı. Bel ve boyun ağrıları.', array['mon', 'tue', 'wed', 'thu'], '09:00 - 17:00', 0),
    ('denge-fizik-tedavi', 'Ece Aksoy', 'Fzt.', 'fizik_tedavi', 'Spor yaralanmaları ve ameliyat sonrası egzersiz programları.', array['mon', 'wed', 'fri', 'sat'], '10:00 - 19:00', 1),
    ('huzur-psikolojik-danismanlik', 'Nazlı Erdem', 'Klinik Psk.', 'psikolog', 'Yetişkin ve ergenlerle bireysel terapi.', array['mon', 'tue', 'thu'], 'Randevu ile', 0),
    ('huzur-psikolojik-danismanlik', 'Kerem Polat', 'Psk.', 'psikolog', 'Aile ve çift danışmanlığı.', array['wed', 'fri', 'sat'], 'Randevu ile', 1),
    ('pati-veteriner-klinigi', 'Duygu Tan', 'Dr.', 'diger', 'Veteriner hekim. Kedi ve köpek muayenesi, aşı takibi.', array['mon', 'tue', 'wed', 'thu', 'fri'], '09:00 - 19:00', 0),
    ('pati-veteriner-klinigi', 'Oğuz Kurt', 'Dr.', 'diger', 'Veteriner hekim. Küçük hayvan cerrahisi.', array['wed', 'sat', 'sun'], '10:00 - 16:00', 1)
  ) as s(slug, name, title, branch, bio, days, hours_note, sort)
  join public.businesses b on b.slug = s.slug and b.is_demo and b.vertical = 'saglik'
 where not exists (select 1 from public.business_staff x where x.business_id = b.id);

notify pgrst, 'reload schema';
