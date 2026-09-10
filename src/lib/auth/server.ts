import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { routes } from "@/core/routes";
import type { BusinessSummary, Profile } from "@/lib/types";

/**
 * Authenticated user for this request (validated with the Auth server; deduped per request).
 * Calling this makes the route dynamic (reads cookies).
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user ?? null;
});

/** Current user's profile row or null (guest / missing row). */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return (data as Profile | null) ?? null;
});

/** Redirect guests to /giris?next=<nextPath>. Returns the user otherwise. */
export async function requireAuth(nextPath: string): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.auth.login(nextPath));
  return user;
}

/**
 * Like requireAuth, and also sends users who have not completed onboarding to /giris/profil?next=...
 */
export async function requireProfile(nextPath: string): Promise<{ user: User; profile: Profile }> {
  const user = await requireAuth(nextPath);
  const profile = await getProfile();
  if (!profile || !profile.onboarded) redirect(routes.auth.profile(nextPath));
  return { user, profile };
}

/**
 * Admin guard: guests are sent to the login screen (and come back to /admin); signed-in non-admins get a 404
 * (the admin area is not advertised).
 */
export async function requireAdmin(nextPath: string = routes.admin.root()): Promise<{ user: User; profile: Profile }> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.auth.login(nextPath));
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") notFound();
  return { user, profile };
}

/** Businesses owned by the current user (empty for guests / non-business users). */
export const getMyBusinesses = cache(async (): Promise<BusinessSummary[]> => {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("businesses").select("*").eq("owner_id", user.id);
  if (error || !data) return [];
  return data as BusinessSummary[];
});

/** True if the user owns at least one business (any status unless approvedOnly). */
export async function isBusinessOwner(opts: { approvedOnly?: boolean } = {}): Promise<boolean> {
  const list = await getMyBusinesses();
  return list.some((b) => !opts.approvedOnly || b.status === "approved");
}

/** Approved business of the current user or redirect (to login / to the business intro page). */
export async function requireApprovedBusiness(nextPath: string): Promise<{ user: User; business: BusinessSummary }> {
  const user = await requireAuth(nextPath);
  const business = (await getMyBusinesses()).find((b) => b.status === "approved");
  if (!business) redirect(routes.business.intro());
  return { user, business };
}
