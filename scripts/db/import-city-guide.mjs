// City guide import (şehir rehberi): the researched city-guide.json -> public.poi (2026091376_city_guide.sql must be live).
//
// Usage (PowerShell, repo root, after dot-sourcing secrets.ps1 so SUPABASE_ACCESS_TOKEN is set):
//   node --env-file=.env.local scripts/db/import-city-guide.mjs --file=<city-guide.json> [--dry-run] [--no-images] [--emit-sql=<out.sql>]
//     --dry-run     read the live rows, print counts per kind and the merge plan; write nothing (no R2, no Wikimedia).
//     --no-images   skip the Wikimedia Commons -> R2 photo copies (photos of rows that already have them stay).
//     --emit-sql    also write the SQL statements of the plan to a file (photo URLs as planned).
//
// Rules
//  * Re-runnable and idempotent. Never deletes, never un-hides (hide a row to remove it from the guide for good).
//  * Kinds: institution (belediye, kamu, adliye, emniyet, jandarma, itfaiye, ptt, noter, hastane, saglik-merkezi, okul,
//    universite, egitim-kurumu, kutuphane), atm, bank (banka), fuel (akaryakit), ev_charge (sarj), place (tarihi, muze,
//    gezi, park, kultur, spor, mezarlik, pazar, tren, otogar, iskele). Skipped: doktor, dis, veteriner (private
//    practices) and acil (the migration seeds app_settings.emergency_numbers).
//  * Each record is matched to a stored row, in order: its own earlier import (source 'manual', source_ref
//    'guide/<key>'), a row that carries its key (details.key), the OSM row of its osm_id (same kind), then the same kind
//    + a similar name (Dice >= 0.6, or all distinctive words shared and >= 0.5; the kind of thing - camii / külliye /
//    türbe... - must agree) within 150 m. Records without coordinates only match an identical name.
//  * Own rows are rewritten (location / neighbourhood kept when the record has none; details merged). Matched rows
//    only get what they miss (address, phone, e-mail, website, verified_at, pin, details keys) plus the key, osm_id and
//    source URLs, so earlier data and admin edits stay. Locked rows keep their fields (poi_before_write).
//  * Records without coordinates are imported too (lists and the admin "konumu eksik" queue; no pin).
//  * Historic and other place photos (extra.images, Wikimedia Commons, CC BY / BY-SA / CC0 / public domain only, max 3
//    per place, max 5 MB): the 1600 px Commons rendition is copied once to R2 at guide/<key>/<n>.<ext> (signed S3 PUT)
//    and stored as {url, alt, credit, author, licence, licence_url, source_page}.
//  * Existing ATMs without details.bank get it from their name.
// Never prints secrets.
import { readFileSync, writeFileSync } from "node:fs";
import crypto from "node:crypto";
import { UA, jsonLit, lit, sleep, sql, trSlug } from "./lib.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;

const DRY_RUN = flag("dry-run");
const NO_IMAGES = flag("no-images");
const FILE = opt("file") ?? process.env.CITY_GUIDE_FILE;
const EMIT = opt("emit-sql");
if (!FILE) {
  console.error("Usage: node --env-file=.env.local scripts/db/import-city-guide.mjs --file=<city-guide.json> [--dry-run] [--no-images] [--emit-sql=<out.sql>]");
  process.exit(2);
}

const OSM_LICENSE = "ODbL - © OpenStreetMap katkıcıları";
const MERGE_DISTANCE_M = 150;
const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_WIDTH = 1600;
const BATCH = 60;
const SKIP = { acil: "app_settings.emergency_numbers (migration)", doktor: "private practice", dis: "private practice", veteriner: "private practice" };

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------
const FOLD = { ç: "c", ğ: "g", ı: "i", i: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };
/** Turkish-aware ASCII fold, words separated by single spaces (mirrors public.tr_norm + punctuation). */
function fold(s) {
  return String(s ?? "")
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşüâîû]/g, (c) => FOLD[c] ?? c)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
const clip = (s, n) => {
  if (s === null || s === undefined) return null;
  const t = String(s).trim();
  return t ? t.slice(0, n) : null;
};
const keyOf = (s) => {
  const k = fold(s).replace(/ /g, "_");
  return /^[a-z][a-z0-9_]{0,39}$/.test(k) ? k : null;
};

