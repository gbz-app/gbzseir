"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { routes } from "@/core/routes";
import { revalidatePublic } from "@/lib/revalidate-public";
import { dbFail, withAdmin } from "../server/guard";
import { fail, ok, type ActionResult } from "../lib/action-result";
import { firstIssue, zId } from "../lib/zod";

function revalidateUser(userId: string) {
  revalidatePath(routes.admin.user(userId));
  revalidatePath(routes.admin.users());
  revalidatePath(routes.admin.root());
}

/** The database hides a banned user's businesses, listings, events and reviews; expire the cached public pages. */
async function revalidateUserContent() {
  await revalidatePublic({
    // "services" caches the firm cards of the service category pages.
    tags: ["businesses", "listings", "services"],
    paths: [
      routes.home(),
      routes.businesses.root(),
      { path: "/firma/[slug]", type: "page" },
      { path: "/menu/[slug]", type: "page" },
      { path: "/kesfet/[tur]", type: "page" },
      routes.events.root(),
      { path: "/etkinlik/[slug]", type: "page" },
      routes.listings.root(),
      { path: "/ilan/[id]", type: "page" },
      { path: "/is-ilani/[id]", type: "page" },
    ],
  });
}

const statusSchema = z.object({
  userId: zId,
  status: z.enum(["active", "restricted", "banned"]),
  // Kept in the audit log with the sign-in change (e.g. the report that led to the ban).
  reason: z.string().trim().max(300).optional(),
});

/**
 * Aktif / Kısıtlı / Engelli through admin_set_user_status: one transaction with the admin's session (no service role)
 * changes the profile status, the sign-in ban (auth.users.banned_until) and, on a ban, closes the user's sessions.
 * Admins cannot change themselves or other admins (checked again by the RPC). The change is audited by trigger.
 * Engelli also hides the user's public content until the ban is lifted.
 */
export async function setUserStatusAction(input: z.input<typeof statusSchema>): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase, userId: me }) => {
    const parsed = statusSchema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const { userId, status, reason } = parsed.data;
    if (userId === me) return fail("Kendi hesabının durumunu değiştiremezsin.", "self");
    // Errors come back as Turkish text with a hint: self, not_found, admin_target, invalid_status.
    const { data, error } = await supabase.rpc("admin_set_user_status", {
      p_user_id: userId,
      p_status: status,
      ...(reason ? { p_reason: reason } : {}),
    });
    if (error) return dbFail(error);
    revalidateUser(userId);
    if ((data as { ban_changed?: boolean } | null)?.ban_changed) await revalidateUserContent();
    return ok(null, status === "active" ? "Hesap yeniden aktif." : status === "restricted" ? "Hesap kısıtlandı." : "Hesap engellendi.");
  });
}

const trustedSchema = z.object({ userId: zId, value: z.boolean() });

/** Güvenilir yayıncı: ilanları onaya düşmeden yayınlanır. */
export async function setTrustedPublisherAction(input: z.input<typeof trustedSchema>): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = trustedSchema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const { data, error } = await supabase.from("profiles").update({ trusted_publisher: parsed.data.value }).eq("id", parsed.data.userId).select("id").maybeSingle();
    if (error) return dbFail(error);
    if (!data) return fail("Kullanıcı bulunamadı.", "not_found");
    revalidateUser(parsed.data.userId);
    return ok(null, parsed.data.value ? "Güvenilir yayıncı yapıldı." : "Güvenilir yayıncılık kaldırıldı.");
  });
}

const slotSchema = z.object({
  userId: zId,
  slots: z
    .number()
    .int()
    .min(-10)
    .max(10)
    .refine((n) => n !== 0, "Hak sayısı 0 olamaz."),
});

/**
 * İşletme hakkı: extra businesses on top of Ayarlar > Hesap başına işletme sayısı (admin_grant_business_slot; audited,
 * and a + notifies the user with a link to the apply page). A - takes a granted slot back (never below 0).
 */
export async function grantBusinessSlotAction(input: z.input<typeof slotSchema>): Promise<ActionResult<{ limit: number; count: number }>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = slotSchema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const { userId, slots } = parsed.data;
    // Errors come back as Turkish text with a hint: invalid_slots, not_found.
    const { data, error } = await supabase.rpc("admin_grant_business_slot", { p_user: userId, p_slots: slots });
    if (error) return dbFail(error);
    const res = (data ?? {}) as { changed?: boolean; limit?: number; count?: number };
    const limit = res.limit ?? 0;
    revalidateUser(userId);
    if (!res.changed) return ok({ limit, count: res.count ?? 0 }, "Değişiklik yok.");
    return ok(
      { limit, count: res.count ?? 0 },
      slots > 0 ? `İşletme hakkı verildi: en fazla ${limit} işletme. Kullanıcıya bildirim gitti.` : `İşletme hakkı geri alındı: en fazla ${limit} işletme.`,
    );
  });
}
