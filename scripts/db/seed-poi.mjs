// Seed / re-sync points of interest for Gebze:
//   - pharmacies, mosques, historic sites: Kocaeli Büyükşehir Belediyesi Açık Veri (CC BY 4.0), ilce_id 1338 = Gebze.
//     Pharmacies/mosques come in EPSG:5254 (TM30) and are transformed to WGS84 in PostGIS.
//   - bus stops (+ route refs) and named parks: OpenStreetMap via Overpass (ODbL), one query per kind.
//   - curated places: our own short Turkish descriptions (details.curated = true).
// Written through public.poi_sync_apply: upsert on (source, source_ref) + last_seen_at, neighbourhood = polygon containing
// the point (fallback: nearest centre). Rows of a fully downloaded KBB / OSM list that the source no longer has are
// hidden (never deleted; locked rows keep the admin's edits). Pharmacies, mosques, OSM places and stops are also re-synced
// every month by src/features/nearby/server/poi-sync.ts with the same rules.
// Usage: node --env-file=.env.local scripts/db/seed-poi.mjs [--dry-run] [--cache <dir>]
//   --dry-run: print added / updated / missing counts, write nothing. --cache stores raw downloads (an old cache also
//   hides what the source added since: dry-run first).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { overpass, poiSyncApply, sql, trSlug, UA, sleep } from "./lib.mjs";

const DRY_RUN = process.argv.includes("--dry-run");
const cacheIdx = process.argv.indexOf("--cache");
const CACHE = cacheIdx > 0 ? process.argv[cacheIdx + 1] : null;
if (CACHE && !existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });

const GEBZE_ILCE_ID = 1338;
const KBB = "https://kavisacikveri.kocaeli.bel.tr/api/public/OpenDataPublic/attachments";
const KBB_LICENSE = "CC BY 4.0 - Kocaeli Büyükşehir Belediyesi Açık Veri";
const OSM_LICENSE = "ODbL - © OpenStreetMap katkıcıları";
const AREA = `area["name"="Gebze"]["boundary"="administrative"]["admin_level"="6"]->.g;`;

async function cached(file, loader) {
  const p = CACHE ? join(CACHE, file) : null;
  if (p && existsSync(p)) return JSON.parse(readFileSync(p, "utf8").replace(/^﻿/, ""));
  const data = await loader();
  if (p) writeFileSync(p, JSON.stringify(data), "utf8");
  return data;
}

async function kbb(attachmentId) {
  for (let i = 1; i <= 4; i++) {
    try {
      const res = await fetch(`${KBB}/${attachmentId}/download`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60000) });
      const text = await res.text();
      if (!res.ok || !text.trimStart().replace(/^﻿/, "").startsWith("{")) throw new Error(`kbb ${res.status}`);
      return JSON.parse(text.replace(/^﻿/, ""));
    } catch (e) {
      console.error(`kbb download retry ${i}: ${e.message}`);
      await sleep(3000 * i);
    }
  }
  throw new Error("KBB download failed");
}

