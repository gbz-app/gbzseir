"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { routes } from "@/core/routes";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePublic } from "@/lib/revalidate-public";
import { dbFail, withAdmin } from "../server/guard";
import { fail, ok, type ActionResult } from "../lib/action-result";
import { firstIssue, zId } from "../lib/zod";

function revalidateUser(userId: string) {
  revalidatePath(routes.admin.user(userId));
  revalidatePath(routes.admin.users());
  revalidatePath(routes.admin.root());
}

/** Supabase Auth ban for "Engelli" (about 100 years); "none" lifts it. */
const AUTH_BAN_DURATION = "876000h";

/**
 * Blocks or re-allows sign-in in Supabase Auth (service role). A session that is already open keeps working until
 * its access token expires (up to 1 hour); the database blocks a banned user's writes meanwhile.
 */
async function setAuthBan(userId: string, banned: boolean): Promise<boolean> {
  try {
    const { error } = await createAdminClient().auth.admin.updateUserById(userId, { ban_duration: banned ? AUTH_BAN_DURATION : "none" });
    if (error) console.error("[admin auth ban]", error.status, error.message);
    return !error;
  } catch (e) {
    console.error("[admin auth ban]", e);
    return false;
  }
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

const statusSchema = z.object({ userId: zId, status: z.enum(["active", "restricted", "banned"]) });

/**
 * Aktif / Kısıtlı / Engelli. Admins cannot change themselves or other admins here. The change is audited by trigger.
 * Engelli also blocks sign-in (Supabase Auth ban) and hides the user's public content until the ban is lifted.
 */
export async function setUserStatusAction(input: z.input<typeof statusSchema>): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase, userId: me }) => {
    const parsed = statusSchema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const { userId, status } = parsed.data;
    if (userId === me) return fail("Kendi hesabının durumunu değiştiremezsin.", "self");
    const { data: target, error: tErr } = await supabase.from("profiles").select("role,status").eq("id", userId).maybeSingle();
    if (tErr) return dbFail(tErr);
    if (!target) return fail("Kullanıcı bulunamadı.", "not_found");
    if (target.role === "admin") return fail("Yönetici hesaplarının durumu buradan değiştirilemez.", "admin_target");

    // Sign-in is changed first, so a failure leaves the account as it was and the admin can simply retry.
    const banChange = status === "banned" || target.status === "banned";
    if (banChange && !(await setAuthBan(userId, status === "banned"))) {
      return fail(
        status === "banned" ? "Giriş engeli uygulanamadı; hesap değişmedi. Tekrar dene." : "Giriş engeli kaldırılamadı; hesap değişmedi. Tekrar dene.",
        "auth_ban",
      );
    }
    const { data: updated, error } = await supabase.from("profiles").update({ status }).eq("id", userId).select("id").maybeSingle();
    if (error || !updated) {
      if (banChange) await setAuthBan(userId, target.status === "banned");
      return error ? dbFail(error) : fail("Kullanıcı bulunamadı.", "not_found");
    }
    revalidateUser(userId);
    if (banChange) await revalidateUserContent();
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
