-- Category vocabularies (audit step 33). Keşfet sub-category chips per vertical (label, keywords, exclude phrases, sort,
-- active), amenities per scope (business / room) and event categories become admin-managed tables, seeded from the TS
-- constants in src/features/business/lib/verticals.ts (which stay the fallback). events.category is checked with a
-- foreign key instead of a fixed CHECK list, so admin-added categories are valid. Verticals stay fixed. Public read,
-- admin write, audited like other admin content; keys are immutable and used rows cannot be deleted (vocabulary_guard).
-- Re-runnable: seeds never overwrite admin edits.

-- 1) Tables ----------------------------------------------------------------------------------------------------------
create table if not exists public.vertical_subcategories (
  id uuid primary key default gen_random_uuid(),
  vertical text not null check (vertical in ('yemek', 'restoran', 'kafe', 'otel', 'hizmet', 'magaza', 'saglik', 'dugun', 'egitim')),
  key text not null check (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(key) <= 40),
  label text not null check (char_length(btrim(label)) between 1 and 40),
  keywords text[] not null check (cardinality(keywords) between 1 and 40 and char_length(array_to_string(keywords, '|')) <= 2000),
  exclude text[] not null default '{}' check (cardinality(exclude) <= 40 and char_length(array_to_string(exclude, '|')) <= 2000),
  sort int not null default 100 check (sort between 0 and 10000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vertical, key)
);
comment on table public.vertical_subcategories is 'Keşfet chips of /kesfet/[tur]: keywords match a business'' category label, name and description at a word start (Turkish-normalized); exclude phrases are removed first.';

create table if not exists public.amenities (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('business', 'room')),
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label text not null check (char_length(btrim(label)) between 1 and 60),
  icon text check (icon is null or icon ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  verticals text[] not null default '{}'
    check (verticals <@ array['yemek', 'restoran', 'kafe', 'otel', 'hizmet', 'magaza', 'saglik', 'dugun', 'egitim', 'etkinlik', 'diger']::text[]),
  sort int not null default 100 check (sort between 0 and 10000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope, key),
  constraint amenities_room_verticals check (scope = 'business' or verticals = '{}')
);
comment on table public.amenities is 'Keys of businesses.amenities (scope business, offered to `verticals`) and business_rooms.amenities (scope room). icon = lucide name.';

