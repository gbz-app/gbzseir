/**
 * İlan listesi URL filtreleri (paylaşılabilir): /ilanlar (İkinci El) ve /is-ilanlari. Saf TS: sunucu sayfası ve istemci
 * bileşenleri aynı ayrıştırıcıyı kullanır. Eski /ilanlar?tab=is-ilanlari adresleri /is-ilanlari'na yönlenir.
 *
 * &q= &kategori=<slug> &ilce=<district slug>
 *   2. el: &min= &max= &durum= &sirala=yeni|fiyat-artan|fiyat-azalan
 *     kategori seçiliyken: &a_<key>=<seçenek> (seçim) | &a_<key>=1 (evet/hayır) | &a_<key>_min= &a_<key>_max= (sayı)
 *   iş: &calisma=<work type> &konum=<JOB_LOCATIONS.key> &deneyim= &servis=1
 */
import { routes, type ListingsTab, type QueryRecord } from "@/core/routes";
import { isDistrictSlug, type DistrictSlug } from "@/config/districts";
import {
  CONDITIONS,
  EXPERIENCE_LEVELS,
  JOB_LOCATIONS,
  PRICE_MAX,
  SEARCH_MAX,
  SORT_OPTIONS,
  TAB_TYPE,
  WORK_TYPES,
  type ListingType,
  type RpcSort,
  type SortKey,
} from "./constants";
import type { AttributeField, ListingCategory } from "./types";

/** Category attribute filters, keyed without the "a_" prefix: key (select / boolean), key_min / key_max (number). */
export type AttrFilters = Record<string, string>;

export type ListingsQuery = {
  tab: ListingsTab;
  q: string;
  /** Category slug (2. el category or job sector). */
  kategori: string | null;
  min: number | null;
  max: number | null;
  /** District slug (?ilce=, districts.id). */
  ilce: DistrictSlug | null;
  /** 2. el condition (attributes.durum). */
  durum: string | null;
  /** 2. el category attribute filters (only with a category; checked against its schema in search_listings). */
  attrs: AttrFilters;
  sirala: SortKey;
  /** Job work type. */
  calisma: string | null;
  /** Job location key (JOB_LOCATIONS). */
  konum: string | null;
  deneyim: string | null;
  servis: boolean;
};

export type RawSearchParams = Record<string, string | string[] | undefined> | URLSearchParams;

const ATTR_PARAM = /^a_([a-z][a-z0-9_]{0,47})$/;
/** Option value (admin: [a-z0-9_]), "1" or a number ("6.5" / "6,5"). */
const ATTR_VALUE = /^(?:[a-z0-9_]{1,40}|-?\d{1,15}(?:[.,]\d{1,6})?)$/;
/** 20 fields per category, a number field has two params. */
const ATTR_MAX = 40;

function first(raw: RawSearchParams, key: string): string | null {
  const v = raw instanceof URLSearchParams ? raw.get(key) : raw[key];
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" && s.trim() !== "" ? s.trim() : null;
}

function intParam(v: string | null): number | null {
  if (!v || !/^\d{1,9}$/.test(v)) return null;
  const n = Number(v);
  return n <= PRICE_MAX ? n : null;
}

