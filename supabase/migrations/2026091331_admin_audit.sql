-- Admin audit (audit step 19). Admin changes land in audit_log with actor_id = auth.uid(): settings, service / listing
-- categories, question flows, news articles, announcements, places, legal texts, store numbers, report and support
-- decisions (status + internal notes), review deletions, event status changes and deletions. verification_level joins
-- the business fields. admin_audit_log() lists the whole log (user_id null rows included) with filters and paging.
-- Analytics tables are not audited. Re-runnable.

-- 1) Turkish labels (latest body from 2026091300_place_corrections_guest_throttle.sql + report / support / event / news /
--    duty / target / poi kinds).
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
    when 'event' then case p_value when 'draft' then 'Taslak' when 'published' then 'Yayında' when 'cancelled' then 'İptal edildi' end
    when 'news' then case p_value when 'draft' then 'Taslak' when 'published' then 'Yayında' end
    when 'duty' then case p_value when 'demo' then 'Örnek veri' when 'off' then 'Kapalı' when 'live' then 'Canlı' end
    when 'target' then case p_value when 'listing' then 'ilan' when 'business' then 'işletme' when 'review' then 'yorum' when 'user' then 'kullanıcı' end
    when 'poi' then case p_value when 'pharmacy' then 'eczane' when 'mosque' then 'cami' when 'bus_stop' then 'durak' when 'place' then 'gezilecek yer'
      when 'taxi' then 'taksi' when 'atm' then 'ATM' end
  end, p_value)
$$;

-- 2) Helpers for readable summaries.
create or replace function private.audit_setting_label(p_key text)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(case p_key
    when 'feature_business_applications' then 'Yeni işletme başvuruları'
    when 'maintenance_banner' then 'Duyuru bandı'
    when 'support_phone' then 'Destek telefonu'
    when 'support_email' then 'Destek e-postası'
    when 'listing_days' then 'İlan yayın süresi (gün)'
    when 'first_listings_moderated' then 'Onaya düşen ilk ilan sayısı'
    when 'listing_daily_cap' then 'Günlük ilan sınırı'
    when 'listing_active_cap' then 'Açık ilan sınırı'
    when 'max_providers_default' then 'Bir talebe en fazla firma'
    when 'analytics_retention_days' then 'Analitik saklama süresi (gün)'
    when 'audit_retention_days' then 'İşlem kaydı saklama süresi (gün)'
    when 'duty_data_mode' then 'Nöbet listesi verisi'
    when 'otp_demo_mode' then 'Demo giriş modu'
  end, p_key)
$$;

-- Short text of a setting value: açık / kapalı, boş, at most 60 characters.
create or replace function private.audit_setting_value(p_key text, p_value jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_value is null or jsonb_typeof(p_value) = 'null' then 'yok'
    when p_key = 'duty_data_mode' then private.tr_label('duty', p_value #>> '{}')
    when jsonb_typeof(p_value) = 'boolean' then case when p_value = 'true'::jsonb then 'açık' else 'kapalı' end
    when jsonb_typeof(p_value) = 'string' then case
      when p_value #>> '{}' = '' then 'boş'
      when char_length(p_value #>> '{}') > 60 then left(p_value #>> '{}', 57) || '...'
      else p_value #>> '{}' end
    else left(p_value::text, 60)
  end
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
  end, p_key)
$$;

-- Turkish names of the columns that differ between two row images (bookkeeping columns ignored).
create or replace function private.audit_changed_fields(p_old jsonb, p_new jsonb)
returns text[]
language sql
immutable
set search_path = public
as $$
  select coalesce(array_agg(distinct private.audit_field_label(n.key)), '{}'::text[])
  from jsonb_each(p_new) n
  where n.key <> all (array['id', 'created_at', 'updated_at', 'created_by', 'updated_by', 'published_by', 'search_norm', 'location', 'is_demo'])
    and n.value is distinct from (p_old -> n.key)
$$;

-- 3) Settings (every change, whoever makes it; the settings form upserts all keys, so unchanged values are skipped).
create or replace function private.audit_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := case when tg_op = 'DELETE' then old.key else new.key end;
  v_from jsonb := case when tg_op <> 'INSERT' then old.value end;
  v_to jsonb := case when tg_op <> 'DELETE' then new.value end;
  v_label text := private.audit_setting_label(v_key);
begin
  if tg_op = 'UPDATE' and new.value is not distinct from old.value then
    return null;
  end if;
  perform private.audit(null, 'settings.' || lower(tg_op), 'settings', null,
    case tg_op
      when 'INSERT' then 'Ayar eklendi: ' || v_label || ' = ' || private.audit_setting_value(v_key, v_to)
      when 'UPDATE' then 'Ayar değiştirildi: ' || v_label || ': ' || private.audit_setting_value(v_key, v_from) || ' → ' || private.audit_setting_value(v_key, v_to)
      else 'Ayar silindi: ' || v_label
    end,
    jsonb_build_object('key', v_key,
      'from', case when length(v_from::text) > 300 then to_jsonb(left(v_from::text, 300)) else v_from end,
      'to', case when length(v_to::text) > 300 then to_jsonb(left(v_to::text, 300)) else v_to end));
  return null;
end $$;

drop trigger if exists audit_app_settings on public.app_settings;
create trigger audit_app_settings after insert or update or delete on public.app_settings
  for each row execute function private.audit_settings();

-- 4) Admin-managed content. Only signed-in changes are logged: imports, cron jobs, migrations and demo rows stay out.
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

