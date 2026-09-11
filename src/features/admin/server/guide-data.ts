import "server-only";
import { publicUrl } from "@/config/app-mode";
import { formatPhoneTR } from "@/core/format";
import { trCompare } from "@/core/tr";
import type { Json } from "@/lib/database.types";
import type { ServerSupabase } from "@/lib/supabase/server";
import { CATEGORY_KEY_RE } from "@/features/business/lib/category-visuals";
import { GUIDE_LIST_KINDS, PLACE_SUBKINDS, guideCategoryLabel, guideHref, placeSubkindLabel } from "@/features/guide/lib/constants";
import { parseGuideDetails, toInstitutionCategoryDefs } from "@/features/guide/lib/details";
import type { GuideListKind, PlaceSubkindDef } from "@/features/guide/lib/types";
import { PLACE_CATEGORY_DEFS } from "@/features/nearby/config";
import { GUIDE_CATEGORY_FIELD_LABELS, guideCategoryField, isGuideKind, type GuideFormValue, type GuideRowItem, type GuideVocab } from "../lib/guide-admin";

/**
 * Admin reads of the city guide with the admin's own session (RLS "admin write" also lets admins read hidden rows).
 */

/** Columns of the admin guide lists (toGuideRowItem). */
export const GUIDE_ROW_COLUMNS = "id,kind,name,slug,address,phone,lat,details,source,source_ref,hidden,locked,verified_at,updated_at,neighbourhoods(name)";

const EDIT_COLUMNS =
  "id,kind,name,slug,address,phone,lat,lng,neighbourhood_id,details,source,source_ref,hidden,locked,verified_at,source_urls,email,website,updated_at";

function parseSubkinds(v: Json | null | undefined): PlaceSubkindDef[] {
  if (!Array.isArray(v)) return [];
  const out: PlaceSubkindDef[] = [];
  for (const s of v) {
    if (!s || typeof s !== "object" || Array.isArray(s)) continue;
    const key = typeof s.key === "string" ? s.key : "";
    const label = typeof s.label === "string" ? s.label.trim() : "";
    if (CATEGORY_KEY_RE.test(key) && label) out.push({ key, label });
  }
  return out;
}

/** Institution and place categories (with subkinds) and the neighbourhoods; built-in lists when a table cannot be read. */
export async function loadGuideVocab(supabase: ServerSupabase): Promise<GuideVocab> {
  const [ic, pc, nh] = await Promise.all([
    supabase.from("institution_categories").select("key,label_tr,group_key,icon,sort,active").order("sort").order("label_tr"),
    supabase.from("place_categories").select("key,label,active,subkinds").order("sort").order("label"),
    supabase.from("neighbourhoods").select("id,name,lat,lng").limit(1000),
  ]);
  const placeCategories = pc.data?.length
    ? pc.data.map((r) => ({ key: r.key, label: r.label, active: r.active, subkinds: parseSubkinds(r.subkinds) }))
    : PLACE_CATEGORY_DEFS.map((c) => ({ key: c.key, label: c.label, active: c.active, subkinds: [...(PLACE_SUBKINDS[c.key] ?? [])] }));
  return {
    institutionCategories: toInstitutionCategoryDefs(ic.data),
    placeCategories,
    neighbourhoods: (nh.data ?? []).map((n) => ({ id: n.id, name: n.name, lat: n.lat, lng: n.lng })).sort((a, b) => trCompare(a.name, b.name)),
  };
}

/** One guide row for the editor, or null (missing, or not a guide kind). Throws when the query fails. */
export async function loadGuideRow(supabase: ServerSupabase, id: string): Promise<GuideFormValue | null> {
  const { data, error } = await supabase.from("poi").select(EDIT_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`guide row query failed: ${error.message}`);
  if (!data || !isGuideKind(data.kind)) return null;
  const d = parseGuideDetails(data.details, data.phone);
  return {
    id: data.id,
    kind: data.kind,
    name: data.name,
    slug: data.slug,
    address: data.address,
    neighbourhoodId: data.neighbourhood_id,
    lat: data.lat,
    lng: data.lng,
    phones: d.phones,
    fax: d.fax,
    email: data.email,
    website: data.website,
    hours: d.hours,
    description: d.description,
    fee: d.fee,
    category: d.category,
    subkind: d.subkind,
    ownership: d.ownership,
    bank: d.bank,
    brand: d.brand,
    operator: d.operator,
    sockets: Object.fromEntries(d.sockets.map((s) => [s.type, s.count])),
    powerKw: d.powerKw,
    capacity: d.capacity,
    atmCount: d.atmCount,
    curated: d.curated,
    photos: d.photos,
    verifiedAt: data.verified_at,
    sourceUrls: data.source_urls ?? [],
    hidden: data.hidden,
    locked: data.locked,
    source: data.source,
    sourceRef: data.source_ref,
    updatedAt: data.updated_at,
  };
}

/** Ids of the visible guide rows without a pin, in queue order (kind, name). */
export async function missingPinIds(supabase: ServerSupabase, kind: GuideListKind | null): Promise<string[]> {
  const { data, error } = await supabase
    .from("poi")
    .select("id")
    .in("kind", kind ? [kind] : [...GUIDE_LIST_KINDS])
    .is("lat", null)
    .eq("hidden", false)
    .order("kind")
    .order("search_norm")
    .order("id")
    .limit(2000);
  if (error) return [];
  return (data ?? []).map((r) => r.id);
}

type RowShape = {
  id: string;
  kind: string;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  lat: number | null;
  details: Json;
  source: string;
  source_ref: string | null;
  hidden: boolean;
  locked: boolean;
  verified_at: string | null;
  updated_at: string;
  neighbourhoods?: { name: string } | { name: string }[] | null;
};

/** A GUIDE_ROW_COLUMNS row as a list item (labels from the admin vocabularies). */
export function toGuideRowItem(r: RowShape, vocab: GuideVocab): GuideRowItem {
  const kind: GuideListKind = isGuideKind(r.kind) ? r.kind : "place";
  const d = parseGuideDetails(r.details, r.phone);
  const placeDefs = vocab.placeCategories.map((c) => ({ key: c.key, label: c.label, icon: null, active: c.active }));
  const category = guideCategoryLabel(kind, d, vocab.institutionCategories, placeDefs) ?? GUIDE_CATEGORY_FIELD_LABELS[guideCategoryField(kind)].none;
  const sub = kind === "place" ? placeSubkindLabel(d.subkind, d.category) : null;
  const n = r.neighbourhoods;
  const hood = Array.isArray(n) ? (n[0]?.name ?? null) : (n?.name ?? null);
  return {
    id: r.id,
    kind,
    name: r.name,
    subtitle: [category, sub, hood ?? "Mahalle yok", r.phone ? formatPhoneTR(r.phone) : "Telefon yok"].filter(Boolean).join(" · "),
    address: r.address,
    hasPin: r.lat !== null,
    verified: !!r.verified_at,
    hidden: r.hidden,
    locked: r.locked,
    thumb: d.photos[0]?.url ?? null,
    publicHref: r.hidden ? null : publicUrl(guideHref(kind, r.slug)),
  };
}
