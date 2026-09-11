/**
 * Kocaeli's 12 districts (ilçe). The app covers the whole province; a row's location is district + address + map pin.
 *
 * Mirrors public.districts (supabase/migrations/2026091380_kocaeli_districts.sql): `slug` = districts.id (the value of
 * every district_id column and of ?ilce=), `kbb_ilce_id` = the ilce_id of the KBB open data (kocaeli/*.json),
 * `osm_relation_id` = the OSM admin_level=6 boundary relation, `center` = its admin centre (the Nominatim label point for
 * Darıca, Kartepe and Başiskele). Static, so pickers and labels need no DB fetch.
 *
 * nearestDistrict() is a centre-based estimate; the exact point -> district lookup (polygons) is rpc("district_for_point").
 */

import { distanceMeters } from "@/core/geo";
import { trNormalize } from "@/core/tr";

export type DistrictSlug =
  | "izmit"
  | "gebze"
  | "darica"
  | "cayirova"
  | "dilovasi"
  | "korfez"
  | "derince"
  | "kartepe"
  | "basiskele"
  | "golcuk"
  | "karamursel"
  | "kandira";

export type KocaeliDistrict = {
  readonly slug: DistrictSlug;
  readonly name: string;
  readonly kbb_ilce_id: number;
  readonly center: { readonly lat: number; readonly lng: number };
  readonly osm_relation_id: number;
};

/** In the display order of public.districts.sort. */
export const KOCAELI_DISTRICTS: readonly KocaeliDistrict[] = [
  { slug: "izmit", name: "İzmit", kbb_ilce_id: 2062, center: { lat: 40.7721, lng: 29.9506 }, osm_relation_id: 1211493 },
  { slug: "gebze", name: "Gebze", kbb_ilce_id: 1338, center: { lat: 40.8007, lng: 29.4318 }, osm_relation_id: 1211496 },
  { slug: "darica", name: "Darıca", kbb_ilce_id: 2060, center: { lat: 40.7575, lng: 29.3841 }, osm_relation_id: 1211490 },
  { slug: "cayirova", name: "Çayırova", kbb_ilce_id: 2059, center: { lat: 40.8337, lng: 29.3815 }, osm_relation_id: 1211204 },
  { slug: "dilovasi", name: "Dilovası", kbb_ilce_id: 2061, center: { lat: 40.7756, lng: 29.5261 }, osm_relation_id: 1211488 },
  { slug: "korfez", name: "Körfez", kbb_ilce_id: 1821, center: { lat: 40.7608, lng: 29.7839 }, osm_relation_id: 1211492 },
  { slug: "derince", name: "Derince", kbb_ilce_id: 2030, center: { lat: 40.7574, lng: 29.8308 }, osm_relation_id: 1211495 },
  { slug: "kartepe", name: "Kartepe", kbb_ilce_id: 2063, center: { lat: 40.7454, lng: 30.0113 }, osm_relation_id: 1211033 },
  { slug: "basiskele", name: "Başiskele", kbb_ilce_id: 2058, center: { lat: 40.7129, lng: 29.9287 }, osm_relation_id: 1211497 },
  { slug: "golcuk", name: "Gölcük", kbb_ilce_id: 1355, center: { lat: 40.7169, lng: 29.8196 }, osm_relation_id: 1211494 },
  { slug: "karamursel", name: "Karamürsel", kbb_ilce_id: 1440, center: { lat: 40.6913, lng: 29.6166 }, osm_relation_id: 1211489 },
  { slug: "kandira", name: "Kandıra", kbb_ilce_id: 1430, center: { lat: 41.0704, lng: 30.1523 }, osm_relation_id: 1211491 },
];

export const DISTRICT_SLUGS: readonly DistrictSlug[] = KOCAELI_DISTRICTS.map((d) => d.slug);

export function isDistrictSlug(value: unknown): value is DistrictSlug {
  return typeof value === "string" && KOCAELI_DISTRICTS.some((d) => d.slug === value);
}

export function districtBySlug(slug: string | null | undefined): KocaeliDistrict | undefined {
  return slug ? KOCAELI_DISTRICTS.find((d) => d.slug === slug) : undefined;
}

/** Display name of a district slug; `fallback` (the province) when unknown or empty. */
export function districtName(slug: string | null | undefined, fallback = "Kocaeli"): string {
  return districtBySlug(slug)?.name ?? fallback;
}

/** District by display name, Turkish-insensitive ("GEBZE", "gebze" -> Gebze). */
export function districtByName(name: string | null | undefined): KocaeliDistrict | undefined {
  const n = trNormalize(name);
  return n ? KOCAELI_DISTRICTS.find((d) => trNormalize(d.name) === n) : undefined;
}

export function districtByKbbIlceId(ilceId: number | null | undefined): KocaeliDistrict | undefined {
  return ilceId == null ? undefined : KOCAELI_DISTRICTS.find((d) => d.kbb_ilce_id === ilceId);
}

/** The district whose centre is closest to the point (great-circle distance). An estimate near district borders. */
export function nearestDistrict(point: { lat: number; lng: number }): KocaeliDistrict {
  const rad = Math.PI / 180;
  let best = KOCAELI_DISTRICTS[0];
  let bestD = Infinity;
  for (const d of KOCAELI_DISTRICTS) {
    const dLat = (d.center.lat - point.lat) * rad;
    const dLng = (d.center.lng - point.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(point.lat * rad) * Math.cos(d.center.lat * rad) * Math.sin(dLng / 2) ** 2;
    if (h < bestD) {
      bestD = h;
      best = d;
    }
  }
  return best;
}

/** nearestDistrict() for points near Kocaeli only: undefined when the closest centre is farther than `maxMeters`. */
export function nearestDistrictWithin(point: { lat: number; lng: number }, maxMeters = 35_000): KocaeliDistrict | undefined {
  const d = nearestDistrict(point);
  return distanceMeters(point, d.center) <= maxMeters ? d : undefined;
}
