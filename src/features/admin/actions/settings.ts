"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { APP_SETTINGS_TAG, isSupportPlaceholder, normalizeTrPhone } from "@/lib/app-settings";
import { revalidatePublic } from "@/lib/revalidate-public";
import { routes } from "@/core/routes";
import { dbFail, withAdmin } from "../server/guard";
import { fail, ok, type ActionResult } from "../lib/action-result";
import { firstIssue } from "../lib/zod";

const int = (min: number, max: number, label: string) =>
  z.coerce.number().int(`${label} tam sayı olmalı.`).min(min, `${label} en az ${min} olmalı.`).max(max, `${label} en fazla ${max} olabilir.`);

const schema = z.object({
  businessApplications: z.boolean(),
  businessMaxPerOwner: int(0, 20, "Hesap başına işletme sayısı"),
  maintenanceBanner: z.string().trim().max(200, "Duyuru bandı en fazla 200 karakter olabilir."),
  // Empty = unset: the contact card is hidden on the public pages.
  supportPhone: z.string().trim().max(30, "Destek telefonu çok uzun."),
  supportEmail: z
    .string()
    .trim()
    .max(120, "Destek e-postası çok uzun.")
    .refine((s) => s === "" || z.email().safeParse(s).success, "Geçerli bir e-posta yaz."),
  listingDays: int(1, 120, "İlan süresi"),
  firstListingsModerated: int(0, 50, "Onaya düşen ilk ilan sayısı"),
  listingDailyCap: int(0, 100, "Günlük ilan sınırı"),
  listingActiveCap: int(0, 1000, "Açık ilan sınırı"),
  maxProvidersDefault: int(1, 10, "Firma sayısı"),
  requestRedispatchHours: int(1, 72, "Yeniden gönderme süresi"),
  analyticsRetentionDays: int(30, 730, "Saklama süresi"),
  auditRetentionDays: int(30, 3650, "İşlem kaydı saklama süresi"),
  dutyDataMode: z.enum(["demo", "off", "live"], { message: "Nöbet listesi verisi için bir seçenek seç." }),
  // One term per line -> JSON array (duplicates ignored, case-insensitive); read by rpc popular_searches.
  popularSearches: z
    .string()
    .max(1000, "Popüler aramalar çok uzun.")
    .transform((s) => [
      ...new Map(
        s
          .split(/\r?\n/)
          .map((t) => t.replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .map((t) => [t.toLocaleLowerCase("tr-TR"), t] as const),
      ).values(),
    ])
    .refine((a) => a.every((t) => t.length >= 2 && t.length <= 40), "Popüler aramalar: her satır 2-40 karakter olmalı.")
    .refine((a) => a.length <= 12, "Popüler aramalar en fazla 12 satır olabilir."),
  // Words / phrases never shown from the logged searches (rpc popular_searches); one per line.
  popularSearchesHidden: z
    .string()
    .max(2000, "Gizlenen aramalar çok uzun.")
    .transform((s) => [
      ...new Map(
        s
          .split(/\r?\n/)
          .map((t) => t.replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .map((t) => [t.toLocaleLowerCase("tr-TR"), t] as const),
      ).values(),
    ])
    .refine((a) => a.every((t) => t.length >= 2 && t.length <= 60), "Gizlenen aramalar: her satır 2-60 karakter olmalı.")
    .refine((a) => a.length <= 100, "Gizlenen aramalar en fazla 100 satır olabilir."),
});

/** Saves the editable app settings and refreshes every cached page that reads them. */
export async function saveSettingsAction(input: z.input<typeof schema>): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const v = parsed.data;
    const phone = v.supportPhone ? normalizeTrPhone(v.supportPhone) : "";
    if (phone === null) return fail("Destek telefonu geçersiz. Örnek: 0850 123 45 67");
    const email = v.supportEmail.toLowerCase();
    if (isSupportPlaceholder(phone) || isSupportPlaceholder(email)) {
      return fail("Bu bir örnek iletişim bilgisi. Gerçek destek telefonunu ve e-postanı yaz ya da alanı boş bırak.");
    }
    const now = new Date().toISOString();
    const rows = [
      ["feature_business_applications", v.businessApplications],
      ["business_max_per_owner", v.businessMaxPerOwner],
      ["maintenance_banner", v.maintenanceBanner],
      ["support_phone", phone],
      ["support_email", email],
      ["listing_days", v.listingDays],
      ["first_listings_moderated", v.firstListingsModerated],
      ["listing_daily_cap", v.listingDailyCap],
      ["listing_active_cap", v.listingActiveCap],
      ["max_providers_default", v.maxProvidersDefault],
      ["request_redispatch_hours", v.requestRedispatchHours],
      ["analytics_retention_days", v.analyticsRetentionDays],
      ["audit_retention_days", v.auditRetentionDays],
      ["duty_data_mode", v.dutyDataMode],
      ["popular_searches", v.popularSearches],
      ["popular_searches_hidden", v.popularSearchesHidden],
    ] as const;
    const { error } = await supabase.from("app_settings").upsert(rows.map(([key, value]) => ({ key, value, updated_at: now })));
    if (error) return dbFail(error);
    // "duty": the cached duty RPC answers follow duty_data_mode.
    await revalidatePublic({ tags: [APP_SETTINGS_TAG, "duty"], paths: [{ path: "/", type: "layout" }] });
    revalidatePath(routes.admin.settings());
    return ok(null, "Ayarlar kaydedildi.");
  });
}
