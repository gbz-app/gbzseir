/**
 * Page-level configuration of the public guide screens (/rehber, /rehber/[kategori], /kurum/[slug]): which rows a list
 * page loads and which filter chips it shows, plus small display helpers (labels, opening hours, sources, schema.org
 * types). Pure TS, safe on the server and in client components. Data comes from src/features/guide/lib.
 */
import { Drama, Landmark, School, Trees, type LucideIcon } from "lucide-react";
import { routes } from "@/core/routes";
import {
  PLACE_SUBKINDS,
  institutionCategoryMeta,
  resolveGuideSection,
  INSTITUTION_CATEGORY_DEFS,
} from "@/features/guide/lib/constants";
import type { GuideListKind, InstitutionCategoryDef, InstitutionGroupKey, Ownership } from "@/features/guide/lib/types";
import { PLACE_CATEGORY_DEFS, placeCategoryMeta, type PlaceCategoryDef } from "@/features/nearby/config";

/** Which field a list page's chip row filters on. */
export type GuideChipDim = "group" | "category" | "subkind" | "bank" | "brand" | "operator";

/** One base query of a list page (listGuideItems filters; every page of it is loaded). */
export type GuideListQuery = { kind: GuideListKind; group?: InstitutionGroupKey; category?: string };

export type GuideListConfig = {
  /** Canonical /rehber/<slug> of the list (a preset category page writes its section's path once filters change). */
  slug: string;
  title: string;
  description: string;
  icon: LucideIcon;
  kind: GuideListKind;
  queries: GuideListQuery[];
  /** Keep only these category keys (e.g. the school categories of the egitim group). */
  categories?: readonly string[];
  chip: GuideChipDim | null;
  /** URL key of the chip value (GUIDE_PARAMS: alt, banka, marka, operator). */
  chipParam: string;
  /** Chip chosen by the path (/rehber/noter opens Adalet with "Noter"). */
  preset: string | null;
  /** Label of the preset category (page metadata). */
  presetLabel: string | null;
  /** Offer the Devlet / Özel switch (shown only when both occur). */
  ownership: boolean;
  /** ATM / Şube switch between /rehber/atm and /rehber/banka. */
  bankSwitch: boolean;
};

const CHIP_PARAM: Record<GuideChipDim, string> = { group: "alt", category: "alt", subkind: "alt", bank: "banka", brand: "marka", operator: "operator" };

export const SCHOOL_CATEGORIES = ["anaokulu", "ilkokul", "ortaokul", "lise", "ozel_egitim"] as const;

/** Lists that combine several sections or categories (hub tiles "Resmî kurumlar", "Okullar", "Müzeler ve kültür", "Parklar ve doğa"). */
const EXTRA_LISTS: readonly GuideListConfig[] = [
  {
    slug: "kurumlar",
    title: "Resmî kurumlar",
    description: "Belediye, kaymakamlık, emniyet, adliye, sağlık ve eğitim kurumları tek listede.",
    icon: Landmark,
    kind: "institution",
    queries: [{ kind: "institution" }],
    chip: "group",
    chipParam: CHIP_PARAM.group,
    preset: null,
    presetLabel: null,
    ownership: true,
    bankSwitch: false,
  },
  {
    slug: "okullar",
    title: "Okullar",
    description: "Anaokulu, ilkokul, ortaokul, lise ve özel eğitim okulları; devlet ve özel.",
    icon: School,
    kind: "institution",
    queries: [{ kind: "institution", group: "egitim" }],
    categories: SCHOOL_CATEGORIES,
    chip: "category",
    chipParam: CHIP_PARAM.category,
    preset: null,
    presetLabel: null,
    ownership: true,
    bankSwitch: false,
  },
  {
    slug: "muzeler-ve-kultur",
    title: "Müzeler ve kültür",
    description: "Müzeler, kültür merkezleri, galeriler ve sinemalar.",
    icon: Drama,
    kind: "place",
    queries: [
      { kind: "place", category: "muze" },
      { kind: "place", category: "kultur" },
    ],
    chip: "category",
    chipParam: CHIP_PARAM.category,
    preset: null,
    presetLabel: null,
    ownership: false,
    bankSwitch: false,
  },
  {
    slug: "parklar-ve-doga",
    title: "Parklar ve doğa",
    description: "Parklar, tabiat parkları, doğa alanları ve sahiller.",
    icon: Trees,
    kind: "place",
    queries: ["park", "tabiat_parki", "doga", "sahil"].map((category) => ({ kind: "place" as const, category })),
    chip: "category",
    chipParam: CHIP_PARAM.category,
    preset: null,
    presetLabel: null,
    ownership: false,
    bankSwitch: false,
  },
];

/** Slugs of the combined lists (for generateStaticParams and the sitemap). */
export const GUIDE_EXTRA_LIST_SLUGS: readonly string[] = EXTRA_LISTS.map((l) => l.slug);

