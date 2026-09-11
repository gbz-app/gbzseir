import type { NearbyItem } from "../types";

/** OSM stands without a name are stored as "Taksi Durağı". */
export function isGenericTaxiName(name: string): boolean {
  return /^taks[iı] dura[gğ][ıi]$/.test(name.trim().toLocaleLowerCase("tr"));
}

/**
 * Subject of a "Numarasını biliyor musun?" note: most phoneless stands are named just "Taksi Durağı", so it adds the
 * address / district and, for those, the coordinates, letting the admin find the right row.
 */
export function taxiReportSubject(item: Pick<NearbyItem, "name" | "address" | "subtitle" | "lat" | "lng">): string {
  const where = [item.address || item.subtitle, isGenericTaxiName(item.name) ? `${item.lat.toFixed(5)}, ${item.lng.toFixed(5)}` : null]
    .filter(Boolean)
    .join(" · ");
  return `Taksi durağı: ${item.name}${where ? ` (${where})` : ""}`;
}
