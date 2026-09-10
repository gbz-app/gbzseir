"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { APP_SETTINGS_TAG, normalizeTrPhone } from "@/lib/app-settings";
import { routes } from "@/core/routes";
import { dbFail, withAdmin } from "../server/guard";
import { fail, ok, type ActionResult } from "../lib/action-result";
import { firstIssue } from "../lib/zod";

const int = (min: number, max: number, label: string) =>
  z.coerce.number().int(`${label} tam sayı olmalı.`).min(min, `${label} en az ${min} olmalı.`).max(max, `${label} en fazla ${max} olabilir.`);

const schema = z.object({
  businessApplications: z.boolean(),
  maintenanceBanner: z.string().trim().max(200, "Duyuru bandı en fazla 200 karakter olabilir."),
  supportPhone: z.string().trim().min(1, "Destek telefonu yaz."),
  supportEmail: z.string().trim().email("Geçerli bir e-posta yaz."),
  listingDays: int(1, 120, "İlan süresi"),
  firstListingsModerated: int(0, 50, "Onaya düşen ilk ilan sayısı"),
  maxProvidersDefault: int(1, 10, "Firma sayısı"),
  analyticsRetentionDays: int(30, 730, "Saklama süresi"),
});

/** Saves the editable app settings and refreshes every cached page that reads them. */
export async function saveSettingsAction(input: z.input<typeof schema>): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const v = parsed.data;
    const phone = normalizeTrPhone(v.supportPhone);
    if (!phone) return fail("Destek telefonu geçersiz. Örnek: 0850 123 45 67");
    const now = new Date().toISOString();
    const rows = [
      ["feature_business_applications", v.businessApplications],
      ["maintenance_banner", v.maintenanceBanner],
      ["support_phone", phone],
      ["support_email", v.supportEmail.toLowerCase()],
      ["listing_days", v.listingDays],
      ["first_listings_moderated", v.firstListingsModerated],
      ["max_providers_default", v.maxProvidersDefault],
      ["analytics_retention_days", v.analyticsRetentionDays],
    ] as const;
    const { error } = await supabase.from("app_settings").upsert(rows.map(([key, value]) => ({ key, value, updated_at: now })));
    if (error) return dbFail(error);
    updateTag(APP_SETTINGS_TAG);
    revalidatePath("/", "layout");
    revalidatePath(routes.admin.settings());
    return ok(null, "Ayarlar kaydedildi.");
  });
}
