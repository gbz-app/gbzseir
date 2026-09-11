import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import type { BusinessKind, BusinessStatus } from "@/lib/types";
import { ACTIVE_BUSINESS_COOKIE, pickActiveBusiness } from "./active-business";
import { parseKinds } from "./kinds";
import type { BusinessPhoto } from "./queries";
import { SERVICE_COLUMNS, toBusinessService, type BusinessService, type RawBusinessService } from "./service-catalog";
import { resolveVertical, type Vertical } from "./verticals";

/**
 * The signed-in owner's businesses (any status), read with the user's session (RLS: owner reads own).
 * An owner can have several (cafe + hotel + service firm); the panel works on the active one.
 * Never selects the geography column.
 */

const OWNER_COLUMNS =
  "id,owner_id,slug,name,logo_url,cover_url,description,phone,address,lat,lng,district_id,kinds,category_label,working_hours,status,rejection_reason,verification_level,vacation_mode,vacation_until,rating_avg,rating_count,leads_accepted_count,created_at,updated_at,approved_at,vertical,price_level,star_rating,amenities,website,instagram";

export type OwnerBusiness = {
  id: string;
  owner_id: string;
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
  status: BusinessStatus;
  rejection_reason: string | null;
  verification_level: number;
  vacation_mode: boolean;
  /** Tatil modu return date (00:00 Istanbul of the day back), null = open-ended. */
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
  category_ids: string[];
  /** Districts the business travels to (business_service_districts). */
  service_district_ids: string[];
  photos: BusinessPhoto[];
};

type Raw = Omit<OwnerBusiness, "kinds" | "status" | "rating_avg" | "amenities" | "category_ids" | "service_district_ids" | "photos"> & {
  kinds: string[] | null;
  amenities: string[] | null;
  status: string;
  rating_avg: number | string | null;
  business_service_categories: Array<{ category_id: string }> | null;
  business_service_districts: Array<{ district_id: string }> | null;
  business_photos: BusinessPhoto[] | null;
};

const STATUSES: BusinessStatus[] = ["pending", "approved", "rejected", "suspended"];

/** Light row for the business switcher and "switch to" hints. */
export type OwnerBusinessBrief = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  status: BusinessStatus;
  vertical: Vertical;
  kinds: BusinessKind[];
};

/** Every business of the signed-in user, oldest first (an owner can have several). Deduped per request. */
export const getOwnerBusinessList = cache(async (): Promise<OwnerBusinessBrief[]> => {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("businesses").select("id,slug,name,logo_url,status,vertical,kinds").eq("owner_id", user.id).order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map((b) => {
    const kinds = parseKinds(b.kinds);
    return {
      id: b.id,
      slug: b.slug,
      name: b.name,
      logo_url: b.logo_url,
      status: (STATUSES as string[]).includes(b.status) ? (b.status as BusinessStatus) : "pending",
      vertical: resolveVertical(b.vertical, kinds),
      kinds,
    };
  });
});

/** Id of the business the panel shows: the one remembered in the cookie (if still owned), else the first approved. */
export const getActiveBusinessId = cache(async (): Promise<string | null> => {
  const list = await getOwnerBusinessList();
  if (list.length === 0) return null;
  const remembered = (await cookies()).get(ACTIVE_BUSINESS_COOKIE)?.value;
  return pickActiveBusiness(list, remembered)?.id ?? null;
});

/** Other approved businesses of the owner that match `fits` (for "<name> işletmesine geç" hints on owner tools). */
export async function getOtherOwnedBusinesses(currentId: string, fits: (b: OwnerBusinessBrief) => boolean): Promise<OwnerBusinessBrief[]> {
  return (await getOwnerBusinessList()).filter((b) => b.id !== currentId && b.status === "approved" && fits(b));
}

/**
 * The active business of the current user with relations (or the given one, when the user owns it), null for guests
 * and users without a business. Deduped per request.
 */
export const getOwnerBusiness = cache(async (businessId?: string): Promise<OwnerBusiness | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const id = businessId ?? (await getActiveBusinessId());
  if (!id) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("businesses")
    .select(
      `${OWNER_COLUMNS},business_service_categories(category_id),business_service_districts(district_id),business_photos(id,url,sort)`,
    )
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const raw = data as unknown as Raw;
  const { business_service_categories, business_service_districts, business_photos, ...rest } = raw;
  const rating = typeof raw.rating_avg === "string" ? Number(raw.rating_avg) : (raw.rating_avg ?? 0);
  return {
    ...rest,
    kinds: parseKinds(raw.kinds),
    status: (STATUSES as string[]).includes(raw.status) ? (raw.status as BusinessStatus) : "pending",
    rating_avg: Number.isFinite(rating) ? rating : 0,
    amenities: raw.amenities ?? [],
    category_ids: (business_service_categories ?? []).map((c) => c.category_id),
    service_district_ids: (business_service_districts ?? []).map((d) => d.district_id),
    photos: [...(business_photos ?? [])].sort((a, b) => a.sort - b.sort),
  };
});

/** Full service catalog (hidden rows too) of an owned business, read with the owner's session. */
export async function getOwnerServices(businessId: string): Promise<BusinessService[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("business_services").select(SERVICE_COLUMNS).eq("business_id", businessId).order("sort");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as RawBusinessService[]).map(toBusinessService);
}
