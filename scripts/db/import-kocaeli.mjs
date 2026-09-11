// Kocaeli Büyükşehir Belediyesi open data -> public.poi (with district_id), public.transit_routes, public.transit_route_stops.
//
// Sources: the owner's local copies in kocaeli/ (CC BY 4.0 - Kocaeli Büyükşehir Belediyesi Açık Veri). The .json files are
// read (the CSVs are Windows-1254 copies of the same data): eczane, cami, petrol, taksi, polis, aile-sagligi, acil-saglik,
// komek, kultur-merkezi, muze (tarihi yapılar ve müzeler), millet-bahcesi, plajlar, otopark (ücretsiz),
// acil-toplanma-afet; and the toplu-ulasim GTFS bundle: stops.txt (bus stops), places.txt (KocaeliKart points),
// routes.txt + agency.txt (lines), trips.txt + shapes.txt (line geometry).
// Needs the districts layer (2026091380_kocaeli_districts.sql + seed-districts.mjs, live) and
// 2026091381_kocaeli_import_support.sql (place categories, transit tables, private.kocaeli_poi_import,
// private.transit_import, the poi_sync_apply skip list).
//
// Rules
//  * Coordinates: EPSG:5254 (TUREF / TM30) -> WGS84 with an own inverse Transverse Mercator (Krüger series: GRS80,
//    central meridian 30°E, k0 1, false easting 500000, false northing 0); EPSG:4326 files are used as they are (petrol's
//    X/Y columns are checked against its geometry). The dry run compares every converted point with PostGIS
//    ST_Transform and with the Gebze rows PostGIS converted earlier, and checks it against the district polygons.
//    Points more than 3 km outside Kocaeli are not imported (e.g. GTFS stops in İstanbul).
//  * District: the KBB ilce_id (public.districts.kbb_ilce_id) or the ILCE_AD / ILCE_ADI name; else the polygon the point
//    is in (or the nearest one within 3 km: piers, beaches).
//  * Stable key per record: "<file>:<poi_id>" ("<file>:o<objectid>" for files without poi_id), "durak:<stop_id>",
//    "kocaelikart:<kiosk_no>-<term_no>". New rows: source 'kbb', source_ref = key, details.kbb_ref = key and
//    details.import = 'kocaeli-acik-veri'. The Gebze pharmacies, mosques and historic sites seed-poi.mjs stored with the
//    same keys are the same rows.
//  * Each record is matched, in order: a stored row with its key (source_ref) or an earlier merge (details.kbb_ref); else
//    a stored row of the same kind (places / institutions: the same category group) within 120 m with a similar name
//    (Dice >= 0.6, or all distinctive words shared and >= 0.5; numbers must agree; stops within 60 m, or 120 m with the
//    same name), generic names by distance only (stop 30 m, any two stops 15 m, taxi 60 m, fuel 80 m, the same fuel
//    brand 120 m), within 60 m the shorter name's distinctive words all in the longer one ("S.S.K." = "SSK"), an ASM
//    within 10 m of a stored ASM named after the record's mahalle; a stored institution / place without a pin: a
//    near-identical name in the same district. Best pairs first, one to one. --show-merges lists the pairs and the
//    near misses (a new row within 150 m of an unmatched stored row of the same group).
//  * Rows this importer created are refreshed from the file on a re-run. Every other stored row (the Gebze data, admin
//    edits, photos) only gets what it misses (address, phone, e-mail, website, pin, district, details keys) plus
//    details.kbb_ref; a stored stop / taxi stand named only "Otobüs Durağı" / "Taksi Durağı" takes the KBB name. Locked
//    rows keep their fields (poi_before_write). Never deletes, never hides.
//  * Mahalle: not stored (KBB's address text stays as written); neighbourhood_id is only filled on a Gebze row inside a
//    Gebze mahalle polygon, for the current app (phase C drops it).
//  * KocaeliKart owners: only legal entities are stored (a person's name is personal data).
//  * GTFS: routes.txt + agency.txt -> transit_routes. There is no stop_times.txt, so no timetables and no exact stop
//    lists: route -> stop links are derived geometrically (the stop is within 25 m of one of the route's shapes; shape
//    segments longer than 250 m are ignored) and stored with method 'geometric'. details.lines of stops is not written.
//
// Usage (PowerShell, repo root, after dot-sourcing secrets.ps1 so SUPABASE_ACCESS_TOKEN is set):
//   node --env-file=.env.local scripts/db/import-kocaeli.mjs --dry-run              plan, checks, counts (read-only)
//   node --env-file=.env.local scripts/db/import-kocaeli.mjs --dry-run --rehearse   + a rolled-back write of a sample
//                                                                                   (runs 2026091381 inside it if needed)
//   node --env-file=.env.local scripts/db/import-kocaeli.mjs                        import (2026091381 must be live)
//   --only=eczane,cami,durak   limit the files (keys below); --show-merges   list the merge pairs of public
//   institutions, places, mosques and stops; --dir=<path>   another copy of the kocaeli/ folder.
//   --utility-places   also add the new KocaeliKart points, AFAD assembly areas and free car parks (kind place). Off by
//   default: the deployed app's place list (getPlaces: every place row, limit 500 -> /gezilecek-yerler, the home page,
//   search, GebzemAI) would fill up with ~1,200 of them. Turn it on once the UI filters places by category (phase B).
// Prints counts only (no phone numbers, no owner names). Never prints secrets.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { jsonLit, lit, runSql, sleep, sql, trSlug } from "./lib.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
const DRY = flag("dry-run");
const REHEARSE = flag("rehearse");
const SHOW = flag("show-merges");
const UTILITY = flag("utility-places");
const ONLY = opt("only") ? new Set(opt("only").split(",").map((s) => s.trim()).filter(Boolean)) : null;
if (REHEARSE && !DRY) {
  console.error("--rehearse only works together with --dry-run");
  process.exit(2);
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = opt("dir") ?? join(ROOT, "kocaeli");
const MIGRATION = join(ROOT, "supabase", "migrations", "2026091381_kocaeli_import_support.sql");
const LICENSE = "CC BY 4.0 - Kocaeli Büyükşehir Belediyesi Açık Veri";
const MERGE_M = 120;
const MERGE_STOP_M = 60; // two stops further apart are two stops (or the stored one is misplaced)
const NEAR_POLYGON_M = 3000;
const LINK_M = 25;
const MAX_SEGMENT_M = 250;
const CHUNK = 800;
const LINK_CHUNK = 4000;

// ---------------------------------------------------------------------------
// DB access (read-only unless importing)
// ---------------------------------------------------------------------------
async function ro(query) {
  for (let i = 1; ; i++) {
    try {
      return await runSql(query, { readOnly: true });
    } catch (e) {
      if (i >= 4 || (e.status && e.status >= 400 && e.status < 500 && e.status !== 429 && e.status !== 401)) throw e;
      await sleep(2000 * i);
    }
  }
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------
const FOLD = { ç: "c", ğ: "g", ı: "i", i: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };
/** Turkish-aware ASCII fold, words separated by single spaces (same as import-city-guide.mjs). */
function fold(s) {
  return String(s ?? "")
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşüâîû]/g, (c) => FOLD[c] ?? c)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
const squash = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const isCaps = (s) => /\p{L}/u.test(s) && s === s.toLocaleUpperCase("tr-TR");

// Words kept upper case when an ALL CAPS text is title-cased (folded form).
const UPPER = new Set(["kbb", "avm", "tvm", "toki", "sgk", "ptt", "afad", "tem", "kou", "ko mek", "komek", "seka", "osb", "gosb",
  "tcdd", "yht", "iskur", "isu", "izgaz", "d 100", "bp", "po", "tp", "atm", "kyk", "meb", "tubitak", "gtu", "shm", "dsi", "sedas",
  "ii", "iii", "iv", "vi", "vii", "viii", "ix", "xi", "xii", "xiii", "xiv", "xv", "xvi", "xvii", "xviii", "xix", "xx"]);
const LOWER = new Set(["ve", "ile", "veya"]);
/** "MİMAR SİNAN ORTAOKULU" -> "Mimar Sinan Ortaokulu" (Turkish casing; abbreviations stay upper case). */
function titleTr(s) {
  return squash(s)
    .split(" ")
    .map((w, i) => {
      const m = w.match(/^([^\p{L}\d]*)(.*?)([^\p{L}\d]*)$/u);
      const [, pre, core, post] = m ?? ["", "", w, ""];
      const key = fold(core);
      if (!core) return w;
      if (UPPER.has(key)) return pre + core.toLocaleUpperCase("tr-TR") + post;
      const lower = core.toLocaleLowerCase("tr-TR");
      if (i > 0 && LOWER.has(key)) return pre + lower + post;
      return pre + lower.replace(/(^|[-/(.])(\p{L})/gu, (_x, p, c) => p + c.toLocaleUpperCase("tr-TR")) + post;
    })
    .join(" ");
}
const cleanName = (s) => {
  const t = squash(s);
  if (!t || /^(null|-|\.|0)$/i.test(t)) return null;
  return (isCaps(t) ? titleTr(t) : t).slice(0, 200);
};

/** KBB address: title case when ALL CAPS, trailing "/ Kocaeli" dropped, null when empty or just the name. */
function cleanAddress(raw, name) {
  let t = squash(raw);
  if (!t || /^(null|-|\.|0)$/i.test(t)) return null;
  if (isCaps(t)) t = titleTr(t);
  t = t.replace(/\s*[/,-]?\s*(KOCAEL[İI]|Kocaeli)\s*\.?$/u, "").replace(/[\s,/-]+$/u, "").trim();
  if (!t || (name && fold(t) === fold(name))) return null;
  return t.slice(0, 300);
}

/** Every Turkish phone number in the fields -> "+90XXXXXXXXXX" (deduplicated, in order). */
function phonesOf(...values) {
  const out = [];
  for (const v of values) {
    for (const part of String(v ?? "").split(/[/;,]|\s-\s|\bve\b/)) {
      let d = part.replace(/\D/g, "");
      if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
      if (d.length === 12 && d.startsWith("90")) d = d.slice(2);
      if (d.length === 10 && /^[2-5]/.test(d)) out.push(`+90${d}`);
    }
  }
  return [...new Set(out)];
}
function emailOf(v) {
  const t = squash(v).toLocaleLowerCase("tr-TR");
  return t && t.length <= 200 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t) ? t : null;
}
function websiteOf(v) {
  let t = squash(v);
  if (!t || /^(null|-|\.|0)$/i.test(t)) return null;
  if (/^www\./i.test(t)) t = `https://${t}`;
  return t.length <= 500 && /^https?:\/\/\S+$/i.test(t) ? t : null;
}

// ---------------------------------------------------------------------------
// Coordinates: EPSG:5254 (TUREF / TM30) -> WGS84, inverse Transverse Mercator, Krüger series (4th order in n)
// ---------------------------------------------------------------------------
const TM = (() => {
  const a = 6378137;
  const f = 1 / 298.257222101; // GRS80
  const n = f / (2 - f);
  const n2 = n * n;
  const n3 = n2 * n;
  const n4 = n3 * n;
  return {
    lon0: 30,
    k0: 1,
    fe: 500000,
    fn: 0,
    A: (a / (1 + n)) * (1 + n2 / 4 + n4 / 64),
    beta: [n / 2 - (2 / 3) * n2 + (37 / 96) * n3 - (1 / 360) * n4, (1 / 48) * n2 + (1 / 15) * n3 - (437 / 1440) * n4,
      (17 / 480) * n3 - (37 / 840) * n4, (4397 / 161280) * n4],
    delta: [2 * n - (2 / 3) * n2 - 2 * n3 + (116 / 45) * n4, (7 / 3) * n2 - (8 / 5) * n3 - (227 / 45) * n4,
      (56 / 15) * n3 - (136 / 35) * n4, (4279 / 630) * n4],
  };
})();
function tm30ToWgs84(easting, northing) {
  const xi = (northing - TM.fn) / (TM.k0 * TM.A);
  const eta = (easting - TM.fe) / (TM.k0 * TM.A);
  let xp = xi;
  let ep = eta;
  for (let j = 1; j <= 4; j++) {
    xp -= TM.beta[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    ep -= TM.beta[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  }
  const chi = Math.asin(Math.sin(xp) / Math.cosh(ep));
  let phi = chi;
  for (let j = 1; j <= 4; j++) phi += TM.delta[j - 1] * Math.sin(2 * j * chi);
  return { lng: TM.lon0 + (Math.atan2(Math.sinh(ep), Math.cos(xp)) * 180) / Math.PI, lat: (phi * 180) / Math.PI };
}
function toWgs84(x, y, srid) {
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (srid === 5254) {
    if (x < 350000 || x > 650000 || y < 4400000 || y > 4700000) return null;
    return tm30ToWgs84(x, y);
  }
  if (srid === 4326) return x >= 28 && x <= 31.5 && y >= 40 && y <= 42 ? { lng: x, lat: y } : null;
  return null;
}
const round7 = (v) => Math.round(v * 1e7) / 1e7;

function distM(a, b) {
  const R = 6371008.8;
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
// Local metres (equirectangular at 40.8°N; fine for the 25 m / 3 km thresholds inside the province).
const KX = 111320 * Math.cos((40.8 * Math.PI) / 180);
const KY = 111050;
function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = x1 + t * dx - px;
  const qy = y1 + t * dy - py;
  return Math.sqrt(qx * qx + qy * qy);
}

// ---------------------------------------------------------------------------
// Districts: table + polygons (point in polygon, nearest polygon within 3 km)
// ---------------------------------------------------------------------------
const districts = await ro(`select id, name, kbb_ilce_id from public.districts order by sort`);
const boundaryRows = await ro(`select district_id, extensions.st_asgeojson(boundary, 7) as g from private.district_boundaries`);
if (districts.length !== 12 || boundaryRows.length !== 12) {
  console.error(`districts ${districts.length}, boundaries ${boundaryRows.length}: run the districts migration and seed-districts.mjs first`);
  process.exit(2);
}
const byIlce = new Map(districts.filter((d) => d.kbb_ilce_id != null).map((d) => [Number(d.kbb_ilce_id), d.id]));
const byDistrictName = new Map(districts.map((d) => [fold(d.name), d.id]));
const districtName = new Map(districts.map((d) => [d.id, d.name]));
const BOUNDS = boundaryRows.map((r) => {
  const g = typeof r.g === "string" ? JSON.parse(r.g) : r.g;
  const polys = g.type === "MultiPolygon" ? g.coordinates : [g.coordinates];
  let minx = Infinity;
  let miny = Infinity;
  let maxx = -Infinity;
  let maxy = -Infinity;
  for (const poly of polys) for (const [x, y] of poly[0]) {
    minx = Math.min(minx, x);
    miny = Math.min(miny, y);
    maxx = Math.max(maxx, x);
    maxy = Math.max(maxy, y);
  }
  return { id: r.district_id, polys, bbox: [minx, miny, maxx, maxy] };
});
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** {id, method: 'polygon' | 'near_polygon', m} or null (more than 3 km outside Kocaeli). */
function polygonDistrict(pt) {
  for (const d of BOUNDS) {
    const [minx, miny, maxx, maxy] = d.bbox;
    if (pt.lng < minx || pt.lng > maxx || pt.lat < miny || pt.lat > maxy) continue;
    for (const poly of d.polys) {
      if (!inRing(pt.lng, pt.lat, poly[0])) continue;
      if (poly.slice(1).some((hole) => inRing(pt.lng, pt.lat, hole))) continue;
      return { id: d.id, method: "polygon", m: 0 };
    }
  }
  const px = pt.lng * KX;
  const py = pt.lat * KY;
  let best = null;
  for (const d of BOUNDS) {
    const [minx, miny, maxx, maxy] = d.bbox;
    const pad = NEAR_POLYGON_M / KY;
    if (pt.lng < minx - pad * 1.4 || pt.lng > maxx + pad * 1.4 || pt.lat < miny - pad || pt.lat > maxy + pad) continue;
    for (const poly of d.polys) for (const ring of poly) {
      for (let i = 1; i < ring.length; i++) {
        const m = segDist(px, py, ring[i - 1][0] * KX, ring[i - 1][1] * KY, ring[i][0] * KX, ring[i][1] * KY);
        if (!best || m < best.m) best = { id: d.id, m };
      }
    }
  }
  return best && best.m <= NEAR_POLYGON_M ? { id: best.id, method: "near_polygon", m: best.m } : null;
}

// ---------------------------------------------------------------------------
// KBB files
// ---------------------------------------------------------------------------
const TARIHI_SUBKIND = [
  [/\bcesme/, "cesme"], [/\b(cami|camii|mescit|mescidi)\b/, "cami"], [/\b(kale|kalesi|hisar|hisari)\b/, "kale"],
  [/\bturbe/, "turbe"], [/\bhamam/, "hamam"], [/\bkulliye/, "kulliye"], [/\banit/, "anit"], [/\bkopru/, "kopru"],
  [/\bantik\b/, "antik_kent"],
];
const FUEL_BRANDS = [
  [/\bpetrol ofisi\b|\bpo\b/, "petrol_ofisi"], [/\bshell\b/, "shell"], [/\bopet\b/, "opet"], [/\btotal(energies)?\b/, "total"],
  [/\bbp\b/, "bp"], [/\bturkiye petrolleri\b|\btp\b/, "tp"], [/\blukoil\b/, "lukoil"], [/\balpet\b/, "alpet"],
  [/\baytemiz\b/, "aytemiz"], [/\bkadoil\b/, "kadoil"], [/\bmoil\b/, "moil"], [/\bturkuaz\b/, "turkuaz"], [/\bakpet\b/, "akpet"],
  [/\bsunpet\b/, "sunpet"], [/\bmepet\b/, "mepet"], [/\bpetline\b/, "petline"], [/\bgo\b/, "go"], [/\bnipet\b/, "nipet"],
  [/\bclas\b/, "clas"],
];
const firstRule = (rules, text) => rules.find(([re]) => re.test(text))?.[1] ?? null;

const nameExpand = {
  asm: (n) => squash(n.replace(/(^|\s)A\.?\s?S\.?\s?M\.?(?=\s|$|\))/giu, "$1Aile Sağlığı Merkezi")),
  acil: (n) => squash(n.replace(/\bAshi\b/g, "Acil Sağlık Hizmetleri İstasyonu")),
  cami: (n) => n.replace(/\bCami\b/g, "Camii"),
  toplanma: (n) => (/toplanma/i.test(fold(n)) ? n : `${n} Toplanma Alanı`),
};

/** key = the ref prefix; kind; category(name, props) for places / institutions. */
const FILES = [
  { key: "eczane", path: "eczane/eczane.json", kind: "pharmacy", seedKeyed: true },
  { key: "cami", path: "cami/camiler.json", kind: "mosque", seedKeyed: true },
  { key: "petrol", path: "petrol/petrol-istasyonlar.json", kind: "fuel" },
  { key: "taksi", path: "taksi/taksi_duraklar.json", kind: "taxi" },
  { key: "polis", path: "polis/polis-merkezleri.json", kind: "institution", category: () => "emniyet" },
  { key: "asm", path: "aile-sagligi/aile_sagligi_merkezleri.json", kind: "institution",
    category: (n) => (/saglikli hayat|toplum sagligi/.test(fold(n)) ? "toplum_sagligi" : "aile_sagligi_merkezi") },
  { key: "acil", path: "acil-saglik/acil-salk-hizmetleri.json", kind: "institution",
    category: (n) => (fold(n).includes("egitim") ? "egitim_kurumu" : "acil_saglik") },
  { key: "komek", path: "komek/komek-kurs-merkezi.xls.json", kind: "institution", category: () => "egitim_kurumu" },
  { key: "kultur", path: "kultur-merkezi/kultur-merkezleri-ve-sanat-galerileri.json", kind: "place", category: () => "kultur" },
  { key: "tarihi", path: "muze/tarihi-yaplar-ve-muzeler.xls.json", kind: "place", seedKeyed: true,
    category: (n, p) => (Number(p.alt_tur_id) === 313 || /\bmuze/.test(fold(n)) ? "muze" : "tarihi") },
  { key: "millet", path: "millet-bahcesi/millet-bahcesi.json", kind: "place", category: () => "park" },
  { key: "plaj", path: "plajlar/plajlar.json", kind: "place", category: () => "sahil" },
  { key: "otopark", path: "otopark/ucretsiz_otoparklar.json", kind: "place", category: () => "otopark" },
  { key: "toplanma", path: "acil-toplanma-afet/acil-toplanma-alanlar.json", kind: "place", category: () => "toplanma_alani" },
];

/** GeoJSON (crs EPSG:5254 / 4326) or ESRI JSON (spatialReference wkid 5254 / 4326) -> [{p, x, y, srid}]. */
function loadFeatures(path) {
  const j = JSON.parse(readFileSync(join(DATA, path), "utf8").replace(/^﻿/, ""));
  if (j.type === "FeatureCollection") {
    const crs = String(j.crs?.properties?.name ?? "EPSG:4326");
    const srid = /5254/.test(crs) ? 5254 : /4326|CRS84/i.test(crs) ? 4326 : null;
    if (!srid) throw new Error(`${path}: unknown CRS ${crs}`);
    return j.features.map((f) => ({ p: f.properties ?? {}, x: f.geometry?.coordinates?.[0], y: f.geometry?.coordinates?.[1], srid }));
  }
  if (Array.isArray(j.features)) {
    const wkid = Number(j.spatialReference?.latestWkid ?? j.spatialReference?.wkid);
    const srid = wkid === 5254 ? 5254 : wkid === 4326 ? 4326 : null;
    if (!srid) throw new Error(`${path}: unknown spatialReference ${wkid}`);
    return j.features.map((f) => ({ p: f.attributes ?? {}, x: f.geometry?.x, y: f.geometry?.y, srid }));
  }
  throw new Error(`${path}: neither GeoJSON nor ESRI JSON`);
}

const fileStats = new Map(); // key -> {kind, srid, read, noName, noId, badCoord, duplicate, outside, attrDiffers, near}
const records = [];
const tmChecks = []; // {rec index, x, y} for the PostGIS comparison
let petrolXYMax = 0;

function stat(key, kind, srid) {
  if (!fileStats.has(key)) fileStats.set(key, { kind, srid, read: 0, noName: 0, noId: 0, badCoord: 0, duplicate: 0, outside: 0, attrDistrict: 0, attrDiffers: 0, near: 0 });
  return fileStats.get(key);
}

/** District of a record: the attribute, else the polygon. Returns null (not imported) when outside Kocaeli. */
function placeRecord(rec, attrDistrict, st) {
  const poly = polygonDistrict(rec);
  if (!poly) {
    st.outside++;
    return false;
  }
  if (poly.method === "near_polygon") st.near++;
  rec.polyDistrict = poly.id;
  rec.polyMethod = poly.method;
  rec.district = attrDistrict ?? poly.id;
  rec.districtBy = attrDistrict ? "attribute" : poly.method;
  if (attrDistrict) {
    st.attrDistrict++;
    if (attrDistrict !== poly.id) st.attrDiffers++;
  }
  return true;
}

const seenRefs = new Set();
for (const spec of FILES) {
  if (ONLY && !ONLY.has(spec.key)) continue;
  const feats = loadFeatures(spec.path);
  const st = stat(spec.key, spec.kind, feats[0]?.srid ?? null);
  for (const f of feats) {
    st.read++;
    const p = f.p;
    let name = cleanName(p.adi);
    if (name && nameExpand[spec.key]) name = nameExpand[spec.key](name);
    if (!name) {
      st.noName++;
      continue;
    }
    const hasPoi = p.poi_id !== null && p.poi_id !== undefined && String(p.poi_id).trim() !== "";
    const id = hasPoi ? String(p.poi_id).trim() : p.objectid != null ? `o${p.objectid}` : null;
    if (!id) {
      st.noId++;
      continue;
    }
    const ref = `${spec.key}:${id}`;
    if (seenRefs.has(ref)) {
      st.duplicate++;
      continue;
    }
    const pt = toWgs84(f.x, f.y, f.srid);
    if (!pt) {
      st.badCoord++;
      continue;
    }
    if (spec.key === "petrol" && typeof p.X === "number" && typeof p.Y === "number") {
      petrolXYMax = Math.max(petrolXYMax, distM(pt, { lng: p.X, lat: p.Y }));
    }
    const rec = {
      file: spec.key, ref, refs: [ref], kind: spec.kind, name, lng: pt.lng, lat: pt.lat, srid: f.srid,
      address: cleanAddress(p.adres, name), email: emailOf(p.eposta), website: websiteOf(p.url), details: {},
    };
    // The ASM file's mahalle is only a matching hint (never written): KBB names an ASM after its doctor, the city guide
    // after its mahalle ("Gebze Mevlana ASM").
    if (spec.key === "asm" && p.MAHALLE) rec.mahalleHint = fold(p.MAHALLE).replace(/ (mahallesi|mah|mh)$/, "");
    // seed-poi.mjs keyed pharmacies / mosques / historic sites by poi_id ?? objectid.
    if (spec.seedKeyed && hasPoi && p.objectid != null) rec.refs.push(`${spec.key}:${p.objectid}`);
    const phones = phonesOf(p.telefon, p.telefon_2);
    rec.phone = phones[0] ?? null;
    if (phones.length > 1) rec.details.phones = phones;
    if (spec.category) {
      const category = spec.category(name, p);
      rec.details.category = category;
      if (spec.kind === "institution") rec.details.ownership = "devlet";
      if (category === "tarihi") {
        const sub = firstRule(TARIHI_SUBKIND, fold(name));
        if (sub) rec.details.subkind = sub;
      }
      if (spec.key === "plaj") rec.details.subkind = "plaj";
      if (spec.key === "otopark") rec.details.fee = "Ücretsiz";
    }
    if (spec.kind === "fuel") {
      const brand = firstRule(FUEL_BRANDS, fold(name));
      if (brand) rec.details.brand = brand;
    }
    const ilceName = p.ILCE_AD ?? p.ILCE_ADI;
    const attrDistrict = p.ilce_id != null ? byIlce.get(Number(p.ilce_id)) ?? null : ilceName ? byDistrictName.get(fold(ilceName)) ?? null : null;
    if (!placeRecord(rec, attrDistrict, st)) continue;
    seenRefs.add(ref);
    if (f.srid === 5254) tmChecks.push({ i: records.length, x: f.x, y: f.y });
    records.push(rec);
  }
}

// ---------------------------------------------------------------------------
// GTFS (toplu-ulasim): stops, KocaeliKart points, routes, geometric route -> stop links
// ---------------------------------------------------------------------------
function readCsv(file) {
  const path = join(DATA, "toplu-ulasim", file);
  if (!existsSync(path)) return null;
  const lines = readFileSync(path, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.length);
  const head = lines[0].split(",").map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = [];
    let cur = "";
    let quoted = false;
    const l = lines[i];
    for (let k = 0; k < l.length; k++) {
      const c = l[k];
      if (quoted) {
        if (c === '"' && l[k + 1] === '"') {
          cur += '"';
          k++;
        } else if (c === '"') quoted = false;
        else cur += c;
      } else if (c === '"') quoted = true;
      else if (c === ",") {
        cells.push(cur);
        cur = "";
      } else cur += c;
    }
    cells.push(cur);
    const o = {};
    head.forEach((h, idx) => (o[h] = (cells[idx] ?? "").trim()));
    rows.push(o);
  }
  return rows;
}
const nul = (v) => (v === undefined || v === null || /^(null)?$/i.test(String(v).trim()) ? null : String(v).trim());

let gtfsRoutes = [];
let gtfsLinks = [];
const transitStats = {};
if (!ONLY || ONLY.has("durak")) {
  const stops = readCsv("stops.txt") ?? [];
  const st = stat("durak", "bus_stop", 4326);
  for (const s of stops) {
    st.read++;
    if (s.location_type && s.location_type !== "0") {
      st.noId++; // stations (location_type 1) are not boarding points
      continue;
    }
    const name = cleanName(s.stop_name) ?? "Otobüs Durağı";
    const id = nul(s.stop_id);
    if (!id || !/^[A-Za-z0-9_.-]{1,40}$/.test(id)) {
      st.noId++;
      continue;
    }
    const ref = `durak:${id}`;
    if (seenRefs.has(ref)) {
      st.duplicate++;
      continue;
    }
    const pt = toWgs84(Number(s.stop_lon), Number(s.stop_lat), 4326);
    if (!pt) {
      st.badCoord++;
      continue;
    }
    const details = { stop_id: id };
    if (s.wheelchair_boarding === "1") details.wheelchair = true;
    if (s.wheelchair_boarding === "2") details.wheelchair = false;
    const rec = { file: "durak", ref, refs: [ref], kind: "bus_stop", name, lng: pt.lng, lat: pt.lat, srid: 4326, address: null,
      phone: null, email: null, website: null, details, stopId: id };
    if (!placeRecord(rec, null, st)) continue;
    seenRefs.add(ref);
    records.push(rec);
  }
}
if (!ONLY || ONLY.has("kocaelikart")) {
  const kiosks = readCsv("places.txt") ?? [];
  const st = stat("kocaelikart", "place", 4326);
  const COMPANY = /\b(ltd|sti|a s|as|koop|kooperatif|kooperatifi|belediye|belediyesi|tic|san|limited|anonim|vakfi|dernegi|mudurlugu|holding|sirketi)\b/;
  for (const k of kiosks) {
    st.read++;
    const kiosk = nul(k.kiosk_no);
    const term = nul(k.term_no);
    if (!kiosk) {
      st.noId++;
      continue;
    }
    const ref = `kocaelikart:${kiosk}${term ? `-${term}` : ""}`;
    if (!/^kocaelikart:[A-Za-z0-9_.-]{1,60}$/.test(ref)) {
      st.noId++;
      continue;
    }
    if (seenRefs.has(ref)) {
      st.duplicate++;
      continue;
    }
    const pt = toWgs84(Number(k.lon), Number(k.lat), 4326);
    if (!pt) {
      st.badCoord++;
      continue;
    }
    const name = cleanName(nul(k.title)) ?? "KocaeliKart Dolum Noktası";
    const owner = nul(k.owner);
    const details = { category: "kocaelikart", kiosk_no: kiosk };
    if (term) details.term_no = term;
    if (nul(k.term_type) !== null && /^\d+$/.test(k.term_type)) details.term_type = Number(k.term_type);
    if (owner && COMPANY.test(fold(owner))) details.owner = cleanName(owner);
    const rec = { file: "kocaelikart", ref, refs: [ref], kind: "place", name, lng: pt.lng, lat: pt.lat, srid: 4326,
      address: cleanAddress(nul(k.address), name), phone: null, email: null, website: null, details };
    if (!placeRecord(rec, null, st)) continue;
    seenRefs.add(ref);
    records.push(rec);
  }
}

// ---------------------------------------------------------------------------
// Match against the stored rows
// ---------------------------------------------------------------------------
const STOP = new Set(["mahallesi", "mah", "mh", "ve", "kocaeli", "tarihi", "ile", "belediyesi", ...districts.map((d) => fold(d.name))]);
const GENERIC = {
  pharmacy: ["eczanesi", "eczane"],
  mosque: ["camii", "cami", "camisi", "mescidi", "mescit"],
  taxi: ["taksi", "taxi", "duragi", "durak", "taksi duragi"],
  fuel: ["petrol", "petrolleri", "petrolculuk", "akaryakit", "istasyonu", "istasyon", "ltd", "sti", "tic", "san", "as", "a", "s",
    "ofisi", "po", "opet", "shell", "bp", "total", "totalenergies", "lukoil", "alpet", "aytemiz", "kadoil", "moil", "turkuaz", "akpet",
    "sunpet", "mepet", "petline", "tp", "turkiye", "energy", "nipet", "clas", "go", "dagitim", "urunleri", "otomotiv", "insaat"],
  bus_stop: ["durak", "duragi", "otobus", "bus"],
  institution: ["merkezi", "mudurlugu", "amirligi", "polis", "karakolu", "aile", "sagligi", "asm", "nolu", "no", "acil", "saglik",
    "hizmetleri", "istasyonu", "ashi", "ko", "mek", "komek", "kurs", "ilce", "emniyet"],
  place: ["kultur", "merkezi", "sanat", "galerisi", "salonu", "millet", "bahcesi", "parki", "park", "plaji", "plaj", "halk", "otopark",
    "otoparki", "ucretsiz", "toplanma", "alani", "kocaelikart", "dolum", "noktasi"],
};
for (const k of Object.keys(GENERIC)) GENERIC[k] = new Set(GENERIC[k]);
const TYPE = {};
for (const [base, forms] of Object.entries({
  cami: ["cami", "camii", "camisi", "mescit", "mescidi"], kulliye: ["kulliye", "kulliyesi"], turbe: ["turbe", "turbesi"],
  hamam: ["hamam", "hamami"], cesme: ["cesme", "cesmesi"], kale: ["kale", "kalesi"], park: ["park", "parki"],
  bahce: ["bahce", "bahcesi"], muze: ["muze", "muzesi"], anit: ["anit", "aniti"], kopru: ["kopru", "koprusu"],
  konak: ["konak", "konagi"], plaj: ["plaj", "plaji"], otopark: ["otopark", "otoparki"], okul: ["ilkokulu", "ortaokulu", "lisesi", "okulu"],
})) for (const f of forms) TYPE[f] = base;

const mainName = (s) => String(s ?? "").replace(/\(.*?\)/g, " ");
/** "s s k" (from "S.S.K.") -> "ssk": runs of single letters are one abbreviation. */
function joinInitials(tokens) {
  const out = [];
  let run = "";
  for (const t of tokens) {
    if (/^[a-z]$/.test(t)) {
      run += t;
      continue;
    }
    if (run) out.push(run);
    run = "";
    out.push(t);
  }
  if (run) out.push(run);
  return out;
}
const coreTokens = (name, kind) => joinInitials(fold(mainName(name)).split(" ").filter(Boolean)).filter((t) => !STOP.has(t) && !GENERIC[kind]?.has(t));
/** Every distinctive word of the shorter name is in the longer one (numbers and building types must agree). */
function containedName(a, b, kind) {
  const ta = coreTokens(a, kind);
  const tb = coreTokens(b, kind);
  if (!ta.length || !tb.length) return false;
  const ya = new Set(fold(a).split(" ").map((t) => TYPE[t]).filter(Boolean));
  const yb = new Set(fold(b).split(" ").map((t) => TYPE[t]).filter(Boolean));
  if (ya.size && yb.size && ![...ya].some((t) => yb.has(t))) return false;
  const na = ta.filter((t) => /^\d+$/.test(t)).join(",");
  const nb = tb.filter((t) => /^\d+$/.test(t)).join(",");
  if (na !== nb) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return short.every((t) => long.includes(t));
}
const isGeneric = (name, kind) => coreTokens(name, kind).length === 0;
function bigrams(s) {
  const out = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}
function dice(a, b) {
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.length || !B.length) return a === b ? 1 : 0;
  const counts = new Map();
  for (const g of A) counts.set(g, (counts.get(g) ?? 0) + 1);
  let hit = 0;
  for (const g of B) {
    const n = counts.get(g) ?? 0;
    if (n > 0) {
      hit++;
      counts.set(g, n - 1);
    }
  }
  return (2 * hit) / (A.length + B.length);
}
/** Name similarity 0..1 (0 = no match): identical main names, or the distinctive words (generic words dropped). */
function nameScore(a, b, kind) {
  const fa = fold(mainName(a));
  const fb = fold(mainName(b));
  if (fa && fa === fb) return 1;
  const ta = coreTokens(a, kind);
  const tb = coreTokens(b, kind);
  if (!ta.length || !tb.length) return 0;
  const ya = new Set(fold(a).split(" ").map((t) => TYPE[t]).filter(Boolean));
  const yb = new Set(fold(b).split(" ").map((t) => TYPE[t]).filter(Boolean));
  if (ya.size && yb.size && ![...ya].some((t) => yb.has(t))) return 0;
  const na = ta.filter((t) => /^\d+$/.test(t)).join(",");
  const nb = tb.filter((t) => /^\d+$/.test(t)).join(",");
  if (na && nb && na !== nb) return 0;
  const ca = ta.join(" ");
  const cb = tb.join(" ");
  if (ca === cb) return 1;
  const d = dice(ca, cb);
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const contained = short.every((t) => long.includes(t));
  return d >= 0.6 || (contained && d >= 0.5) ? d : 0;
}
const CATEGORY_GROUP = {
  tarihi: "tarihi", muze: "tarihi", park: "park", tabiat_parki: "park", doga: "park", kultur: "kultur", sahil: "sahil",
  otopark: "otopark", toplanma_alani: "toplanma_alani", kocaelikart: "kocaelikart",
  emniyet: "emniyet", aile_sagligi_merkezi: "asm", toplum_sagligi: "asm", acil_saglik: "acil_saglik", egitim_kurumu: "egitim",
};
const groupOf = (kind, category) => (kind === "place" || kind === "institution" ? CATEGORY_GROUP[category ?? ""] ?? `other:${category ?? "-"}` : kind);

