"use client";

import * as React from "react";
import { STORAGE_KEYS } from "@/config/site";
import { roundLatLng, isValidLatLng, type LatLng } from "@/core/geo";
import { readJSON, removeItem, writeJSON } from "@/lib/storage";

/** Rounded (~100 m) coordinates kept on the device only. */
export type StoredCoords = LatLng & { ts: number };

/** A neighbourhood the user picked (subset of the neighbourhoods row, cached locally). */
export type ChosenNeighbourhood = {
  id: string;
  name: string;
  district?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export type LocationPrefs = {
  /** Last GPS position (already rounded to 3 decimals). */
  coords: StoredCoords | null;
  /** Neighbourhood chosen manually (or the nearest one after GPS). */
  neighbourhood: ChosenNeighbourhood | null;
  /** What the user used last: GPS or a manual neighbourhood choice. */
  mode: "gps" | "manual" | null;
};

const EMPTY: LocationPrefs = { coords: null, neighbourhood: null, mode: null };
const listeners = new Set<() => void>();
let cache: LocationPrefs | null = null;

function load(): LocationPrefs {
  const coords = readJSON<StoredCoords | null>(STORAGE_KEYS.location, null);
  const stored = readJSON<{ neighbourhood?: ChosenNeighbourhood | null; mode?: LocationPrefs["mode"] } | ChosenNeighbourhood | null>(
    STORAGE_KEYS.neighbourhood,
    null,
  );
  // Support both {neighbourhood, mode} and a bare neighbourhood object.
  let neighbourhood: ChosenNeighbourhood | null = null;
  let mode: LocationPrefs["mode"] = null;
  if (stored && "neighbourhood" in stored) {
    neighbourhood = stored.neighbourhood ?? null;
    mode = stored.mode ?? null;
  } else if (stored && "id" in stored) {
    neighbourhood = stored;
    mode = "manual";
  }
  const validCoords = coords && isValidLatLng(coords) ? coords : null;
  if (!mode) mode = validCoords ? "gps" : neighbourhood ? "manual" : null;
  return { coords: validCoords, neighbourhood, mode };
}

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEYS.location || e.key === STORAGE_KEYS.neighbourhood) {
      cache = load();
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** Current prefs (client). */
export function getLocationPrefs(): LocationPrefs {
  if (typeof window === "undefined") return EMPTY;
  if (!cache) cache = load();
  return cache;
}

function persist(next: LocationPrefs) {
  cache = next;
  if (next.coords) writeJSON(STORAGE_KEYS.location, next.coords);
  else removeItem(STORAGE_KEYS.location);
  if (next.neighbourhood || next.mode) writeJSON(STORAGE_KEYS.neighbourhood, { neighbourhood: next.neighbourhood, mode: next.mode });
  else removeItem(STORAGE_KEYS.neighbourhood);
  emit();
}

/** Save a GPS fix. Coordinates are rounded to ~100 m BEFORE being stored. */
export function setApproxCoords(coords: LatLng | null): StoredCoords | null {
  const prev = getLocationPrefs();
  if (!coords || !isValidLatLng(coords)) {
    persist({ ...prev, coords: null, mode: prev.neighbourhood ? "manual" : null });
    return null;
  }
  const rounded: StoredCoords = { ...roundLatLng(coords), ts: Date.now() };
  persist({ ...prev, coords: rounded, mode: "gps" });
  return rounded;
}

/** Save the user's default neighbourhood (manual choice). Pass null to clear. */
export function setDefaultNeighbourhood(n: ChosenNeighbourhood | null, opts: { keepMode?: boolean } = {}): void {
  const prev = getLocationPrefs();
  const clean = n ? { id: String(n.id), name: n.name, district: n.district ?? null, lat: n.lat ?? null, lng: n.lng ?? null } : null;
  persist({ ...prev, neighbourhood: clean, mode: opts.keepMode ? prev.mode : clean ? "manual" : prev.coords ? "gps" : null });
}

/** Default neighbourhood id (for forms that pre-fill Mahalle). */
export function getDefaultNeighbourhood(): ChosenNeighbourhood | null {
  return getLocationPrefs().neighbourhood;
}

/** Forget location + neighbourhood (settings > "Konum verilerimi sil"). */
export function clearLocationPrefs(): void {
  persist(EMPTY);
}

/** Reactive location prefs (SSR-safe: EMPTY on the server and first render). */
export function useLocationPrefs(): LocationPrefs {
  return React.useSyncExternalStore(subscribe, getLocationPrefs, () => EMPTY);
}
