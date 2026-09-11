/**
 * Admin side of the city guide (/admin/rehber): kind params, list filters, category options per kind, the form value
 * shape and the delete rule. Pure TS, safe on the server and in client components.
 */
import { BANKS, EV_OPERATORS, FUEL_BRANDS, GUIDE_LIST_KINDS, SOCKET_LABELS, institutionGroupMeta } from "@/features/guide/lib/constants";
import type { GuideListKind, GuidePhoto, InstitutionCategoryDef, Ownership, PlaceSubkindDef } from "@/features/guide/lib/types";
import { POI_KIND_META } from "./poi-kinds";

export function isGuideKind(kind: string): kind is GuideListKind {
  return (GUIDE_LIST_KINDS as readonly string[]).includes(kind);
}

/** ?tur= value of a guide kind (same values as /admin/yerler: kurum, atm, banka, akaryakit, sarj, gezilecek). */
export function guideKindParam(kind: GuideListKind): string {
  return POI_KIND_META[kind].param;
}

export function guideKindFromParam(param: string | undefined): GuideListKind | null {
  return GUIDE_LIST_KINDS.find((k) => POI_KIND_META[k].param === param) ?? null;
}

/** ?durum= filter of the list. */
export const GUIDE_STATUS = ["tumu", "dogrulanmis", "dogrulanmamis", "konumsuz", "gizli"] as const;
export type GuideStatus = (typeof GUIDE_STATUS)[number];
export const GUIDE_STATUS_LABELS: Record<GuideStatus, string> = {
  tumu: "Tümü",
  dogrulanmis: "Doğrulanmış",
  dogrulanmamis: "Doğrulanmamış",
  konumsuz: "Konumu eksik",
  gizli: "Gizli",
};

/** details key the category filter / select of a kind writes: institution and place category, bank, fuel brand, EV operator. */
export type GuideCategoryField = "category" | "bank" | "brand" | "operator";

export function guideCategoryField(kind: GuideListKind): GuideCategoryField {
  switch (kind) {
    case "atm":
    case "bank":
      return "bank";
    case "fuel":
      return "brand";
    case "ev_charge":
      return "operator";
    default:
      return "category";
  }
}

export const GUIDE_CATEGORY_FIELD_LABELS: Record<GuideCategoryField, { label: string; plural: string; none: string }> = {
  category: { label: "Kategori", plural: "Tüm kategoriler", none: "Kategorisiz" },
  bank: { label: "Banka", plural: "Tüm bankalar", none: "Banka belirtilmemiş" },
  brand: { label: "Marka", plural: "Tüm markalar", none: "Marka belirtilmemiş" },
  operator: { label: "Operatör", plural: "Tüm operatörler", none: "Operatör belirtilmemiş" },
};

/** ?kategori= value for rows without a bank / brand / operator / category. */
export const GUIDE_NONE_VALUE = "yok";

/** EV socket types the form edits (details.sockets keys). */
export const SOCKET_TYPES: readonly string[] = Object.keys(SOCKET_LABELS);

/**
 * Rows created in the admin (no source_ref) or demo rows are deleted. Imported rows (city guide import, OSM / KBB sync)
 * would come back with the next run, so "Sil" hides and locks them instead (the import never un-hides).
 */
export function guideDeletable(source: string, sourceRef: string | null): boolean {
  return source === "demo" || (source === "manual" && !sourceRef);
}

/** Calendar day in Istanbul ("YYYY-MM-DD") of an ISO time, default now. */
export function istanbulDate(input?: string | Date): string {
  const d = input === undefined ? new Date() : typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Vocabularies of the editor (loaded on the server with the admin session). Serializable. */
export type GuideVocab = {
  institutionCategories: readonly InstitutionCategoryDef[];
  placeCategories: ReadonlyArray<{ key: string; label: string; active: boolean; subkinds: PlaceSubkindDef[] }>;
};

export type GuideOption = { value: string; label: string; group?: string };

const labelEntries = (map: Readonly<Record<string, string>>): GuideOption[] =>
  Object.entries(map)
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "tr"));

/**
 * Options of the category / bank / brand / operator select of a kind. Institution categories carry their group (for
 * optgroups). Inactive categories are left out unless `includeInactive` (list filter) or it is the row's own value.
 */
export function guideCategoryOptions(
  kind: GuideListKind,
  vocab: GuideVocab,
  opts: { current?: string | null; includeInactive?: boolean } = {},
): GuideOption[] {
  const current = opts.current || null;
  let list: GuideOption[];
  switch (guideCategoryField(kind)) {
    case "bank":
      list = labelEntries(BANKS);
      break;
    case "brand":
      list = labelEntries(FUEL_BRANDS);
      break;
    case "operator":
      list = labelEntries(EV_OPERATORS);
      break;
    default:
      list =
        kind === "institution"
          ? vocab.institutionCategories
              .filter((c) => opts.includeInactive || c.active || c.key === current)
              .map((c) => ({ value: c.key, label: c.active ? c.label : `${c.label} (pasif)`, group: institutionGroupMeta(c.group).label }))
          : vocab.placeCategories
              .filter((c) => opts.includeInactive || c.active || c.key === current)
              .map((c) => ({ value: c.key, label: c.active ? c.label : `${c.label} (pasif)` }));
  }
  if (current && !list.some((o) => o.value === current)) list.push({ value: current, label: current });
  return list;
}

/** One row of the admin guide lists. */
export type GuideRowItem = {
  id: string;
  kind: GuideListKind;
  name: string;
  /** "<category / bank / brand> · <ilçe> · <phone>" */
  subtitle: string;
  address: string | null;
  hasPin: boolean;
  verified: boolean;
  hidden: boolean;
  locked: boolean;
  /** Cover photo URL, if any. */
  thumb: string | null;
  /** Public page on the app (null when hidden). */
  publicHref: string | null;
};

/** A guide row as the editor gets it (columns + parsed details). */
export type GuideFormValue = {
  id: string;
  kind: GuideListKind;
  name: string;
  slug: string;
  address: string | null;
  /** districts.id (DistrictSlug), null when unknown. */
  districtId: string | null;
  lat: number | null;
  lng: number | null;
  phones: string[];
  fax: string | null;
  email: string | null;
  website: string | null;
  hours: string | null;
  description: string | null;
  fee: string | null;
  category: string | null;
  subkind: string | null;
  ownership: Ownership | null;
  bank: string | null;
  brand: string | null;
  operator: string | null;
  /** Socket type -> count (details.sockets). */
  sockets: Record<string, number | null>;
  powerKw: number | null;
  capacity: number | null;
  atmCount: number | null;
  curated: boolean;
  photos: GuidePhoto[];
  verifiedAt: string | null;
  sourceUrls: string[];
  hidden: boolean;
  locked: boolean;
  source: string;
  sourceRef: string | null;
  updatedAt: string;
};