const titleCaseTr = (s) =>
  s
    .toLocaleLowerCase("tr-TR")
    .replace(/(^|[\s(/.-])(\p{L})/gu, (m, p, c) => p + c.toLocaleUpperCase("tr-TR"))
    .replace(/\b(No|Sk|Cad|Mah)\b/g, (m) => m);
const cleanAddr = (s) => {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t === t.toLocaleUpperCase("tr-TR") ? titleCaseTr(t) : t;
};
const phoneE164 = (s) => {
  let d = String(s || "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 12 && d.startsWith("90")) d = d.slice(2);
  return d.length === 10 ? `+90${d}` : null;
};

// ---------------------------------------------------------------------------
// Load sources
// ---------------------------------------------------------------------------
const eczane = await cached("kbb_eczane.json", () => kbb("87c9b460-4d2c-4895-bfed-e65932268f99"));
const camiler = await cached("kbb_camiler.json", () => kbb("b5bf4487-56bd-476d-8903-a27d52710415"));
const tarihi = await cached("kbb_tarihi.json", () => kbb("3ddcf9ba-9361-462e-81eb-e926f7e05f82"));
const osmBus = await cached("osm_bus.json", () =>
  overpass(`[out:json][timeout:180];${AREA}(node(area.g)["highway"="bus_stop"];node(area.g)["public_transport"="platform"]["bus"="yes"];);out body;`));
await sleep(3000);
const osmRoutes = await cached("osm_routes.json", () =>
  overpass(`[out:json][timeout:180];${AREA}node(area.g)["highway"="bus_stop"]->.s;rel(bn.s)["route"="bus"];out body;`));
await sleep(3000);
const osmPlaces = await cached("osm_places.json", () =>
  overpass(`[out:json][timeout:180];${AREA}(nwr(area.g)["tourism"~"^(museum|attraction|viewpoint)$"]["name"];nwr(area.g)["historic"]["name"];nwr(area.g)["leisure"="park"]["name"];nwr(area.g)["leisure"="nature_reserve"]["name"];nwr(area.g)["shop"="mall"]["name"];);out center tags;`));
let osmCoast = { elements: [] };
try {
  await sleep(3000);
  osmCoast = await cached("osm_coast.json", () =>
    overpass(`[out:json][timeout:120];${AREA}(nwr(area.g)["leisure"="marina"];nwr(area.g)["amenity"="ferry_terminal"];);out center tags;`));
} catch (e) {
  console.warn("coast query failed, continuing without marina/ferry:", e.message);
}

// Rows without a "phone" key keep the stored phone (only KBB pharmacies / mosques have phones).
const rows = []; // {kind,name,slug?,address,phone?,x,y,srid,details,source,source_ref,license}
const gebze = (f) => f.properties?.ilce_id === GEBZE_ILCE_ID;

for (const f of eczane.features.filter(gebze)) {
  const p = f.properties;
  const name = String(p.adi || "").trim();
  if (!name) continue; // skip unnamed pharmacies
  const [x, y] = f.geometry.coordinates;
  rows.push({ kind: "pharmacy", name, address: cleanAddr(p.adres), phone: phoneE164(p.telefon), x, y, srid: 5254,
    details: {}, source: "kbb", source_ref: `eczane:${p.poi_id ?? p.objectid}`, license: KBB_LICENSE });
}
for (const f of camiler.features.filter(gebze)) {
  const p = f.properties;
  const name = String(p.adi || "").trim().replace(/\bCami\b/g, "Camii") || "Cami";
  const [x, y] = f.geometry.coordinates;
  rows.push({ kind: "mosque", name, address: cleanAddr(p.adres), phone: phoneE164(p.telefon), x, y, srid: 5254,
    details: {}, source: "kbb", source_ref: `cami:${p.poi_id ?? p.objectid}`, license: KBB_LICENSE });
}

// Curated descriptions (our own text). Keys = KBB historic names.
const CURATED_KBB = {
  "Hünkar Çayırı (Fatih Sultan Mehmet Han Otağı)": { name: "Hünkar Çayırı", category: "tarihi",
    description: "Fatih Sultan Mehmet'in 1481'deki son seferinde otağını kurduğu ve burada hayatını kaybettiği bilinen çayır. Alandaki otağ canlandırması ve anı köşesiyle kısa ama anlamlı bir durak." },
  "Tarihi Menzihane Hamamı": { name: "Menzilhane Hamamı", category: "tarihi",
    description: "Sultan Orhan Mahallesi'ndeki tarihi hamam; Gebze'nin eski yol üzerindeki bir konaklama (menzil) noktası olduğunu hatırlatan yapılardan biri." },
  "Eskihisar Amfi Tiyatro": { name: "Eskihisar Amfi Tiyatro", category: "diger",
    description: "Eskihisar Kalesi'nin eteğinde, yaz aylarında konser ve gösterilere sahne olan açık hava tiyatrosu. Koya bakan manzarası gün batımında çok güzel." },
  "Eskihisar Kalesi": { name: "Eskihisar Kalesi", category: "tarihi",
    description: "Bizans döneminden kalma, Eskihisar koyuna hâkim bir tepede yükselen kale. Surların ve kulelerin bir kısmı ayakta; yukarıdan İzmit Körfezi'ni seyretmek mümkün." },
  "Anibal Anıt Mezarı": { name: "Hannibal Anıt Mezarı", category: "tarihi",
    description: "Kartacalı komutan Hannibal'ın bu topraklarda hayatını kaybettiği rivayetine dayanan anıt mezar. Düzenlenmiş çevresi, Tatlıkuyu Vadisi yürüyüşüyle birleştirilebilir." },
  "İbrahim Paşa Tarihi Çeşmesi": { name: "İbrahim Paşa Çeşmesi", category: "tarihi",
    description: "Hacıhalil Mahallesi'nde, şehir merkezinin tarihi dokusunu yansıtan Osmanlı dönemi çeşmesi." },
  "Osman Hamdi Bey Evi ve Müzesi": { name: "Osman Hamdi Bey Evi ve Müzesi", category: "muze",
    description: "Ressam, arkeolog ve müzeci Osman Hamdi Bey'in yazlarını geçirdiği köşk. Eskihisar koyuna bakan bahçesiyle müze olarak ziyaret edilebiliyor; ressamın hayatı ve eserleri anlatılıyor." },
};
// Place details never carry "photos": an admin's photos stay (a missing key reads as no photos).
const kbbPlaceNames = new Map();
for (const f of tarihi.features.filter(gebze)) {
  const p = f.properties;
  const raw = String(p.adi || "").trim();
  if (!raw) continue;
  const c = CURATED_KBB[raw];
  const mah = (String(p.adres || "").match(/^([^\d]+?)\s+MAH/i) || [])[1];
  const name = c?.name ?? (raw === "Tarihi Çeşme" && mah ? `Tarihi Çeşme (${titleCaseTr(mah.trim())})` : raw);
  const [x, y] = f.geometry.coordinates;
  kbbPlaceNames.set(name, true);
  rows.push({ kind: "place", name, address: cleanAddr(p.adres), x, y, srid: 4326,
    details: c ? { category: c.category, description: c.description, curated: true } : { category: "tarihi", curated: false },
    source: "kbb", source_ref: `tarihi:${p.poi_id ?? p.objectid}`, license: KBB_LICENSE });
}

// Curated places not in the KBB historic list. Coordinates from KBB mosques (EPSG:5254) or OSM.
const camiByName = (re) => camiler.features.find((f) => gebze(f) && re.test(f.properties.adi));
const cmp = camiByName(/^Çoban Mustafa Paşa Cami/i);
const sultanOrhan = camiByName(/^Sultan Orhan Cami/i);
const osmById = new Map(osmPlaces.elements.map((e) => [`${e.type}/${e.id}`, e]));
const osmPt = (id) => {
  const e = osmById.get(id);
  if (!e) return null;
  const c = e.center || { lat: e.lat, lon: e.lon };
  return [c.lon, c.lat];
};
const MANUAL = [
  cmp && { ref: "cmp-kulliyesi", name: "Çoban Mustafa Paşa Külliyesi", pt: cmp.geometry.coordinates, srid: 5254, category: "tarihi",
    address: "Hacıhalil Mah., Atatürk Cad., Gebze",
    description: "Kanuni döneminde vezir Çoban Mustafa Paşa'nın yaptırdığı külliye; cami, türbe, medrese, hamam ve kervansaray gibi yapılardan oluşuyor. Caminin renkli mermer işçiliği Gebze'nin en dikkat çekici tarihi mirasları arasında." },
  sultanOrhan && { ref: "sultan-orhan-camii", name: "Sultan Orhan Camii", pt: sultanOrhan.geometry.coordinates, srid: 5254, category: "tarihi",
    address: "Sultan Orhan Mah., Orhan Gazi Cad., Gebze",
    description: "Osmanlı'nın erken dönemine, Orhan Gazi zamanına tarihlenen ve Gebze'nin en eski camilerinden sayılan yapı. Şehir merkezinde, yürüyerek kolayca ulaşılabilir." },
  osmPt("relation/13794225") && { ref: "ballikayalar", name: "Ballıkayalar Tabiat Parkı", pt: osmPt("relation/13794225"), srid: 4326, category: "doga",
    address: "Tavşanlı Mah., Gebze",
    description: "Dere yatağı boyunca uzanan kireçtaşı kanyonu, yürüyüş parkurları, kaya tırmanışı rotaları ve piknik alanlarıyla Gebze'nin doğa kaçamağı. Hafta sonları kalabalık olabilir." },
  osmPt("way/1150515753") && { ref: "millet-bahcesi", name: "Gebze Millet Bahçesi", pt: osmPt("way/1150515753"), srid: 4326, category: "park",
    address: null, description: "Geniş yeşil alanları, yürüyüş ve bisiklet yolları, çocuk oyun alanlarıyla şehrin yeni nefes alanlarından biri." },
  osmPt("way/1092602566") && { ref: "tatlikuyu-vadisi", name: "Tatlıkuyu Vadisi", pt: osmPt("way/1092602566"), srid: 4326, category: "park",
    address: "Tatlıkuyu Mah., Gebze",
    description: "Vadi boyunca uzanan yürüyüş yolları ve dinlenme alanlarıyla merkeze yakın bir yeşil koridor; Hannibal Anıt Mezarı'na yürüme mesafesinde." },
  osmPt("way/165140213") && { ref: "gebze-center", name: "Gebze Center AVM", pt: osmPt("way/165140213"), srid: 4326, category: "avm",
    address: null, description: "Şehir merkezinde mağazaları ve yeme-içme alanlarıyla büyük alışveriş merkezi." },
].filter(Boolean);

const coastPick = (re) => osmCoast.elements.find((e) => re.test(e.tags?.name || "") || re.test(e.tags?.leisure || "") || re.test(e.tags?.amenity || ""));
const marina = osmCoast.elements.find((e) => e.tags?.leisure === "marina");
if (marina) {
  const c = marina.center || { lat: marina.lat, lon: marina.lon };
  MANUAL.push({ ref: "eskihisar-limani", name: "Eskihisar Yat Limanı ve Sahili", pt: [c.lon, c.lat], srid: 4326, category: "doga",
    address: "Eskihisar Mah., Gebze",
    description: "Balıkçı tekneleri ve yatların demirlediği küçük liman. Sahil boyunca yürüyüş yapılabiliyor; Eskihisar Kalesi ve Osman Hamdi Bey Müzesi çok yakında." });
}
const ferry = osmCoast.elements.find((e) => e.tags?.amenity === "ferry_terminal" && /eskihisar/i.test(e.tags?.name || ""));
if (ferry) {
  const c = ferry.center || { lat: ferry.lat, lon: ferry.lon };
  MANUAL.push({ ref: "eskihisar-feribot", name: ferry.tags.name, pt: [c.lon, c.lat], srid: 4326, category: "diger",
    address: "Eskihisar Mah., Gebze",
    description: "Körfezin karşı kıyısına (Topçular) araçlı feribot seferlerinin kalktığı iskele. Sefer saatlerini gitmeden önce kontrol edin." });
}
void coastPick;

for (const m of MANUAL) {
  kbbPlaceNames.set(m.name, true);
  rows.push({ kind: "place", name: m.name, address: m.address, x: m.pt[0], y: m.pt[1], srid: m.srid,
    details: { category: m.category, description: m.description, curated: true },
    source: "manual", source_ref: m.ref, license: m.srid === 5254 ? KBB_LICENSE : OSM_LICENSE });
}

// OSM named parks / historic / malls not already covered (non-curated, no description; an admin's curated flag stays).
const SKIP_OSM = /(mezarl|sitesi|^müze$|greek|favori avm|lokomotif|türbesi|anıtı|hannibal|kalesi|osman hamdi|hunkar|hünkar|ballıkaya|millet bahçesi|tatlıkuyu vadisi|gebze center)/i;
const usedOsm = new Set(["relation/13794225", "way/1150515753", "way/1092602566", "way/165140213"]);
const seenNames = new Set([...kbbPlaceNames.keys()].map((n) => n.toLocaleLowerCase("tr-TR")));
for (const e of osmPlaces.elements) {
  const id = `${e.type}/${e.id}`;
  const t = e.tags || {};
  if (usedOsm.has(id) || !t.name || SKIP_OSM.test(t.name)) continue;
  const key = t.name.toLocaleLowerCase("tr-TR");
  if (seenNames.has(key)) continue;
  seenNames.add(key);
  const c = e.center || { lat: e.lat, lon: e.lon };
  const category = t.shop === "mall" ? "avm" : t.tourism === "museum" ? "muze" : t.historic ? "tarihi" : t.leisure === "nature_reserve" ? "doga" : "park";
  rows.push({ kind: "place", name: t.name, address: null, x: c.lon, y: c.lat, srid: 4326,
    details: { category, ...(t.wikidata ? { wikidata: t.wikidata } : {}) },
    source: "osm", source_ref: id, license: OSM_LICENSE });
}

// Bus stops with route refs (OSM)
const linesByNode = new Map();
for (const r of osmRoutes.elements || []) {
  const ref = r.tags?.ref || r.tags?.name;
  if (!ref) continue;
  for (const m of r.members || []) {
    if (m.type !== "node") continue;
    if (!linesByNode.has(m.ref)) linesByNode.set(m.ref, new Set());
    linesByNode.get(m.ref).add(ref);
  }
}
// The two queries can be answered by different mirrors: without any route the stored lines stay.
const haveRoutes = linesByNode.size > 0 && !(typeof osmRoutes?.remark === "string" && /error/i.test(osmRoutes.remark));
if (!osmBus.elements?.length) console.warn("OSM bus stops: empty answer, stops skipped (run again later).");
else if (!haveRoutes) console.warn("OSM bus routes: empty or truncated answer, stored stop lines kept.");
for (const e of osmBus.elements || []) {
  const t = e.tags || {};
  const lines = [...(linesByNode.get(e.id) || [])].sort((a, b) => a.localeCompare(b, "tr", { numeric: true }));
  rows.push({ kind: "bus_stop", name: t.name ? t.name.trim() : "Otobüs Durağı", address: null, x: e.lon, y: e.lat, srid: 4326,
    details: { ...(haveRoutes ? { lines } : {}), ...(t.ref ? { stop_code: t.ref } : {}), ...(t.shelter ? { shelter: t.shelter === "yes" } : {}) },
    source: "osm", source_ref: `node/${e.id}`, license: OSM_LICENSE });
}

// ---------------------------------------------------------------------------
// Slugs (unique across all POIs; stable for existing rows)
// ---------------------------------------------------------------------------
const existing = await sql(`select slug, source, source_ref from public.poi`);
const bySrc = new Map(existing.map((r) => [`${r.source}|${r.source_ref}`, r.slug]));
const taken = new Set(existing.map((r) => r.slug));
for (const r of rows) {
  const keep = bySrc.get(`${r.source}|${r.source_ref}`);
  if (keep) {
    r.slug = keep;
    continue;
  }
  const mah = (String(r.address || "").match(/^([^\d,]+?)\s+(Mah|Mh)\b/i) || [])[1];
  let base = trSlug(r.name) || r.kind;
  if (r.kind === "bus_stop") base = `durak-${base}`;
  let s = base;
  if (taken.has(s) && mah) s = trSlug(`${r.name} ${mah}`);
  let i = 2;
  while (taken.has(s)) s = `${base}-${i++}`;
  taken.add(s);
  r.slug = s;
}

// ---------------------------------------------------------------------------
// Write in one transaction; complete lists hide what the source no longer has
// ---------------------------------------------------------------------------
// Overpass reports a timeout / memory error in "remark" with partial data: such a list is not complete.
const truncated = (j) => typeof j?.remark === "string" && /error/i.test(j.remark);
const has = (source, kind) => rows.some((r) => r.source === source && r.kind === kind);
const groups = [];
for (const kind of ["pharmacy", "mosque", "place"]) if (has("kbb", kind)) groups.push({ source: "kbb", kind });
if (has("osm", "place") && !truncated(osmPlaces)) groups.push({ source: "osm", kind: "place" });
if (has("osm", "bus_stop") && !truncated(osmBus)) groups.push({ source: "osm", kind: "bus_stop" });

await poiSyncApply(rows, groups, { dryRun: DRY_RUN });
if (!DRY_RUN) {
  const counts = await sql(`select kind, source, count(*) filter (where not hidden) as visible, count(*) filter (where hidden) as hidden from public.poi group by 1, 2 order by 1, 2`);
  console.log(JSON.stringify(counts));
}
