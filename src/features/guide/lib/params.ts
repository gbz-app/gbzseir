/**
 * /rehber/[kategori] URL <-> list options, and the sub-filter chips of a section. Pure TS (server and client).
 */
import { CATEGORY_KEY_RE } from "@/features/business/lib/category-visuals";
import {
  BANKS,
  EV_OPERATORS,
  FUEL_BRANDS,
  GUIDE_PARAMS,
  INSTITUTION_CATEGORY_DEFS,
  bankLabel,
  evOperatorLabel,
  fuelBrandLabel,
  parseOwnership,
  placeSubkindLabel,
  PLACE_SUBKINDS,
} from "./constants";
import type { GuideCounts, GuideListOptions, GuideSection, InstitutionCategoryDef } from "./types";

type SearchParams = Record<string, string | string[] | undefined>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function one(sp: SearchParams, key: string): string | null {
  const v = sp[key];
  const s = (Array.isArray(v) ? v[0] : v)?.trim();
  return s ? s : null;
}

/** URL value ("is-bankasi", "aile-sagligi-merkezi") -> key ("is_bankasi"), or null when malformed. */
function keyParam(v: string | null): string | null {
  if (!v) return null;
  const k = v.toLowerCase().replace(/-/g, "_");
  return CATEGORY_KEY_RE.test(k) ? k : null;
}

/**
 * List options of a section page from its search params. `presetCategory`: the institution category of an
 * /rehber/<category-slug> path (resolveGuideSection), used when ?alt= is absent.
 */
export function guideListOptions(section: GuideSection, sp: SearchParams, presetCategory?: string | null, pageSize = 30): GuideListOptions {
  const page = Number(one(sp, GUIDE_PARAMS.page));
  const hood = one(sp, GUIDE_PARAMS.neighbourhood);
  const opts: GuideListOptions = {
    kind: section.kind,
    q: one(sp, GUIDE_PARAMS.q)?.slice(0, 80) ?? null,
    neighbourhoodId: hood && UUID_RE.test(hood) ? hood : null,
    page: Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1,
    pageSize,
  };
  const sub = keyParam(one(sp, GUIDE_PARAMS.sub));
  switch (section.kind) {
    case "institution":
      opts.group = section.group ?? null;
      opts.category = sub ?? presetCategory ?? null;
      opts.ownership = parseOwnership(one(sp, GUIDE_PARAMS.ownership));
      break;
    case "place":
      opts.category = section.placeCategory ?? null;
      opts.subkind = sub;
      break;
    case "atm":
    case "bank":
      opts.bank = keyParam(one(sp, GUIDE_PARAMS.bank));
      break;
    case "fuel":
      opts.brand = keyParam(one(sp, GUIDE_PARAMS.brand));
      break;
    case "ev_charge":
      opts.operator = keyParam(one(sp, GUIDE_PARAMS.operator));
      break;
  }
  return opts;
}

export type GuideSubFilterOption = { value: string; label: string; count: number };

const byCount = (a: GuideSubFilterOption, b: GuideSubFilterOption) => b.count - a.count || a.label.localeCompare(b.label, "tr-TR");

/**
 * Chips of a section's sub-filter (value = key; put it in the URL with guideSectionHref), only values with rows, with
 * their counts. Institution categories follow the vocabulary order; banks / brands / operators / subkinds go by count.
 */
export function guideSubFilterOptions(
  section: GuideSection,
  counts: GuideCounts,
  institutionDefs: readonly InstitutionCategoryDef[] = INSTITUTION_CATEGORY_DEFS,
): GuideSubFilterOption[] {
  const entries = (map: Record<string, number> | undefined, label: (k: string) => string | null, known?: Readonly<Record<string, unknown>>) =>
    Object.entries(map ?? {})
      .filter(([k, n]) => n > 0 && (!known || k in known || CATEGORY_KEY_RE.test(k)))
      .map(([k, n]) => ({ value: k, label: label(k) ?? k, count: n }))
      .sort(byCount);
  switch (section.subFilter?.by) {
    case "category":
      return institutionDefs
        .filter((d) => d.group === section.group && (counts.byInstitutionCategory[d.key] ?? 0) > 0)
        .map((d) => ({ value: d.key, label: d.label, count: counts.byInstitutionCategory[d.key] ?? 0 }));
    case "subkind": {
      const cat = section.placeCategory ?? "";
      const known = PLACE_SUBKINDS[cat] ?? [];
      const map = counts.byPlaceSubkind[cat] ?? {};
      const listed = known.filter((s) => (map[s.key] ?? 0) > 0).map((s) => ({ value: s.key, label: s.label, count: map[s.key] ?? 0 }));
      const extra = Object.entries(map)
        .filter(([k, n]) => n > 0 && !known.some((s) => s.key === k))
        .map(([k, n]) => ({ value: k, label: placeSubkindLabel(k, cat) ?? k, count: n }))
        .sort(byCount);
      return [...listed, ...extra];
    }
    case "bank":
      return entries(section.kind === "bank" ? counts.byBank.bank : counts.byBank.atm, bankLabel, BANKS);
    case "brand":
      return entries(counts.byFuelBrand, fuelBrandLabel, FUEL_BRANDS);
    case "operator":
      return entries(counts.byEvOperator, evOperatorLabel, EV_OPERATORS);
    default:
      return [];
  }
}
