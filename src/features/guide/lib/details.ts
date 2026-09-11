/**
 * Safe parsers for the guide columns of public.poi (details jsonb, app_settings.emergency_numbers). Unknown shapes never
 * throw. Pure TS, safe on the server and in client components.
 */
import type { Json } from "@/lib/database.types";
import { CATEGORY_KEY_RE } from "@/features/business/lib/category-visuals";
import { INSTITUTION_CATEGORY_DEFS, parseInstitutionGroup, parseOwnership, socketLabel } from "./constants";
import type { EmergencyNumber, GuideDetails, GuidePhoto, GuideSocket, InstitutionCategoryDef } from "./types";

type Obj = Record<string, Json | undefined>;

function obj(v: Json | null | undefined): Obj {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
}

function str(v: Json | undefined, max = 4000): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t ? t.slice(0, max) : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function num(v: Json | undefined): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

const key = (v: Json | undefined) => {
  const s = str(v, 60);
  return s && CATEGORY_KEY_RE.test(s) ? s : null;
};

const isHttp = (u: string) => /^https?:\/\//i.test(u);

/** An http(s) URL string of at most `max` characters, else null. */
function httpUrl(v: Json | undefined, max: number): string | null {
  const u = str(v, max);
  return u && isHttp(u) ? u : null;
}

/** Pixel size: a positive number, else null. */
function dim(v: Json | undefined): number | null {
  const n = num(v);
  return n !== null && n > 0 ? Math.round(n) : null;
}

/** details.photos: plain URLs or {url, alt, credit, author, licence, licence_url, source_page, thumb_url, width, height}. */
export function parseGuidePhotos(v: Json | undefined): GuidePhoto[] {
  if (!Array.isArray(v)) return [];
  const out: GuidePhoto[] = [];
  for (const p of v) {
    if (typeof p === "string") {
      if (isHttp(p)) out.push({ url: p, alt: null, credit: null, author: null, licence: null, licenceUrl: null, sourcePage: null, thumbUrl: null, width: null, height: null });
      continue;
    }
    const o = obj(p);
    const url = str(o.url) ?? str(o.src);
    if (!url || !isHttp(url)) continue;
    const author = str(o.author, 200);
    const licence = str(o.licence, 80) ?? str(o.license, 80);
    const credit = str(o.credit, 300) ?? str(o.attribution, 300) ?? ([author, licence].filter(Boolean).join(" · ") || null);
    out.push({
      url,
      alt: str(o.alt, 300) ?? str(o.caption, 300),
      credit,
      author,
      licence,
      licenceUrl: httpUrl(o.licence_url, 500),
      sourcePage: httpUrl(o.source_page, 1000),
      thumbUrl: httpUrl(o.thumb_url, 1000),
      width: dim(o.width),
      height: dim(o.height),
    });
  }
  return out;
}

/** details.sockets: {type2: 2, chademo: 1} or [{type, count}]. */
function parseSockets(v: Json | undefined): GuideSocket[] {
  const out: GuideSocket[] = [];
  if (Array.isArray(v)) {
    for (const s of v) {
      const o = obj(s);
      const type = key(o.type);
      if (type) out.push({ type, label: socketLabel(type), count: num(o.count) });
    }
  } else {
    for (const [type, count] of Object.entries(obj(v))) {
      if (CATEGORY_KEY_RE.test(type)) out.push({ type, label: socketLabel(type), count: num(count) });
    }
  }
  return out;
}

function parsePhones(v: Json | undefined, first: string | null): string[] {
  const list = Array.isArray(v) ? v.map((p) => str(p as Json, 40)).filter((p): p is string => !!p) : [];
  if (first && !list.includes(first)) list.unshift(first);
  return [...new Set(list)].slice(0, 8);
}

/** Parsed details of a guide row. `phone`: poi.phone (kept first in `phones`). */
export function parseGuideDetails(details: Json | null | undefined, phone: string | null = null): GuideDetails {
  const d = obj(details);
  return {
    category: key(d.category),
    subkind: key(d.subkind),
    ownership: parseOwnership(str(d.ownership)),
    phones: parsePhones(d.phones, phone),
    fax: str(d.fax, 40),
    hours: str(d.hours, 500) ?? str(d.opening_hours, 500),
    description: str(d.description),
    fee: str(d.fee, 200),
    photos: parseGuidePhotos(d.photos),
    bank: key(d.bank),
    brand: key(d.brand),
    operator: key(d.operator),
    sockets: parseSockets(d.sockets),
    powerKw: num(d.power_kw),
    capacity: num(d.capacity),
    atmCount: num(d.atm_count),
    period: str(d.period, 300),
    note: str(d.note, 1000),
    verifyNote: str(d.verify_note, 1000),
    osmId: str(d.osm_id, 60),
    wikidata: str(d.wikidata, 40),
    key: str(d.key, 200),
    curated: d.curated === true,
  };
}

/** institution_categories rows (key, label_tr, group_key, icon, sort, active) -> defs; the built-in list when empty. */
export function toInstitutionCategoryDefs(
  rows: ReadonlyArray<{ key: string; label_tr: string; group_key: string; icon: string | null; sort: number; active: boolean }> | null | undefined,
): readonly InstitutionCategoryDef[] {
  const list: InstitutionCategoryDef[] = [];
  for (const r of rows ?? []) {
    const group = parseInstitutionGroup(r.group_key);
    if (group) list.push({ key: r.key, label: r.label_tr, group, icon: r.icon || null, sort: r.sort, active: r.active });
  }
  return list.length ? list : INSTITUTION_CATEGORY_DEFS;
}

/** app_settings.emergency_numbers -> entries with a number and a label (others are skipped). */
export function parseEmergencyNumbers(value: Json | null | undefined): EmergencyNumber[] {
  if (!Array.isArray(value)) return [];
  const out: EmergencyNumber[] = [];
  for (const e of value) {
    const o = obj(e);
    const number = str(o.number, 20)?.replace(/[^\d+]/g, "") ?? "";
    const label = str(o.label, 120);
    if (!number || !label) continue;
    const website = str(o.website, 500);
    out.push({ number, label, description: str(o.description, 400), website: website && isHttp(website) ? website : null });
  }
  return out;
}