drop trigger if exists audit_content on public.service_categories;
create trigger audit_content after insert or update or delete on public.service_categories for each row execute function private.audit_content();
drop trigger if exists audit_content on public.listing_categories;
create trigger audit_content after insert or update or delete on public.listing_categories for each row execute function private.audit_content();
drop trigger if exists audit_content on public.question_flows;
create trigger audit_content after insert or update or delete on public.question_flows for each row execute function private.audit_content();
drop trigger if exists audit_content on public.news_articles;
create trigger audit_content after insert or update or delete on public.news_articles for each row execute function private.audit_content();
drop trigger if exists audit_content on public.announcements;
create trigger audit_content after insert or update or delete on public.announcements for each row execute function private.audit_content();
drop trigger if exists audit_content on public.poi;
create trigger audit_content after insert or update or delete on public.poi for each row execute function private.audit_content();
drop trigger if exists audit_content on public.legal_texts;
create trigger audit_content after insert or update or delete on public.legal_texts for each row execute function private.audit_content();
drop trigger if exists audit_content on public.store_stats;
create trigger audit_content after insert or update or delete on public.store_stats for each row execute function private.audit_content();

-- 5) Moderation: report / support status, internal notes (user_id null: admins only), review deletions, event status
--    and deletions. The account owner (reporter, sender, author, organiser) is user_id so the row also shows on their page.
create or replace function private.audit_moderation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_verb text := case tg_op when 'INSERT' then 'eklendi' when 'UPDATE' then 'güncellendi' else 'silindi' end;
  v_id uuid;
begin
  if tg_table_name = 'reports' then
    perform private.audit(new.reporter_id, 'report.status', 'report', new.id,
      'Şikayet (' || private.tr_label('target', new.target_type) || '): '
        || private.tr_label('report', old.status) || ' → ' || private.tr_label('report', new.status),
      jsonb_build_object('from', old.status, 'to', new.status, 'target_type', new.target_type, 'target_id', new.target_id));
  elsif tg_table_name = 'contact_messages' then
    perform private.audit(new.user_id, 'support.status', 'support', new.id,
      'Destek mesajı #' || upper(left(new.id::text, 8)) || ' (' || private.tr_label('topic', new.topic) || '): '
        || private.tr_label('support', old.status) || ' → ' || private.tr_label('support', new.status),
      jsonb_build_object('from', old.status, 'to', new.status));
  elsif tg_table_name = 'events' then
    if tg_op = 'DELETE' then
      if old.is_demo then
        return null;
      end if;
      perform private.audit(old.created_by, 'event.deleted', 'event', old.id, 'Etkinlik silindi: ' || old.title, '{}'::jsonb);
    else
      perform private.audit(new.created_by, 'event.status', 'event', new.id,
        'Etkinlik durumu: ' || private.tr_label('event', old.status) || ' → ' || private.tr_label('event', new.status) || ' (' || new.title || ')',
        jsonb_build_object('from', old.status, 'to', new.status));
    end if;
  elsif tg_table_name = 'reviews' then
    if old.is_demo then
      return null;
    end if;
    perform private.audit(old.author_id, 'review.deleted', 'business', old.business_id,
      'Yorum silindi (' || old.rating || ' yıldız): ' || coalesce((select b.name from public.businesses b where b.id = old.business_id), 'işletme'),
      jsonb_build_object('review_id', old.id, 'rating', old.rating));
  elsif tg_table_name in ('support_notes', 'report_notes') then
    if tg_op = 'UPDATE' and new.note is not distinct from old.note then
      return null;
    end if;
    if tg_table_name = 'support_notes' then
      v_id := coalesce(new.message_id, old.message_id);
      perform private.audit(null, 'support.note', 'support', v_id, 'Destek mesajı #' || upper(left(v_id::text, 8)) || ': iç not ' || v_verb,
        jsonb_build_object('note', case when tg_op <> 'DELETE' then left(new.note, 300) end));
    else
      v_id := coalesce(new.report_id, old.report_id);
      perform private.audit(null, 'report.note', 'report', v_id, 'Şikayet #' || upper(left(v_id::text, 8)) || ': iç not ' || v_verb,
        jsonb_build_object('note', case when tg_op <> 'DELETE' then left(new.note, 300) end));
    end if;
  end if;
  return null;
end $$;

drop trigger if exists audit_reports_status on public.reports;
create trigger audit_reports_status after update on public.reports
  for each row when (new.status is distinct from old.status) execute function private.audit_moderation();
drop trigger if exists audit_contact_messages_status on public.contact_messages;
create trigger audit_contact_messages_status after update on public.contact_messages
  for each row when (new.status is distinct from old.status) execute function private.audit_moderation();
