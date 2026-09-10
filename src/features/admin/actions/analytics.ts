"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { routes } from "@/core/routes";
import { dbFail, withAdmin } from "../server/guard";
import { fail, ok, type ActionResult } from "../lib/action-result";
import { firstIssue } from "../lib/zod";

const count = z.coerce.number().int("Tam sayı gir.").min(0, "Negatif olamaz.").max(1_000_000_000).nullable().optional();

const storeSchema = z.object({
  platform: z.enum(["google_play", "app_store"], { message: "Mağaza seç." }),
  statDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih seç."),
  downloads: count,
  activeInstalls: count,
  rating: z.coerce.number().min(0).max(5, "Puan 0-5 arası olmalı.").nullable().optional(),
  ratingsCount: count,
  reviewsCount: count,
  note: z.string().trim().max(300, "Not en fazla 300 karakter olabilir.").optional(),
});

/** Google Play / App Store daily numbers (manual until the store APIs are connected). Upsert per store + date. */
export async function saveStoreStatAction(input: z.input<typeof storeSchema>): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = storeSchema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const v = parsed.data;
    const { error } = await supabase.from("store_stats").upsert(
      {
        platform: v.platform,
        stat_date: v.statDate,
        downloads: v.downloads ?? null,
        active_installs: v.activeInstalls ?? null,
        rating: v.rating ?? null,
        ratings_count: v.ratingsCount ?? null,
        reviews_count: v.reviewsCount ?? null,
        note: v.note || null,
      },
      { onConflict: "platform,stat_date" },
    );
    if (error) return dbFail(error);
    revalidatePath(routes.admin.analytics());
    revalidatePath(routes.admin.root());
    return ok(null, "Mağaza verisi kaydedildi.");
  });
}