/** Decimal from the URL / filter sheet ("6,5" -> 6.5); null when invalid. */
export function attrNumber(v: string | null | undefined): number | null {
  const s = v?.trim();
  if (!s || !/^-?\d{1,15}(?:[.,]\d{1,6})?$/.test(s)) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const has = (list: Array<{ value: string }>, v: string | null) => (v && list.some((o) => o.value === v) ? v : null);

function parseAttrs(raw: RawSearchParams): AttrFilters {
  const keys = raw instanceof URLSearchParams ? [...new Set(raw.keys())] : Object.keys(raw);
  const out: AttrFilters = {};
  let n = 0;
  for (const param of keys.sort()) {
    const key = ATTR_PARAM.exec(param)?.[1];
    const value = key ? first(raw, param) : null;
    if (!key || !value || !ATTR_VALUE.test(value)) continue;
    out[key] = value;
    if (++n >= ATTR_MAX) break;
  }
  return out;
}

export function emptyQuery(tab: ListingsTab = "ikinci-el"): ListingsQuery {
  return {
    tab,
    q: "",
    kategori: null,
    min: null,
    max: null,
    ilce: null,
    durum: null,
    attrs: {},
    sirala: "yeni",
    calisma: null,
    konum: null,
    deneyim: null,
    servis: false,
  };
}

/** `tab`: the list page's own tab; without it the legacy ?tab= param decides (old /ilanlar links). */
export function parseListingsQuery(raw: RawSearchParams, forcedTab?: ListingsTab): ListingsQuery {
  const tab: ListingsTab = forcedTab ?? (first(raw, "tab") === "is-ilanlari" ? "is-ilanlari" : "ikinci-el");
  const q = emptyQuery(tab);
  q.q = (first(raw, "q") ?? "").slice(0, SEARCH_MAX);
  const slug = first(raw, "kategori");
  q.kategori = slug && /^[a-z0-9-]{1,80}$/.test(slug) ? slug : null;
  // Old ?mahalle= links are ignored (mahalle left the app).
  const ilce = first(raw, "ilce");
  q.ilce = isDistrictSlug(ilce) ? ilce : null;
  if (tab === "ikinci-el") {
    q.min = intParam(first(raw, "min"));
    q.max = intParam(first(raw, "max"));
    if (q.min != null && q.max != null && q.min > q.max) [q.min, q.max] = [q.max, q.min];
    q.durum = has(CONDITIONS, first(raw, "durum"));
    // Attribute filters belong to a category.
    if (q.kategori) q.attrs = parseAttrs(raw);
    const sort = first(raw, "sirala");
    q.sirala = SORT_OPTIONS.some((s) => s.value === sort) ? (sort as SortKey) : "yeni";
  } else {
    q.calisma = has(WORK_TYPES, first(raw, "calisma"));
    const konum = first(raw, "konum");
    q.konum = konum && JOB_LOCATIONS.some((l) => l.key === konum) ? konum : null;
    q.deneyim = has(EXPERIENCE_LEVELS, first(raw, "deneyim"));
    q.servis = first(raw, "servis") === "1";
  }
  return q;
}

/** Query params for the URL (defaults and other-tab fields are dropped). */
export function listingsQueryToRecord(q: ListingsQuery): QueryRecord {
  const base: QueryRecord = { q: q.q || undefined, kategori: q.kategori, ilce: q.ilce };
  if (q.tab === "ikinci-el") {
    const attrs: QueryRecord = {};
    if (q.kategori) for (const k of Object.keys(q.attrs).sort()) attrs[`a_${k}`] = q.attrs[k];
    return { ...base, min: q.min, max: q.max, durum: q.durum, ...attrs, sirala: q.sirala === "yeni" ? undefined : q.sirala };
  }
  return { ...base, calisma: q.calisma, konum: q.konum, deneyim: q.deneyim, servis: q.servis ? 1 : undefined };
}

export function listingsHref(q: ListingsQuery): string {
  return routes.listings.root(q.tab, listingsQueryToRecord(q));
}

/** Number of filters set inside the filter sheet (search text and sort excluded). */
export function countActiveFilters(q: ListingsQuery): number {
  let n = 0;
  if (q.kategori) n++;
  if (q.ilce) n++;
  if (q.tab === "ikinci-el") {
    if (q.min != null || q.max != null) n++;
    if (q.durum) n++;
    // A number range (key_min + key_max) is one filter.
    if (q.kategori) n += new Set(Object.keys(q.attrs).map((k) => k.replace(/_(?:min|max)$/, ""))).size;
  } else {
    if (q.calisma) n++;
    if (q.konum) n++;
    if (q.deneyim) n++;
    if (q.servis) n++;
  }
  return n;
}

export function isFiltered(q: ListingsQuery): boolean {
  return !!q.q || countActiveFilters(q) > 0 || q.sirala !== "yeni";
}

/** Stable key of a query (resets "load more" state when filters change). */
export function queryKey(q: ListingsQuery): string {
  return listingsHref(q);
}

/**
 * Filter fields of a category: its "filterable" select / number / boolean fields (a sub category without fields uses
 * its parent's, like the post wizard). "durum" is left out: it has its own filter.
 */
export function attributeFilterFields(categories: ListingCategory[], slug: string | null): AttributeField[] {
  const category = slug ? categories.find((c) => c.slug === slug) : undefined;
  if (!category) return [];
  const parent = category.parent_id ? categories.find((c) => c.id === category.parent_id) : undefined;
  const schema = category.attributes_schema.length ? category.attributes_schema : (parent?.attributes_schema ?? []);
  return schema.filter((f) => f.filterable && f.type !== "text" && f.key !== "durum");
}

/** Keeps the values that fit `fields` (unknown keys / options dropped, numbers normalised, ranges ordered). */
export function pickAttrFilters(attrs: AttrFilters, fields: AttributeField[]): AttrFilters {
  const out: AttrFilters = {};
  for (const f of fields) {
    if (f.type === "select") {
      const v = attrs[f.key];
      if (v && f.options?.some((o) => o.value === v)) out[f.key] = v;
    } else if (f.type === "boolean") {
      if (attrs[f.key] === "1") out[f.key] = "1";
    } else if (f.type === "number") {
      let lo = attrNumber(attrs[`${f.key}_min`]);
      let hi = attrNumber(attrs[`${f.key}_max`]);
      if (lo != null && hi != null && lo > hi) [lo, hi] = [hi, lo];
      if (lo != null) out[`${f.key}_min`] = String(lo);
      if (hi != null) out[`${f.key}_max`] = String(hi);
    }
  }
  return out;
}

/** Fully resolved arguments for search_listings (+ PostgREST filters). */
export type ResolvedSearch = {
  type: ListingType;
  q: string | null;
  categoryId: string | null;
  /** p_district_id. */
  districtId: DistrictSlug | null;
  minPrice: number | null;
  maxPrice: number | null;
  condition: string | null;
  /** p_attrs: interpreted by search_listings through the category's filterable fields. */
  attrs: AttrFilters | null;
  sort: RpcSort;
  workType: string | null;
  locationLabel: string | null;
  experience: string | null;
  shuttle: boolean;
};

export function resolveSearch(q: ListingsQuery, lookups: { categoryIdBySlug: (slug: string) => string | null }): ResolvedSearch {
  const type = TAB_TYPE[q.tab];
  const categoryId = q.kategori ? lookups.categoryIdBySlug(q.kategori) : null;
  return {
    type,
    q: q.q.trim() || null,
    categoryId,
    districtId: q.ilce,
    minPrice: type === "classified" ? q.min : null,
    maxPrice: type === "classified" ? q.max : null,
    condition: type === "classified" ? q.durum : null,
    attrs: type === "classified" && categoryId && Object.keys(q.attrs).length ? q.attrs : null,
    sort: type === "classified" ? (SORT_OPTIONS.find((s) => s.value === q.sirala)?.rpc ?? "newest") : "newest",
    workType: type === "job" ? q.calisma : null,
    locationLabel: type === "job" ? (JOB_LOCATIONS.find((l) => l.key === q.konum)?.label ?? null) : null,
    experience: type === "job" ? q.deneyim : null,
    shuttle: type === "job" && q.servis,
  };
}