// ---------------------------------------------------------------------------
// Kind / category mapping
// ---------------------------------------------------------------------------
const KAMU = {
  gumruk: "diger_kamu",
  iskur: "iskur",
  kadastro: "tapu",
  kaymakamlik: "kaymakamlik",
  maliye: "vergi",
  muftuluk: "muftuluk",
  muhtarlik: "diger_kamu",
  nufus: "nufus",
  osb: "osb",
  "sosyal-hizmet": "diger_kamu",
  tapu: "tapu",
  tarim: "tarim",
  "ticaret-odasi": "ticaret_odasi",
  tse: "diger_kamu",
  "tuketici-hakem": "diger_kamu",
  vergi: "vergi",
  sgk: "sgk",
  "kent-konseyi": "kent_konseyi",
};
const SAGLIK = {
  asm: "aile_sagligi_merkezi",
  "112-istasyon": "acil_saglik",
  shm: "toplum_sagligi",
  "ilce-saglik": "ilce_saglik",
  ketem: "toplum_sagligi",
  "tip-merkezi": "hastane",
  "verem-savas-dispanseri": "toplum_sagligi",
  "agiz-dis": "agiz_dis",
};
const OKUL = { anaokulu: "anaokulu", ilkokul: "ilkokul", ortaokul: "ortaokul", lise: "lise", "ozel-egitim": "ozel_egitim", diger: "anaokulu" };
const INSTITUTION = {
  belediye: () => "belediye",
  kamu: (s) => KAMU[s] ?? "diger_kamu",
  adliye: (s) => (s === "icra" ? "icra" : "adliye"),
  emniyet: () => "emniyet",
  jandarma: () => "jandarma",
  itfaiye: () => "itfaiye",
  ptt: () => "ptt",
  noter: () => "noter",
  hastane: () => "hastane",
  "saglik-merkezi": (s) => SAGLIK[s] ?? "toplum_sagligi",
  okul: (s) => OKUL[s] ?? "anaokulu",
  "egitim-kurumu": () => "egitim_kurumu",
  universite: () => "universite",
  kutuphane: () => "kutuphane",
};
const GEZI = { park: "park", "tabiat-parki": "tabiat_parki", mesire: "doga", sahil: "sahil" };
const PLACE = {
  tarihi: "tarihi",
  muze: "muze",
  park: "park",
  kultur: "kultur",
  spor: "spor",
  mezarlik: "mezarlik",
  pazar: "pazar",
  tren: "ulasim",
  otogar: "ulasim",
  iskele: "ulasim",
  gezi: "gezi",
};
const OTHER = { atm: "atm", banka: "bank", akaryakit: "fuel", sarj: "ev_charge" };

const BANK_RULES = [
  [/ziraat katilim/, "ziraat_katilim"],
  [/vakif katilim/, "vakif_katilim"],
  [/emlak katilim/, "emlak_katilim"],
  [/ziraat/, "ziraat"],
  [/halk ?bank/, "halkbank"],
  [/vakif/, "vakifbank"],
  [/\bis ?bank/, "is_bankasi"],
  [/garanti/, "garanti"],
  [/akbank/, "akbank"],
  [/yapi ?kredi/, "yapikredi"],
  [/\bqnb\b|finansbank/, "qnb"],
  [/deniz ?bank/, "denizbank"],
  [/\bteb\b|turk ekonomi/, "teb"],
  [/\bing\b/, "ing"],
  [/hsbc/, "hsbc"],
  [/kuveyt/, "kuveytturk"],
  [/albaraka/, "albaraka"],
  [/turkiye finans/, "turkiye_finans"],
  [/sekerbank/, "sekerbank"],
  [/odea/, "odeabank"],
  [/fibabanka/, "fibabanka"],
  [/anadolubank/, "anadolubank"],
  [/alternatif/, "alternatifbank"],
  [/burgan/, "burgan"],
  [/enpara/, "enpara"],
  [/\bptt\b/, "ptt"],
];
const FUEL_RULES = [
  [/opet/, "opet"],
  [/shell/, "shell"],
  [/bpet/, "bpet"],
  [/\bbp\b/, "bp"],
  [/petrol ofisi|\bpo\b/, "petrol_ofisi"],
  [/aytemiz/, "aytemiz"],
  [/lukoil/, "lukoil"],
  [/kadoil/, "kadoil"],
  [/total/, "total"],
  [/alpet/, "alpet"],
  [/\bm ?oil\b/, "moil"],
  [/sunpet/, "sunpet"],
  [/turkiye petrolleri|\btp\b/, "turkiye_petrolleri"],
  [/\bclas\b/, "clas"],
  [/nipet/, "nipet"],
  [/termopet/, "termopet"],
  [/\bgo\b/, "go"],
];
const EV_RULES = [
  [/\bzes\b|zorlu/, "zes"],
  [/e ?sarj/, "esarj"],
  [/trugo|togg/, "trugo"],
  [/sharz/, "sharz"],
  [/voltrun/, "voltrun"],
  [/tesla/, "tesla"],
  [/astor/, "astor"],
  [/beefull/, "beefull"],
  [/otowatt/, "otowatt"],
  [/enyakit/, "enyakit"],
];
function firstRule(rules, ...texts) {
  for (const t of texts) {
    const f = fold(t);
    if (!f) continue;
    for (const [re, key] of rules) if (re.test(f)) return key;
  }
  return null;
}

