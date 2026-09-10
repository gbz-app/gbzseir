"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { routes } from "@/core/routes";
import { dbFail, withAdmin } from "../server/guard";
import { fail, ok, type ActionResult } from "../lib/action-result";
import { firstIssue, zId } from "../lib/zod";

function revalidateUser(userId: string) {
  revalidatePath(routes.admin.user(userId));
  revalidatePath(routes.admin.users());
  revalidatePath(routes.admin.root());
}

const statusSchema = z.object({ userId: zId, status: z.enum(["active", "restricted", "banned"]) });

/** Aktif / Kısıtlı / Engelli. Admins cannot change themselves or other admins here. The change is audited by trigger. */
export async function setUserStatusAction(input: z.input<typeof statusSchema>): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase, userId: me }) => {
    const parsed = statusSchema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const { userId, status } = parsed.data;
    if (userId === me) return fail("Kendi hesabının durumunu değiştiremezsin.", "self");
    const { data: target, error: tErr } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
    if (tErr) return dbFail(tErr);
    if (!target) return fail("Kullanıcı bulunamadı.", "not_found");
    if (target.role === "admin") return fail("Yönetici hesaplarının durumu buradan değiştirilemez.", "admin_target");
    const { error } = await supabase.from("profiles").update({ status }).eq("id", userId);
    if (error) return dbFail(error);
    revalidateUser(userId);
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
