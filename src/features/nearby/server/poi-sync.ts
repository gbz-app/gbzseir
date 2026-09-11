import "server-only";
import { SITE_URL } from "@/config/site";
import { routes } from "@/core/routes";
import { slugifyTr } from "@/core/tr";
import type { Json } from "@/lib/database.types";
import { revalidatePublic } from "@/lib/revalidate-public";
import { createAdminClient, type AdminSupabase } from "@/lib/supabase/admin";
import type { PoiKind } from "../types";

/**
 * POI re-sync on the public app (/api/cron/poi-sync: the monthly pg_cron job, and the admin's "Şimdi eşitle" / "Önizle"
 * requests queued by admin_poi_sync_now, because the admin site has no service role key). Same sources and row rules as
 * the seed scripts (scripts/db/seed-poi.mjs, seed-taxi.mjs, seed-atm.mjs):
 *  - pharmacies and mosques: Kocaeli Büyükşehir Belediyesi Açık Veri (CC BY 4.0), Gebze = ilce_id 1338, EPSG:5254;
 *  - bus stops (+ route refs), named places, taxi stands and ATMs: OpenStreetMap through one Overpass query (ODbL).
 * poi_sync_apply (2026091352_poi_last_seen.sql) upserts the rows and hides the rows of each fully read group that the
 * source no longer lists: never deletes, never hides a locked row, and a guard stops a truncated pull from hiding.
 * KBB historic sites and the curated places stay with seed-poi.mjs (their texts live there).
 */

export type PoiSyncTrigger = "cron" | "admin" | "script";
export type PoiSyncStatus = "ok" | "partial" | "error";

export type PoiSyncGroup = {
  source: string;
  kind: string;
  /** The whole group was read: its rows missing from the pull were checked. */
  complete: boolean;
  fetched: number;
  added: number;
  updated: number;
  unchanged: number;
  /** Hidden by an earlier sync, listed again and shown. */
  restored: number;
  /** Visible rows the source no longer lists. */
  missing: number;
  hidden: number;
  /** Missing but locked by an admin: kept visible. */
  locked: number;
  /** The pull looked truncated, so nothing was hidden. */
  guarded: boolean;
};

export type PoiSyncTotals = Pick<PoiSyncGroup, "fetched" | "added" | "updated" | "unchanged" | "restored" | "missing" | "hidden" | "locked">;
export type PoiSyncError = { source: string; message: string };
export type PoiSyncSummary = { totals: PoiSyncTotals; groups: PoiSyncGroup[]; errors: PoiSyncError[] };
export type PoiSyncResult = PoiSyncSummary & { runId: string | null; dryRun: boolean; status: PoiSyncStatus; durationMs: number };
/** A data_sync_runs row as /admin/veri shows it ('running': an admin request the public app has not answered yet). */
export type PoiSyncRun = {
  id: string;
  createdAt: string;
  finishedAt: string | null;
  triggeredBy: string;
  dryRun: boolean;
  status: PoiSyncStatus | "running";
  message: string | null;
  summary: PoiSyncSummary;
};

/** data_sync_runs columns read by /admin/veri. */
export const POI_SYNC_RUN_COLUMNS = "id,created_at,finished_at,triggered_by,dry_run,status,summary,message";

const GEBZE_ILCE_ID = 1338;
const KBB = "https://kavisacikveri.kocaeli.bel.tr/api/public/OpenDataPublic/attachments";
const KBB_PHARMACIES = "87c9b460-4d2c-4895-bfed-e65932268f99";
const KBB_MOSQUES = "b5bf4487-56bd-476d-8903-a27d52710415";
const KBB_LICENSE = "CC BY 4.0 - Kocaeli Büyükşehir Belediyesi Açık Veri";
const OSM_LICENSE = "ODbL - © OpenStreetMap katkıcıları";
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const UA = `Gebzem/1.0 (Gebze city guide data sync; +${SITE_URL})`;
const AREA = `area["name"="Gebze"]["boundary"="administrative"]["admin_level"="6"]->.g;`;
/** The seed scripts' queries in one request: bus stops, their bus routes, named places, taxi stands, ATMs. */
const OSM_QUERY =
  `[out:json][timeout:150];${AREA}` +
  `(node(area.g)["highway"="bus_stop"];node(area.g)["public_transport"="platform"]["bus"="yes"];)->.bus;.bus out body;` +
  `node.bus["highway"="bus_stop"]->.s;rel(bn.s)["route"="bus"];out body;` +
  `(nwr(area.g)["tourism"~"^(museum|attraction|viewpoint)$"]["name"];nwr(area.g)["historic"]["name"];` +
  `nwr(area.g)["leisure"="park"]["name"];nwr(area.g)["leisure"="nature_reserve"]["name"];nwr(area.g)["shop"="mall"]["name"];);out center tags;` +
  `nwr(area.g)["amenity"="taxi"];out center tags;` +
  `nwr(area.g)["amenity"="atm"];out center tags;`;
