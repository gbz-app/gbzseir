-- News article and gezilecek yer category vocabularies (same pattern as 2026091351_vocabularies.sql).
--  * news_categories: values of news_articles.category (foreign key instead of the fixed CHECK list). The RSS headlines
--    (news_items.category, inferCategory in src/features/content/news/parse.ts) keep using the six built-in keys, so
--    those can be renamed / re-iconed / turned off but never deleted.
--  * place_categories: values of poi.details->>'category' for kind 'place'. The value lives in jsonb, so a trigger
--    (poi_place_category) checks it instead of a foreign key; "diger" is the fallback and always stays.
-- Seeded from the TS constants (parse.ts, src/features/nearby/config.ts), which stay the fallback. Public read, admin
-- write, audited; keys are immutable and used rows cannot be deleted (vocabulary_guard). Re-runnable: seeds never
-- overwrite admin edits.

-- 1) Tables ----------------------------------------------------------------------------------------------------------
create table if not exists public.news_categories (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label text not null check (char_length(btrim(label)) between 1 and 40),
  icon text check (icon is null or icon ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  sort int not null default 100 check (sort between 0 and 10000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.news_categories is 'Values of news_articles.category (foreign key); RSS headlines use the six built-in keys. Inactive categories are hidden from the article picker but still label older stories. icon = lucide name.';

create table if not exists public.place_categories (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label text not null check (char_length(btrim(label)) between 1 and 40),
  icon text check (icon is null or icon ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  sort int not null default 100 check (sort between 0 and 10000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.place_categories is 'Values of poi.details->>''category'' for kind place (trigger poi_place_category). Inactive categories are hidden from the place editor but still label existing places. icon = lucide name.';

drop trigger if exists set_updated_at on public.news_categories;
create trigger set_updated_at before update on public.news_categories for each row execute function private.set_updated_at();
drop trigger if exists set_updated_at on public.place_categories;
create trigger set_updated_at before update on public.place_categories for each row execute function private.set_updated_at();

-- 2) Seeds (same order, labels and icons as the TS constants) ---------------------------------------------------------
insert into public.news_categories (key, label, icon, sort) values
  ('gundem', 'Gündem', 'newspaper', 10),
  ('siyaset', 'Siyaset', 'landmark', 20),
  ('belediye', 'Belediye', 'building-2', 30),
  ('spor', 'Spor', 'trophy', 40),
  ('etkinlik', 'Etkinlik', 'ticket', 50),
  ('duyuru', 'Duyurular', 'megaphone', 60)
on conflict (key) do nothing;

insert into public.place_categories (key, label, icon, sort) values
  ('tarihi', 'Tarihi', 'castle', 10),
  ('park', 'Park', 'trees', 20),
  ('doga', 'Doğa', 'mountain', 30),
  ('muze', 'Müze', 'landmark', 40),
  ('avm', 'AVM', 'shopping-bag', 50),
  ('diger', 'Diğer', 'sparkles', 60)
on conflict (key) do nothing;

-- 3) news_articles.category: foreign key instead of the fixed CHECK list (existing rows use the seeded keys).
alter table public.news_articles drop constraint if exists news_articles_category_check;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'news_articles_category_fkey' and conrelid = 'public.news_articles'::regclass) then
    alter table public.news_articles add constraint news_articles_category_fkey foreign key (category) references public.news_categories (key);
  end if;
end $$;
create index if not exists news_articles_category_idx on public.news_articles (category);

-- 4) poi place category: must be a place_categories key. Runs after poi_before_write (trigger names sort), so it sees
--    the value a locked row keeps. An unchanged value passes; a data sync (no admin session) gets "diger" instead of
--    failing its batch; the admin editor gets an error.
create or replace function private.poi_place_category()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_key text := case when jsonb_typeof(new.details) = 'object' then new.details ->> 'category' end;
begin
  if v_key is null or exists (select 1 from public.place_categories c where c.key = v_key) then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.kind = 'place' and jsonb_typeof(old.details) = 'object' and old.details ->> 'category' = v_key then
    return new;
  end if;
  if not public.is_admin() then
    new.details := jsonb_set(new.details, '{category}', '"diger"'::jsonb);
    return new;
  end if;
  raise exception 'Bu yer kategorisi yok. Sayfayı yenileyip listeden seç.' using errcode = 'P0001', hint = 'invalid_category';
end $$;

revoke all on function private.poi_place_category() from public, anon, authenticated;

drop trigger if exists poi_place_category on public.poi;
create trigger poi_place_category before insert or update on public.poi
  for each row when (new.kind = 'place') execute function private.poi_place_category();

-- Usage count of vocabulary_guard.
create index if not exists poi_place_category_idx on public.poi ((details ->> 'category')) where kind = 'place';

-- 5) RLS: everyone reads (inactive rows too: they label older data), admins write.
alter table public.news_categories enable row level security;
alter table public.place_categories enable row level security;

drop policy if exists "public read" on public.news_categories;
drop policy if exists "admin write" on public.news_categories;
create policy "public read" on public.news_categories for select to anon, authenticated using (true);
create policy "admin write" on public.news_categories for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public read" on public.place_categories;
drop policy if exists "admin write" on public.place_categories;
create policy "public read" on public.place_categories for select to anon, authenticated using (true);
create policy "admin write" on public.place_categories for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on table public.news_categories, public.place_categories from anon, authenticated;
grant select on table public.news_categories, public.place_categories to anon, authenticated;
grant insert, update, delete on table public.news_categories, public.place_categories to authenticated;

-- 6) Guards (latest body from 2026091351 + the two tables): keys never change, the RSS keys and the place fallback
--    stay, and a used category is turned off instead of deleted. Security definer: the usage count sees every row.
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
  return old;
end $$;

revoke all on function private.vocabulary_guard() from public, anon, authenticated;

drop trigger if exists vocabulary_guard on public.news_categories;
create trigger vocabulary_guard before update or delete on public.news_categories for each row execute function private.vocabulary_guard();
drop trigger if exists vocabulary_guard on public.place_categories;
create trigger vocabulary_guard before update or delete on public.place_categories for each row execute function private.vocabulary_guard();

-- 7) Audit (latest live body of private.audit_content + the two tables; their columns already have field labels).
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

drop trigger if exists audit_content on public.news_categories;
create trigger audit_content after insert or update or delete on public.news_categories for each row execute function private.audit_content();
drop trigger if exists audit_content on public.place_categories;
create trigger audit_content after insert or update or delete on public.place_categories for each row execute function private.audit_content();

notify pgrst, 'reload schema';