create table if not exists public.event_categories (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label text not null check (char_length(btrim(label)) between 1 and 40),
  icon text check (icon is null or icon ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  sort int not null default 100 check (sort between 0 and 10000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.event_categories is 'Values of events.category (foreign key). Inactive categories are hidden from pickers but still label older events.';

drop trigger if exists set_updated_at on public.vertical_subcategories;
create trigger set_updated_at before update on public.vertical_subcategories for each row execute function private.set_updated_at();
drop trigger if exists set_updated_at on public.amenities;
create trigger set_updated_at before update on public.amenities for each row execute function private.set_updated_at();
drop trigger if exists set_updated_at on public.event_categories;
create trigger set_updated_at before update on public.event_categories for each row execute function private.set_updated_at();

-- 2) Seeds (same order and texts as the TS constants) -----------------------------------------------------------------
insert into public.vertical_subcategories (vertical, key, label, keywords, exclude, sort) values
  ('yemek', 'doner', 'Döner', array['döner'], '{}', 10),
  ('yemek', 'kebap', 'Kebap', array['kebap', 'kebab', 'dürüm', 'adana', 'urfa', 'iskender'], '{}', 20),
  ('yemek', 'lahmacun-pide', 'Lahmacun & Pide', array['lahmacun', 'pide'], '{}', 30),
  ('yemek', 'kofte', 'Köfte', array['köfte'], array['çiğ köfte'], 40),
  ('yemek', 'ev-yemekleri', 'Ev yemekleri', array['ev yemek', 'ev yemeği', 'lokanta', 'tencere', 'sulu yemek'], '{}', 50),
  ('yemek', 'cig-kofte', 'Çiğ köfte', array['çiğ köfte', 'çiğköfte'], '{}', 60),
  ('yemek', 'tatli', 'Tatlı', array['tatlı', 'baklava', 'künefe', 'kadayıf', 'muhallebi', 'dondurma'], '{}', 70),
  ('restoran', 'balik', 'Balık', array['balık', 'deniz ürün', 'levrek', 'çipura', 'hamsi'], '{}', 10),
  ('restoran', 'ocakbasi', 'Ocakbaşı', array['ocakbaşı', 'ocak başı', 'kebap', 'kebab', 'mangal'], '{}', 20),
  ('restoran', 'et-steak', 'Et & Steak', array['steak', 'et restoran', 'et lokanta', 'kasap', 'bonfile', 'antrikot'], '{}', 30),
  ('restoran', 'pizza-burger', 'Pizza & Burger', array['pizz', 'burger', 'hamburger', 'fast food'], '{}', 40),
  ('restoran', 'dunya-mutfagi', 'Dünya mutfağı',
    array['dünya mutfağı', 'dünya mutfak', 'italyan', 'japon', 'sushi', 'suşi', 'meksika', 'uzak doğu', 'asya', 'fransız', 'kore', 'ramen', 'wok'], '{}', 50),
  ('kafe', 'kahve', 'Kahve', array['kahve', 'coffee', 'espresso', 'barista', 'üçüncü dalga'], '{}', 10),
  ('kafe', 'kahvalti', 'Kahvaltı', array['kahvaltı', 'serpme', 'brunch'], '{}', 20),
  ('kafe', 'pastane', 'Pastane', array['pastane', 'pasta', 'fırın', 'börek', 'patisserie', 'baklava', 'unlu mamul'], '{}', 30),
  ('kafe', 'cay-bahcesi', 'Çay bahçesi', array['çay bahçe', 'çay evi', 'çay ocağı', 'semaver'], '{}', 40),
  ('otel', 'otel', 'Otel', array['otel', 'hotel'], array['butik otel', 'apart otel'], 10),
  ('otel', 'butik-otel', 'Butik otel', array['butik'], '{}', 20),
  ('otel', 'apart', 'Apart', array['apart', 'rezidans', 'residence'], '{}', 30),
  ('otel', 'pansiyon', 'Pansiyon', array['pansiyon', 'misafirhane', 'hostel', 'konukevi', 'konuk evi'], '{}', 40),
  ('hizmet', 'temizlik', 'Temizlik', array['temizlik', 'ev temizliği', 'ofis temizliği', 'halı yıkama', 'koltuk yıkama', 'ilaçlama'], '{}', 10),
  ('hizmet', 'tadilat', 'Tadilat', array['tadilat', 'dekorasyon', 'alçıpan', 'fayans', 'parke', 'seramik', 'mutfak dolab', 'renovasyon'], '{}', 20),
  ('hizmet', 'nakliyat', 'Nakliyat', array['nakliyat', 'nakliye', 'taşımacılık', 'evden eve', 'eşya taşıma', 'ofis taşıma'], '{}', 30),
  ('hizmet', 'elektrik', 'Elektrik', array['elektrik', 'aydınlatma', 'avize', 'sigorta panosu'], '{}', 40),
  ('hizmet', 'tesisat', 'Tesisat', array['tesisat', 'su kaçağı', 'tıkanıklık', 'kombi', 'petek', 'doğalgaz', 'doğal gaz'], '{}', 50),
  ('hizmet', 'boya', 'Boya', array['boya', 'badana', 'duvar kağıdı'], '{}', 60),
  ('magaza', 'giyim', 'Giyim', array['giyim', 'butik', 'moda', 'konfeksiyon', 'ayakkabı', 'elbise', 'çanta'], '{}', 10),
  ('magaza', 'elektronik', 'Elektronik', array['elektronik', 'telefon', 'bilgisayar', 'tablet', 'beyaz eşya', 'teknoloji', 'televizyon'], '{}', 20),
  ('magaza', 'market', 'Market', array['market', 'süpermarket', 'bakkal', 'şarküteri', 'manav', 'kasap', 'gıda'], '{}', 30),
  ('magaza', 'kirtasiye', 'Kırtasiye', array['kırtasiye', 'kitap', 'kitabevi', 'fotokopi', 'ofis malzeme'], '{}', 40),
  ('magaza', 'mobilya', 'Mobilya', array['mobilya', 'koltuk', 'yatak', 'baza', 'ev tekstil', 'dekorasyon'], '{}', 50),
  ('saglik', 'dis', 'Diş', array['diş hekim', 'diş klini', 'diş polikli', 'ağız ve diş', 'dişçi', 'dental', 'ortodont', 'implant'], '{}', 10),
  ('saglik', 'goz', 'Göz',
    array['göz merkez', 'göz klini', 'göz hastal', 'göz doktor', 'göz hekim', 'göz sağlı', 'oftalmoloji', 'optik', 'gözlük'], '{}', 20),
  ('saglik', 'poliklinik', 'Poliklinik', array['poliklini', 'tıp merkez', 'sağlık merkez', 'dahiliye', 'aile hekim'],
    array['diş poliklini', 'diş sağlığı poliklini'], 30),
  ('saglik', 'fizik-tedavi', 'Fizik tedavi', array['fizik tedavi', 'fizyoterap', 'rehabilitasyon', 'manuel terapi'], '{}', 40),
  ('saglik', 'psikolog', 'Psikolog', array['psikolo', 'psikoterap', 'psikiyatr', 'pedagog', 'aile danışman'], '{}', 50),
  ('saglik', 'veteriner', 'Veteriner', array['veteriner', 'hayvan hastane', 'evcil hayvan', 'pet klini', 'pet shop'], '{}', 60),
  ('dugun', 'dugun-salonu', 'Düğün salonu', array['düğün salon', 'nikah salon', 'davet salon', 'kır düğün', 'balo salon'], '{}', 10),
  ('dugun', 'organizasyon', 'Organizasyon', array['organizasyon', 'kına gece', 'sünnet', 'süsleme', 'doğum günü', 'parti'], '{}', 20),
  ('dugun', 'gelinlik', 'Gelinlik', array['gelinlik', 'abiye', 'damatlık', 'nişanlık', 'kınalık', 'bindallı'], '{}', 30),
  ('dugun', 'fotograf', 'Fotoğraf', array['fotoğraf', 'video', 'stüdyo', 'dış çekim', 'drone', 'klip'], '{}', 40),
  ('dugun', 'kuafor', 'Kuaför', array['kuaför', 'gelin saç', 'gelin başı', 'makyaj', 'güzellik salon', 'berber'], '{}', 50),
  ('egitim', 'kurs', 'Kurs', array['kurs', 'özel ders', 'atölye', 'dershane', 'robotik', 'kodlama'], array['sürücü kurs', 'ehliyet kurs'], 10),
  ('egitim', 'dil-okulu', 'Dil okulu', array['dil okul', 'dil kurs', 'yabancı dil', 'ingilizce', 'almanca', 'ielts', 'toefl', 'yds'], '{}', 20),
  ('egitim', 'etut', 'Etüt', array['etüt', 'etüd', 'ödev', 'lgs', 'yks', 'kpss', 'birebir ders'], '{}', 30),
  ('egitim', 'anaokulu', 'Anaokulu', array['anaokul', 'kreş', 'ana sınıf', 'anasınıf', 'okul öncesi', 'gündüz bakım', 'montessori'], '{}', 40),
  ('egitim', 'surucu-kursu', 'Sürücü kursu', array['sürücü', 'ehliyet', 'direksiyon'], '{}', 50)
on conflict (vertical, key) do nothing;

insert into public.amenities (scope, key, label, icon, verticals, sort) values
  ('business', 'wifi', 'Ücretsiz Wi-Fi', 'wifi', array['restoran', 'kafe', 'otel', 'diger'], 10),
  ('business', 'otopark', 'Otopark', 'car', array['yemek', 'restoran', 'kafe', 'otel', 'hizmet', 'magaza', 'saglik', 'dugun', 'egitim', 'etkinlik', 'diger'], 20),
  ('business', 'paket_servis', 'Paket servis', 'shopping-bag', array['yemek', 'restoran', 'kafe'], 30),
  ('business', 'rezervasyon', 'Rezervasyon', 'calendar-check', array['restoran', 'kafe'], 40),
  ('business', 'bahce', 'Bahçe / teras', 'trees', array['yemek', 'restoran', 'kafe', 'otel'], 50),
  ('business', 'cocuk_dostu', 'Çocuk dostu', 'baby', array['yemek', 'restoran', 'kafe', 'otel'], 60),
  ('business', 'vejetaryen', 'Vejetaryen seçenek', 'leaf', array['yemek', 'restoran', 'kafe'], 70),
  ('business', 'kahvalti', 'Kahvaltı', 'croissant', array['kafe', 'restoran', 'otel'], 80),
  ('business', 'canli_muzik', 'Canlı müzik', 'music', array['restoran', 'kafe'], 90),
  ('business', 'manzara', 'Deniz manzarası', 'sunset', array['restoran', 'kafe', 'otel'], 100),
  ('business', 'kredi_karti', 'Kredi kartı', 'credit-card', array['yemek', 'restoran', 'kafe', 'otel', 'hizmet', 'magaza', 'saglik', 'dugun', 'egitim', 'etkinlik', 'diger'], 110),
  ('business', 'engelli_erisimi', 'Engelli erişimi', 'accessibility', array['yemek', 'restoran', 'kafe', 'otel', 'hizmet', 'magaza', 'saglik', 'dugun', 'egitim', 'etkinlik', 'diger'], 120),
  ('business', 'evcil_hayvan', 'Evcil hayvan kabul', 'paw-print', array['kafe', 'otel'], 130),
  ('business', 'havuz', 'Havuz', 'waves', array['otel'], 140),
  ('business', 'spor_salonu', 'Spor salonu', 'dumbbell', array['otel'], 150),
  ('business', 'toplanti_salonu', 'Toplantı salonu', 'presentation', array['otel'], 160),
  ('business', 'resepsiyon', '7/24 resepsiyon', 'concierge-bell', array['otel'], 170),
  ('business', 'oda_servisi', 'Oda servisi', 'bell-ring', array['otel'], 180),
  ('business', 'klima', 'Klima', 'air-vent', array['otel', 'restoran', 'kafe'], 190),
  ('business', 'transfer', 'Transfer', 'bus', array['otel'], 200),
  ('room', 'wifi', 'Wi-Fi', 'wifi', '{}', 10),
  ('room', 'klima', 'Klima', 'air-vent', '{}', 20),
  ('room', 'tv', 'TV', 'tv', '{}', 30),
  ('room', 'minibar', 'Minibar', 'refrigerator', '{}', 40),
  ('room', 'kasa', 'Kasa', 'lock-keyhole', '{}', 50),
  ('room', 'balkon', 'Balkon', 'door-open', '{}', 60),
  ('room', 'kuvet', 'Küvet', 'bath', '{}', 70),
  ('room', 'sac_kurutma', 'Saç kurutma', 'wind', '{}', 80),
  ('room', 'calisma_masasi', 'Çalışma masası', 'laptop', '{}', 90),
  ('room', 'cay_kahve', 'Çay / kahve seti', 'coffee', '{}', 100),
  ('room', 'manzara', 'Deniz manzarası', 'sunset', '{}', 110)
on conflict (scope, key) do nothing;

insert into public.event_categories (key, label, icon, sort) values
  ('konser', 'Konser', 'music', 10),
  ('tiyatro', 'Tiyatro', 'drama', 20),
  ('festival', 'Festival', 'party-popper', 30),
  ('spor', 'Spor', 'trophy', 40),
  ('cocuk', 'Çocuk', 'baby', 50),
  ('sergi', 'Sergi', 'palette', 60),
  ('atolye', 'Atölye', 'brush', 70),
  ('soylesi', 'Söyleşi', 'mic', 80),
  ('diger', 'Diğer', 'ticket', 90)
on conflict (key) do nothing;

-- 3) events.category: foreign key instead of the fixed CHECK list (existing rows use the seeded keys). A used category
--    cannot be deleted (the admin deactivates it instead); its key is never renamed.
alter table public.events drop constraint if exists events_category_check;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_category_fkey' and conrelid = 'public.events'::regclass) then
    alter table public.events add constraint events_category_fkey foreign key (category) references public.event_categories (key);
  end if;
end $$;
create index if not exists events_category_idx on public.events (category);

-- 4) RLS: everyone reads (inactive rows too: they label older data), admins write.
alter table public.vertical_subcategories enable row level security;
alter table public.amenities enable row level security;
alter table public.event_categories enable row level security;

