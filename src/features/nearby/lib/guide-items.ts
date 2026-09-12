import { distanceMeters, type LatLng } from "@/core/geo";
import { guideIcon } from "@/features/guide/lib/constants";
import type { GuideEntry } from "@/features/guide/components/list-config";
import { KIND_META } from "../config";
import type { NearbyItem } from "../types";

/** A guide row with a map location. */
export type PinnedEntry = GuideEntry & { lat: number; lng: number };

export const hasPin = (e: GuideEntry): e is PinnedEntry => typeof e.lat === "number" && typeof e.lng === "number";

/**
 * A guide row as a Keşfet card (one card for both doors, owner 12.09): category icon, type · ilçe, address, Ara and,
 * when it has a pin, Yol tarifi and the distance from `ref`. Pure, safe on the server (first paint) and the client.
 */
export function entryToItem(e: GuideEntry, ref: LatLng | null): NearbyItem {
  const base = {
    id: e.id,
    kind: e.kind,
    name: e.name,
    href: e.href,
    subtitle: e.sub,
    address: e.address ?? null,
    phone: e.phone ?? null,
    subjectType: "poi" as const,
    verified: e.verified,
    icon: e.icon ? guideIcon(e.icon, KIND_META[e.kind].icon) : undefined,
  };
  if (!hasPin(e)) return { ...base, lat: 0, lng: 0, distance: null, noPin: true };
  return { ...base, lat: e.lat, lng: e.lng, distance: ref ? distanceMeters(ref, { lat: e.lat, lng: e.lng }) : null };
}
