"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { routes } from "@/core/routes";
import { dbFail, withAdmin } from "../server/guard";
import { fail, ok, type ActionResult } from "../lib/action-result";
import { firstIssue, zId } from "../lib/zod";

function revalidateListing(id: string) {
  revalidatePath(routes.admin.listings());
  revalidatePath(routes.admin.root());
  revalidatePath(routes.listings.root());
  revalidatePath(routes.listings.classified(id));
  revalidatePath(routes.listings.job(id));
}

const reviewSchema = z.object({
  listingId: zId,
  approve: z.boolean(),
  reason: z.string().trim().max(280, "Gerekçe en fazla 280 karakter olabilir.").optional(),
});

/** Onayla / Reddet (admin_review_listing: notifies the owner, sets trusted publisher at >= 3 published). */
export async function reviewListingAction(input: z.input<typeof reviewSchema>): Promise<ActionResult<{ status: string }>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = reviewSchema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const { listingId, approve, reason } = parsed.data;
    if (!approve && !reason) return fail("Reddetmek için bir gerekçe seç.");
    const { data, error } = await supabase.rpc("admin_review_listing", {
      p_listing_id: listingId,
      p_approve: approve,
      ...(approve ? {} : { p_reason: reason }),
    });
    if (error) return dbFail(error);
    const res = data as { ok?: boolean; status?: string } | null;
    if (!res?.ok) return fail("İlan bulunamadı ya da silinmiş.", "not_found");
    revalidateListing(listingId);
    return ok({ status: res.status ?? "" }, approve ? "İlan onaylandı ve yayına alındı." : "İlan reddedildi; ilan sahibine bildirildi.");
  });
}

/** Kaldır: status -> deleted (no notification; used for clear abuse). */
export async function removeListingAction(input: { listingId: string }): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = z.object({ listingId: zId }).safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const { data, error } = await supabase
      .from("listings")
      .update({ status: "deleted" })
      .eq("id", parsed.data.listingId)
      .select("id")
      .maybeSingle();
    if (error) return dbFail(error);
    if (!data) return fail("İlan bulunamadı.", "not_found");
    revalidateListing(parsed.data.listingId);
    return ok(null, "İlan kaldırıldı.");
  });
}
