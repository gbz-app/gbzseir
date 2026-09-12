import "server-only";
import { trCompare, trNormalize } from "@/core/tr";
import { getVocabularies } from "@/features/business/lib/vocabularies";
import {
  EV_OPERATORS,
  FUEL_BRANDS,
  GUIDE_LIST_KINDS,
  INSTITUTION_GROUPS,
  PLACE_SUBKINDS,
  bankLabel,
  evOperatorLabel,
  fuelBrandLabel,
  institutionCategoryMeta,
  placeSubkindLabel,
} from "@/features/guide/lib/constants";
import { getInstitutionCategories, listGuideItems } from "@/features/guide/lib/queries";
import type { GuideItem, InstitutionCategoryDef } from "@/features/guide/lib/types";
import { PLACE_CATEGORY_DEFS, placeCategoryMeta, type PlaceCategoryDef } from "@/features/nearby/config";
import {
  entryDimValue,
  institutionIconName,
  placeIconName,
  placeTypeLabel,
  type GuideChipDef,
  type GuideEntry,
  type GuideListConfig,
  type GuideListQuery,
} from "./list-config";

/**
 * Server loaders of the guide list pages: every row of a list (all pages of listGuideItems, data-cached by the lib) as
 * small GuideEntry objects, and the chip definitions of the page. Filtering happens on the client.
 */

type Labels = { institution: readonly InstitutionCategoryDef[]; place: readonly PlaceCategoryDef[] };

const PAGE_SIZE = 100;
/**
 * Safety cap per query of a list page / list JSON: 6000 rows. Lists must be whole (the map and the A-Z list show every
 * row, and the explore screen's ATM / Banka / Kurum chips load them): today the largest queries are ATM (~1350 rows)
 * and all institutions (a few thousand). A query past the cap comes back with `truncated`, which /rehber/dizin/<slug>
 * never lets the CDN cache.
 */
const LIST_MAX_PAGES = 60;
/**
 * Cap per kind of the /rehber hub search index (loadGuideIndex): 1000 rows, as before, to keep that one JSON (all
 * kinds at once, ~1.9 MB raw) small. The index is knowingly partial for the big kinds (ATM, institutions, places).
 */
const INDEX_MAX_PAGES = 10;
/** Pages fetched in parallel per query. */
const PAGE_WAVE = 6;

export async function loadLabels(): Promise<Labels> {
  const [institution, vocab] = await Promise.all([getInstitutionCategories(), getVocabularies()]);
  return { institution, place: vocab.placeCategories };
}

type LoadResult = { items: GuideItem[]; ok: boolean; truncated: boolean };

/** Every row of one query, up to `maxPages` pages (truncated: the query has more). ok: false when any page failed. */
async function loadAll(q: GuideListQuery, maxPages: number): Promise<LoadResult> {
  const first = await listGuideItems({ ...q, page: 1, pageSize: PAGE_SIZE });
  if (!first.ok) return { items: [], ok: false, truncated: false };
  const truncated = first.pageCount > maxPages;
  const pages = Math.min(first.pageCount, maxPages);
  const items = [...first.items];
  let ok = true;
  const page = (n: number) => listGuideItems({ ...q, page: n, pageSize: PAGE_SIZE });
  // The other pages in small waves: a cold cache firing dozens of queries at once gets Gateway Timeouts from the API.
  for (let start = 2; start <= pages; start += PAGE_WAVE) {
    const numbers = Array.from({ length: Math.min(PAGE_WAVE, pages - start + 1) }, (_, i) => start + i);
    const wave = await Promise.all(numbers.map(page));
    for (let i = 0; i < wave.length; i++) {
      // One retry for a failed page; if it fails again, keep the other rows and report the list as not ok.
      const r = wave[i].ok ? wave[i] : await page(numbers[i]);
      if (!r.ok) ok = false;
      items.push(...r.items);
    }
  }
  return { items, ok, truncated };
}

/** Kind-specific "what is it" label of a row. */
export function entryType(item: GuideItem, labels: Labels): string {
  const d = item.details;
  switch (item.kind) {
    case "institution":
      return institutionCategoryMeta(d.category, labels.institution).label;
    case "place":
      return placeTypeLabel(d.category, d.subkind, labels.place);
    case "atm":
      return d.bank ? `${bankLabel(d.bank)} ATM` : "ATM";
    case "bank":
      return bankLabel(d.bank) ?? "Banka şubesi";
    case "fuel":
      return fuelBrandLabel(d.brand) ?? "Akaryakıt istasyonu";
    case "ev_charge":
      return evOperatorLabel(d.operator) ?? "Şarj istasyonu";
  }
}