/**
 * List page of /rehber/<slug>: a combined list, a GUIDE_SECTIONS slug, or an institution category slug (its group's
 * section with that chip chosen). Null for an unknown slug (404).
 */
export function resolveGuideList(slug: string, defs: readonly InstitutionCategoryDef[] = INSTITUTION_CATEGORY_DEFS): GuideListConfig | null {
  const s = slug.trim().toLowerCase();
  const extra = EXTRA_LISTS.find((l) => l.slug === s);
  if (extra) return extra;
  const resolved = resolveGuideSection(s, defs);
  if (!resolved) return null;
  const { section, category } = resolved;
  const base = { slug: section.slug, title: section.title, description: section.description, icon: section.icon, kind: section.kind, ownership: false, bankSwitch: false };
  const preset = category ? { preset: category, presetLabel: institutionCategoryMeta(category, defs).label } : { preset: null, presetLabel: null };
  switch (section.kind) {
    case "institution":
      return {
        ...base,
        ...preset,
        queries: [{ kind: "institution", group: section.group }],
        chip: section.subFilter ? "category" : null,
        chipParam: CHIP_PARAM.category,
        ownership: true,
      };
    case "place": {
      const chip = section.subFilter?.by === "subkind" ? "subkind" : null;
      return { ...base, ...preset, queries: [{ kind: "place", category: section.placeCategory }], chip, chipParam: CHIP_PARAM.subkind };
    }
    case "atm":
    case "bank":
      return { ...base, ...preset, queries: [{ kind: section.kind }], chip: "bank", chipParam: CHIP_PARAM.bank, bankSwitch: true };
    case "fuel":
      return { ...base, ...preset, queries: [{ kind: "fuel" }], chip: "brand", chipParam: CHIP_PARAM.brand };
    case "ev_charge":
      return { ...base, ...preset, queries: [{ kind: "ev_charge" }], chip: "operator", chipParam: CHIP_PARAM.operator };
  }
}

/** Path of a list with a chip value ("aile_sagligi_merkezi" -> "?alt=aile-sagligi-merkezi"). */
export function guideListHref(cfg: Pick<GuideListConfig, "slug" | "chipParam">, query: { chip?: string | null; own?: Ownership | null; q?: string }): string {
  return routes.guide.category(cfg.slug, {
    [cfg.chipParam]: query.chip ? query.chip.replace(/_/g, "-") : undefined,
    sahiplik: query.own ?? undefined,
    q: query.q?.trim() || undefined,
  });
}

/** A guide row as the list pages and the hub search need it (small and serializable). */
export type GuideEntry = {
  id: string;
  kind: GuideListKind;
  name: string;
  href: string;
  /** What the row is: "Aile sağlığı merkezi", "Ziraat Bankası ATM", "Tarihi cami". */
  type: string | null;
  /** "<type> · <mahalle> Mah." */
  sub: string | null;
  cat: string | null;
  group: InstitutionGroupKey | null;
  subkind: string | null;
  own: Ownership | null;
  bank: string | null;
  brand: string | null;
  op: string | null;
  lat: number | null;
  lng: number | null;
  verified: boolean;
  photo: string | null;
  /** Lucide kebab-case icon name of the category (guideIcon), or null for the kind icon. */
  icon: string | null;
  /** trNormalize'd search text (name, type, mahalle, address). */
  q: string;
};

/** A chip of a list page (value = key, label in the page's order). */
export type GuideChipDef = { value: string; label: string };

