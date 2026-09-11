"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { distanceMeters, type LatLng } from "@/core/geo";
import { routes } from "@/core/routes";
import type { Json } from "@/lib/database.types";
import { INSTITUTION_CATEGORY_DEFS, guideCategoryLabel, isGuideDetailKind } from "@/features/guide/lib/constants";
import { parseGuideDetails, toInstitutionCategoryDefs } from "@/features/guide/lib/details";
import type { InstitutionCategoryDef } from "@/features/guide/lib/types";
import { districtBySlug } from "@/config/districts";
import { PLACE_CATEGORY_DEFS, districtLabel, placeCategoryMeta, poiHref, type PlaceCategoryDef } from "../config";
import { parsePlaceDetails, parseStopDetails } from "./details";
import type { DutyRow, DutyWindowIso, NearbyFilter, NearbyItem, PoiKind, PoiRow } from "../types";

const RADIUS_M = 25_000;
const LIMIT = 60;
const TTL_MS = 3 * 60_000;

type CacheEntry = { at: number; items: NearbyItem[] };
/** Per-tab cache so switching chips back and forth is instant (stale-while-revalidate). */
const cache = new Map<string, CacheEntry>();

const FILTER_KIND: Record<Exclude<NearbyFilter, "nobetci" | "isletme">, PoiKind> = {
  eczane: "pharmacy",
  cami: "mosque",
  durak: "bus_stop",
  taksi: "taxi",
  atm: "atm",
  banka: "bank",
  akaryakit: "fuel",
  sarj: "ev_charge",
  kurum: "institution",
  gezilecek: "place",
};

type Labels = { placeCategories: readonly PlaceCategoryDef[]; institutionCategories: readonly InstitutionCategoryDef[] };

/** `labels`: the admin's place / institution category labels (the built-in lists when they cannot be read). */
function poiToItem(r: PoiRow, labels: Labels = { placeCategories: PLACE_CATEGORY_DEFS, institutionCategories: INSTITUTION_CATEGORY_DEFS }): NearbyItem {
  const base = {
    id: r.id,
    name: r.name,
    href: poiHref(r.kind, r.slug),
    address: r.address,
    phone: r.phone,
    lat: r.lat,
    lng: r.lng,
    distance: r.distance_m ?? null,
    subjectType: "poi" as const,
  };
  const district = districtLabel(r);
  if (r.kind === "bus_stop") {
    const d = parseStopDetails(r.details);
    return {
      ...base,
      kind: "bus_stop",
      subtitle: [district, d.stopCode ? `Durak kodu ${d.stopCode}` : null].filter(Boolean).join(" · ") || null,
      lines: d.lines,
    };
  }
  if (r.kind === "taxi") {
    // No detail page: the card opens the point in Google Maps.
    return { ...base, kind: r.kind, href: `https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lng}`, subtitle: district };
  }
  if (isGuideDetailKind(r.kind)) {
    // City guide rows (ATM, banka, akaryakıt, şarj, resmî kurum): "<what it is> · <ilçe>", detail page /kurum/<slug>.
    const label = guideCategoryLabel(r.kind, parseGuideDetails(r.details, r.phone), labels.institutionCategories);
    return { ...base, kind: r.kind, subtitle: [label, district].filter(Boolean).join(" · ") || null };
  }
  if (r.kind === "place") {
    const d = parsePlaceDetails(r.details);
    return { ...base, kind: "place", subtitle: [placeCategoryMeta(d.category, labels.placeCategories).label, district].filter(Boolean).join(" · ") };
  }
  return { ...base, kind: r.kind, subtitle: district };
}

function dutyToItem(r: DutyRow): NearbyItem {
  return {
    id: r.poi_id,
    kind: "duty",
    name: r.name,
    href: routes.nearby.pharmacy(r.slug),
    subtitle: districtLabel(r),
    address: r.address,
    phone: r.phone,
    lat: r.lat,
    lng: r.lng,
    distance: r.distance_m ?? null,
    subjectType: "poi",
    duty: { start: r.duty_start, end: r.duty_end },
  };
}

type BusinessRow = {
  id: string;
  slug: string;
  name: string;
  category_label: string | null;
  phone: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  working_hours: Json;
  vacation_mode: boolean;
  verification_level: number;
  district_id: string | null;
};

async function loadBusinesses(point: LatLng): Promise<NearbyItem[]> {
  const { data, error } = await createClient()
    .from("businesses")
    .select("id,slug,name,category_label,phone,address,lat,lng,working_hours,vacation_mode,verification_level,district_id")
    .eq("status", "approved")
    .not("lat", "is", null)
    .not("lng", "is", null)
    .limit(300);
  if (error) throw new Error(error.message);
  const items: NearbyItem[] = [];
  for (const b of (data ?? []) as BusinessRow[]) {
    if (typeof b.lat !== "number" || typeof b.lng !== "number") continue;
    items.push({
      id: b.id,
      kind: "business",
      name: b.name,
      href: routes.businesses.detail(b.slug),
      subtitle: [b.category_label, districtBySlug(b.district_id)?.name].filter(Boolean).join(" · ") || null,
      address: b.address,
      phone: b.phone,
      lat: b.lat,
      lng: b.lng,
      distance: distanceMeters(point, { lat: b.lat, lng: b.lng }),
      subjectType: "business",
      hours: b.working_hours,
      vacation: b.vacation_mode,
      verified: b.verification_level >= 1,
    });
  }
  return items.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0)).slice(0, LIMIT);
}