drop trigger if exists audit_events_status on public.events;
create trigger audit_events_status after update on public.events
  for each row when (new.status is distinct from old.status) execute function private.audit_moderation();
drop trigger if exists audit_events_delete on public.events;
create trigger audit_events_delete after delete on public.events for each row execute function private.audit_moderation();
drop trigger if exists audit_reviews_delete on public.reviews;
create trigger audit_reviews_delete after delete on public.reviews for each row execute function private.audit_moderation();
drop trigger if exists audit_support_notes on public.support_notes;
create trigger audit_support_notes after insert or update or delete on public.support_notes for each row execute function private.audit_moderation();
drop trigger if exists audit_report_notes on public.report_notes;
create trigger audit_report_notes after insert or update or delete on public.report_notes for each row execute function private.audit_moderation();

-- 6) Businesses: + verification level (latest body from 2026091230_admin_core.sql).
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
    perform private.audit(new.owner_id, 'business.status', 'business', new.id,
      'İşletme durumu: ' || private.tr_label('business', old.status) || ' → ' || private.tr_label('business', new.status),
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
    case when new.website is distinct from old.website or new.instagram is distinct from old.instagram then 'web' end,
    case when new.verification_level is distinct from old.verification_level
      then 'doğrulama seviyesi ' || coalesce(old.verification_level, 0) || ' → ' || coalesce(new.verification_level, 0) end
  ], null);
  if cardinality(v_fields) > 0 then
    perform private.audit(new.owner_id, 'business.updated', 'business', new.id, 'İşletme bilgileri güncellendi: ' || array_to_string(v_fields, ', '),
      jsonb_build_object('fields', v_fields));
  end if;
  return new;
end $$;

-- 7) Admin reader: newest first, filters (action prefixes, actor, account, target, text, date range) and paging.
--    p_actor: 'system' (no actor), 'admin' (any admin), 'user' (non-admin actor) or a profile id.
create index if not exists audit_log_actor_idx on public.audit_log (actor_id, created_at desc);
create index if not exists audit_log_entity_idx on public.audit_log (entity_id, created_at desc) where entity_id is not null;

create or replace function public.admin_audit_log(
  p_prefixes text[] default null,
  p_actor text default null,
  p_user uuid default null,
  p_entity_id uuid default null,
  p_q text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit int default 50,
  p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := least(greatest(coalesce(p_offset, 0), 0), 1000000);
  v_actor uuid := case when p_actor ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_actor::uuid end;
  v_q text := nullif(btrim(left(coalesce(p_q, ''), 80)), '');
  v_pattern text;
  v_result jsonb;
begin
  perform private.assert_admin();
  if v_q is not null then
    v_pattern := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  with f as (
    select a.*
    from public.audit_log a
    where (coalesce(cardinality(p_prefixes), 0) = 0 or exists (select 1 from unnest(p_prefixes) x where starts_with(a.action, x)))
      and (case
        when coalesce(p_actor, '') = '' then true
        when p_actor = 'system' then a.actor_id is null
        when p_actor = 'admin' then exists (select 1 from public.profiles p where p.id = a.actor_id and p.role = 'admin')
        when p_actor = 'user' then a.actor_id is not null and not exists (select 1 from public.profiles p where p.id = a.actor_id and p.role = 'admin')
        else a.actor_id = v_actor
      end)
      and (p_user is null or a.user_id = p_user)
      and (p_entity_id is null or a.entity_id = p_entity_id)
      and (v_pattern is null or a.summary ilike v_pattern)
      and (p_from is null or a.created_at >= p_from)
      and (p_to is null or a.created_at < p_to)
  ),
  pg as (
    select * from f order by created_at desc, id desc limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', x.id, 'at', x.created_at, 'action', x.action, 'entity_type', x.entity_type, 'entity_id', x.entity_id,
          'summary', x.summary, 'details', x.details,
          'actor_id', x.actor_id, 'actor_name', ap.full_name, 'actor_role', ap.role, 'actor_exists', ap.id is not null,
          'user_id', x.user_id, 'user_name', up.full_name, 'user_exists', up.id is not null)
        order by x.created_at desc, x.id desc)
      from pg x
      left join public.profiles ap on ap.id = x.actor_id
      left join public.profiles up on up.id = x.user_id), '[]'::jsonb),
    'admins', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name) order by p.full_name nulls last)
      from public.profiles p where p.role = 'admin'), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

-- 8) Grants
revoke all on function private.audit_setting_label(text) from public, anon, authenticated;
revoke all on function private.audit_setting_value(text, jsonb) from public, anon, authenticated;
revoke all on function private.audit_field_label(text) from public, anon, authenticated;
revoke all on function private.audit_changed_fields(jsonb, jsonb) from public, anon, authenticated;
revoke all on function private.audit_settings() from public, anon, authenticated;
revoke all on function private.audit_content() from public, anon, authenticated;
revoke all on function private.audit_moderation() from public, anon, authenticated;
revoke all on function public.admin_audit_log(text[], text, uuid, uuid, text, timestamptz, timestamptz, int, int) from public, anon;
grant execute on function public.admin_audit_log(text[], text, uuid, uuid, text, timestamptz, timestamptz, int, int) to authenticated;
