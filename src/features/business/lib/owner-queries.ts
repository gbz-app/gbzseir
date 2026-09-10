import "server-only";
import { cache } from "react";
import { getCurrentUser } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import type { BusinessKind, BusinessStatus } from "@/lib/types";
import { parseKinds } from "./kinds";
import type { BusinessPhoto } from "./queries";

/**
 * The signed-in owner's business (any status), read with the user's session (RLS: owner reads own).
 * Never selects the geography column.
 */

const OWNER_COLUMNS =
  "id,owner_id,slug,name,logo_url,cover_url,description,phone,address,lat,lng,neighbourhood_id,kinds,category_label,working_hours,status,rejection_reason,verification_level,vacation_mode,rating_avg,rating_count,leads_accepted_count,created_at,updated_at,approved_at,vertical,price_level,star_rating,amenities,website,instagram";

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
  neighbourhood_id: string | null;
  kinds: BusinessKind[];
  category_label: string | null;
  working_hours: unknown;
  status: BusinessStatus;
  rejection_reason: string | null;
  verification_level: number;
  vacation_mode: boolean;
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
  neighbourhood_name: string | null;
  category_ids: string[];
  area_ids: string[];
  photos: BusinessPhoto[];
};

type Raw = Omit<OwnerBusiness, "kinds" | "status" | "rating_avg" | "amenities" | "neighbourhood_name" | "category_ids" | "area_ids" | "photos"> & {
  kinds: string[] | null;
  amenities: string[] | null;
  status: string;
  rating_avg: number | string | null;
  neighbourhoods: { name: string } | null;
  business_service_categories: Array<{ category_id: string }> | null;
  business_service_areas: Array<{ neighbourhood_id: string }> | null;
  business_photos: BusinessPhoto[] | null;
};

const STATUSES: BusinessStatus[] = ["pending", "approved", "rejected", "suspended"];

/** Current user's business with relations, or null (guest / no business). Deduped per request. */
export const getOwnerBusiness = cache(async (): Promise<OwnerBusiness | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("businesses")
    .select(
      `${OWNER_COLUMNS},neighbourhoods!businesses_neighbourhood_id_fkey(name),business_service_categories(category_id),business_service_areas(neighbourhood_id),business_photos(id,url,sort)`,
    )
    .eq("owner_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const raw = data as unknown as Raw;
  const { neighbourhoods, business_service_categories, business_service_areas, business_photos, ...rest } = raw;
  const rating = typeof raw.rating_avg === "string" ? Number(raw.rating_avg) : (raw.rating_avg ?? 0);
  return {
    ...rest,
    kinds: parseKinds(raw.kinds),
    status: (STATUSES as string[]).includes(raw.status) ? (raw.status as BusinessStatus) : "pending",
    rating_avg: Number.isFinite(rating) ? rating : 0,
    amenities: raw.amenities ?? [],
    neighbourhood_name: neighbourhoods?.name ?? null,
    category_ids: (business_service_categories ?? []).map((c) => c.category_id),
    area_ids: (business_service_areas ?? []).map((a) => a.neighbourhood_id),
    photos: [...(business_photos ?? [])].sort((a, b) => a.sort - b.sort),
  };
});