function distanceRule(rec, e, d) {
  const ga = isGeneric(rec.name, rec.kind);
  const gb = isGeneric(e.name, rec.kind);
  if (rec.kind === "bus_stop") return d <= 15 || ((ga || gb) && d <= 30);
  if (rec.kind === "taxi") return (ga || gb) && d <= 60;
  if (rec.kind === "fuel") return ((ga || gb) && d <= 80) || (!!rec.details.brand && rec.details.brand === e.brand && d <= MERGE_M);
  return false;
}

const existing = (await ro(`select id, kind, name, slug, source, source_ref, lat, lng, locked, hidden, missing_since is not null as sync_hidden,
  district_id, details ->> 'category' as category, details ->> 'brand' as brand, details ->> 'kbb_ref' as kbb_ref,
  details ->> 'import' as import_mark, details ? 'photos' as has_photos
  from public.poi where source <> 'demo'`)).map((e) => ({ ...e, lat: e.lat == null ? null : Number(e.lat), lng: e.lng == null ? null : Number(e.lng) }));
const takenSlugs = new Set((await ro(`select slug from public.poi`)).map((r) => r.slug));
const bySourceRef = new Map(existing.filter((e) => e.source === "kbb").map((e) => [e.source_ref, e]));
const byKbbRef = new Map(existing.filter((e) => e.kbb_ref).map((e) => [e.kbb_ref, e]));

