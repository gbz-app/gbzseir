/**
 * Search page data shapes and query helpers (pure TS, client and server safe).
 * Result shapes mirror rpc global_search (2026091385_search_kinds_audit.sql); missing groups and fields read as empty.
 */
import type { PoiKind } from "@/features/nearby/types";

export const SEARCH_MIN = 2;
export const SEARCH_MAX = 80;
/** Live search waits this long after the last keystroke. */
export const SEARCH_DEBOUNCE_MS = 250;

/** İlçe of a row (Kocaeli districts, 2026091380); missing on an older RPC. */
type WithDistrict = { district_id?: string | null; district_name?: string | null };

export type SearchListing = WithDistrict & {
  id: string;
  type: "classified" | "job";
  title: string;
  price_try: number | null;
  job_location_label: string | null;
  category_name: string | null;
  thumb_url: string | null;
};

export type SearchBusiness = WithDistrict & {
  id: string;
  slug: string;
  name: string;
  category_label: string | null;
  logo_url: string | null;
  /** Active tatil state (missing on an older RPC). */
  vacation_mode?: boolean;
  vacation_until?: string | null;
};

export type SearchService = { id: string; slug: string; name: string; parent_id: string | null; parent_name: string | null };

export type SearchPoi = WithDistrict & {
  id: string;
  kind: PoiKind;
  slug: string;
  name: string;
  address: string | null;
  /** Place category (kind 'place') or institution category key (kind 'institution'). */
  category: string | null;
  /** institution_categories label and lucide icon name (kind 'institution'). */
  category_label?: string | null;
  category_icon?: string | null;
};

export type SearchEvent = WithDistrict & {
  id: string;
  slug: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  venue_name: string | null;
  cover_url: string | null;
};

export type SearchArticle = { id: string; slug: string; title: string; category: string; cover_url: string | null; published_at: string };

/** An active doctor of a public sağlık business (business_staff); the page is /doktor/<slug>. */
export type SearchDoctor = WithDistrict & {
  id: string;
  slug: string;
  title: string;
  name: string;
  /** Title + name ("Uzm. Dr. Ayşe Yılmaz"; the "Diğer" title is left out). */
  display_name: string;
  branch: string;
  branch_label: string | null;
  photo_url: string | null;
  clinic_name: string;
};

export type SearchResults = {
  listings: SearchListing[];
  businesses: SearchBusiness[];
  services: SearchService[];
  pois: SearchPoi[];
  events: SearchEvent[];
  articles: SearchArticle[];
  doctors: SearchDoctor[];
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
    doctors: list<SearchDoctor>(d.doctors),
  };
}

export function resultCount(r: SearchResults): number {
  return (
    r.listings.length + r.businesses.length + r.services.length + r.pois.length + r.events.length + r.articles.length + r.doctors.length
  );
}

/** Result groups: ?tur= of /ara ("Tümünü gör" of one group). İlanlar / iş ilanları open their own list pages instead. */
export type SearchGroup =
  | "hizmetler"
  | "isletmeler"
  | "doktorlar"
  | "yerler"
  | "kurumlar"
  | "bankalar"
  | "akaryakit"
  | "sarj"
  | "ilanlar"
  | "is-ilanlari"
  | "etkinlikler"
  | "haberler";

export const SEARCH_GROUP_LABEL: Record<SearchGroup, string> = {
  isletmeler: "İşletmeler",
  doktorlar: "Doktorlar",
  hizmetler: "Hizmetler",
  yerler: "Yerler",
  kurumlar: "Resmî kurumlar",
  bankalar: "Bankalar ve ATM'ler",
  akaryakit: "Akaryakıt",
  sarj: "Şarj istasyonları",
  ilanlar: "İlanlar",
  "is-ilanlari": "İş ilanları",
  etkinlikler: "Etkinlikler",
  haberler: "Haberler",
};

/** The groups poi rows are split into (the RPC returns up to p_limit rows for each). */
export const POI_GROUPS = ["yerler", "kurumlar", "bankalar", "akaryakit", "sarj"] as const satisfies readonly SearchGroup[];
export type PoiGroup = (typeof POI_GROUPS)[number];

/** Group of a poi row: the city guide kinds get their own sections, the rest are "Yerler". */
export function poiGroup(kind: PoiKind): PoiGroup {
  switch (kind) {
    case "institution":
      return "kurumlar";
    case "atm":
    case "bank":
      return "bankalar";
    case "fuel":
      return "akaryakit";
    case "ev_charge":
      return "sarj";
    default:
      return "yerler";
  }
}

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
  /** İlçe name (popular_places.district_name, else the name of its district_id); null when unknown. */
  districtName: string | null;
};