drop policy if exists "public read" on public.vertical_subcategories;
drop policy if exists "admin write" on public.vertical_subcategories;
create policy "public read" on public.vertical_subcategories for select to anon, authenticated using (true);
create policy "admin write" on public.vertical_subcategories for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public read" on public.amenities;
drop policy if exists "admin write" on public.amenities;
create policy "public read" on public.amenities for select to anon, authenticated using (true);
create policy "admin write" on public.amenities for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public read" on public.event_categories;
drop policy if exists "admin write" on public.event_categories;
create policy "public read" on public.event_categories for select to anon, authenticated using (true);
create policy "admin write" on public.event_categories for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on table public.vertical_subcategories, public.amenities, public.event_categories from anon, authenticated;
grant select on table public.vertical_subcategories, public.amenities, public.event_categories to anon, authenticated;
grant insert, update, delete on table public.vertical_subcategories, public.amenities, public.event_categories to authenticated;

-- 4b) Guards: stored keys never change (events, businesses and rooms reference them), "diger" (events.category default)
--     stays, and an amenity still picked by a business / room is turned off instead of deleted. Security definer: the
--     usage count sees every row, not only what the admin's RLS shows.
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
  return old;
end $$;

revoke all on function private.vocabulary_guard() from public, anon, authenticated;

drop trigger if exists vocabulary_guard on public.vertical_subcategories;
create trigger vocabulary_guard before update or delete on public.vertical_subcategories for each row execute function private.vocabulary_guard();
drop trigger if exists vocabulary_guard on public.amenities;
create trigger vocabulary_guard before update or delete on public.amenities for each row execute function private.vocabulary_guard();
drop trigger if exists vocabulary_guard on public.event_categories;
create trigger vocabulary_guard before update or delete on public.event_categories for each row execute function private.vocabulary_guard();

-- 5) Audit (latest bodies from 2026091331_admin_audit.sql + the vocabulary tables and their columns).
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
  end, p_key)
$$;

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

drop trigger if exists audit_content on public.vertical_subcategories;
create trigger audit_content after insert or update or delete on public.vertical_subcategories for each row execute function private.audit_content();
drop trigger if exists audit_content on public.amenities;
create trigger audit_content after insert or update or delete on public.amenities for each row execute function private.audit_content();
drop trigger if exists audit_content on public.event_categories;
create trigger audit_content after insert or update or delete on public.event_categories for each row execute function private.audit_content();

notify pgrst, 'reload schema';