const claimed = new Set();
const conflicts = [];
// Pass 1: own key / earlier merge.
for (const rec of records) {
  for (const ref of rec.refs) {
    const e = bySourceRef.get(ref) ?? byKbbRef.get(ref);
    if (!e || claimed.has(e.id)) continue;
    if (e.kind !== rec.kind) {
      conflicts.push(`${rec.ref}: stored as ${e.kind}, record is ${rec.kind}`);
      continue;
    }
    rec.plan = { action: e.source === "kbb" && e.source_ref === ref ? "key" : "link", target: e };
    claimed.add(e.id);
    break;
  }
}
// Pass 2: intra-import duplicates (places / institutions of two files at the same spot) - the first file wins.
const byGroup = new Map();
for (const rec of records) {
  if (rec.plan || (rec.kind !== "place" && rec.kind !== "institution")) continue;
  const g = groupOf(rec.kind, rec.details.category);
  if (g === "kocaelikart" || g === "toplanma_alani") continue;
  if (!byGroup.has(g)) byGroup.set(g, []);
  byGroup.get(g).push(rec);
}
for (const list of byGroup.values()) {
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.plan) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (b.plan || b.file === a.file || distM(a, b) > 50 || nameScore(a.name, b.name, a.kind) < 0.8) continue;
      b.plan = { action: "dup", target: null, of: a.ref };
    }
  }
}
// Pass 3: stored rows of the same kind / category group: similar name within 120 m, generic names by distance; stored
// rows without a pin: a near-identical name in the same district. Best pairs first, one to one.
const candidates = new Map();
for (const e of existing) {
  if (claimed.has(e.id) || e.hidden) continue;
  const g = groupOf(e.kind, e.category);
  if (!candidates.has(g)) candidates.set(g, []);
  candidates.get(g).push(e);
}
const pairs = [];
for (const rec of records) {
  if (rec.plan) continue;
  for (const e of candidates.get(groupOf(rec.kind, rec.details.category)) ?? []) {
    if (e.lat === null || e.lng === null) {
      if (e.district_id !== rec.district) continue;
      const s = nameScore(rec.name, e.name, rec.kind);
      if (s >= 0.85) pairs.push({ rec, e, score: s, d: null, rule: "name, no pin" });
      continue;
    }
    const d = distM(rec, e);
    if (d >= MERGE_M) continue;
    const s = nameScore(rec.name, e.name, rec.kind);
    // Two stops further apart than 60 m are two stops, unless they have the same name (a big terminal, a misplaced pin).
    if (rec.kind === "bus_stop" && d >= MERGE_STOP_M && s < 1) continue;
    if (s > 0) pairs.push({ rec, e, score: s + 0.2 * (1 - d / MERGE_M), d, rule: `name ${s.toFixed(2)}` });
    else if (distanceRule(rec, e, d)) pairs.push({ rec, e, score: 0.3 + 0.2 * (1 - d / MERGE_M), d, rule: "distance" });
    // "Gebze Güzeller Teçsev Ayşe İlhan ASM" ~ "Gebze Güzeller ASM", "Gebze S.S.K. Hastanesi Taksi Durağı" ~ "SSK Taksi".
    else if (d <= 60 && containedName(rec.name, e.name, rec.kind)) pairs.push({ rec, e, score: 0.45 + 0.2 * (1 - d / MERGE_M), d, rule: "contained" });
    // An ASM named after its doctor at the same spot as a stored ASM named after the record's mahalle.
    else if (d <= 10 && rec.mahalleHint && ` ${fold(e.name)} `.includes(` ${rec.mahalleHint} `)) pairs.push({ rec, e, score: 0.4, d, rule: "same spot + mahalle" });
  }
}
pairs.sort((a, b) => b.score - a.score || (a.d ?? 1e9) - (b.d ?? 1e9));
for (const p of pairs) {
  if (p.rec.plan || claimed.has(p.e.id)) continue;
  p.rec.plan = { action: "merge", target: p.e, rule: p.rule, d: p.d };
  claimed.add(p.e.id);
}
// --show-merges also lists near misses: a record that becomes a new row although an unmatched stored row of the same
// kind / category group lies within 150 m (possible duplicates to check by hand; pharmacy names are not printed).
const nearMisses = [];
if (SHOW) {
  for (const rec of records) {
    if (rec.plan) continue;
    for (const e of candidates.get(groupOf(rec.kind, rec.details.category)) ?? []) {
      if (claimed.has(e.id) || e.lat === null || e.lng === null) continue;
      const d = distM(rec, e);
      if (d < 150) nearMisses.push({ rec, e, d });
    }
  }
}
// Utility places wait for --utility-places (see the usage notes); matches into stored rows still happen.
const UTILITY_FILES = new Set(["kocaelikart", "toplanma", "otopark"]);
if (!UTILITY) for (const rec of records) if (!rec.plan && UTILITY_FILES.has(rec.file)) rec.plan = { action: "deferred", target: null };
// New rows: slugs (unique across all POIs; stored rows keep theirs). A taken name gets the district, then a number.
const SLUG_PREFIX = { taxi: "taksi-", bus_stop: "durak-", fuel: "akaryakit-" };
for (const rec of records) {
  if (rec.plan) continue;
  let core = rec.name;
  if (rec.kind === "taxi") core = core.replace(/taksi|durağı|duragi/giu, " ");
  if (rec.kind === "fuel") core = core.replace(/akaryakıt istasyonu/giu, " ");
  const prefix = rec.file === "kocaelikart" ? "kocaelikart-" : SLUG_PREFIX[rec.kind] ?? "";
  const base = `${prefix}${trSlug(core) || (rec.kind === "taxi" ? "duragi" : "nokta")}`.replace(/-+$/, "");
  let s = base;
  if (takenSlugs.has(s)) s = `${base}-${rec.district}`;
  let i = 2;
  while (takenSlugs.has(s)) s = `${base}-${rec.district}-${i++}`;
  takenSlugs.add(s);
  rec.slug = s;
  rec.plan = { action: "new", target: null };
}

