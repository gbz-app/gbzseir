// Kocaeli guide import (il geneli şehir rehberi): the researched kocaeli-guide.json (bank branches, ATMs, EV charging,
// PTT, government offices, fire stations, hospitals, public health units, schools, education, universities, libraries and
// notaries of the 12 districts) -> public.poi.
// Needs 2026091380_kocaeli_districts.sql live (districts, poi.district_id) and 2026091384_kocaeli_guide_categories.sql
// (institution category milli_egitim): the dry run reports a missing category, the import refuses to start without it.
//
// Usage (PowerShell, repo root, after dot-sourcing secrets.ps1 so SUPABASE_ACCESS_TOKEN is set):
//   node --env-file=.env.local scripts/db/import-kocaeli-guide.mjs --dry-run              plan, checks, counts (read-only)
//   node --env-file=.env.local scripts/db/import-kocaeli-guide.mjs --dry-run --rehearse   + the real write statements for every
//        matched row and a sample of new rows, run twice inside one transaction that always rolls back (runs 2026091384 in
//        it when the category is not live yet)
//   node --env-file=.env.local scripts/db/import-kocaeli-guide.mjs                        import
//   --file=<json>       the guide file (default kocaeli/_arastirma/kocaeli/kocaeli-guide.json)
//   --show=<text>       print the planned row of every record whose name or key contains <text> (Turkish-folded)
//   --show-merges       list every merge pair (default: counts and the first 40)
//   --samples=<n>       sample rows per record kind (default 10)
//   --batch=<n>         rows per write statement (default 500)
//   --include-dropped   also import the records the verification marked recommend_drop / likely_not_public
//
// Rules
//  * Kinds: bank -> bank (details.bank normalized, branch_code, hours, subkind when not a plain şube); atm -> atm
//    (details.bank, deposit, off_site, kamu_ortak_atm, institutional_atm, open_24h); ev_charge -> ev_charge
//    (details.operator, connectors {ac, dc, hpc, type, max_kw}, sockets, power_kw, capacity); everything else -> institution
//    with an institution_categories key in details.category and details.ownership (devlet | ozel): post_office/ptt -> ptt,
//    fire_station -> itfaiye, notary -> noter, library -> kutuphane, university -> universite, school -> anaokulu /
//    ilkokul / ortaokul / lise / ozel_egitim (OSM-only schools without a level, and the few whose name states another
//    level than the feed - KBB swapped some campuses - by their name), education -> egitim_kurumu,
//    hospital -> hastane, health -> agiz_dis (ADSM), toplum_sagligi (KETEM, AMATEM, verem savaş, toplum ruh sağlığı,
//    Kızılay), hastane (tıp merkezi), government -> the category of its subkind (milli_egitim needs 2026091384; valilik,
//    muhtarlık, göç, gümrük, sosyal hizmet, hükümet konağı -> diger_kamu with the subkind kept).
//  * Skipped: wheelchair_charging, cargo branches (not PTT), private practices / courses (dentists, doctors, labs,
//    private clinics and rehab, dershane / etüt; the earlier importer skipped private practices too), OSM mistags that
//    are not schools, the Yapı Kredi mobile-ATM depot, and (unless --include-dropped) the records the verification
//    marked recommend_drop or likely_not_public.
//  * Stable key = the record's key. Rows this importer creates: source 'manual', source_ref 'guide/<key>' (the city-guide
//    convention: the admin hides such rows instead of deleting them), details.guide_ref = key, details.import =
//    'kocaeli-guide'. Rows it merges into get details.guide_ref, so a re-run finds them again.
//  * district_id from the record's district (districts.name); records without one get it from the pin (zz_fill_district).
//    Records without coordinates are imported (lists; no pin). Verification: extra.verified -> verified_at
//    (verify_checked_at), verify_note (else the reason of a failed check) -> details.verify_note, needs_verification ->
//    details.needs_verification + details.verification_reasons, sources -> source_urls, OSM-derived -> ODbL licence.
//  * Matching, in order: its own row (source_ref) or an earlier merge (details.guide_ref); the identical name of the same
//    kind within 120 m (nearest first); the stored row of one of its OSM elements (extra.osm_id / osm_ids /
//    merge.osm_matched = source_ref of an OSM row or details.osm_id), same kind (an element stored as another kind - e.g.
//    a place - leaves the record out); else the same kind within 120 m with a similar name (Dice >= 0.6, or all
//    distinctive words shared and >= 0.5; names equal without spaces count as identical; numbers incl. Roman "II. Kademe",
//    school level and unit words (semt, ek bina, şube, fakülte...) must agree), institutions of a compatible category
//    (same key, a stored diger / diger_kamu, both health, both school levels, milli_egitim vs a stored egitim_kurumu),
//    ATMs / branches of the same bank (a generic name such as "Akbank ATM" goes to the nearest one of the same bank;
//    within 30 m for a stored ATM without a bank), EV stations of the same operator; an institution with the identical
//    name in the same district up to 1 km away, and rows without a pin by a near-identical name (>= 0.85, or >= 0.8 when
//    one name's distinctive words are all in the other) in the same district - both only when the pair is unique both
//    ways. Best pairs first, one to one. Institution records that repeat each other (same category, name >= 0.9, < 60 m)
//    are written once.
//  * Rows this importer created are refreshed from the file on a re-run (a row an admin edited - audit_log - only gets
//    what it misses). Every other stored row (the Gebze city guide, OSM, KBB open data) only gets what it misses (address,
//    phone, e-mail, website, pin, district, verified_at, details keys; a diger / diger_kamu category is replaced) plus
//    details.guide_ref and the source URLs; the verification flags only reach rows nobody verified. A locked row only gets
//    details.guide_ref (poi_before_write keeps its fields too). A Gebze mahalle (neighbourhood_id) is only set on Gebze
//    rows. Never deletes, never un-hides. Writes take the POI sync lock (one at a time with
//    poi_sync_apply and the KBB importer) and are idempotent, so a failed batch is fixed by running again.
// Prints public names and counts only. Never prints secrets.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { jsonLit, lit, runSql, sleep, sql, trSlug } from "./lib.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
const DRY = flag("dry-run");
const REHEARSE = flag("rehearse");
const SHOW_MERGES = flag("show-merges");
const INCLUDE_DROPPED = flag("include-dropped");
const SHOW = opt("show");
const SAMPLES = Math.max(0, Number(opt("samples") ?? 10) || 0);
const BATCH = Math.min(1000, Math.max(50, Number(opt("batch") ?? 500) || 500));
if (REHEARSE && !DRY) {
  console.error("--rehearse only works together with --dry-run");
  process.exit(2);
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = opt("file") ?? join(ROOT, "kocaeli", "_arastirma", "kocaeli", "kocaeli-guide.json");
const MIGRATION = join(ROOT, "supabase", "migrations", "2026091384_kocaeli_guide_categories.sql");
if (!existsSync(FILE)) {
  console.error(`guide file not found: ${FILE} (--file=<kocaeli-guide.json>)`);
  process.exit(2);
}

const REF_PREFIX = "guide/";
const IMPORT_MARK = "kocaeli-guide";
const OSM_LICENSE = "ODbL - © OpenStreetMap katkıcıları";
const NEAR_M = 120; // same place: similar name within this distance
const SPOT_M = 30; // a stored ATM without a bank: only this close
const FAR_M = 1000; // identical institution name in the same district, pins apart (0 = off)
const DUP_M = 60; // institution records of the file that repeat each other
const BOX = { minLat: 40.45, maxLat: 41.35, minLng: 29.2, maxLng: 30.5 }; // Kocaeli, generous
const REHEARSE_NEW_PER_KIND = 80;

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
// Text helpers (fold / phone / e-mail / website as in import-city-guide.mjs, titleTr as in import-kocaeli.mjs)
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
const squash = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const clip = (s, n) => {
  if (s === null || s === undefined || typeof s === "object") return null;
  const t = squash(s);
  return t ? t.slice(0, n) : null;
};
const keyOf = (s) => {
  if (s === null || s === undefined) return null;
  const k = fold(s).replace(/ /g, "_");
  return /^[a-z][a-z0-9_]{0,39}$/.test(k) ? k : null;
};
const num = (v) => (v === null || v === undefined || v === "" || typeof v === "boolean" || !Number.isFinite(Number(v)) ? null : Number(v));
const bool = (v) => (v === true ? true : v === false ? false : null);
const isCaps = (s) => /\p{L}/u.test(s) && s === s.toLocaleUpperCase("tr-TR");

const UPPER = new Set(["kbb", "avm", "sgk", "ptt", "afad", "kou", "osb", "gosb", "tcdd", "iskur", "isu", "meb", "tubitak", "gtu", "myo",
  "aso", "ram", "asm", "adsm", "ketem", "tsm", "sim", "tse", "toki", "tc", "ii", "iii", "iv", "vi", "vii", "viii", "ix", "xi", "xii"]);
const LOWER = new Set(["ve", "ile", "veya"]);
/** "GEBZE BİLİM VE SANAT MERKEZİ" -> "Gebze Bilim ve Sanat Merkezi" (Turkish casing; abbreviations stay upper case). */
function titleTr(s) {
  return squash(s)
    .split(" ")
    .map((w, i) => {
      const m = w.match(/^([^\p{L}\d]*)(.*?)([^\p{L}\d]*)$/u);
      const [, pre, core, post] = m ?? ["", "", w, ""];
      if (!core) return w;
      const key = fold(core);
      if (UPPER.has(key)) return pre + core.toLocaleUpperCase("tr-TR") + post;
      const lower = core.toLocaleLowerCase("tr-TR");
      if (i > 0 && LOWER.has(key)) return pre + lower + post;
      return pre + lower.replace(/(^|[-/(.])(\p{L})/gu, (_x, p, c) => p + c.toLocaleUpperCase("tr-TR")) + post;
    })
    .join(" ");
}
/** Typos of the source feeds (whole words, case kept by the replacement's first letter). */
const TYPOS = [[/\banaoklu\b/giu, "Anaokulu"], [/\bugulama\b/giu, "Uygulama"], [/\bkütüphhanesi\b/giu, "Kütüphanesi"]];
/** ALL CAPS names of two or more words are title-cased ("AMATEM", "PTT" stay). */
function cleanName(s) {
  let t = squash(s);
  if (!t) return null;
  t = isCaps(t) && t.split(" ").length >= 2 ? titleTr(t) : t;
  for (const [re, fix] of TYPOS) t = t.replace(re, fix);
  return t.slice(0, 200);
}

/** "+90 262 642 04 30" / "0262..." -> "+902626420430"; "444 95 95" -> "+904449595"; short codes stay. */
function phoneOf(p) {
  if (!p || typeof p === "object") return null;
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
  return /^https?:\/\/\S+$/i.test(w) && w.length <= 500 ? w : null;
}
function feeOf(v) {
  const f = clip(v, 200);
  if (!f) return null;
  if (/^yes$/i.test(f)) return "Ücretli";
  if (/^no$/i.test(f)) return "Ücretsiz";
  return f;
}
const dateOf = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const strip = (o) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && !v.length)));

