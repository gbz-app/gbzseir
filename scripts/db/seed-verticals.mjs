// Seed DEMO food / cafe / hotel businesses with photos, menus, rooms and reviews, plus demo events.
// Idempotent: deterministic ids, upserts, and child rows (photos, menu, rooms) are replaced on every run.
// Photos are CC0 / public-domain images found through Openverse; they are resized and stored in the public
// "media" bucket under demo/verticals/ so the app never hotlinks third-party hosts.
// Usage: node --env-file=.env.local scripts/db/seed-verticals.mjs  (run scripts/db/seed-demo.mjs first)
import { createHash } from "node:crypto";
import sharp from "sharp";
import { sql, lit, jsonLit, adminFetch, SUPABASE_URL, SERVICE_KEY, UA, sleep } from "./lib.mjs";

function demoId(key) {
  const h = createHash("md5").update(`gebzem-demo:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------
const WM = "https://upload.wikimedia.org/wikipedia/commons/";
const RP = "https://images.rawpixel.com/editor_1024/";
const PHOTOS = {
  "lokanta-cover": RP + "czNmcy1wcml2YXRlL3Jhd3BpeGVsX2ltYWdlcy93ZWJzaXRlX2NvbnRlbnQvbHIvaXM5ODM4LWltYWdlLWt3dnllODd1LmpwZw.jpg",
  "lokanta-1": "https://pd.w.org/2025/01/46677d64d9ef23a8.19231570-2048x1365.jpg",
  "lokanta-2": RP + "czNmcy1wcml2YXRlL3Jhd3BpeGVsX2ltYWdlcy93ZWJzaXRlX2NvbnRlbnQvbHIvcHgxNDEyMzgxLWltYWdlLWt3dnkwbnd3LmpwZw.jpg",
  "lokanta-3": "https://cdn.stocksnap.io/img-thumbs/960w/47E77904CB.jpg",
  "durum-cover": WM + "7/7e/Chiche_kebab_au_barbecue_en_avril_2023.jpg",
  "durum-1": RP + "czNmcy1wcml2YXRlL3Jhd3BpeGVsX2ltYWdlcy93ZWJzaXRlX2NvbnRlbnQvbHIvaXMxMDEyNy1pbWFnZS1rd3Z5ZXk4dC5qcGc.jpg",
  "durum-2": RP + "czNmcy1wcml2YXRlL3Jhd3BpeGVsX2ltYWdlcy93ZWJzaXRlX2NvbnRlbnQvbHIvaXMxMjU3My1pbWFnZS1rd3lzZnAzNi5qcGc.jpg",
  "durum-3": WM + "e/e5/Armenian_l%C3%A9rm%C3%A9djoun_cooking_%28021%29.jpg",
  "balik-cover": RP + "czNmcy1wcml2YXRlL3Jhd3BpeGVsX2ltYWdlcy93ZWJzaXRlX2NvbnRlbnQvbHIvYTAxOS1qYWt1YmstMDQwMy1ncmlsbGVkLWZpc2guanBn.jpg",
  "balik-1": "https://cdn.stocksnap.io/img-thumbs/960w/B0U6RRROJW.jpg",
  "balik-2": RP + "czNmcy1wcml2YXRlL3Jhd3BpeGVsX2ltYWdlcy93ZWJzaXRlX2NvbnRlbnQvbHIvaXMxMTY2Mi1pbWFnZS1rd3Z5Z2h5cS5qcGc.jpg",
  "balik-3": "https://pd.w.org/2025/03/95867dd383c9eb092.80548902-2048x1365.jpg",
  "ocak-cover": RP + "czNmcy1wcml2YXRlL3Jhd3BpeGVsX2ltYWdlcy93ZWJzaXRlX2NvbnRlbnQvbHIvYTAxOS1qYWt1YmstMDIyNy1mYW5jeS1yZXN0YXVyYW50LWludGVyaW9yLmpwZw.jpg",
  "ocak-1": WM + "2/29/Cherry_Kebab.jpg",
  "ocak-2": WM + "3/3f/Shish-kebab-skewer-60458_640.jpg",
  "ocak-3": RP + "cHJpdmF0ZS9zdGF0aWMvaW1hZ2Uvd2Vic2l0ZS8yMDIyLTA0L2xyL3B4ODM4MjQ5LWltYWdlLWt3dnV6aTE5LmpwZw.jpg",
  "kahve-cover": RP + "czNmcy1wcml2YXRlL3Jhd3BpeGVsX2ltYWdlcy93ZWJzaXRlX2NvbnRlbnQvbHIvdXB3azYxOTExOTY2LXdpa2ltZWRpYS1pbWFnZS1rb3dqY3pvZC5qcGc.jpg",
  "kahve-1": WM + "c/c6/Latte_art_3.jpg",
  "kahve-2": "https://cdn.stocksnap.io/img-thumbs/960w/TUIRU743JZ.jpg",
  "kahve-3": WM + "5/59/Souffl%C3%A9-style_cheesecake_001.jpg",
  "pastane-cover": RP + "czNmcy1wcml2YXRlL3Jhd3BpeGVsX2ltYWdlcy93ZWJzaXRlX2NvbnRlbnQvbHIvaXMxMDYxNC1pbWFnZS1rd3Z3dmZjNC5qcGc.jpg",
  "pastane-1": WM + "5/5c/Baklava_-_Sunbirds_2025-04-11.jpg",
  "pastane-2": WM + "0/09/Traditional_Turkish_Coffee_with_Elegant_Design.jpg",
  "pastane-3": "https://cdn.stocksnap.io/img-thumbs/960w/ENTBVSVWWR.jpg",
  "otel1-cover": RP + "czNmcy1wcml2YXRlL3Jhd3BpeGVsX2ltYWdlcy93ZWJzaXRlX2NvbnRlbnQvbHIvaXMxNjk3My1pbWFnZS1rd3lzZGtlMi5qcGc.jpg",
  "otel1-1": RP + "czNmcy1wcml2YXRlL3Jhd3BpeGVsX2ltYWdlcy93ZWJzaXRlX2NvbnRlbnQvbHIvaXMxNjk2My1pbWFnZS1rd3lzYzRncy5qcGc.jpg",
  "otel1-2": WM + "f/f1/Turkish_hotel_breakfast_01.jpg",
  "otel1-3": WM + "8/8e/TW_%E5%8F%B0%E6%B9%BE_Taipei_%E5%8F%B0%E5%8C%97_Hotel_Metropolitan_Premier_Taipei_%E9%85%92%E5%BA%97%E6%88%BF%E9%96%93_hotel_bathroom_white_%E6%B5%B4%E7%BC%B8_bathtub_March_2024_R12S_03.jpg",
  "oda-1": WM + "f/ff/Bed_in_hotel_room_2.jpg",
  "oda-2": WM + "0/06/Bed_in_hotel_room_4.jpg",
  "oda-3": WM + "7/7b/MC_%E6%BE%B3%E9%96%80_Macau_%E8%B7%AF%E6%B0%B9_Cotai_%E5%96%9C%E4%BE%86%E7%99%BB%E9%85%92%E5%BA%97_Sheraton_Grand_Macao_%E5%AE%A2%E6%88%BF_hotel_room_November_2023_R12S_27.jpg",
  "oda-4": WM + "4/4f/Bed_in_hotel_room_5.jpg",
  "oda-5": WM + "e/e1/Bed_in_hotel_room_6.jpg",
  "otel2-cover": RP + "cHJpdmF0ZS9zdGF0aWMvaW1hZ2Uvd2Vic2l0ZS8yMDIyLTA0L2xyL2ZyYnVpbGRpbmdfd2FsZXNfYXJjaGl0ZWN0dXJlX2hvdGVsLWltYWdlLWt5YmMybnN5LmpwZw.jpg",
  "otel2-1": WM + "2/24/Turkish_hotel_breakfast_02.jpg",
  "ev-konser": "https://cdn.stocksnap.io/img-thumbs/960w/5GPP7A6LVW.jpg",
  "ev-caz": "https://cdn.stocksnap.io/img-thumbs/960w/F01WSFHEJY.jpg",
  "ev-resim": RP + "cHJpdmF0ZS9zdGF0aWMvaW1hZ2Uvd2Vic2l0ZS8yMDIyLTA0L2xyL3B4OTczNTU4LWltYWdlLWt3dnVwcHY0LmpwZw.jpg",
  "ev-kosu": RP + "cHJpdmF0ZS9zdGF0aWMvaW1hZ2Uvd2Vic2l0ZS8yMDIyLTA0L2xyL2ZycnVubmluZ19zcG9ydF9maXRfZml0bmVzcy1pbWFnZS1reWJjdmo3aS5qcGc.jpg",
  "ev-festival": RP + "cHJpdmF0ZS9sci9pbWFnZXMvd2Vic2l0ZS8yMDI0LTAyL2xyL3djeWVkaGo5YmItaW1hZ2UuanBn.jpg",
  "ev-seramik": WM + "1/17/Boles%C5%82awiec_pottery_workshop_at_Wikimania_2024_01.jpg",
  "ev-sergi": WM + "9/9d/Charles_Burrell_Museum_gallery.jpg",
  "ev-tiyatro": RP + "cHJpdmF0ZS9sci9pbWFnZXMvd2Vic2l0ZS8yMDI0LTAyL2xyL3djY2c1a2o2amotaW1hZ2UuanBn.jpg",
};

/** Wikimedia originals are 4000px+; ask for the standard 1280px thumbnail instead. */
function sourceUrl(url) {
  if (!url.startsWith(WM) || url.includes("/thumb/")) return url;
  const rest = url.slice(WM.length); // a/ab/File.jpg
  const file = rest.split("/").pop();
  return `${WM}thumb/${rest}/1280px-${file}`;
}

const publicUrl = (path) => `${SUPABASE_URL}/storage/v1/object/public/media/${path}`;

async function fetchBytes(url) {
  let last;
  for (let i = 1; i <= 4; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "image/*" }, signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      last = e;
      await sleep(1500 * i);
    }
  }
  throw last;
}

/** Download, resize (max 1280px wide) and upload one photo; returns its public URL. Skips files already stored. */
async function demoPhoto(key) {
  const src = PHOTOS[key];
  if (!src) throw new Error(`unknown photo ${key}`);
  const path = `demo/verticals/${key}.jpg`;
  const head = await fetch(publicUrl(path), { method: "HEAD" });
  if (head.ok) return publicUrl(path);
  const raw = await fetchBytes(sourceUrl(src));
  const jpg = await sharp(raw).rotate().resize({ width: 1280, withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toBuffer();
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/media/${path}`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "image/jpeg", "x-upsert": "true", "Cache-Control": "max-age=31536000" },
    body: jpg,
  });
  if (!res.ok) throw new Error(`upload ${key}: ${res.status} ${(await res.text()).slice(0, 160)}`);
  return publicUrl(path);
}