// ---------------------------------------------------------------------------
// GTFS routes + geometric links (only for stops that are imported)
// ---------------------------------------------------------------------------
if (!ONLY || ONLY.has("durak")) {
  const routes = readCsv("routes.txt") ?? [];
  const agencies = new Map((readCsv("agency.txt") ?? []).map((a) => [a.agency_id, squash(a.agency_name)]));
  const MODE = { 0: "Tramvay", 3: "Otobüs", 4: "Feribot", 6: "Teleferik", 7: "Teleferik" };
  const hex = (v) => (/^[0-9A-Fa-f]{6}$/.test(v ?? "") ? v.toUpperCase() : null);
  gtfsRoutes = routes
    .filter((r) => /^[A-Za-z0-9_.:-]{1,40}$/.test(r.route_id) && squash(r.route_short_name || r.route_long_name))
    .map((r) => {
      const type = /^\d+$/.test(r.route_type) ? Number(r.route_type) : 3;
      const desc = squash(r.route_desc);
      const modeWord = /^(otob[uü]s|tramvay|feribot|teleferik)$/i.test(fold(desc).replace(/ /g, ""));
      return {
        route_id: r.route_id,
        agency_id: nul(r.agency_id),
        agency_name: agencies.get(r.agency_id) ?? null,
        short_name: squash(r.route_short_name || r.route_long_name).slice(0, 40),
        long_name: squash(r.route_long_name) || null,
        route_type: type,
        description: modeWord || !desc ? MODE[type] ?? null : desc.slice(0, 200),
        color: hex(r.route_color),
        text_color: hex(r.route_text_color),
      };
    });
  transitStats.routes = gtfsRoutes.length;
  transitStats.routeTypes = gtfsRoutes.reduce((m, r) => ((m[r.description ?? r.route_type] = (m[r.description ?? r.route_type] ?? 0) + 1), m), {});
  transitStats.agencies = new Set(gtfsRoutes.map((r) => r.agency_id)).size;

  const routeIdx = new Map(gtfsRoutes.map((r, i) => [r.route_id, i]));
  const shapesOfRoute = new Map();
  for (const t of readCsv("trips.txt") ?? []) {
    if (!routeIdx.has(t.route_id) || !t.shape_id) continue;
    if (!shapesOfRoute.has(t.route_id)) shapesOfRoute.set(t.route_id, new Set());
    shapesOfRoute.get(t.route_id).add(t.shape_id);
  }
  const shapes = new Map();
  for (const p of readCsv("shapes.txt") ?? []) {
    if (!shapes.has(p.shape_id)) shapes.set(p.shape_id, []);
    shapes.get(p.shape_id).push({ seq: Number(p.shape_pt_sequence), x: Number(p.shape_pt_lon) * KX, y: Number(p.shape_pt_lat) * KY });
  }
  for (const pts of shapes.values()) pts.sort((a, b) => a.seq - b.seq);
  // Segment grid (100 m cells); each segment is registered in every cell its 25 m buffer touches.
  const CELL = 100;
  const cellKey = (ix, iy) => ix * 100000 + iy;
  const grid = new Map();
  const segs = [];
  let used = 0;
  let skipped = 0;
  for (const [routeId, shapeIds] of shapesOfRoute) {
    const ri = routeIdx.get(routeId);
    for (const sid of shapeIds) {
      const pts = shapes.get(sid) ?? [];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len > MAX_SEGMENT_M) {
          skipped++;
          continue;
        }
        used++;
        const si = segs.length;
        segs.push([a.x, a.y, b.x, b.y, ri]);
        const x0 = Math.floor((Math.min(a.x, b.x) - LINK_M) / CELL);
        const x1 = Math.floor((Math.max(a.x, b.x) + LINK_M) / CELL);
        const y0 = Math.floor((Math.min(a.y, b.y) - LINK_M) / CELL);
        const y1 = Math.floor((Math.max(a.y, b.y) + LINK_M) / CELL);
        for (let ix = x0; ix <= x1; ix++) for (let iy = y0; iy <= y1; iy++) {
          const k = cellKey(ix, iy);
          const list = grid.get(k);
          if (list) {
            if (list[list.length - 1] !== si) list.push(si);
          } else grid.set(k, [si]);
        }
      }
    }
  }
  const perRoute = new Map();
  let stopsWithRoute = 0;
  for (const rec of records) {
    if (rec.kind !== "bus_stop" || !rec.stopId || rec.plan?.action === "dup") continue;
    const px = rec.lng * KX;
    const py = rec.lat * KY;
    const best = new Map();
    for (const si of grid.get(cellKey(Math.floor(px / CELL), Math.floor(py / CELL))) ?? []) {
      const [x1, y1, x2, y2, ri] = segs[si];
      const d = segDist(px, py, x1, y1, x2, y2);
      if (d <= LINK_M && d < (best.get(ri) ?? Infinity)) best.set(ri, d);
    }
    if (best.size) stopsWithRoute++;
    for (const [ri, d] of best) {
      const routeId = gtfsRoutes[ri].route_id;
      gtfsLinks.push({ route_id: routeId, stop_id: rec.stopId, distance_m: Math.round(d * 10) / 10 });
      perRoute.set(routeId, (perRoute.get(routeId) ?? 0) + 1);
    }
  }
  const counts = [...perRoute.values()].sort((a, b) => a - b);
  transitStats.segmentsUsed = used;
  transitStats.segmentsSkipped = skipped;
  transitStats.links = gtfsLinks.length;
  transitStats.routesWithStops = perRoute.size;
  transitStats.routesWithoutStops = gtfsRoutes.length - perRoute.size;
  transitStats.stopsWithRoute = stopsWithRoute;
  transitStats.stopsPerRouteMedian = counts.length ? counts[Math.floor(counts.length / 2)] : 0;
  transitStats.stopsPerRouteMax = counts.length ? counts[counts.length - 1] : 0;
}

