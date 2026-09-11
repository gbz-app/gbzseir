"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { routes } from "@/core/routes";
import { revalidatePublic } from "@/lib/revalidate-public";
import { dbFail, withAdmin, type AdminContext } from "../server/guard";
import { fail, ok, type ActionResult } from "../lib/action-result";
import { firstIssue, zId } from "../lib/zod";

const noteSchema = z.string().trim().max(500, "Not en fazla 500 karakter olabilir.").optional();

function revalidateReports() {
  revalidatePath(routes.admin.reports());
  revalidatePath(routes.admin.root());
}

const statusSchema = z.object({ reportId: zId, status: z.enum(["open", "resolved", "dismissed"]), note: noteSchema });

/** Çözüldü / Yoksay / Yeniden aç. */
export async function setReportStatusAction(input: z.input<typeof statusSchema>): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = statusSchema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const { reportId, status, note } = parsed.data;
    const { data, error } = await supabase
      .from("reports")
      .update({
        status,
        resolved_at: status === "open" ? null : new Date().toISOString(),
        ...(note !== undefined ? { admin_note: note || null } : {}),
      })
      .eq("id", reportId)
      .select("id")
      .maybeSingle();
    if (error) return dbFail(error);
    if (!data) return fail("Şikayet bulunamadı.", "not_found");
    revalidateReports();
    return ok(null, status === "resolved" ? "Şikayet çözüldü olarak kapatıldı." : status === "dismissed" ? "Şikayet yoksayıldı." : "Şikayet yeniden açıldı.");
  });
}

async function recomputeRating(supabase: AdminContext["supabase"], businessId: string) {
  const { data } = await supabase.from("reviews").select("rating").eq("business_id", businessId);
  const ratings = (data ?? []).map((r) => r.rating);
  const avg = ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) / 100 : 0;
  await supabase.from("businesses").update({ rating_avg: avg, rating_count: ratings.length }).eq("id", businessId);
}

const removeSchema = z.object({ reportId: zId, note: noteSchema });

/**
 * "İçeriği kaldır": listing -> deleted, business -> suspended, review -> deleted (rating recomputed),
 * user -> banned. Every open report about the same target is closed as resolved.
 */
export async function removeReportedContentAction(input: z.input<typeof removeSchema>): Promise<ActionResult<{ targetType: string }>> {
  return withAdmin(async (ctx) => {
    const { supabase, userId } = ctx;
    const parsed = removeSchema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const { data: report, error: rErr } = await supabase
      .from("reports")
      .select("id,target_type,target_id")
      .eq("id", parsed.data.reportId)
      .maybeSingle();
    if (rErr) return dbFail(rErr);
    if (!report) return fail("Şikayet bulunamadı.", "not_found");
    const targetId = report.target_id;
    let message = "İçerik kaldırıldı.";

    switch (report.target_type) {
      case "listing": {
        const { data, error } = await supabase.from("listings").update({ status: "deleted" }).eq("id", targetId).select("id").maybeSingle();
        if (error) return dbFail(error);
        if (!data) return fail("İlan artık yok.", "not_found");
        await revalidatePublic({
          tags: ["listings"],
          paths: [routes.listings.classified(targetId), routes.listings.job(targetId), routes.listings.root()],
        });
        message = "İlan kaldırıldı.";
        break;
      }
      case "business": {
        const { data, error } = await supabase.from("businesses").update({ status: "suspended" }).eq("id", targetId).select("slug").maybeSingle();
        if (error) return dbFail(error);
        if (!data) return fail("İşletme artık yok.", "not_found");
        await revalidatePublic({
          tags: ["businesses"],
          paths: [
            routes.businesses.detail(data.slug),
            routes.businesses.menu(data.slug),
            routes.businesses.root(),
            { path: "/kesfet/[tur]", type: "page" },
            routes.home(),
          ],
        });
        message = "İşletme askıya alındı.";
        break;
      }
      case "review": {
        const { data, error } = await supabase.from("reviews").delete().eq("id", targetId).select("business_id").maybeSingle();
        if (error) return dbFail(error);
        if (!data) return fail("Yorum artık yok.", "not_found");
        await recomputeRating(supabase, data.business_id);
        // The public firm page shows the review list and the rating.
        const { data: biz } = await supabase.from("businesses").select("slug").eq("id", data.business_id).maybeSingle();
        if (biz?.slug) await revalidatePublic({ tags: ["businesses"], paths: [routes.businesses.detail(biz.slug)] });
        message = "Yorum silindi; puan yeniden hesaplandı.";
        break;
      }
      case "user": {
        if (targetId === userId) return fail("Kendi hesabını engelleyemezsin.", "self");
        const { data: target } = await supabase.from("profiles").select("role").eq("id", targetId).maybeSingle();
        if (!target) return fail("Kullanıcı artık yok.", "not_found");
        if (target.role === "admin") return fail("Yönetici hesapları buradan engellenemez.", "admin_target");
        const { error } = await supabase.from("profiles").update({ status: "banned" }).eq("id", targetId);
        if (error) return dbFail(error);
        message = "Kullanıcı engellendi.";
        break;
      }
      default:
        return fail("Bu şikayet türü için kaldırma işlemi yok.");
    }

    const { error: closeErr } = await supabase
      .from("reports")
      .update({ status: "resolved", resolved_at: new Date().toISOString(), admin_note: parsed.data.note || "İçerik kaldırıldı." })
      .eq("target_type", report.target_type)
      .eq("target_id", targetId)
      .eq("status", "open");
    if (closeErr) return dbFail(closeErr, "İçerik kaldırıldı ama şikayetler kapatılamadı.");
    revalidateReports();
    return ok({ targetType: report.target_type }, message);
  });
}
