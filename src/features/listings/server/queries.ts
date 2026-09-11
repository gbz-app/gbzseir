import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getRememberedBusinessId } from "@/lib/auth/server";
import { pickActiveBusiness } from "@/features/business/lib/active-business";
import type { ListingType } from "../constants";
import { isUuid } from "../format";
import { CARD_SELECT } from "../search";
import {
  toCardData,
  toCategory,
  toListingDetail,
  toMyListingRow,
  type ListingCardData,
  type ListingCategory,
  type ListingDetail,
  type MyListingRow,
} from "../types";
import { createPublicClient } from "./public-client";

type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Reference data (cached, public)
// ---------------------------------------------------------------------------

/** Non-banned listing categories (2. el + job sectors), sorted. Banned categories are never returned. */
export const getListingCategories = unstable_cache(
  async (): Promise<ListingCategory[]> => {
    const { data, error } = await createPublicClient()
      .from("listing_categories")
      .select("id,type,parent_id,name,slug,icon,sort,attributes_schema")
      .eq("is_banned", false)
      .order("sort", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Row[]).map(toCategory);
  },
  ["listings:categories:v1"],
  { revalidate: 3600, tags: ["listing-categories"] },
);

export async function safeCategories(): Promise<ListingCategory[]> {
  try {
    return await getListingCategories();
  } catch {
    return [];
  }
}

/** Newest live listings for the home widgets (cached 2 minutes). */
export const getLatestListings = unstable_cache(
  async (type: ListingType, limit: number): Promise<ListingCardData[]> => {
    const { data, error } = await createPublicClient()
      .rpc("search_listings", { p_type: type, p_sort: "newest" })
      .select(CARD_SELECT)
      .range(0, Math.max(0, limit - 1));
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Row[]).map(toCardData);
  },
  ["listings:latest:v1"],
  { revalidate: 120, tags: ["listings"] },
);

// ---------------------------------------------------------------------------
// Detail (cookie-aware: owners also see their own non-public listings)
// ---------------------------------------------------------------------------

const DETAIL_SELECT =
  "id,type,owner_id,business_id,category_id,title,description,price_try,attributes,district_id,status,rejection_reason,expires_at,published_at,created_at,updated_at,view_count,call_count,job_work_type,job_salary_min,job_salary_max,job_salary_hidden,job_experience,job_benefits,job_location_label,is_demo,owner:public_profiles(display_name,created_at),business:businesses(name,phone,slug,logo_url,verification_level),listing_categories(name,slug,parent_id,attributes_schema),listing_media(id,url,thumb_url,sort),listing_videos(url,poster_url,duration_s)";

/** One listing (deduped per request between generateMetadata and the page). Null when missing or not visible. */
export const getListingDetail = cache(async (id: string): Promise<ListingDetail | null> => {
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("listings").select(DETAIL_SELECT).eq("id", id).maybeSingle();
  if (error) {
    if (error.code === "22P02" || error.code === "PGRST116") return null;
    throw new Error(error.message);
  }
  return data ? toListingDetail(data as unknown as Row) : null;
});

/** The signed-in owner's listing (any status), for the edit wizard and the result page. */
export async function getOwnListing(userId: string, id: string): Promise<ListingDetail | null> {
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("listings").select(DETAIL_SELECT).eq("id", id).eq("owner_id", userId).maybeSingle();
  if (error || !data) return null;
  return toListingDetail(data as unknown as Row);
}

// ---------------------------------------------------------------------------
// Owner lists
// ---------------------------------------------------------------------------

const MY_SELECT =
  "id,type,title,status,price_try,rejection_reason,expires_at,published_at,created_at,view_count,call_count,job_salary_min,job_salary_max,job_salary_hidden,job_location_label,district_id,listing_media(url,thumb_url,sort)";

export async function getMyListings(userId: string, type: ListingType): Promise<{ rows: MyListingRow[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listings")
    .select(MY_SELECT)
    .eq("owner_id", userId)
    .eq("type", type)
    .neq("status", "deleted")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return { rows: [], error: error.message };
  return { rows: ((data ?? []) as unknown as Row[]).map(toMyListingRow), error: null };
}

export type MyBusiness = {
  id: string;
  name: string;
  slug: string | null;
  logo_url: string | null;
  phone: string | null;
  verification_level: number;
  /** District slug of the business (default district of its job ads). */
  district_id: string | null;
  status: string;
};

/**
 * The user's business for job ads (any status). An owner can have several: `businessId` when the user owns it,
 * else the one active in the business panel (approved ones first), else the oldest.
 */
export async function getMyBusiness(userId: string, businessId?: string | null): Promise<MyBusiness | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("businesses")
    .select("id,name,slug,logo_url,phone,verification_level,district_id,status")
    .eq("owner_id", userId)
    .order("created_at");
  if (error || !data?.length) return null;
  const approved = data.filter((b) => b.status === "approved");
  const pick = (businessId ? data.find((b) => b.id === businessId) : undefined) ?? pickActiveBusiness(approved.length ? approved : data, await getRememberedBusinessId());
  if (!pick) return null;
  return {
    id: pick.id,
    name: pick.name,
    slug: pick.slug,
    logo_url: pick.logo_url,
    phone: pick.phone,
    verification_level: pick.verification_level ?? 0,
    district_id: pick.district_id,
    status: pick.status,
  };
}
