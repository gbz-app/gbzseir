import "server-only";
import { cache } from "react";
import { trNormalize } from "@/core/tr";
import type { Json } from "@/lib/database.types";
import { APP_SETTINGS_TAG } from "@/lib/app-settings";
import { getVocabularies } from "@/features/business/lib/vocabularies";
import type { PlaceCategoryDef } from "@/features/nearby/config";
import { createPublicClient } from "@/features/nearby/server/public-client";
import type { PoiRow } from "@/features/nearby/types";
import {
  EMERGENCY_NUMBERS_FALLBACK,
  GUIDE_DETAIL_KINDS,
  GUIDE_LIST_KINDS,
  GUIDE_SECTIONS,
  INSTITUTION_CATEGORY_DEFS,
  guideCategoryLabel,
  guideHref,
  institutionCategoriesOf,
  institutionCategoryMeta,
  placeSubkindLabel,
} from "./constants";
import { parseEmergencyNumbers, parseGuideDetails, toInstitutionCategoryDefs } from "./details";
import type {
  EmergencyNumber,
  GuideCounts,
  GuideItem,
  GuideListKind,
  GuideListOptions,
  GuideListResult,
  InstitutionCategoryDef,
  InstitutionGroupKey,
  Ownership,
} from "./types";

/**
 * Server queries of the city guide (/rehber, /rehber/[kategori], /kurum/[slug]). Cookie-less anon client through the data
 * cache (tags "nearby" / "poi", which the admin place actions already expire; categories use "vocabularies", emergency
 * numbers "app-settings"), so pages stay static / ISR. RLS hides hidden rows.
 */

const TAGS = ["nearby", "poi"];
const REVALIDATE = 3600;
const COLUMNS =
  "id,kind,name,slug,address,phone,lat,lng,neighbourhood_id,details,source,license,updated_at,verified_at,source_urls,email,website,neighbourhoods(name)";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Labels = { institution: readonly InstitutionCategoryDef[]; place: readonly PlaceCategoryDef[] };

/** A poi row as selected with COLUMNS (or a nearby_pois row, which has neighbourhood_name and no guide columns). */
type RawRow = {
  id: string;
  kind: string;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  neighbourhood_id: string | null;
  details: Json;
  source: string;
  license: string | null;
  updated_at: string;
  verified_at?: string | null;
  source_urls?: string[] | null;
  email?: string | null;
  website?: string | null;
  neighbourhoods?: { name: string } | { name: string }[] | null;
  neighbourhood_name?: string | null;
};

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

function hoodName(r: RawRow): string | null {
  if (r.neighbourhood_name !== undefined) return r.neighbourhood_name;
  const n = r.neighbourhoods;
  return Array.isArray(n) ? (n[0]?.name ?? null) : (n?.name ?? null);
}

const isListKind = (k: string): k is GuideListKind => (GUIDE_LIST_KINDS as readonly string[]).includes(k);