const photoUrls = {};
for (const key of Object.keys(PHOTOS)) {
  try {
    photoUrls[key] = await demoPhoto(key);
  } catch (e) {
    console.warn(`photo ${key} skipped: ${String(e.message).slice(0, 160)}`);
    photoUrls[key] = null;
  }
}
console.log("photos ok:", Object.values(photoUrls).filter(Boolean).length, "/", Object.keys(PHOTOS).length);
const P = (key) => photoUrls[key] ?? null;

// ---------------------------------------------------------------------------
// Businesses
// ---------------------------------------------------------------------------
const daily = (open, close) => Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, { open, close }]));
const S = (name, items) => ({ name, items });
const I = (name, price, desc = null, tags = [], photo = null) => ({ name, price, desc, tags, photo });

const BUSINESSES = [
  {
    key: "v-lokanta", phone: "905550000030", owner: "Fatma Aksoy", name: "Hacıhalil Ev Yemekleri", slug: "hacihalil-ev-yemekleri",
    vertical: "yemek", label: "Lokanta · Ev yemekleri", nb: "hacihalil", offset: [0.0012, -0.0008], price: 1,
    amenities: ["paket_servis", "cocuk_dostu", "kredi_karti", "vejetaryen"], hours: { ...daily("11:00", "21:00"), sun: null },
    desc: "Her gün taze pişen tencere yemekleri, çorbalar ve sütlü tatlılar. Öğle saatlerinde esnafa paket servis yapıyoruz. Bu kayıt örnek veridir.",
    cover: "lokanta-cover", photos: ["lokanta-1", "lokanta-2", "lokanta-3"],
    menu: [
      S("Çorbalar", [I("Mercimek çorbası", 90, "Limon ve kıtır ekmekle", ["vegan", "populer"]), I("Ezogelin çorbası", 90, null, ["vegan"]), I("Tavuk suyu çorba", 110, "Şehriyeli, terbiyeli")]),
      S("Ana yemekler", [
        I("Kuru fasulye", 160, "Tereyağlı, pilav ile servis edilir", ["populer"]),
        I("Etli nohut", 180),
        I("Karnıyarık", 210, "Kıymalı patlıcan, közlenmiş biber"),
        I("Tavuk sote", 200, "Sebzeli, hafif acılı", ["aci"]),
        I("İzmir köfte", 230, "Patates ve domates sosuyla"),
      ]),
      S("Pilav ve yanlar", [I("Pirinç pilavı", 70, null, ["vejetaryen"]), I("Bulgur pilavı", 70, null, ["vegan"]), I("Cacık", 60, null, ["vejetaryen"])]),
      S("Tatlılar", [I("Fırın sütlaç", 110, null, ["populer"]), I("Kemalpaşa", 100)]),
      S("İçecekler", [I("Ayran", 35), I("Çay", 20), I("Kola", 50)]),
    ],
  },
  {
    key: "v-durum", phone: "905550000031", owner: "Yusuf Kara", name: "Köşe Dürüm Evi", slug: "kose-durum-evi",
    vertical: "yemek", label: "Dürüm · Kebap · Lahmacun", nb: "istasyon", offset: [-0.0009, 0.0011], price: 2,
    amenities: ["paket_servis", "kredi_karti", "otopark"], hours: daily("10:30", "01:00"),
    desc: "Odun ateşinde Adana ve Urfa dürüm, günlük açılan lahmacun ve pide. Gece 01:00'e kadar açığız, paket servisimiz var. Bu kayıt örnek veridir.",
    cover: "durum-cover", photos: ["durum-1", "durum-2", "durum-3"],
    menu: [
      S("Dürümler", [
        I("Adana dürüm", 260, "Acılı zırh kıyması, lavaş, közlenmiş biber", ["aci", "populer"], "durum-2"),
        I("Urfa dürüm", 260, "Acısız"),
        I("Tavuk şiş dürüm", 210),
        I("Et döner dürüm", 280, "Yaprak döner, özel sos", ["populer"]),
      ]),
      S("Porsiyonlar", [I("Adana porsiyon", 380, "Pilav, salata ve közle", ["aci"]), I("Et döner porsiyon", 400), I("İskender", 450, "Tereyağı ve yoğurtla", ["populer"])]),
      S("Lahmacun ve pide", [I("Lahmacun", 110, null, [], "durum-3"), I("Kıymalı pide", 240), I("Kaşarlı pide", 220, null, ["vejetaryen"])]),
      S("İçecekler", [I("Ayran", 35), I("Şalgam", 45, null, ["aci"]), I("Kola", 50)]),
    ],
  },
  {
    key: "v-balik", phone: "905550000032", owner: "Cem Deniz", name: "Kıyı Balık Evi", slug: "kiyi-balik-evi",
    vertical: "restoran", label: "Balık restoranı", nb: "eskihisar", offset: [0.0005, 0.0006], price: 3,
    amenities: ["rezervasyon", "manzara", "bahce", "otopark", "kredi_karti", "wifi", "klima"], hours: daily("12:00", "23:30"),
    desc: "Eskihisar kıyısında, günlük tutulan mevsim balıkları ve ev yapımı mezeler. Akşamları rezervasyonla deniz manzaralı terasımızda ağırlıyoruz. Bu kayıt örnek veridir.",
    cover: "balik-cover", photos: ["balik-1", "balik-2", "balik-3"],
    menu: [
      S("Soğuk mezeler", [I("Haydari", 120, null, ["vejetaryen"]), I("Atom", 130, "Süzme yoğurt, kuru biber", ["aci", "vejetaryen"]), I("Deniz börülcesi", 150, null, ["vegan"]), I("Humus", 130, null, ["vegan"])]),
      S("Ara sıcaklar", [I("Kalamar tava", 420, "Tarator sos ile", ["populer"]), I("Karides güveç", 480, "Kaşarlı, tereyağlı"), I("Paçanga böreği", 260)]),
      S("Balıklar", [
        I("Levrek ızgara", 650, "Roka ve kırmızı soğanla", ["populer"], "balik-1"),
        I("Çipura ızgara", 620),
        I("Hamsi tava", 380, "Mevsiminde", ["yeni"]),
        I("Somon ızgara", 720, null, ["glutensiz"]),
      ]),
      S("Salatalar", [I("Roka salatası", 160, null, ["vegan"], "balik-2"), I("Çoban salata", 140, null, ["vegan"])]),
      S("Tatlılar", [I("Tahin helvası", 150), I("Dondurmalı irmik helvası", 180, null, ["populer"])]),
    ],
  },
  {
    key: "v-ocak", phone: "905550000033", owner: "Ahmet Sultan", name: "Sultan Ocakbaşı", slug: "sultan-ocakbasi",
    vertical: "restoran", label: "Ocakbaşı · Kebap", nb: "sultan-orhan", offset: [-0.0007, -0.0005], price: 3,
    amenities: ["rezervasyon", "otopark", "cocuk_dostu", "kredi_karti", "klima", "paket_servis"], hours: daily("11:30", "23:00"),
    desc: "Ocakbaşında pişen kebaplar, kuzu şiş ve karışık ızgara. Aile salonumuz ve kalabalık gruplar için rezervasyon imkânımız var. Bu kayıt örnek veridir.",
    cover: "ocak-cover", photos: ["ocak-1", "ocak-2", "ocak-3"],
    menu: [
      S("Başlangıçlar", [I("Acılı ezme", 90, null, ["aci", "vegan"]), I("Mercimek çorbası", 100, null, ["vegan"]), I("İçli köfte (adet)", 90)]),
      S("Ocakbaşı", [
        I("Adana kebap", 480, "Zırh kıyması, közlenmiş domates ve biber", ["aci", "populer"], "ocak-1"),
        I("Urfa kebap", 480),
        I("Kuzu şiş", 560, null, [], "ocak-2"),
        I("Tavuk kanat", 380),
        I("Karışık ızgara (2 kişilik)", 1450, "Adana, kuzu şiş, tavuk, köfte ve pirzola", ["populer"]),
      ]),
      S("Pide ve lahmacun", [I("Lahmacun", 120), I("Kuşbaşılı pide", 320)]),
      S("Tatlılar", [I("Künefe", 220, "Hatay peyniri ile", ["populer"]), I("Fıstıklı katmer", 260)]),
      S("İçecekler", [I("Ayran", 40), I("Şalgam", 45, null, ["aci"]), I("Soda", 30)]),
    ],
  },
  {
    key: "v-kahve", phone: "905550000034", owner: "Elif Kule", name: "Kule Kahve", slug: "kule-kahve",
    vertical: "kafe", label: "Üçüncü dalga kahve", nb: "hacihalil", offset: [-0.0014, 0.0004], price: 2,
    amenities: ["wifi", "canli_muzik", "evcil_hayvan", "kredi_karti", "vejetaryen", "klima"], hours: daily("08:00", "00:00"),
    desc: "Kendi kavurduğumuz çekirdeklerle espresso bazlı kahveler, filtre kahve ve ev yapımı tatlılar. Cuma akşamları akustik müzik var. Bu kayıt örnek veridir.",
    cover: "kahve-cover", photos: ["kahve-1", "kahve-2", "kahve-3"],
    menu: [
      S("Sıcak kahveler", [
        I("Espresso", 90),
        I("Americano", 110),
        I("Latte", 140, "Çift shot, tam yağlı veya yulaf sütü", ["populer"], "kahve-1"),
        I("Flat white", 145),
        I("Türk kahvesi", 90, "Lokum ile"),
      ]),
      S("Soğuk içecekler", [I("Iced latte", 150), I("Cold brew", 160, "18 saat demlenir", ["yeni"]), I("Ev yapımı limonata", 120, null, ["vegan"])]),
      S("Çaylar", [I("Demlik çay (bardak)", 30), I("Bitki çayı", 90, "Ihlamur, adaçayı veya papatya", ["vegan"])]),
      S("Tatlılar", [I("San Sebastian cheesecake", 220, null, ["populer"], "kahve-3"), I("Brownie", 170, "Sıcak servis, dondurma ile"), I("Tiramisu", 200)]),
      S("Atıştırmalık", [I("Tereyağlı kruvasan", 120, null, ["vejetaryen"]), I("Kaşarlı tost", 150, null, ["vejetaryen"])]),
    ],
  },
  {
    key: "v-pastane", phone: "905550000035", owner: "Hülya Bahçe", name: "Bahçe Pastanesi", slug: "bahce-pastanesi",
    vertical: "kafe", label: "Pastane · Kahvaltı", nb: "beylikbagi", offset: [0.0008, 0.0009], price: 2,
    amenities: ["kahvalti", "bahce", "cocuk_dostu", "otopark", "kredi_karti", "paket_servis"], hours: daily("07:30", "22:00"),
    desc: "Bahçemizde serpme kahvaltı, günlük yaş pasta, baklava ve şerbetli tatlılar. Doğum günü pastası siparişi alıyoruz. Bu kayıt örnek veridir.",
    cover: "pastane-cover", photos: ["pastane-1", "pastane-2", "pastane-3"],
    menu: [
      S("Kahvaltı", [
        I("Serpme kahvaltı (2 kişilik)", 950, "Peynir çeşitleri, zeytin, reçel, bal-kaymak, sıcaklar ve sınırsız çay", ["populer"]),
        I("Menemen", 200, null, ["vejetaryen"]),
        I("Sucuklu yumurta", 230),
        I("Simit tabağı", 180, "Simit, beyaz peynir, domates, salatalık", ["vejetaryen"]),
      ]),
      S("Pastalar", [I("Profiterol", 160), I("Trileçe", 150, null, ["populer"]), I("Yaş pasta (dilim)", 170)]),
      S("Baklava ve şerbetli", [I("Fıstıklı baklava (porsiyon)", 280, null, ["populer"], "pastane-1"), I("Sütlü nuriye", 200)]),
      S("İçecekler", [I("Çay", 25), I("Türk kahvesi", 90, null, [], "pastane-2"), I("Sahlep", 120, "Tarçınlı", ["yeni"]), I("Taze portakal suyu", 110, null, ["vegan"])]),
    ],
  },
  {
    key: "v-otel1", phone: "905550000036", owner: "Kaan Mor", name: "Mor Salkım Otel", slug: "mor-salkim-otel",
    vertical: "otel", label: "4 yıldızlı şehir oteli", nb: "osman-yilmaz", offset: [0.0006, -0.0012], price: 3, stars: 4,
    amenities: ["wifi", "otopark", "kahvalti", "havuz", "spor_salonu", "toplanti_salonu", "resepsiyon", "oda_servisi", "klima", "transfer", "engelli_erisimi", "kredi_karti"],
    hours: daily("00:00", "23:59"), website: "https://ornek-otel.example",
    desc: "Gebze merkezde, OSB'lere ve otoyola yakın şehir oteli. Açık büfe kahvaltı, kapalı havuz, spor salonu ve 120 kişilik toplantı salonu. Bu kayıt örnek veridir.",
    cover: "otel1-cover", photos: ["otel1-1", "otel1-2", "otel1-3"],
    rooms: [
      { name: "Standart Oda", price: 2600, capacity: 2, bed: "1 çift kişilik yatak", size: 24, photos: ["oda-1"], amenities: ["wifi", "klima", "tv", "kasa", "sac_kurutma", "calisma_masasi"], desc: "Şehir manzaralı, iş seyahatleri için çalışma masalı oda." },
      { name: "Deluxe Oda", price: 3400, capacity: 2, bed: "1 king yatak", size: 32, photos: ["oda-2", "oda-1"], amenities: ["wifi", "klima", "tv", "minibar", "kasa", "kuvet", "cay_kahve"], desc: "Geniş yaşam alanı ve küvetli banyo." },
      { name: "Aile Odası", price: 4200, capacity: 4, bed: "1 çift + 2 tek kişilik yatak", size: 40, photos: ["oda-3"], amenities: ["wifi", "klima", "tv", "minibar", "sac_kurutma"], desc: "İki çocuklu aileler için geniş oda." },
      { name: "Suit", price: 6200, capacity: 3, bed: "1 king yatak + çekyat", size: 55, photos: ["oda-3", "oda-2"], amenities: ["wifi", "klima", "tv", "minibar", "kasa", "balkon", "kuvet", "cay_kahve"], desc: "Ayrı oturma odalı, balkonlu suit." },
    ],
  },
  {
    key: "v-otel2", phone: "905550000037", owner: "Deniz Kıyı", name: "Eskihisar Kıyı Butik Otel", slug: "eskihisar-kiyi-butik-otel",
    vertical: "otel", label: "Butik otel", nb: "eskihisar", offset: [-0.0006, 0.0008], price: 2, stars: 3,
    amenities: ["wifi", "otopark", "kahvalti", "manzara", "bahce", "evcil_hayvan", "resepsiyon"], hours: daily("00:00", "23:59"),
    desc: "Eskihisar Kalesi'ne yürüme mesafesinde, denize bakan 12 odalı butik otel. Bahçede köy kahvaltısı dahil. Bu kayıt örnek veridir.",
    cover: "otel2-cover", photos: ["otel2-1", "oda-4", "oda-5"],
    rooms: [
      { name: "Deniz Manzaralı Çift Kişilik", price: 2900, capacity: 2, bed: "1 çift kişilik yatak", size: 22, photos: ["oda-4"], amenities: ["wifi", "klima", "tv", "balkon", "manzara", "cay_kahve"], desc: "Balkondan körfez manzarası." },
      { name: "Standart Çift Kişilik", price: 2300, capacity: 2, bed: "1 çift veya 2 tek kişilik yatak", size: 20, photos: ["oda-5"], amenities: ["wifi", "klima", "tv", "sac_kurutma"], desc: "Bahçe cepheli sakin oda." },
      { name: "Üç Kişilik Oda", price: 3100, capacity: 3, bed: "1 çift + 1 tek kişilik yatak", size: 26, photos: ["oda-5", "oda-4"], amenities: ["wifi", "klima", "tv"], desc: "Arkadaş grupları ve küçük aileler için." },
    ],
  },
];

