"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { routes } from "@/core/routes";
import { BUSINESS_CACHE_TAG } from "./lib/cache-tags";

/**
 * Free user reviews of a business (one per user per business, editable): rpc submit_business_review /
 * delete_my_business_review. Expires the cached public firm page so the change shows right away.
 */

export type ReviewFailReason = "login_required" | "restricted" | "invalid_rating" | "not_found" | "own_business" | "invalid" | "error";

export type ReviewActionResult = { ok: true; message: string } | { ok: false; reason: ReviewFailReason; message: string };

const REASON_MESSAGES: Record<ReviewFailReason, string> = {
  login_required: "Yorum yazmak için giriş yapmalısın.",
  restricted: "Hesabın kısıtlandığı için şu an yorum yazamazsın.",
  invalid_rating: "Lütfen 1 ile 5 arasında bir puan seç.",
  not_found: "Bu işletme bulunamadı ya da artık yayında değil.",
  own_business: "Kendi işletmene yorum yazamazsın.",
  invalid: "Bilgileri kontrol edip tekrar dene.",
  error: "İşlem yapılamadı, lütfen tekrar dene.",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const zId = z.string().regex(UUID_RE);

const submitSchema = z.object({
  businessId: zId,
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

const deleteSchema = z.object({ businessId: zId });

function fail(reason: ReviewFailReason, message = REASON_MESSAGES[reason]): ReviewActionResult {
  return { ok: false, reason, message };
}

function isLoginError(error: { code?: string; hint?: string | null; message?: string }): boolean {
  return error.hint === "login_required" || error.code === "42501";
}

/** Expire the cached business data and the ISR firm page (slug looked up from the id, not trusted from the client). */
async function refreshFirmPage(supabase: Awaited<ReturnType<typeof createClient>>, businessId: string) {
  updateTag(BUSINESS_CACHE_TAG);
  const { data } = await supabase.from("businesses").select("slug").eq("id", businessId).maybeSingle();
  if (data?.slug) revalidatePath(routes.businesses.detail(data.slug));
}

/** Create or update the signed-in user's review (1-5 stars + optional comment, max 1000 characters). */
export async function submitBusinessReview(input: z.input<typeof submitSchema>): Promise<ReviewActionResult> {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) {
    return parsed.error.issues.some((i) => i.path[0] === "rating") ? fail("invalid_rating") : fail("invalid", "Yorumun en fazla 1000 karakter olabilir.");
  }
  const user = await getCurrentUser();
  if (!user) return fail("login_required");

  const { businessId, rating, comment } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_business_review", { p_business_id: businessId, p_rating: rating, p_comment: comment || undefined });
  if (error) return isLoginError(error) ? fail("login_required") : fail("error", "Yorumun kaydedilemedi, lütfen tekrar dene.");

  const res = data as { ok?: boolean; reason?: string } | null;
  if (!res?.ok) {
    const reason = res?.reason && res.reason in REASON_MESSAGES ? (res.reason as ReviewFailReason) : "error";
    return fail(reason);
  }
  await refreshFirmPage(supabase, businessId);
  return { ok: true, message: "Yorumun yayında. Teşekkürler!" };
}

/** Delete the signed-in user's own free review of the business (rating is recomputed in the RPC). */
export async function deleteMyBusinessReview(input: z.input<typeof deleteSchema>): Promise<ReviewActionResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const user = await getCurrentUser();
  if (!user) return fail("login_required");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_my_business_review", { p_business_id: parsed.data.businessId });
  if (error) return isLoginError(error) ? fail("login_required") : fail("error", "Yorumun silinemedi, lütfen tekrar dene.");
  if (!(data as { ok?: boolean } | null)?.ok) return fail("not_found", "Silinecek bir yorumun bulunamadı.");

  await refreshFirmPage(supabase, parsed.data.businessId);
  return { ok: true, message: "Yorumun silindi." };
}
