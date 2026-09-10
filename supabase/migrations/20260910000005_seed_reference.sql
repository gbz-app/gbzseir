-- Gebzem: reference data (app settings, listing categories, service categories, question flows).
-- Re-runnable: upserts by slug. App settings are only inserted when missing (admin edits survive).
set search_path = public, extensions;

insert into public.app_settings (key, value) values
  ('otp_demo_mode', 'true'::jsonb),
  ('listing_days', '30'::jsonb),
  ('max_providers_default', '5'::jsonb),
  ('first_listings_moderated', '3'::jsonb),
  ('duty_data_mode', '"demo"'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Upsert helpers
-- ---------------------------------------------------------------------------
create or replace function private.upsert_listing_category(
  p_type text, p_parent_slug text, p_name text, p_slug text, p_icon text, p_sort int, p_banned boolean, p_attrs jsonb)
returns void
language sql
as $$
  insert into public.listing_categories (type, parent_id, name, slug, icon, sort, is_banned, attributes_schema)
  values (p_type, (select id from public.listing_categories where slug = p_parent_slug), p_name, p_slug, p_icon, p_sort,
          p_banned, coalesce(p_attrs, '[]'::jsonb))
  on conflict (slug) do update
    set type = excluded.type, parent_id = excluded.parent_id, name = excluded.name, icon = excluded.icon,
        sort = excluded.sort, is_banned = excluded.is_banned, attributes_schema = excluded.attributes_schema;
$$;

create or replace function private.upsert_service_category(
  p_parent_slug text, p_name text, p_slug text, p_icon text, p_description text, p_sort int,
  p_popular boolean, p_auto boolean, p_synonyms text[])
returns void
language sql
as $$
  insert into public.service_categories (parent_id, name, slug, icon, description, sort, popular, auto_dispatch, synonyms)
  values ((select id from public.service_categories where slug = p_parent_slug), p_name, p_slug, p_icon, p_description,
          p_sort, p_popular, p_auto, coalesce(p_synonyms, '{}'))
  on conflict (slug) do update
    set parent_id = excluded.parent_id, name = excluded.name, icon = excluded.icon, description = excluded.description,
        sort = excluded.sort, popular = excluded.popular, synonyms = excluded.synonyms;
    -- auto_dispatch is NOT overwritten on re-run (admin decides).
$$;

create or replace function private.upsert_flow(p_slug text, p_schema jsonb)
returns void
language sql
as $$
  insert into public.question_flows (category_id, version, schema, published)
  select id, 1, p_schema, true from public.service_categories where slug = p_slug
  on conflict (category_id, version) do update set schema = excluded.schema, published = true;
$$;

-- ---------------------------------------------------------------------------
-- Listing categories
-- ---------------------------------------------------------------------------
do $$
declare
  durum jsonb := $j${"key":"durum","label":"Durum","type":"select","required":true,"options":[
    {"value":"sifir","label":"Sıfır"},{"value":"az_kullanilmis","label":"Az kullanılmış"},
    {"value":"ikinci_el","label":"İkinci el"},{"value":"hasarli","label":"Hasarlı / parça"}]}$j$;
  marka jsonb := $j${"key":"marka","label":"Marka","type":"text"}$j$;
  pazarlik jsonb := $j${"key":"pazarlik","label":"Pazarlık payı var","type":"boolean"}$j$;
  takas jsonb := $j${"key":"takas","label":"Takas olur","type":"boolean"}$j$;
  garanti jsonb := $j${"key":"garanti","label":"Garantisi devam ediyor","type":"boolean"}$j$;
begin
  -- Classified top level
  perform private.upsert_listing_category('classified', null, 'Elektronik', 'elektronik', 'smartphone', 10, false,
    jsonb_build_array(durum, marka, pazarlik, takas));
  perform private.upsert_listing_category('classified', null, 'Ev & Yaşam', 'ev-yasam', 'sofa', 20, false,
    jsonb_build_array(durum, pazarlik, takas));
  perform private.upsert_listing_category('classified', null, 'Giyim & Aksesuar', 'giyim-aksesuar', 'shirt', 30, false,
    jsonb_build_array(durum,
      $j${"key":"cinsiyet","label":"Kimin için","type":"select","options":[{"value":"kadin","label":"Kadın"},{"value":"erkek","label":"Erkek"},{"value":"cocuk","label":"Çocuk"},{"value":"unisex","label":"Unisex"}]}$j$::jsonb,
      $j${"key":"beden","label":"Beden / numara","type":"text"}$j$::jsonb, marka, pazarlik));
  perform private.upsert_listing_category('classified', null, 'Anne & Bebek', 'anne-bebek', 'baby', 40, false,
    jsonb_build_array(durum,
      $j${"key":"tur","label":"Ürün türü","type":"select","options":[{"value":"bebek_arabasi","label":"Bebek arabası"},{"value":"oto_koltugu","label":"Oto koltuğu"},{"value":"besik","label":"Beşik / park yatak"},{"value":"giyim","label":"Bebek giyim"},{"value":"oyuncak","label":"Oyuncak"},{"value":"diger","label":"Diğer"}]}$j$::jsonb,
      marka, pazarlik));
  perform private.upsert_listing_category('classified', null, 'Spor & Outdoor', 'spor-outdoor', 'dumbbell', 50, false,
    jsonb_build_array(durum,
      $j${"key":"tur","label":"Ürün türü","type":"select","options":[{"value":"bisiklet","label":"Bisiklet"},{"value":"fitness","label":"Fitness ekipmanı"},{"value":"kamp","label":"Kamp & doğa"},{"value":"kis","label":"Kış sporları"},{"value":"diger","label":"Diğer"}]}$j$::jsonb,
      marka, pazarlik, takas));
  perform private.upsert_listing_category('classified', null, 'Hobi', 'hobi', 'palette', 60, false,
    jsonb_build_array(durum,
      $j${"key":"tur","label":"Ürün türü","type":"select","options":[{"value":"muzik_aleti","label":"Müzik aleti"},{"value":"koleksiyon","label":"Koleksiyon"},{"value":"el_isi","label":"El işi"},{"value":"maket","label":"Model & maket"},{"value":"diger","label":"Diğer"}]}$j$::jsonb,
      pazarlik, takas));
  perform private.upsert_listing_category('classified', null, 'Kitap & Müzik', 'kitap-muzik', 'book-open', 70, false,
    jsonb_build_array(durum,
      $j${"key":"tur","label":"Ürün türü","type":"select","options":[{"value":"kitap","label":"Kitap"},{"value":"ders_kitabi","label":"Ders / test kitabı"},{"value":"plak_cd","label":"Plak & CD"},{"value":"diger","label":"Diğer"}]}$j$::jsonb,
      pazarlik));
  perform private.upsert_listing_category('classified', null, 'Bahçe & Yapı Market', 'bahce-yapi-market', 'hammer', 80, false,
    jsonb_build_array(durum,
      $j${"key":"tur","label":"Ürün türü","type":"select","options":[{"value":"bahce","label":"Bahçe aleti"},{"value":"el_aleti","label":"El aleti"},{"value":"elektrikli","label":"Elektrikli alet"},{"value":"malzeme","label":"Yapı malzemesi"},{"value":"diger","label":"Diğer"}]}$j$::jsonb,
      marka, pazarlik));
  perform private.upsert_listing_category('classified', null, 'Diğer', 'diger', 'package', 90, false,
    jsonb_build_array(durum, pazarlik, takas));

  -- Classified children
  perform private.upsert_listing_category('classified', 'elektronik', 'Telefon', 'telefon', 'smartphone', 11, false,
    jsonb_build_array(durum,
      $j${"key":"marka","label":"Marka","type":"select","required":true,"options":[{"value":"apple","label":"Apple"},{"value":"samsung","label":"Samsung"},{"value":"xiaomi","label":"Xiaomi"},{"value":"huawei","label":"Huawei"},{"value":"oppo","label":"Oppo"},{"value":"diger","label":"Diğer"}]}$j$::jsonb,
      $j${"key":"model","label":"Model","type":"text"}$j$::jsonb,
      $j${"key":"hafiza","label":"Hafıza","type":"select","options":[{"value":"64","label":"64 GB"},{"value":"128","label":"128 GB"},{"value":"256","label":"256 GB"},{"value":"512","label":"512 GB"},{"value":"1024","label":"1 TB"}]}$j$::jsonb,
      garanti, pazarlik, takas));
  perform private.upsert_listing_category('classified', 'elektronik', 'Bilgisayar', 'bilgisayar', 'laptop', 12, false,
    jsonb_build_array(durum,
      $j${"key":"tur","label":"Tür","type":"select","required":true,"options":[{"value":"dizustu","label":"Dizüstü"},{"value":"masaustu","label":"Masaüstü"},{"value":"tablet","label":"Tablet"},{"value":"monitor","label":"Monitör"},{"value":"parca","label":"Bileşen / parça"}]}$j$::jsonb,
      marka,
      $j${"key":"ram","label":"RAM","type":"select","options":[{"value":"4","label":"4 GB"},{"value":"8","label":"8 GB"},{"value":"16","label":"16 GB"},{"value":"32","label":"32 GB ve üzeri"}]}$j$::jsonb,
      garanti, pazarlik, takas));
  perform private.upsert_listing_category('classified', 'elektronik', 'TV & Ses', 'tv-ses', 'tv', 13, false,
    jsonb_build_array(durum,
      $j${"key":"tur","label":"Tür","type":"select","options":[{"value":"tv","label":"Televizyon"},{"value":"ses_sistemi","label":"Ses sistemi"},{"value":"kulaklik","label":"Kulaklık"},{"value":"hoparlor","label":"Hoparlör"},{"value":"diger","label":"Diğer"}]}$j$::jsonb,
      marka,
      $j${"key":"ekran_boyutu","label":"Ekran boyutu (inç)","type":"number"}$j$::jsonb,
      pazarlik));
  perform private.upsert_listing_category('classified', 'elektronik', 'Oyun Konsolu', 'oyun-konsolu', 'gamepad-2', 14, false,
    jsonb_build_array(durum,
      $j${"key":"platform","label":"Platform","type":"select","required":true,"options":[{"value":"playstation","label":"PlayStation"},{"value":"xbox","label":"Xbox"},{"value":"nintendo","label":"Nintendo"},{"value":"pc","label":"PC oyun ekipmanı"},{"value":"diger","label":"Diğer"}]}$j$::jsonb,
      $j${"key":"kutu","label":"Kutusu var","type":"boolean"}$j$::jsonb,
      pazarlik, takas));
  perform private.upsert_listing_category('classified', 'ev-yasam', 'Mobilya', 'mobilya', 'armchair', 21, false,
    jsonb_build_array(durum,
      $j${"key":"tur","label":"Tür","type":"select","options":[{"value":"koltuk","label":"Koltuk takımı"},{"value":"yatak_odasi","label":"Yatak odası"},{"value":"yemek_odasi","label":"Yemek masası / odası"},{"value":"dolap","label":"Dolap"},{"value":"sehpa","label":"Sehpa / TV ünitesi"},{"value":"diger","label":"Diğer"}]}$j$::jsonb,
      $j${"key":"renk","label":"Renk","type":"text"}$j$::jsonb,
      pazarlik));
  perform private.upsert_listing_category('classified', 'ev-yasam', 'Beyaz Eşya', 'beyaz-esya', 'refrigerator', 22, false,
    jsonb_build_array(durum,
      $j${"key":"tur","label":"Tür","type":"select","required":true,"options":[{"value":"buzdolabi","label":"Buzdolabı"},{"value":"camasir","label":"Çamaşır makinesi"},{"value":"bulasik","label":"Bulaşık makinesi"},{"value":"firin","label":"Fırın / ocak"},{"value":"kurutma","label":"Kurutma makinesi"},{"value":"diger","label":"Diğer"}]}$j$::jsonb,
      marka,
      $j${"key":"enerji_sinifi","label":"Enerji sınıfı","type":"select","options":[{"value":"a3","label":"A+++"},{"value":"a2","label":"A++"},{"value":"a1","label":"A+"},{"value":"a","label":"A"},{"value":"b","label":"B ve altı"}]}$j$::jsonb,
      garanti, pazarlik));
  perform private.upsert_listing_category('classified', 'ev-yasam', 'Ev Tekstili', 'ev-tekstili', 'bed-double', 23, false,
    jsonb_build_array(durum,
      $j${"key":"tur","label":"Tür","type":"select","options":[{"value":"hali","label":"Halı"},{"value":"perde","label":"Perde"},{"value":"nevresim","label":"Nevresim / yatak örtüsü"},{"value":"diger","label":"Diğer"}]}$j$::jsonb,
      pazarlik));
  perform private.upsert_listing_category('classified', 'ev-yasam', 'Mutfak', 'mutfak', 'cooking-pot', 24, false,
    jsonb_build_array(durum,
      $j${"key":"tur","label":"Tür","type":"select","options":[{"value":"kucuk_ev_aleti","label":"Küçük ev aleti"},{"value":"tencere","label":"Tencere & tava"},{"value":"sofra","label":"Sofra / yemek takımı"},{"value":"diger","label":"Diğer"}]}$j$::jsonb,
      marka, pazarlik));

  -- Banned (hidden from pickers; posting is rejected by trigger)
  perform private.upsert_listing_category('classified', null, 'Emlak', 'emlak', 'house', 900, true, '[]');
  perform private.upsert_listing_category('classified', null, 'Vasıta', 'vasita', 'car', 901, true, '[]');
  perform private.upsert_listing_category('classified', null, 'İlaç', 'ilac', 'pill', 902, true, '[]');
  perform private.upsert_listing_category('classified', null, 'Silah', 'silah', 'shield-alert', 903, true, '[]');
  perform private.upsert_listing_category('classified', null, 'Canlı Hayvan', 'canli-hayvan', 'paw-print', 904, true, '[]');
  perform private.upsert_listing_category('classified', null, 'Alkol & Tütün', 'alkol-tutun', 'wine', 905, true, '[]');

  -- Job sectors
  perform private.upsert_listing_category('job', null, 'Üretim / Fabrika', 'is-uretim-fabrika', 'factory', 10, false, '[]');
  perform private.upsert_listing_category('job', null, 'Lojistik / Depo', 'is-lojistik-depo', 'warehouse', 20, false, '[]');
  perform private.upsert_listing_category('job', null, 'Satış / Mağaza', 'is-satis-magaza', 'store', 30, false, '[]');
  perform private.upsert_listing_category('job', null, 'Yeme-İçme', 'is-yeme-icme', 'utensils', 40, false, '[]');
  perform private.upsert_listing_category('job', null, 'Temizlik', 'is-temizlik', 'sparkles', 50, false, '[]');
  perform private.upsert_listing_category('job', null, 'Güvenlik', 'is-guvenlik', 'shield', 60, false, '[]');
  perform private.upsert_listing_category('job', null, 'Ofis / İdari', 'is-ofis-idari', 'briefcase', 70, false, '[]');
  perform private.upsert_listing_category('job', null, 'Sağlık', 'is-saglik', 'stethoscope', 80, false, '[]');
  perform private.upsert_listing_category('job', null, 'Eğitim', 'is-egitim', 'graduation-cap', 90, false, '[]');
  perform private.upsert_listing_category('job', null, 'İnşaat', 'is-insaat', 'hard-hat', 100, false, '[]');
  perform private.upsert_listing_category('job', null, 'Diğer', 'is-diger', 'ellipsis', 110, false, '[]');
end $$;

-- ---------------------------------------------------------------------------
-- Service categories
-- ---------------------------------------------------------------------------
do $$
begin
  -- top level
  perform private.upsert_service_category(null, 'Temizlik', 'temizlik', 'sparkles', 'Ev, ofis, koltuk ve halı temizliği', 10, false, false, '{temizlikçi}');
  perform private.upsert_service_category(null, 'Tadilat & Dekorasyon', 'tadilat-dekorasyon', 'paint-roller', 'Boya, parke, fayans ve alçıpan işleri', 20, false, false, '{tadilat,usta,dekorasyon}');
  perform private.upsert_service_category(null, 'Nakliyat', 'nakliyat', 'truck', 'Evden eve, ofis ve parça eşya taşıma', 30, false, false, '{nakliye,taşımacılık}');
  perform private.upsert_service_category(null, 'Tamir & Bakım', 'tamir-bakim', 'wrench', 'Kombi, klima, beyaz eşya ve montaj işleri', 40, false, false, '{tamir,servis,bakım}');
  perform private.upsert_service_category(null, 'Tesisat', 'tesisat', 'droplets', 'Su tesisatı, tıkanıklık ve petek temizliği', 50, false, false, '{tesisatçı,su tesisatı}');
  perform private.upsert_service_category(null, 'Elektrik', 'elektrik', 'zap', 'Elektrik arızası, tesisat ve aydınlatma', 60, false, false, '{elektrikçi}');
  perform private.upsert_service_category(null, 'Özel Ders', 'ozel-ders', 'graduation-cap', 'Matematik, İngilizce ve sınav hazırlık dersleri', 70, false, false, '{ders,öğretmen,hoca}');
  perform private.upsert_service_category(null, 'Güzellik & Bakım', 'guzellik-bakim', 'scissors', 'Eve gelen kuaför ve makyaj', 80, false, false, '{kuaför,güzellik}');
  perform private.upsert_service_category(null, 'Etkinlik & Organizasyon', 'etkinlik-organizasyon', 'party-popper', 'Düğün, doğum günü ve fotoğraf çekimi', 90, false, false, '{organizasyon,etkinlik}');
  perform private.upsert_service_category(null, 'Diğer Hizmetler', 'diger-hizmetler', 'ellipsis', 'Çilingir, bahçe bakımı, ilaçlama', 100, false, false, '{}');

  -- sub-categories
  perform private.upsert_service_category('temizlik', 'Ev Temizliği', 'ev-temizligi', 'house', 'Düzenli ya da tek seferlik ev temizliği', 11, true, true, '{temizlikçi,gündelikçi,"ev temizlikçisi",temizlik}');
  perform private.upsert_service_category('temizlik', 'Ofis Temizliği', 'ofis-temizligi', 'building-2', 'Ofis ve iş yeri temizliği', 12, false, false, '{"iş yeri temizliği","ofis temizlikçisi"}');
  perform private.upsert_service_category('temizlik', 'Koltuk Yıkama', 'koltuk-yikama', 'sofa', 'Yerinde koltuk, sandalye ve yatak yıkama', 13, true, false, '{"koltuk temizleme","yatak yıkama"}');
  perform private.upsert_service_category('temizlik', 'Halı Yıkama', 'hali-yikama', 'layers', 'Adresten alıp teslim eden halı yıkama', 14, false, false, '{halıcı,"halı temizleme"}');
  perform private.upsert_service_category('temizlik', 'İnşaat Sonrası Temizlik', 'insaat-sonrasi-temizlik', 'hard-hat', 'Tadilat ve inşaat sonrası detaylı temizlik', 15, false, false, '{"tadilat sonrası temizlik"}');

  perform private.upsert_service_category('tadilat-dekorasyon', 'Boya Badana', 'boya-badana', 'paint-roller', 'İç ve dış cephe boya badana', 21, true, false, '{boyacı,badana,"boya ustası"}');
  perform private.upsert_service_category('tadilat-dekorasyon', 'Parke Döşeme', 'parke', 'grid-3x3', 'Laminat ve masif parke döşeme, cila', 22, false, false, '{parkeci,laminat}');
  perform private.upsert_service_category('tadilat-dekorasyon', 'Fayans & Seramik', 'fayans', 'layout-grid', 'Banyo, mutfak ve zemin fayans işleri', 23, false, false, '{fayansçı,seramik}');
  perform private.upsert_service_category('tadilat-dekorasyon', 'Alçıpan & Asma Tavan', 'alcipan', 'panel-top', 'Asma tavan, bölme duvar, kartonpiyer', 24, false, false, '{alçıpancı,"asma tavan",kartonpiyer}');

  perform private.upsert_service_category('nakliyat', 'Evden Eve Nakliyat', 'evden-eve-nakliyat', 'truck', 'Paketleme dahil ev taşıma', 31, true, false, '{nakliye,"ev taşıma",nakliyeci}');
  perform private.upsert_service_category('nakliyat', 'Parça Eşya Taşıma', 'parca-esya-tasima', 'package', 'Tek parça ya da az eşya taşıma', 32, false, false, '{"eşya taşıma",kamyonet}');
  perform private.upsert_service_category('nakliyat', 'Ofis Taşıma', 'ofis-tasima', 'building-2', 'Ofis ve iş yeri taşıma', 33, false, false, '{"iş yeri taşıma"}');

  perform private.upsert_service_category('tamir-bakim', 'Kombi Bakımı', 'kombi-bakimi', 'flame', 'Kombi bakım, arıza ve montaj', 41, true, false, '{kombici,"kombi servisi","kombi tamiri"}');
  perform private.upsert_service_category('tamir-bakim', 'Klima Montaj & Bakım', 'klima-montaj-bakim', 'air-vent', 'Klima montajı, bakımı ve gaz dolumu', 42, true, false, '{klimacı,"klima servisi"}');
  perform private.upsert_service_category('tamir-bakim', 'Beyaz Eşya Tamiri', 'beyaz-esya-tamiri', 'washing-machine', 'Çamaşır, bulaşık makinesi, buzdolabı tamiri', 43, false, false, '{"beyaz eşya servisi","makine tamiri"}');
  perform private.upsert_service_category('tamir-bakim', 'Mobilya Montajı', 'mobilya-montaj', 'drill', 'Dolap, yatak, masa ve mutfak dolabı montajı', 44, false, false, '{montajcı,"ikea montaj"}');

  perform private.upsert_service_category('tesisat', 'Su Tesisatı', 'su-tesisati', 'droplets', 'Su kaçağı, musluk, klozet ve tesisat işleri', 51, true, false, '{tesisatçı,"su kaçağı",musluk,sıhhi}');
  perform private.upsert_service_category('tesisat', 'Tıkanıklık Açma', 'tikaniklik-acma', 'waves', 'Lavabo, klozet ve gider tıkanıklığı', 52, false, false, '{"lavabo açma","gider açma"}');
  perform private.upsert_service_category('tesisat', 'Petek Temizliği', 'petek-temizligi', 'heater', 'Makineli petek (radyatör) temizliği', 53, false, false, '{"radyatör temizliği"}');

  perform private.upsert_service_category('elektrik', 'Elektrikçi', 'elektrikci', 'zap', 'Elektrik arızası, priz ve tesisat', 61, true, false, '{"elektrik ustası",sigorta,priz}');
  perform private.upsert_service_category('elektrik', 'Avize & Aydınlatma Montajı', 'aydinlatma-montaj', 'lamp-ceiling', 'Avize, spot ve LED montajı', 62, false, false, '{"avize takma",spot,led}');

  perform private.upsert_service_category('ozel-ders', 'Matematik Özel Ders', 'matematik-ozel-ders', 'calculator', 'İlkokuldan üniversiteye matematik', 71, false, false, '{"matematik öğretmeni",matematik}');
  perform private.upsert_service_category('ozel-ders', 'İngilizce Özel Ders', 'ingilizce-ozel-ders', 'languages', 'Konuşma, okul ve sınav İngilizcesi', 72, false, false, '{"ingilizce öğretmeni",ingilizce}');
  perform private.upsert_service_category('ozel-ders', 'LGS / YKS Hazırlık', 'lgs-yks-hazirlik', 'book-open-check', 'Sınav hazırlık dersleri', 73, false, false, '{lgs,yks,tyt,ayt}');

  perform private.upsert_service_category('guzellik-bakim', 'Kuaför (eve gelen)', 'eve-gelen-kuafor', 'scissors', 'Evde saç kesimi, fön ve özel gün saçı', 81, false, false, '{kuaför,berber,"saç kesimi"}');
  perform private.upsert_service_category('guzellik-bakim', 'Makyaj', 'makyaj', 'sparkle', 'Gelin ve özel gün makyajı', 82, false, false, '{"gelin makyajı","makyaj artisti"}');

  perform private.upsert_service_category('etkinlik-organizasyon', 'Düğün Organizasyonu', 'dugun-organizasyonu', 'heart', 'Düğün, nişan, kına organizasyonu', 91, false, false, '{nişan,kına,düğün}');
  perform private.upsert_service_category('etkinlik-organizasyon', 'Doğum Günü Organizasyonu', 'dogum-gunu-organizasyonu', 'cake', 'Çocuk ve yetişkin doğum günü', 92, false, false, '{"doğum günü",animatör}');
  perform private.upsert_service_category('etkinlik-organizasyon', 'Fotoğrafçı', 'fotografci', 'camera', 'Düğün, dış çekim ve ürün fotoğrafı', 93, false, false, '{fotoğraf,"dış çekim"}');

  perform private.upsert_service_category('diger-hizmetler', 'Çilingir', 'cilingir', 'key-round', 'Kapı açma, kilit ve barel değişimi', 101, false, false, '{"kapı açma",anahtarcı,kilit}');
  perform private.upsert_service_category('diger-hizmetler', 'Bahçe Bakımı', 'bahce-bakimi', 'trees', 'Çim biçme, budama ve peyzaj', 102, false, false, '{bahçıvan,peyzaj}');
  perform private.upsert_service_category('diger-hizmetler', 'Böcek İlaçlama', 'bocek-ilaclama', 'bug', 'Haşere ve böcek ilaçlama', 103, false, false, '{ilaçlama,haşere}');
end $$;

-- ---------------------------------------------------------------------------
-- Question flows (v1, published). System steps (location, time, photos/note, summary, contact)
-- are appended by the UI and are NOT part of these schemas.
-- ---------------------------------------------------------------------------
do $$
begin
perform private.upsert_flow('ev-temizligi', $j${"steps":[
 {"id":"ev_tipi","type":"single","title":"Evin tipi nedir?","required":true,"options":[{"value":"daire","label":"Daire"},{"value":"mustakil","label":"Müstakil ev"},{"value":"villa","label":"Villa"}]},
 {"id":"oda_sayisi","type":"single","title":"Ev kaç odalı?","required":true,"options":[{"value":"1+0","label":"1+0"},{"value":"1+1","label":"1+1"},{"value":"2+1","label":"2+1"},{"value":"3+1","label":"3+1"},{"value":"4+1","label":"4+1"},{"value":"5+1","label":"5+1 ve üzeri"}]},
 {"id":"banyo_sayisi","type":"single","title":"Kaç banyo var?","required":true,"options":[{"value":"1","label":"1"},{"value":"2","label":"2"},{"value":"3","label":"3 ve üzeri"}]},
 {"id":"siklik","type":"single","title":"Ne sıklıkla temizlik istiyorsun?","required":true,"options":[{"value":"tek_sefer","label":"Bir kez"},{"value":"haftalik","label":"Her hafta"},{"value":"iki_haftada","label":"2 haftada bir"},{"value":"aylik","label":"Ayda bir"}]},
 {"id":"ekstralar","type":"multi","title":"Ek olarak yapılmasını istediklerin","help":"Birden fazla seçebilirsin.","required":false,"options":[{"value":"cam","label":"Cam silme"},{"value":"buzdolabi","label":"Buzdolabı içi"},{"value":"firin","label":"Fırın içi"},{"value":"utu","label":"Ütü"},{"value":"balkon","label":"Balkon"}]},
 {"id":"malzeme","type":"single","title":"Temizlik malzemesini kim getirsin?","required":true,"options":[{"value":"firma","label":"Firma getirsin"},{"value":"ben","label":"Evde var"}]}
]}$j$::jsonb);

perform private.upsert_flow('ofis-temizligi', $j${"steps":[
 {"id":"alan","type":"number","title":"Ofis yaklaşık kaç metrekare?","required":true,"min":10,"max":10000,"unit":"m²","placeholder":"Örn. 120"},
 {"id":"calisan","type":"single","title":"Ofiste kaç kişi çalışıyor?","required":true,"options":[{"value":"1-5","label":"1-5"},{"value":"6-20","label":"6-20"},{"value":"21-50","label":"21-50"},{"value":"50+","label":"50'den fazla"}]},
 {"id":"siklik","type":"single","title":"Ne sıklıkla temizlik istiyorsun?","required":true,"options":[{"value":"tek_sefer","label":"Bir kez"},{"value":"gunluk","label":"Her gün"},{"value":"haftada_birkac","label":"Haftada birkaç gün"},{"value":"haftalik","label":"Haftada bir"}]},
 {"id":"saat","type":"single","title":"Temizlik hangi saatlerde yapılsın?","required":false,"options":[{"value":"mesai_disi","label":"Mesai dışında"},{"value":"mesai_icinde","label":"Mesai saatinde"},{"value":"farketmez","label":"Fark etmez"}]}
]}$j$::jsonb);

perform private.upsert_flow('koltuk-yikama', $j${"steps":[
 {"id":"esya","type":"multi","title":"Neler yıkanacak?","required":true,"options":[{"value":"koltuk","label":"Koltuk takımı"},{"value":"kose","label":"Köşe koltuk"},{"value":"berjer","label":"Berjer"},{"value":"sandalye","label":"Sandalye"},{"value":"yatak","label":"Yatak"}]},
 {"id":"oturma_kisi","type":"number","title":"Toplam kaç kişilik oturma alanı var?","required":true,"min":1,"max":30,"unit":"kişilik","showIf":{"step":"esya","in":["koltuk","kose"]}},
 {"id":"sandalye_sayisi","type":"number","title":"Kaç sandalye yıkanacak?","required":true,"min":1,"max":40,"showIf":{"step":"esya","in":["sandalye"]}},
 {"id":"kumas","type":"single","title":"Kumaş tipi nedir?","required":false,"options":[{"value":"kumas","label":"Kumaş"},{"value":"deri","label":"Deri"},{"value":"kadife","label":"Kadife / nubuk"},{"value":"bilmiyorum","label":"Bilmiyorum"}]},
 {"id":"leke","type":"single","title":"Özel leke var mı?","required":false,"options":[{"value":"yok","label":"Yok"},{"value":"var","label":"Var (evcil hayvan, yemek vb.)"}]}
]}$j$::jsonb);

perform private.upsert_flow('hali-yikama', $j${"steps":[
 {"id":"hali_sayisi","type":"number","title":"Kaç halı yıkanacak?","required":true,"min":1,"max":30},
 {"id":"toplam_m2","type":"number","title":"Yaklaşık toplam metrekare","help":"Bilmiyorsan boş bırakabilirsin.","required":false,"min":1,"max":300,"unit":"m²"},
 {"id":"hali_tipi","type":"multi","title":"Halı tipi","required":false,"options":[{"value":"makine","label":"Makine halısı"},{"value":"el","label":"El dokuma"},{"value":"yun","label":"Yün"},{"value":"shaggy","label":"Shaggy / post"}]},
 {"id":"teslim","type":"single","title":"Teslim şekli","required":true,"options":[{"value":"servis","label":"Adresten alınıp getirilsin"},{"value":"kendim","label":"Kendim götürürüm"}]}
]}$j$::jsonb);

perform private.upsert_flow('insaat-sonrasi-temizlik', $j${"steps":[
 {"id":"alan","type":"number","title":"Temizlenecek alan kaç metrekare?","required":true,"min":20,"max":5000,"unit":"m²"},
 {"id":"mekan","type":"single","title":"Mekan tipi","required":true,"options":[{"value":"daire","label":"Daire"},{"value":"mustakil","label":"Müstakil ev"},{"value":"ofis","label":"Ofis / dükkan"},{"value":"bina","label":"Apartman ortak alanı"}]},
 {"id":"kapsam","type":"multi","title":"Neler dahil olsun?","required":true,"options":[{"value":"cam","label":"Camlar ve doğramalar"},{"value":"zemin","label":"Zemin (boya / harç lekesi)"},{"value":"mutfak_banyo","label":"Mutfak ve banyo"},{"value":"moloz","label":"Moloz çıkarma"}]},
 {"id":"durum","type":"single","title":"Tadilat bitti mi?","required":true,"options":[{"value":"bitti","label":"Bitti"},{"value":"bitmek_uzere","label":"Bitmek üzere"}]}
]}$j$::jsonb);

perform private.upsert_flow('boya-badana', $j${"steps":[
 {"id":"mekan","type":"single","title":"Nereyi boyatacaksın?","required":true,"options":[{"value":"daire","label":"Daire"},{"value":"mustakil","label":"Müstakil ev"},{"value":"ofis","label":"Ofis / dükkan"},{"value":"dis_cephe","label":"Dış cephe"}]},
 {"id":"oda_sayisi","type":"single","title":"Kaç odalı?","required":true,"showIf":{"step":"mekan","in":["daire","mustakil"]},"options":[{"value":"1+1","label":"1+1"},{"value":"2+1","label":"2+1"},{"value":"3+1","label":"3+1"},{"value":"4+1","label":"4+1"},{"value":"5+1","label":"5+1 ve üzeri"}]},
 {"id":"alan","type":"number","title":"Yaklaşık kaç metrekare?","required":true,"showIf":{"step":"mekan","in":["ofis","dis_cephe"]},"min":5,"max":5000,"unit":"m²"},
 {"id":"kapsam","type":"multi","title":"Neler boyanacak?","required":true,"options":[{"value":"duvar","label":"Duvarlar"},{"value":"tavan","label":"Tavanlar"},{"value":"kapi","label":"Kapılar"},{"value":"demir","label":"Pencere / demir aksam"}]},
 {"id":"boya","type":"single","title":"Boyayı kim alsın?","required":true,"options":[{"value":"usta","label":"Usta getirsin"},{"value":"ben","label":"Ben alacağım"},{"value":"karar","label":"Birlikte karar verelim"}]},
 {"id":"esya","type":"single","title":"Mekan eşyalı mı?","required":false,"options":[{"value":"esyali","label":"Eşyalı"},{"value":"bos","label":"Boş"}]}
]}$j$::jsonb);

perform private.upsert_flow('parke', $j${"steps":[
 {"id":"islem","type":"single","title":"Ne yaptırmak istiyorsun?","required":true,"options":[{"value":"yeni","label":"Yeni parke döşeme"},{"value":"sokme","label":"Eskiyi söküp yenisini döşeme"},{"value":"tamir","label":"Tamir / cila"}]},
 {"id":"alan","type":"number","title":"Yaklaşık kaç metrekare?","required":true,"min":1,"max":2000,"unit":"m²"},
 {"id":"tip","type":"single","title":"Parke tipi","required":false,"showIf":{"step":"islem","in":["yeni","sokme"]},"options":[{"value":"laminat","label":"Laminat"},{"value":"masif","label":"Masif"},{"value":"spc","label":"SPC / vinil"},{"value":"karar","label":"Karar vermedim"}]},
 {"id":"malzeme","type":"single","title":"Malzemeyi kim alsın?","required":true,"options":[{"value":"usta","label":"Usta getirsin"},{"value":"ben","label":"Ben alacağım"}]}
]}$j$::jsonb);

perform private.upsert_flow('fayans', $j${"steps":[
 {"id":"alan_tipi","type":"multi","title":"Nereye döşenecek?","required":true,"options":[{"value":"banyo","label":"Banyo"},{"value":"mutfak","label":"Mutfak tezgah arası"},{"value":"zemin","label":"Zemin"},{"value":"balkon","label":"Balkon / teras"},{"value":"dis","label":"Dış mekan"}]},
 {"id":"alan","type":"number","title":"Yaklaşık kaç metrekare?","required":true,"min":1,"max":1000,"unit":"m²"},
 {"id":"sokme","type":"single","title":"Eski fayans sökülecek mi?","required":true,"options":[{"value":"evet","label":"Evet"},{"value":"hayir","label":"Hayır"}]},
 {"id":"malzeme","type":"single","title":"Malzemeyi kim alsın?","required":true,"options":[{"value":"usta","label":"Usta getirsin"},{"value":"ben","label":"Ben alacağım"}]}
]}$j$::jsonb);

perform private.upsert_flow('alcipan', $j${"steps":[
 {"id":"is","type":"multi","title":"Ne yaptırmak istiyorsun?","required":true,"options":[{"value":"asma_tavan","label":"Asma tavan"},{"value":"bolme","label":"Bölme duvar"},{"value":"kartonpiyer","label":"Kartonpiyer"},{"value":"gizli_isik","label":"Gizli ışık bandı"}]},
 {"id":"alan","type":"number","title":"Yaklaşık kaç metrekare?","required":false,"min":1,"max":2000,"unit":"m²"},
 {"id":"mekan","type":"single","title":"Mekan","required":true,"options":[{"value":"ev","label":"Ev"},{"value":"ofis","label":"Ofis"},{"value":"dukkan","label":"Dükkan / mağaza"}]}
]}$j$::jsonb);

perform private.upsert_flow('evden-eve-nakliyat', $j${"steps":[
 {"id":"ev_tipi","type":"single","title":"Taşınacak ev kaç odalı?","required":true,"options":[{"value":"1+1","label":"1+0 / 1+1"},{"value":"2+1","label":"2+1"},{"value":"3+1","label":"3+1"},{"value":"4+1","label":"4+1"},{"value":"5+1","label":"5+1 ve üzeri"}]},
 {"id":"nereye","type":"single","title":"Nereye taşınıyorsun?","required":true,"options":[{"value":"gebze_ici","label":"Gebze içi"},{"value":"kocaeli","label":"Kocaeli'de başka ilçe"},{"value":"istanbul","label":"İstanbul"},{"value":"sehir_disi","label":"Başka şehir"}]},
 {"id":"kat","type":"number","title":"Mevcut ev kaçıncı katta?","required":true,"min":-2,"max":40,"placeholder":"Giriş kat için 0"},
 {"id":"asansor","type":"single","title":"Binada asansör var mı?","required":true,"options":[{"value":"var","label":"Var"},{"value":"yok","label":"Yok"}]},
 {"id":"paketleme","type":"single","title":"Paketleme de yapılsın mı?","required":true,"options":[{"value":"tam","label":"Evet, tüm eşyalar paketlensin"},{"value":"kismen","label":"Sadece hassas eşyalar"},{"value":"hayir","label":"Hayır, kendim paketlerim"}]},
 {"id":"dis_asansor","type":"single","title":"Dış cephe asansörü gerekir mi?","required":false,"options":[{"value":"evet","label":"Evet"},{"value":"hayir","label":"Hayır"},{"value":"bilmiyorum","label":"Bilmiyorum"}]}
]}$j$::jsonb);

perform private.upsert_flow('parca-esya-tasima', $j${"steps":[
 {"id":"esyalar","type":"multi","title":"Ne taşınacak?","required":true,"options":[{"value":"beyaz_esya","label":"Beyaz eşya"},{"value":"koltuk","label":"Koltuk"},{"value":"yatak","label":"Yatak / baza"},{"value":"dolap","label":"Dolap"},{"value":"koli","label":"Koli / kutu"},{"value":"diger","label":"Diğer"}]},
 {"id":"adet","type":"number","title":"Yaklaşık kaç parça?","required":true,"min":1,"max":100},
 {"id":"nereye","type":"single","title":"Nereye taşınacak?","required":true,"options":[{"value":"gebze_ici","label":"Gebze içi"},{"value":"kocaeli","label":"Kocaeli'de başka ilçe"},{"value":"istanbul","label":"İstanbul"},{"value":"sehir_disi","label":"Başka şehir"}]},
 {"id":"tasiyici","type":"single","title":"Taşıyıcı eleman gerekli mi?","required":true,"options":[{"value":"evet","label":"Evet, taşıyıcı gelsin"},{"value":"hayir","label":"Hayır, sadece araç yeter"}]}
]}$j$::jsonb);

perform private.upsert_flow('ofis-tasima', $j${"steps":[
 {"id":"calisan","type":"single","title":"Ofiste kaç kişi çalışıyor?","required":true,"options":[{"value":"1-5","label":"1-5"},{"value":"6-15","label":"6-15"},{"value":"16-50","label":"16-50"},{"value":"50+","label":"50'den fazla"}]},
 {"id":"nereye","type":"single","title":"Nereye taşınıyorsunuz?","required":true,"options":[{"value":"gebze_ici","label":"Gebze içi"},{"value":"kocaeli","label":"Kocaeli'de başka ilçe"},{"value":"istanbul","label":"İstanbul"},{"value":"sehir_disi","label":"Başka şehir"}]},
 {"id":"ozel","type":"multi","title":"Özel taşıma gerektiren eşyalar","required":false,"options":[{"value":"it","label":"Sunucu / IT ekipmanı"},{"value":"kasa","label":"Kasa"},{"value":"arsiv","label":"Arşiv dolapları"}]},
 {"id":"hafta_sonu","type":"single","title":"Taşıma hafta sonu mu olsun?","required":false,"options":[{"value":"evet","label":"Evet"},{"value":"hayir","label":"Hayır"},{"value":"farketmez","label":"Fark etmez"}]}
]}$j$::jsonb);

perform private.upsert_flow('kombi-bakimi', $j${"steps":[
 {"id":"islem","type":"single","title":"Ne yaptırmak istiyorsun?","required":true,"options":[{"value":"bakim","label":"Yıllık bakım"},{"value":"ariza","label":"Arıza / tamir"},{"value":"montaj","label":"Yeni kombi montajı"}]},
 {"id":"ariza_turu","type":"multi","title":"Sorun ne?","required":true,"showIf":{"step":"islem","in":["ariza"]},"options":[{"value":"sicak_su","label":"Sıcak su gelmiyor"},{"value":"petek","label":"Petekler ısınmıyor"},{"value":"basinc","label":"Basınç düşüyor"},{"value":"ses","label":"Ses yapıyor"},{"value":"hata_kodu","label":"Hata kodu veriyor"},{"value":"su_akitiyor","label":"Su akıtıyor"}]},
 {"id":"marka","type":"single","title":"Kombi markası","required":false,"options":[{"value":"demirdokum","label":"DemirDöküm"},{"value":"vaillant","label":"Vaillant"},{"value":"baymak","label":"Baymak"},{"value":"eca","label":"E.C.A."},{"value":"bosch","label":"Bosch"},{"value":"buderus","label":"Buderus"},{"value":"diger","label":"Diğer / bilmiyorum"}]},
 {"id":"yas","type":"single","title":"Kombi kaç yaşında?","required":false,"showIf":{"step":"islem","in":["bakim","ariza"]},"options":[{"value":"0-2","label":"0-2 yıl"},{"value":"3-5","label":"3-5 yıl"},{"value":"6-10","label":"6-10 yıl"},{"value":"10+","label":"10 yıldan fazla"},{"value":"bilmiyorum","label":"Bilmiyorum"}]},
 {"id":"petek","type":"single","title":"Petek temizliği de yapılsın mı?","required":false,"options":[{"value":"evet","label":"Evet"},{"value":"hayir","label":"Hayır"}]}
]}$j$::jsonb);

perform private.upsert_flow('klima-montaj-bakim', $j${"steps":[
 {"id":"islem","type":"single","title":"Ne yaptırmak istiyorsun?","required":true,"options":[{"value":"montaj","label":"Montaj"},{"value":"bakim","label":"Bakım / temizlik"},{"value":"ariza","label":"Arıza / gaz dolumu"},{"value":"sokme","label":"Söküp taşıma"}]},
 {"id":"adet","type":"number","title":"Kaç klima?","required":true,"min":1,"max":20},
 {"id":"btu","type":"single","title":"Klima kapasitesi","required":false,"options":[{"value":"9000","label":"9.000 BTU"},{"value":"12000","label":"12.000 BTU"},{"value":"18000","label":"18.000 BTU"},{"value":"24000","label":"24.000 BTU"},{"value":"bilmiyorum","label":"Bilmiyorum"}]},
 {"id":"dis_unite","type":"single","title":"Dış ünite nereye konacak?","required":true,"showIf":{"step":"islem","in":["montaj","sokme"]},"options":[{"value":"balkon","label":"Balkon"},{"value":"cephe","label":"Dış cephe (iskele gerekebilir)"},{"value":"cati","label":"Çatı"}]}
]}$j$::jsonb);

perform private.upsert_flow('beyaz-esya-tamiri', $j${"steps":[
 {"id":"cihaz","type":"single","title":"Hangi cihaz?","required":true,"options":[{"value":"camasir","label":"Çamaşır makinesi"},{"value":"bulasik","label":"Bulaşık makinesi"},{"value":"buzdolabi","label":"Buzdolabı"},{"value":"firin","label":"Fırın / ocak"},{"value":"kurutma","label":"Kurutma makinesi"}]},
 {"id":"marka","type":"single","title":"Markası","required":false,"options":[{"value":"arcelik","label":"Arçelik"},{"value":"beko","label":"Beko"},{"value":"bosch","label":"Bosch"},{"value":"siemens","label":"Siemens"},{"value":"vestel","label":"Vestel"},{"value":"samsung","label":"Samsung"},{"value":"lg","label":"LG"},{"value":"diger","label":"Diğer"}]},
 {"id":"sorun","type":"text","title":"Sorunu kısaca anlat","required":true,"min":5,"max":300,"placeholder":"Örn. su boşaltmıyor, E05 hata kodu veriyor"},
 {"id":"garanti","type":"single","title":"Garantisi devam ediyor mu?","required":false,"options":[{"value":"evet","label":"Evet"},{"value":"hayir","label":"Hayır"},{"value":"bilmiyorum","label":"Bilmiyorum"}]}
]}$j$::jsonb);

perform private.upsert_flow('mobilya-montaj', $j${"steps":[
 {"id":"esya","type":"multi","title":"Ne monte edilecek?","required":true,"options":[{"value":"dolap","label":"Gardırop / dolap"},{"value":"yatak","label":"Yatak / baza"},{"value":"masa","label":"Masa"},{"value":"tv_unitesi","label":"TV ünitesi"},{"value":"mutfak","label":"Mutfak dolabı"},{"value":"diger","label":"Diğer"}]},
 {"id":"adet","type":"number","title":"Kaç parça?","required":true,"min":1,"max":50},
 {"id":"nereden","type":"single","title":"Mobilya nereden alındı?","required":false,"options":[{"value":"ikea","label":"IKEA"},{"value":"koctas","label":"Koçtaş"},{"value":"bellona_istikbal","label":"Bellona / İstikbal"},{"value":"diger","label":"Diğer"}]},
 {"id":"sokme","type":"single","title":"Eski mobilya sökülecek mi?","required":false,"options":[{"value":"evet","label":"Evet"},{"value":"hayir","label":"Hayır"}]}
]}$j$::jsonb);

perform private.upsert_flow('su-tesisati', $j${"steps":[
 {"id":"sorun","type":"single","title":"Ne tür bir iş?","required":true,"options":[{"value":"sizinti","label":"Su sızıntısı / kaçak"},{"value":"musluk","label":"Musluk / batarya değişimi"},{"value":"klozet","label":"Klozet / rezervuar"},{"value":"tesisat","label":"Tesisat yenileme"},{"value":"termosifon","label":"Şofben / termosifon montajı"},{"value":"diger","label":"Diğer"}]},
 {"id":"kacak_tespit","type":"single","title":"Cihazla kaçak tespiti gerekiyor mu?","required":false,"showIf":{"step":"sorun","in":["sizinti"]},"options":[{"value":"evet","label":"Evet"},{"value":"hayir","label":"Hayır"},{"value":"bilmiyorum","label":"Bilmiyorum"}]},
 {"id":"mekan","type":"multi","title":"Sorun nerede?","required":true,"options":[{"value":"banyo","label":"Banyo"},{"value":"mutfak","label":"Mutfak"},{"value":"tuvalet","label":"Tuvalet"},{"value":"balkon","label":"Balkon"},{"value":"bina","label":"Bina girişi / ortak alan"}]},
 {"id":"detay","type":"text","title":"Eklemek istediğin bir detay var mı?","required":false,"max":300,"placeholder":"Örn. alt kattaki komşuya su sızıyor"}
]}$j$::jsonb);

perform private.upsert_flow('tikaniklik-acma', $j${"steps":[
 {"id":"yer","type":"single","title":"Tıkanıklık nerede?","required":true,"options":[{"value":"lavabo","label":"Lavabo"},{"value":"klozet","label":"Klozet"},{"value":"yer_gideri","label":"Banyo / yer gideri"},{"value":"mutfak","label":"Mutfak gideri"},{"value":"ana_hat","label":"Bina ana hattı"}]},
 {"id":"sure","type":"single","title":"Ne zamandır tıkalı?","required":false,"options":[{"value":"bugun","label":"Bugün"},{"value":"birkac_gun","label":"Birkaç gündür"},{"value":"tekrarliyor","label":"Sık sık tekrarlıyor"}]},
 {"id":"kamera","type":"single","title":"Kamera ile görüntüleme istiyor musun?","required":false,"options":[{"value":"evet","label":"Evet"},{"value":"hayir","label":"Hayır"},{"value":"bilmiyorum","label":"Bilmiyorum"}]}
]}$j$::jsonb);

perform private.upsert_flow('petek-temizligi', $j${"steps":[
 {"id":"petek_sayisi","type":"number","title":"Kaç petek var?","required":true,"min":1,"max":40},
 {"id":"isitma","type":"single","title":"Isıtma tipi","required":true,"options":[{"value":"kombi","label":"Kombi"},{"value":"merkezi","label":"Merkezi sistem"}]},
 {"id":"yontem","type":"single","title":"Yöntem tercihin","required":false,"options":[{"value":"makine","label":"Makineli (ilaçlı) temizlik"},{"value":"farketmez","label":"Fark etmez"}]}
]}$j$::jsonb);

perform private.upsert_flow('elektrikci', $j${"steps":[
 {"id":"is","type":"multi","title":"Ne yaptırmak istiyorsun?","required":true,"options":[{"value":"ariza","label":"Arıza / sigorta atıyor"},{"value":"priz","label":"Priz / anahtar"},{"value":"tesisat","label":"Tesisat yenileme"},{"value":"pano","label":"Sigorta panosu"},{"value":"topraklama","label":"Topraklama"},{"value":"diger","label":"Diğer"}]},
 {"id":"mekan","type":"single","title":"Mekan","required":true,"options":[{"value":"ev","label":"Ev"},{"value":"ofis","label":"Ofis / dükkan"},{"value":"bina","label":"Apartman ortak alanı"}]},
 {"id":"detay","type":"text","title":"Sorunu kısaca anlat","required":false,"max":300,"placeholder":"Örn. mutfakta prizler çalışmıyor"}
]}$j$::jsonb);

perform private.upsert_flow('aydinlatma-montaj', $j${"steps":[
 {"id":"tur","type":"multi","title":"Ne monte edilecek?","required":true,"options":[{"value":"avize","label":"Avize"},{"value":"spot","label":"Spot"},{"value":"led","label":"LED şerit"},{"value":"aplik","label":"Aplik"},{"value":"dis","label":"Dış mekan aydınlatma"}]},
 {"id":"adet","type":"number","title":"Toplam kaç adet?","required":true,"min":1,"max":100},
 {"id":"tavan","type":"single","title":"Tavan yüksekliği","required":false,"options":[{"value":"normal","label":"Normal (3 m'ye kadar)"},{"value":"yuksek","label":"Yüksek (merdiven / iskele gerekir)"}]}
]}$j$::jsonb);

perform private.upsert_flow('matematik-ozel-ders', $j${"steps":[
 {"id":"seviye","type":"single","title":"Öğrencinin seviyesi","required":true,"options":[{"value":"ilkokul","label":"İlkokul"},{"value":"ortaokul","label":"Ortaokul"},{"value":"lise","label":"Lise"},{"value":"universite","label":"Üniversite"},{"value":"yetiskin","label":"Yetişkin"}]},
 {"id":"hedef","type":"single","title":"Dersin amacı","required":true,"options":[{"value":"okul","label":"Okul derslerine destek"},{"value":"lgs","label":"LGS"},{"value":"yks","label":"YKS (TYT / AYT)"},{"value":"diger","label":"Diğer"}]},
 {"id":"ders_yeri","type":"single","title":"Ders nerede olsun?","required":true,"options":[{"value":"ogrenci_evi","label":"Öğrencinin evinde"},{"value":"ogretmen","label":"Öğretmenin yerinde"},{"value":"online","label":"Online"}]},
 {"id":"haftalik","type":"single","title":"Haftada kaç ders?","required":false,"options":[{"value":"1","label":"1"},{"value":"2","label":"2"},{"value":"3+","label":"3 ve üzeri"}]}
]}$j$::jsonb);

perform private.upsert_flow('ingilizce-ozel-ders', $j${"steps":[
 {"id":"seviye","type":"single","title":"Şu anki seviye","required":true,"options":[{"value":"baslangic","label":"Başlangıç"},{"value":"orta","label":"Orta"},{"value":"ileri","label":"İleri"}]},
 {"id":"amac","type":"single","title":"Amaç","required":true,"options":[{"value":"konusma","label":"Konuşma"},{"value":"okul","label":"Okul dersi"},{"value":"sinav","label":"Sınav (YDS, IELTS, TOEFL)"},{"value":"is","label":"İş İngilizcesi"}]},
 {"id":"ogrenci","type":"single","title":"Ders kimin için?","required":false,"options":[{"value":"cocuk","label":"Çocuk"},{"value":"genc","label":"Genç (lise / üniversite)"},{"value":"yetiskin","label":"Yetişkin"}]},
 {"id":"ders_yeri","type":"single","title":"Ders nerede olsun?","required":true,"options":[{"value":"ogrenci_evi","label":"Öğrencinin evinde"},{"value":"ogretmen","label":"Öğretmenin yerinde"},{"value":"online","label":"Online"}]},
 {"id":"haftalik","type":"single","title":"Haftada kaç ders?","required":false,"options":[{"value":"1","label":"1"},{"value":"2","label":"2"},{"value":"3+","label":"3 ve üzeri"}]}
]}$j$::jsonb);

perform private.upsert_flow('lgs-yks-hazirlik', $j${"steps":[
 {"id":"sinav","type":"single","title":"Hangi sınava hazırlanılıyor?","required":true,"options":[{"value":"lgs","label":"LGS"},{"value":"tyt","label":"YKS - TYT"},{"value":"ayt","label":"YKS - AYT"},{"value":"ydt","label":"YKS - YDT"}]},
 {"id":"dersler","type":"multi","title":"Hangi dersler?","required":true,"options":[{"value":"matematik","label":"Matematik"},{"value":"fen","label":"Fen bilimleri"},{"value":"turkce","label":"Türkçe / Edebiyat"},{"value":"fizik","label":"Fizik"},{"value":"kimya","label":"Kimya"},{"value":"biyoloji","label":"Biyoloji"},{"value":"sosyal","label":"Sosyal bilimler"}]},
 {"id":"ders_yeri","type":"single","title":"Ders nerede olsun?","required":true,"options":[{"value":"ogrenci_evi","label":"Öğrencinin evinde"},{"value":"ogretmen","label":"Öğretmenin yerinde"},{"value":"online","label":"Online"}]},
 {"id":"haftalik","type":"single","title":"Haftada kaç ders?","required":false,"options":[{"value":"1","label":"1"},{"value":"2","label":"2"},{"value":"3+","label":"3 ve üzeri"}]}
]}$j$::jsonb);

perform private.upsert_flow('eve-gelen-kuafor', $j${"steps":[
 {"id":"hizmet","type":"multi","title":"Hangi hizmetler?","required":true,"options":[{"value":"sac_kesim","label":"Saç kesimi"},{"value":"fon","label":"Fön"},{"value":"boya","label":"Saç boyama"},{"value":"topuz","label":"Topuz / özel gün saçı"},{"value":"erkek","label":"Erkek tıraşı"}]},
 {"id":"kisi","type":"number","title":"Kaç kişi?","required":true,"min":1,"max":20,"unit":"kişi"},
 {"id":"ozel_gun","type":"single","title":"Özel bir gün için mi?","required":false,"options":[{"value":"dugun","label":"Düğün / nişan"},{"value":"mezuniyet","label":"Mezuniyet"},{"value":"hayir","label":"Hayır"}]}
]}$j$::jsonb);

perform private.upsert_flow('makyaj', $j${"steps":[
 {"id":"tur","type":"single","title":"Makyaj türü","required":true,"options":[{"value":"gelin","label":"Gelin makyajı"},{"value":"ozel_gun","label":"Özel gün makyajı"},{"value":"gunluk","label":"Günlük makyaj"}]},
 {"id":"prova","type":"single","title":"Prova ister misin?","required":false,"showIf":{"step":"tur","in":["gelin"]},"options":[{"value":"evet","label":"Evet"},{"value":"hayir","label":"Hayır"}]},
 {"id":"kisi","type":"number","title":"Kaç kişi?","required":true,"min":1,"max":20,"unit":"kişi"},
 {"id":"yer","type":"single","title":"Makyaj nerede yapılsın?","required":true,"options":[{"value":"ev","label":"Evime gelsin"},{"value":"salon","label":"Salona gidebilirim"}]}
]}$j$::jsonb);

perform private.upsert_flow('dugun-organizasyonu', $j${"steps":[
 {"id":"etkinlik","type":"single","title":"Etkinlik türü","required":true,"options":[{"value":"dugun","label":"Düğün"},{"value":"nisan","label":"Nişan"},{"value":"kina","label":"Kına"},{"value":"soz","label":"Söz"}]},
 {"id":"davetli","type":"number","title":"Yaklaşık kaç davetli?","required":true,"min":10,"max":2000,"unit":"kişi"},
 {"id":"mekan","type":"single","title":"Mekan durumu","required":true,"options":[{"value":"var","label":"Mekan hazır"},{"value":"yok","label":"Mekan da ayarlansın"}]},
 {"id":"hizmetler","type":"multi","title":"Neler lazım?","required":true,"options":[{"value":"susleme","label":"Süsleme / dekor"},{"value":"muzik","label":"Müzik / DJ"},{"value":"ikram","label":"İkram / catering"},{"value":"foto","label":"Fotoğraf & video"},{"value":"ses_isik","label":"Ses ve ışık"}]},
 {"id":"butce","type":"single","title":"Yaklaşık bütçe","required":false,"options":[{"value":"0-25000","label":"25.000 TL altı"},{"value":"25000-75000","label":"25.000 - 75.000 TL"},{"value":"75000-150000","label":"75.000 - 150.000 TL"},{"value":"150000+","label":"150.000 TL üzeri"}]}
]}$j$::jsonb);

perform private.upsert_flow('dogum-gunu-organizasyonu', $j${"steps":[
 {"id":"kimin","type":"single","title":"Kimin için?","required":true,"options":[{"value":"cocuk","label":"Çocuk"},{"value":"yetiskin","label":"Yetişkin"}]},
 {"id":"yas","type":"number","title":"Kaç yaşına giriyor?","required":false,"min":1,"max":100},
 {"id":"davetli","type":"number","title":"Kaç kişi katılacak?","required":true,"min":2,"max":300,"unit":"kişi"},
 {"id":"hizmetler","type":"multi","title":"Neler lazım?","required":true,"options":[{"value":"susleme","label":"Balon / süsleme"},{"value":"pasta","label":"Pasta"},{"value":"animator","label":"Animatör"},{"value":"ikram","label":"İkram"},{"value":"foto","label":"Fotoğrafçı"}]},
 {"id":"mekan","type":"single","title":"Kutlama nerede olacak?","required":true,"options":[{"value":"ev","label":"Evde"},{"value":"mekan_var","label":"Kiraladığım mekanda"},{"value":"mekan_yok","label":"Mekan da ayarlansın"}]}
]}$j$::jsonb);

perform private.upsert_flow('fotografci', $j${"steps":[
 {"id":"tur","type":"single","title":"Çekim türü","required":true,"options":[{"value":"dugun","label":"Düğün / nişan"},{"value":"dis_cekim","label":"Dış çekim"},{"value":"bebek_aile","label":"Bebek / aile"},{"value":"urun","label":"Ürün / kurumsal"},{"value":"etkinlik","label":"Etkinlik"}]},
 {"id":"sure","type":"single","title":"Çekim süresi","required":true,"options":[{"value":"1","label":"1 saate kadar"},{"value":"1-3","label":"1-3 saat"},{"value":"tam_gun","label":"Tam gün"}]},
 {"id":"video","type":"single","title":"Video da çekilsin mi?","required":false,"options":[{"value":"evet","label":"Evet"},{"value":"hayir","label":"Hayır"}]},
 {"id":"teslim","type":"multi","title":"Teslim şekli","required":false,"options":[{"value":"dijital","label":"Dijital dosya"},{"value":"album","label":"Albüm"},{"value":"baski","label":"Baskı"}]}
]}$j$::jsonb);

perform private.upsert_flow('cilingir', $j${"steps":[
 {"id":"is","type":"single","title":"Ne oldu?","required":true,"options":[{"value":"kapida_kaldim","label":"Kapıda kaldım"},{"value":"kilit_degisim","label":"Kilit / barel değişimi"},{"value":"kasa","label":"Kasa açma"},{"value":"oto","label":"Oto kapı açma"}]},
 {"id":"kapi","type":"single","title":"Kapı tipi","required":true,"showIf":{"step":"is","in":["kapida_kaldim","kilit_degisim"]},"options":[{"value":"celik","label":"Çelik kapı"},{"value":"ahsap","label":"Ahşap / iç kapı"},{"value":"bina","label":"Bina giriş kapısı"}]},
 {"id":"barel","type":"single","title":"Yeni barel takılsın mı?","required":false,"showIf":{"step":"is","in":["kapida_kaldim","kilit_degisim"]},"options":[{"value":"evet","label":"Evet"},{"value":"hayir","label":"Hayır"}]}
]}$j$::jsonb);

perform private.upsert_flow('bahce-bakimi', $j${"steps":[
 {"id":"is","type":"multi","title":"Neler yapılsın?","required":true,"options":[{"value":"cim","label":"Çim biçme"},{"value":"budama","label":"Ağaç / çit budama"},{"value":"ilaclama","label":"Bahçe ilaçlama"},{"value":"peyzaj","label":"Peyzaj düzenleme"},{"value":"sulama","label":"Sulama sistemi"}]},
 {"id":"alan","type":"number","title":"Bahçe yaklaşık kaç metrekare?","required":false,"min":10,"max":20000,"unit":"m²"},
 {"id":"siklik","type":"single","title":"Ne sıklıkla?","required":true,"options":[{"value":"tek","label":"Bir kez"},{"value":"aylik","label":"Ayda bir"},{"value":"haftalik","label":"Her hafta"}]}
]}$j$::jsonb);

perform private.upsert_flow('bocek-ilaclama', $j${"steps":[
 {"id":"hasere","type":"multi","title":"Hangi haşere?","required":true,"options":[{"value":"hamam_bocegi","label":"Hamam böceği"},{"value":"karinca","label":"Karınca"},{"value":"fare","label":"Fare"},{"value":"tahta_kurusu","label":"Tahta kurusu"},{"value":"sivrisinek","label":"Sivrisinek"},{"value":"diger","label":"Diğer"}]},
 {"id":"mekan","type":"single","title":"Mekan","required":true,"options":[{"value":"daire","label":"Daire"},{"value":"mustakil","label":"Müstakil ev"},{"value":"isyeri","label":"İş yeri"},{"value":"bina","label":"Apartman ortak alanı"}]},
 {"id":"alan","type":"number","title":"Yaklaşık kaç metrekare?","required":false,"min":10,"max":10000,"unit":"m²"},
 {"id":"evcil","type":"single","title":"Evde evcil hayvan ya da bebek var mı?","required":true,"options":[{"value":"evet","label":"Evet"},{"value":"hayir","label":"Hayır"}]}
]}$j$::jsonb);
end $$;
