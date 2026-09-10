// Seed DEMO accounts, businesses, listings, reviews and announcements. Idempotent (deterministic ids / upserts).
// Every demo row is marked is_demo = true (profiles, businesses, listings, reviews, announcements) so it can be
// removed later with scripts/db/remove-demo.mjs.
// Usage: node --env-file=.env.local scripts/db/seed-demo.mjs
import { createHash } from "node:crypto";
import { sql, lit, jsonLit, adminFetch } from "./lib.mjs";

/** Deterministic UUID for a demo key (stable across re-runs). */
function demoId(key) {
  const h = createHash("md5").update(`gebzem-demo:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const WEEKDAYS = { mon: { open: "09:00", close: "18:00" }, tue: { open: "09:00", close: "18:00" }, wed: { open: "09:00", close: "18:00" }, thu: { open: "09:00", close: "18:00" }, fri: { open: "09:00", close: "18:00" } };
const hours = (sat = { open: "09:00", close: "14:00" }, sun = null, base = WEEKDAYS) => ({ ...base, sat, sun });

const CENTRAL = ["hacihalil", "mustafapasa", "osman-yilmaz", "guzeller", "beylikbagi", "cumhuriyet", "yenikent", "istasyon", "arapcesme", "sultan-orhan", "tatlikuyu", "hurriyet", "inonu", "mevlana", "gaziler", "baris"];

const ADMIN = { phone: "905550000001", name: "Yönetici", nb: "hacihalil" };
const USERS = [
  { key: "user-ayse", phone: "905550000020", name: "Ayşe Yılmaz", nb: "hacihalil" },
  { key: "user-mehmet", phone: "905550000021", name: "Mehmet Demir", nb: "beylikbagi" },
  { key: "user-zeynep", phone: "905550000022", name: "Zeynep Kaya", nb: "osman-yilmaz" },
];

const BUSINESSES = [
  {
    key: "biz-parlak", phone: "905550000010", owner: "Hasan Parlak", name: "Parlak Temizlik", slug: "parlak-temizlik", kinds: ["service", "employer"],
    label: "Temizlik", nb: "hacihalil", address: "Hacıhalil Mah., Gebze / Kocaeli", level: 2,
    desc: "Ev, ofis ve inşaat sonrası temizlikte 8 yıllık deneyim. Ekibimiz sigortalı, malzemeler bizden. Koltuk ve halı yıkamayı yerinde yapıyoruz.",
    cats: ["ev-temizligi", "ofis-temizligi", "koltuk-yikama", "hali-yikama", "insaat-sonrasi-temizlik"], areas: CENTRAL, hours: hours({ open: "09:00", close: "17:00" }),
  },
  {
    key: "biz-tesisat", phone: "905550000011", owner: "Murat Usta", name: "Usta Tesisat Gebze", slug: "usta-tesisat-gebze", kinds: ["service"],
    label: "Tesisat", nb: "mustafapasa", address: "Mustafapaşa Mah., Gebze / Kocaeli", level: 1,
    desc: "Su kaçağı tespiti, musluk ve batarya değişimi, tıkanıklık açma ve petek temizliği. Kameralı kaçak tespiti yapıyoruz, işçiliğe 1 yıl garanti.",
    cats: ["su-tesisati", "tikaniklik-acma", "petek-temizligi"], areas: CENTRAL.concat(["kirazpinar", "yavuz-selim", "adem-yavuz"]), hours: hours(),
  },
  {
    key: "biz-kombi", phone: "905550000012", owner: "Kemal Aydın", name: "Kombi Servis 41", slug: "kombi-servis-41", kinds: ["service"],
    label: "Kombi & Klima Servisi", nb: "guzeller", address: "Güzeller Mah., Gebze / Kocaeli", level: 2,
    desc: "Tüm marka kombilerde yıllık bakım, arıza ve montaj. Klima montajı, bakımı ve gaz dolumu. Orijinal yedek parça kullanıyoruz.",
    cats: ["kombi-bakimi", "klima-montaj-bakim", "petek-temizligi", "beyaz-esya-tamiri"], areas: CENTRAL.concat(["pelitli", "balcik"]), hours: hours({ open: "09:00", close: "16:00" }),
  },
  {
    key: "biz-boya", phone: "905550000013", owner: "Serkan Renk", name: "Renk Boya Dekorasyon", slug: "renk-boya-dekorasyon", kinds: ["service"],
    label: "Boya & Dekorasyon", nb: "beylikbagi", address: "Beylikbağı Mah., Gebze / Kocaeli", level: 1,
    desc: "İç cephe boya badana, alçıpan, asma tavan, parke ve fayans işleri. Eşyalı evlerde koruma örtüsüyle temiz çalışıyoruz.",
    cats: ["boya-badana", "alcipan", "parke", "fayans"], areas: CENTRAL.slice(0, 12), hours: hours(),
  },
  {
    key: "biz-nakliyat", phone: "905550000014", owner: "Ali Yıldız", name: "Gebze Nakliyat", slug: "gebze-nakliyat", kinds: ["service", "employer"],
    label: "Nakliyat", nb: "istasyon", address: "İstasyon Mah., Gebze / Kocaeli", level: 2,
    desc: "Asansörlü evden eve nakliyat, parça eşya ve ofis taşıma. Paketleme, montaj ve sigortalı taşıma seçenekleri.",
    cats: ["evden-eve-nakliyat", "parca-esya-tasima", "ofis-tasima"], areas: "ALL", hours: hours({ open: "08:00", close: "18:00" }, { open: "09:00", close: "14:00" }),
  },
  {
    key: "biz-elektrik", phone: "905550000015", owner: "Emre Şahin", name: "Anadolu Elektrik", slug: "anadolu-elektrik", kinds: ["service"],
    label: "Elektrik", nb: "sultan-orhan", address: "Sultan Orhan Mah., Gebze / Kocaeli", level: 1,
    desc: "Elektrik arızası, sigorta panosu, priz ve tesisat yenileme, avize ve LED montajı. Yetkili elektrik ustası.",
    cats: ["elektrikci", "aydinlatma-montaj"], areas: CENTRAL, hours: hours(),
  },
  {
    key: "biz-kent", phone: "905550000016", owner: "Burak Kent", name: "Kent Teknoloji", slug: "kent-teknoloji", kinds: ["shop", "employer"],
    label: "Telefon & Bilgisayar", nb: "hacihalil", address: "Hacıhalil Mah., Gebze / Kocaeli", level: 1, located: true,
    desc: "İkinci el ve yenilenmiş telefon, tablet ve bilgisayar satışı. Cihazlarımızı test edip garantiyle teslim ediyoruz.",
    cats: [], areas: [], hours: hours({ open: "10:00", close: "20:00" }, null, Object.fromEntries(Object.keys(WEEKDAYS).map((d) => [d, { open: "10:00", close: "20:00" }]))),
  },
  {
    key: "biz-plastik", phone: "905550000017", owner: "Selin Öztürk", name: "Örnek Plastik San. ve Tic. A.Ş.", slug: "ornek-plastik", kinds: ["employer"],
    label: "Plastik Enjeksiyon Üretimi", nb: null, address: "Gebze Organize Sanayi Bölgesi (GOSB), Gebze / Kocaeli", level: 1,
    desc: "Otomotiv ve beyaz eşya sektörüne plastik enjeksiyon parça üretiyoruz. Bu kayıt örnek veridir.",
    cats: [], areas: [], hours: hours(null, null, Object.fromEntries(Object.keys(WEEKDAYS).map((d) => [d, { open: "08:00", close: "18:00" }]))),
  },
];

// ---------------------------------------------------------------------------
async function ensureUser(phone, meta) {
  const res = await adminFetch("/auth/v1/admin/users", { method: "POST", body: { phone, phone_confirm: true, user_metadata: { demo: true, ...meta } } });
  if (res.ok) return res.body.id;
  const found = await sql(`select id from auth.users where phone = ${lit(phone)}`);
  if (found?.[0]?.id) return found[0].id;
  throw new Error(`cannot create user ${phone.slice(0, 6)}***: ${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
}

async function setProfile(id, { name, nb, role = "user" }) {
  await sql(`update public.profiles set full_name = ${lit(name)}, role = ${lit(role)}, onboarded = true, is_demo = true,
      kvkk_accepted_at = coalesce(kvkk_accepted_at, now()),
      neighbourhood_id = ${nb ? `(select id from public.neighbourhoods where slug = ${lit(nb)})` : "null"}
    where id = ${lit(id)}`);
}

const nbCheck = await sql(`select slug from public.neighbourhoods`);
const nbSlugs = new Set(nbCheck.map((r) => r.slug));
const allSlugs = [...new Set([...CENTRAL, "kirazpinar", "yavuz-selim", "adem-yavuz", "pelitli", "balcik", "eskihisar"])];
const missing = allSlugs.filter((s) => !nbSlugs.has(s));
if (missing.length) console.warn("neighbourhood slugs not found:", missing.join(", "));

// Admin
const adminId = await ensureUser(ADMIN.phone, { role: "admin" });
await setProfile(adminId, { name: ADMIN.name, nb: ADMIN.nb, role: "admin" });
console.log("admin ok");

// Normal users
const userIds = {};
for (const u of USERS) {
  userIds[u.key] = await ensureUser(u.phone, {});
  await setProfile(userIds[u.key], u);
}
await sql(`update public.profiles set trusted_publisher = true where id in (${Object.values(userIds).map(lit).join(",")})`);
console.log("users ok");

// Businesses
const bizIds = {};
const ownerIds = {};
for (const b of BUSINESSES) {
  const ownerId = await ensureUser(b.phone, { business: b.slug });
  ownerIds[b.key] = ownerId;
  await setProfile(ownerId, { name: b.owner, nb: b.nb });
  const id = demoId(b.key);
  bizIds[b.key] = id;
  const nbExpr = b.nb ? `(select id from public.neighbourhoods where slug = ${lit(b.nb)})` : "null";
  const locExpr = b.located && b.nb ? `(select center from public.neighbourhoods where slug = ${lit(b.nb)})` : "null";
  await sql(`
    insert into public.businesses (id, owner_id, slug, name, description, phone, address, location, neighbourhood_id, kinds,
      category_label, working_hours, status, verification_level, approved_at, is_demo)
    values (${lit(id)}, ${lit(ownerId)}, ${lit(b.slug)}, ${lit(b.name)}, ${lit(b.desc)}, ${lit("+" + b.phone)}, ${lit(b.address)},
      ${locExpr}, ${nbExpr}, ${lit(`{${b.kinds.join(",")}}`)}::text[], ${lit(b.label)}, ${jsonLit(b.hours)}, 'approved', ${b.level}, now(), true)
    on conflict (owner_id) do update set slug = excluded.slug, name = excluded.name, description = excluded.description,
      phone = excluded.phone, address = excluded.address, location = excluded.location, neighbourhood_id = excluded.neighbourhood_id,
      kinds = excluded.kinds, category_label = excluded.category_label, working_hours = excluded.working_hours,
      status = 'approved', verification_level = excluded.verification_level, approved_at = coalesce(public.businesses.approved_at, now()),
      is_demo = true
    returning id`).then((r) => (bizIds[b.key] = r[0].id));
  const bid = bizIds[b.key];
  await sql(`delete from public.business_service_categories where business_id = ${lit(bid)};
    delete from public.business_service_areas where business_id = ${lit(bid)};`);
  if (b.cats.length) {
    await sql(`insert into public.business_service_categories (business_id, category_id)
      select ${lit(bid)}, id from public.service_categories where slug in (${b.cats.map(lit).join(",")}) on conflict do nothing`);
  }
  if (b.areas === "ALL") {
    await sql(`insert into public.business_service_areas (business_id, neighbourhood_id)
      select ${lit(bid)}, id from public.neighbourhoods where district = 'Gebze' on conflict do nothing`);
  } else if (b.areas.length) {
    await sql(`insert into public.business_service_areas (business_id, neighbourhood_id)
      select ${lit(bid)}, id from public.neighbourhoods where slug in (${b.areas.map(lit).join(",")}) on conflict do nothing`);
  }
}
console.log("businesses ok:", Object.keys(bizIds).length);

// Demo reviews (no request; marked is_demo)
const REVIEWS = [
  ["biz-parlak", "user-ayse", 5, "Ekip zamanında geldi, mutfak ve banyo pırıl pırıl oldu. Tekrar çağıracağım."],
  ["biz-parlak", "user-zeynep", 4, "Temizlik iyiydi, camlarda küçük eksik kaldı ama hemen tamamladılar."],
  ["biz-tesisat", "user-mehmet", 5, "Banyodaki kaçağı cihazla buldu, fayans kırmadan çözdü."],
  ["biz-kombi", "user-ayse", 5, "Kombi bakımını düzgün yaptı, fiyatı baştan söyledi."],
  ["biz-kombi", "user-mehmet", 4, "Klima montajı temizdi, bir gün gecikmeli geldi."],
  ["biz-boya", "user-zeynep", 5, "3+1 evi iki günde boyadılar, eşyalar hep örtülüydü."],
  ["biz-nakliyat", "user-mehmet", 5, "Paketlemeden montaja kadar sorunsuz bir taşınma oldu."],
  ["biz-elektrik", "user-ayse", 4, "Sigorta atma sorununu kısa sürede buldu."],
];
for (const [bk, uk, rating, comment] of REVIEWS) {
  const id = demoId(`review-${bk}-${uk}`);
  await sql(`insert into public.reviews (id, business_id, author_id, rating, comment, is_demo)
    values (${lit(id)}, ${lit(bizIds[bk])}, ${lit(userIds[uk])}, ${rating}, ${lit(comment)}, true)
    on conflict (id) do update set rating = excluded.rating, comment = excluded.comment`);
}
await sql(`update public.businesses b set
    rating_avg = coalesce((select round(avg(rating)::numeric, 2) from public.reviews r where r.business_id = b.id), 0),
    rating_count = (select count(*) from public.reviews r where r.business_id = b.id)
  where b.is_demo`);
console.log("reviews ok:", REVIEWS.length);

// Listings -------------------------------------------------------------------
const C = (key, owner, cat, nb, title, price, desc, attrs, biz = null) => ({ key, owner, cat, nb, title, price, desc, attrs, biz });
const CLASSIFIED = [
  C("l-iphone13", "user-ayse", "telefon", "hacihalil", "iPhone 13 128 GB, kutulu ve faturalı", 18500,
    "Bir yıldır kılıflı ve ekran korumalı kullanıldı, çiziği yok. Pil sağlığı %88. Kutusu, faturası ve şarj kablosu mevcut. Elden teslim, Gebze merkez.",
    { durum: "az_kullanilmis", marka: "apple", model: "iPhone 13", hafiza: "128", garanti: false, pazarlik: true }),
  C("l-a54", "user-mehmet", "telefon", "beylikbagi", "Samsung Galaxy A54 256 GB temiz", 9750,
    "Ekranda ve kasada iz yok. Yeni telefon aldığım için satıyorum. Şarj aleti ile birlikte.",
    { durum: "ikinci_el", marka: "samsung", model: "Galaxy A54", hafiza: "256", takas: true }),
  C("l-laptop", "user-zeynep", "bilgisayar", "osman-yilmaz", "Lenovo IdeaPad dizüstü bilgisayar, 16 GB RAM", 14000,
    "Ryzen 5 işlemci, 512 GB SSD, 15.6 inç ekran. Ofis ve ders için ideal. Klavye Türkçe Q. Çantası hediye.",
    { durum: "az_kullanilmis", tur: "dizustu", marka: "Lenovo", ram: "16", pazarlik: true }),
  C("l-ps5", "user-mehmet", "oyun-konsolu", "beylikbagi", "PlayStation 5 + 2 kol + 3 oyun", 21000,
    "Diskli sürüm, kutusunda. İki orijinal kol ve üç oyun ile birlikte. Sorunsuz çalışıyor, deneyerek alabilirsiniz.",
    { durum: "ikinci_el", platform: "playstation", kutu: true, pazarlik: true }),
  C("l-koltuk", "user-ayse", "mobilya", "hacihalil", "3+3+1 koltuk takımı, gri", 12500,
    "Üç yıllık, sigara içilmeyen evden. Kumaşında yırtık yok. Taşınma nedeniyle satılık, alıcı kendisi taşıyacak.",
    { durum: "ikinci_el", tur: "koltuk", renk: "Gri", pazarlik: true }),
  C("l-camasir", "user-zeynep", "beyaz-esya", "osman-yilmaz", "Arçelik 9 kg çamaşır makinesi A+++", 7500,
    "Dört yıllık, düzenli bakımları yapıldı. Sadece yeni evin ölçüsüne uymadığı için satıyorum.",
    { durum: "ikinci_el", tur: "camasir", marka: "Arçelik", enerji_sinifi: "a3" }),
  C("l-bebek", "user-ayse", "anne-bebek", "hacihalil", "Travel sistem bebek arabası", 3250,
    "Ana kucağı ve puset birlikte. Tek çocukta kullanıldı, yıkanmış ve temiz. Yağmurluğu mevcut.",
    { durum: "az_kullanilmis", tur: "bebek_arabasi", pazarlik: true }),
  C("l-bisiklet", "user-mehmet", "spor-outdoor", "beylikbagi", "26 jant dağ bisikleti, 21 vites", 4800,
    "Alüminyum kadro, ön amortisörlü. Lastikleri ve frenleri yeni değişti.",
    { durum: "ikinci_el", tur: "bisiklet", takas: true }),
  C("l-gitar", "user-zeynep", "hobi", "osman-yilmaz", "Akustik gitar ve kılıfı", 2750,
    "Başlangıç için çok iyi, telleri yeni. Kılıf, capo ve pena ile birlikte.",
    { durum: "az_kullanilmis", tur: "muzik_aleti" }),
  C("l-kitap", "user-ayse", "kitap-muzik", "hacihalil", "YKS hazırlık kitap seti (TYT + AYT sayısal)", 900,
    "Yirmiye yakın kitap, çoğu hiç yazılmamış. Tek seferde toplu satılık.",
    { durum: "az_kullanilmis", tur: "ders_kitabi" }),
  C("l-kulaklik", "biz-kent", "tv-ses", "hacihalil", "Kablosuz kulaklık, sıfır kutusunda", 1450,
    "Aktif gürültü engelleme, 30 saat pil. Mağazamızdan faturalı ve garantili teslim.",
    { durum: "sifir", tur: "kulaklik", marka: "Diğer" }, "biz-kent"),
  C("l-ipad", "biz-kent", "bilgisayar", "hacihalil", "Yenilenmiş iPad 9. nesil 64 GB", 8900,
    "Test edilmiş, pil sağlığı %90 üzeri. Mağaza garantisi ile teslim edilir.",
    { durum: "ikinci_el", tur: "tablet", marka: "Apple", garanti: true }, "biz-kent"),
];

const J = (key, biz, cat, title, label, work, smin, smax, hidden, exp, benefits, desc) => ({ key, biz, cat, title, label, work, smin, smax, hidden, exp, benefits, desc });
const JOBS = [
  J("j-enjeksiyon", "biz-plastik", "is-uretim-fabrika", "Plastik enjeksiyon operatörü (vardiyalı)", "GOSB", "vardiyali", 32000, 36000, false, "0-1",
    ["servis", "yemek", "sgk", "prim"], "Enjeksiyon makinelerinde üretim yapacak, parça kontrolü ve paketleme işlerinde görev alacak arkadaşlar arıyoruz. Üç vardiya düzeninde çalışılacaktır. Deneyim şartı yoktur, eğitim verilecektir."),
  J("j-kalite", "biz-plastik", "is-uretim-fabrika", "Kalite kontrol elemanı", "GOSB", "tam_zamanli", 36000, 42000, false, "1-3",
    ["servis", "yemek", "sgk"], "Giriş, proses ve final kalite kontrollerini yapacak, ölçüm aletlerini kullanabilen, raporlama bilen çalışma arkadaşı arıyoruz."),
  J("j-depo", "biz-plastik", "is-lojistik-depo", "Depo sorumlusu (forklift ehliyetli)", "GOSB", "tam_zamanli", null, null, true, "3+",
    ["servis", "yemek", "sgk", "prim"], "Hammadde ve mamul depo süreçlerini yönetecek, stok programı kullanabilen, forklift belgesi olan depo sorumlusu aranıyor."),
  J("j-paketleme", "biz-plastik", "is-uretim-fabrika", "Paketleme personeli", "Gebze Plastikçiler OSB", "tam_zamanli", 30500, 32000, false, "farketmez",
    ["servis", "yemek", "sgk"], "İkinci tesisimizde paketleme ve etiketleme işlerinde çalışacak personel alınacaktır. Hafta içi gündüz çalışma."),
  J("j-sofor", "biz-nakliyat", "is-lojistik-depo", "Nakliye şoförü (C/CE ehliyet)", "Merkez", "tam_zamanli", 40000, 48000, false, "3+",
    ["sgk", "prim"], "Evden eve nakliyat araçlarımızda görev alacak, SRC ve psikoteknik belgeleri olan deneyimli şoför arıyoruz."),
  J("j-tasima", "biz-nakliyat", "is-lojistik-depo", "Taşıma ve montaj elemanı", "Merkez", "gunluk", null, null, true, "farketmez",
    ["yemek", "sgk"], "Taşınma günlerinde eşya paketleme, taşıma ve mobilya montajında çalışacak, fiziksel işe uygun arkadaşlar arıyoruz."),
  J("j-satis", "biz-kent", "is-satis-magaza", "Satış danışmanı (telefon mağazası)", "Merkez", "tam_zamanli", 31000, 35000, false, "0-1",
    ["sgk", "prim"], "Mağazamızda müşteri karşılama, ürün tanıtımı ve satış işlerinde görev alacak, teknolojiye ilgili çalışma arkadaşı arıyoruz."),
  J("j-temizlik", "biz-parlak", "is-temizlik", "Temizlik personeli (ev ve ofis)", "Merkez", "yari_zamanli", 18000, 22000, false, "farketmez",
    ["sgk"], "Ev ve ofis temizliği ekiplerimizde yarı zamanlı çalışacak, düzenli ve güvenilir personel arıyoruz. Yol ücreti karşılanır."),
];

const days = 30;
for (const [i, l] of CLASSIFIED.entries()) {
  const id = demoId(l.key);
  const ownerId = l.owner.startsWith("biz-") ? ownerIds[l.owner] : userIds[l.owner];
  const bizId = l.biz ? bizIds[l.biz] : null;
  await sql(`insert into public.listings (id, type, owner_id, business_id, category_id, title, description, price_try, attributes,
      neighbourhood_id, status, published_at, expires_at, is_demo, view_count)
    values (${lit(id)}, 'classified', ${lit(ownerId)}, ${bizId ? lit(bizId) : "null"},
      (select id from public.listing_categories where slug = ${lit(l.cat)}), ${lit(l.title)}, ${lit(l.desc)}, ${l.price}, ${jsonLit(l.attrs)},
      (select id from public.neighbourhoods where slug = ${lit(l.nb)}), 'active', now() - interval '${i * 5 + 3} hours',
      now() + interval '${days} days', true, ${20 + i * 7})
    on conflict (id) do update set title = excluded.title, description = excluded.description, price_try = excluded.price_try,
      attributes = excluded.attributes, category_id = excluded.category_id, neighbourhood_id = excluded.neighbourhood_id,
      status = 'active', expires_at = excluded.expires_at, is_demo = true`);
}
for (const [i, j] of JOBS.entries()) {
  const id = demoId(j.key);
  const biz = BUSINESSES.find((b) => b.key === j.biz);
  const nb = biz.nb;
  await sql(`insert into public.listings (id, type, owner_id, business_id, category_id, title, description, neighbourhood_id, status,
      published_at, expires_at, is_demo, job_work_type, job_salary_min, job_salary_max, job_salary_hidden, job_experience,
      job_benefits, job_location_label, view_count)
    values (${lit(id)}, 'job', ${lit(ownerIds[j.biz])}, ${lit(bizIds[j.biz])},
      (select id from public.listing_categories where slug = ${lit(j.cat)}), ${lit(j.title)}, ${lit(j.desc)},
      ${nb ? `(select id from public.neighbourhoods where slug = ${lit(nb)})` : "null"}, 'active', now() - interval '${i * 7 + 2} hours',
      now() + interval '${days} days', true, ${lit(j.work)}, ${j.smin ?? "null"}, ${j.smax ?? "null"}, ${j.hidden}, ${lit(j.exp)},
      ${lit(`{${j.benefits.join(",")}}`)}::text[], ${lit(j.label)}, ${15 + i * 9})
    on conflict (id) do update set title = excluded.title, description = excluded.description, category_id = excluded.category_id,
      job_work_type = excluded.job_work_type, job_salary_min = excluded.job_salary_min, job_salary_max = excluded.job_salary_max,
      job_salary_hidden = excluded.job_salary_hidden, job_experience = excluded.job_experience, job_benefits = excluded.job_benefits,
      job_location_label = excluded.job_location_label, status = 'active', expires_at = excluded.expires_at, is_demo = true`);
}
const flagged = await sql(`select title, flags from public.listings where is_demo and cardinality(flags) > 0`);
if (flagged.length) console.warn("demo listings with flags:", JSON.stringify(flagged));
console.log("listings ok:", CLASSIFIED.length, "classified,", JOBS.length, "jobs");

// Announcements (clearly labelled as examples) ------------------------------
const ANN = [
  {
    key: "ann-su", kind: "su_kesintisi", title: "Planlı su kesintisi (örnek duyuru)",
    body: "Altyapı çalışması nedeniyle yarın 09:00-17:00 saatleri arasında Hacıhalil ve Mustafapaşa mahallelerinde su kesintisi yapılacaktır. Bu bir örnek duyurudur, gerçek bir kesinti bilgisi değildir.",
    nbs: ["hacihalil", "mustafapasa"], start: "(current_date + 1 + time '09:00') at time zone 'Europe/Istanbul'", end: "(current_date + 1 + time '17:00') at time zone 'Europe/Istanbul'",
  },
  {
    key: "ann-elektrik", kind: "elektrik_kesintisi", title: "Planlı elektrik kesintisi (örnek duyuru)",
    body: "Şebeke bakımı nedeniyle iki gün sonra 10:00-14:00 saatleri arasında Güzeller ve Tatlıkuyu mahallelerinde elektrik kesintisi planlanmıştır. Bu bir örnek duyurudur.",
    nbs: ["guzeller", "tatlikuyu"], start: "(current_date + 2 + time '10:00') at time zone 'Europe/Istanbul'", end: "(current_date + 2 + time '14:00') at time zone 'Europe/Istanbul'",
  },
  {
    key: "ann-hosgeldin", kind: "genel", title: "Gebzem prototipine hoş geldin",
    body: "Bu uygulama prototip aşamasındadır. İlanlar, işletmeler, duyurular ve nöbetçi eczane listesi örnek veridir. Geri bildirimini Yardım sayfasından iletebilirsin.",
    nbs: [], start: "now()", end: "now() + interval '90 days'",
  },
];
for (const a of ANN) {
  const nbExpr = a.nbs.length ? `array(select id from public.neighbourhoods where slug in (${a.nbs.map(lit).join(",")}))` : "'{}'::uuid[]";
  await sql(`insert into public.announcements (id, kind, title, body, neighbourhood_ids, source_label, starts_at, ends_at, created_by, is_demo)
    values (${lit(demoId(a.key))}, ${lit(a.kind)}, ${lit(a.title)}, ${lit(a.body)}, ${nbExpr}, 'Örnek veri', ${a.start}, ${a.end}, ${lit(adminId)}, true)
    on conflict (id) do update set kind = excluded.kind, title = excluded.title, body = excluded.body, neighbourhood_ids = excluded.neighbourhood_ids,
      source_label = excluded.source_label, starts_at = excluded.starts_at, ends_at = excluded.ends_at, is_demo = true`);
}
console.log("announcements ok:", ANN.length);

const summary = await sql(`select
  (select count(*) from public.profiles where is_demo) as demo_profiles,
  (select count(*) from public.businesses where is_demo and status = 'approved') as demo_businesses,
  (select count(*) from public.listings where is_demo and status = 'active' and type = 'classified') as classified,
  (select count(*) from public.listings where is_demo and status = 'active' and type = 'job') as jobs,
  (select count(*) from public.announcements where is_demo) as announcements`);
console.log(JSON.stringify(summary[0]));
