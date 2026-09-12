/**
 * Types for the nearby module (Yakınımda, nöbetçi eczane, cami, durak, gezilecek yerler).
 * The generated RPC types mark every column as non-null; these mirror what the DB really returns.
 */
import type { LucideIcon } from "lucide-react";
import type { Json } from "@/lib/database.types";
import type { ContactSubjectType } from "@/lib/db-contract";

/**
 * Every poi.kind (poi_kind_check, 2026091376_city_guide.sql). The guide kinds (institution, fuel, ev_charge, bank, and
 * atm) open /kurum/<slug>; see src/features/guide/lib.
 */
export type PoiKind = "pharmacy" | "mosque" | "bus_stop" | "place" | "taxi" | "atm" | "institution" | "fuel" | "ev_charge" | "bank";

/** Chip filters on /yakinimda (?tur=); "hepsi" = the nearest few of every kind, grouped by kind in the list. */
export type NearbyFilter =
  | "hepsi"
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

/** İlçe of a row (Kocaeli districts, 2026091380): districts.id and its name; missing on an older RPC. */
type WithDistrict = { district_id?: string | null; district_name?: string | null };

/** Row of rpc nearby_pois. */
export type PoiRow = WithDistrict & {
  id: string;
  kind: PoiKind;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  lat: number;
  lng: number;
  /** @deprecated Mahalle left the app (phase C drops it); use district_id. */
  neighbourhood_id: string | null;
  /** @deprecated Mahalle left the app (phase C drops it); use district_id. */
  neighbourhood_name: string | null;
  details: Json;
  source: string;
  license: string | null;
  updated_at: string;
  distance_m: number | null;
};

/** Row of rpc duty_pharmacies_now / duty_pharmacies_for_day. */
export type DutyRow = WithDistrict & {
  duty_id: string;
  poi_id: string;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  lat: number;
  lng: number;
  /** @deprecated Mahalle left the app (phase C drops it); use district_id. */
  neighbourhood_id: string | null;
  /** @deprecated Mahalle left the app (phase C drops it); use district_id. */
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
  /** districts.id (DistrictSlug), null when unknown. */
  district_id: string | null;
  details: Json;
  source: string;
  license: string | null;
  updated_at: string;
};

/**
 * A place photo; guide imports (Wikimedia Commons) also carry author, licence, licence link and the file page for the
 * credit. `thumbUrl`: the 1024 px variant (details.photos[].thumb_url) for list and rail cards; `url` is the original.
 */
export type PlacePhoto = {
  url: string;
  alt: string | null;
  credit: string | null;
  author?: string | null;
  licence?: string | null;
  licenceUrl?: string | null;
  sourcePage?: string | null;
  thumbUrl?: string | null;
  width?: number | null;
  height?: number | null;
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
  /** GTFS stop_id of the Kocaeli feed (KBB stops); null on older OpenStreetMap stops. Keys the timetable (stop-times.ts). */
  stopId: string | null;
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
  /** districts.id (DistrictSlug), null when unknown. */
  districtId: string | null;
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
  /** Category icon (guide rows: the institution or place category); the kind's icon when absent. */
  icon?: LucideIcon;
  /** No map location yet (guide rows without a pin): lat / lng are 0 and the card has no Yol tarifi / Haritada göster. */
  noPin?: boolean;
};
