/**
 * /ilanlar URL filtreleri (paylaşılabilir). Saf TS: sunucu sayfası ve istemci bileşenleri aynı ayrıştırıcıyı kullanır.
 *
 * ?tab=ikinci-el|is-ilanlari &q= &kategori=<slug> &min= &max= &mahalle=<slug> &durum= &sirala=yeni|fiyat-artan|fiyat-azalan
 *   iş: &calisma=<work type> &konum=<JOB_LOCATIONS.key> &deneyim= &servis=1
 */
import { routes, type ListingsTab, type QueryRecord } from "@/core/routes";
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

export type ListingsQuery = {
  tab: ListingsTab;
  q: string;
  /** Category slug (2. el category or job sector). */
  kategori: string | null;
  min: number | null;
  max: number | null;
  /** Neighbourhood slug. */
  mahalle: string | null;
  /** 2. el condition (attributes.durum). */
  durum: string | null;
  sirala: SortKey;
  /** Job work type. */
  calisma: string | null;
  /** Job location key (JOB_LOCATIONS). */
  konum: string | null;
  deneyim: string | null;
  servis: boolean;
};

export type RawSearchParams = Record<string, string | string[] | undefined> | URLSearchParams;

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

const has = (list: Array<{ value: string }>, v: string | null) => (v && list.some((o) => o.value === v) ? v : null);

export function emptyQuery(tab: ListingsTab = "ikinci-el"): ListingsQuery {
  return {
    tab,
    q: "",
    kategori: null,
    min: null,
    max: null,
    mahalle: null,
    durum: null,
    sirala: "yeni",
    calisma: null,
    konum: null,
    deneyim: null,
    servis: false,
  };
}

export function parseListingsQuery(raw: RawSearchParams): ListingsQuery {
  const tab: ListingsTab = first(raw, "tab") === "is-ilanlari" ? "is-ilanlari" : "ikinci-el";
  const q = emptyQuery(tab);
  q.q = (first(raw, "q") ?? "").slice(0, SEARCH_MAX);
  const slug = first(raw, "kategori");
  q.kategori = slug && /^[a-z0-9-]{1,80}$/.test(slug) ? slug : null;
  const mahalle = first(raw, "mahalle");
  q.mahalle = mahalle && /^[a-z0-9-]{1,80}$/.test(mahalle) ? mahalle : null;
  if (tab === "ikinci-el") {
    q.min = intParam(first(raw, "min"));
    q.max = intParam(first(raw, "max"));
    if (q.min != null && q.max != null && q.min > q.max) [q.min, q.max] = [q.max, q.min];
    q.durum = has(CONDITIONS, first(raw, "durum"));
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
  const base: QueryRecord = { q: q.q || undefined, kategori: q.kategori, mahalle: q.mahalle };
  if (q.tab === "ikinci-el") {
    return { ...base, min: q.min, max: q.max, durum: q.durum, sirala: q.sirala === "yeni" ? undefined : q.sirala };
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
  if (q.mahalle) n++;
  if (q.tab === "ikinci-el") {
    if (q.min != null || q.max != null) n++;
    if (q.durum) n++;
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

/** Fully resolved arguments for search_listings (+ PostgREST filters). */
export type ResolvedSearch = {
  type: ListingType;
  q: string | null;
  categoryId: string | null;
  neighbourhoodId: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  condition: string | null;
  sort: RpcSort;
  workType: string | null;
  locationLabel: string | null;
  experience: string | null;
  shuttle: boolean;
};

export function resolveSearch(
  q: ListingsQuery,
  lookups: { categoryIdBySlug: (slug: string) => string | null; neighbourhoodIdBySlug: (slug: string) => string | null },
): ResolvedSearch {
  const type = TAB_TYPE[q.tab];
  return {
    type,
    q: q.q.trim() || null,
    categoryId: q.kategori ? lookups.categoryIdBySlug(q.kategori) : null,
    neighbourhoodId: q.mahalle ? lookups.neighbourhoodIdBySlug(q.mahalle) : null,
    minPrice: type === "classified" ? q.min : null,
    maxPrice: type === "classified" ? q.max : null,
    condition: type === "classified" ? q.durum : null,
    sort: type === "classified" ? (SORT_OPTIONS.find((s) => s.value === q.sirala)?.rpc ?? "newest") : "newest",
    workType: type === "job" ? q.calisma : null,
    locationLabel: type === "job" ? (JOB_LOCATIONS.find((l) => l.key === q.konum)?.label ?? null) : null,
    experience: type === "job" ? q.deneyim : null,
    shuttle: type === "job" && q.servis,
  };
}