async function ensureUser(phone, meta) {
  const res = await adminFetch("/auth/v1/admin/users", { method: "POST", body: { phone, phone_confirm: true, user_metadata: { demo: true, ...meta } } });
  if (res.ok) return res.body.id;
  const found = await sql(`select id from auth.users where phone = ${lit(phone)}`);
  if (found?.[0]?.id) return found[0].id;
  throw new Error(`cannot create user ${phone.slice(0, 6)}***: ${res.status}`);
}

const userRows = await sql(`select u.phone, u.id from auth.users u where u.phone in ('905550000001','905550000020','905550000021','905550000022')`);
const uid = Object.fromEntries(userRows.map((r) => [r.phone, r.id]));
if (!uid["905550000020"] || !uid["905550000001"]) throw new Error("run scripts/db/seed-demo.mjs first (demo users missing)");

const bizIds = {};
for (const b of BUSINESSES) {
  const ownerId = await ensureUser(b.phone, { business: b.slug });
  await sql(`update public.profiles set full_name = ${lit(b.owner)}, onboarded = true, is_demo = true, kvkk_accepted_at = coalesce(kvkk_accepted_at, now()),
      neighbourhood_id = (select id from public.neighbourhoods where slug = ${lit(b.nb)}) where id = ${lit(ownerId)}`);
  const [dx, dy] = b.offset;
  const loc = `(select extensions.st_setsrid(extensions.st_makepoint(extensions.st_x(center::extensions.geometry) + ${dx}, extensions.st_y(center::extensions.geometry) + ${dy}), 4326)::extensions.geography
      from public.neighbourhoods where slug = ${lit(b.nb)})`;
  const rows = await sql(`
    insert into public.businesses (id, owner_id, slug, name, description, phone, address, location, neighbourhood_id, kinds, category_label,
      working_hours, status, verification_level, approved_at, is_demo, vertical, price_level, star_rating, amenities, website, cover_url)
    values (${lit(demoId(b.key))}, ${lit(ownerId)}, ${lit(b.slug)}, ${lit(b.name)}, ${lit(b.desc)}, ${lit("+" + b.phone)},
      (select name || ' Mah., Gebze / Kocaeli' from public.neighbourhoods where slug = ${lit(b.nb)}), ${loc},
      (select id from public.neighbourhoods where slug = ${lit(b.nb)}), '{shop,employer}'::text[], ${lit(b.label)}, ${jsonLit(b.hours)},
      'approved', 1, now(), true, ${lit(b.vertical)}, ${b.price ?? "null"}, ${b.stars ?? "null"}, ${lit(`{${b.amenities.join(",")}}`)}::text[],
      ${lit(b.website ?? null)}, ${lit(P(b.cover))})
    on conflict (id) do update set slug = excluded.slug, name = excluded.name, description = excluded.description, phone = excluded.phone,
      address = excluded.address, location = excluded.location, neighbourhood_id = excluded.neighbourhood_id, kinds = excluded.kinds,
      category_label = excluded.category_label, working_hours = excluded.working_hours, status = 'approved', verification_level = 1,
      approved_at = coalesce(public.businesses.approved_at, now()), is_demo = true, vertical = excluded.vertical, price_level = excluded.price_level,
      star_rating = excluded.star_rating, amenities = excluded.amenities, website = excluded.website, cover_url = excluded.cover_url
    returning id`);
  const bid = rows[0].id;
  bizIds[b.key] = bid;

  // Photos (replace)
  const photos = b.photos.map(P).filter(Boolean);
  await sql(`delete from public.business_photos where business_id = ${lit(bid)};
    ${photos.length ? `insert into public.business_photos (business_id, url, sort) values ${photos.map((u, i) => `(${lit(bid)}, ${lit(u)}, ${i})`).join(",")};` : ""}`);

  // Menu (replace; items cascade with their sections)
  await sql(`delete from public.business_menu_sections where business_id = ${lit(bid)}`);
  if (b.menu) {
    const stmts = [];
    b.menu.forEach((s, si) => {
      const sid = demoId(`${b.key}-menu-${si}`);
      stmts.push(`insert into public.business_menu_sections (id, business_id, name, sort) values (${lit(sid)}, ${lit(bid)}, ${lit(s.name)}, ${si});`);
      const values = s.items.map(
        (it, ii) =>
          `(${lit(bid)}, ${lit(sid)}, ${lit(it.name)}, ${lit(it.desc)}, ${it.price}, ${lit(it.photo ? P(it.photo) : null)}, ${lit(`{${it.tags.join(",")}}`)}::text[], ${ii})`,
      );
      stmts.push(`insert into public.business_menu_items (business_id, section_id, name, description, price_try, photo_url, tags, sort) values ${values.join(",")};`);
    });
    await sql(stmts.join("\n"));
  }

  // Rooms (replace)
  await sql(`delete from public.business_rooms where business_id = ${lit(bid)}`);
  if (b.rooms) {
    const values = b.rooms.map(
      (r, i) =>
        `(${lit(bid)}, ${lit(r.name)}, ${lit(r.desc)}, ${r.price}, ${r.capacity}, ${lit(r.bed)}, ${r.size}, ${lit(`{${r.amenities.join(",")}}`)}::text[],
          ${lit(`{${r.photos.map(P).filter(Boolean).map((u) => `"${u}"`).join(",")}}`)}::text[], ${i})`,
    );
    await sql(`insert into public.business_rooms (business_id, name, description, price_try, capacity, bed_info, size_m2, amenities, photos, sort) values ${values.join(",")}`);
  }
}
console.log("vertical businesses ok:", Object.keys(bizIds).length);

