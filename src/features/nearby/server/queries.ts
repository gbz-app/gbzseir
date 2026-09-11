import "server-only";
import { cache } from "react";
import { dutyDayFor } from "@/core/duty";
import { addDaysToKey } from "@/core/time";
import { trCompare } from "@/core/tr";
import { getAppSettings } from "@/lib/app-settings";
import { parsePlaceDetails } from "../lib/details";
import { PLACE_CATEGORIES } from "../config";
import type { DutyMode, DutyRow, PharmacyDuty, PlaceSummary, PoiDetail, PoiKind, PoiRow } from "../types";
import { createPublicClient } from "./public-client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Duty data mode from the app settings (unknown values count as "demo", which is always labelled). */
export async function getDutyMode(): Promise<DutyMode> {
  const m = (await getAppSettings()).dutyDataMode;
  return m === "off" || m === "live" ? m : "demo";
}

export type DutyData = {
  /** Duty rows of the current duty day and the next two (deduplicated, sorted by start then name). */
  rows: DutyRow[];
  /** Latest fetched_at of the rows ("Son güncelleme"). */
  fetchedAt: string | null;
  /** False when at least one query failed. */
  ok: boolean;
  /** Server time of this render (ms) - pass to client components as the hydration "now". */
  generatedAt: number;
  /** app_settings.duty_data_mode ("off": rows is always empty). */
  mode: DutyMode;
};

/**
 * Duty pharmacies around now. Three duty days are fetched so a cached (ISR / offline) page can still show
 * the correct "now" and "next" lists after the 08:30 switch; clients filter with isDutyActive at render time.
 */
export async function getDutyData(revalidate = 300): Promise<DutyData> {
  const now = Date.now();
  const mode = await getDutyMode();
  if (mode === "off") return { rows: [], fetchedAt: null, ok: true, generatedAt: now, mode };
  const day = dutyDayFor(now);
  const days = [day, addDaysToKey(day, 1), addDaysToKey(day, 2)];
  const supabase = createPublicClient(revalidate, ["nearby", "duty"]);
  const results = await Promise.all(
    days.map(async (d) => {
      try {
        return await supabase.rpc("duty_pharmacies_for_day", { p_date: d }, { get: true });
      } catch {
        return { data: null, error: { message: "network" } };
      }
    }),
  );
  let ok = true;
  const map = new Map<string, DutyRow>();
  for (const r of results) {
    if (r.error) {
      ok = false;
      continue;
    }
    // The RPC already hides sample rows outside "demo"; this keeps a stale cached answer honest too.
    for (const row of (r.data ?? []) as DutyRow[]) if (mode === "demo" || row.source !== "demo") map.set(row.duty_id, row);
  }
  const rows = [...map.values()].sort(
    (a, b) => new Date(a.duty_start).getTime() - new Date(b.duty_start).getTime() || trCompare(a.name, b.name),
  );
  let fetchedAt: string | null = null;
  for (const r of rows) if (!fetchedAt || new Date(r.fetched_at).getTime() > new Date(fetchedAt).getTime()) fetchedAt = r.fetched_at;
  return { rows, fetchedAt, ok, generatedAt: now, mode };
}

const POI_COLUMNS = "id,kind,name,slug,address,phone,lat,lng,district_id,details,source,license,updated_at";

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

/** A poi by slug (canonical) or uuid. Cached per request (shared by generateMetadata and the page). */
export const getPoi = cache(async (kind: PoiKind, param: string): Promise<PoiDetail | null> => {
  const value = safeDecode(param).trim().toLowerCase();
  if (!value || value.length > 200) return null;
  const supabase = createPublicClient(3600, ["nearby", "poi"]);
  const base = supabase.from("poi").select(POI_COLUMNS).eq("kind", kind);
  const { data, error } = await (UUID_RE.test(value) ? base.eq("id", value) : base.eq("slug", value)).maybeSingle();
  if (error) throw new Error(`poi query failed: ${error.message}`);
  if (!data) return null;
  return {
    id: data.id,
    kind: data.kind as PoiKind,
    name: data.name,
    slug: data.slug,
    address: data.address,
    phone: data.phone,
    lat: data.lat,
    lng: data.lng,
    district_id: data.district_id,
    details: data.details,
    source: data.source,
    license: data.license,
    updated_at: data.updated_at,
  };
});

