-- Search covers the Kocaeli city guide and doctors; the admin audit log covers doctors and branches.
--
-- 1) public.global_search (latest live body, 2026091380_kocaeli_districts.sql):
--    * 'pois' now also returns the guide kinds institution, bank, fuel and ev_charge next to place, pharmacy, mosque,
--      bus_stop, taxi and atm. Every row keeps its fields (district_id / district_name included) and gains
--      category_label + category_icon (institution_categories, kind institution only).
--      The search page shows the kinds in separate sections (Yerler / Resmî kurumlar / Bankalar ve ATM'ler / Akaryakıt /
--      Şarj istasyonları), so the limit applies per section instead of to the whole group: each section returns up to
--      p_limit rows. The Yerler section (place, pharmacy, mosque, bus_stop, taxi) keeps its old order; ATMs move to the
--      bank section. Sorting inside a section is the old expression, so bank branches come before ATMs; p.id is added
--      as the last tiebreaker (many mosques are just "Camii" with the same score), so live typing and the server render
--      return the same rows.
--    * New group 'doctors': active business_staff of public sağlık businesses, matched on title, name and the branch
--      label (doctor_branches). Demo rows are treated like every other group of this RPC: they are returned (their
--      clinic is in 'businesses' too) and carry is_demo, like 'events' does.
--    Every other group, field, limit and grant is unchanged.
-- 2) private.audit_content (latest live body, 2026091376_city_guide.sql) also logs business_staff ('doctor', "Doktor")
--    and doctor_branches ('doctor_branch', "Doktor branşı"); AFTER INSERT/UPDATE/DELETE triggers on both tables.
--    Demo rows and writes without a session are skipped by the existing checks (is_demo, auth.uid()).
-- 3) private.audit_field_label (latest live body, 2026091376_city_guide.sql): labels for branch, days, hours_note,
--    is_active and the other business_staff columns.
-- Re-runnable.

-- 1) Search ---------------------------------------------------------------------------------------------------------
create or replace function public.global_search(p_q text, p_limit integer default 5)
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  with q as (select public.tr_norm(p_q) as q, greatest(1, least(coalesce(p_limit, 5), 20)) as lim)
  select case when char_length((select q from q)) < 2 then
    jsonb_build_object('listings', '[]'::jsonb, 'businesses', '[]'::jsonb, 'services', '[]'::jsonb, 'pois', '[]'::jsonb,
                       'events', '[]'::jsonb, 'articles', '[]'::jsonb, 'doctors', '[]'::jsonb)
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
    -- Up to `lim` rows per section; sections in page order, rows in rank order inside a section.
    'pois', coalesce((
      select jsonb_agg(to_jsonb(x) - 'section' - 'rn' order by x.section, x.rn) from (
        select p.id, p.kind, p.slug, p.name, p.address, p.lat, p.lng, n.name as neighbourhood_name,
               p.details ->> 'category' as category,
               p.district_id, dd.name as district_name,
               ic.label_tr as category_label, ic.icon as category_icon,
               sec.section,
               row_number() over (
                 partition by sec.section
                 order by (p.kind = 'place') desc, (p.kind in ('bus_stop', 'taxi', 'atm')),
                          extensions.similarity(p.search_norm, q.q) desc, p.name, p.id) as rn
          from public.poi p
          cross join q
          cross join lateral (
            select case p.kind when 'institution' then 2 when 'bank' then 3 when 'atm' then 3 when 'fuel' then 4
                               when 'ev_charge' then 5 else 1 end as section) sec
          left join public.neighbourhoods n on n.id = p.neighbourhood_id
          left join public.districts dd on dd.id = p.district_id
          left join public.institution_categories ic on p.kind = 'institution' and ic.key = p.details ->> 'category'
         where p.kind in ('place', 'pharmacy', 'mosque', 'bus_stop', 'taxi', 'atm', 'institution', 'bank', 'fuel', 'ev_charge')
           and not p.hidden
           and public.tr_match(p.search_norm, q.q)) x
       where x.rn <= (select lim from q)), '[]'::jsonb),
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
         limit (select lim from q)) x), '[]'::jsonb),
    -- Doctor profiles (/doktor/<slug>). The "Diğer" title is not shown before the name (same rule as the slug).
    'doctors', coalesce((
      select jsonb_agg(x) from (
        select s.id, s.slug, s.title, s.name,
               case when s.title = 'Diğer' then s.name else s.title || ' ' || s.name end as display_name,
               s.branch, br.label as branch_label, s.photo_url,
               b.id as business_id, b.slug as business_slug, b.name as clinic_name,
               n.name as neighbourhood_name, b.district_id, dd.name as district_name,
               s.is_demo
          from public.business_staff s
          join public.businesses b on b.id = s.business_id
          left join public.doctor_branches br on br.key = s.branch
          left join public.neighbourhoods n on n.id = b.neighbourhood_id
          left join public.districts dd on dd.id = b.district_id
          cross join q
          cross join lateral (
            select public.tr_norm(case when s.title = 'Diğer' then '' else s.title || ' ' end || s.name || ' '
                                  || coalesce(br.label, '')) as norm) t
         where s.is_active and s.slug <> '' and b.vertical = 'saglik' and public.business_is_public(s.business_id)
           and public.tr_match(t.norm, q.q)
         order by extensions.similarity(t.norm, q.q) desc, s.sort, s.name
         limit (select lim from q)) x), '[]'::jsonb)
  ) end
$$;

-- Same ACL as before: anon, authenticated and service_role may call it, PUBLIC may not.
revoke all on function public.global_search(text, integer) from public;
grant execute on function public.global_search(text, integer) to anon, authenticated, service_role;

-- 2) Audit: doctors and doctor branches -----------------------------------------------------------------------------
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
    when 'business_staff' then
      -- "Dr. Ayşe Yılmaz"; the "Diğer" title is not shown before the name.
      v_prefix := 'doctor'; v_noun := 'Doktor';
      v_name := case when r ->> 'title' = 'Diğer' then r ->> 'name' else (r ->> 'title') || ' ' || (r ->> 'name') end;
    when 'doctor_branches' then
      v_prefix := 'doctor_branch'; v_noun := 'Doktor branşı'; v_name := r ->> 'label';
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
    -- business_staff.is_active reads the same way ("pasife alındı").
    if (v_old -> 'is_active') is distinct from (v_new -> 'is_active') then
      v_fields := array_replace(v_fields, 'aktiflik', case when (v_new ->> 'is_active')::boolean then 'aktif edildi' else 'pasife alındı' end);
    end if;
    -- A doctor's title is an academic title ("unvan"), not a heading.
    if tg_table_name = 'business_staff' then
      v_fields := array_replace(v_fields, 'başlık', 'unvan');
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

drop trigger if exists audit_content on public.business_staff;
create trigger audit_content after insert or update or delete on public.business_staff for each row execute function private.audit_content();
drop trigger if exists audit_content on public.doctor_branches;
create trigger audit_content after insert or update or delete on public.doctor_branches for each row execute function private.audit_content();

-- 3) Field labels (latest live body + business_staff columns) --------------------------------------------------------
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
    -- business_staff (2026091377, 2026091382)
    when 'branch' then 'branş' when 'days' then 'çalışma günleri' when 'hours_note' then 'çalışma saatleri'
    when 'is_active' then 'aktiflik' when 'photo_url' then 'fotoğraf' when 'bio' then 'tanıtım'
    when 'consent_confirmed_at' then 'KVKK onayı' when 'business_id' then 'işletme'
  end, p_key)
$$;

revoke all on function private.audit_field_label(text) from public, anon, authenticated;

notify pgrst, 'reload schema';
