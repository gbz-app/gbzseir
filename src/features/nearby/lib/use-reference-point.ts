"use client";

import { useLocationPrefs } from "@/lib/location/store";
import type { LatLng } from "@/core/geo";

/**
 * The user's stored reference point WITHOUT prompting: last rounded GPS fix, else the chosen neighbourhood
 * centroid, else null. SSR-safe (null on the server and during hydration).
 */
export function useReferencePoint(): { point: LatLng | null; source: "gps" | "neighbourhood" | null; label: string | null } {
  const prefs = useLocationPrefs();
  if (prefs.mode === "gps" && prefs.coords) return { point: { lat: prefs.coords.lat, lng: prefs.coords.lng }, source: "gps", label: "Konumun" };
  const n = prefs.neighbourhood;
  if (n && typeof n.lat === "number" && typeof n.lng === "number") return { point: { lat: n.lat, lng: n.lng }, source: "neighbourhood", label: n.name };
  return { point: null, source: null, label: null };
}
