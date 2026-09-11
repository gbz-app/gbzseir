"use client";

import * as React from "react";
import { CITY } from "@/config/site";
import { distanceMeters, type LatLng } from "@/core/geo";
import { useAuth } from "@/lib/auth/auth-provider";
import { useNeighbourhoods } from "@/lib/neighbourhoods";
import {
  isProfileSeedDone,
  seedNeighbourhoodFromProfile,
  setApproxCoords,
  setDefaultNeighbourhood,
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
  /** Forget the GPS position (keeps the manual neighbourhood). */
  clear: () => void;
  /** Manual neighbourhood, or the nearest neighbourhood to the GPS fix (when neighbourhood centroids exist). */
  neighbourhood: ChosenNeighbourhood | null;
  /** Best point for distance sorting: GPS -> neighbourhood centroid -> city center. */
  point: LatLng;
  pointSource: "gps" | "neighbourhood" | "city";
  isSupported: boolean;
};

const MAX_NEAREST_M = 6000;

/**
 * Location on demand. Never prompts by itself; call `request()` from a tap.
 * Coordinates are rounded before storage and never sent anywhere by this hook.
 */
export function useApproxLocation(): ApproxLocation {
  const prefs = useLocationPrefs();
  const { user, profile } = useAuth();
  const { neighbourhoods, loading: listLoading, error: listError } = useNeighbourhoods();
  const [status, setStatus] = React.useState<ApproxLocationStatus>("idle");
  const [error, setError] = React.useState<string | null>(null);

  const isSupported = typeof navigator !== "undefined" && "geolocation" in navigator;
  const gpsCoords = prefs.mode === "gps" && prefs.coords ? { lat: prefs.coords.lat, lng: prefs.coords.lng } : null;

  const nearest = React.useMemo<ChosenNeighbourhood | null>(() => {
    if (!gpsCoords) return null;
    let best: ChosenNeighbourhood | null = null;
    let bestD = Infinity;
    for (const n of neighbourhoods) {
      if (typeof n.lat !== "number" || typeof n.lng !== "number") continue;
      const d = distanceMeters(gpsCoords, { lat: n.lat, lng: n.lng });
      if (d < bestD) {
        bestD = d;
        best = { id: String(n.id), name: n.name, district: n.district ?? null, lat: n.lat, lng: n.lng };
      }
    }
    return bestD <= MAX_NEAREST_M ? best : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gpsCoords?.lat, gpsCoords?.lng, neighbourhoods]);

  const request = React.useCallback(async (): Promise<LatLng | null> => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setStatus("unavailable");
      setError("Cihazın konum özelliğini desteklemiyor. Mahalleni listeden seçebilirsin.");
      return null;
    }
    setStatus("locating");
    setError(null);
    return new Promise<LatLng | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const stored = setApproxCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setStatus("granted");
          resolve(stored ? { lat: stored.lat, lng: stored.lng } : null);
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            setStatus("denied");
            setError("Konum izni verilmedi. Mahalleni listeden seçebilirsin.");
          } else if (err.code === err.TIMEOUT) {
            setStatus("error");
            setError("Konum bulunamadı (zaman aşımı). Tekrar dene ya da mahalleni seç.");
          } else {
            setStatus("error");
            setError("Konum alınamadı. Tekrar dene ya da mahalleni seç.");
          }
          resolve(null);
        },
        { enableHighAccuracy: false, maximumAge: 5 * 60 * 1000, timeout: 12_000 },
      );
    });
  }, []);

  const clear = React.useCallback(() => {
    setApproxCoords(null);
    setStatus("idle");
  }, []);

  // Keep the stored neighbourhood in sync with the nearest one while in GPS mode.
  React.useEffect(() => {
    if (prefs.mode === "gps" && nearest && nearest.id !== prefs.neighbourhood?.id) {
      setDefaultNeighbourhood(nearest, { keepMode: true });
    }
  }, [nearest, prefs.mode, prefs.neighbourhood?.id]);

  // Signed in with no local choice: use the neighbourhood saved in the profile (once per value on this device).
  React.useEffect(() => {
    if (!user || !profile || profile.id !== user.id) return;
    const id = profile.neighbourhood_id != null ? String(profile.neighbourhood_id) : null;
    if (isProfileSeedDone(user.id, id)) return;
    if (!id) {
      seedNeighbourhoodFromProfile(user.id, null, null);
      return;
    }
    if (listLoading || listError) return; // wait for the list (name + centroid)
    const n = neighbourhoods.find((x) => String(x.id) === id);
    seedNeighbourhoodFromProfile(user.id, id, n ? { id, name: n.name, district: n.district ?? null, lat: n.lat ?? null, lng: n.lng ?? null } : null);
  }, [user, profile, neighbourhoods, listLoading, listError]);

  const neighbourhood = prefs.mode === "gps" ? (nearest ?? prefs.neighbourhood) : prefs.neighbourhood;
  let point: LatLng = CITY.center;
  let pointSource: ApproxLocation["pointSource"] = "city";
  if (gpsCoords) {
    point = gpsCoords;
    pointSource = "gps";
  } else if (neighbourhood && typeof neighbourhood.lat === "number" && typeof neighbourhood.lng === "number") {
    point = { lat: neighbourhood.lat, lng: neighbourhood.lng };
    pointSource = "neighbourhood";
  }

  return {
    coords: gpsCoords,
    updatedAt: prefs.coords?.ts ?? null,
    status: status === "idle" && gpsCoords ? "granted" : status,
    error,
    request,
    clear,
    neighbourhood,
    point,
    pointSource,
    isSupported,
  };
}