export function entryDimValue(e: GuideEntry, dim: GuideChipDim): string | null {
  switch (dim) {
    case "group":
      return e.group;
    case "category":
      return e.cat;
    case "subkind":
      return e.subkind;
    case "bank":
      return e.bank;
    case "brand":
      return e.brand;
    case "operator":
      return e.op;
  }
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

const TARIHI_PREFIXED = new Set(["cami", "hamam", "cesme", "kopru"]);

/** "Tarihi cami", "Kale", "Tren istasyonu", else the place category label ("Park", "Kültür ve sanat"). */
export function placeTypeLabel(category: string | null | undefined, subkind: string | null | undefined, placeDefs: readonly PlaceCategoryDef[] = PLACE_CATEGORY_DEFS): string {
  const meta = placeCategoryMeta(category, placeDefs);
  const known = subkind ? PLACE_SUBKINDS[meta.value]?.find((s) => s.key === subkind) : undefined;
  if (known) return meta.value === "tarihi" && TARIHI_PREFIXED.has(known.key) ? `Tarihi ${known.label.toLocaleLowerCase("tr-TR")}` : known.label;
  return meta.value === "tarihi" ? "Tarihi yer" : meta.label;
}

/** Lucide icon name of a place category (admin's first, then the built-in one). */
export function placeIconName(category: string | null | undefined, placeDefs: readonly PlaceCategoryDef[] = PLACE_CATEGORY_DEFS): string | null {
  const key = placeCategoryMeta(category, placeDefs).value;
  return placeDefs.find((d) => d.key === key)?.icon ?? PLACE_CATEGORY_DEFS.find((d) => d.key === key)?.icon ?? null;
}

/** Lucide icon name of an institution category. */
export function institutionIconName(category: string | null | undefined, defs: readonly InstitutionCategoryDef[] = INSTITUTION_CATEGORY_DEFS): string | null {
  const key = institutionCategoryMeta(category, defs).key;
  return defs.find((d) => d.key === key)?.icon ?? INSTITUTION_CATEGORY_DEFS.find((d) => d.key === key)?.icon ?? null;
}

const OSM_DAYS: Record<string, string> = { Mo: "Pzt", Tu: "Sal", We: "Çar", Th: "Per", Fr: "Cum", Sa: "Cmt", Su: "Paz" };

/** OSM opening_hours ("Mo-Fr 09:00-17:00; Sa-Su off") in Turkish; free text stays as it is. */
export function readableHours(hours: string | null | undefined): string | null {
  const t = hours?.trim();
  if (!t) return null;
  if (t === "24/7") return "7/24 açık";
  if (!/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/.test(t)) return t;
  return t
    .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su)\b/g, (d) => OSM_DAYS[d] ?? d)
    .replace(/\bPH eve\b/g, "Arife")
    .replace(/\bPH\b/g, "Resmî tatil")
    .replace(/\boff\b/g, "kapalı")
    .replace(/24\/7/g, "7/24 açık")
    .replace(/,(?=\d)/g, ", ")
    .replace(/\s*;\s*/g, " · ");
}

/** True when the hours string is OSM syntax (schema.org openingHours accepts it). */
export function isOsmHours(hours: string | null | undefined): boolean {
  return !!hours && /^[A-Za-z0-9 ,:;/\-+]+$/.test(hours) && /\b(Mo|Tu|We|Th|Fr|Sa|Su)\b|24\/7/.test(hours);
}

const OSM_HOST = /(^|\.)openstreetmap\.org$/i;

/** Source links without OpenStreetMap (credited separately), one per domain ("www." dropped). */
export function sourceLinks(urls: readonly string[], max = 4): Array<{ domain: string; url: string }> {
  const out: Array<{ domain: string; url: string }> = [];
  for (const url of urls) {
    let host: string;
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      continue;
    }
    if (OSM_HOST.test(host)) continue;
    const domain = host.replace(/^www\./, "");
    if (!out.some((s) => s.domain === domain)) out.push({ domain, url });
    if (out.length >= max) break;
  }
  return out;
}

/** The row's data (or pin) comes from OpenStreetMap: show the ODbL credit. */
export function isOsmSourced(item: { source: string; license: string | null; sourceUrls: readonly string[] }): boolean {
  if (item.source === "osm" || /openstreetmap/i.test(item.license ?? "")) return true;
  return item.sourceUrls.some((u) => {
    try {
      return OSM_HOST.test(new URL(u).hostname);
    } catch {
      return false;
    }
  });
}

/** The row comes from Kocaeli Büyükşehir open data (CC BY 4.0 credit). */
export function isKbbSourced(item: { source: string; license: string | null }): boolean {
  return item.source === "kbb" || /Kocaeli Büyükşehir/i.test(item.license ?? "");
}

/** "gebze.bel.tr" of a website for display. */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
}

const INSTITUTION_SCHEMA: Record<string, string> = {
  anaokulu: "Preschool",
  ilkokul: "ElementarySchool",
  ortaokul: "MiddleSchool",
  lise: "HighSchool",
  ozel_egitim: "School",
  egitim_kurumu: "EducationalOrganization",
  universite: "CollegeOrUniversity",
  kutuphane: "Library",
  hastane: "Hospital",
  aile_sagligi_merkezi: "MedicalClinic",
  toplum_sagligi: "MedicalClinic",
  agiz_dis: "Dentist",
  acil_saglik: "EmergencyService",
  emniyet: "PoliceStation",
  jandarma: "PoliceStation",
  itfaiye: "FireStation",
  adliye: "Courthouse",
  noter: "Notary",
  ptt: "PostOffice",
  belediye: "CityHall",
};

/** schema.org type of a guide row. */
export function guideSchemaType(kind: GuideListKind, category: string | null | undefined): string {
  switch (kind) {
    case "atm":
      return "AutomatedTeller";
    case "bank":
      return "BankOrCreditUnion";
    case "fuel":
      return "GasStation";
    case "ev_charge":
      return "Place";
    case "place":
      return "TouristAttraction";
    case "institution":
      return (category && INSTITUTION_SCHEMA[category]) || "GovernmentOffice";
  }
}