// Reviews ---------------------------------------------------------------------
const REVIEWS = [
  ["v-lokanta", "905550000020", 5, "Kuru fasulyesi tam ev yemeği tadında, porsiyonlar doyurucu."],
  ["v-lokanta", "905550000021", 4, "Öğle arasında hızlı ve uygun fiyatlı, sütlacı da çok iyi."],
  ["v-durum", "905550000021", 5, "Adana dürüm şehrin en iyilerinden, gece geç saatte de açık olması büyük artı."],
  ["v-durum", "905550000022", 4, "Lahmacun ince ve çıtır, paket servis de hızlı geldi."],
  ["v-balik", "905550000020", 5, "Terasta gün batımında levrek, mezeler de çok tazeydi."],
  ["v-balik", "905550000022", 4, "Balıklar taze, fiyatlar biraz yüksek ama manzaraya değer."],
  ["v-ocak", "905550000021", 5, "Karışık ızgara iki kişiye fazla bile geldi, künefe muhteşem."],
  ["v-kahve", "905550000022", 5, "Latte'si ve cheesecake'i için tekrar geleceğim, çalışmak için de sakin bir yer."],
  ["v-kahve", "905550000020", 4, "Kahveler çok iyi, hafta sonu biraz kalabalık oluyor."],
  ["v-pastane", "905550000020", 5, "Bahçede serpme kahvaltı harikaydı, çay hiç bitmedi."],
  ["v-pastane", "905550000021", 4, "Trileçesi çok güzel, doğum günü pastamızı da buradan aldık."],
  ["v-otel1", "905550000021", 5, "İş için kaldım, OSB'ye yakın, kahvaltısı zengin ve odalar temizdi."],
  ["v-otel1", "905550000022", 4, "Havuz ve spor salonu güzel, otopark biraz dar."],
  ["v-otel2", "905550000020", 5, "Balkondan manzara harika, sahibi çok ilgili. Köy kahvaltısı çok güzeldi."],
];
for (const [bk, phone, rating, comment] of REVIEWS) {
  await sql(`insert into public.reviews (id, business_id, author_id, rating, comment, is_demo)
    values (${lit(demoId(`review-${bk}-${phone}`))}, ${lit(bizIds[bk])}, ${lit(uid[phone])}, ${rating}, ${lit(comment)}, true)
    on conflict (id) do update set rating = excluded.rating, comment = excluded.comment`);
}
await sql(`update public.businesses b set
    rating_avg = coalesce((select round(avg(rating)::numeric, 2) from public.reviews r where r.business_id = b.id), 0),
    rating_count = (select count(*) from public.reviews r where r.business_id = b.id)
  where b.is_demo`);