/** Target kind, category, subkind and ownership of a record, or {skip}. */
function classify(r) {
  if (SKIP[r.kind]) return { skip: SKIP[r.kind] };
  const sub = r.subkind ?? null;
  if (INSTITUTION[r.kind]) {
    const category = INSTITUTION[r.kind](sub);
    const priv = r.extra?.private;
    const ozel =
      priv === true ||
      priv === "true" ||
      sub === "ozel-hastane" ||
      sub === "tip-merkezi" ||
      /^özel\s/.test(String(r.name).trim().toLocaleLowerCase("tr-TR"));
    return { kind: "institution", category, subkind: sub ? keyOf(sub) : null, ownership: ozel ? "ozel" : "devlet" };
  }
  if (PLACE[r.kind]) {
    const category = r.kind === "gezi" ? (GEZI[sub] ?? "park") : PLACE[r.kind];
    let subkind = null;
    if (r.kind === "tarihi") subkind = sub && sub !== "diger" ? keyOf(sub) : null;
    else if (category === "ulasim") subkind = r.kind;
    else if (r.kind === "kultur" || r.kind === "spor") subkind = sub ? keyOf(sub) : null;
    return { kind: "place", category, subkind };
  }
  if (OTHER[r.kind]) return { kind: OTHER[r.kind] };
  return { skip: `unknown kind ${r.kind}` };
}

// ---------------------------------------------------------------------------
// Field normalizers
// ---------------------------------------------------------------------------
/** "+90 262 642 04 30" / "0262..." -> "+902626420430"; "444 95 95" -> "+904449595"; short codes stay. */
function phoneOf(p) {
  if (!p) return null;
  const d = String(p).replace(/[^\d]/g, "");
  if (/^90\d{10}$/.test(d)) return `+${d}`;
  if (/^0\d{10}$/.test(d)) return `+9${d}`;
  if (/^[2-9]\d{9}$/.test(d)) return `+90${d}`;
  if (/^(444|850)\d{4}$/.test(d)) return `+90${d}`;
  if (/^\d{3,5}$/.test(d)) return d;
  return null;
}
function emailOf(v) {
  for (const part of String(v ?? "").split(/[;,\s]+/)) {
    const e = part.trim().toLowerCase();
    if (e.length <= 200 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return e;
  }
  return null;
}
function websiteOf(v) {
  let w = clip(v, 500);
  if (!w) return null;
  if (/^www\./i.test(w)) w = `https://${w}`;
  return /^https?:\/\/\S+$/i.test(w) ? w : null;
}
function feeOf(v) {
  const f = clip(v, 200);
  if (!f) return null;
  if (/^yes$/i.test(f)) return "Ücretli";
  if (/^no$/i.test(f)) return "Ücretsiz";
  return f;
}
const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const inBox = (lat, lng) => typeof lat === "number" && typeof lng === "number" && lat >= 40.5 && lat <= 41.2 && lng >= 29 && lng <= 30;

const GENERIC = new Set(["atm", "akaryakit istasyonu", "elektrikli arac sarj istasyonu", "mezarlik", "park", "kutuphane", "banka"]);

/** Wikimedia Commons images allowed in the app (credit shown): CC BY / BY-SA, CC0, public domain. */
const LICENCE_OK = /^(cc by(-sa)? [1-4]\.0( [a-z]{2})?|cc0( 1\.0)?|public domain)$/i;
const EXT_OK = /\.(jpe?g|png|webp)$/i;

function photoPlan(r) {
  const out = [];
  for (const img of r.extra?.images ?? []) {
    if (out.length >= MAX_PHOTOS) break;
    const licence = clip(img.licence ?? img.license, 80);
    const title = String(img.title ?? "").replace(/^File:/i, "").trim();
    const ext = (EXT_OK.exec(title)?.[1] ?? "").toLowerCase().replace("jpeg", "jpg");
    if (!licence || !LICENCE_OK.test(licence) || !ext || !img.file_page) continue;
    const author = clip(String(img.author ?? "").replace(/<[^>]+>/g, ""), 120);
    const objectKey = `guide/${r.key}/${out.length + 1}.${ext}`;
    out.push({
      objectKey,
      title,
      ext,
      photo: {
        url: `${mediaBase()}/${objectKey}`,
        alt: clip(r.name, 200),
        credit: [author, licence, "Wikimedia Commons"].filter(Boolean).join(" · "),
        author,
        licence,
        licence_url: clip(img.licence_url, 300),
        source_page: clip(img.file_page, 1000),
      },
    });
  }
  return out;
}

function mediaBase() {
  const b = process.env.NEXT_PUBLIC_MEDIA_BASE_URL;
  if (!b) throw new Error("NEXT_PUBLIC_MEDIA_BASE_URL missing in .env.local");
  return b.replace(/\/+$/, "");
}

const strip = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && !v.length)));

