-- Taxi stand phones (Yakınımda > Taksi). Real numbers from public listings; the source URL of each is kept in
-- details.phone_source (details.coords_source: where the location of an added stand comes from).
-- Idempotent: OSM rows are matched on source_ref, the added stands upserted on (source, source_ref) = ('manual', 'taxi/...').
-- Every row is locked, so the monthly OSM sync keeps the phone / address / location.
-- Note: the poi_before_write trigger also keeps them on a re-run of this file (no admin session), so change a stored
-- value in /admin/yerler, not here.
-- Run: node --env-file=.env.local scripts/db/sql.mjs scripts/db/taxi-phones.sql
begin;

-- 1) OSM stands whose name and street match a listing.
update public.poi p
   set phone = v.phone,
       address = coalesce(v.address, p.address),
       details = p.details || v.details::jsonb,
       locked = true
  from (values
    ('way/603526935', '+902627441336', null,
     '{"phone_source": "https://www.taksiji.com/cayirova-taksi-duragi-332ae55a8f"}'),
    ('way/1163066985', '+902626463012', 'İbrahim Ağa Cad.',
     '{"phone_source": "https://www.bulurum.com/dir/taksi-duraklari/gebze"}'),
    ('way/1149631685', '+902626461114', 'Güney Yanyol Cad., Gebze Center AVM',
     '{"phone_source": "https://www.tikla.com.tr/gebze-center-taksi.html"}'),
    ('node/618204302', '+902626555484', 'Şehit Abdullah Horoz Cad. No:22',
     '{"phone_source": "https://www.41havadis.com/haber/gebzede-bulunan-taksi-duraklari-h39350.html"}')
  ) as v(source_ref, phone, address, details)
 where p.source = 'osm' and p.kind = 'taxi' and p.source_ref = v.source_ref;

-- 2) Well-known stands OSM does not have (location from the stand's own map listing).
insert into public.poi (kind, name, slug, address, phone, location, neighbourhood_id, details, source, source_ref, locked)
select 'taxi', v.name, v.slug, v.address, v.phone,
       extensions.st_setsrid(extensions.st_makepoint(v.lng::float8, v.lat::float8), 4326)::extensions.geography,
       (select n.id from public.neighbourhood_for_point(v.lat::float8, v.lng::float8) n limit 1),
       v.details::jsonb, 'manual', v.source_ref, true
  from (values
    ('taxi/saglik-taksi', 'taksi-saglik-taksi', 'Sağlık Taksi', 'İlyasbey Cad. No:25', '+902626411080', 40.799576, 29.439894,
     '{"phone_source": "https://yandex.com.tr/maps/org/saglik_taksi/1031872711/", "coords_source": "https://yandex.com.tr/maps/org/saglik_taksi/1031872711/"}'),
    ('taxi/ssk-taksi', 'taksi-ssk-taksi', 'SSK Taksi', '608/1. Sok. No:2 (Fatih Devlet Hastanesi yanı)', '+902626460986', 40.791097, 29.419457,
     '{"phone_source": "https://yandex.com.tr/harita/org/ssk_taksi/211601359209/", "coords_source": "https://yandex.com.tr/harita/org/ssk_taksi/211601359209/"}'),
    ('taxi/cesme-taksi', 'taksi-cesme-taksi', 'Çeşme Taksi', 'Yeni Bağdat Cad. No:403', '+902626417978', 40.795951, 29.415038,
     '{"phone_source": "https://yandex.com.tr/maps/org/cesme_taksi/231890658250/", "coords_source": "https://yandex.com.tr/maps/org/cesme_taksi/231890658250/"}'),
    ('taxi/park-taksi', 'taksi-park-taksi', 'Park Taksi', 'Atatürk Cad. No:23', '+902626418449', 40.797480, 29.431935,
     '{"phone_source": "https://yandex.com.tr/maps/org/park_taksi/160929770129/", "coords_source": "https://yandex.com.tr/maps/org/park_taksi/160929770129/"}'),
    ('taxi/koroglu-taksi', 'taksi-koroglu-taksi', 'Köroğlu Taksi', 'Yeni Bağdat Cad. No:583', '+902626418333', 40.817227, 29.432600,
     '{"phone_source": "https://yandex.com.tr/maps/org/koroglu_taksi/99721986964/", "coords_source": "https://yandex.com.tr/maps/org/koroglu_taksi/99721986964/"}'),
    ('taxi/balkan-taksi', 'taksi-balkan-taksi', 'Balkan Taksi', 'Gençlik Cad. No:4/C', '+902626413817', 40.806955, 29.439688,
     '{"phone_source": "https://www.bulurum.com/dir/taksi-duraklari/gebze", "coords_source": "https://yandex.com.tr/maps/org/gebze_balkan_taksi_duragi/146238440176/"}'),
    ('taxi/hizmet-taksi', 'taksi-hizmet-taksi', 'Hizmet Taksi', 'İbrahim Ağa Cad. No:105', '+902626418686', 40.808143, 29.431100,
     '{"phone_source": "https://yandex.com.tr/harita/org/hizmet_taksi/167221393617/", "coords_source": "https://yandex.com.tr/harita/org/hizmet_taksi/167221393617/"}')
  ) as v(source_ref, slug, name, address, phone, lat, lng, details)
on conflict (source, source_ref) do update
   set name = excluded.name,
       slug = excluded.slug,
       address = excluded.address,
       phone = excluded.phone,
       location = excluded.location,
       neighbourhood_id = excluded.neighbourhood_id,
       details = public.poi.details || excluded.details,
       locked = true;

commit;

select count(*) filter (where kind = 'taxi') as taxi_total,
       count(*) filter (where kind = 'taxi' and phone is not null) as taxi_with_phone,
       count(*) filter (where kind = 'taxi' and locked) as taxi_locked,
       count(*) filter (where kind = 'taxi' and source = 'manual') as taxi_manual
  from public.poi;
