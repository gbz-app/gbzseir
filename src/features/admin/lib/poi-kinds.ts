/**
 * Poi kinds on /admin/yerler: labels, ?tur= values, public detail paths and the reverse lookup for
 * "bilgi_duzeltme" support messages (pure TS).
 */
import { routes, withQuery } from "@/core/routes";
import type { PoiKind } from "@/features/nearby/types";

export const POI_KIND_VALUES = ["place", "pharmacy", "mosque", "bus_stop", "taxi", "atm"] as const satisfies readonly PoiKind[];

/** noun: "Yeni {noun}"; param: ?tur= value on /admin/yerler ("place" is the default and has no param in links). */
export const POI_KIND_META: Record<PoiKind, { label: string; plural: string; noun: string; param: string }> = {
  place: { label: "Gezilecek yer", plural: "Gezilecek yerler", noun: "gezilecek yer", param: "gezilecek" },
  pharmacy: { label: "Eczane", plural: "Eczaneler", noun: "eczane", param: "eczane" },
  mosque: { label: "Cami", plural: "Camiler", noun: "cami", param: "cami" },
  bus_stop: { label: "Otobüs durağı", plural: "Duraklar", noun: "otobüs durağı", param: "durak" },
  taxi: { label: "Taksi durağı", plural: "Taksi durakları", noun: "taksi durağı", param: "taksi" },
  atm: { label: "ATM", plural: "ATM'ler", noun: "ATM", param: "atm" },
};

export function poiKindFromParam(param: string | undefined): PoiKind {
  return POI_KIND_VALUES.find((k) => POI_KIND_META[k].param === param) ?? "place";
}

/** ?tur= value of a kind for links (none for the default "place"). */
export function poiKindParam(kind: PoiKind): string | undefined {
  return kind === "place" ? undefined : POI_KIND_META[kind].param;
}

/** Synced non-place rows (OSM / KBB) would come back with the next import, so they are hidden instead of deleted. */
export function poiDeletable(kind: PoiKind, source: string): boolean {
  return kind === "place" || (source !== "osm" && source !== "kbb");
}

/** Public detail page of a poi (taxi stands and ATMs have none). */
export function poiPublicPath(kind: PoiKind, slug: string): string | null {
  switch (kind) {
    case "pharmacy":
      return routes.nearby.pharmacy(slug);
    case "mosque":
      return routes.nearby.mosque(slug);
    case "bus_stop":
      return routes.nearby.stop(slug);
    case "place":
      return routes.nearby.place(slug);
    default:
      return null;
  }
}

const PATH_KINDS: Record<string, PoiKind> = { eczane: "pharmacy", cami: "mosque", durak: "bus_stop", "gezilecek-yerler": "place" };

/** Kind and slug (or uuid) of a public detail page path, e.g. "/eczane/fatih-eczanesi". */
export function poiFromPagePath(path: string | null | undefined): { kind: PoiKind; ref: string } | null {
  if (!path) return null;
  const clean = path.replace(/^https?:\/\/[^/]+/i, "").split(/[?#]/)[0];
  const m = /^\/([a-z-]+)\/([^/]+)\/?$/.exec(clean);
  const kind = m ? PATH_KINDS[m[1]] : undefined;
  if (!m || !kind) return null;
  let ref = m[2];
  try {
    ref = decodeURIComponent(ref);
  } catch {
    /* keep the raw segment */
  }
  ref = ref.trim().toLowerCase();
  return ref && ref.length <= 200 ? { kind, ref } : null;
}

/** /admin/yerler link that opens the editor of one poi (?yer= slug or uuid). */
export function adminPoiHref(kind: PoiKind, ref: string): string {
  return withQuery(routes.admin.places(), { tur: poiKindParam(kind), yer: ref });
}