/** Whole run budget (the route allows 300 s); the last part is kept for the database call. */
const BUDGET_MS = 240_000;
const DB_RESERVE_MS = 30_000;
/** admin_poi_sync_now gives a request up after 10 minutes as well. */
const REQUEST_TIMEOUT_MS = 10 * 60_000;

type SyncRow = {
  kind: PoiKind;
  name: string;
  slug: string;
  address: string | null;
  /** Left out when the source has no phones: the stored phone is kept. */
  phone?: string | null;
  x: number;
  y: number;
  srid: 4326 | 5254;
  details: Record<string, unknown>;
  source: "kbb" | "osm";
  source_ref: string;
  license: string;
};

type KbbFeature = { properties?: Record<string, unknown>; geometry?: { coordinates?: unknown } };
type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
  members?: Array<{ type: string; ref: number }>;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);

// ---------------------------------------------------------------------------
// Row rules (same as the seed scripts)
// ---------------------------------------------------------------------------
const titleCaseTr = (s: string) =>
  s.toLocaleLowerCase("tr-TR").replace(/(^|[\s(/.-])(\p{L})/gu, (_m, p: string, c: string) => p + c.toLocaleUpperCase("tr-TR"));

/** KBB addresses are often all caps. */
function cleanAddr(s: unknown): string | null {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t === t.toLocaleUpperCase("tr-TR") ? titleCaseTr(t) : t;
}

/** KBB phone -> +90XXXXXXXXXX, else null. */
function kbbPhone(s: unknown): string | null {
  let d = String(s ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 12 && d.startsWith("90")) d = d.slice(2);
  return d.length === 10 ? `+90${d}` : null;
}

/** OSM phone of a taxi stand (first number, Turkish only) -> +90..., else null. */
function osmPhone(raw: string | undefined): string | null {
  const d = String(raw ?? "").split(/[;,/]/)[0].replace(/\D/g, "");
  const n = d.startsWith("90") ? d.slice(2) : d.startsWith("0") ? d.slice(1) : d;
  return /^[2-5]\d{9}$/.test(n) ? `+90${n}` : null;
}

/** tags.name, else "<operator|brand> ATM" (no double "ATM"), else "ATM". */
function atmName(t: Record<string, string>): string {
  if (t.name?.trim()) return t.name.trim();
  const bank = (t.operator || t.brand || "").trim();
  if (!bank) return "ATM";
  return /\batm\b/i.test(bank) ? bank : `${bank} ATM`;
}

function coordsOf(e: OsmElement): { lat: number; lon: number } | null {
  const lat = e.lat ?? e.center?.lat;
  const lon = e.lon ?? e.center?.lon;
  return typeof lat === "number" && typeof lon === "number" ? { lat, lon } : null;
}

function kbbRows(features: KbbFeature[], kind: "pharmacy" | "mosque"): SyncRow[] {
  const rows: SyncRow[] = [];
  for (const f of features) {
    const p = f.properties ?? {};
    if (p.ilce_id !== GEBZE_ILCE_ID) continue;
    const coords = f.geometry?.coordinates;
    if (!Array.isArray(coords) || typeof coords[0] !== "number" || typeof coords[1] !== "number") continue;
    const raw = String(p.adi ?? "").trim();
    let name = raw;
    if (kind === "pharmacy" && !name) continue; // unnamed pharmacies are skipped
    if (kind === "mosque") name = raw.replace(/\bCami\b/g, "Camii") || "Cami";
    const ref = p.poi_id ?? p.objectid;
    rows.push({
      kind,
      name,
      slug: "",
      address: cleanAddr(p.adres),
      phone: kbbPhone(p.telefon),
      x: coords[0],
      y: coords[1],
      srid: 5254,
      details: {},
      source: "kbb",
      source_ref: `${kind === "pharmacy" ? "eczane" : "cami"}:${String(ref)}`,
      license: KBB_LICENSE,
    });
  }
  return rows;
}

/** OSM named places that seed-poi.mjs turned into curated manual rows. */
const USED_OSM = new Set(["relation/13794225", "way/1150515753", "way/1092602566", "way/165140213"]);
const SKIP_OSM =
  /(mezarl|sitesi|^müze$|greek|favori avm|lokomotif|türbesi|anıtı|hannibal|kalesi|osman hamdi|hunkar|hünkar|ballıkaya|millet bahçesi|tatlıkuyu vadisi|gebze center)/i;

/**
 * OSM rows in seed order (places, bus stops, taxi stands, ATMs). An element in two groups keeps the kind the last seed
 * script gave it (ATM > taxi > bus stop > place). `takenPlaceNames`: KBB / manual place names (lowercase).
 */
function osmRows(elements: OsmElement[], takenPlaceNames: Set<string>): SyncRow[] {
  const refOf = (e: OsmElement) => `${e.type}/${e.id}`;
  const pick = (test: (e: OsmElement, t: Record<string, string>) => boolean, used: Set<string>) => {
    const out: OsmElement[] = [];
    const seen = new Set<string>();
    for (const e of elements) {
      const ref = refOf(e);
      if (seen.has(ref) || used.has(ref) || !test(e, e.tags ?? {}) || !coordsOf(e)) continue;
      seen.add(ref);
      out.push(e);
    }
    for (const ref of seen) used.add(ref);
    return out;
  };
  const used = new Set<string>();
  const atms = pick((_e, t) => t.amenity === "atm", used);
  const taxis = pick((_e, t) => t.amenity === "taxi", used);
  const stops = pick((e, t) => e.type === "node" && (t.highway === "bus_stop" || (t.public_transport === "platform" && t.bus === "yes")), used);
  const places = pick(
    (_e, t) =>
      !!t.name &&
      (/^(museum|attraction|viewpoint)$/.test(t.tourism ?? "") ||
        t.historic !== undefined ||
        t.leisure === "park" ||
        t.leisure === "nature_reserve" ||
        t.shop === "mall"),
    used,
  );

  const rows: SyncRow[] = [];
  const seenNames = new Set(takenPlaceNames);
  for (const e of places) {
    const t = e.tags ?? {};
    const ref = refOf(e);
    if (USED_OSM.has(ref) || SKIP_OSM.test(t.name)) continue;
    const key = t.name.toLocaleLowerCase("tr-TR");
    if (seenNames.has(key)) continue;
    seenNames.add(key);
    const c = coordsOf(e)!;
    const category =
      t.shop === "mall" ? "avm" : t.tourism === "museum" ? "muze" : t.historic ? "tarihi" : t.leisure === "nature_reserve" ? "doga" : "park";
    // No curated / photos keys: an admin's texts and photos stay.
    rows.push({ kind: "place", name: t.name, slug: "", address: null, x: c.lon, y: c.lat, srid: 4326,
      details: { category, ...(t.wikidata ? { wikidata: t.wikidata } : {}) }, source: "osm", source_ref: ref, license: OSM_LICENSE });
  }

  const linesByNode = new Map<number, Set<string>>();
  for (const r of elements) {
    if (r.type !== "relation" || r.tags?.route !== "bus") continue;
    const ref = r.tags?.ref || r.tags?.name;
    if (!ref) continue;
    for (const m of r.members ?? []) {
      if (m.type !== "node") continue;
      if (!linesByNode.has(m.ref)) linesByNode.set(m.ref, new Set());
      linesByNode.get(m.ref)!.add(ref);
    }
  }
  for (const e of stops) {
    const t = e.tags ?? {};
    const c = coordsOf(e)!;
    const lines = [...(linesByNode.get(e.id) ?? [])].sort((a, b) => a.localeCompare(b, "tr", { numeric: true }));
    rows.push({ kind: "bus_stop", name: t.name ? t.name.trim() : "Otobüs Durağı", slug: "", address: null, x: c.lon, y: c.lat, srid: 4326,
      details: { lines, ...(t.ref ? { stop_code: t.ref } : {}), ...(t.shelter ? { shelter: t.shelter === "yes" } : {}) },
      source: "osm", source_ref: refOf(e), license: OSM_LICENSE });
  }

  const street = (t: Record<string, string>) => [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ") || null;
  for (const e of taxis) {
    const t = e.tags ?? {};
    const c = coordsOf(e)!;
    rows.push({ kind: "taxi", name: (t.name || "Taksi Durağı").trim(), slug: "", address: street(t), phone: osmPhone(t.phone || t["contact:phone"]),
      x: c.lon, y: c.lat, srid: 4326, details: {}, source: "osm", source_ref: refOf(e), license: OSM_LICENSE });
  }
  for (const e of atms) {
    const t = e.tags ?? {};
    const c = coordsOf(e)!;
    rows.push({ kind: "atm", name: atmName(t), slug: "", address: street(t), x: c.lon, y: c.lat, srid: 4326, details: {},
      source: "osm", source_ref: refOf(e), license: OSM_LICENSE });
  }
  return rows;
}

/** Slugs of new rows (unique across all POIs, same patterns as the seed scripts); existing rows keep theirs. */
function assignSlugs(rows: SyncRow[], existing: Array<{ slug: string; source: string; source_ref: string | null }>) {
  const bySrc = new Map(existing.map((r) => [`${r.source}|${r.source_ref}`, r.slug]));
  const taken = new Set(existing.map((r) => r.slug));
  for (const r of rows) {
    const keep = bySrc.get(`${r.source}|${r.source_ref}`);
    if (keep) {
      r.slug = keep;
      continue;
    }
    let base: string;
    let s: string;
    if (r.kind === "taxi") {
      base = s = `taksi-${slugifyTr(r.name) || "duragi"}`;
    } else if (r.kind === "atm") {
      base = s = `atm-${slugifyTr(r.name.replace(/\s*\batm\b\s*/gi, " ").trim()) || "noktasi"}`;
    } else {
      base = slugifyTr(r.name) || r.kind;
      if (r.kind === "bus_stop") base = `durak-${base}`;
      s = base;
      const mah = (String(r.address ?? "").match(/^([^\d,]+?)\s+(Mah|Mh)\b/i) || [])[1];
      if (taken.has(s) && mah) s = slugifyTr(`${r.name} ${mah}`);
    }
    let i = 2;
    while (taken.has(s)) s = `${base}-${i++}`;
    taken.add(s);
    r.slug = s;
  }
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------
const timeLeft = (deadline: number, cap: number) => Math.max(1_000, Math.min(cap, deadline - Date.now()));

async function fetchKbb(attachmentId: string, deadline: number): Promise<KbbFeature[]> {
  let last: unknown = new Error("zaman aşımı");
  for (let i = 1; i <= 2 && deadline - Date.now() > 5_000; i++) {
    try {
      const res = await fetch(`${KBB}/${attachmentId}/download`, {
        headers: { "User-Agent": UA },
        cache: "no-store",
        signal: AbortSignal.timeout(timeLeft(deadline, 45_000)),
      });
      const text = (await res.text()).replace(/^﻿/, "");
      if (!res.ok || !text.trimStart().startsWith("{")) throw new Error(`HTTP ${res.status}`);
      const json = JSON.parse(text) as { features?: unknown };
      if (!Array.isArray(json.features)) throw new Error("GeoJSON değil");
      return json.features as KbbFeature[];
    } catch (e) {
      last = e;
      if (i < 2) await sleep(2_000);
    }
  }
  throw last;
}

/** One Overpass query with mirror fallback. A runtime error (partial data) counts as a failure. */
async function fetchOverpass(query: string, deadline: number): Promise<OsmElement[]> {
  let last: unknown = new Error("zaman aşımı");
  for (const url of OVERPASS) {
    if (deadline - Date.now() < 10_000) break;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query),
        cache: "no-store",
        signal: AbortSignal.timeout(timeLeft(deadline, 150_000)),
      });
      const text = await res.text();
      if (!res.ok || text.trimStart().startsWith("<")) throw new Error(`${new URL(url).host} HTTP ${res.status}`);
      const json = JSON.parse(text) as { elements?: unknown; remark?: unknown };
      if (typeof json.remark === "string" && /error/i.test(json.remark)) throw new Error(`${new URL(url).host}: ${json.remark.slice(0, 120)}`);
      if (!Array.isArray(json.elements)) throw new Error(`${new URL(url).host}: yanıt okunamadı`);
      return json.elements as OsmElement[];
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** poi_sync_apply result / data_sync_runs.summary -> typed summary (unknown shapes give zeros). */
export function normalizePoiSyncSummary(value: unknown): PoiSyncSummary {
  const v = rec(value);
  const t = rec(v.totals);
  const totals: PoiSyncTotals = {
    fetched: num(t.fetched),
    added: num(t.added),
    updated: num(t.updated),
    unchanged: num(t.unchanged),
    restored: num(t.restored),
    missing: num(t.missing),
    hidden: num(t.hidden),
    locked: num(t.locked),
  };
  const groups: PoiSyncGroup[] = (Array.isArray(v.groups) ? v.groups : []).map((x) => {
    const g = rec(x);
    return {
      source: String(g.source ?? ""),
      kind: String(g.kind ?? ""),
      complete: g.complete === true,
      fetched: num(g.fetched),
      added: num(g.added),
      updated: num(g.updated),
      unchanged: num(g.unchanged),
      restored: num(g.restored),
      missing: num(g.missing),
      hidden: num(g.hidden),
      locked: num(g.locked),
      guarded: g.guarded === true,
    };
  });
  const errors: PoiSyncError[] = (Array.isArray(v.errors) ? v.errors : []).map((x) => {
    const e = rec(x);
    return { source: String(e.source ?? "-"), message: String(e.message ?? "-") };
  });
  return { totals, groups, errors };
}

export function poiSyncStatus(v: unknown): PoiSyncStatus {
  return v === "ok" || v === "partial" ? v : "error";
}

type SyncRunRow = {
  id: string;
  created_at: string;
  finished_at: string | null;
  triggered_by: string;
  dry_run: boolean;
  status: string;
  summary: unknown;
  message: string | null;
};

/**
 * data_sync_runs row -> PoiSyncRun. A request still 'running' after 10 minutes got no answer (admin_poi_sync_now marks
 * it on the next click); it reads as failed.
 */
export function poiSyncRunFromRow(row: SyncRunRow, now = Date.now()): PoiSyncRun {
  const lost = row.status === "running" && now - new Date(row.created_at).getTime() > REQUEST_TIMEOUT_MS;
  return {
    id: row.id,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
    triggeredBy: row.triggered_by,
    dryRun: row.dry_run,
    status: row.status === "running" && !lost ? "running" : poiSyncStatus(row.status),
    message: lost ? "Eşitleme yanıt vermedi (zaman aşımı)." : row.message,
    summary: normalizePoiSyncSummary(row.summary),
  };
}

type ApplyArgs = {
  rows: SyncRow[];
  groups: Array<{ source: "kbb" | "osm"; kind: PoiKind }>;
  trigger: PoiSyncTrigger;
  dryRun: boolean;
  errors: PoiSyncError[];
  runId: string | null;
};

function apply(admin: AdminSupabase, a: ApplyArgs) {
  return admin.rpc("poi_sync_apply", {
    p_rows: a.rows as unknown as Json,
    p_groups: a.groups,
    p_trigger: a.trigger,
    p_dry_run: a.dryRun,
    p_errors: a.errors,
    ...(a.runId ? { p_run_id: a.runId } : {}),
  });
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
/**
 * One sync run. dryRun: the database runs the same statements and rolls them back (nothing written; only an admin
 * preview request is logged). runId: the admin request (admin_poi_sync_now) this run answers; its trigger, admin and
 * preview flag come from that row. Source failures are part of the result; a run that could not reach the database is
 * logged as 'error' when possible.
 */
export async function runPoiSync(opts: { trigger: PoiSyncTrigger; dryRun?: boolean; runId?: string | null }): Promise<PoiSyncResult> {
  const started = Date.now();
  const deadline = started + BUDGET_MS - DB_RESERVE_MS;
  const dryRun = opts.dryRun ?? false;
  const runId = opts.runId ?? null;
  const admin = createAdminClient();
  const errors: PoiSyncError[] = [];
  const finish = (summary: PoiSyncSummary, status: PoiSyncStatus, id: string | null, dry = dryRun): PoiSyncResult => ({
    ...summary,
    runId: id,
    dryRun: dry,
    status,
    durationMs: Date.now() - started,
  });
  /** A run without rows (nothing written or hidden): logs the failure and answers the admin's request. Best effort. */
  const failed = async (all: PoiSyncError[]) => {
    await apply(admin, { rows: [], groups: [], trigger: opts.trigger, dryRun, errors: all, runId }).then(undefined, () => undefined);
    return finish({ totals: normalizePoiSyncSummary(null).totals, groups: [], errors: all }, "error", runId);
  };

  // Existing rows: slugs of known rows, KBB / manual place names (OSM places with the same name are skipped).
  const existing: Array<{ slug: string; source: string; source_ref: string | null; kind: string; name: string }> = [];
  for (let from = 0; from < 20_000; from += 1000) {
    const { data, error } = await admin.from("poi").select("slug,source,source_ref,kind,name").order("id").range(from, from + 999);
    if (error) return failed([{ source: "db", message: `Yerler okunamadı: ${error.message.slice(0, 150)}` }]);
    existing.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const takenPlaceNames = new Set(
    existing.filter((r) => r.kind === "place" && (r.source === "kbb" || r.source === "manual")).map((r) => r.name.toLocaleLowerCase("tr-TR")),
  );

  const [pharmacies, mosques, osm] = await Promise.allSettled([
    fetchKbb(KBB_PHARMACIES, deadline),
    fetchKbb(KBB_MOSQUES, deadline),
    fetchOverpass(OSM_QUERY, deadline),
  ]);

  const rows: SyncRow[] = [];
  const groups: ApplyArgs["groups"] = [];
  const addKbb = (res: PromiseSettledResult<KbbFeature[]>, kind: "pharmacy" | "mosque", label: string) => {
    if (res.status === "rejected") {
      errors.push({ source: `kbb:${kind}`, message: `${label} okunamadı: ${errorText(res.reason)}` });
      return;
    }
    const list = kbbRows(res.value, kind);
    // No Gebze row at all: the dataset changed shape, so nothing of it is trusted.
    if (!list.length) {
      errors.push({ source: `kbb:${kind}`, message: `${label} listesinde Gebze kaydı yok.` });
      return;
    }
    rows.push(...list);
    groups.push({ source: "kbb", kind });
  };
  addKbb(pharmacies, "pharmacy", "KBB eczane listesi");
  addKbb(mosques, "mosque", "KBB cami listesi");
  if (osm.status === "rejected") {
    errors.push({ source: "osm", message: `OpenStreetMap okunamadı: ${errorText(osm.reason)}` });
  } else {
    const list = osmRows(osm.value, takenPlaceNames);
    if (!list.length) {
      errors.push({ source: "osm", message: "OpenStreetMap boş yanıt verdi." });
    } else {
      rows.push(...list);
      for (const kind of ["place", "bus_stop", "taxi", "atm"] as const) groups.push({ source: "osm", kind });
    }
  }
  assignSlugs(rows, existing);

  const { data, error } = await apply(admin, { rows, groups, trigger: opts.trigger, dryRun, errors, runId });
  if (error) {
    console.error("[poi-sync] poi_sync_apply failed", error.message);
    return failed([...errors, { source: "db", message: `Veritabanına yazılamadı: ${error.message.slice(0, 150)}` }]);
  }

  const out = rec(data);
  const summary = normalizePoiSyncSummary(out);
  // A preview request stays a dry run whatever the caller said.
  const dry = out.dry_run === true || dryRun;
  const result = finish(summary, poiSyncStatus(out.status), typeof out.run_id === "string" ? out.run_id : null, dry);
  const t = summary.totals;
  if (!dry && t.added + t.updated + t.hidden + t.restored > 0) {
    await revalidatePublic({
      tags: ["poi", "nearby", "duty"],
      paths: [routes.home(), routes.nearby.root(), routes.nearby.places(), routes.nearby.dutyPharmacies()],
    });
  }
  return result;
}