export function toEntry(item: GuideItem, labels: Labels): GuideEntry {
  const d = item.details;
  const inst = item.kind === "institution" ? institutionCategoryMeta(d.category, labels.institution) : null;
  const cat = inst ? inst.key : item.kind === "place" ? placeCategoryMeta(d.category, labels.place).value : null;
  const type = entryType(item, labels);
  return {
    id: item.id,
    kind: item.kind,
    name: item.name,
    href: item.href,
    type,
    sub: [type, item.districtName].filter(Boolean).join(" · ") || null,
    district: item.districtId,
    cat,
    group: inst?.group ?? null,
    subkind: d.subkind,
    own: d.ownership,
    bank: d.bank,
    brand: d.brand,
    op: d.operator,
    lat: item.lat,
    lng: item.lng,
    verified: !!item.verifiedAt,
    // List thumbnail: the 1024 px variant when there is one, not the original.
    photo: d.photos[0]?.thumbUrl || d.photos[0]?.url || null,
    icon: item.kind === "institution" ? institutionIconName(cat, labels.institution) : item.kind === "place" ? placeIconName(cat, labels.place) : null,
    q: trNormalize([item.name, type, item.districtName, item.address].filter(Boolean).join(" ")),
  };
}

function sortEntries(list: GuideEntry[]): GuideEntry[] {
  return list.sort((a, b) => trCompare(a.name, b.name));
}

/**
 * Every row of a list page, sorted by name. `truncated`: a query hit the page cap, so rows are missing (treat the answer
 * as incomplete, like ok: false, when caching it).
 */
export async function loadGuideList(
  cfg: Pick<GuideListConfig, "queries" | "categories">,
  maxPages: number = LIST_MAX_PAGES,
): Promise<{ entries: GuideEntry[]; ok: boolean; truncated: boolean; labels: Labels }> {
  const [labels, results] = await Promise.all([loadLabels(), Promise.all(cfg.queries.map((q) => loadAll(q, maxPages)))]);
  const seen = new Set<string>();
  const entries: GuideEntry[] = [];
  for (const r of results) {
    for (const item of r.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      const e = toEntry(item, labels);
      if (cfg.categories && !(e.cat && cfg.categories.includes(e.cat))) continue;
      entries.push(e);
    }
  }
  return { entries: sortEntries(entries), ok: results.every((r) => r.ok), truncated: results.some((r) => r.truncated), labels };
}

/** Guide rows of every list kind for the hub search, up to INDEX_MAX_PAGES pages per kind (see there). */
export async function loadGuideIndex(): Promise<{ entries: GuideEntry[]; ok: boolean }> {
  const { entries, ok } = await loadGuideList({ queries: GUIDE_LIST_KINDS.map((kind) => ({ kind })) }, INDEX_MAX_PAGES);
  return { entries, ok };
}

/** Chips of a list page: only values that occur, in the vocabulary's order (banks / brands / operators by count). */
export function buildChipDefs(cfg: GuideListConfig, entries: readonly GuideEntry[], labels: Labels): GuideChipDef[] {
  const dim = cfg.chip;
  if (!dim) return [];
  const counts = new Map<string, number>();
  for (const e of entries) {
    const v = entryDimValue(e, dim);
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const byCount = (a: GuideChipDef, b: GuideChipDef) => (counts.get(b.value) ?? 0) - (counts.get(a.value) ?? 0) || trCompare(a.label, b.label);
  switch (dim) {
    case "group":
      return INSTITUTION_GROUPS.filter((g) => counts.has(g.key)).map((g) => ({ value: g.key, label: g.label }));
    case "category": {
      if (cfg.kind === "institution") {
        const known = labels.institution.filter((d) => counts.has(d.key)).map((d) => ({ value: d.key, label: d.label }));
        const extra = [...counts.keys()].filter((k) => !known.some((c) => c.value === k)).map((k) => ({ value: k, label: institutionCategoryMeta(k, labels.institution).label }));
        return [...known, ...extra];
      }
      const defs = labels.place.length ? labels.place : PLACE_CATEGORY_DEFS;
      const known = defs.filter((d) => counts.has(d.key)).map((d) => ({ value: d.key, label: placeCategoryMeta(d.key, labels.place).label }));
      const extra = [...counts.keys()].filter((k) => !known.some((c) => c.value === k)).map((k) => ({ value: k, label: placeCategoryMeta(k, labels.place).label }));
      return [...known, ...extra];
    }
    case "subkind": {
      const cat = cfg.queries[0]?.category ?? "";
      const known = (PLACE_SUBKINDS[cat] ?? []).filter((s) => counts.has(s.key)).map((s) => ({ value: s.key, label: s.label }));
      const extra = [...counts.keys()]
        .filter((k) => !known.some((c) => c.value === k))
        .map((k) => ({ value: k, label: placeSubkindLabel(k, cat) ?? k }))
        .sort(byCount);
      return [...known, ...extra];
    }
    case "bank":
      return [...counts.keys()].map((k) => ({ value: k, label: bankLabel(k) ?? k })).sort(byCount);
    case "brand":
      return [...counts.keys()].map((k) => ({ value: k, label: fuelBrandLabel(k) ?? FUEL_BRANDS[k] ?? k })).sort(byCount);
    case "operator":
      return [...counts.keys()].map((k) => ({ value: k, label: evOperatorLabel(k) ?? EV_OPERATORS[k] ?? k })).sort(byCount);
  }
}
