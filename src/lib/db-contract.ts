/**
 * Single place for the table / RPC names the app shell talks to (kept in sync with supabase/migrations).
 * If the DB contract changes, fix it here instead of hunting through components.
 */

export const TABLES = {
  profiles: "profiles",
  /** Kocaeli districts (id = slug, e.g. "gebze"); read-only for clients. */
  districts: "districts",
  /** Legacy (phase C drops it); new code uses districts. */
  neighbourhoods: "neighbourhoods",
  notifications: "notifications",
  pushSubscriptions: "push_subscriptions",
  favorites: "favorites",
  reports: "reports",
  businesses: "businesses",
} as const;

export const RPC = {
  /** get_demo_otp(p_phone text) -> latest captured OTP code (demo mode only). */
  getDemoOtp: "get_demo_otp",
  /** log_contact_event(p_subject_type text, p_subject_id text, p_event text) */
  logContactEvent: "log_contact_event",
  /** reveal_listing_phone(p_listing_id uuid) -> phone (E.164) ; rate limited + logged server side. */
  revealListingPhone: "reveal_listing_phone",
  /** reveal_event_phone(p_event uuid) -> phone of a user event (signed-in only; rate limited + logged server side). */
  revealEventPhone: "reveal_event_phone",
} as const;

/** Allowed by log_contact_event (p_event). */
export type ContactEventKind = "call_click" | "phone_reveal" | "directions";
/** Allowed by log_contact_event (p_subject_type). Pharmacies, mosques, stops and places are all 'poi'; events without a business are 'event'. */
export type ContactSubjectType = "listing" | "job" | "business" | "poi" | "lead" | "event";

/** favorites.target_type (check constraint). */
export type FavoriteTargetType = "listing" | "business" | "poi";
/** reports.target_type (check constraint). */
export type ReportTargetType = "listing" | "business" | "review" | "user" | "event";
/** reports.reason (check constraint). */
export type ReportReasonValue = "dolandiricilik" | "yanlis_kategori" | "uygunsuz" | "yaniltici" | "diger";

/** reveal_listing_phone result (jsonb). */
export type RevealPhoneResult =
  | { ok: true; phone: string; display_name?: string | null }
  | { ok: false; reason: "not_found" | "rate_limited" | "login_required" | "no_phone" | string };

/** admin_data_health().districts (2026091386). Counts are every row of the table (any status, demo included). */
export type AdminDistrictHealth = {
  /** One entry per district, districts.sort order; boundary = its polygon is loaded; users = profiles with that home district. */
  rows: Array<{
    id: string;
    name: string;
    active: boolean;
    boundary: boolean;
    businesses: number;
    listings: number;
    events: number;
    poi: number;
    requests: number;
    users: number;
  }>;
  /** Rows without district_id (should stay 0: the zz_fill_district triggers fill them). */
  missing: Record<"businesses" | "listings" | "events" | "poi" | "requests", number>;
  /** Profiles without a home district (optional, not an error). */
  users_without_district: number;
};

/** admin_user_overview().districts (2026091386): the user's own rows per district, most first; id/name null = no district. */
export type AdminUserDistrictRow = {
  id: string | null;
  name: string | null;
  listings: number;
  businesses: number;
  requests: number;
  events: number;
};

export const rpcArgs = {
  getDemoOtp: (phone: string) => ({ p_phone: phone }),
  logContactEvent: (subjectType: ContactSubjectType, subjectId: string, event: ContactEventKind) => ({
    p_subject_type: subjectType,
    p_subject_id: subjectId,
    p_event: event,
  }),
  revealListingPhone: (listingId: string) => ({ p_listing_id: listingId }),
} as const;

/** Public storage bucket for user media (avatars, listing & business photos). Path: <uid>/<folder>/<uuid>.webp */
export const STORAGE_BUCKETS = { media: "media" } as const;
