"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { routes } from "@/core/routes";
import { DISTRICT_SLUGS, isDistrictSlug } from "@/config/districts";
import { revalidatePublic } from "@/lib/revalidate-public";
import { dbFail, withAdmin } from "../server/guard";
import { fail, ok, type ActionResult } from "../lib/action-result";
import { firstIssue, zId } from "../lib/zod";

const schema = z
  .object({
    id: zId.optional(),
    kind: z.enum(["su_kesintisi", "elektrik_kesintisi", "belediye", "genel"]),
    title: z.string().trim().min(3, "Başlık en az 3 karakter olmalı.").max(120, "Başlık en fazla 120 karakter olabilir."),
    body: z.string().trim().max(1500, "Metin en fazla 1500 karakter olabilir.").optional(),
    // Target districts (empty = all of Kocaeli); the database checks them like a foreign key too.
    districtIds: z.array(z.string().refine(isDistrictSlug, "Geçersiz ilçe.")).max(DISTRICT_SLUGS.length),
    sourceLabel: z.string().trim().max(80, "Kaynak en fazla 80 karakter olabilir.").optional(),
    startsAt: z.string().datetime({ offset: true, message: "Başlangıç zamanı seç." }),
    endsAt: z.string().datetime({ offset: true }).nullable(),
  })
  .refine((v) => !v.endsAt || v.endsAt > v.startsAt, { message: "Bitiş, başlangıçtan sonra olmalı." });

async function revalidateAnnouncements() {
  revalidatePath(routes.admin.announcements());
  await revalidatePublic({
    tags: ["content:announcements"],
    paths: [routes.content.announcements(), routes.home()],
  });
}

/** Duyuru ekle / güncelle (su, elektrik kesintisi, belediye, genel). */
export async function saveAnnouncementAction(input: z.input<typeof schema>): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase, userId }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const v = parsed.data;
    const row = {
      kind: v.kind,
      title: v.title,
      body: v.body || null,
      // neighbourhood_ids is left untouched: an update that changes only it would recompute district_ids (trigger).
      district_ids: [...new Set(v.districtIds)],
      source_label: v.sourceLabel || null,
      starts_at: v.startsAt,
      ends_at: v.endsAt,
    };
    const { error } = v.id
      ? await supabase.from("announcements").update(row).eq("id", v.id)
      : await supabase.from("announcements").insert({ ...row, created_by: userId });
    if (error) return dbFail(error);
    await revalidateAnnouncements();
    return ok(null, v.id ? "Duyuru güncellendi." : "Duyuru yayınlandı.");
  });
}

export async function deleteAnnouncementAction(input: { id: string }): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const id = zId.safeParse(input.id);
    if (!id.success) return fail("Geçersiz duyuru.");
    const { data, error } = await supabase.from("announcements").delete().eq("id", id.data).select("id").maybeSingle();
    if (error) return dbFail(error);
    if (!data) return fail("Duyuru bulunamadı.", "not_found");
    await revalidateAnnouncements();
    return ok(null, "Duyuru silindi.");
  });
}
