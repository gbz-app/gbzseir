"use client";

import * as React from "react";
import { STORAGE_KEYS } from "@/config/site";
import { districtByName, isDistrictSlug, nearestDistrictWithin, type DistrictSlug } from "@/config/districts";
import { roundLatLng, isValidLatLng, type LatLng } from "@/core/geo";
import { readJSON, readString, removeItem, writeJSON, writeString } from "@/lib/storage";

/** Rounded (~100 m) coordinates kept on the device only. */
export type StoredCoords = LatLng & { ts: number };

/**
 * @deprecated Mahalle left the app; use LocationPrefs.district. Kept (read-only in practice) until phase C.
 * A neighbourhood the user picked (subset of the neighbourhoods row, cached locally).
 */
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
  /** District chosen manually, or the district of the GPS fix (kept in sync by useApproxLocation). */
  district: DistrictSlug | null;
  /** @deprecated Old neighbourhood choice (migrated to `district`); null for new users. */
  neighbourhood: ChosenNeighbourhood | null;
  /** What the user used last: GPS or a manual district choice. */
  mode: "gps" | "manual" | null;
};

const EMPTY: LocationPrefs = { coords: null, district: null, neighbourhood: null, mode: null };
const listeners = new Set<() => void>();
let cache: LocationPrefs | null = null;

function readLegacyNeighbourhood(): { neighbourhood: ChosenNeighbourhood | null; mode: LocationPrefs["mode"] } {
  const stored = readJSON<{ neighbourhood?: ChosenNeighbourhood | null; mode?: LocationPrefs["mode"] } | ChosenNeighbourhood | null>(
    STORAGE_KEYS.neighbourhood,
    null,
  );
  // Support both {neighbourhood, mode} and a bare neighbourhood object.
  if (stored && typeof stored === "object" && "neighbourhood" in stored) return { neighbourhood: stored.neighbourhood ?? null, mode: stored.mode ?? null };
  if (stored && typeof stored === "object" && "id" in stored) return { neighbourhood: stored, mode: "manual" };
  return { neighbourhood: null, mode: null };
}

/** District of an old neighbourhood choice: its district name, else the district nearest to its centroid. */
function districtOfNeighbourhood(n: ChosenNeighbourhood | null): DistrictSlug | null {
  if (!n) return null;
  const byName = districtByName(n.district);
  if (byName) return byName.slug;
  if (typeof n.lat !== "number" || typeof n.lng !== "number" || !isValidLatLng({ lat: n.lat, lng: n.lng })) return null;
  return nearestDistrictWithin({ lat: n.lat, lng: n.lng })?.slug ?? null;
}

function load(): LocationPrefs {
  const coords = readJSON<StoredCoords | null>(STORAGE_KEYS.location, null);
  const validCoords = coords && isValidLatLng(coords) ? coords : null;
  const legacy = readLegacyNeighbourhood();
  const stored = readJSON<{ district?: unknown; mode?: unknown } | null>(STORAGE_KEYS.district, null);
  let district: DistrictSlug | null;
  let mode: LocationPrefs["mode"];
  if (stored && typeof stored === "object") {
    district = isDistrictSlug(stored.district) ? stored.district : null;
    mode = stored.mode === "gps" || stored.mode === "manual" ? stored.mode : null;
  } else {
    // First run after the Kocaeli update: carry an old neighbourhood choice over to its district (once).
    district = districtOfNeighbourhood(legacy.neighbourhood);
    mode = legacy.mode;
    if (district || mode) writeJSON(STORAGE_KEYS.district, { district, mode });
  }
  if (!mode) mode = validCoords ? "gps" : district || legacy.neighbourhood ? "manual" : null;
  return { coords: validCoords, district, neighbourhood: legacy.neighbourhood, mode };
}

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEYS.location || e.key === STORAGE_KEYS.district || e.key === STORAGE_KEYS.neighbourhood) {
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
  // Written whenever the legacy key exists too, so an old neighbourhood is never migrated twice.
  if (next.district || next.mode || next.neighbourhood) writeJSON(STORAGE_KEYS.district, { district: next.district, mode: next.mode });
  else removeItem(STORAGE_KEYS.district);
  if (next.neighbourhood) writeJSON(STORAGE_KEYS.neighbourhood, { neighbourhood: next.neighbourhood, mode: next.mode });
  else removeItem(STORAGE_KEYS.neighbourhood);
  emit();
}

/** Save a GPS fix. Coordinates are rounded to ~100 m BEFORE being stored. */
export function setApproxCoords(coords: LatLng | null): StoredCoords | null {
  const prev = getLocationPrefs();
  if (!coords || !isValidLatLng(coords)) {
    persist({ ...prev, coords: null, mode: prev.district || prev.neighbourhood ? "manual" : null });
    return null;
  }
  const rounded: StoredCoords = { ...roundLatLng(coords), ts: Date.now() };
  persist({ ...prev, coords: rounded, mode: "gps" });
  return rounded;
}

/**
 * Save the user's default district. A manual choice switches to manual mode; `keepMode` keeps the current mode
 * (GPS mode storing the district of the fix). Pass null to clear.
 */
export function setDefaultDistrict(slug: DistrictSlug | null, opts: { keepMode?: boolean } = {}): void {
  const prev = getLocationPrefs();
  const district = isDistrictSlug(slug) ? slug : null;
  // An old neighbourhood of another district would contradict the choice.
  const neighbourhood = district && districtOfNeighbourhood(prev.neighbourhood) === district ? prev.neighbourhood : null;
  const mode = opts.keepMode ? prev.mode : district ? "manual" : prev.coords ? "gps" : null;
  if (district === prev.district && neighbourhood === prev.neighbourhood && mode === prev.mode) return;
  persist({ ...prev, district, neighbourhood, mode });
}

