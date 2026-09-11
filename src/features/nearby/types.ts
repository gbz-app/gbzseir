/**
 * Types for the nearby module (Yakınımda, nöbetçi eczane, cami, durak, gezilecek yerler).
 * The generated RPC types mark every column as non-null; these mirror what the DB really returns.
 */
import type { Json } from "@/lib/database.types";
import type { ContactSubjectType } from "@/lib/db-contract";

/**
 * Every poi.kind (poi_kind_check, 2026091376_city_guide.sql). The guide kinds (institution, fuel, ev_charge, bank, and
 * atm) open /kurum/<slug>; see src/features/guide/lib.
 */
export type PoiKind = "pharmacy" | "mosque" | "bus_stop" | "place" | "taxi" | "atm" | "institution" | "fuel" | "ev_charge" | "bank";

/** Chip filters on /yakinimda (?tur=). */
export type NearbyFilter =
  | "nobetci"
  | "eczane"
  | "cami"
  | "durak"
  | "taksi"
  | "atm"
  | "banka"
  | "akaryakit"
  | "sarj"
  | "kurum"
  | "gezilecek"
  | "isletme";

/** Visual kind of a map pin / list icon. */
export type MarkerKind =
  | "duty"
  | "pharmacy"
  | "mosque"
  | "bus_stop"
  | "taxi"
  | "atm"
  | "place"
  | "business"
  | "institution"
  | "fuel"
  | "ev_charge"
  | "bank";

/** Built-in gezilecek yer categories: seed and fallback of public.place_categories. */
export type BuiltinPlaceCategory =
  | "tarihi"
  | "park"
  | "tabiat_parki"
  | "doga"
  | "sahil"
  | "muze"
  | "kultur"
  | "spor"
  | "pazar"
  | "mezarlik"
  | "avm"
  | "ulasim"
  | "diger";

/**
 * A place_categories key (admin-managed, 2026091363; format CATEGORY_KEY_RE). placeCategoryMeta shows a key the
 * vocabulary does not know as "Diğer".
 */
export type PlaceCategory = string;

/** Row of rpc nearby_pois. */
export type PoiRow = {
  id: string;
  kind: PoiKind;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  lat: number;
  lng: number;
  neighbourhood_id: string | null;
  neighbourhood_name: string | null;
  details: Json;
  source: string;
  license: string | null;
  updated_at: string;
  distance_m: number | null;
};

/** Row of rpc duty_pharmacies_now / duty_pharmacies_for_day. */
export type DutyRow = {
  duty_id: string;
  poi_id: string;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  lat: number;
  lng: number;
  neighbourhood_id: string | null;
  neighbourhood_name: string | null;
  duty_start: string;
  duty_end: string;
  source: string;
  note: string | null;
  fetched_at: string;
  distance_m: number | null;
};

/** A single poi row for detail pages. */
export type PoiDetail = {
  id: string;
  kind: PoiKind;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  neighbourhood_id: string | null;
  neighbourhood_name: string | null;
  details: Json;
  source: string;
  license: string | null;
  updated_at: string;
};

/** A place photo; guide imports (Wikimedia Commons) also carry author, licence and the file page for the credit. */
export type PlacePhoto = {
  url: string;
  alt: string | null;
  credit: string | null;
  author?: string | null;
  licence?: string | null;
  sourcePage?: string | null;
};

export type PlaceDetails = {
  category: PlaceCategory;
  /** place_categories subkind (tarihi: cami, kale, türbe...; ulasim: tren, otogar, iskele), or null. */
  subkind: string | null;
  description: string | null;
  curated: boolean;
  photos: PlacePhoto[];
  hours: string | null;
  fee: string | null;
  wikidata: string | null;
};

export type StopDetails = {
  lines: string[];
  stopCode: string | null;
  shelter: boolean | null;
};

/** A place for the /gezilecek-yerler list. */
export type PlaceSummary = {
  id: string;
  slug: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  neighbourhoodName: string | null;
  details: PlaceDetails;
};

/** app_settings.duty_data_mode: labelled sample list, no list, or real rows only. */
export type DutyMode = "demo" | "off" | "live";

/** One pharmacy_duty row for the pharmacy detail page. */
export type PharmacyDuty = { id: string; duty_start: string; duty_end: string; source: string; note: string | null; fetched_at: string };

/** Duty window of a pharmacy (ISO strings). */
export type DutyWindowIso = { start: string; end: string };

/** Normalized list/map item on /yakinimda. */
export type NearbyItem = {
  id: string;
  kind: MarkerKind;
  name: string;
  href: string;
  subtitle: string | null;
  address: string | null;
  phone: string | null;
  lat: number;
  lng: number;
  /** Meters from the query point (null when unknown). */
  distance: number | null;
  subjectType: ContactSubjectType;
  /** Duty window (nöbetçi rows, or pharmacies that are on duty). */
  duty?: DutyWindowIso | null;
  /** Bus lines (durak). */
  lines?: string[];
  /** Business opening hours (businesses.working_hours). */
  hours?: Json | null;
  vacation?: boolean;
  verified?: boolean;
};
