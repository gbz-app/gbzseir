"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { routes } from "@/core/routes";
import { dbFail, withAdmin, type AdminContext } from "../server/guard";
import { fail, ok, type ActionResult } from "../lib/action-result";
import { firstIssue, zId } from "../lib/zod";

async function revalidateBusiness(supabase: AdminContext["supabase"], id: string) {
  revalidatePath(routes.admin.businesses());
  revalidatePath(routes.admin.root());
  revalidatePath(routes.businesses.root());
  const { data } = await supabase.from("businesses").select("slug").eq("id", id).maybeSingle();
  if (data?.slug) revalidatePath(routes.businesses.detail(data.slug));
}

const reviewSchema = z.object({
  businessId: zId,
  approve: z.boolean(),
  reason: z.string().trim().max(280, "Gerekçe en fazla 280 karakter olabilir.").optional(),
});

/** Başvuru Onayla / Reddet (admin_review_business notifies the owner). */
export async function reviewBusinessAction(input: z.input<typeof reviewSchema>): Promise<ActionResult<{ status: string }>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = reviewSchema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const { businessId, approve, reason } = parsed.data;
    if (!approve && !reason) return fail("Reddetmek için bir gerekçe seç.");
    const { data, error } = await supabase.rpc("admin_review_business", {
      p_business_id: businessId,
      p_approve: approve,
      ...(approve ? {} : { p_reason: reason }),
    });
    if (error) return dbFail(error);
    const res = data as { ok?: boolean; status?: string } | null;
    if (!res?.ok) return fail("İşletme bulunamadı.", "not_found");
    await revalidateBusiness(supabase, businessId);
    return ok({ status: res.status ?? "" }, approve ? "İşletme onaylandı; sahibine bildirildi." : "Başvuru reddedildi; sahibine bildirildi.");
  });
}

const statusSchema = z.object({ businessId: zId, status: z.enum(["approved", "suspended"]) });

/** Askıya al (approved -> suspended) / Yeniden etkinleştir (suspended -> approved). */
export async function setBusinessStatusAction(input: z.input<typeof statusSchema>): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = statusSchema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const { businessId, status } = parsed.data;
    const { data: current, error: cErr } = await supabase.from("businesses").select("status,owner_id,name").eq("id", businessId).maybeSingle();
    if (cErr) return dbFail(cErr);
    if (!current) return fail("İşletme bulunamadı.", "not_found");
    if (status === "suspended" && current.status !== "approved") return fail("Yalnızca onaylı işletmeler askıya alınabilir.");
    if (status === "approved" && current.status !== "suspended") return fail("Bekleyen başvurular için Onayla / Reddet kullan.");
    const { error } = await supabase.from("businesses").update({ status }).eq("id", businessId);
    if (error) return dbFail(error);
    // In-app notification row only (the services module's push pipeline delivers it). No personal data.
    await supabase.from("notifications").insert(
      status === "suspended"
        ? {
            user_id: current.owner_id,
            type: "business_suspended",
            title: "İşletmen askıya alındı",
            body: "İşletme sayfan geçici olarak yayından kaldırıldı. Ayrıntı için destek ekibiyle iletişime geç.",
            link: routes.business.root(),
          }
        : {
            user_id: current.owner_id,
            type: "business_approved",
            title: "İşletmen yeniden yayında",
            body: `${current.name} tekrar görünür durumda.`,
            link: routes.business.root(),
          },
    );
    await revalidateBusiness(supabase, businessId);
    return ok(null, status === "suspended" ? "İşletme askıya alındı." : "İşletme yeniden etkinleştirildi.");
  });
}

const levelSchema = z.object({ businessId: zId, level: z.number().int().min(0).max(3) });

/** Doğrulama seviyesi (0-3; >= 1 shows the "Onaylı" badge). */
export async function setVerificationLevelAction(input: z.input<typeof levelSchema>): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = levelSchema.safeParse(input);
    if (!parsed.success) return fail("Doğrulama seviyesi 0 ile 3 arasında olmalı.");
    const { data, error } = await supabase
      .from("businesses")
      .update({ verification_level: parsed.data.level })
      .eq("id", parsed.data.businessId)
      .select("id")
      .maybeSingle();
    if (error) return dbFail(error);
    if (!data) return fail("İşletme bulunamadı.", "not_found");
    await revalidateBusiness(supabase, parsed.data.businessId);
    return ok(null, `Doğrulama seviyesi ${parsed.data.level} olarak kaydedildi.`);
  });
}

/** Short-lived signed URL (2 minutes) for a document in the private-docs bucket. */
export async function getBusinessDocumentUrlAction(input: { documentId: string }): Promise<ActionResult<{ url: string }>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = z.object({ documentId: zId }).safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const { data: doc, error } = await supabase.from("business_documents").select("path").eq("id", parsed.data.documentId).maybeSingle();
    if (error) return dbFail(error);
    if (!doc) return fail("Belge bulunamadı.", "not_found");
    const { data, error: sErr } = await supabase.storage.from("private-docs").createSignedUrl(doc.path, 120);
    if (sErr || !data?.signedUrl) return fail("Belge bağlantısı oluşturulamadı. Dosya silinmiş olabilir.", "storage");
    return ok({ url: data.signedUrl }, "Belge bağlantısı 2 dakika geçerli.");
  });
}