/** Default district slug (for forms and filters that pre-fill İlçe). */
export function getDefaultDistrict(): DistrictSlug | null {
  return getLocationPrefs().district;
}

/** Reactive default district slug (null on the server and first render). */
export function useDefaultDistrict(): DistrictSlug | null {
  return useLocationPrefs().district;
}

/** @deprecated Use setDefaultDistrict. Saves a neighbourhood; a manual pick also sets its district. */
export function setDefaultNeighbourhood(n: ChosenNeighbourhood | null, opts: { keepMode?: boolean } = {}): void {
  const prev = getLocationPrefs();
  const clean = n ? { id: String(n.id), name: n.name, district: n.district ?? null, lat: n.lat ?? null, lng: n.lng ?? null } : null;
  // GPS mode (keepMode) owns the district: it comes from the fix, not from a nearby neighbourhood.
  const district = clean && !opts.keepMode ? (districtOfNeighbourhood(clean) ?? prev.district) : prev.district;
  persist({ ...prev, neighbourhood: clean, district, mode: opts.keepMode ? prev.mode : clean ? "manual" : prev.mode });
}

/** @deprecated Use getDefaultDistrict. */
export function getDefaultNeighbourhood(): ChosenNeighbourhood | null {
  return getLocationPrefs().neighbourhood;
}

function seedMark(userId: string, id: string | null): string {
  return `${userId}:${id ?? ""}`;
}

/** "<userId>:<profile district id>" last considered on this device (kept by clearLocationPrefs). */
const DISTRICT_SEEDED_FOR_KEY = `${STORAGE_KEYS.district}.seededFor`;
let districtSeededFor: string | null = null;

/**
 * Seed the district from the account (profiles.district_id) when there is no local choice.
 * Once per account and profile value on this device: never overwrites a local choice, a later local clear stays cleared.
 */
export function seedDistrictFromProfile(userId: string, districtId: string | null): void {
  const mark = seedMark(userId, districtId);
  if (districtSeededFor === mark) return;
  const storedMark = readString(DISTRICT_SEEDED_FOR_KEY);
  if (storedMark === mark) {
    districtSeededFor = mark;
    return;
  }
  // First district seed on this device, but the account's neighbourhood was seeded before: that local choice was
  // migrated to its district (or cleared on purpose), so it is not overwritten.
  const legacy = storedMark === null ? readString(SEEDED_FOR_KEY) : null;
  districtSeededFor = mark;
  writeString(DISTRICT_SEEDED_FOR_KEY, mark);
  if (legacy && legacy.startsWith(`${userId}:`) && legacy.length > userId.length + 1) return;
  const prev = getLocationPrefs();
  if (isDistrictSlug(districtId) && !prev.district && !prev.mode) setDefaultDistrict(districtId);
}

/**
 * Profile edit saved a new district: mirror it in the local choice.
 * A removed one is forgotten here only when it is also the local choice.
 */
export function applyProfileDistrict(prevId: string | null, nextId: string | null): void {
  const next = isDistrictSlug(nextId) ? nextId : null;
  const prevSlug = prevId || null;
  if (next === prevSlug) return;
  const local = getLocationPrefs().district;
  if (next) {
    if (local !== next) setDefaultDistrict(next); // GPS mode may already be in it
  } else if (local && local === prevSlug) {
    setDefaultDistrict(null);
  }
}

/** @deprecated "<userId>:<profile neighbourhood id>" marks of the old neighbourhood seeding (read by seedDistrictFromProfile). */
const SEEDED_FOR_KEY = `${STORAGE_KEYS.neighbourhood}.seededFor`;
let seededFor: string | null = null;

/** @deprecated Neighbourhood seeding; use seedDistrictFromProfile. */
export function isProfileSeedDone(userId: string, neighbourhoodId: string | null): boolean {
  const mark = seedMark(userId, neighbourhoodId);
  return seededFor === mark || readString(SEEDED_FOR_KEY) === mark;
}

/** @deprecated Use seedDistrictFromProfile. */
export function seedNeighbourhoodFromProfile(userId: string, neighbourhoodId: string | null, n: ChosenNeighbourhood | null): void {
  if (isProfileSeedDone(userId, neighbourhoodId)) return;
  seededFor = seedMark(userId, neighbourhoodId);
  writeString(SEEDED_FOR_KEY, seededFor);
  const prev = getLocationPrefs();
  if (n && String(n.id) === neighbourhoodId && !prev.neighbourhood && !prev.mode) setDefaultNeighbourhood(n);
}

/** @deprecated Use applyProfileDistrict. */
export function applyProfileNeighbourhood(prevId: string | null, next: ChosenNeighbourhood | null): void {
  const nextId = next ? String(next.id) : null;
  if (nextId === prevId) return;
  const local = getLocationPrefs().neighbourhood;
  if (next) {
    if (local?.id !== nextId) setDefaultNeighbourhood(next); // GPS mode may already track it
  } else if (local && local.id === prevId) {
    setDefaultNeighbourhood(null);
  }
}

/** Forget location, district and the old neighbourhood (settings > "Konum verilerimi sil"). */
export function clearLocationPrefs(): void {
  persist(EMPTY);
}

/** Reactive location prefs (SSR-safe: EMPTY on the server and first render). */
export function useLocationPrefs(): LocationPrefs {
  return React.useSyncExternalStore(subscribe, getLocationPrefs, () => EMPTY);
}
