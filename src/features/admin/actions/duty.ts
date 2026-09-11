"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { routes } from "@/core/routes";
import { revalidatePublic } from "@/lib/revalidate-public";
import { dbFail, withAdmin } from "../server/guard";
import { fail, ok, type ActionResult } from "../lib/action-result";
import { firstIssue, zId } from "../lib/zod";

const schema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Geçerli bir gün seç."),
  poiIds: z.array(zId).max(100, "Bir güne en fazla 100 eczane girilebilir."),
});

export type SaveDutyResult = { count: number; written: number; removed: number };

/**
 * Saves the admin's duty list of one duty day (08:30 -> 08:30) with source 'manual'. It replaces that day's real rows
 * (sample rows stay) and the automatic import no longer changes the day. An empty list clears the day.
 */
export async function saveDutyListAction(input: z.input<typeof schema>): Promise<ActionResult<SaveDutyResult>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const { data, error } = await supabase.rpc("admin_set_duty", {
      p_day: parsed.data.day,
      p_poi_ids: [...new Set(parsed.data.poiIds)],
    });
    if (error) return dbFail(error);
    const r: SaveDutyResult = { count: 0, written: 0, removed: 0, ...((data ?? {}) as Partial<SaveDutyResult>) };
    await revalidatePublic({ tags: ["duty", "nearby"], paths: [routes.nearby.dutyPharmacies(), routes.home(), routes.nearby.root()] });
    revalidatePath(routes.admin.duty());
    return ok(r, r.count ? `Nöbet listesi kaydedildi (${r.count} eczane).` : "Günün nöbet listesi temizlendi.");
  });
}
