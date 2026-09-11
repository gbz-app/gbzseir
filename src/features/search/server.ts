import "server-only";
import { districtBySlug } from "@/config/districts";
import { APP_SETTINGS_TAG } from "@/lib/app-settings";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/features/nearby/server/public-client";
import { getPlaces } from "@/features/nearby/server/queries";
import { DEFAULT_POPULAR_SEARCHES } from "./popular";
import { toSearchResults, type PopularPlace, type SearchResults } from "./query";

/** rpc global_search with the visitor's session (null when it fails). */
export async function searchAll(q: string, limit: number): Promise<SearchResults | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("global_search", { p_q: q, p_limit: limit });
    return error ? null : toSearchResults(data);
  } catch {
    return null;
  }
}

/**
 * "Popüler aramalar": rpc popular_searches (logged terms, then the admin list). Cached 10 min; the admin settings save
 * expires the app-settings tag. Falls back to the built-in list.
 */
export async function getPopularSearches(limit = 10): Promise<string[]> {
  const fallback = DEFAULT_POPULAR_SEARCHES.slice(0, limit);
  try {
    const supabase = createPublicClient(600, [APP_SETTINGS_TAG]);
    const { data, error } = await supabase.rpc("popular_searches", { p_limit: limit }, { get: true });
    const terms = !error && Array.isArray(data) ? data.filter((t): t is string => typeof t === "string" && t.trim() !== "") : [];
    return terms.length ? terms : fallback;
  } catch {
    return fallback;
  }
}

/**
 * "Popüler yerler": rpc popular_places (most viewed firm / place pages, then curated ones). Cached 30 min. When the RPC
 * cannot be read, the curated places (getPlaces order) are used.
 */
export async function getPopularPlaces(limit = 10): Promise<PopularPlace[]> {
  try {
    const supabase = createPublicClient(1800, ["poi", "businesses"]);
    const { data, error } = await supabase.rpc("popular_places", { p_limit: limit }, { get: true });
    if (!error && Array.isArray(data) && data.length) {
      return data.map((r) => ({
        kind: r.kind === "place" ? "place" : "business",
        id: r.id,
        slug: r.slug,
        name: r.name,
        category: r.category ?? null,
        label: r.label ?? null,
        imageUrl: r.image_url ?? null,
        // district_name / district_id are missing on the RPC before 2026091380.
        districtName: districtBySlug(r.district_id)?.name ?? r.district_name ?? null,
      }));
    }
  } catch {
    // fall through to the curated places
  }
  try {
    const places = await getPlaces();
    return places.slice(0, limit).map((p) => ({
      kind: "place",
      id: p.id,
      slug: p.slug,
      name: p.name,
      category: p.details.category,
      label: null,
      imageUrl: p.details.photos[0]?.thumbUrl || p.details.photos[0]?.url || null,
      districtName: districtBySlug(p.districtId)?.name ?? null,
    }));
  } catch {
    return [];
  }
}
