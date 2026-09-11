/**
 * Poi kinds on /admin/yerler: labels, ?tur= values, public detail paths and the reverse lookup for
 * "bilgi_duzeltme" support messages (pure TS).
 */
import { routes, withQuery } from "@/core/routes";
import { guideKindFromSlug } from "@/features/guide/lib/constants";
import type { PoiKind } from "@/features/nearby/types";

export const POI_KIND_VALUES = [
  "place",
  "institution",
  "pharmacy",
  "mosque",
  "bus_stop",
  "taxi",
  "atm",
  "bank",
  "fuel",
  "ev_charge",
] as const satisfies readonly PoiKind[];

/** noun: "Yeni {noun}"; param: ?tur= value on /admin/yerler ("place" is the default and has no param in links). */
export const POI_KIND_META: Record<PoiKind, { label: string; plural: string; noun: string; param: string }> = {
  place: { label: "Gezilecek yer", plural: "Gezilecek yerler", noun: "gezilecek yer", param: "gezilecek" },
  institution: { label: "Resmî kurum", plural: "Resmî kurumlar", noun: "resmî kurum", param: "kurum" },
  pharmacy: { label: "Eczane", plural: "Eczaneler", noun: "eczane", param: "eczane" },
  mosque: { label: "Cami", plural: "Camiler", noun: "cami", param: "cami" },
  bus_stop: { label: "Otobüs durağı", plural: "Duraklar", noun: "otobüs durağı", param: "durak" },
  taxi: { label: "Taksi durağı", plural: "Taksi durakları", noun: "taksi durağı", param: "taksi" },
  atm: { label: "ATM", plural: "ATM'ler", noun: "ATM", param: "atm" },
  bank: { label: "Banka şubesi", plural: "Banka şubeleri", noun: "banka şubesi", param: "banka" },
  fuel: { label: "Akaryakıt istasyonu", plural: "Akaryakıt istasyonları", noun: "akaryakıt istasyonu", param: "akaryakit" },
  ev_charge: { label: "Şarj istasyonu", plural: "Şarj istasyonları", noun: "şarj istasyonu", param: "sarj" },
};

export function poiKindFromParam(param: string | undefined): PoiKind {
  return POI_KIND_VALUES.find((k) => POI_KIND_META[k].param === param) ?? "place";
}

/** ?tur= value of a kind for links (none for the default "place"). */
export function poiKindParam(kind: PoiKind): string | undefined {
  return kind === "place" ? undefined : POI_KIND_META[kind].param;
}

/**
 * Imported rows would come back with the next import, so they are hidden instead of deleted: synced non-place rows
 * (OSM / KBB) and every city-guide import row (source_ref "guide/…", any kind).
 */
export function poiDeletable(kind: PoiKind, source: string, sourceRef?: string | null): boolean {
  if (sourceRef?.startsWith("guide/")) return false;
  return kind === "place" || (source !== "osm" && source !== "kbb");
}

/** Public detail page of a poi (taxi stands have none). */
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
    case "institution":
    case "atm":
    case "bank":
    case "fuel":
    case "ev_charge":
      return routes.guide.detail(slug);
    default:
      return null;
  }
}

const PATH_KINDS: Record<string, PoiKind> = { eczane: "pharmacy", cami: "mosque", durak: "bus_stop", "gezilecek-yerler": "place" };

/**
 * Kind and slug (or uuid) of a public detail page path, e.g. "/eczane/fatih-eczanesi". /kurum/<slug> serves five kinds:
 * the slug prefix tells them apart (GUIDE_SLUG_PREFIX: atm-, banka-, akaryakit-, sarj-; none: institution).
 */
export function poiFromPagePath(path: string | null | undefined): { kind: PoiKind; ref: string } | null {
  if (!path) return null;
  const clean = path.replace(/^https?:\/\/[^/]+/i, "").split(/[?#]/)[0];
  const m = /^\/([a-z-]+)\/([^/]+)\/?$/.exec(clean);
  if (!m || (m[1] !== "kurum" && !PATH_KINDS[m[1]])) return null;
  let ref = m[2];
  try {
    ref = decodeURIComponent(ref);
  } catch {
    /* keep the raw segment */
  }
  ref = ref.trim().toLowerCase();
  if (!ref || ref.length > 200) return null;
  return { kind: m[1] === "kurum" ? guideKindFromSlug(ref) : PATH_KINDS[m[1]], ref };
}

/** /admin/yerler link that opens the editor of one poi (?yer= slug or uuid). */
export function adminPoiHref(kind: PoiKind, ref: string): string {
  return withQuery(routes.admin.places(), { tur: poiKindParam(kind), yer: ref });
}