/** The poi row (columns + details) a record becomes. */
function build(r, cls) {
  const x = r.extra ?? {};
  const lat = num(r.lat);
  const lng = num(r.lng);
  const hasPin = inBox(lat, lng);
  const hood = clip(r.neighbourhood, 60);
  let name = clip(r.name, 200);
  if ((x.unnamed_in_osm || GENERIC.has(fold(name))) && hood) name = `${name} (${hood})`;
  const phones = [...new Set((r.phones ?? []).map(phoneOf).filter(Boolean))].slice(0, 8);
  const brandText = [r.brand_or_operator, x.brand_raw, x.operator_raw, r.name];
  const sockets = {};
  for (const [k, v] of Object.entries(x)) {
    const m = /^socket:([a-z0-9_]+)$/.exec(k);
    if (m && num(v) !== null) sockets[m[1]] = num(v);
  }
  const sourceUrls = [...new Set([...(r.sources ?? []), ...(x.verify_sources ?? [])].filter((u) => /^https?:\/\/\S+$/i.test(String(u))))].slice(0, 20);
  const verified = x.verified === true ? clip(x.verified_at ?? r.checked_at, 10) : null;
  const photos = cls.kind === "place" ? photoPlan(r) : [];
  const details = strip({
    key: r.key,
    category: cls.category ?? null,
    subkind: cls.subkind ?? null,
    ownership: cls.ownership ?? null,
    phones,
    fax: phoneOf(x.fax),
    hours: clip(r.hours, 500),
    description: clip(x.description, 2000),
    fee: feeOf(x.fee),
    period: clip(x.period, 300),
    note: clip(x.note ?? x.district_note, 1000),
    verify_note: clip(x.verify_note, 1000),
    bank: cls.kind === "atm" || cls.kind === "bank" ? firstRule(BANK_RULES, ...brandText) : null,
    brand: cls.kind === "fuel" ? firstRule(FUEL_RULES, r.brand_or_operator, x.brand_raw, r.name) : null,
    operator: cls.kind === "ev_charge" ? firstRule(EV_RULES, ...brandText) : null,
    sockets: cls.kind === "ev_charge" && Object.keys(sockets).length ? sockets : null,
    capacity: cls.kind === "ev_charge" ? num(x.capacity) : null,
    atm_count: cls.kind === "atm" ? num(x.atm_count) : null,
    osm_id: clip(r.osm_id, 60),
    wikidata: clip(x.wikidata, 40),
    photos: photos.map((p) => p.photo),
  });
  return {
    key: r.key,
    kind: cls.kind,
    name,
    address: clip(r.address, 300),
    phone: phones[0] ?? null,
    email: emailOf(r.email),
    website: websiteOf(r.website),
    lat: hasPin ? lat : null,
    lng: hasPin ? lng : null,
    hood,
    details,
    sourceUrls,
    verified,
    license: x.osm_derived ? OSM_LICENSE : null,
    osmId: clip(r.osm_id, 60),
    photos,
  };
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------
const STOP = new Set(["gebze", "mahallesi", "mah", "ve", "kocaeli", "tarihi", "ile"]);
const TYPE = {};
for (const [base, forms] of Object.entries({
  cami: ["cami", "camii", "camisi", "mescit", "mescidi"],
  kulliye: ["kulliye", "kulliyesi"],
  turbe: ["turbe", "turbesi"],
  hamam: ["hamam", "hamami"],
  cesme: ["cesme", "cesmesi"],
  sadirvan: ["sadirvan", "sadirvani"],
  kale: ["kale", "kalesi"],
  park: ["park", "parki"],
  bahce: ["bahce", "bahcesi"],
  mezarlik: ["mezarlik", "mezarligi"],
  muze: ["muze", "muzesi"],
  istasyon: ["istasyon", "istasyonu"],
  meydan: ["meydan", "meydani"],
  anit: ["anit", "aniti"],
  mezar: ["mezar", "mezari"],
  kutuphane: ["kutuphane", "kutuphanesi"],
  stadyum: ["stadyum", "stadyumu"],
  salon: ["salon", "salonu"],
  havuz: ["havuz", "havuzu"],
  iskele: ["iskele", "iskelesi"],
  sahil: ["sahil", "sahili"],
  liman: ["liman", "limani"],
  vadi: ["vadi", "vadisi"],
  dolap: ["dolap", "dolabi"],
  kopru: ["kopru", "koprusu"],
  ev: ["ev", "evi"],
  konak: ["konak", "konagi"],
  avm: ["avm"],
  atm: ["atm"],
}))
  for (const f of forms) TYPE[f] = base;

const tokensOf = (name) => fold(name).split(" ").filter((t) => t && !STOP.has(t));
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
/** Similarity of two names (0 = no match). The main names (no parentheses) and the full names are both tried. */
function nameScore(a, b) {
  let best = 0;
  for (const [x, y] of [
    [a.replace(/\(.*?\)/g, " "), b.replace(/\(.*?\)/g, " ")],
    [a, b],
  ]) {
    const ta = tokensOf(x);
    const tb = tokensOf(y);
    if (!ta.length || !tb.length) continue;
    const ya = new Set(ta.map((t) => TYPE[t]).filter(Boolean));
    const yb = new Set(tb.map((t) => TYPE[t]).filter(Boolean));
    if (ya.size && yb.size && ![...ya].some((t) => yb.has(t))) continue;
    const d = dice(ta.join(" "), tb.join(" "));
    const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
    const contained = short.every((t) => long.includes(t));
    if (d >= 0.6 || (contained && d >= 0.5)) best = Math.max(best, d);
  }
  return best;
}
function distanceM(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------------------------------------------------------------------------
// Slugs
// ---------------------------------------------------------------------------
const PREFIX = { atm: "atm-", bank: "banka-", fuel: "akaryakit-", ev_charge: "sarj-" };
function slugBase(row) {
  const prefix = PREFIX[row.kind];
  if (!prefix) return trSlug(row.name) || "yer";
  let core = row.name
    .replace(/\(([^)]*)\)/g, " $1 ")
    .replace(/\batm\b/gi, " ")
    .replace(/akaryak[ıi]t istasyonu/gi, " ")
    .replace(/elektrikli ara[çc] şarj istasyonu/gi, " ");
  if (row.kind === "bank" && row.hood) core = `${core} ${row.hood}`;
  const s = trSlug(core).replace(new RegExp(`^${prefix.slice(0, -1)}-`), "");
  return `${prefix}${(s || trSlug(row.hood) || "nokta").slice(0, 70)}`;
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------
const input = JSON.parse(readFileSync(FILE, "utf8"));
const records = Array.isArray(input) ? input : input.records;
if (!Array.isArray(records)) throw new Error("city-guide.json: no records array");

const existing = await sql(
  `select id, kind, name, slug, source, source_ref, lat, lng, locked, hidden, address, phone, details from public.poi`,
);
const bySourceRef = new Map(existing.map((e) => [`${e.source}|${e.source_ref}`, e]));
const byKey = new Map(existing.filter((e) => e.details?.key).map((e) => [e.details.key, e]));
const byOsmRef = new Map(existing.filter((e) => e.source === "osm").map((e) => [e.source_ref, e]));
const takenSlugs = new Set(existing.map((e) => e.slug));

const skipped = {};
const rows = [];
for (const r of records) {
  const cls = classify(r);
  if (cls.skip) {
    skipped[r.kind] = (skipped[r.kind] ?? 0) + 1;
    continue;
  }
  rows.push(build(r, cls));
}

const claimed = new Set();
const plan = new Map(); // key -> {action: 'own'|'merge'|'new', target, reason, distance}
const conflicts = [];
// Pass 1: exact links (own import, stored key, OSM element).
for (const row of rows) {
  const own = bySourceRef.get(`manual|guide/${row.key}`);
  if (own) {
    plan.set(row.key, { action: "own", target: own, reason: "own" });
    claimed.add(own.id);
    continue;
  }
  const keyed = byKey.get(row.key);
  if (keyed && !claimed.has(keyed.id)) {
    plan.set(row.key, { action: "merge", target: keyed, reason: "key" });
    claimed.add(keyed.id);
    continue;
  }
  const osm = row.osmId ? byOsmRef.get(row.osmId) : null;
  if (osm && !claimed.has(osm.id)) {
    if (osm.kind === row.kind) {
      plan.set(row.key, { action: "merge", target: osm, reason: `osm ${row.osmId}` });
      claimed.add(osm.id);
    } else {
      conflicts.push(`${row.name} (${row.kind}) has osm ${row.osmId}, stored as ${osm.kind} "${osm.name}" -> added as a new row`);
    }
  }
}
// Pass 2: same kind + similar name nearby (best pairs first); records without a pin: identical name only.
const pairs = [];
for (const row of rows) {
  if (plan.has(row.key)) continue;
  for (const e of existing) {
    if (claimed.has(e.id) || e.kind !== row.kind || e.source === "demo") continue;
    if (row.lat !== null && typeof e.lat === "number") {
      const d = distanceM({ lat: row.lat, lng: row.lng }, { lat: e.lat, lng: e.lng });
      if (d >= MERGE_DISTANCE_M) continue;
      const s = nameScore(row.name, e.name);
      if (s > 0) pairs.push({ row, e, score: s, d });
    } else if (fold(row.name.replace(/\(.*?\)/g, " ")) === fold(e.name.replace(/\(.*?\)/g, " "))) {
      pairs.push({ row, e, score: 1, d: null });
    }
  }
}
pairs.sort((a, b) => b.score - a.score || (a.d ?? 1e9) - (b.d ?? 1e9));
for (const p of pairs) {
  if (plan.has(p.row.key) || claimed.has(p.e.id)) continue;
  plan.set(p.row.key, { action: "merge", target: p.e, reason: p.d === null ? "same name" : `name ${p.score.toFixed(2)}`, distance: p.d });
  claimed.add(p.e.id);
}
// New rows: slugs.
for (const row of rows) {
  if (plan.has(row.key)) continue;
  const base = slugBase(row);
  let s = base;
  let i = 2;
  while (takenSlugs.has(s)) s = `${base}-${i++}`;
  takenSlugs.add(s);
  row.slug = s;
  plan.set(row.key, { action: "new", target: null, reason: "new" });
}
// Existing ATMs without a bank (not matched above): bank from the name.
const atmBackfill = existing
  .filter((e) => e.kind === "atm" && !claimed.has(e.id) && !e.details?.bank)
  .map((e) => ({ id: e.id, name: e.name, bank: firstRule(BANK_RULES, e.name) }))
  .filter((e) => e.bank);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
console.log(`${DRY_RUN ? "DRY RUN (nothing written)" : "IMPORT"}: ${records.length} records in ${FILE.split(/[\\/]/).pop()}`);
console.log(`skipped: ${Object.entries(skipped).map(([k, n]) => `${k} ${n} (${SKIP[k] ?? "?"})`).join(", ") || "none"}`);
const kinds = ["institution", "atm", "bank", "fuel", "ev_charge", "place"];
console.log(`\n${pad("kind", 12)}${padL("total", 6)}${padL("new", 6)}${padL("merge", 7)}${padL("own", 5)}${padL("no pin", 8)}${padL("verified", 10)}${padL("phone", 7)}${padL("photos", 8)}`);
for (const k of kinds) {
  const list = rows.filter((r) => r.kind === k);
  const c = (a) => list.filter((r) => plan.get(r.key).action === a).length;
  console.log(
    `${pad(k, 12)}${padL(list.length, 6)}${padL(c("new"), 6)}${padL(c("merge"), 7)}${padL(c("own"), 5)}${padL(list.filter((r) => r.lat === null).length, 8)}${padL(list.filter((r) => r.verified).length, 10)}${padL(list.filter((r) => r.phone).length, 7)}${padL(list.reduce((n, r) => n + r.photos.length, 0), 8)}`,
  );
}
const tally = (list, f) => {
  const m = {};
  for (const r of list) {
    const k = f(r) ?? "(none)";
    m[k] = (m[k] ?? 0) + 1;
  }
  return Object.entries(m)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k} ${n}`)
    .join(", ");
};
console.log(`\ninstitution categories: ${tally(rows.filter((r) => r.kind === "institution"), (r) => r.details.category)}`);
console.log(`institution ownership: ${tally(rows.filter((r) => r.kind === "institution"), (r) => r.details.ownership)}`);
console.log(`place categories: ${tally(rows.filter((r) => r.kind === "place"), (r) => r.details.category)}`);
console.log(`place subkinds: ${tally(rows.filter((r) => r.kind === "place" && r.details.subkind), (r) => `${r.details.category}/${r.details.subkind}`)}`);
console.log(`ATM banks: ${tally(rows.filter((r) => r.kind === "atm"), (r) => r.details.bank)}`);
console.log(`bank branches: ${tally(rows.filter((r) => r.kind === "bank"), (r) => r.details.bank)}`);
console.log(`fuel brands: ${tally(rows.filter((r) => r.kind === "fuel"), (r) => r.details.brand)}`);
console.log(`EV operators: ${tally(rows.filter((r) => r.kind === "ev_charge"), (r) => r.details.operator)}`);
const merges = rows.filter((r) => plan.get(r.key).action === "merge");
console.log(`\nmerge plan (${merges.length} records into stored rows; they only get what they miss):`);
for (const r of merges) {
  const p = plan.get(r.key);
  const t = p.target;
  console.log(`  [${p.reason}${p.distance != null ? `, ${Math.round(p.distance)} m` : ""}] ${r.kind} "${r.name}" -> ${t.source}/${t.kind} "${t.name}"${t.locked ? " (locked)" : ""}`);
}
if (conflicts.length) {
  console.log(`\nkind conflicts (${conflicts.length}):`);
  for (const c of conflicts) console.log(`  ${c}`);
}
console.log(`\nATM bank backfill (${atmBackfill.length}): ${atmBackfill.map((a) => `"${a.name}" -> ${a.bank}`).join(", ") || "none"}`);
const photoRows = rows.filter((r) => r.photos.length);
console.log(`photos: ${photoRows.reduce((n, r) => n + r.photos.length, 0)} to copy for ${photoRows.length} places (max ${MAX_PHOTOS} each, allowed licences only)${NO_IMAGES ? " - skipped (--no-images)" : ""}`);

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------
const f8 = (v) => (v === null || v === undefined ? "null::float8" : `${Number(v)}::float8`);
const t = (v) => `${lit(v ?? null)}::text`;
const arr = (list) => (list.length ? `array[${list.map((u) => lit(u)).join(", ")}]::text[]` : "'{}'::text[]");
const ts = (v) => `${lit(v ?? null)}::timestamptz`;
const GEOG = `case when s.lon is null then null else extensions.st_setsrid(extensions.st_makepoint(s.lon, s.lat), 4326)::extensions.geography end`;
const HOOD = `coalesce(
    case when s.lon is not null then (select b.neighbourhood_id from private.neighbourhood_boundaries b
      where extensions.st_contains(b.boundary, extensions.st_setsrid(extensions.st_makepoint(s.lon, s.lat), 4326)) limit 1) end,
    (select n.id from public.neighbourhoods n where s.hood is not null
      and replace(public.tr_norm(n.name), ' ', '') = replace(public.tr_norm(s.hood), ' ', '') limit 1),
    case when s.lon is not null then (select n.id from public.neighbourhoods n
      order by n.center operator(extensions.<->) extensions.st_setsrid(extensions.st_makepoint(s.lon, s.lat), 4326)::extensions.geography limit 1) end)`;

function upsertSql(list) {
  const values = list
    .map((r) => {
      const slug = plan.get(r.key).action === "own" ? plan.get(r.key).target.slug : r.slug;
      return `(${t(r.kind)}, ${t(r.name)}, ${t(slug)}, ${t(r.address)}, ${t(r.phone)}, ${f8(r.lng)}, ${f8(r.lat)}, ${t(r.hood)}, ${jsonLit(r.details)}, ${t(`guide/${r.key}`)}, ${t(r.license)}, ${arr(r.sourceUrls)}, ${t(r.email)}, ${t(r.website)}, ${ts(r.verified)})`;
    })
    .join(",\n  ");
  return `insert into public.poi as q (kind, name, slug, address, phone, location, neighbourhood_id, details, source, source_ref, license,
  source_urls, email, website, verified_at, last_seen_at)
select s.kind, s.name, s.slug, s.address, s.phone, ${GEOG}, ${HOOD}, s.details, 'manual', s.ref, s.license,
  s.urls, s.email, s.website, s.verified, now()
from (values
  ${values}
) as s(kind, name, slug, address, phone, lon, lat, hood, details, ref, license, urls, email, website, verified)
on conflict (source, source_ref) do update set
  kind = excluded.kind, name = excluded.name, address = excluded.address, phone = excluded.phone,
  location = coalesce(excluded.location, q.location),
  neighbourhood_id = case when excluded.location is null then coalesce(q.neighbourhood_id, excluded.neighbourhood_id) else excluded.neighbourhood_id end,
  details = q.details || excluded.details, license = excluded.license, source_urls = excluded.source_urls,
  email = excluded.email, website = excluded.website, verified_at = excluded.verified_at, last_seen_at = excluded.last_seen_at`;
}

function mergeSql(list) {
  const values = list
    .map((r) => {
      const target = plan.get(r.key).target;
      return `(${lit(target.id)}::uuid, ${t(r.address)}, ${t(r.phone)}, ${t(r.email)}, ${t(r.website)}, ${ts(r.verified)}, ${arr(r.sourceUrls)}, ${f8(r.lng)}, ${f8(r.lat)}, ${t(r.hood)}, ${jsonLit(r.details)}, ${t(r.key)}, ${t(r.osmId)})`;
    })
    .join(",\n  ");
  return `update public.poi p set
  address = coalesce(p.address, s.address),
  phone = coalesce(p.phone, s.phone),
  email = coalesce(p.email, s.email),
  website = coalesce(p.website, s.website),
  verified_at = coalesce(p.verified_at, s.verified),
  source_urls = (select coalesce(array_agg(y.u order by y.o), '{}'::text[])
                   from (select x.u, min(x.o) as o from unnest(p.source_urls || s.urls) with ordinality as x(u, o)
                          group by x.u order by min(x.o) limit 20) y),
  location = coalesce(p.location, ${GEOG}),
  neighbourhood_id = coalesce(p.neighbourhood_id, ${HOOD}),
  details = s.details
    || coalesce((select jsonb_object_agg(e.key, e.value)
                   from jsonb_each(case when jsonb_typeof(p.details) = 'object' then p.details else '{}'::jsonb end) e
                  where e.value not in ('[]'::jsonb, '""'::jsonb, 'null'::jsonb, '{}'::jsonb)), '{}'::jsonb)
    || jsonb_build_object('key', s.key)
    || case when s.osm is not null and not (p.details ? 'osm_id') then jsonb_build_object('osm_id', s.osm) else '{}'::jsonb end
    -- "diger" is the uncategorized fallback: the guide's category (e.g. ulasim for a pier) replaces it.
    || case when s.details ? 'category' and coalesce(p.details ->> 'category', 'diger') = 'diger'
            then jsonb_build_object('category', s.details -> 'category') else '{}'::jsonb end
from (values
  ${values}
) as s(id, address, phone, email, website, verified, urls, lon, lat, hood, details, key, osm)
where p.id = s.id`;
}

function backfillSql(list) {
  const values = list.map((a) => `(${lit(a.id)}::uuid, ${t(a.bank)})`).join(", ");
  return `update public.poi p set details = p.details || jsonb_build_object('bank', s.bank)
from (values ${values}) as s(id, bank)
where p.id = s.id and p.kind = 'atm' and not (p.details ? 'bank')`;
}

function statements() {
  const out = [];
  const upserts = rows.filter((r) => plan.get(r.key).action !== "merge");
  const merged = rows.filter((r) => plan.get(r.key).action === "merge");
  for (let i = 0; i < upserts.length; i += BATCH) out.push(upsertSql(upserts.slice(i, i + BATCH)));
  for (let i = 0; i < merged.length; i += BATCH) out.push(mergeSql(merged.slice(i, i + BATCH)));
  if (atmBackfill.length) out.push(backfillSql(atmBackfill));
  return out;
}

// ---------------------------------------------------------------------------
// Photos: Wikimedia Commons -> R2 (signed S3 PUT, SigV4; never prints keys)
// ---------------------------------------------------------------------------
const sha256hex = (b) => crypto.createHash("sha256").update(b).digest("hex");
const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();

async function r2Put(objectKey, body, contentType) {
  const { R2_ACCOUNT_ID: account, R2_ACCESS_KEY_ID: accessKey, R2_SECRET_ACCESS_KEY: secret, R2_BUCKET: bucket } = process.env;
  if (!account || !accessKey || !secret || !bucket) throw new Error("R2_* variables missing in .env.local");
  const host = `${account}.r2.cloudflarestorage.com`;
  const path = `/${bucket}/${objectKey.split("/").map(encodeURIComponent).join("/")}`;
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const payloadHash = sha256hex(body);
  const headers = {
    "cache-control": "public, max-age=31536000, immutable",
    "content-type": contentType,
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  const signed = Object.keys(headers).sort();
  const canonical = ["PUT", path, "", ...signed.map((h) => `${h}:${headers[h]}`), "", signed.join(";"), payloadHash].join("\n");
  const scope = `${date}/auto/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256hex(canonical)].join("\n");
  const kSign = hmac(hmac(hmac(hmac(`AWS4${secret}`, date), "auto"), "s3"), "aws4_request");
  const signature = crypto.createHmac("sha256", kSign).update(toSign).digest("hex");
  // host is signed but set by fetch itself.
  const send = { ...headers };
  delete send.host;
  const res = await fetch(`https://${host}${path}`, {
    method: "PUT",
    headers: { ...send, Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signed.join(";")}, Signature=${signature}` },
    body,
  });
  if (!res.ok) throw new Error(`R2 PUT ${res.status}`);
}

const CONTENT_TYPE = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** Copies each planned photo once; photos that could not be copied are dropped from the row. */
async function copyPhotos() {
  let copied = 0;
  let reused = 0;
  let failed = 0;
  for (const row of rows) {
    if (!row.photos.length) continue;
    const kept = [];
    for (const p of row.photos) {
      try {
        const head = await fetch(p.photo.url, { method: "HEAD" });
        if (head.ok) {
          reused++;
          kept.push(p.photo);
          continue;
        }
        const src = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(p.title)}?width=${PHOTO_WIDTH}`;
        const res = await fetch(src, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(60_000) });
        if (!res.ok) throw new Error(`Commons ${res.status}`);
        const type = res.headers.get("content-type") ?? "";
        if (!type.startsWith("image/")) throw new Error(`Commons type ${type}`);
        const body = Buffer.from(await res.arrayBuffer());
        if (body.length > MAX_PHOTO_BYTES) throw new Error(`too big (${Math.round(body.length / 1024)} KB)`);
        const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
        if (ext !== p.ext) throw new Error(`Commons sent ${type} for .${p.ext}`);
        await r2Put(p.objectKey, body, CONTENT_TYPE[ext]);
        copied++;
        kept.push(p.photo);
        await sleep(600);
      } catch (e) {
        failed++;
        console.error(`  photo skipped: ${row.name} #${p.objectKey.split("/").pop()}: ${String(e.message).slice(0, 120)}`);
      }
    }
    row.details.photos = kept;
    if (!kept.length) delete row.details.photos;
  }
  console.log(`photos: ${copied} copied, ${reused} already in R2, ${failed} skipped`);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
if (EMIT) {
  writeFileSync(EMIT, `${statements().join(";\n\n")};\n`);
  console.log(`\nSQL written to ${EMIT}`);
}
if (DRY_RUN) {
  console.log("\nDRY RUN: nothing written.");
  process.exit(0);
}
if (NO_IMAGES) {
  for (const row of rows) delete row.details.photos;
} else {
  await copyPhotos();
}
const list = statements();
let n = 0;
for (const s of list) {
  await sql(s, 2);
  n++;
  process.stdout.write(`\rwrote batch ${n}/${list.length}`);
}
console.log(`\ndone: ${rows.length} guide records written (${merges.length} merged into stored rows), ${atmBackfill.length} ATM banks filled.`);
