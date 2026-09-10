/**
 * Single place for the table / RPC names the app shell talks to (kept in sync with supabase/migrations).
 * If the DB contract changes, fix it here instead of hunting through components.
 */

export const TABLES = {
  profiles: "profiles",
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
} as const;

/** Allowed by log_contact_event (p_event). */
export type ContactEventKind = "call_click" | "phone_reveal" | "directions";
/** Allowed by log_contact_event (p_subject_type). Pharmacies, mosques, stops and places are all 'poi'. */
export type ContactSubjectType = "listing" | "job" | "business" | "poi" | "lead";

/** favorites.target_type (check constraint). */
export type FavoriteTargetType = "listing" | "business" | "poi";
/** reports.target_type (check constraint). */
export type ReportTargetType = "listing" | "business" | "review" | "user";
/** reports.reason (check constraint). */
export type ReportReasonValue = "dolandiricilik" | "yanlis_kategori" | "uygunsuz" | "yaniltici" | "diger";

/** reveal_listing_phone result (jsonb). */
export type RevealPhoneResult =
  | { ok: true; phone: string; display_name?: string | null }
  | { ok: false; reason: "not_found" | "rate_limited" | "login_required" | "no_phone" | string };

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
