// Seed DEMO sağlık / düğün / eğitim businesses (no photos, menus or rooms). Owners are demo profiles created the same
// way as in seed-verticals.mjs. Idempotent: deterministic ids and upserts. category_label values match the
// sub-category chip keywords of /kesfet/[tur] (VERTICAL_SUBCATEGORIES in src/features/business/lib/verticals.ts).
// Usage: node --env-file=.env.local scripts/db/seed-more-verticals.mjs  (neighbourhoods must be seeded)
import { createHash } from "node:crypto";
import { sql, lit, jsonLit, adminFetch } from "./lib.mjs";

function demoId(key) {
  const h = createHash("md5").update(`gebzem-demo:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const h = (open, close) => ({ open, close });
const daily = (open, close) => Object.fromEntries(DAYS.map((d) => [d, h(open, close)]));
/** Monday-Friday open-close; Saturday and Sunday as given (null = closed). */
const week = (open, close, sat = null, sun = null) => ({ ...Object.fromEntries(DAYS.slice(0, 5).map((d) => [d, h(open, close)])), sat, sun });

const BUSINESSES = [
  // Sağlık --------------------------------------------------------------------
  {
    key: "mv-dis", phone: "905550000040", owner: "Selin Arslan", name: "Gülüş Diş Kliniği", slug: "gulus-dis-klinigi",
    vertical: "saglik", label: "Diş kliniği · İmplant · Ortodonti", nb: "hacihalil", offset: [0.001, 0.0007],
    amenities: ["kredi_karti", "engelli_erisimi"], hours: week("09:00", "19:00", h("09:00", "15:00")),
    desc: "Dolgu, kanal tedavisi, diş taşı temizliği, implant ve şeffaf plak ortodonti. Randevulu çalışıyoruz, diş ağrısında aynı gün muayene. Bu kayıt örnek veridir.",
  },
  {
    key: "mv-goz", phone: "905550000041", owner: "Murat Işık", name: "Işık Göz Merkezi", slug: "isik-goz-merkezi",
    vertical: "saglik", label: "Göz merkezi · Göz hastalıkları", nb: "osman-yilmaz", offset: [-0.0008, 0.001],
    amenities: ["otopark", "kredi_karti", "engelli_erisimi"], hours: week("08:30", "18:30", h("09:00", "14:00")),
    desc: "Göz muayenesi, katarakt ve lazer tedavisi değerlendirmesi, çocuk göz sağlığı ve gözlük reçetesi. Bu kayıt örnek veridir.",
  },
  {
    key: "mv-poliklinik", phone: "905550000042", owner: "Hakan Yıldız", name: "Gebze Yıldız Polikliniği", slug: "gebze-yildiz-poliklinigi",
    vertical: "saglik", label: "Poliklinik · Tıp merkezi", nb: "mustafapasa", offset: [0.0006, -0.0009],
    amenities: ["otopark", "kredi_karti", "engelli_erisimi"], hours: week("08:00", "20:00", h("09:00", "17:00")),
    desc: "Dahiliye, kadın doğum, çocuk sağlığı ve kulak burun boğaz bölümlerinde randevulu muayene. Kan tahlili ve ultrason aynı gün sonuçlanır. Bu kayıt örnek veridir.",
  },
  {
    key: "mv-fizik", phone: "905550000043", owner: "Burcu Tekin", name: "Denge Fizik Tedavi ve Rehabilitasyon", slug: "denge-fizik-tedavi",
    vertical: "saglik", label: "Fizik tedavi · Fizyoterapi", nb: "guzeller", offset: [-0.0011, -0.0006],
    amenities: ["otopark", "kredi_karti", "engelli_erisimi"], hours: week("08:30", "19:30", h("09:00", "14:00")),
    desc: "Bel ve boyun fıtığı, spor yaralanmaları ve ameliyat sonrası rehabilitasyon. Uzman fizyoterapistlerle birebir seanslar. Bu kayıt örnek veridir.",
  },
  {
    key: "mv-psikolog", phone: "905550000044", owner: "Ece Demirtaş", name: "Huzur Psikolojik Danışmanlık", slug: "huzur-psikolojik-danismanlik",
    vertical: "saglik", label: "Psikolog · Aile danışmanlığı", nb: "beylikbagi", offset: [0.0007, 0.0012],
    amenities: ["kredi_karti"], hours: week("10:00", "20:00", h("10:00", "16:00")),
    desc: "Yetişkin, çocuk ve ergenlere bireysel terapi, çift ve aile danışmanlığı. Yüz yüze ya da online görüşme seçeneği var. Bu kayıt örnek veridir.",
  },
  {
    key: "mv-veteriner", phone: "905550000045", owner: "Oğuz Çelik", name: "Pati Veteriner Kliniği", slug: "pati-veteriner-klinigi",
    vertical: "saglik", label: "Veteriner kliniği", nb: "arapcesme", offset: [-0.0005, 0.0008],
    amenities: ["otopark", "kredi_karti"], hours: { ...daily("09:00", "21:00"), sun: h("10:00", "18:00") },
    desc: "Kedi ve köpekler için aşı, kısırlaştırma, genel muayene ve acil müdahale. Mama ve bakım ürünleri de bulunur. Bu kayıt örnek veridir.",
  },
  // Düğün ---------------------------------------------------------------------
  {
    key: "mv-salon", phone: "905550000046", owner: "Recep Bayram", name: "Beyaz Köşk Düğün Salonu", slug: "beyaz-kosk-dugun-salonu",
    vertical: "dugun", label: "Düğün salonu · Kır düğünü", nb: "pelitli", offset: [0.0012, 0.0005],
    amenities: ["otopark", "kredi_karti", "engelli_erisimi"], hours: daily("10:00", "23:30"),
    desc: "600 kişilik kapalı salon ve bahçede kır düğünü alanı. Nikâh, nişan ve kına için menü seçenekleri, geniş otopark. Bu kayıt örnek veridir.",
  },
  {
    key: "mv-organizasyon", phone: "905550000047", owner: "Gizem Aydoğan", name: "Mutlu An Organizasyon", slug: "mutlu-an-organizasyon",
    vertical: "dugun", label: "Düğün ve kına organizasyonu", nb: "hacihalil", offset: [-0.0013, -0.0004],
    amenities: ["kredi_karti"], hours: week("09:00", "19:00", h("10:00", "18:00")),
    desc: "Kına gecesi, nişan, sünnet düğünü ve doğum günü organizasyonları. Masa süsleme, ses sistemi ve DJ hizmeti veriyoruz. Bu kayıt örnek veridir.",
  },
  {
    key: "mv-gelinlik", phone: "905550000048", owner: "Sibel Er", name: "Prenses Gelinlik & Abiye", slug: "prenses-gelinlik-abiye",
    vertical: "dugun", label: "Gelinlik · Abiye · Damatlık", nb: "istasyon", offset: [0.0004, 0.0011],
    amenities: ["kredi_karti"], hours: week("10:00", "20:00", h("10:00", "20:00"), h("12:00", "18:00")),
    desc: "Kiralık ve satılık gelinlik, nişanlık, kınalık ve abiye modelleri. Provalar randevuyla, tadilat ücretsiz. Bu kayıt örnek veridir.",
  },
  {
    key: "mv-fotograf", phone: "905550000049", owner: "Onur Aslan", name: "Kadraj Düğün Fotoğrafçılık", slug: "kadraj-dugun-fotografcilik",
    vertical: "dugun", label: "Düğün fotoğrafçısı · Video", nb: "sultan-orhan", offset: [-0.0009, 0.0006],
    amenities: ["kredi_karti"], hours: week("10:00", "19:00", h("10:00", "19:00")),
    desc: "Dış çekim, düğün hikâyesi ve drone ile video çekimi. Albüm ve klip teslimi üç hafta içinde. Bu kayıt örnek veridir.",
  },
  {
    key: "mv-kuafor", phone: "905550000050", owner: "Nazlı Koç", name: "Nazlı Gelin Kuaförü", slug: "nazli-gelin-kuaforu",
    vertical: "dugun", label: "Kuaför · Gelin saçı · Makyaj", nb: "inonu", offset: [0.0008, -0.0007],
    amenities: ["kredi_karti"], hours: { ...daily("09:00", "20:00"), mon: null },
    desc: "Gelin saçı, gelin makyajı ve nişan için saç tasarımı. Düğün günü eve ya da salona gelerek hizmet veriyoruz. Bu kayıt örnek veridir.",
  },
  // Eğitim --------------------------------------------------------------------
  {
    key: "mv-kurs", phone: "905550000051", owner: "Tolga Erdem", name: "Atölye 41 Sanat ve Robotik Kursu", slug: "atolye-41-sanat-robotik-kursu",
    vertical: "egitim", label: "Kurs · Resim · Gitar · Robotik", nb: "kirazpinar", offset: [0.0006, 0.0009],
    amenities: ["kredi_karti"], hours: week("10:00", "20:00", h("09:00", "18:00"), h("10:00", "16:00")),
    desc: "Çocuk ve yetişkinlere resim, gitar, piyano ve robotik kodlama kursları. Hafta sonu grupları ve deneme dersi var. Bu kayıt örnek veridir.",
  },
  {
    key: "mv-dil", phone: "905550000052", owner: "Deniz Aksu", name: "Gebze Global Dil Okulu", slug: "gebze-global-dil-okulu",
    vertical: "egitim", label: "Dil okulu · İngilizce · Almanca", nb: "hacihalil", offset: [0.0003, -0.0014],
    amenities: ["kredi_karti"], hours: week("09:00", "21:00", h("10:00", "17:00")),
    desc: "Her seviyeye İngilizce ve Almanca eğitim, IELTS ve YDS hazırlık, konuşma kulüpleri. Seviye tespit sınavı ücretsiz. Bu kayıt örnek veridir.",
  },
  {
    key: "mv-etut", phone: "905550000053", owner: "Ayten Şimşek", name: "Başarı Etüt Merkezi", slug: "basari-etut-merkezi",
    vertical: "egitim", label: "Etüt merkezi · LGS · YKS", nb: "cumhuriyet", offset: [-0.0007, -0.001],
    amenities: ["kredi_karti"], hours: week("12:00", "20:00", h("09:00", "17:00")),
    desc: "İlkokul ve ortaokul öğrencilerine ödev desteği, birebir etüt ve LGS / YKS deneme sınavları. Bu kayıt örnek veridir.",
  },
  {
    key: "mv-anaokulu", phone: "905550000054", owner: "Hande Güneş", name: "Minik Adımlar Anaokulu", slug: "minik-adimlar-anaokulu",
    vertical: "egitim", label: "Anaokulu · Kreş", nb: "yavuz-selim", offset: [0.001, -0.0005],
    amenities: ["otopark", "engelli_erisimi"], hours: week("07:30", "18:30"),
    desc: "3-6 yaş için oyun temelli okul öncesi eğitim, drama ve bahçe etkinlikleri. Servis ve öğle yemeği dahil. Bu kayıt örnek veridir.",
  },
  {
    key: "mv-surucu", phone: "905550000055", owner: "Erkan Doğan", name: "Gebze Direksiyon Sürücü Kursu", slug: "gebze-direksiyon-surucu-kursu",
    vertical: "egitim", label: "Sürücü kursu · B sınıfı ehliyet", nb: "adem-yavuz", offset: [-0.001, 0.0007],
    amenities: ["otopark", "kredi_karti"], hours: week("09:00", "20:00", h("09:00", "17:00")),
    desc: "B ve A2 sınıfı ehliyet için teorik dersler ve direksiyon eğitimi. Hafta içi akşam ve hafta sonu sınıfları. Bu kayıt örnek veridir.",
  },
];

async function ensureUser(phone, meta) {
  const res = await adminFetch("/auth/v1/admin/users", { method: "POST", body: { phone, phone_confirm: true, user_metadata: { demo: true, ...meta } } });
  if (res.ok) return res.body.id;
  const found = await sql(`select id from auth.users where phone = ${lit(phone)}`);
  if (found?.[0]?.id) return found[0].id;
  throw new Error(`cannot create user ${phone.slice(0, 6)}***: ${res.status}`);
}

const nbSlugs = [...new Set(BUSINESSES.map((b) => b.nb))];
const nbFound = new Set((await sql(`select slug from public.neighbourhoods where slug in (${nbSlugs.map(lit).join(",")})`)).map((r) => r.slug));
const nbMissing = nbSlugs.filter((s) => !nbFound.has(s));
if (nbMissing.length) throw new Error(`neighbourhood slugs not found: ${nbMissing.join(", ")} (run scripts/db/seed-neighbourhoods.mjs first)`);

for (const b of BUSINESSES) {
  const ownerId = await ensureUser(b.phone, { business: b.slug });
  await sql(`update public.profiles set full_name = ${lit(b.owner)}, onboarded = true, is_demo = true, kvkk_accepted_at = coalesce(kvkk_accepted_at, now()),
      neighbourhood_id = (select id from public.neighbourhoods where slug = ${lit(b.nb)}) where id = ${lit(ownerId)}`);
  const [dx, dy] = b.offset;
  const loc = `(select extensions.st_setsrid(extensions.st_makepoint(extensions.st_x(center::extensions.geometry) + ${dx}, extensions.st_y(center::extensions.geometry) + ${dy}), 4326)::extensions.geography
      from public.neighbourhoods where slug = ${lit(b.nb)})`;
  await sql(`
    insert into public.businesses (id, owner_id, slug, name, description, phone, address, location, neighbourhood_id, kinds, category_label,
      working_hours, status, verification_level, approved_at, is_demo, vertical, amenities)
    values (${lit(demoId(b.key))}, ${lit(ownerId)}, ${lit(b.slug)}, ${lit(b.name)}, ${lit(b.desc)}, ${lit("+" + b.phone)},
      (select name || ' Mah., Gebze / Kocaeli' from public.neighbourhoods where slug = ${lit(b.nb)}), ${loc},
      (select id from public.neighbourhoods where slug = ${lit(b.nb)}), '{shop}'::text[], ${lit(b.label)}, ${jsonLit(b.hours)},
      'approved', 1, now(), true, ${lit(b.vertical)}, ${lit(`{${b.amenities.join(",")}}`)}::text[])
    on conflict (id) do update set slug = excluded.slug, name = excluded.name, description = excluded.description, phone = excluded.phone,
      address = excluded.address, location = excluded.location, neighbourhood_id = excluded.neighbourhood_id, kinds = excluded.kinds,
      category_label = excluded.category_label, working_hours = excluded.working_hours, status = 'approved', verification_level = 1,
      approved_at = coalesce(public.businesses.approved_at, now()), is_demo = true, vertical = excluded.vertical, amenities = excluded.amenities
    returning id`);
}
console.log("more vertical businesses ok:", BUSINESSES.length);

const summary = await sql(`select vertical, count(*)::int as n from public.businesses
  where is_demo and status = 'approved' and vertical in ('saglik', 'dugun', 'egitim') group by vertical order by vertical`);
console.log(JSON.stringify(summary));
