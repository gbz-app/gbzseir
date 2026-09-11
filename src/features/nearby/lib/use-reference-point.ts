"use client";

import { districtBySlug } from "@/config/districts";
import { useLocationPrefs } from "@/lib/location/store";
import type { LatLng } from "@/core/geo";

/**
 * The user's stored reference point WITHOUT prompting: last rounded GPS fix, else the chosen district's centre, else
 * null. SSR-safe (null on the server and during hydration).
 */
export function useReferencePoint(): { point: LatLng | null; source: "gps" | "district" | null; label: string | null } {
  const prefs = useLocationPrefs();
  if (prefs.mode === "gps" && prefs.coords) return { point: { lat: prefs.coords.lat, lng: prefs.coords.lng }, source: "gps", label: "Konumun" };
  const d = districtBySlug(prefs.district);
  if (d) return { point: { lat: d.center.lat, lng: d.center.lng }, source: "district", label: d.name };
  return { point: null, source: null, label: null };
}
