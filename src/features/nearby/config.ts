/**
 * Static configuration of the nearby module: filters, kinds, colors, place categories and URL helpers.
 */
import {
  Banknote,
  Bus,
  CarTaxiFront,
  Castle,
  Cross,
  Landmark,
  MoonStar,
  Mountain,
  Pill,
  ShoppingBag,
  Sparkles,
  Store,
  Trees,
  type LucideIcon,
} from "lucide-react";
import { routes, withQuery } from "@/core/routes";
import { categoryIcon, gradientFor, type CategoryDef } from "@/features/business/lib/category-visuals";
import type { BuiltinPlaceCategory, MarkerKind, NearbyFilter, PlaceCategory, PoiKind } from "./types";

/** Kocaeli Eczacı Odası: official source for real duty lists. */
export const ECZACI_ODASI_URL = "https://www.kocaelieo.org.tr";
export const ECZACI_ODASI_NAME = "Kocaeli Eczacı Odası";

export const KBB_SOURCE = "Kocaeli Büyükşehir Belediyesi Açık Veri (CC BY 4.0)";
export const OSM_SOURCE = "© OpenStreetMap katkıcıları (ODbL)";
export const OSM_COPYRIGHT_URL = "https://www.openstreetmap.org/copyright";

export type FilterMeta = {
  value: NearbyFilter;
  label: string;
  icon: LucideIcon;
  marker: MarkerKind;
  /** Sheet title on /yakinimda. */
  title: string;
  /** Plural noun for counts: "6 nöbetçi eczane". */
  noun: string;
};

export const NEARBY_FILTERS: FilterMeta[] = [
  { value: "nobetci", label: "Nöbetçi", icon: Cross, marker: "duty", title: "Nöbetçi eczaneler", noun: "nöbetçi eczane" },
  { value: "eczane", label: "Eczane", icon: Pill, marker: "pharmacy", title: "Yakındaki eczaneler", noun: "eczane" },
  { value: "cami", label: "Cami", icon: MoonStar, marker: "mosque", title: "Yakındaki camiler", noun: "cami" },
  { value: "durak", label: "Durak", icon: Bus, marker: "bus_stop", title: "Yakındaki duraklar", noun: "durak" },
  { value: "taksi", label: "Taksi", icon: CarTaxiFront, marker: "taxi", title: "Yakındaki taksi durakları", noun: "taksi durağı" },
  { value: "atm", label: "ATM", icon: Banknote, marker: "atm", title: "Yakındaki ATM'ler", noun: "ATM" },
  { value: "gezilecek", label: "Gezilecek", icon: Landmark, marker: "place", title: "Gezilecek yerler", noun: "yer" },
  // "isletme" is no longer a chip: ?tur=isletme is not parsed and falls back to the default tab.
];

export function filterMeta(f: NearbyFilter): FilterMeta {
  return NEARBY_FILTERS.find((x) => x.value === f) ?? NEARBY_FILTERS[1];
}

export function parseFilter(v: string | null | undefined): NearbyFilter | null {
  return NEARBY_FILTERS.some((f) => f.value === v) ? (v as NearbyFilter) : null;
}

/** /yakinimda?tur=... (uses the shared builder; "isletme" is local to this module). */
export function nearbyFilterHref(f: NearbyFilter): string {
  return f === "isletme" ? withQuery(routes.nearby.root(), { tur: "isletme" }) : routes.nearby.root(f);
}

export type KindMeta = {
  label: string;
  icon: LucideIcon;
  /** Pin fill (hex, used in map SVG markers). */
  pin: string;
  /** Glyph color inside the pin. */
  glyph: string;
  /** Tailwind classes for the list icon bubble (light + dark). */
  tone: string;
};

