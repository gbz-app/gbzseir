/**
 * Search page data shapes and query helpers (pure TS, client and server safe).
 * Result shapes mirror rpc global_search (2026091373_search.sql); missing groups read as empty.
 */
import type { PoiKind } from "@/features/nearby/types";

export const SEARCH_MIN = 2;
export const SEARCH_MAX = 80;
/** Live search waits this long after the last keystroke. */
export const SEARCH_DEBOUNCE_MS = 250;

export type SearchListing = {
  id: string;
  type: "classified" | "job";
  title: string;
  price_try: number | null;
  job_location_label: string | null;
  category_name: string | null;
  neighbourhood_name: string | null;
  thumb_url: string | null;
};

export type SearchBusiness = {
  id: string;
  slug: string;
  name: string;
  category_label: string | null;
  logo_url: string | null;
  neighbourhood_name: string | null;
  /** Active tatil state (missing on an older RPC). */
  vacation_mode?: boolean;
  vacation_until?: string | null;
};

export type SearchService = { id: string; slug: string; name: string; parent_id: string | null; parent_name: string | null };

export type SearchPoi = {
  id: string;
  kind: PoiKind;
  slug: string;
  name: string;
  address: string | null;
  neighbourhood_name: string | null;
  /** Place category (kind 'place'). */
  category: string | null;
};

export type SearchEvent = {
  id: string;
  slug: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  venue_name: string | null;
  cover_url: string | null;
  neighbourhood_name: string | null;
};

export type SearchArticle = { id: string; slug: string; title: string; category: string; cover_url: string | null; published_at: string };

export type SearchResults = {
  listings: SearchListing[];
  businesses: SearchBusiness[];
  services: SearchService[];
  pois: SearchPoi[];
  events: SearchEvent[];
  articles: SearchArticle[];
};

/** A finished search: the query it answers and its results (null = the request failed). */
export type SearchAnswer = { q: string; data: SearchResults | null };

const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** rpc global_search JSON -> SearchResults (tolerant: unknown or missing groups are empty). */
export function toSearchResults(data: unknown): SearchResults {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  return {
    listings: list<SearchListing>(d.listings),
    businesses: list<SearchBusiness>(d.businesses),
    services: list<SearchService>(d.services),
    pois: list<SearchPoi>(d.pois),
    events: list<SearchEvent>(d.events),
    articles: list<SearchArticle>(d.articles),
  };
}

export function resultCount(r: SearchResults): number {
  return r.listings.length + r.businesses.length + r.services.length + r.pois.length + r.events.length + r.articles.length;
}

/** Result groups: ?tur= of /ara ("Tümünü gör" of one group). İlanlar / iş ilanları open their own list pages instead. */
export type SearchGroup = "hizmetler" | "isletmeler" | "yerler" | "ilanlar" | "is-ilanlari" | "etkinlikler" | "haberler";

export const SEARCH_GROUP_LABEL: Record<SearchGroup, string> = {
  isletmeler: "İşletmeler",
  hizmetler: "Hizmetler",
  yerler: "Yerler",
  ilanlar: "İlanlar",
  "is-ilanlari": "İş ilanları",
  etkinlikler: "Etkinlikler",
  haberler: "Haberler",
};

export function parseSearchGroup(v: unknown): SearchGroup | undefined {
  return typeof v === "string" && v in SEARCH_GROUP_LABEL ? (v as SearchGroup) : undefined;
}

/** One space between words, trimmed, at most SEARCH_MAX characters. */
export function cleanQuery(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim().slice(0, SEARCH_MAX);
}

/**
 * Worth counting as a search term / keeping as a recent search? Mirrors public.log_search: 2-60 characters, fewer than
 * 7 digits (phone / TC numbers), no e-mail or link, letters, digits and a few separators only.
 */
export function isLoggableTerm(term: string): boolean {
  const s = cleanQuery(term);
  if (s.length < SEARCH_MIN || s.length > 60) return false;
  if ((s.match(/\d/g)?.length ?? 0) >= 7) return false;
  if (s.includes("@") || /(:\/\/|www\.|https?:)/i.test(s)) return false;
  return /^[\p{L}\p{N}][\p{L}\p{N} .,&/+'-]*$/u.test(s);
}

/** A card of "Popüler yerler" (rpc popular_places). */
export type PopularPlace = {
  kind: "business" | "place";
  id: string;
  slug: string;
  name: string;
  /** Business vertical key or place category key. */
  category: string | null;
  /** Business category label (null for places). */
  label: string | null;
  imageUrl: string | null;
  neighbourhoodName: string | null;
};
