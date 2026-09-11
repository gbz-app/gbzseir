import "server-only";
import { cache } from "react";
import { KOCAELI_DISTRICTS, type DistrictSlug } from "@/config/districts";
import { trCompare } from "@/core/tr";
import type { BusinessKind } from "@/lib/types";
import { parseKinds } from "./kinds";
import { createPublicClient } from "./public-client";

/**
 * PUBLIC business queries (anon client, no cookies -> ISR friendly). RLS limits them to approved businesses.
 * Never select the geography column `location`; lat/lng are generated columns.
 */

export const PUBLIC_BUSINESS_COLUMNS =
  "id,slug,name,logo_url,cover_url,description,phone,address,lat,lng,district_id,kinds,category_label,working_hours,verification_level,vacation_mode,vacation_until,rating_avg,rating_count,leads_accepted_count,created_at,updated_at,approved_at,vertical,price_level,star_rating,amenities,website,instagram,is_demo";

/** Service districts in the display order of config/districts.ts (unknown ids dropped). */
function sortDistricts(ids: readonly string[]): DistrictSlug[] {
  return KOCAELI_DISTRICTS.filter((d) => ids.includes(d.slug)).map((d) => d.slug);
}

export type ServiceCategoryLite = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  icon: string | null;
  sort: number;
};

export type PublicBusiness = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  cover_url: string | null;
  description: string | null;
  phone: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  /** public.districts id (config/districts.ts). */
  district_id: string | null;
  kinds: BusinessKind[];
  category_label: string | null;
  working_hours: unknown;
  verification_level: number;
  vacation_mode: boolean;
  /** Tatil modu return date; use isOnVacation() (lib/hours) for the active state. */
  vacation_until: string | null;
  rating_avg: number;
  rating_count: number;
  leads_accepted_count: number;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  vertical: string | null;
  price_level: number | null;
  star_rating: number | null;
  amenities: string[];
  website: string | null;
  instagram: string | null;
  /** Sample (seed) business: labelled "Örnek", not callable, no JSON-LD. */
  is_demo: boolean;
};

export type BusinessPhoto = { id: string; url: string; sort: number };

export type BusinessDetail = PublicBusiness & {
  categories: ServiceCategoryLite[];
  /** Districts a service firm travels to (business_service_districts), in display order. */
  service_district_ids: DistrictSlug[];
  photos: BusinessPhoto[];
};

type RawDetail = Omit<PublicBusiness, "kinds" | "rating_avg" | "amenities"> & {
  kinds: string[] | null;
  rating_avg: number | string | null;
  amenities: string[] | null;
  business_service_categories: Array<{ service_categories: ServiceCategoryLite | null }> | null;
  business_service_districts: Array<{ district_id: string }> | null;
  business_photos: BusinessPhoto[] | null;
};

function toNumber(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : 0;
  return Number.isFinite(n) ? n : 0;
}

/** Active service categories (top level + sub), sorted. Deduped per request. */
export const getServiceCategories = cache(async (): Promise<ServiceCategoryLite[]> => {
  const { data, error } = await createPublicClient()
    .from("service_categories")
    .select("id,name,slug,parent_id,icon,sort")
    .eq("active", true)
    .order("sort")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as ServiceCategoryLite[];
});

/** Approved business by slug with categories, service districts and portfolio. null = not found / not public. */
export const getPublicBusinessBySlug = cache(async (slug: string): Promise<BusinessDetail | null> => {
  const { data, error } = await createPublicClient()
    .from("businesses")
    .select(
      `${PUBLIC_BUSINESS_COLUMNS},business_service_categories(service_categories(id,name,slug,parent_id,icon,sort)),business_service_districts(district_id),business_photos(id,url,sort)`,
    )
    .eq("slug", slug)
    .eq("status", "approved")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const raw = data as unknown as RawDetail;
  const { business_service_categories, business_service_districts, business_photos, ...rest } = raw;
  return {
    ...rest,
    kinds: parseKinds(raw.kinds),
    rating_avg: toNumber(raw.rating_avg),
    amenities: raw.amenities ?? [],
    is_demo: raw.is_demo === true,
    categories: (business_service_categories ?? [])
      .map((x) => x.service_categories)
      .filter((c): c is ServiceCategoryLite => !!c)
      .sort((a, b) => a.sort - b.sort || trCompare(a.name, b.name)),
    service_district_ids: sortDistricts((business_service_districts ?? []).map((x) => x.district_id)),
    photos: [...(business_photos ?? [])].sort((a, b) => a.sort - b.sort),
  };
});

export type PublicReview = {
  id: string;
  /** Author's user id (already public on reviews): lets the page hide "Şikayet et" on the viewer's own review. */
  author_id: string | null;
  rating: number;
  comment: string | null;
  reply: string | null;
  replied_at: string | null;
  created_at: string;
  author_name: string | null;
};

type RawReview = Omit<PublicReview, "author_name"> & { author: { display_name: string | null } | null };