/** Fetch the items for a chip around a (rounded) point. */
export async function loadNearby(filter: NearbyFilter, point: LatLng): Promise<NearbyItem[]> {
  const supabase = createClient();
  const at = { p_lat: point.lat, p_lng: point.lng };
  if (filter === "nobetci") {
    const { data, error } = await supabase.rpc("duty_pharmacies_now", at);
    if (error) throw new Error(error.message);
    const byPoi = new Map<string, NearbyItem>();
    for (const r of (data ?? []) as DutyRow[]) if (!byPoi.has(r.poi_id)) byPoi.set(r.poi_id, dutyToItem(r));
    return [...byPoi.values()];
  }
  if (filter === "isletme") return loadBusinesses(point);

  const kind = FILTER_KIND[filter];
  const [pois, duty, cats, instCats] = await Promise.all([
    supabase.rpc("nearby_pois", { p_kind: kind, ...at, p_radius_m: RADIUS_M, p_limit: LIMIT }),
    kind === "pharmacy" ? supabase.rpc("duty_pharmacies_now", at) : Promise.resolve(null),
    // Admin labels of the place categories (public read); the built-in list when they cannot be read.
    kind === "place" ? supabase.from("place_categories").select("key,label,icon,active").order("sort").order("label") : Promise.resolve(null),
    // Same for the institution categories.
    kind === "institution"
      ? supabase.from("institution_categories").select("key,label_tr,group_key,icon,sort,active").order("sort").order("label_tr")
      : Promise.resolve(null),
  ]);
  if (pois.error) throw new Error(pois.error.message);
  const labels: Labels = {
    placeCategories: cats && !cats.error && cats.data?.length ? cats.data : PLACE_CATEGORY_DEFS,
    institutionCategories: instCats && !instCats.error ? toInstitutionCategoryDefs(instCats.data) : INSTITUTION_CATEGORY_DEFS,
  };
  const dutyByPoi = new Map<string, DutyWindowIso>();
  if (duty && !duty.error) for (const r of (duty.data ?? []) as DutyRow[]) dutyByPoi.set(r.poi_id, { start: r.duty_start, end: r.duty_end });
  return ((pois.data ?? []) as PoiRow[])
    .filter((r) => typeof r.lat === "number" && typeof r.lng === "number")
    .map((r) => {
      const item = poiToItem(r, labels);
      const d = dutyByPoi.get(r.id);
      return d ? { ...item, duty: d } : item;
    });
}

export type NearbyData = {
  items: NearbyItem[];
  loading: boolean;
  error: string | null;
  retry: () => void;
  /** Identifies the data set (filter + point); use it to refit the map. */
  cacheKey: string;
};

function pointKey(p: LatLng): string {
  return `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;
}

/** Items for the selected chip around the given point (client-side, cached per tab). */
export function useNearbyData(filter: NearbyFilter | null, point: LatLng): NearbyData {
  const [nonce, setNonce] = React.useState(0);
  const cacheKey = filter ? `${filter}|${pointKey(point)}` : "";
  const requestKey = `${cacheKey}#${nonce}`;
  const [state, setState] = React.useState<{ key: string; items: NearbyItem[]; error: string | null }>({ key: "", items: [], error: null });
  const { lat, lng } = point;

  React.useEffect(() => {
    if (!filter) return;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < TTL_MS) return;
    let active = true;
    loadNearby(filter, { lat, lng })
      .then((items) => {
        cache.set(cacheKey, { at: Date.now(), items });
        if (active) setState({ key: requestKey, items, error: null });
      })
      .catch(() => {
        if (active) setState({ key: requestKey, items: [], error: "Liste yüklenemedi. İnternet bağlantını kontrol edip tekrar dene." });
      });
    return () => {
      active = false;
    };
  }, [filter, cacheKey, requestKey, lat, lng]);

  const retry = React.useCallback(() => {
    cache.delete(cacheKey);
    setNonce((n) => n + 1);
  }, [cacheKey]);

  const peek = cacheKey ? cache.get(cacheKey) : undefined;
  const settled = state.key === requestKey;
  if (settled) return { items: state.items, loading: false, error: state.error, retry, cacheKey };
  if (peek) return { items: peek.items, loading: false, error: null, retry, cacheKey };
  return { items: [], loading: !!filter, error: null, retry, cacheKey };
}