function toItem(r: RawRow, labels: Labels): GuideItem {
  const kind: GuideListKind = isListKind(r.kind) ? r.kind : "place";
  const details = parseGuideDetails(r.details, r.phone);
  const neighbourhoodName = hoodName(r);
  const categoryLabel = guideCategoryLabel(kind, details, labels.institution, labels.place);
  const subLabel = kind === "place" ? placeSubkindLabel(details.subkind, details.category) : null;
  return {
    id: r.id,
    kind,
    name: r.name,
    slug: r.slug,
    href: guideHref(kind, r.slug),
    address: r.address,
    phone: r.phone,
    lat: r.lat,
    lng: r.lng,
    neighbourhoodId: r.neighbourhood_id,
    neighbourhoodName,
    details,
    categoryLabel,
    subtitle: [categoryLabel, subLabel, neighbourhoodName].filter(Boolean).join(" · ") || null,
    verifiedAt: r.verified_at ?? null,
    sourceUrls: (r.source_urls ?? []).filter((u) => /^https?:\/\//i.test(u)),
    email: r.email ?? null,
    website: r.website ?? null,
    source: r.source,
    license: r.license,
    updatedAt: r.updated_at,
  };
}

/** Institution categories in order (admin labels; inactive ones too, they still label rows). Never throws. */
export const getInstitutionCategories = cache(async (): Promise<readonly InstitutionCategoryDef[]> => {
  try {
    const { data, error } = await createPublicClient(REVALIDATE, ["vocabularies"])
      .from("institution_categories")
      .select("key,label_tr,group_key,icon,sort,active")
      .order("sort")
      .order("label_tr");
    if (error) throw new Error(error.message);
    return toInstitutionCategoryDefs(data);
  } catch (e) {
    console.error("[guide] institution categories: using the built-in list:", e instanceof Error ? e.message : e);
    return INSTITUTION_CATEGORY_DEFS;
  }
});

async function loadLabels(): Promise<Labels> {
  const [institution, vocab] = await Promise.all([getInstitutionCategories(), getVocabularies()]);
  return { institution, place: vocab.placeCategories };
}

/** Accent-insensitive search term for search_norm (PostgREST pattern characters removed). */
function searchTerm(q: string): string | null {
  const n = trNormalize(q)
    .replace(/[%_*\\(),.:;"']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return n || null;
}

/**
 * One page of guide rows of a kind, filtered (see GuideListOptions; build them from a URL with guideListOptions in
 * ./params). Sorted by name (Turkish letters folded). A page past the end is empty; a failed query returns ok: false.
 */
export async function listGuideItems(opts: GuideListOptions): Promise<GuideListResult> {
  const pageSize = Math.min(100, Math.max(1, Math.floor(opts.pageSize ?? 30)));
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const empty = { items: [], total: 0, page, pageSize, pageCount: 0 };
  try {
    const labels = await loadLabels();
    let query = createPublicClient(REVALIDATE, TAGS).from("poi").select(COLUMNS, { count: "exact" }).eq("kind", opts.kind);
    if (opts.kind === "institution" && opts.group) query = query.in("details->>category", institutionCategoriesOf(opts.group, labels.institution));
    if (opts.category) query = query.eq("details->>category", opts.category);
    if (opts.subkind) query = query.eq("details->>subkind", opts.subkind);
    if (opts.ownership) query = query.eq("details->>ownership", opts.ownership);
    if (opts.bank) query = query.eq("details->>bank", opts.bank);
    if (opts.brand) query = query.eq("details->>brand", opts.brand);
    if (opts.operator) query = query.eq("details->>operator", opts.operator);
    if (opts.neighbourhoodId && UUID_RE.test(opts.neighbourhoodId)) query = query.eq("neighbourhood_id", opts.neighbourhoodId);
    const q = opts.q ? searchTerm(opts.q) : null;
    if (q) query = query.ilike("search_norm", `%${q}%`);
    if (opts.hasLocation === true) query = query.not("lat", "is", null);
    else if (opts.hasLocation === false) query = query.is("lat", null);
    const from = (page - 1) * pageSize;
    const { data, error, count } = await query.order("search_norm", { ascending: true }).order("id").range(from, from + pageSize - 1);
    // PGRST103: the page starts past the last row.
    if (error && error.code === "PGRST103") return { ...empty, total: count ?? 0, pageCount: Math.ceil((count ?? 0) / pageSize), ok: true };
    if (error) throw new Error(error.message);
    const total = count ?? 0;
    return { items: (data ?? []).map((r) => toItem(r, labels)), total, page, pageSize, pageCount: Math.ceil(total / pageSize), ok: true };
  } catch (e) {
    console.error("[guide] list query failed:", e instanceof Error ? e.message : e);
    return { ...empty, ok: false };
  }
}

/**
 * A guide row by slug (canonical) or uuid, or null. Without `kind` it looks at the /kurum kinds (institution, atm, bank,
 * fuel, ev_charge). Cached per request (shared by generateMetadata and the page). Throws when the query fails.
 */
export const getGuideItem = cache(async (param: string, kind?: GuideListKind): Promise<GuideItem | null> => {
  const value = safeDecode(param).trim().toLowerCase();
  if (!value || value.length > 200) return null;
  const kinds: string[] = kind ? [kind] : [...GUIDE_DETAIL_KINDS];
  const base = createPublicClient(REVALIDATE, TAGS).from("poi").select(COLUMNS).in("kind", kinds);
  const { data, error } = await (UUID_RE.test(value) ? base.eq("id", value) : base.eq("slug", value)).maybeSingle();
  if (error) throw new Error(`guide item query failed: ${error.message}`);
  if (!data) return null;
  return toItem(data, await loadLabels());
});

/** Nearest guide rows of a kind around a point (optionally the same category), for "Yakındakiler" sections. Never throws. */
export async function getNearbyGuideItems(opts: {
  kind: GuideListKind;
  lat: number;
  lng: number;
  excludeId?: string;
  /** Institution / place category to keep (e.g. other aile sağlığı merkezleri). */
  category?: string | null;
  limit?: number;
  radiusM?: number;
}): Promise<GuideItem[]> {
  const limit = opts.limit ?? 4;
  try {
    const { data, error } = await createPublicClient(REVALIDATE, TAGS).rpc(
      "nearby_pois",
      { p_kind: opts.kind, p_lat: opts.lat, p_lng: opts.lng, p_radius_m: opts.radiusM ?? 8000, p_limit: opts.category ? 80 : limit + 1 },
      { get: true },
    );
    if (error || !data) return [];
    const labels = await loadLabels();
    return (data as PoiRow[])
      .filter((r) => r.id !== opts.excludeId)
      .map((r) => toItem(r, labels))
      .filter((it) => !opts.category || it.details.category === opts.category)
      .slice(0, limit);
  } catch {
    return [];
  }
}

type CountRow = {
  kind: string;
  lat: number | null;
  category: string | null;
  subkind: string | null;
  ownership: string | null;
  bank: string | null;
  brand: string | null;
  operator: string | null;
};

const PAGE = 1000;
const MAX_ROWS = 10_000;

function bump(map: Record<string, number>, key: string | null | undefined) {
  if (key) map[key] = (map[key] ?? 0) + 1;
}

/** Counts of the visible guide rows for the /rehber hub and the filter chips. Never throws (ok: false on failure). */
export const getGuideCounts = cache(async (): Promise<GuideCounts> => {
  const counts: GuideCounts = {
    total: 0,
    byKind: {},
    byInstitutionGroup: {},
    byInstitutionCategory: {},
    byOwnership: {},
    byPlaceCategory: {},
    byPlaceSubkind: {},
    byBank: { atm: {}, bank: {} },
    byFuelBrand: {},
    byEvOperator: {},
    missingLocation: {},
    bySection: {},
    ok: true,
  };
  try {
    const [labels, rows] = await Promise.all([
      loadLabels(),
      (async () => {
        const supabase = createPublicClient(REVALIDATE, TAGS);
        const out: CountRow[] = [];
        for (let from = 0; from < MAX_ROWS; from += PAGE) {
          const { data, error } = await supabase
            .from("poi")
            .select(
              "kind,lat,category:details->>category,subkind:details->>subkind,ownership:details->>ownership,bank:details->>bank,brand:details->>brand,operator:details->>operator",
            )
            .in("kind", [...GUIDE_LIST_KINDS])
            .order("id")
            .range(from, from + PAGE - 1);
          if (error) throw new Error(error.message);
          out.push(...((data ?? []) as CountRow[]));
          if (!data || data.length < PAGE) break;
        }
        return out;
      })(),
    ]);
    for (const r of rows) {
      if (!isListKind(r.kind)) continue;
      const kind = r.kind;
      counts.total += 1;
      counts.byKind[kind] = (counts.byKind[kind] ?? 0) + 1;
      if (r.lat === null) counts.missingLocation[kind] = (counts.missingLocation[kind] ?? 0) + 1;
      if (kind === "institution") {
        const meta = institutionCategoryMeta(r.category, labels.institution);
        bump(counts.byInstitutionCategory, meta.key);
        counts.byInstitutionGroup[meta.group] = (counts.byInstitutionGroup[meta.group] ?? 0) + 1;
        if (r.ownership === "devlet" || r.ownership === "ozel") counts.byOwnership[r.ownership as Ownership] = (counts.byOwnership[r.ownership as Ownership] ?? 0) + 1;
      } else if (kind === "place") {
        const cat = r.category ?? "diger";
        bump(counts.byPlaceCategory, cat);
        if (r.subkind) bump((counts.byPlaceSubkind[cat] ??= {}), r.subkind);
      } else if (kind === "atm" || kind === "bank") {
        bump(counts.byBank[kind], r.bank);
      } else if (kind === "fuel") {
        bump(counts.byFuelBrand, r.brand);
      } else if (kind === "ev_charge") {
        bump(counts.byEvOperator, r.operator);
      }
    }
    for (const s of GUIDE_SECTIONS) {
      counts.bySection[s.slug] =
        s.kind === "institution"
          ? (counts.byInstitutionGroup[s.group as InstitutionGroupKey] ?? 0)
          : s.kind === "place"
            ? (counts.byPlaceCategory[s.placeCategory ?? ""] ?? 0)
            : (counts.byKind[s.kind] ?? 0);
    }
    return counts;
  } catch (e) {
    console.error("[guide] counts query failed:", e instanceof Error ? e.message : e);
    return { ...counts, ok: false };
  }
});

/** app_settings.emergency_numbers (admin-editable), or the built-in list when it is missing or unreadable. Never throws. */
export const getEmergencyNumbers = cache(async (): Promise<EmergencyNumber[]> => {
  const fallback = EMERGENCY_NUMBERS_FALLBACK.map((e) => ({ ...e }));
  try {
    const { data, error } = await createPublicClient(300, [APP_SETTINGS_TAG]).from("app_settings").select("value").eq("key", "emergency_numbers").maybeSingle();
    if (error) throw new Error(error.message);
    const list = parseEmergencyNumbers(data?.value);
    return list.length ? list : fallback;
  } catch (e) {
    console.error("[guide] emergency numbers: using the built-in list:", e instanceof Error ? e.message : e);
    return fallback;
  }
});
