"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { routes } from "@/core/routes";
import { STORAGE_BUCKETS } from "@/lib/db-contract";
import { revalidatePublic } from "@/lib/revalidate-public";
import { DOCTOR_TITLES } from "@/features/business/components/doctors/doctor-meta";
import { DAY_KEYS } from "@/features/business/lib/hours";
import { dbFail, withAdmin, type AdminContext } from "../server/guard";
import { fail, ok, type ActionResult } from "../lib/action-result";
import { firstIssue, zId } from "../lib/zod";

/**
 * Doctors (public.business_staff) of sağlık businesses, from /admin/isletmeler. Writes go through the RLS admin policies
 * with the admin's own session (no service key). The business_staff_before_write trigger tidies the name, texts and days
 * and trusts admins with the consent time, which is stamped here when the KVKK box is ticked. No audit row yet:
 * private.audit_content has no business_staff branch.
 */

type Supabase = AdminContext["supabase"];

const BRANCH_KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;

const doctorSchema = z.object({
  id: zId.optional(),
  businessId: zId,
  title: z.string().refine((t) => (DOCTOR_TITLES as readonly string[]).includes(t), "Unvan seç."),
  name: z
    .string()
    .trim()
    .min(2, "Ad soyad en az 2 karakter olmalı.")
    .max(80, "Ad soyad en fazla 80 karakter olabilir.")
    .transform((s) => s.replace(/\s+/g, " ")),
  branch: z.string().regex(BRANCH_KEY_RE, "Branş seç."),
  days: z.array(z.string().refine((d) => (DAY_KEYS as readonly string[]).includes(d), "Gün geçersiz.")).max(7),
  hoursNote: z.string().trim().max(80, "Saat notu en fazla 80 karakter olabilir."),
  bio: z.string().trim().max(300, "Kısa bilgi en fazla 300 karakter olabilir."),
  photoUrl: z
    .string()
    .trim()
    .max(500, "Fotoğraf adresi çok uzun.")
    .refine((u) => u.startsWith("https://"), "Fotoğraf adresi geçersiz.")
    .nullable(),
  active: z.boolean(),
  /** "Bu kişinin bilgilerini yayınlamak için onayı alındı": required to add a doctor. */
  consent: z.boolean(),
});

const activeSchema = z.object({ id: zId, active: z.boolean() });

/** Admin list + the clinic's public firm page and the Keşfet doctor list (both read through the "businesses" data cache). */
async function revalidateClinic(supabase: Supabase, businessId: string) {
  revalidatePath(routes.admin.businesses());
  const { data } = await supabase.from("businesses").select("slug").eq("id", businessId).maybeSingle();
  await revalidatePublic({
    tags: ["businesses"],
    paths: [...(data?.slug ? [routes.businesses.detail(data.slug)] : []), routes.businesses.vertical("saglik")],
  });
}

/**
 * Storage path of a doctor photo in our media bucket (media/<uid>/business/doktor-<id>.<ext>, the owner's picker and the
 * admin dialog both use it), else null. Other images (seed data, other folders) are never deleted from here.
 */
function doctorPhotoPath(url: string | null | undefined): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !base || !url.startsWith(base)) return null;
  const marker = `/storage/v1/object/public/${STORAGE_BUCKETS.media}/`;
  const i = url.indexOf(marker);
  if (i < 0) return null;
  let path: string;
  try {
    path = decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
  } catch {
    return null;
  }
  return /^[0-9a-f-]{36}\/business\/doktor-[\w.-]+$/i.test(path) ? path : null;
}

/** Takes a removed or replaced doctor photo down (KVKK), unless another row still shows it. Never fails the action. */
async function removeDoctorPhoto(supabase: Supabase, url: string | null | undefined) {
  const path = doctorPhotoPath(url);
  if (!path || !url) return;
  const { count, error } = await supabase.from("business_staff").select("id", { count: "exact", head: true }).eq("photo_url", url);
  if (error || count) return;
  // "media owner delete" lets admins delete any media object.
  const { error: rmErr } = await supabase.storage.from(STORAGE_BUCKETS.media).remove([path]);
  if (rmErr) console.error("[admin doctors] photo not removed:", rmErr.message);
}

