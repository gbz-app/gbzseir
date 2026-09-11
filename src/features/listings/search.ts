/**
 * Listing feed fetcher shared by the server page (first page) and the client "Daha fazla yükle" button.
 * Uses rpc('search_listings') (active + not expired, Turkish-insensitive search) plus PostgREST filters.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { LISTINGS_PAGE_SIZE } from "./constants";
import type { ResolvedSearch } from "./filters";
import { toCardData, type ListingCardData } from "./types";

export const CARD_SELECT =
  "id,type,title,price_try,published_at,created_at,business_id,attributes,job_work_type,job_salary_min,job_salary_max,job_salary_hidden,job_benefits,job_location_label,job_experience,is_demo,neighbourhoods(name),listing_categories(name,icon),listing_media(url,thumb_url,sort),listing_videos(listing_id),business:businesses(name,slug,logo_url,verification_level)";

export type ListingsPage = { items: ListingCardData[]; hasMore: boolean; total: number | null; error: string | null };

type SearchArgs = Database["public"]["Functions"]["search_listings"]["Args"];

type FilterableQuery = {
  eq(column: string, value: string): FilterableQuery;
  contains(column: string, value: string[]): FilterableQuery;
  range(from: number, to: number): PromiseLike<{ data: unknown; error: { message: string } | null; count: number | null }>;
};

/**
 * @param page 0-based page index (LISTINGS_PAGE_SIZE rows per page; one extra row is fetched to know if there is more).
 */
export async function fetchListingsPage(
  client: SupabaseClient<Database>,
  p: ResolvedSearch,
  page: number,
  opts: { withCount?: boolean; pageSize?: number } = {},
): Promise<ListingsPage> {
  const size = opts.pageSize ?? LISTINGS_PAGE_SIZE;
  const from = Math.max(0, page) * size;
  const args: SearchArgs = { p_type: p.type, p_sort: p.sort };
  if (p.q) args.p_q = p.q;
  if (p.categoryId) args.p_category_id = p.categoryId;
  if (p.neighbourhoodId) args.p_neighbourhood_id = p.neighbourhoodId;
  if (p.minPrice != null) args.p_min_price = p.minPrice;
  if (p.maxPrice != null) args.p_max_price = p.maxPrice;
  if (p.workType) args.p_work_type = p.workType;
  // Category attribute filters (checked against the category's filterable fields in the RPC).
  if (p.categoryId && p.attrs) args.p_attrs = p.attrs;

  let query = client
    .rpc("search_listings", args, opts.withCount ? { count: "exact" } : undefined)
    .select(CARD_SELECT) as unknown as FilterableQuery;
  if (p.condition) query = query.eq("attributes->>durum", p.condition);
  if (p.locationLabel) query = query.eq("job_location_label", p.locationLabel);
  if (p.experience) query = query.eq("job_experience", p.experience);
  if (p.shuttle) query = query.contains("job_benefits", ["servis"]);

  try {
    const { data, error, count } = await query.range(from, from + size);
    if (error) return { items: [], hasMore: false, total: null, error: error.message };
    const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
    return {
      items: rows.slice(0, size).map(toCardData),
      hasMore: rows.length > size,
      total: typeof count === "number" ? count : null,
      error: null,
    };
  } catch (e) {
    return { items: [], hasMore: false, total: null, error: (e as Error).message || "network" };
  }
}