// ---------------------------------------------------------------------------
// Brands (details.bank / operator keys of the app: BANKS / EV_OPERATORS in src/features/guide/lib/constants.ts)
// ---------------------------------------------------------------------------
const BANK_RULES = [
  [/merkez bankasi|\btcmb\b/, "tcmb"],
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
  [/\bptt/, "ptt"],
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
  [/en ?yakit/, "enyakit"],
  [/ovolt/, "ovolt"],
  [/\bbmw\b/, "bmw"],
];
function firstRule(rules, ...texts) {
  for (const t of texts) {
    const f = fold(t);
    if (!f) continue;
    for (const [re, key] of rules) if (re.test(f)) return key;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Classification: record -> {kind, category, subkind, ownership} or {skip}
// ---------------------------------------------------------------------------
const inst = (category, subkind = null, ownership = null) => ({ kind: "institution", category, subkind, ownership });
/** extra.ownership (public / private / kamu / ozel / universite_vakif), else the name ("Özel ..."), else `dflt`. */
function ownershipOf(r, dflt) {
  const o = r.extra?.ownership;
  if (o === "public" || o === "devlet" || o === "kamu") return "devlet";
  if (o === "private" || o === "ozel" || o === "universite_vakif") return "ozel";
  if (r.extra?.private === true || fold(r.name).startsWith("ozel ")) return "ozel";
  return dflt;
}

const GOV = {
  belediye: ["belediye"], kaymakamlik: ["kaymakamlik"], nufus: ["nufus"], tapu: ["tapu"], kadastro: ["tapu", "kadastro"],
  vergi: ["vergi"], sgk: ["sgk"], iskur: ["iskur"], muftuluk: ["muftuluk"], tarim: ["tarim"], oda: ["ticaret_odasi"],
  osb: ["osb"], jandarma: ["jandarma"], emniyet: ["emniyet"], adliye: ["adliye"], icra: ["icra"], kent_konseyi: ["kent_konseyi"],
  saglik_mudurlugu: ["ilce_saglik"], milli_egitim: ["milli_egitim"], muhtarlik: ["diger_kamu", "muhtarlik"],
  valilik: ["diger_kamu", "valilik"], hukumet_konagi: ["diger_kamu", "hukumet_konagi"], il_mudurlugu: ["diger_kamu", "il_mudurlugu"],
  sosyal_hizmet: ["diger_kamu", "sosyal_hizmet"], goc: ["diger_kamu", "goc"], gumruk: ["diger_kamu", "gumruk"], diger: ["diger_kamu"],
};
const SCHOOL_LEVEL = { anaokulu: "anaokulu", ilkokul: "ilkokul", ortaokul: "ortaokul", lise: "lise", ozel_egitim: "ozel_egitim" };

/** The one school level a name states ("X İlkokulu"), else null (none or several: "İlk ve Ortaokulu", "Özel Eğitim ..."). */
function nameLevel(n) {
  if (/ozel egitim|engelli|\bis okulu/.test(n)) return null;
  const found = [
    /\banaokul|\bkres\b|\byuva(si)?\b/.test(n) && "anaokulu",
    /\bilkokul|\bilk ?ogretim/.test(n) && "ilkokul",
    /\bortaokul/.test(n) && "ortaokul",
    /\blise(si)?\b/.test(n) && "lise",
  ].filter(Boolean);
  return found.length === 1 ? found[0] : null;
}

function schoolClass(r) {
  const n = fold(r.name);
  let category = SCHOOL_LEVEL[r.subkind];
  // KBB swaps the level of a few campuses ("Pelitli Halil Çelik İlkokulu" filed as ortaokul and its ortaokul as ilkokul):
  // the name the app shows decides, and the type-derived subkind of the wrong level is dropped.
  const named = category && category !== "ozel_egitim" ? nameLevel(n) : null;
  if (named && named !== category) return inst(named, named, ownershipOf(r, null));
  if (!category) {
    // OSM-only schools without a level (flagged by the merge): the name decides; a few are not schools at all.
    if (/futbol okulu|daire baskanligi|^muhendislik [a-z]$/.test(n)) return { skip: "not a school (OSM mistag)" };
    if (/\blise/.test(n)) category = "lise";
    else if (/anaokul|\bkres\b|cocuk kulubu|gunduz bakim|\byuva/.test(n)) category = "anaokulu";
    else if (/ortaokul/.test(n)) category = "ortaokul";
    else if (/ilk ?ogretim|ilk ve orta|ilkokul/.test(n)) category = "ilkokul";
    else category = "egitim_kurumu";
  }
  const t = fold(r.extra?.school_type ?? "");
  let subkind = category === "egitim_kurumu" ? null : category;
  if (/fen lisesi/.test(t)) subkind = "fen_lisesi";
  else if (/sosyal bilimler/.test(t)) subkind = "sosyal_bilimler_lisesi";
  else if (/imam hatip/.test(t)) subkind = category === "lise" ? "anadolu_imam_hatip_lisesi" : "imam_hatip_ortaokulu";
  else if (/mesleki ve teknik|mesem|mesleki egitim/.test(t)) subkind = "mesleki_teknik";
  else if (/anadolu lisesi/.test(t)) subkind = "anadolu_lisesi";
  else if (/guzel sanatlar/.test(t)) subkind = "guzel_sanatlar_lisesi";
  else if (/spor lisesi/.test(t)) subkind = "spor_lisesi";
  else if (/\bkres\b|gunduz bakim/.test(t)) subkind = "kres";
  else if (/engelli egitim merkezi/.test(t)) subkind = "engelli_egitim_merkezi";
  else if (/\bis okulu/.test(t)) subkind = "is_okulu";
  return inst(category, subkind, ownershipOf(r, null));
}

function healthClass(r) {
  const n = fold(r.name);
  if (r.subkind === "adsm") return inst("agiz_dis", "adsm", ownershipOf(r, "devlet"));
  if (/\b(amatem|camatem|ketem)\b|verem savas|toplum ruh sagligi|toplum sagligi merkezi/.test(n)) return inst("toplum_sagligi", null, "devlet");
  if (r.subkind === "blood_donation" || /\bkizilay/.test(n)) return inst("toplum_sagligi", "kan_bagisi", null);
  if (/aile sagligi merkezi|\basm\b/.test(n)) return inst("aile_sagligi_merkezi", null, "devlet");
  if (/\bmudurlugu\b/.test(n) && !/\bozel\b/.test(n)) return inst("diger_kamu", "sosyal_hizmet", "devlet");
  if (r.subkind === "clinic" && /tip merkezi/.test(n)) return inst("hastane", "tip_merkezi", "ozel");
  return { skip: "private practice / not an institution (health)" };
}

function classify(r) {
  const x = r.extra ?? {};
  if (r.kind === "wheelchair_charging") return { skip: "wheelchair charging point" };
  if (!INCLUDE_DROPPED && x.recommend_drop) return { skip: "verification: recommend_drop" };
  if (!INCLUDE_DROPPED && x.likely_not_public) return { skip: "verification: likely not a public office" };
  const n = fold(r.name);
  switch (r.kind) {
    case "bank":
      return { kind: "bank", subkind: r.subkind && r.subkind !== "sube" ? keyOf(r.subkind) : null };
    case "atm":
      if (r.subkind === "mobil_sube_atm_deposu") return { skip: "ATM depot (mobile branch stock)" };
      return { kind: "atm", subkind: keyOf(r.subkind) };
    case "ev_charge":
      return { kind: "ev_charge", subkind: keyOf(r.subkind) };
    case "post_office":
      return r.subkind === "ptt" ? inst("ptt", null, "devlet") : { skip: "cargo branch (not PTT)" };
    case "fire_station":
      return inst("itfaiye", r.subkind === "grup" ? "itfaiye_grubu" : r.subkind === "mufreze" ? "itfaiye_mufrezesi" : keyOf(r.subkind), "devlet");
    case "notary":
      return inst("noter", null, "devlet");
    case "library":
      return inst("kutuphane", keyOf(r.subkind), "devlet");
    case "university":
      return inst("universite", r.subkind === "yuksekokul" ? (/\bmyo\b|meslek yuksekokulu/.test(n) ? "myo" : "yuksekokul") : null, ownershipOf(r, null));
    case "school":
      return schoolClass(r);
    case "education": {
      if (r.subkind === "kurs" && /dershane|\betut\b|ozel ogretim kursu/.test(n)) return { skip: "private course (business)" };
      const sub = { halk_egitim_merkezi: "halk_egitim_merkezi", bilsem: "bilsem", ogretmenevi: "ogretmenevi", ram: "ram" }[r.subkind] ??
        (r.subkind === "kurs" ? (/kuran kursu/.test(n) ? "kuran_kursu" : "kurs") : null);
      return inst("egitim_kurumu", sub, ownershipOf(r, null));
    }
    case "hospital": {
      const sub = /semt poliklini/.test(n) ? "semt_poliklinigi" : r.subkind === "universite" ? "universite_hastanesi" : /egitim ve arastirma/.test(n) ? "egitim_arastirma" : null;
      return inst("hastane", sub, r.subkind === "ozel" ? "ozel" : "devlet");
    }
    case "health":
      return healthClass(r);
    case "government": {
      const [category, subkind] = GOV[r.subkind] ?? ["diger_kamu", keyOf(r.subkind)];
      return inst(category, r.subkind === "oda" && /sanayi odasi/.test(n) ? "sanayi_odasi" : subkind ?? null, "devlet");
    }
    default:
      return { skip: `unknown kind ${r.kind}` };
  }
}

// ---------------------------------------------------------------------------
// Row building
// ---------------------------------------------------------------------------
const OSM_ID = /^(node|way|relation)\/\d+$/;
function osmIdsOf(x) {
  const list = [x.osm_id, ...(Array.isArray(x.osm_ids) ? x.osm_ids : []), ...(Array.isArray(x.merge?.osm_matched) ? x.merge.osm_matched : [])];
  return [...new Set(list.filter((v) => typeof v === "string" && OSM_ID.test(v)))];
}
function maxKw(c) {
  const vals = [c.kw, c.max_kw, ...(Array.isArray(c.power_kw) ? c.power_kw : [c.power_kw])].map(num).filter((v) => v !== null && v > 0);
  return vals.length ? Math.max(...vals) : null;
}
function connectorsOf(c) {
  if (!c || typeof c !== "object" || Array.isArray(c)) return null;
  const out = strip({
    ac: num(c.ac_units ?? c.ac_count),
    dc: num(c.dc_units ?? c.dc_count),
    hpc: num(c.hpc_count),
    type: typeof c.type === "string" ? keyOf(c.type) : null,
    max_kw: maxKw(c),
  });
  return Object.keys(out).length ? out : null;
}
function socketsOf(s) {
  if (!s || typeof s !== "object" || Array.isArray(s)) return null;
  const out = {};
  for (const [k, v] of Object.entries(s)) if (/^[a-z][a-z0-9_]{0,39}$/.test(k) && num(v) !== null) out[k] = num(v);
  return Object.keys(out).length ? out : null;
}

const districts = await ro(`select id, name from public.districts order by sort`);
if (districts.length !== 12) {
  console.error(`public.districts has ${districts.length} rows: apply 2026091380_kocaeli_districts.sql first`);
  process.exit(2);
}
const districtId = new Map(districts.map((d) => [fold(d.name), d.id]));
const liveCats = new Map((await ro(`select key, active from public.institution_categories`)).map((c) => [c.key, c.active]));

function build(r, cls) {
  const x = r.extra ?? {};
  const lat = num(r.lat);
  const lng = num(r.lng);
  const pin = lat !== null && lng !== null && lat >= BOX.minLat && lat <= BOX.maxLat && lng >= BOX.minLng && lng <= BOX.maxLng;
  const phones = [...new Set((Array.isArray(r.phones) ? r.phones : []).map(phoneOf).filter(Boolean))].slice(0, 8);
  const brandText = [r.brand_or_operator, typeof x.operator === "string" ? x.operator : null, r.name];
  const urls = [...new Set((r.sources ?? []).map(String).filter((u) => /^https?:\/\/\S+$/i.test(u) && u.length <= 1000))].slice(0, 20);
  const osmIds = osmIdsOf(x);
  const osmDerived = urls.some((u) => /openstreetmap\.org/i.test(u)) || x.geocoded === true || x.merge?.provenance === "osm" ||
    x.merge?.coords_from?.source === "osm";
  const flagged = x.needs_verification === true;
  const isAtm = cls.kind === "atm";
  const isBank = cls.kind === "bank";
  const isEv = cls.kind === "ev_charge";
  const connectors = isEv ? connectorsOf(x.connectors) : null;
  const details = strip({
    category: cls.category ?? null,
    subkind: cls.subkind ?? null,
    ownership: cls.ownership ?? null,
    phones,
    fax: phoneOf(x.fax),
    hours: clip(r.hours, 500),
    fee: isEv ? feeOf(x.fee) : null,
    bank: isAtm || isBank ? firstRule(BANK_RULES, ...brandText) : null,
    branch_code: isBank && x.branch_code !== null && x.branch_code !== undefined ? clip(String(x.branch_code), 40) : null,
    deposit: isAtm ? bool(x.deposit) : null,
    off_site: isAtm ? bool(x.off_site) : null,
    kamu_ortak_atm: isAtm ? bool(x.kamu_ortak_atm) : null,
    institutional_atm: isAtm ? bool(x.institutional_atm) : null,
    open_24h: isAtm ? bool(x["24h"]) : null,
    operator: isEv ? firstRule(EV_RULES, ...brandText) : null,
    connectors,
    sockets: isEv ? socketsOf(x.sockets) : null,
    power_kw: connectors?.max_kw ?? null,
    capacity: isEv ? num(x.capacity) : null,
    temporarily_closed: x.temporarily_closed === true || x.closed_temporarily === true ? true : null,
    verify_note: clip(x.verify_note ?? (x.verified === false ? x.verify_reason : null), 1000),
    needs_verification: flagged ? true : null,
    verification_reasons: flagged ? (x.merge?.verification_reasons ?? []).map((s) => clip(s, 300)).filter(Boolean).slice(0, 10) : null,
    osm_id: osmIds[0] ?? null,
    wikidata: clip(x.wikidata, 40),
    guide_ref: r.key,
    import: IMPORT_MARK,
  });
  return {
    key: r.key,
    srcKind: r.kind,
    kind: cls.kind,
    category: cls.category ?? null,
    name: cleanName(r.name),
    address: clip(r.address, 300),
    phone: phones[0] ?? null,
    email: emailOf(r.email),
    website: websiteOf(r.website),
    lat: pin ? lat : null,
    lng: pin ? lng : null,
    pinRejected: (lat !== null || lng !== null) && !pin,
    district: r.district ? districtId.get(fold(r.district)) ?? null : null,
    districtUnknown: !!r.district && !districtId.has(fold(r.district)),
    details,
    urls,
    verified: x.verified === true ? dateOf(x.verify_checked_at) ?? dateOf(r.checked_at) : null,
    license: osmDerived ? OSM_LICENSE : null,
    osmIds,
    bank: details.bank ?? null,
    operator: details.operator ?? null,
    plan: null,
  };
}

const input = JSON.parse(readFileSync(FILE, "utf8").replace(/^﻿/, ""));
const records = Array.isArray(input) ? input : input.records;
if (!Array.isArray(records)) throw new Error("kocaeli-guide.json: no records array");
const keysSeen = new Set();
const skipped = []; // {r, reason}
const rows = [];
for (const r of records) {
  if (!r?.key || keysSeen.has(r.key) || !cleanName(r.name)) {
    skipped.push({ r, reason: !r?.key ? "no key" : keysSeen.has(r.key) ? "duplicate key" : "no name" });
    continue;
  }
  keysSeen.add(r.key);
  const cls = classify(r);
  if (cls.skip) {
    skipped.push({ r, reason: cls.skip });
    continue;
  }
  rows.push(build(r, cls));
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------
const DISTRICT_WORDS = districts.map((d) => fold(d.name));
const STOP = new Set(["mahallesi", "mah", "mh", "ve", "kocaeli", "ile", "t", "c", "tc", ...DISTRICT_WORDS]);
const GENERIC = {
  inst: ["mudurlugu", "merkezi", "okulu", "ilkokulu", "ortaokulu", "lisesi", "anaokulu", "vatandaslik"],
  bank: ["atm", "sube", "subesi", "sb", "bankasi", "bank", "banka", "a", "s", "as", "tas", "ticari", "bireysel", "lobi", "kiosk", "aio",
    "self", "servis", "cihazi", "ziraat", "halkbank", "halk", "vakifbank", "vakif", "vakiflar", "is", "turkiye", "garanti", "bbva", "akbank",
    "yapi", "kredi", "qnb", "finansbank", "denizbank", "deniz", "teb", "ekonomi", "kuveyt", "turk", "katilim", "albaraka", "finans",
    "sekerbank", "odeabank", "fibabanka", "anadolubank", "alternatif", "alternatifbank", "burgan", "emlak", "ing", "hsbc", "ptt",
    "pttmatik", "cumhuriyet", "merkez"],
  ev: ["sarj", "istasyonu", "elektrikli", "arac", "trugo", "togg", "zes", "zorlu", "sharz", "net", "esarj", "voltrun", "tesla",
    "supercharger", "astor", "beefull", "ovolt", "bmw", "enyakit", "en", "yakit", "dc", "ac", "hpc"],
};
for (const k of Object.keys(GENERIC)) GENERIC[k] = new Set(GENERIC[k]);
const LEVEL_TYPE = { anaokulu: "ana", anaokul: "ana", kres: "ana", ilkokulu: "ilk", ilkokul: "ilk", ortaokulu: "orta", ortaokul: "orta", lisesi: "lise", lise: "lise" };
/** Words that make a unit of a bigger institution: they must agree ("X Devlet Hastanesi" is not its "Semt Polikliniği"). */
const UNIT = new Set(["semt", "poliklinigi", "ek", "binasi", "sube", "subesi", "kampusu", "kampus", "yerleskesi", "fakultesi", "myo",
  "yuksekokulu", "bolumu", "enstitusu", "mufrezesi", "lojmani", "tesisleri", "istasyonu"]);
const groupOf = (kind) => (kind === "institution" ? "inst" : kind === "ev_charge" ? "ev" : "bank");
const mainName = (s) => String(s ?? "").replace(/\(.*?\)/g, " ");
const coreTokens = (name, group) => fold(mainName(name)).split(" ").filter((t) => t && !STOP.has(t) && !GENERIC[group].has(t));
const isGeneric = (name, group) => coreTokens(name, group).length === 0;
const isNum = (t) => /^\d+$/.test(t);
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
const sameName = (a, b) => {
  const fa = fold(mainName(a));
  return !!fa && fa === fold(mainName(b));
};
const ROMAN = { i: "1", ii: "2", iii: "3", iv: "4", v: "5", vi: "6", vii: "7", viii: "8", ix: "9", x: "10" };
/** Numbers of the whole name, parentheses included ("II. Kademe", "(III.KADEME)", "1. Noterliği"). */
const numbersOf = (words) => words.map((t) => (isNum(t) ? String(Number(t)) : ROMAN[t])).filter(Boolean).sort().join(",");
/**
 * Name similarity 0..1 (0 = no match). Numbers must agree (institutions: also when only one side has one - "X Okulu" is
 * not "X Okulu II. Kademe"), and so must the school level and the unit words.
 */
function nameScore(a, b, group) {
  const wa = fold(a).split(" ");
  const wb = fold(b).split(" ");
  const na = numbersOf(wa);
  const nb = numbersOf(wb);
  if (na !== nb && (group === "inst" || (na && nb))) return 0;
  if (sameName(a, b)) return 1;
  // Spelling variants that only differ in spaces ("Yahyakaptan" / "Yahya Kaptan", "Mustafapaşa" / "Mustafa Paşa").
  const sa = fold(mainName(a)).replace(/ /g, "");
  if (sa && sa === fold(mainName(b)).replace(/ /g, "")) return 1;
  const ya = new Set(wa.map((t) => LEVEL_TYPE[t]).filter(Boolean));
  const yb = new Set(wb.map((t) => LEVEL_TYPE[t]).filter(Boolean));
  if (ya.size && yb.size && ![...ya].some((t) => yb.has(t))) return 0;
  if (group === "inst") {
    const ua = wa.filter((t) => UNIT.has(t)).sort().join(",");
    const ub = wb.filter((t) => UNIT.has(t)).sort().join(",");
    if (ua !== ub) return 0;
  }
  const ta = coreTokens(a, group);
  const tb = coreTokens(b, group);
  if (!ta.length || !tb.length) return 0;
  const ca = ta.join(" ");
  const cb = tb.join(" ");
  if (ca === cb) return 1;
  const d = dice(ca, cb);
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const contained = short.every((t) => long.includes(t));
  return d >= 0.6 || (contained && d >= 0.5) ? d : 0;
}
function distM(a, b) {
  const R = 6371008.8;
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const HEALTH = new Set(["hastane", "aile_sagligi_merkezi", "toplum_sagligi", "agiz_dis", "ilce_saglik"]);
/** School levels: the names decide (nameScore makes the level words agree), a stored row may carry another level. */
const SCHOOL = new Set(["anaokulu", "ilkokul", "ortaokul", "lise", "ozel_egitim"]);
/**
 * Record category a vs stored category b: the same key, a stored row still on a fallback, two health categories, two
 * school levels, or a milli eğitim müdürlüğü the Gebze guide filed under egitim_kurumu (milli_egitim did not exist).
 */
const catCompatible = (a, b) => !b || a === b || b === "diger_kamu" || b === "diger" || (HEALTH.has(a) && HEALTH.has(b)) ||
  (SCHOOL.has(a) && SCHOOL.has(b)) || (a === "milli_egitim" && b === "egitim_kurumu");
/** 0 = not the same thing, 1 = compatible, 2 = weak (a stored ATM / branch whose bank is unknown). */
function compatible(row, e) {
  if (row.kind !== e.kind) return 0;
  if (row.kind === "institution") return catCompatible(row.category, e.category) ? 1 : 0;
  if (row.kind === "atm" || row.kind === "bank") {
    const b = e.bank ?? firstRule(BANK_RULES, e.name);
    if (!b) return 2;
    return b === row.bank ? 1 : 0;
  }
  const o = e.operator ?? firstRule(EV_RULES, e.name);
  return !o || !row.operator || o === row.operator ? 1 : 0;
}
/** Stored and record at the same spot although the names say nothing (generic names, same bank / operator). */
function spotRule(row, e, d, weak) {
  const g = groupOf(row.kind);
  if (row.kind === "institution") return false;
  if (weak) return row.kind === "atm" && isGeneric(e.name, g) && d <= SPOT_M;
  if (row.kind === "atm") return isGeneric(e.name, g) || isGeneric(row.name, g) || d <= SPOT_M;
  if (row.kind === "bank") return isGeneric(e.name, g) || d <= SPOT_M;
  return isGeneric(e.name, g) || isGeneric(row.name, g) || d <= 50;
}

const MY_KINDS = new Set(["institution", "atm", "bank", "ev_charge"]);
const existing = (await ro(`select id, kind, name, slug, source, source_ref, lat, lng, locked, hidden, district_id,
    verified_at is not null as verified, details ->> 'category' as category, details ->> 'bank' as bank,
    details ->> 'operator' as operator, details ->> 'osm_id' as osm_id, details ->> 'guide_ref' as guide_ref,
    details ->> 'import' as import_mark
  from public.poi where source <> 'demo'`)).map((e) => ({ ...e, lat: e.lat == null ? null : Number(e.lat), lng: e.lng == null ? null : Number(e.lng) }));
const takenSlugs = new Set((await ro(`select slug from public.poi`)).map((r) => r.slug));
const byOwnRef = new Map(existing.filter((e) => e.source === "manual" && e.source_ref?.startsWith(REF_PREFIX)).map((e) => [e.source_ref.slice(REF_PREFIX.length), e]));
const byGuideRef = new Map(existing.filter((e) => e.guide_ref).map((e) => [e.guide_ref, e]));
const byOsm = new Map();
const addOsm = (id, e) => {
  if (!byOsm.has(id)) byOsm.set(id, []);
  if (!byOsm.get(id).includes(e)) byOsm.get(id).push(e);
};
for (const e of existing) {
  if (e.source === "osm" && OSM_ID.test(e.source_ref ?? "")) addOsm(e.source_ref, e);
  if (e.osm_id && OSM_ID.test(e.osm_id)) addOsm(e.osm_id, e);
}

const claimed = new Set();
const conflicts = [];
const claim = (row, action, e, rule, d = null) => {
  row.plan = { action, target: e, rule, d };
  if (e) claimed.add(e.id);
};
// Pass 1: own row / earlier merge.
for (const row of rows) {
  const own = byOwnRef.get(row.key);
  const e = own ?? byGuideRef.get(row.key);
  if (!e || claimed.has(e.id)) continue;
  if (e.kind !== row.kind) {
    row.plan = { action: "conflict", target: e, rule: `stored as ${e.kind}` };
    conflicts.push(`${row.name}: its stored row is a ${e.kind} now, the record a ${row.kind} - left as it is`);
    continue;
  }
  claim(row, own ? "own" : "link", e, own ? "own" : "guide_ref");
}
// Pass 2: institution records that repeat each other (same category, near-identical name, < 60 m): the first one wins.
const instRows = rows.filter((r) => r.kind === "institution" && r.lat !== null);
for (let i = 0; i < instRows.length; i++) {
  const a = instRows[i];
  if (a.plan?.action === "dup") continue;
  for (let j = i + 1; j < instRows.length; j++) {
    const b = instRows[j];
    if (b.plan || a.category !== b.category || distM(a, b) >= DUP_M || nameScore(a.name, b.name, "inst") < 0.9) continue;
    if (a.plan && a.plan.action !== "own" && a.plan.action !== "link") continue;
    b.plan = { action: "dup", target: null, of: a.name, rule: "same place in the file" };
  }
}
// Pass 3a: the identical name of the same kind within NEAR_M, nearest first. It goes before the OSM elements: the Gebze
// guide attached some OSM elements to the neighbouring school of a campus ("... Lisesi" / "... Anadolu Lisesi"), and the
// record of the element must not take the row that another record names exactly.
const exact = [];
for (const row of rows) {
  if (row.plan || row.lat === null) continue;
  for (const e of existing) {
    if (e.kind !== row.kind || !MY_KINDS.has(e.kind) || e.lat === null || claimed.has(e.id) || !sameName(row.name, e.name)) continue;
    if (compatible(row, e) !== 1 || nameScore(row.name, e.name, groupOf(row.kind)) < 1) continue;
    const d = distM(row, e);
    if (d < NEAR_M) exact.push({ row, e, d });
  }
}
exact.sort((a, b) => a.d - b.d);
for (const p of exact) {
  if (p.row.plan || claimed.has(p.e.id)) continue;
  claim(p.row, "merge", p.e, "name 1.00", p.d);
}
// Pass 3b: OSM elements. A stored row whose exact name belongs to another record of the same kind in its district (up to
// FAR_M away, e.g. the "... Anadolu Lisesi" of a campus whose element the Gebze guide gave that row) is left to that record.
const namedByOther = (e, row) => !sameName(row.name, e.name) && rows.some((o) => o !== row && !o.plan && o.kind === e.kind &&
  sameName(o.name, e.name) && o.district && o.district === e.district_id && (o.lat === null || e.lat === null || distM(o, e) < FAR_M));
for (const row of rows) {
  if (row.plan) continue;
  let hit = null;
  let other = null;
  for (const id of row.osmIds) {
    for (const e of byOsm.get(id) ?? []) {
      if (claimed.has(e.id)) continue;
      if (e.kind === row.kind && namedByOther(e, row)) continue;
      if (e.kind === row.kind) hit ??= { e, id };
      else other ??= { e, id };
    }
  }
  if (hit) claim(row, "merge", hit.e, `osm ${hit.id}`);
  else if (other) {
    // Another kind already carries the element (e.g. a place): the place is in the guide, a second row would repeat it.
    row.plan = { action: "conflict", target: other.e, rule: `osm ${other.id} stored as ${other.e.kind}` };
    conflicts.push(`${row.name} (${row.kind}): OSM ${other.id} is stored as ${other.e.source}/${other.e.kind} "${other.e.name}" - left out`);
  }
}
// Pass 4: same kind, similar name nearby; identical institution name up to 1 km; rows without a pin by name.
/** Every distinctive word of the shorter name is in the longer one ("Nurşen Ceylan" / "Nurşen Ceylan Özelsin"). */
const contained = (a, b, g) => {
  const ta = coreTokens(a, g);
  const tb = coreTokens(b, g);
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return short.length > 0 && short.every((t) => long.includes(t));
};
const candidates = new Map();
for (const e of existing) {
  if (!MY_KINDS.has(e.kind) || claimed.has(e.id)) continue;
  if (!candidates.has(e.kind)) candidates.set(e.kind, []);
  candidates.get(e.kind).push(e);
}
const near = [];
const loose = []; // far identical names and pinless pairs: only when unique both ways
for (const row of rows) {
  if (row.plan) continue;
  const g = groupOf(row.kind);
  for (const e of candidates.get(row.kind) ?? []) {
    const c = compatible(row, e);
    if (!c) continue;
    if (row.lat !== null && e.lat !== null) {
      const d = distM(row, e);
      if (d < NEAR_M) {
        const s = c === 1 ? nameScore(row.name, e.name, g) : 0;
        if (s > 0) near.push({ row, e, score: 1 + s + 0.2 * (1 - d / NEAR_M), d, rule: `name ${s.toFixed(2)}` });
        else if (spotRule(row, e, d, c === 2)) near.push({ row, e, score: 0.5 + 0.2 * (1 - d / NEAR_M), d, rule: row.kind === "ev_charge" ? "same operator" : "same bank" });
      } else if (FAR_M && d < FAR_M && row.kind === "institution" && c === 1 && row.district && e.district_id === row.district && sameName(row.name, e.name)) {
        loose.push({ row, e, s: 1, d, rule: "same name, same district" });
      }
    } else if (c === 1 && row.district && e.district_id === row.district) {
      const s = nameScore(row.name, e.name, g);
      if (s >= 0.85 || (s >= 0.8 && contained(row.name, e.name, g))) loose.push({ row, e, s, d: null, rule: `name ${s.toFixed(2)}, no pin` });
    }
  }
}
near.sort((a, b) => b.score - a.score || a.d - b.d);
for (const p of near) {
  if (p.row.plan || claimed.has(p.e.id)) continue;
  claim(p.row, "merge", p.e, p.rule, p.d);
}
// Best pairs first; a pair is left alone while a rival (another pair of its record or of its stored row, both sides
// still free) scores within 0.1 of it: two same-name schools of a district, "Gebze OSB" vs "Gebze Güzeller OSB"...
let ambiguous = 0;
loose.sort((a, b) => b.s - a.s || (a.d ?? 1e9) - (b.d ?? 1e9));
for (const p of loose) {
  if (p.row.plan || claimed.has(p.e.id)) continue;
  const rival = loose.some((q) => q !== p && (q.row === p.row || q.e === p.e) && !q.row.plan && !claimed.has(q.e.id) && q.s >= p.s - 0.1);
  if (rival) {
    ambiguous++;
    continue;
  }
  claim(p.row, "merge", p.e, p.rule, p.d);
}
// New rows: slugs (unique across all POIs). A taken slug gets the district, then a number.
const PREFIX = { atm: "atm-", bank: "banka-", ev_charge: "sarj-" };
function slugBase(row) {
  const prefix = PREFIX[row.kind] ?? "";
  let core = row.name.replace(/\(([^)]*)\)/g, " $1 ");
  if (row.kind === "atm") core = core.replace(/\batm\b/gi, " ");
  if (row.kind === "ev_charge") core = core.replace(/elektrikli ara[çc] şarj istasyonu/giu, " ");
  let s = trSlug(core);
  if (prefix) s = s.replace(new RegExp(`^${prefix.slice(0, -1)}-`), "");
  return `${prefix}${(s || (row.kind === "institution" ? "kurum" : "nokta")).slice(0, 70)}`.replace(/-+$/, "");
}
for (const row of rows) {
  if (row.plan) continue;
  const base = slugBase(row);
  const d = row.district ?? "kocaeli";
  let s = base;
  if (takenSlugs.has(s)) s = `${base}-${d}`;
  let i = 2;
  while (takenSlugs.has(s)) s = `${base}-${d}-${i++}`;
  takenSlugs.add(s);
  row.slug = s;
  row.plan = { action: "new", target: null, rule: "new" };
}
const WRITE = new Set(["new", "own", "link", "merge"]);
const written = rows.filter((r) => WRITE.has(r.plan.action));

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
const act = (list, a) => list.filter((r) => r.plan.action === a).length;
console.log(`${DRY ? "DRY RUN (nothing written)" : "IMPORT"}: ${records.length} records in ${FILE.split(/[\\/]/).pop()}; stored POIs read ${existing.length} (demo rows ignored)`);

// Categories: every mapped key must be live.
const usedCats = [...new Set(written.filter((r) => r.kind === "institution").map((r) => r.category))].sort();
const missingCats = usedCats.filter((k) => !liveCats.has(k));
const inactiveCats = usedCats.filter((k) => liveCats.get(k) === false);
console.log(`\ninstitution categories used: ${usedCats.length} - ${missingCats.length ? `MISSING ${missingCats.join(", ")} (apply 2026091384_kocaeli_guide_categories.sql)` : "all live"}${inactiveCats.length ? `; inactive: ${inactiveCats.join(", ")}` : ""}`);
const unknownDistricts = rows.filter((r) => r.districtUnknown);
console.log(`districts: ${rows.filter((r) => r.district).length} rows by the record's district, ${rows.filter((r) => !r.district).length} from the pin (null in the file)${unknownDistricts.length ? `, UNKNOWN names: ${[...new Set(unknownDistricts.map((r) => r.key.split(":")[1]))].join(", ")}` : ""}; pins outside the Kocaeli box dropped: ${rows.filter((r) => r.pinRejected).length}`);

console.log(`\nskipped (${skipped.length}): ${tally(skipped, (s) => `${s.r?.kind}: ${s.reason}`)}`);

console.log(`\nplan per record kind (new = new row, own = its row from an earlier run, link = merged earlier, merge = matched to a stored row, dup = repeats another record, conflict = left out):`);
console.log(`${pad("record kind", 20)}${padL("total", 6)}${padL("skip", 6)}${padL("new", 6)}${padL("own", 5)}${padL("link", 5)}${padL("merge", 7)}${padL("dup", 5)}${padL("confl", 6)}${padL("no pin", 8)}${padL("flagged", 8)}${padL("verified", 9)}${padL("phone", 7)}`);
const srcKinds = [...new Set(records.map((r) => r.kind))];
for (const k of srcKinds) {
  const list = rows.filter((r) => r.srcKind === k);
  const w = list.filter((r) => WRITE.has(r.plan.action));
  console.log(
    `${pad(k, 20)}${padL(records.filter((r) => r.kind === k).length, 6)}${padL(skipped.filter((s) => s.r?.kind === k).length, 6)}${padL(act(list, "new"), 6)}${padL(act(list, "own"), 5)}${padL(act(list, "link"), 5)}${padL(act(list, "merge"), 7)}${padL(act(list, "dup"), 5)}${padL(act(list, "conflict"), 6)}${padL(w.filter((r) => r.lat === null).length, 8)}${padL(w.filter((r) => r.details.needs_verification).length, 8)}${padL(w.filter((r) => r.verified).length, 9)}${padL(w.filter((r) => r.phone).length, 7)}`,
  );
}
console.log(`${pad("all", 20)}${padL(records.length, 6)}${padL(skipped.length, 6)}${padL(act(rows, "new"), 6)}${padL(act(rows, "own"), 5)}${padL(act(rows, "link"), 5)}${padL(act(rows, "merge"), 7)}${padL(act(rows, "dup"), 5)}${padL(act(rows, "conflict"), 6)}${padL(written.filter((r) => r.lat === null).length, 8)}${padL(written.filter((r) => r.details.needs_verification).length, 8)}${padL(written.filter((r) => r.verified).length, 9)}${padL(written.filter((r) => r.phone).length, 7)}`);

const DIST = districts.map((d) => d.id);
const kindKey = (r) => (r.kind === "institution" ? `institution/${r.category}` : r.kind);
const districtOf = (r) => (r.plan.target && r.plan.action === "merge" ? r.plan.target.district_id ?? r.district : r.district);
console.log(`\nrows written per kind / category x district (new + matched; "-" = from the pin):`);
console.log(`${pad("kind/category", 34)}${DIST.map((d) => padL(d.slice(0, 7), 8)).join("")}${padL("-", 5)}${padL("total", 7)}${padL("new", 6)}`);
for (const k of [...new Set(written.map(kindKey))].sort()) {
  const list = written.filter((r) => kindKey(r) === k);
  console.log(`${pad(k, 34)}${DIST.map((d) => padL(list.filter((r) => districtOf(r) === d).length || ".", 8)).join("")}${padL(list.filter((r) => !districtOf(r)).length || ".", 5)}${padL(list.length, 7)}${padL(act(list, "new"), 6)}`);
}
const perDistrict = DIST.map((d) => `${d} ${written.filter((r) => districtOf(r) === d).length}`).join(", ");
console.log(`per district: ${perDistrict}, from the pin ${written.filter((r) => !districtOf(r)).length}`);
console.log(`ownership (institutions): ${tally(written.filter((r) => r.kind === "institution"), (r) => r.details.ownership)}`);
console.log(`institution subkinds: ${tally(written.filter((r) => r.kind === "institution" && r.details.subkind), (r) => `${r.category}/${r.details.subkind}`)}`);
console.log(`ATM banks: ${tally(written.filter((r) => r.kind === "atm"), (r) => r.details.bank)}`);
console.log(`bank branches: ${tally(written.filter((r) => r.kind === "bank"), (r) => r.details.bank)}`);
console.log(`EV operators: ${tally(written.filter((r) => r.kind === "ev_charge"), (r) => r.details.operator)}`);
console.log(`licence ODbL (OSM-derived): ${written.filter((r) => r.license).length}; with an OSM id: ${written.filter((r) => r.details.osm_id).length}; temporarily closed: ${written.filter((r) => r.details.temporarily_closed).length}`);

const merges = rows.filter((r) => r.plan.action === "merge");
console.log(`\nmerge plan: ${merges.length} records into stored rows (they only get what they miss) - rules: ${tally(merges, (r) => r.plan.rule.replace(/ [0-9.]+(, no pin)?$/, "$1").replace(/^osm .*/, "osm element"))}`);
console.log(`merged into: ${tally(merges, (r) => `${r.plan.target.source}/${r.plan.target.kind}${r.plan.target.import_mark ? ` (${r.plan.target.import_mark})` : ""}${r.plan.target.locked ? " locked" : ""}${r.plan.target.hidden ? " hidden" : ""}`)}`);
console.log(`stored rows that get a pin: ${merges.filter((r) => r.plan.target.lat === null && r.lat !== null).length}; ambiguous name pairs left alone: ${ambiguous}; repeats inside the file written once: ${act(rows, "dup")}`);
const mline = (r) => {
  const p = r.plan;
  const t = p.target;
  return `  [${p.rule}${p.d != null ? `, ${Math.round(p.d)} m` : ""}] ${r.kind}${r.category ? `/${r.category}` : ""} "${r.name}" -> ${t.source}/${t.kind}${t.category ? `/${t.category}` : ""} "${t.name}"${t.locked ? " (locked)" : ""}${t.hidden ? " (hidden)" : ""}`;
};
for (const r of SHOW_MERGES ? merges : merges.slice(0, 40)) console.log(mline(r));
if (!SHOW_MERGES && merges.length > 40) console.log(`  ... ${merges.length - 40} more (--show-merges)`);
const dups = rows.filter((r) => r.plan.action === "dup");
if (dups.length) console.log(`repeats: ${dups.map((r) => `"${r.name}" = "${r.plan.of}"`).join("; ")}`);
if (conflicts.length) {
  console.log(`\nconflicts (${conflicts.length}):`);
  for (const c of conflicts) console.log(`  ${c}`);
}

function line(row) {
  const p = row.plan;
  const d = row.details;
  const what = row.kind === "institution" ? `${row.category}${d.subkind ? `/${d.subkind}` : ""}${d.ownership ? ` ${d.ownership}` : ""}` : `${row.kind}${d.bank ? `/${d.bank}` : ""}${d.operator ? `/${d.operator}` : ""}${d.subkind ? ` ${d.subkind}` : ""}`;
  const flags = [row.lat === null ? "no pin" : null, d.needs_verification ? "flagged" : null, row.verified ? "verified" : null, row.phone ? "tel" : null, row.address ? "addr" : null].filter(Boolean).join(",");
  const tgt = p.target ? ` -> ${p.target.source}/${p.target.kind} "${p.target.name}" [${p.rule}${p.d != null ? `, ${Math.round(p.d)} m` : ""}]` : p.action === "dup" ? ` = "${p.of}"` : "";
  return `  ${pad(p.action, 8)} ${row.name} | ${what} | ${row.district ?? "-"} | ${flags}${tgt}`;
}
if (SAMPLES) {
  console.log(`\nsamples (${SAMPLES} per record kind, spread over the file):`);
  for (const k of srcKinds) {
    const list = rows.filter((r) => r.srcKind === k);
    if (!list.length) {
      console.log(`${k}: none written (${tally(skipped.filter((s) => s.r?.kind === k), (s) => s.reason)})`);
      continue;
    }
    console.log(`${k} (${list.length}):`);
    const n = Math.min(SAMPLES, list.length);
    for (let i = 0; i < n; i++) console.log(line(list[Math.floor((i * list.length) / n)]));
  }
}

// ---------------------------------------------------------------------------
// Payloads and statements
// ---------------------------------------------------------------------------
function payload(row) {
  const out = {
    kind: row.kind, name: row.name, address: row.address, phone: row.phone, email: row.email, website: row.website, lat: row.lat,
    lng: row.lng, district: row.district, details: row.details, license: row.license, urls: row.urls, verified: row.verified,
  };
  if (row.plan.action === "new") {
    out.ref = `${REF_PREFIX}${row.key}`;
    out.slug = row.slug;
  } else {
    out.target = row.plan.target.id;
    out.mode = row.plan.action === "own" ? "own" : "fill";
    out.guide_ref = row.key;
  }
  return out;
}

if (SHOW) {
  const q = fold(SHOW);
  const hits = records.filter((r) => fold(r.name).includes(q) || fold(r.key).includes(q));
  console.log(`\n--show "${SHOW}": ${hits.length} record(s)${hits.length > 25 ? " (first 25)" : ""}`);
  for (const r of hits.slice(0, 25)) {
    const row = rows.find((x) => x.key === r.key);
    if (!row) {
      console.log(`  ${r.key}: skipped (${skipped.find((s) => s.r === r)?.reason})`);
      continue;
    }
    console.log(`${line(row)}\n    ${JSON.stringify(payload(row))}`);
  }
}

const POINT = `case when jsonb_typeof(e -> 'lng') = 'number' and jsonb_typeof(e -> 'lat') = 'number'
           then extensions.st_setsrid(extensions.st_makepoint((e ->> 'lng')::float8, (e ->> 'lat')::float8), 4326) end`;
const FIELDS = `btrim(e ->> 'name') as name, nullif(btrim(e ->> 'address'), '') as address, nullif(e ->> 'phone', '') as phone,
         nullif(e ->> 'email', '') as email, nullif(e ->> 'website', '') as website, ${POINT} as g,
         nullif(e ->> 'district', '') as district, e -> 'details' as details, nullif(e ->> 'license', '') as license,
         coalesce((select array_agg(u.v) from jsonb_array_elements_text(e -> 'urls') as u(v)), '{}'::text[]) as urls,
         (e ->> 'verified')::timestamptz as verified, e ->> 'kind' as kind`;
const HOOD = (g) => `(select b.neighbourhood_id from private.neighbourhood_boundaries b where extensions.st_contains(b.boundary, ${g}) limit 1)`;
const LOCK = `(select pg_advisory_xact_lock(hashtext('gebzem:poi_sync')))`;

/** New rows. A row stored meanwhile under the same key (a retried batch, a stale plan) is left alone: the next run refreshes it. */
function insertSql(list, lock = true) {
  return {
    with: `with lk as (select ${lock ? LOCK : "null"} as l),
s as (
  select ${FIELDS}, e ->> 'ref' as ref, e ->> 'slug' as slug, t.ord
    from lk, jsonb_array_elements(${jsonLit(list)}) with ordinality as t(e, ord)
),
v as (
  select s.*,
         case when exists (select 1 from public.poi q where q.slug = s.slug) or row_number() over (partition by s.slug order by s.ord) > 1
              then left(s.slug, 180) || '-' || left(md5(s.ref), 6) else s.slug end as slug_final
    from s
),
up as (
  insert into public.poi as q (kind, name, slug, address, phone, email, website, location, district_id, neighbourhood_id, details,
                               source, source_ref, license, source_urls, verified_at, last_seen_at)
  select v.kind, v.name, v.slug_final, v.address, v.phone, v.email, v.website, v.g::extensions.geography, v.district,
         -- A Gebze mahalle only on a Gebze row (a record can name the next district for a pin just inside Gebze).
         case when v.g is not null and coalesce(v.district, private.district_of(v.g)) = 'gebze' then ${HOOD("v.g")} end,
         v.details, 'manual', v.ref, v.license, v.urls, v.verified, now()
    from v
  on conflict (source, source_ref) do nothing
  returning q.kind
)`,
    expr: `jsonb_build_object('step', 'insert', 'sent', (select count(*) from s),
  'kinds', coalesce((select jsonb_object_agg(x.kind, x.n) from (select up.kind, count(*) as n from up group by up.kind) x), '{}'::jsonb))`,
  };
}

/**
 * Stored rows: mode own = a row this importer created (refreshed from the file unless an admin edited it), fill = any
 * other row (only what it misses). Locked rows are guarded by poi_before_write.
 */
function updateSql(list, lock = true) {
  const keep = `coalesce((select jsonb_object_agg(x.key, x.value)
                   from jsonb_each(case when jsonb_typeof(q.details) = 'object' then q.details else '{}'::jsonb end) x
                  where x.value not in ('[]'::jsonb, '""'::jsonb, 'null'::jsonb, '{}'::jsonb)), '{}'::jsonb)`;
  return {
    with: `with lk as (select ${lock ? LOCK : "null"} as l),
s as (
  -- target = the planned row; without one (rehearsal of a re-run) the row this importer stored under ref.
  select coalesce((e ->> 'target')::uuid,
                  (select q.id from public.poi q where q.source = 'manual' and q.source_ref = e ->> 'ref')) as id,
         e ->> 'mode' as mode, e ->> 'guide_ref' as gref, ${FIELDS}
    from lk, jsonb_array_elements(${jsonLit(list)}) as t(e)
),
pre as (
  select q.id, q.updated_at, q.verified_at is null as unverified, q.locked,
         s.mode = 'own' and not q.locked
           and not exists (select 1 from public.audit_log a
                            where a.entity_type = 'place' and a.entity_id = q.id and a.actor_id is not null) as refresh
    from public.poi q
    join s on s.id = q.id
),
up as (
  -- A locked row only gets the guide key (details.guide_ref, so a re-run finds it) and last_seen_at: poi_before_write
  -- keeps its fields anyway, and the district, licence and other details keys are kept here.
  update public.poi q set
    name = case when pre.refresh then s.name else q.name end,
    address = case when pre.refresh then coalesce(s.address, q.address) else coalesce(q.address, s.address) end,
    phone = case when pre.refresh then coalesce(s.phone, q.phone) else coalesce(q.phone, s.phone) end,
    email = case when pre.refresh then coalesce(s.email, q.email) else coalesce(q.email, s.email) end,
    website = case when pre.refresh then coalesce(s.website, q.website) else coalesce(q.website, s.website) end,
    location = case when pre.refresh then coalesce(s.g::extensions.geography, q.location)
                    else coalesce(q.location, s.g::extensions.geography) end,
    district_id = case when pre.locked then q.district_id
                       when pre.refresh then coalesce(s.district, q.district_id) else coalesce(q.district_id, s.district) end,
    -- A Gebze mahalle only on a row whose district is Gebze (the district this statement leaves on the row).
    neighbourhood_id = case when s.g is null or pre.locked or not (pre.refresh or q.location is null) then q.neighbourhood_id
                            when coalesce(case when pre.refresh then s.district end, q.district_id, s.district,
                                          private.district_of(s.g)) is distinct from 'gebze'
                              then case when pre.refresh then null else q.neighbourhood_id end
                            else coalesce(${HOOD("s.g")}, case when pre.refresh then null else q.neighbourhood_id end) end,
    details = case
      when pre.locked then (case when jsonb_typeof(q.details) = 'object' then q.details else '{}'::jsonb end)
                           || case when s.mode = 'own' then '{}'::jsonb else jsonb_build_object('guide_ref', s.gref) end
      when pre.refresh then (case when jsonb_typeof(q.details) = 'object' then q.details else '{}'::jsonb end)
                            - 'needs_verification' - 'verification_reasons' - 'verify_note' - 'temporarily_closed' || s.details
      else (case when pre.unverified then s.details else s.details - 'needs_verification' - 'verification_reasons' - 'verify_note' end) - 'import'
           || ${keep}
           -- diger / diger_kamu are the uncategorized fallbacks: the guide's category replaces them; so does milli_egitim
           -- the egitim_kurumu the Gebze guide gave a milli eğitim müdürlüğü before that category existed.
           || case when s.details ? 'category' and q.kind = 'institution'
                        and (coalesce(q.details ->> 'category', 'diger_kamu') in ('diger', 'diger_kamu')
                             or (s.details ->> 'category' = 'milli_egitim' and q.details ->> 'category' = 'egitim_kurumu'))
                   then jsonb_build_object('category', s.details -> 'category') else '{}'::jsonb end
           || jsonb_build_object('guide_ref', s.gref)
      end,
    license = case when pre.locked then q.license
                   when pre.refresh then coalesce(s.license, q.license) else coalesce(q.license, s.license) end,
    source_urls = case when pre.refresh and cardinality(s.urls) > 0 then s.urls
                       else (select coalesce(array_agg(y.u order by y.o), '{}'::text[])
                               from (select x.u, min(x.o) as o from unnest(q.source_urls || s.urls) with ordinality as x(u, o)
                                      group by x.u order by min(x.o) limit 20) y) end,
    verified_at = case when pre.refresh then coalesce(s.verified, q.verified_at) else coalesce(q.verified_at, s.verified) end,
    last_seen_at = case when s.mode = 'own' then now() else q.last_seen_at end
  from s
  join pre on pre.id = s.id
  where q.id = s.id and q.kind = s.kind
  returning q.id, q.kind, q.updated_at, s.mode, pre.refresh
)`,
    expr: `jsonb_build_object('step', 'update', 'sent', (select count(*) from s),
  'kinds', coalesce((select jsonb_object_agg(x.kind, x.st) from (
    select up.kind, jsonb_build_object('rows', count(*),
             'updated', count(*) filter (where up.updated_at is distinct from pre.updated_at),
             'unchanged', count(*) filter (where up.updated_at is not distinct from pre.updated_at),
             'own', count(*) filter (where up.mode = 'own'),
             'edited_kept', count(*) filter (where up.mode = 'own' and not up.refresh)) as st
      from up join pre on pre.id = up.id group by up.kind) x), '{}'::jsonb))`,
  };
}

function statements(list, lock = true) {
  const out = [];
  const fresh = list.filter((r) => r.plan.action === "new").map(payload);
  const stored = list.filter((r) => r.plan.action !== "new").map(payload);
  for (let i = 0; i < fresh.length; i += BATCH) out.push({ step: `insert ${i / BATCH + 1}`, ...insertSql(fresh.slice(i, i + BATCH), lock) });
  for (let i = 0; i < stored.length; i += BATCH) out.push({ step: `update ${i / BATCH + 1}`, ...updateSql(stored.slice(i, i + BATCH), lock) });
  return out;
}
const planned = statements(written);
const plannedKB = Math.round(planned.reduce((n, s) => n + s.with.length + s.expr.length, 0) / 1024);
console.log(`\nwrites: ${act(rows, "new")} new rows + ${written.length - act(rows, "new")} stored rows in ${planned.length} statements (${BATCH} rows each, ${plannedKB} KB)`);

// ---------------------------------------------------------------------------
// Rehearsal: every matched row + a sample of new rows, written twice in one transaction that always rolls back
// ---------------------------------------------------------------------------
function parseRaise(e, tag) {
  let msg = String(e.message);
  try {
    msg = JSON.parse(msg.slice(msg.indexOf("{"))).message ?? msg;
  } catch {
    /* keep the raw text */
  }
  const m = msg.match(new RegExp(`${tag} (.*)$`, "m"));
  if (!m) return { error: msg.slice(0, 1500) };
  try {
    return { out: JSON.parse(m[1]) };
  } catch {
    return { out: m[1].slice(0, 4000) };
  }
}

if (REHEARSE) {
  const perKind = new Map();
  // Rows of the KBB open-data import are left out: that import may be running, and the rehearsal must not lock its rows.
  const sample = written.filter((r) => {
    if (r.plan.target?.source === "kbb") return false;
    if (r.plan.action !== "new") return true;
    const n = perKind.get(r.srcKind) ?? 0;
    if (n >= REHEARSE_NEW_PER_KIND) return false;
    perKind.set(r.srcKind, n + 1);
    return true;
  });
  // The three hand checks (a Kandıra school, an İzmit ATM, a Gebze notary) are always in the sample.
  for (const pick of [
    (r) => r.srcKind === "school" && r.district === "kandira",
    (r) => r.srcKind === "atm" && r.district === "izmit",
    (r) => r.srcKind === "notary" && r.district === "gebze",
  ]) {
    const r = written.find(pick);
    if (r && !sample.includes(r)) sample.push(r);
  }
  const stmts = statements(sample, false);
  // Pass 3 = a re-run: the rows pass 1 created come back as "own" rows and take the refresh path.
  const ownPayloads = sample.filter((r) => r.plan.action === "new").map((r) => ({ ...payload(r), mode: "own", guide_ref: r.key }));
  const ownStmts = [];
  for (let i = 0; i < ownPayloads.length; i += BATCH) ownStmts.push({ step: `update own ${i / BATCH + 1}`, ...updateSql(ownPayloads.slice(i, i + BATCH), false) });
  const withMigration = missingCats.length > 0;
  const plannedCats = sample.filter((r) => r.kind === "institution" && (r.plan.action === "new" || r.plan.action === "own")).map((r) => ({ key: r.key, cat: r.category }));
  const run = (pass, list = stmts) => list.map((s) => `  ${s.with}\n  insert into kg_rehearsal (step, r) select ${lit(`${pass} ${s.step}`)}, ${s.expr};`).join("\n");
  const snap = `md5(row(q.kind, q.name, q.slug, q.address, q.phone, q.location::text, q.district_id, q.neighbourhood_id, q.details, q.source,
        q.source_ref, q.license, q.source_urls, q.verified_at, q.email, q.website, q.hidden, q.locked)::text)`;
  // One matched row is locked inside the rehearsal (a stored row that would get a pin, if any): pass 1 may only add
  // details.guide_ref to it.
  const lockRow = sample.find((r) => r.plan.action === "merge" && r.plan.target.lat === null && r.lat !== null) ??
    sample.find((r) => r.plan.action === "merge");
  const lockId = lockRow?.plan.target.id ?? null;
  const lockSnap = `md5(row(q.name, q.address, q.phone, q.location::text, q.district_id, q.neighbourhood_id, q.license, q.verified_at,
        q.source_urls, q.email, q.website, q.hidden, q.details - 'guide_ref')::text)`;
  let body = `declare
  v_changed int;
  v_changed_own int;
  v_locked_kept boolean;
  v_checks jsonb;
begin
  create temp table kg_rehearsal (ord serial, step text, r jsonb) on commit drop;
  create temp table kg_locked on commit drop as select q.id, ${lockSnap} as h from public.poi q where q.id = ${lit(lockId)}::uuid;
  update public.poi set locked = true where id = ${lit(lockId)}::uuid;
${run("pass1")}
  select coalesce(bool_and(${lockSnap} = k.h and q.details ? 'guide_ref'), true) into v_locked_kept
    from public.poi q join kg_locked k on k.id = q.id;
  create temp table kg_snap on commit drop as select q.id, ${snap} as h from public.poi q where q.details ? 'guide_ref';
${run("pass2")}
  select count(*) into v_changed from public.poi q join kg_snap k on k.id = q.id where ${snap} <> k.h;
${run("pass3", ownStmts)}
  select count(*) into v_changed_own from public.poi q join kg_snap k on k.id = q.id where ${snap} <> k.h;
  with t as (select q.* from public.poi q where q.details ? 'guide_ref'),
       p as (select x.key, x.cat from jsonb_to_recordset(${jsonLit(plannedCats)}) as x(key text, cat text))
  select jsonb_build_object(
    'rows', count(*),
    'created', count(*) filter (where t.source = 'manual' and t.source_ref like 'guide/%:%'),
    'merged_into_other_rows', count(*) filter (where not (t.source = 'manual' and t.source_ref like 'guide/%:%')),
    'by_kind', (select jsonb_object_agg(x.kind, x.n) from (select t2.kind, count(*) as n from t t2 group by 1) x),
    'by_district', (select jsonb_object_agg(x.d, x.n) from (select coalesce(t2.district_id, '-') as d, count(*) as n from t t2 group by 1) x),
    'no_district', count(*) filter (where t.district_id is null),
    'no_pin', count(*) filter (where t.location is null),
    'district_differs_from_polygon', count(*) filter (where t.location is not null
        and t.district_id is distinct from private.district_of(t.location::extensions.geometry)),
    'category_replaced_by_trigger', (select count(*) from t t2 join p on t2.source = 'manual' and t2.source_ref = 'guide/' || p.key
                                      where t2.details ->> 'category' is distinct from p.cat),
    'needs_verification', count(*) filter (where t.details ? 'needs_verification'),
    'verified', count(*) filter (where t.verified_at is not null),
    'hidden', count(*) filter (where t.hidden),
    'locked', count(*) filter (where t.locked),
    'no_search_norm', count(*) filter (where t.search_norm is null),
    'with_neighbourhood', count(*) filter (where t.neighbourhood_id is not null),
    'neighbourhood_outside_gebze', count(*) filter (where t.neighbourhood_id is not null and t.district_id <> 'gebze'),
    'import_mark_on_other_rows', count(*) filter (where t.details ->> 'import' = '${IMPORT_MARK}'
        and not (t.source = 'manual' and t.source_ref like 'guide/%:%')),
    'milli_egitim_on_merged_rows', count(*) filter (where t.details ->> 'category' = 'milli_egitim'
        and not (t.source = 'manual' and t.source_ref like 'guide/%:%')),
    'slugs_unique', (select count(*) = count(distinct slug) from public.poi))
    into v_checks from t;
  insert into public.data_sync_runs (dataset, triggered_by, dry_run, status, summary, message, finished_at)
  values ('poi', 'script', false, 'ok', '{}'::jsonb, 'rehearsal', now());
  raise exception 'KGREHEARSAL %', jsonb_build_object(
    'steps', (select jsonb_agg(jsonb_build_object('step', k.step) || k.r order by k.ord) from kg_rehearsal k),
    'changed_on_second_pass', v_changed, 'changed_after_own_refresh', v_changed_own, 'locked_row_kept', v_locked_kept,
    'checks', v_checks)::text;
end`;
  let tag = "kg";
  while (body.includes(`$${tag}$`)) tag += "g";
  const parts = [];
  if (withMigration) parts.push(readFileSync(MIGRATION, "utf8").replace(/^﻿/, ""));
  parts.push(`do $${tag}$\n${body}\n$${tag}$`);
  const text = `begin;\n${parts.join("\n;\n")};\nrollback;`;
  console.log(`\nrehearsal: ${sample.length} rows (${sample.filter((r) => r.plan.action !== "new").length} matched + ${sample.filter((r) => r.plan.action === "new").length} new), ${stmts.length} statements x 2 passes${withMigration ? ", 2026091384 inside the same transaction" : ""} (${Math.round(text.length / 1024)} KB, rolled back)`);
  try {
    await runSql(text);
    console.error("rehearsal: the transaction did not raise - check the database!");
    process.exit(1);
  } catch (e) {
    const res = parseRaise(e, "KGREHEARSAL");
    if (res.error) {
      console.error(`rehearsal FAILED: ${res.error}`);
      process.exit(1);
    }
    const out = res.out;
    if (typeof out === "string") console.log(`rehearsal OK (rolled back): ${out}`);
    else {
      console.log(`rehearsal OK (rolled back). second pass changed ${out.changed_on_second_pass} row(s), a re-run's refresh of the rows it created changed ${out.changed_after_own_refresh} (0 and 0 = re-runnable); a row locked for the test ${lockId ? (out.locked_row_kept ? "only got its guide key" : "WAS CHANGED") : "- none matched"}`);
      for (const s of out.steps ?? []) console.log(`  ${s.step}: sent ${s.sent}, ${JSON.stringify(s.kinds)}`);
      console.log(`  checks: ${JSON.stringify(out.checks)}`);
    }
  }
}

if (DRY) {
  console.log(`\nDRY RUN - nothing written.${missingCats.length ? ` Apply 2026091384_kocaeli_guide_categories.sql before the import (missing: ${missingCats.join(", ")}).` : ""}`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------
if (missingCats.length) {
  console.error(`institution categories missing: ${missingCats.join(", ")} - apply supabase/migrations/2026091384_kocaeli_guide_categories.sql first`);
  process.exit(2);
}
const totals = {};
const errors = [];
const bump = (kind, k, n) => {
  totals[kind] ??= { sent: 0, added: 0, updated: 0, unchanged: 0, kept_existing: 0, edited_kept: 0 };
  totals[kind][k] += Number(n ?? 0);
};
for (const [i, st] of planned.entries()) {
  try {
    const out = await sql(`${st.with}\nselect ${st.expr} as r`, 3);
    let r = out?.[0]?.r ?? {};
    if (typeof r === "string") r = JSON.parse(r);
    if (r.step === "insert") {
      for (const [kind, n] of Object.entries(r.kinds ?? {})) bump(kind, "added", n);
    } else {
      for (const [kind, s] of Object.entries(r.kinds ?? {})) {
        bump(kind, "updated", s.updated);
        bump(kind, "unchanged", s.unchanged);
        bump(kind, "edited_kept", s.edited_kept);
      }
    }
    console.log(`${st.step} (${i + 1}/${planned.length}): sent ${r.sent}, ${JSON.stringify(r.kinds)}`);
  } catch (e) {
    errors.push({ source: `kocaeli-guide:${st.step}`, message: String(e.message).slice(0, 280) });
    console.error(`${st.step} failed: ${String(e.message).slice(0, 400)}`);
  }
}
for (const r of written) bump(r.kind, "sent", 1);
for (const t of Object.values(totals)) t.kept_existing = Math.max(0, t.sent - t.added - t.updated - t.unchanged);
console.log(`\nwritten per kind (sent / added / updated / unchanged / not written: already stored under the key or kind changed / admin-edited own rows kept):`);
for (const [kind, t] of Object.entries(totals)) console.log(`  ${pad(kind, 12)} ${t.sent} / ${t.added} / ${t.updated} / ${t.unchanged} / ${t.kept_existing} / ${t.edited_kept}`);
// One entry in data_sync_runs (/admin/veri), same summary shape as poi_sync_apply.
const groups = Object.entries(totals).map(([kind, t]) => ({ source: "manual", kind, fetched: t.sent, added: t.added, updated: t.updated, unchanged: t.unchanged, restored: 0, complete: false, missing: 0, hidden: 0, locked: 0, guarded: false }));
const sum = (k) => groups.reduce((s, g) => s + g[k], 0);
const summary = {
  totals: { fetched: sum("fetched"), added: sum("added"), updated: sum("updated"), unchanged: sum("unchanged"), restored: 0, missing: 0, hidden: 0, locked: 0 },
  groups,
  errors,
};
await sql(`insert into public.data_sync_runs (dataset, triggered_by, dry_run, status, summary, message, finished_at)
  values ('poi', 'script', false, ${lit(errors.length ? "partial" : "ok")}, ${jsonLit(summary)},
          ${lit(`Kocaeli rehberi içe aktarımı (scripts/db/import-kocaeli-guide.mjs)${errors.length ? `: ${errors.length} hata` : ""}`)}, now())`, 2);
const after = await ro(`select kind, coalesce(details ->> 'category', '-') as category, coalesce(district_id, '-') as district, count(*) as n,
    count(*) filter (where hidden) as hidden
  from public.poi where details ? 'guide_ref' and details ->> 'guide_ref' like '%:%' group by 1, 2, 3 order by 1, 2, 3`);
const agg = (f) => {
  const m = {};
  for (const r of after) m[f(r)] = (m[f(r)] ?? 0) + Number(r.n);
  return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ");
};
console.log(`\nrows carrying a guide key now: ${after.reduce((s, r) => s + Number(r.n), 0)} (hidden ${after.reduce((s, r) => s + Number(r.hidden), 0)})`);
console.log(`  per kind: ${agg((r) => r.kind)}`);
console.log(`  per district: ${agg((r) => r.district)}`);
console.log(`  institution categories: ${agg((r) => (r.kind === "institution" ? r.category : "(not institution)"))}`);
console.log(errors.length ? `done with ${errors.length} error(s) - run again to retry (idempotent)` : "done");
process.exit(errors.length ? 1 : 0);
