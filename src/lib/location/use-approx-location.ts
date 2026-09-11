"use client";

import * as React from "react";
import { CITY } from "@/config/site";
import { districtBySlug, isDistrictSlug, nearestDistrictWithin, type DistrictSlug } from "@/config/districts";
import { roundLatLng, type LatLng } from "@/core/geo";
import { useAuth } from "@/lib/auth/auth-provider";
import { createClient } from "@/lib/supabase/client";
import {
  getLocationPrefs,
  seedDistrictFromProfile,
  setApproxCoords,
  setDefaultDistrict,
  useLocationPrefs,
  type ChosenNeighbourhood,
} from "./store";

export type ApproxLocationStatus = "idle" | "locating" | "granted" | "denied" | "unavailable" | "error";

export type ApproxLocation = {
  /** Last GPS position rounded to 3 decimals (~100 m); null if never granted or user switched to manual. */
  coords: LatLng | null;
  /** When `coords` was captured (ms epoch). */
  updatedAt: number | null;
  status: ApproxLocationStatus;
  /** Turkish error message after a failed request. */
  error: string | null;
  /** Ask for the position. Call ONLY from a user action (button tap). Resolves to rounded coords or null. */
  request: () => Promise<LatLng | null>;
  /** Forget the GPS position (keeps the manual district). */
  clear: () => void;
  /** Manual district, or the district of the GPS fix; null when nothing is chosen or the fix is outside Kocaeli. */
  district: DistrictSlug | null;
  /** @deprecated Mahalle left the app; use `district`. The old manual neighbourhood (null in GPS mode and for new users). */
  neighbourhood: ChosenNeighbourhood | null;
  /** Best point for distance sorting: GPS -> district centre -> city center. */
  point: LatLng;
  /** "neighbourhood" is no longer returned; it stays in the union until every caller compares against "district". */
  pointSource: "gps" | "district" | "neighbourhood" | "city";
  isSupported: boolean;
};

const resolvedDistricts = new Map<string, DistrictSlug | null>();
const pendingDistricts = new Map<string, Promise<DistrictSlug | null>>();

/**
 * District of a point via rpc("district_for_point") (district polygons), cached per rounded point for this tab.
 * Null = outside Kocaeli. When the lookup fails (offline) the nearest district centre is used as an estimate.
 * Only the rounded (~100 m) point is sent.
 */
export function districtForPoint(point: LatLng): Promise<DistrictSlug | null> {
  const p = roundLatLng(point);
  const key = `${p.lat},${p.lng}`;
  if (resolvedDistricts.has(key)) return Promise.resolve(resolvedDistricts.get(key) ?? null);
  const pending = pendingDistricts.get(key);
  if (pending) return pending;
  const job = (async () => {
    try {
      const { data, error } = await createClient().rpc("district_for_point", { p_lat: p.lat, p_lng: p.lng });
      if (error) throw error;
      const id = data?.[0]?.id;
      const slug = isDistrictSlug(id) ? id : null;
      resolvedDistricts.set(key, slug);
      return slug;
    } catch {
      return nearestDistrictWithin(p)?.slug ?? null; // not cached: the next call asks the database again
    }
  })().finally(() => pendingDistricts.delete(key));
  pendingDistricts.set(key, job);
  return job;
}

function readPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, maximumAge: 5 * 60 * 1000, timeout: 12_000 }),
  );
}

/**
 * Location on demand. Never prompts by itself; call `request()` from a tap.
 * Coordinates are rounded before storage; only the rounded point is sent (to district_for_point) to find its district.
 */
export function useApproxLocation(): ApproxLocation {
  const prefs = useLocationPrefs();
  const { user, profile } = useAuth();
  const [status, setStatus] = React.useState<ApproxLocationStatus>("idle");
  const [error, setError] = React.useState<string | null>(null);

  const isSupported = typeof navigator !== "undefined" && "geolocation" in navigator;
  const gpsCoords = prefs.mode === "gps" && prefs.coords ? { lat: prefs.coords.lat, lng: prefs.coords.lng } : null;

  const request = React.useCallback(async (): Promise<LatLng | null> => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setStatus("unavailable");
      setError("Cihazın konum özelliğini desteklemiyor. İlçeni listeden seçebilirsin.");
      return null;
    }
    setStatus("locating");
    setError(null);
    let pos: GeolocationPosition;
    try {
      pos = await readPosition();
    } catch (e) {
      const code = (e as GeolocationPositionError | null)?.code;
      if (code === 1) {
        // PERMISSION_DENIED
        setStatus("denied");
        setError("Konum izni verilmedi. İlçeni listeden seçebilirsin.");
      } else if (code === 3) {
        // TIMEOUT
        setStatus("error");
        setError("Konum bulunamadı (zaman aşımı). Tekrar dene ya da ilçeni seç.");
      } else {
        setStatus("error");
        setError("Konum alınamadı. Tekrar dene ya da ilçeni seç.");
      }
      return null;
    }
    const stored = setApproxCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    if (stored) {
      // GPS mode follows the district of the fix (null outside Kocaeli).
      const district = await districtForPoint(stored);
      if (getLocationPrefs().mode === "gps") setDefaultDistrict(district, { keepMode: true });
    }
    setStatus("granted");
    return stored ? { lat: stored.lat, lng: stored.lng } : null;
  }, []);

  const clear = React.useCallback(() => {
    setApproxCoords(null);
    setStatus("idle");
  }, []);

  // A GPS fix stored without its district (older app version, or the lookup failed): fill it in.
  const gpsLat = gpsCoords?.lat;
  const gpsLng = gpsCoords?.lng;
  const needsDistrict = gpsLat !== undefined && gpsLng !== undefined && !prefs.district;
  React.useEffect(() => {
    if (!needsDistrict || gpsLat === undefined || gpsLng === undefined) return;
    let alive = true;
    void districtForPoint({ lat: gpsLat, lng: gpsLng }).then((slug) => {
      const now = getLocationPrefs();
      if (alive && slug && now.mode === "gps" && !now.district) setDefaultDistrict(slug, { keepMode: true });
    });
    return () => {
      alive = false;
    };
  }, [needsDistrict, gpsLat, gpsLng]);

  // Signed in with no local choice: use the district saved in the profile (once per value on this device).
  React.useEffect(() => {
    if (!user || !profile || profile.id !== user.id) return;
    seedDistrictFromProfile(user.id, profile.district_id ?? null);
  }, [user, profile]);

  const home = districtBySlug(prefs.district);
  let point: LatLng = CITY.center;
  let pointSource: ApproxLocation["pointSource"] = "city";
  if (gpsCoords) {
    point = gpsCoords;
    pointSource = "gps";
  } else if (home) {
    point = { lat: home.center.lat, lng: home.center.lng };
    pointSource = "district";
  }

  return {
    coords: gpsCoords,
    updatedAt: prefs.coords?.ts ?? null,
    status: status === "idle" && gpsCoords ? "granted" : status,
    error,
    request,
    clear,
    district: home?.slug ?? null,
    neighbourhood: prefs.mode === "gps" ? null : prefs.neighbourhood,
    point,
    pointSource,
    isSupported,
  };
}
