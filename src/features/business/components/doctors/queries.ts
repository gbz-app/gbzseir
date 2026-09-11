import "server-only";
import { cache } from "react";
import { trCompare } from "@/core/tr";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "../../lib/public-client";
import { DOCTOR_BRANCHES, DOCTOR_COLUMNS, toDoctor, type DirectoryDoctor, type Doctor, type DoctorBranch, type RawDoctor } from "./doctor-meta";

export type { DirectoryDoctor };

/** Branch vocabulary in order (inactive rows too: they still label older rows); the built-in list when unreadable. Never throws. */
export const getDoctorBranches = cache(async (): Promise<readonly DoctorBranch[]> => {
  try {
    const { data, error } = await createPublicClient().from("doctor_branches").select("key,label,icon,active").order("sort").order("label");
    if (error || !data?.length) return DOCTOR_BRANCHES;
    return data.map((r) => ({ key: r.key, label: r.label, icon: r.icon || null, active: r.active }));
  } catch {
    return DOCTOR_BRANCHES;
  }
});

/** Active doctors of a public business, in the owner's order (anon client, ISR friendly). */
export const getBusinessDoctors = cache(async (businessId: string): Promise<Doctor[]> => {
  const { data, error } = await createPublicClient()
    .from("business_staff")
    .select(DOCTOR_COLUMNS)
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("sort")
    .order("name");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as RawDoctor[]).map(toDoctor);
});

/** Every doctor of an owned business (hidden ones too), read with the owner's session. */
export async function getOwnerDoctors(businessId: string): Promise<Doctor[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("business_staff").select(DOCTOR_COLUMNS).eq("business_id", businessId).order("sort").order("name");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as RawDoctor[]).map(toDoctor);
}

/** Card columns of the Keşfet list: no bio or hours note (the card does not show them; the profile page does). */
const DIRECTORY_COLUMNS = "id,slug,business_id,name,title,branch,photo_url,days,sort,is_active,is_demo";

type RawDirectoryDoctor = Omit<RawDoctor, "bio" | "hours_note"> & {
  businesses: { slug: string; name: string; is_demo: boolean | null; neighbourhoods: { name: string } | null } | null;
};

/** Active doctors of every public sağlık business: real ones first, then by name. Anon client (RLS: public businesses only). */
export const listSaglikDoctors = cache(async (): Promise<DirectoryDoctor[]> => {
  const { data, error } = await createPublicClient()
    .from("business_staff")
    .select(`${DIRECTORY_COLUMNS},businesses!inner(slug,name,is_demo,neighbourhoods!businesses_neighbourhood_id_fkey(name))`)
    .eq("is_active", true)
    .eq("businesses.vertical", "saglik")
    .eq("businesses.status", "approved")
    .order("name")
    .limit(600);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as RawDirectoryDoctor[])
    .filter((r) => r.businesses)
    .map((r) => ({
      ...toDoctor({ ...r, bio: null, hours_note: null }),
      clinic: {
        slug: r.businesses!.slug,
        name: r.businesses!.name,
        neighbourhood_name: r.businesses!.neighbourhoods?.name ?? null,
        is_demo: r.businesses!.is_demo === true,
      },
    }))
    .sort((a, b) => Number(a.is_demo) - Number(b.is_demo) || trCompare(a.name, b.name));
});

/** Profile page data (/doktor/<slug>): the doctor and the clinic they work at. Serializable. */
export type DoctorProfile = Doctor & {
  slug: string;
  clinic: {
    id: string;
    slug: string;
    name: string;
    logo_url: string | null;
    /** Clinic phone (doctors have none); sample clinics' numbers are placeholders and never shown. */
    phone: string | null;
    address: string | null;
    lat: number | null;
    lng: number | null;
    /** public.districts id (config/districts.ts). */
    district_id: string | null;
    verified: boolean;
    is_demo: boolean;
  };
};

type RawProfile = RawDoctor & {
  businesses: {
    id: string;
    slug: string;
    name: string;
    logo_url: string | null;
    phone: string | null;
    address: string | null;
    lat: number | null;
    lng: number | null;
    district_id: string | null;
    verification_level: number | null;
    is_demo: boolean | null;
  } | null;
};

const PROFILE_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Active doctor of an approved clinic by profile slug; null = not found (anon client: RLS also hides hidden doctors and
 * clinics that are not public, e.g. a banned owner's). ISR friendly.
 */
export const getDoctorBySlug = cache(async (slug: string): Promise<DoctorProfile | null> => {
  if (!slug || slug.length > 100 || !PROFILE_SLUG.test(slug)) return null;
  const { data, error } = await createPublicClient()
    .from("business_staff")
    .select(`${DOCTOR_COLUMNS},businesses!inner(id,slug,name,logo_url,phone,address,lat,lng,district_id,verification_level,is_demo)`)
    .eq("slug", slug)
    .eq("is_active", true)
    .eq("businesses.status", "approved")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const raw = data as unknown as RawProfile | null;
  const b = raw?.businesses;
  if (!raw || !b) return null;
  return {
    ...toDoctor(raw),
    slug,
    clinic: {
      id: b.id,
      slug: b.slug,
      name: b.name,
      logo_url: b.logo_url,
      phone: b.phone,
      address: b.address,
      lat: b.lat,
      lng: b.lng,
      district_id: b.district_id,
      verified: (b.verification_level ?? 0) >= 1,
      is_demo: b.is_demo === true,
    },
  };
});