/** Latest reviews of a business with the public author name ('Ayşe Y.'). */
export async function getBusinessReviews(businessId: string, limit = 30): Promise<PublicReview[]> {
  const { data, error } = await createPublicClient()
    .from("reviews")
    .select("id,author_id,rating,comment,reply,replied_at,created_at,author:public_profiles!reviews_author_id_fkey(display_name)")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as RawReview[]).map(({ author, ...r }) => ({ ...r, author_name: author?.display_name ?? null }));
}

export type BusinessListing = {
  id: string;
  type: "classified" | "job";
  title: string;
  price_try: number | null;
  job_salary_min: number | null;
  job_salary_max: number | null;
  job_salary_hidden: boolean;
  job_work_type: string | null;
  job_location_label: string | null;
  published_at: string | null;
  thumb_url: string | null;
};

type RawListing = Omit<BusinessListing, "thumb_url" | "type"> & {
  type: string;
  listing_media: Array<{ url: string; thumb_url: string | null; sort: number }> | null;
};

/** Active (not expired) listings and job posts published by the business. */
export async function getBusinessActiveListings(businessId: string, limit = 20): Promise<BusinessListing[]> {
  const { data, error } = await createPublicClient()
    .from("listings")
    .select(
      "id,type,title,price_try,job_salary_min,job_salary_max,job_salary_hidden,job_work_type,job_location_label,published_at,listing_media(url,thumb_url,sort)",
    )
    .eq("business_id", businessId)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as RawListing[]).map(({ listing_media, ...l }) => {
    const cover = [...(listing_media ?? [])].sort((a, b) => a.sort - b.sort)[0];
    return { ...l, type: l.type === "job" ? "job" : "classified", thumb_url: cover ? (cover.thumb_url ?? cover.url) : null };
  });
}

export type DirectoryBusiness = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  cover_url: string | null;
  category_label: string | null;
  kinds: BusinessKind[];
  lat: number | null;
  lng: number | null;
  rating_avg: number;
  rating_count: number;
  verification_level: number;
  vacation_mode: boolean;
  /** Tatil modu return date; use isOnVacation() (lib/hours) for the active state. */
  vacation_until: string | null;
  /** public.districts id (config/districts.ts). */
  district_id: string | null;
  category_ids: string[];
  photo_count: number;
  has_description: boolean;
  has_hours: boolean;
  is_demo: boolean;
};

type RawDirectory = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  cover_url: string | null;
  category_label: string | null;
  kinds: string[] | null;
  lat: number | null;
  lng: number | null;
  rating_avg: number | string | null;
  rating_count: number | null;
  verification_level: number | null;
  vacation_mode: boolean | null;
  vacation_until: string | null;
  description: string | null;
  working_hours: unknown;
  is_demo: boolean | null;
  district_id: string | null;
  business_service_categories: Array<{ category_id: string }> | null;
  business_photos: Array<{ count: number }> | null;
};

/** All approved businesses for the directory / home rail (best rated first). */
export const listApprovedBusinesses = cache(async (limit = 500): Promise<DirectoryBusiness[]> => {
  const { data, error } = await createPublicClient()
    .from("businesses")
    .select(
      "id,slug,name,logo_url,cover_url,category_label,kinds,lat,lng,rating_avg,rating_count,verification_level,vacation_mode,vacation_until,description,working_hours,is_demo,district_id,business_service_categories(category_id),business_photos(count)",
    )
    .eq("status", "approved")
    .order("rating_avg", { ascending: false })
    .order("rating_count", { ascending: false })
    .order("name")
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as RawDirectory[]).map((b) => ({
    id: b.id,
    slug: b.slug,
    name: b.name,
    logo_url: b.logo_url,
    cover_url: b.cover_url,
    category_label: b.category_label,
    kinds: parseKinds(b.kinds),
    lat: b.lat,
    lng: b.lng,
    rating_avg: toNumber(b.rating_avg),
    rating_count: b.rating_count ?? 0,
    verification_level: b.verification_level ?? 0,
    vacation_mode: !!b.vacation_mode,
    vacation_until: b.vacation_until ?? null,
    district_id: b.district_id ?? null,
    category_ids: (b.business_service_categories ?? []).map((c) => c.category_id),
    photo_count: b.business_photos?.[0]?.count ?? 0,
    has_description: !!b.description && b.description.trim().length >= 30,
    has_hours: !!b.working_hours && typeof b.working_hours === "object" && Object.values(b.working_hours as object).some(Boolean),
    is_demo: b.is_demo === true,
  }));
});

/**
 * Tatil modu fields of the given approved businesses (id -> fields), for firm lists fed by other features
 * (e.g. /hizmetler/[kategori]). Empty map on error: the rows then simply show no "Tatilde".
 */
export async function getVacationStates(ids: string[]): Promise<Map<string, { vacation_mode: boolean; vacation_until: string | null }>> {
  const out = new Map<string, { vacation_mode: boolean; vacation_until: string | null }>();
  if (ids.length === 0) return out;
  const { data, error } = await createPublicClient().from("businesses").select("id,vacation_mode,vacation_until").in("id", ids);
  if (error) return out;
  for (const b of (data ?? []) as unknown as Array<{ id: string; vacation_mode: boolean | null; vacation_until: string | null }>) {
    out.set(b.id, { vacation_mode: !!b.vacation_mode, vacation_until: b.vacation_until ?? null });
  }
  return out;
}