export const KIND_META: Record<MarkerKind, KindMeta> = {
  duty: {
    label: "Nöbetçi eczane",
    icon: Cross,
    pin: "#F59E0B",
    glyph: "#422006",
    tone: "bg-highlight-soft text-highlight-foreground dark:text-highlight",
  },
  pharmacy: {
    label: "Eczane",
    icon: Cross,
    pin: "#E11D48",
    glyph: "#FFFFFF",
    tone: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
  },
  mosque: {
    label: "Cami",
    icon: MoonStar,
    pin: "#059669",
    glyph: "#FFFFFF",
    tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
  bus_stop: {
    label: "Otobüs durağı",
    icon: Bus,
    pin: "#0284C7",
    glyph: "#FFFFFF",
    tone: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  },
  taxi: {
    label: "Taksi durağı",
    icon: CarTaxiFront,
    pin: "#EAB308",
    glyph: "#1C1917",
    tone: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300",
  },
  atm: {
    label: "ATM",
    icon: Banknote,
    pin: "#16A34A",
    glyph: "#FFFFFF",
    tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
  place: {
    label: "Gezilecek yer",
    icon: Landmark,
    pin: "#7C3AED",
    glyph: "#FFFFFF",
    tone: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
  },
  business: {
    label: "İşletme",
    icon: Store,
    pin: "#0F766E",
    glyph: "#FFFFFF",
    tone: "bg-brand-soft text-primary",
  },
};

export function markerKindForPoi(kind: PoiKind): MarkerKind {
  return kind;
}

export type PlaceCategoryMeta = {
  /** A place_categories key (admin-managed, 2026091363). */
  value: string;
  label: string;
  icon: LucideIcon;
  /** Tailwind gradient classes for photo placeholders. */
  gradient: string;
};

/** Built-in categories (seed of public.place_categories); "diger" is the fallback and stays last. */
export const PLACE_CATEGORIES: PlaceCategoryMeta[] = [
  { value: "tarihi", label: "Tarihi", icon: Castle, gradient: "from-amber-500 via-orange-500 to-rose-600" },
  { value: "park", label: "Park", icon: Trees, gradient: "from-lime-500 via-emerald-500 to-teal-600" },
  { value: "doga", label: "Doğa", icon: Mountain, gradient: "from-teal-400 via-cyan-500 to-sky-700" },
  { value: "muze", label: "Müze", icon: Landmark, gradient: "from-violet-500 via-purple-500 to-indigo-700" },
  { value: "avm", label: "AVM", icon: ShoppingBag, gradient: "from-pink-500 via-rose-500 to-red-600" },
  { value: "diger", label: "Diğer", icon: Sparkles, gradient: "from-sky-500 via-blue-500 to-indigo-600" },
];

const PLACE_ICON_NAMES: Record<BuiltinPlaceCategory, string> = {
  tarihi: "castle",
  park: "trees",
  doga: "mountain",
  muze: "landmark",
  avm: "shopping-bag",
  diger: "sparkles",
};

/** A row of public.place_categories (getVocabularies().placeCategories) or its built-in fallback. */
export type PlaceCategoryDef = CategoryDef;

/** Seed / fallback of public.place_categories (same order, labels and icons as the migration). */
export const PLACE_CATEGORY_DEFS: readonly PlaceCategoryDef[] = PLACE_CATEGORIES.map((c) => ({
  key: c.value,
  label: c.label,
  icon: PLACE_ICON_NAMES[c.value as BuiltinPlaceCategory] ?? null,
  active: true,
}));

const PLACE_FALLBACK = PLACE_CATEGORIES[PLACE_CATEGORIES.length - 1];
const PLACE_GRADIENTS = PLACE_CATEGORIES.map((c) => c.gradient);

/**
 * Label, icon and gradient of a place category. With `categories` (getVocabularies().placeCategories) the admin's label
 * and icon win and admin-added keys resolve too (icon: the admin's, else Diğer's; gradient: a stable palette pick).
 * Keys nobody knows (e.g. the vocabulary could not be read) show as "Diğer": `value` is then "diger", so lists can
 * group by it.
 */
export function placeCategoryMeta(c: PlaceCategory | null | undefined, categories: readonly PlaceCategoryDef[] = PLACE_CATEGORY_DEFS): PlaceCategoryMeta {
  const key = c && (categories.some((x) => x.key === c) || PLACE_CATEGORIES.some((x) => x.value === c)) ? c : PLACE_FALLBACK.value;
  const builtin = PLACE_CATEGORIES.find((x) => x.value === key);
  const def = categories.find((x) => x.key === key);
  return {
    value: key,
    label: def?.label ?? builtin?.label ?? key,
    icon: categoryIcon(def?.icon, builtin?.icon ?? PLACE_FALLBACK.icon),
    gradient: builtin?.gradient ?? gradientFor(key, PLACE_GRADIENTS),
  };
}

/** Canonical detail URL of a poi (slug based; the pages also accept the uuid). */
export function poiHref(kind: PoiKind, slug: string): string {
  switch (kind) {
    case "pharmacy":
      return routes.nearby.pharmacy(slug);
    case "mosque":
      return routes.nearby.mosque(slug);
    case "bus_stop":
      return routes.nearby.stop(slug);
    case "place":
      return routes.nearby.place(slug);
    case "taxi":
      // No detail page for taxi stands: the list card opens the map view.
      return routes.nearby.root("taksi");
    case "atm":
      // Same as taxi: no detail page for ATMs.
      return routes.nearby.root("atm");
  }
}

/** Generic OSM names that need the neighbourhood to be meaningful ("Otobüs Durağı"). */
export function isGenericStopName(name: string): boolean {
  return /^(otob[uü]s )?dura[gğ][iı]?$/i.test(name.trim());
}

export function displayStopName(name: string, neighbourhood: string | null | undefined): string {
  if (isGenericStopName(name) && neighbourhood) return `${neighbourhood} Durağı`;
  return name;
}