function saveFail(error: Parameters<typeof dbFail>[0]) {
  if (error?.code === "23503") return fail("Seçilen branş bulunamadı. Sayfayı yenileyip tekrar dene.", "branch");
  return dbFail(error, "Doktor kaydedilemedi.");
}

/** Doktor ekle / düzenle. A new doctor needs a sağlık business and the consent box; edits keep the consent time. */
export async function saveDoctorAction(input: z.input<typeof doctorSchema>): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = doctorSchema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const v = parsed.data;
    const row = {
      title: v.title,
      name: v.name,
      branch: v.branch,
      days: v.days,
      hours_note: v.hoursNote || null,
      bio: v.bio || null,
      photo_url: v.photoUrl,
      is_active: v.active,
    };

    if (v.id) {
      const { data: current, error: cErr } = await supabase.from("business_staff").select("photo_url").eq("id", v.id).eq("business_id", v.businessId).maybeSingle();
      if (cErr) return dbFail(cErr);
      if (!current) return fail("Doktor bulunamadı.", "not_found");
      const { data, error } = await supabase.from("business_staff").update(row).eq("id", v.id).eq("business_id", v.businessId).select("id").maybeSingle();
      if (error) return saveFail(error);
      if (!data) return fail("Doktor bulunamadı.", "not_found");
      if (current.photo_url && current.photo_url !== v.photoUrl) await removeDoctorPhoto(supabase, current.photo_url);
      await revalidateClinic(supabase, v.businessId);
      return ok(null, "Doktor güncellendi.");
    }

    if (!v.consent) return fail("Yayınlamak için bu kişinin onayının alındığını işaretle.", "consent_required");
    const { data: biz, error: bErr } = await supabase.from("businesses").select("vertical").eq("id", v.businessId).maybeSingle();
    if (bErr) return dbFail(bErr);
    if (!biz) return fail("İşletme bulunamadı.", "not_found");
    if (biz.vertical !== "saglik") return fail("Doktor yalnızca sağlık işletmelerine eklenebilir. Önce işletmenin türünü Sağlık yap.", "wrong_vertical");
    const { data: last, error: sErr } = await supabase
      .from("business_staff")
      .select("sort")
      .eq("business_id", v.businessId)
      .order("sort", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sErr) return dbFail(sErr);
    const { error } = await supabase.from("business_staff").insert({
      ...row,
      business_id: v.businessId,
      sort: Math.min((last?.sort ?? -1) + 1, 10000),
      // The admin ticked "onayı alındı" just now; the trigger keeps an admin's value.
      consent_confirmed_at: new Date().toISOString(),
    });
    if (error) return saveFail(error);
    await revalidateClinic(supabase, v.businessId);
    return ok(null, "Doktor eklendi.");
  });
}

/** Doktoru sil: the row and its uploaded photo (KVKK take-down). Allowed even when the business is no longer sağlık. */
export async function deleteDoctorAction(input: { id: string }): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const id = zId.safeParse(input.id);
    if (!id.success) return fail("Geçersiz doktor.");
    const { data, error } = await supabase.from("business_staff").delete().eq("id", id.data).select("business_id,photo_url").maybeSingle();
    if (error) return dbFail(error, "Doktor silinemedi.");
    if (!data) return fail("Doktor bulunamadı.", "not_found");
    await removeDoctorPhoto(supabase, data.photo_url);
    await revalidateClinic(supabase, data.business_id);
    return ok(null, "Doktor silindi.");
  });
}

/** Görünürlük: an inactive doctor stays in the list here but leaves the public pages. */
export async function setDoctorActiveAction(input: z.input<typeof activeSchema>): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = activeSchema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const { id, active } = parsed.data;
    const { data, error } = await supabase.from("business_staff").update({ is_active: active }).eq("id", id).select("business_id").maybeSingle();
    if (error) return dbFail(error, "Doktor kaydedilemedi.");
    if (!data) return fail("Doktor bulunamadı.", "not_found");
    await revalidateClinic(supabase, data.business_id);
    return ok(null, active ? "Doktor işletme sayfasında görünüyor." : "Doktor gizlendi.");
  });
}