// ---------------------------------------------------------------------------
// Conversion checks
// ---------------------------------------------------------------------------
const quant = (arr, q) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * q))] : null);
const fmt = (v, d = 2) => (v === null || v === undefined ? "-" : Number(v).toFixed(d));
const checks = { tm: null, stored: {}, merges: {} };
if (tmChecks.length) {
  const diffs = [];
  for (let i = 0; i < tmChecks.length; i += 1500) {
    const part = tmChecks.slice(i, i + 1500);
    const values = part.map((c, k) => `(${k}, ${c.x}::float8, ${c.y}::float8)`).join(",");
    const rows = await ro(`select v.i, extensions.st_x(t.g) as lng, extensions.st_y(t.g) as lat
      from (values ${values}) as v(i, x, y)
      cross join lateral (select extensions.st_transform(extensions.st_setsrid(extensions.st_makepoint(v.x, v.y), 5254), 4326) as g) t`);
    for (const r of rows) {
      const rec = records[part[r.i].i];
      diffs.push(distM(rec, { lng: Number(r.lng), lat: Number(r.lat) }));
    }
  }
  diffs.sort((a, b) => a - b);
  checks.tm = { n: diffs.length, max: diffs[diffs.length - 1], p99: quant(diffs, 0.99), mean: diffs.reduce((s, x) => s + x, 0) / diffs.length };
}
for (const rec of records) {
  const e = rec.plan?.target;
  if (!e || e.lat === null) continue;
  const d = distM(rec, e);
  if (rec.plan.action === "key" || rec.plan.action === "link") {
    const k = `${rec.file} (${rec.plan.action})`;
    (checks.stored[k] ??= []).push(d);
  } else if (rec.plan.action === "merge") {
    (checks.merges[rec.file] ??= []).push(d);
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
const tally = (list, f) => {
  const m = {};
  for (const r of list) {
    const k = f(r) ?? "(none)";
    m[k] = (m[k] ?? 0) + 1;
  }
  return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ");
};
const act = (list, a) => list.filter((r) => r.plan?.action === a).length;
console.log(`${DRY ? "DRY RUN (nothing written)" : "IMPORT"} - Kocaeli open data from ${DATA}`);
console.log(`districts ${districts.length}, boundaries ${BOUNDS.length}; stored POIs read ${existing.length} (demo rows ignored)\n`);

console.log("files (records read -> imported; skipped: no name / no id / bad coordinate / duplicate key / outside Kocaeli):");
console.log(`${pad("file", 12)}${pad("kind", 12)}${padL("srid", 5)}${padL("read", 6)}${padL("ok", 6)}${padL("noName", 7)}${padL("noId", 6)}${padL("badXY", 6)}${padL("dupKey", 7)}${padL("outside", 8)}${padL("near", 5)}${padL("attrDist", 9)}${padL("attr!=poly", 11)}`);
for (const [key, s] of fileStats) {
  const ok = records.filter((r) => r.file === key).length;
  console.log(`${pad(key, 12)}${pad(s.kind, 12)}${padL(s.srid ?? "-", 5)}${padL(s.read, 6)}${padL(ok, 6)}${padL(s.noName, 7)}${padL(s.noId, 6)}${padL(s.badCoord, 6)}${padL(s.duplicate, 7)}${padL(s.outside, 8)}${padL(s.near, 5)}${padL(s.attrDistrict, 9)}${padL(s.attrDiffers, 11)}`);
}

console.log("\nconversion checks:");
if (checks.tm) {
  console.log(`  EPSG:5254 -> WGS84, own inverse TM vs PostGIS ST_Transform: ${checks.tm.n} points, max ${fmt(checks.tm.max, 4)} m, p99 ${fmt(checks.tm.p99, 4)} m, mean ${fmt(checks.tm.mean, 5)} m`);
}
console.log(`  petrol X/Y columns vs its geometry: max ${fmt(petrolXYMax, 3)} m`);
for (const [k, list] of Object.entries(checks.stored)) {
  list.sort((a, b) => a - b);
  console.log(`  stored rows with the same key, ${k}: ${list.length}, distance median ${fmt(quant(list, 0.5))} m, max ${fmt(list[list.length - 1])} m`);
}
for (const [k, list] of Object.entries(checks.merges)) {
  list.sort((a, b) => a - b);
  console.log(`  merged into stored rows (other sources), ${k}: ${list.length}, distance median ${fmt(quant(list, 0.5), 0)} m, p90 ${fmt(quant(list, 0.9), 0)} m`);
}
const byMethod = tally(records, (r) => r.districtBy);
console.log(`  district taken from: ${byMethod}`);
console.log(`  points inside a district polygon: ${records.filter((r) => r.polyMethod === "polygon").length} of ${records.length}; within 3 km of one (shore, piers): ${records.filter((r) => r.polyMethod === "near_polygon").length}; more than 3 km outside Kocaeli (not imported): ${[...fileStats.values()].reduce((s, x) => s + x.outside, 0)}`);
if (conflicts.length) console.log(`  key conflicts (${conflicts.length}): ${conflicts.slice(0, 10).join("; ")}`);

console.log("\nmerge plan (key = same KBB key already stored, link = earlier merge, merge = matched to a stored row of another source, new, dup = same place in an earlier file, later = utility place waiting for --utility-places):");
console.log(`${pad("file", 12)}${padL("total", 6)}${padL("key", 6)}${padL("link", 6)}${padL("merge", 7)}${padL("new", 6)}${padL("dup", 5)}${padL("later", 7)}   merge rules`);
for (const key of fileStats.keys()) {
  const list = records.filter((r) => r.file === key);
  console.log(`${pad(key, 12)}${padL(list.length, 6)}${padL(act(list, "key"), 6)}${padL(act(list, "link"), 6)}${padL(act(list, "merge"), 7)}${padL(act(list, "new"), 6)}${padL(act(list, "dup"), 5)}${padL(act(list, "deferred"), 7)}   ${tally(list.filter((r) => r.plan?.action === "merge"), (r) => r.plan.rule.startsWith("name ") ? "name" : r.plan.rule)}`);
}
const deferred = records.filter((r) => r.plan?.action === "deferred");
if (deferred.length) {
  console.log(`not written without --utility-places: ${deferred.length} (${tally(deferred, (r) => r.details.category)}) - the deployed place list reads every place row with limit 500`);
}
const touched = records.filter((r) => r.plan && r.plan.action !== "dup" && r.plan.action !== "deferred");
/** A stored stop / taxi stand whose name is only the placeholder ("Otobüs Durağı", "Taksi Durağı") takes the KBB name. */
const renames = (r) =>
  r.plan.action === "merge" && (r.kind === "bus_stop" || r.kind === "taxi") && isGeneric(r.plan.target.name, r.kind) && !isGeneric(r.name, r.kind);
const mergedInto = tally(touched.filter((r) => r.plan.action === "merge"), (r) => `${r.plan.target.source}/${r.plan.target.kind}${r.plan.target.locked ? " locked" : ""}${r.plan.target.has_photos ? " +photos" : ""}`);
console.log(`merged into: ${mergedInto || "-"}`);
console.log(`stored stops / taxi stands with a placeholder name that take the KBB name: ${touched.filter(renames).length}`);
const leftOver = (kind, source) => existing.filter((e) => e.kind === kind && (!source || e.source === source) && !e.hidden && !claimed.has(e.id)).length;
console.log(`stored rows no record matched (kept as they are): pharmacy ${leftOver("pharmacy")}, mosque ${leftOver("mosque")}, fuel ${leftOver("fuel")}, taxi ${leftOver("taxi")}, bus_stop ${leftOver("bus_stop")} (OSM), institution ${leftOver("institution")}, place ${leftOver("place")}`);

const DIST = districts.map((d) => d.id);
console.log("\nrows per kind x district after the import (new + matched):");
console.log(`${pad("kind", 22)}${DIST.map((d) => padL(d.slice(0, 7), 8)).join("")}${padL("total", 8)}`);
const kindKey = (r) => (r.kind === "place" || r.kind === "institution" ? `${r.kind}/${r.details.category}` : r.kind);
for (const k of [...new Set(touched.map(kindKey))].sort()) {
  const list = touched.filter((r) => kindKey(r) === k);
  console.log(`${pad(k, 22)}${DIST.map((d) => padL(list.filter((r) => (r.plan.target?.district_id ?? r.district) === d).length || ".", 8)).join("")}${padL(list.length, 8)}`);
}
const newRows = touched.filter((r) => r.plan.action === "new");
console.log(`new rows ${newRows.length}; with phone ${newRows.filter((r) => r.phone).length}, e-mail ${newRows.filter((r) => r.email).length}, website ${newRows.filter((r) => r.website).length}, address ${newRows.filter((r) => r.address).length}`);
console.log(`fuel brands: ${tally(records.filter((r) => r.kind === "fuel"), (r) => r.details.brand)}`);
console.log(`place categories: ${tally(records.filter((r) => r.kind === "place"), (r) => r.details.category + (r.details.subkind ? `/${r.details.subkind}` : ""))}`);
console.log(`institution categories: ${tally(records.filter((r) => r.kind === "institution"), (r) => r.details.category)}`);
const kioskRecs = records.filter((r) => r.file === "kocaelikart");
if (kioskRecs.length) {
  console.log(`KocaeliKart points: term_type ${tally(kioskRecs, (r) => r.details.term_type)}; owner kept (legal entity) ${kioskRecs.filter((r) => r.details.owner).length}, dropped (a person) ${kioskRecs.filter((r) => !r.details.owner).length}`);
}
const stopRecs = records.filter((r) => r.kind === "bus_stop");
if (stopRecs.length) console.log(`bus stops: wheelchair yes ${stopRecs.filter((r) => r.details.wheelchair === true).length}, no ${stopRecs.filter((r) => r.details.wheelchair === false).length}, unknown ${stopRecs.filter((r) => r.details.wheelchair === undefined).length}`);
if (gtfsRoutes.length) {
  console.log(`\ntransit: ${transitStats.routes} routes (${Object.entries(transitStats.routeTypes).map(([k, n]) => `${k} ${n}`).join(", ")}), ${transitStats.agencies} agencies`);
  console.log(`  geometric links (stop within ${LINK_M} m of a route shape; no stop_times.txt): ${transitStats.links} links, ${transitStats.routesWithStops} routes with stops (${transitStats.routesWithoutStops} without), ${transitStats.stopsWithRoute} of ${stopRecs.length} stops on a route, stops per route median ${transitStats.stopsPerRouteMedian}, max ${transitStats.stopsPerRouteMax}`);
  console.log(`  shape segments used ${transitStats.segmentsUsed}, longer than ${MAX_SEGMENT_M} m and ignored ${transitStats.segmentsSkipped}`);
}
if (SHOW) {
  console.log("\nmerge pairs (institutions, places, mosques, stops; public names only):");
  for (const r of touched) {
    if (r.plan.action !== "merge" || !["institution", "place", "mosque", "bus_stop", "taxi", "fuel"].includes(r.kind) || r.file === "kocaelikart") continue;
    const t = r.plan.target;
    console.log(`  [${r.plan.rule}${r.plan.d != null ? `, ${Math.round(r.plan.d)} m` : ""}] ${r.file} "${r.name}" -> ${t.source}/${t.kind} "${t.name}"`);
  }
  const shown = nearMisses.filter((m) => m.rec.plan?.action === "new");
  console.log(`\nnear misses (a new row within 150 m of an unmatched stored row of the same group): ${shown.length}`);
  for (const { rec, e, d } of shown.sort((a, b) => a.d - b.d)) {
    const pub = rec.kind !== "pharmacy";
    console.log(`  ${Math.round(d)} m ${rec.file} ${pub ? `"${rec.name}"` : "(name not shown)"} ~ ${e.source}/${e.kind}${e.category ? `/${e.category}` : ""} ${pub ? `"${e.name}"` : ""}`);
  }
}

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------
function payload(rec) {
  const out = {
    ref: rec.ref, match: rec.plan.action, kind: rec.kind, name: rec.name, address: rec.address, phone: rec.phone, email: rec.email,
    website: rec.website, lng: round7(rec.lng), lat: round7(rec.lat), district: rec.district, details: rec.details, license: LICENSE,
  };
  if (rec.plan.target) {
    out.target = rec.plan.target.id;
    if (renames(rec)) out.rename = true;
  } else out.slug = rec.slug;
  return out;
}
const rows = touched.map(payload);
const chunks = [];
for (let i = 0; i < rows.length; i += CHUNK) chunks.push(rows.slice(i, i + CHUNK));
const linkChunks = [];
for (let i = 0; i < gtfsLinks.length; i += LINK_CHUNK) linkChunks.push(gtfsLinks.slice(i, i + LINK_CHUNK));

// ---------------------------------------------------------------------------
// Rehearsal: a sample written inside one transaction that always rolls back
// ---------------------------------------------------------------------------
if (REHEARSE) {
  const [live] = await ro(`select to_regprocedure('private.kocaeli_poi_import(jsonb,boolean)') is not null as fn, to_regclass('public.transit_routes') is not null as transit`);
  const withMigration = !(live.fn && live.transit);
  const perFile = new Map();
  const sample = [];
  for (const r of rows) {
    if (r.match !== "new") {
      sample.push(r);
      continue;
    }
    const f = records.find((x) => x.ref === r.ref)?.file;
    const n = perFile.get(f) ?? 0;
    if (n < (f === "durak" || f === "kocaelikart" ? 150 : 60)) {
      sample.push(r);
      perFile.set(f, n + 1);
    }
  }
  const sampleStops = new Set(sample.filter((r) => r.kind === "bus_stop").map((r) => r.ref.slice("durak:".length)));
  const sampleLinks = gtfsLinks.filter((l) => sampleStops.has(l.stop_id)).slice(0, 3000);
  const refs = sample.map((r) => r.ref);
  const body = [];
  if (withMigration) body.push(readFileSync(MIGRATION, "utf8").replace(/^﻿/, ""));
  body.push(`do $rehearsal$
declare
  r jsonb := '{}'::jsonb;
  s jsonb;
begin
  r := r || jsonb_build_object('poi', private.kocaeli_poi_import(${jsonLit(sample)}, false));
  r := r || jsonb_build_object('transit', private.transit_import(${jsonLit(gtfsRoutes)}, ${jsonLit(sampleLinks)}, false));
  r := r || jsonb_build_object('poi_again', private.kocaeli_poi_import(${jsonLit(sample.slice(0, 200))}, true));
  with t as (
    select q.* from public.poi q
     where (q.source = 'kbb' and q.source_ref = any(${lit(`{${refs.map((x) => `"${x}"`).join(",")}}`)}::text[]))
        or q.details ->> 'kbb_ref' = any(${lit(`{${refs.map((x) => `"${x}"`).join(",")}}`)}::text[]))
  select jsonb_build_object(
    'rows', count(*),
    'by_kind_district', (select jsonb_object_agg(k, n) from (select kind || '/' || coalesce(district_id, '-') as k, count(*) as n from t group by 1) x),
    'no_district', count(*) filter (where district_id is null),
    'district_differs_from_polygon', count(*) filter (where location is not null and district_id is distinct from private.district_of(location::extensions.geometry)),
    'category_fallback', count(*) filter (where (kind = 'place' and details ->> 'category' = 'diger') or (kind = 'institution' and details ->> 'category' = 'diger_kamu')),
    'with_neighbourhood', count(*) filter (where neighbourhood_id is not null),
    'neighbourhood_outside_gebze', count(*) filter (where neighbourhood_id is not null and district_id <> 'gebze'),
    'hidden', count(*) filter (where hidden),
    'no_search_norm', count(*) filter (where search_norm is null),
    'import_mark_on_stored_rows', count(*) filter (where details ->> 'import' = 'kocaeli-acik-veri' and created_at < now() - interval '1 minute'),
    'photos_kept', count(*) filter (where details ? 'photos'),
    'slugs_unique', (select count(*) = count(distinct slug) from public.poi))
    into s from t;
  r := r || jsonb_build_object('checks', s);
  r := r || jsonb_build_object('route_stop_links_with_poi', (select count(*) from public.transit_route_stops where poi_id is not null),
    'route_stop_links', (select count(*) from public.transit_route_stops));
  r := r || jsonb_build_object('poi_sync_smoke', public.poi_sync_apply(
    '[{"kind":"pharmacy","name":"Test","slug":"test-rehearsal-eczane","source":"kbb","source_ref":"eczane:rehearsal","x":30.2,"y":41.1,"srid":4326},
      {"kind":"place","name":"Test Kandıra","slug":"test-rehearsal-kandira","source":"osm","source_ref":"node/0","x":30.1523,"y":41.0704,"srid":4326,"details":{"category":"park"}}]'::jsonb,
    '[{"source":"kbb","kind":"pharmacy"},{"source":"osm","kind":"place"}]'::jsonb, 'script', true));
  raise exception 'REHEARSAL %', r::text;
end $rehearsal$`);
  const text = `begin;\n${body.join("\n;\n")};\nrollback;`;
  console.log(`\nrehearsal: ${sample.length} rows (${sample.filter((r) => r.match !== "new").length} matched + a sample of new), ${gtfsRoutes.length} routes, ${sampleLinks.length} links${withMigration ? ", with 2026091381 inside the same transaction" : ""} (${Math.round(text.length / 1024)} KB, rolled back)`);
  try {
    await runSql(text);
    console.error("rehearsal: the transaction did not raise - check the database!");
    process.exit(1);
  } catch (e) {
    // runSql's message: "SQL failed (400): <JSON body>", the body's message holds the RAISE text on one line.
    let msg = String(e.message);
    try {
      msg = JSON.parse(msg.slice(msg.indexOf("{"))).message ?? msg;
    } catch {
      /* keep the raw text */
    }
    const m = msg.match(/REHEARSAL (.*)$/m);
    if (!m) {
      console.error(`rehearsal FAILED: ${msg.slice(0, 1500)}`);
      process.exit(1);
    }
    let out;
    try {
      out = JSON.parse(m[1]);
    } catch {
      out = m[1].slice(0, 4000);
    }
    console.log(`rehearsal OK (rolled back): ${typeof out === "string" ? out : JSON.stringify(out)}`);
  }
}

if (DRY) {
  console.log(`\nDRY RUN - nothing written. ${rows.length} rows in ${chunks.length} chunks, ${gtfsRoutes.length} routes, ${gtfsLinks.length} links in ${linkChunks.length} chunks would be sent${deferred.length ? ` (${deferred.length} utility places left out: --utility-places)` : ""}.`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------
{
  const [live] = await ro(`select to_regprocedure('private.kocaeli_poi_import(jsonb,boolean)') is not null as fn, to_regclass('public.transit_routes') is not null as transit`);
  if (!live.fn || !live.transit) {
    console.error("apply supabase/migrations/2026091381_kocaeli_import_support.sql first");
    process.exit(2);
  }
}
const totals = {};
const errors = [];
for (const [i, chunk] of chunks.entries()) {
  try {
    const out = await sql(`select private.kocaeli_poi_import(${jsonLit(chunk)}, false) as r`, 3);
    let r = out?.[0]?.r ?? {};
    if (typeof r === "string") r = JSON.parse(r);
    for (const [kind, st] of Object.entries(r.kinds ?? {})) {
      totals[kind] ??= { fetched: 0, added: 0, updated: 0, unchanged: 0 };
      for (const k of Object.keys(totals[kind])) totals[kind][k] += Number(st[k] ?? 0);
    }
    console.log(`chunk ${i + 1}/${chunks.length}: ${JSON.stringify(r.totals ?? r)}`);
  } catch (e) {
    errors.push({ source: `kbb:chunk${i + 1}`, message: String(e.message).slice(0, 280) });
    console.error(`chunk ${i + 1} failed: ${String(e.message).slice(0, 400)}`);
  }
}
let transitOut = null;
if (gtfsRoutes.length) {
  try {
    const parts = linkChunks.length ? linkChunks : [[]];
    for (const [i, links] of parts.entries()) {
      const out = await sql(`select private.transit_import(${jsonLit(i === 0 ? gtfsRoutes : [])}, ${jsonLit(links)}, false) as r`, 3);
      transitOut = out?.[0]?.r;
      console.log(`transit ${i + 1}/${parts.length}: ${typeof transitOut === "string" ? transitOut : JSON.stringify(transitOut)}`);
    }
  } catch (e) {
    errors.push({ source: "kbb:transit", message: String(e.message).slice(0, 280) });
    console.error(`transit failed: ${String(e.message).slice(0, 400)}`);
  }
}
// One entry in data_sync_runs (/admin/veri), same summary shape as poi_sync_apply.
const groups = Object.entries(totals).map(([kind, t]) => ({ source: "kbb", kind, ...t, restored: 0, complete: false, missing: 0, hidden: 0, locked: 0, guarded: false }));
const sum = (k) => groups.reduce((s, g) => s + g[k], 0);
const summary = {
  totals: { fetched: sum("fetched"), added: sum("added"), updated: sum("updated"), unchanged: sum("unchanged"), restored: 0, missing: 0, hidden: 0, locked: 0 },
  groups,
  errors,
};
await sql(`insert into public.data_sync_runs (dataset, triggered_by, dry_run, status, summary, message, finished_at)
  values ('poi', 'script', false, ${lit(errors.length ? "partial" : "ok")}, ${jsonLit(summary)},
          ${lit(`Kocaeli açık veri içe aktarımı (scripts/db/import-kocaeli.mjs)${errors.length ? `: ${errors.length} hata` : ""}`)}, now())`);
const counts = await sql(`select kind, coalesce(district_id, '-') as district, count(*) filter (where not hidden) as visible from public.poi group by 1, 2 order by 1, 2`);
console.log(counts.map((c) => `${c.kind}/${c.district}=${c.visible}`).join("  "));
console.log(errors.length ? `done with ${errors.length} error(s) - re-run to retry (idempotent)` : "done");
process.exit(errors.length ? 1 : 0);