console.log("reviews ok:", REVIEWS.length);

// Events ------------------------------------------------------------------------
const at = (days, time) => `((current_date + ${days}) + time '${time}') at time zone 'Europe/Istanbul'`;
const EVENTS = [
  { key: "ev-akustik", biz: "v-kahve", cat: "konser", title: "Akustik Akşam: Kule Kahve Sahnesi", start: at(2, "20:30"), end: at(2, "22:30"), free: true, cover: "ev-konser", nb: "hacihalil",
    desc: "Genç müzisyenlerden akustik gitar ve vokal performansları. Giriş ücretsizdir, masalar için erken gelmeni öneririz. Bu etkinlik örnek veridir." },
  { key: "ev-resim", biz: "v-pastane", cat: "cocuk", title: "Çocuklar İçin Resim Atölyesi", start: at(4, "11:00"), end: at(4, "13:00"), price: 350, note: "Malzemeler dahil", cover: "ev-resim", nb: "beylikbagi",
    desc: "6-12 yaş arası çocuklar için sulu boya ve pastel atölyesi. Kontenjan 15 kişidir, kayıt için arayabilirsiniz. Bu etkinlik örnek veridir." },
  { key: "ev-caz", biz: "v-otel1", cat: "konser", title: "Teras Caz Gecesi", start: at(5, "21:00"), end: at(5, "23:30"), price: 450, note: "Bir içecek dahil", cover: "ev-caz", nb: "osman-yilmaz",
    desc: "Otelin teras katında canlı caz trio. Rezervasyonla sınırlı sayıda masa. Bu etkinlik örnek veridir." },
  { key: "ev-seramik", biz: "v-kahve", cat: "atolye", title: "Seramik Atölyesi: Kendi Kupanı Yap", start: at(6, "14:00"), end: at(6, "17:00"), price: 650, note: "Pişirim ve malzeme dahil", cover: "ev-seramik", nb: "hacihalil",
    desc: "Çamura şekil vermeyi öğrenip kendi kupanı yapıyorsun. Ürünler pişirildikten sonra bir hafta içinde teslim edilir. Bu etkinlik örnek veridir." },
  { key: "ev-tiyatro", biz: null, cat: "tiyatro", title: "Tiyatro: Bir Kasaba Hikâyesi", start: at(8, "20:00"), end: at(8, "22:00"), price: 300, cover: "ev-tiyatro", nb: "mustafapasa", venue: "Kültür merkezi salonu (örnek)",
    desc: "Amatör bir tiyatro topluluğunun iki perdelik komedi oyunu. Bu etkinlik örnek veridir." },
  { key: "ev-kosu", biz: null, cat: "spor", title: "Eskihisar Sahil Koşusu 10K", start: at(9, "08:30"), end: at(9, "11:30"), free: true, cover: "ev-kosu", nb: "eskihisar", venue: "Eskihisar sahil yolu",
    desc: "5 ve 10 km parkurlu, her yaşa açık sabah koşusu. Katılım ücretsizdir, bitişte su ve meyve ikramı var. Bu etkinlik örnek veridir." },
  { key: "ev-festival", biz: null, cat: "festival", title: "Sokak Lezzetleri Festivali", start: at(12, "12:00"), end: at(14, "22:00"), free: true, cover: "ev-festival", nb: "hacihalil", venue: "Şehir meydanı (örnek)",
    desc: "Üç gün boyunca yerel lezzet tezgâhları, çocuk etkinlikleri ve akşam konserleri. Bu etkinlik örnek veridir." },
  { key: "ev-sergi", biz: null, cat: "sergi", title: "Fotoğraf Sergisi: Gebze'den Kareler", start: at(1, "10:00"), end: at(15, "19:00"), free: true, cover: "ev-sergi", nb: "hacihalil", venue: "Sergi salonu (örnek)",
    desc: "Yerel fotoğrafçıların objektifinden Gebze'nin tarihi yapıları, sahili ve gündelik hayatı. Bu etkinlik örnek veridir." },
];
const bizById = Object.fromEntries(BUSINESSES.map((b) => [b.key, b]));
await sql(`delete from public.events where is_demo and id not in (${EVENTS.map((e) => lit(demoId(e.key))).join(",")})`);
for (const e of EVENTS) {
  const biz = e.biz ? bizById[e.biz] : null;
  const venue = e.venue ?? biz?.name ?? null;
  const nbSel = (col) => `(select ${col} from public.neighbourhoods where slug = ${lit(e.nb)})`;
  await sql(`insert into public.events (id, business_id, created_by, title, description, category, starts_at, ends_at, venue_name, address, lat, lng,
      neighbourhood_id, is_free, price_try, price_note, phone, cover_url, status, is_demo)
    values (${lit(demoId(e.key))}, ${biz ? lit(bizIds[e.biz]) : "null"}, ${lit(uid["905550000001"])}, ${lit(e.title)}, ${lit(e.desc)}, ${lit(e.cat)},
      ${e.start}, ${e.end}, ${lit(venue)}, ${nbSel(`name || ' Mah., Gebze / Kocaeli'`)},
      ${nbSel("extensions.st_y(center::extensions.geometry)")}, ${nbSel("extensions.st_x(center::extensions.geometry)")}, ${nbSel("id")},
      ${e.free ? "true" : "false"}, ${e.price ?? "null"}, ${lit(e.note ?? null)}, ${lit(biz ? "+" + biz.phone : null)}, ${lit(P(e.cover))}, 'published', true)
    on conflict (id) do update set business_id = excluded.business_id, title = excluded.title, description = excluded.description, category = excluded.category,
      starts_at = excluded.starts_at, ends_at = excluded.ends_at, venue_name = excluded.venue_name, address = excluded.address, lat = excluded.lat,
      lng = excluded.lng, neighbourhood_id = excluded.neighbourhood_id, is_free = excluded.is_free, price_try = excluded.price_try,
      price_note = excluded.price_note, phone = excluded.phone, cover_url = excluded.cover_url, status = 'published', is_demo = true`);
}
console.log("events ok:", EVENTS.length);

const summary = await sql(`select
  (select count(*) from public.businesses where is_demo and vertical in ('yemek','restoran','kafe','otel')) as vertical_businesses,
  (select count(*) from public.business_menu_items i join public.businesses b on b.id = i.business_id where b.is_demo) as menu_items,
  (select count(*) from public.business_rooms r join public.businesses b on b.id = r.business_id where b.is_demo) as rooms,
  (select count(*) from public.events where is_demo and status = 'published') as events,
  (select count(*) from public.businesses where vertical is null) as without_vertical`);
console.log(JSON.stringify(summary[0]));
