import "server-only";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { FEATURES, SUPPORT } from "@/config/site";

/**
 * Admin-editable app settings (public.app_settings, public read). Read with a cookie-less client through the data
 * cache (60 s, tag APP_SETTINGS_TAG) so ISR pages stay static; the admin settings action expires the tag.
 */
export const APP_SETTINGS_TAG = "app-settings";

export type AppSettings = {
  businessApplications: boolean;
  maintenanceBanner: string;
  supportPhone: string;
  supportEmail: string;
  listingDays: number;
  firstListingsModerated: number;
  maxProvidersDefault: number;
  analyticsRetentionDays: number;
  dutyDataMode: string;
  otpDemoMode: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
  businessApplications: FEATURES.businessApplications,
  maintenanceBanner: "",
  supportPhone: SUPPORT.phone,
  supportEmail: SUPPORT.email,
  listingDays: 30,
  firstListingsModerated: 3,
  maxProvidersDefault: 5,
  analyticsRetentionDays: 180,
  dutyDataMode: "demo",
  otpDemoMode: false,
};

const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);

export const getAppSettings = cache(async (): Promise<AppSettings> => {
  try {
    const client = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, next: { revalidate: 60, tags: [APP_SETTINGS_TAG] } }) },
    });
    const { data, error } = await client.from("app_settings").select("key,value");
    if (error || !data) return DEFAULT_SETTINGS;
    const m = new Map(data.map((r) => [r.key, r.value as unknown]));
    const d = DEFAULT_SETTINGS;
    return {
      businessApplications: bool(m.get("feature_business_applications"), d.businessApplications),
      maintenanceBanner: str(m.get("maintenance_banner"), d.maintenanceBanner).trim(),
      supportPhone: str(m.get("support_phone"), d.supportPhone),
      supportEmail: str(m.get("support_email"), d.supportEmail),
      listingDays: num(m.get("listing_days"), d.listingDays),
      firstListingsModerated: num(m.get("first_listings_moderated"), d.firstListingsModerated),
      maxProvidersDefault: num(m.get("max_providers_default"), d.maxProvidersDefault),
      analyticsRetentionDays: num(m.get("analytics_retention_days"), d.analyticsRetentionDays),
      dutyDataMode: str(m.get("duty_data_mode"), d.dutyDataMode),
      otpDemoMode: bool(m.get("otp_demo_mode"), d.otpDemoMode),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
});

/** "0850 123 45 67" / "+908501234567" -> "+908501234567" (null when invalid). */
export function normalizeTrPhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  const national = digits.startsWith("90") ? digits.slice(2) : digits.startsWith("0") ? digits.slice(1) : digits;
  return /^[2-9]\d{9}$/.test(national) ? `+90${national}` : null;
}

/** "+908501234567" -> "0850 123 45 67" */
export function displayTrPhone(e164: string): string {
  const n = e164.replace(/^\+90/, "");
  return n.length === 10 ? `0${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6, 8)} ${n.slice(8)}` : e164;
}
