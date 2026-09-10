/**
 * App-level domain types used by the shell. They mirror the expected DB rows but stay decoupled from the
 * generated `Database` type so the shell compiles regardless of schema generation timing.
 */

export type UserRole = "user" | "admin";

/** Row of public.profiles (1:1 with auth.users). */
export type Profile = {
  id: string;
  phone: string | null;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  neighbourhood_id: string | number | null;
  role: UserRole | string;
  onboarded: boolean;
  kvkk_accepted_at: string | null;
  marketing_consent: boolean | null;
  created_at?: string | null;
};

/** Row of public.neighbourhoods. */
export type Neighbourhood = {
  id: string | number;
  name: string;
  slug?: string | null;
  district?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export type BusinessStatus = "pending" | "approved" | "rejected" | "suspended";

/** Minimal business info used by guards and the profile screen. */
export type BusinessSummary = {
  id: string;
  slug: string | null;
  name: string;
  status: BusinessStatus | string;
  owner_id?: string | null;
  logo_url?: string | null;
  /** Roles of the business: 'service_provider' | 'shop' | 'employer' (businesses.kinds). */
  kinds?: string[] | null;
};

/** businesses.kinds values. */
export type BusinessKind = "service_provider" | "shop" | "employer";

/** Generic target reference for favorites/reports/contact events. */
export type TargetType = "listing" | "job" | "business" | "place" | "pharmacy" | "service_request" | "lead" | "review" | "user";

export type NotificationPayload = {
  type: string;
  title: string;
  body: string;
  /** Internal path (use core/routes builders). */
  link?: string | null;
};
