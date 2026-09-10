/**
 * Geo helpers (pure TS).
 * Privacy rule: coordinates are rounded (~100 m) before they leave the device and are never logged.
 */

export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in meters (haversine). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "350 m", "1,2 km", "12 km". */
export function formatDistance(meters: number | null | undefined): string {
  if (meters === null || meters === undefined || !Number.isFinite(meters)) return "";
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  const km = meters / 1000;
  if (km < 10) return `${km.toLocaleString("tr-TR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} km`;
  return `${Math.round(km).toLocaleString("tr-TR")} km`;
}

/** Round a coordinate; 3 decimals ≈ 110 m latitude / ~85 m longitude at Gebze. */
export function roundCoord(value: number, decimals = 3): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export function roundLatLng(p: LatLng, decimals = 3): LatLng {
  return { lat: roundCoord(p.lat, decimals), lng: roundCoord(p.lng, decimals) };
}

export function isValidLatLng(p: Partial<LatLng> | null | undefined): p is LatLng {
  return (
    !!p &&
    typeof p.lat === "number" &&
    typeof p.lng === "number" &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180
  );
}

/** True if p is within radiusKm of center (default 40 km, covers Gebze + Darıca/Çayırova/Dilovası). */
export function isNear(p: LatLng, center: LatLng, radiusKm = 40): boolean {
  return distanceMeters(p, center) <= radiusKm * 1000;
}

export type DirectionsTarget = LatLng & { name?: string };

/** Google Maps directions URL (works on Android, iOS and desktop). */
export function googleDirectionsUrl(t: DirectionsTarget): string {
  const params = new URLSearchParams({ api: "1", destination: `${t.lat},${t.lng}` });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Apple Maps directions URL (preferred on iOS). */
export function appleDirectionsUrl(t: DirectionsTarget): string {
  const params = new URLSearchParams({ daddr: `${t.lat},${t.lng}`, dirflg: "d" });
  if (t.name) params.set("q", t.name);
  return `https://maps.apple.com/?${params.toString()}`;
}

/** Google Maps place search URL (no directions). */
export function googleMapsPlaceUrl(t: DirectionsTarget): string {
  const params = new URLSearchParams({ api: "1", query: `${t.lat},${t.lng}` });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}
