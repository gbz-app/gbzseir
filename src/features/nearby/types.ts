/**
 * Types for the nearby module (Yakınımda, nöbetçi eczane, cami, durak, gezilecek yerler).
 * The generated RPC types mark every column as non-null; these mirror what the DB really returns.
 */
import type { Json } from "@/lib/database.types";
import type { ContactSubjectType } from "@/lib/db-contract";

export type PoiKind = "pharmacy" | "mosque" | "bus_stop" | "place";

/** Chip filters on /yakinimda (?tur=). */
export type NearbyFilter = "nobetci" | "eczane" | "cami" | "durak" | "gezilecek" | "isletme";

/** Visual kind of a map pin / list icon. */
export type MarkerKind = "duty" | "pharmacy" | "mosque" | "bus_stop" | "place" | "business";

export type PlaceCategory = "tarihi" | "park" | "doga" | "muze" | "avm" | "diger";

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

export type PlacePhoto = { url: string; alt: string | null; credit: string | null };

export type PlaceDetails = {
  category: PlaceCategory;
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