/** Server render time (ms) to pass to client components as the hydration "now". */
export function renderNow(): number {
  return Date.now();
}

/** Current and upcoming duty windows of one pharmacy, filtered by the duty mode like the duty RPCs. */
export async function getPharmacyDuties(poiId: string): Promise<PharmacyDuty[]> {
  const mode = await getDutyMode();
  if (mode === "off") return [];
  // Round to the hour so the cached request key stays stable for a while.
  const hour = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000).toISOString();
  const supabase = createPublicClient(900, ["nearby", "duty"]);
  let query = supabase.from("pharmacy_duty").select("id,duty_start,duty_end,source,note,fetched_at").eq("poi_id", poiId).gt("duty_end", hour);
  if (mode === "live") query = query.neq("source", "demo");
  const { data, error } = await query.order("duty_start", { ascending: true }).limit(8);
  if (error) return [];
  return data ?? [];
}

const CATEGORY_ORDER = new Map(PLACE_CATEGORIES.map((c, i) => [c.value, i]));

/**
 * Categories listed as "gezilecek yer": the built-in place_categories (tarihi, park, tabiat_parki, doga, sahil, muze,
 * kultur, spor, pazar, mezarlik, avm, ulasim, diger). Utility places stored as kind 'place' under their own categories
 * (kocaelikart, toplanma_alani, otopark) are left out, so importing them never pushes curated places out of the list.
 */
const GEZILECEK_CATEGORIES = PLACE_CATEGORIES.map((c) => c.value);
/** A place saved without a category (the guide form allows it; the trigger accepts null) shows as "Diğer", so it stays. */
const GEZILECEK_FILTER = `details->>category.is.null,details->>category.in.(${GEZILECEK_CATEGORIES.join(",")})`;
const PLACES_LIMIT = 500;

/**
 * Places to visit (the gezilecek categories above): curated first, then by category and name. The database orders
 * curated rows first and then by name before the limit, so the cap can only drop the tail, never a curated place.
 */
export async function getPlaces(): Promise<PlaceSummary[]> {
  const supabase = createPublicClient(3600, ["nearby", "poi"]);
  const { data, error } = await supabase
    .from("poi")
    .select("id,slug,name,address,lat,lng,details,district_id")
    .eq("kind", "place")
    .or(GEZILECEK_FILTER)
    .order("details->curated", { ascending: false, nullsFirst: false })
    .order("name", { ascending: true })
    .limit(PLACES_LIMIT);
  if (error) throw new Error(`places query failed: ${error.message}`);
  const list: PlaceSummary[] = (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    districtId: row.district_id,
    details: parsePlaceDetails(row.details),
  }));
  list.sort(
    (a, b) =>
      Number(b.details.curated) - Number(a.details.curated) ||
      (CATEGORY_ORDER.get(a.details.category) ?? 9) - (CATEGORY_ORDER.get(b.details.category) ?? 9) ||
      trCompare(a.name, b.name),
  );
  return list;
}

/** Nearest pois of a kind around a point (excluding one id), for "Yakındakiler" sections. */
export async function getNearbyPois(opts: {
  kind: PoiKind;
  lat: number;
  lng: number;
  excludeId?: string;
  limit?: number;
  radiusM?: number;
}): Promise<PoiRow[]> {
  const limit = opts.limit ?? 4;
  const supabase = createPublicClient(3600, ["nearby", "poi"]);
  const { data, error } = await supabase.rpc(
    "nearby_pois",
    { p_kind: opts.kind, p_lat: opts.lat, p_lng: opts.lng, p_radius_m: opts.radiusM ?? 8000, p_limit: limit + 1 },
    { get: true },
  );
  if (error || !data) return [];
  return (data as PoiRow[]).filter((r) => r.id !== opts.excludeId).slice(0, limit);
}
