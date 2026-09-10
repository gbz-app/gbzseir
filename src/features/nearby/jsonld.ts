/**
 * schema.org builders for the nearby pages (rendered with <JsonLd/>).
 */
import { CITY, SITE_URL } from "@/config/site";
import type { PoiDetail } from "./types";

export function postalAddress(address: string | null | undefined) {
  return {
    "@type": "PostalAddress",
    ...(address ? { streetAddress: address } : {}),
    addressLocality: CITY.name,
    addressRegion: CITY.province,
    addressCountry: "TR",
  };
}

export function geoCoordinates(lat: number | null | undefined, lng: number | null | undefined) {
  if (typeof lat !== "number" || typeof lng !== "number") return undefined;
  return { "@type": "GeoCoordinates", latitude: lat, longitude: lng };
}

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path}`;
}

/** Base Place-like object for a poi. */
export function poiJsonLd(
  poi: Pick<PoiDetail, "name" | "address" | "phone" | "lat" | "lng">,
  type: string | string[],
  path: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": type,
    name: poi.name,
    url: absoluteUrl(path),
    address: postalAddress(poi.address),
    ...(poi.phone ? { telephone: poi.phone } : {}),
    ...(geoCoordinates(poi.lat, poi.lng) ? { geo: geoCoordinates(poi.lat, poi.lng) } : {}),
    ...extra,
  };
}

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absoluteUrl(it.path) })),
  };
}
