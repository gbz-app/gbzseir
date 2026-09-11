"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { routes } from "@/core/routes";
import { slugifyTr } from "@/core/tr";
import { revalidatePublic } from "@/lib/revalidate-public";
import { dbFail, withAdmin } from "../server/guard";
import { fail, ok, type ActionResult } from "../lib/action-result";
import { firstIssue, zId } from "../lib/zod";

const photo = z.object({
  url: z.string().trim().url().max(500).refine((u) => /^https:\/\//.test(u), "Fotoğraf adresi https olmalı."),
  alt: z.string().trim().max(160).nullable().optional(),
  credit: z.string().trim().max(160).nullable().optional(),
});

const schema = z.object({
  id: zId.optional(),
  name: z.string().trim().min(2, "Yer adı yaz.").max(120),
  category: z.enum(["tarihi", "park", "doga", "muze", "avm", "diger"]),
  description: z.string().trim().max(2000, "Açıklama en fazla 2000 karakter olabilir.").optional(),
  hours: z.string().trim().max(200).optional(),
  fee: z.string().trim().max(100).optional(),
  curated: z.boolean(),
  photos: z.array(photo).max(12, "En fazla 12 fotoğraf."),
  address: z.string().trim().max(200).optional(),
  lat: z.number().min(40.5).max(41.2).nullable(),
  lng: z.number().min(29).max(30).nullable(),
});

async function revalidatePlaces(slug?: string) {
  revalidatePath(routes.admin.places());
  await revalidatePublic({
    tags: ["poi", "nearby"],
    paths: [routes.nearby.places(), routes.home(), ...(slug ? [routes.nearby.place(slug)] : [])],
  });
}

/** Gezilecek yer ekle / düzenle. poi.details keeps unknown keys (wikidata, source data) on update. */
export async function savePlaceAction(input: z.input<typeof schema>): Promise<ActionResult<{ slug: string }>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const v = parsed.data;
    const patch = {
      category: v.category,
      description: v.description || null,
      hours: v.hours || null,
      fee: v.fee || null,
      curated: v.curated,
      photos: v.photos.map((p) => ({ url: p.url, alt: p.alt || null, credit: p.credit || null })),
    };
    const location = v.lat !== null && v.lng !== null ? `SRID=4326;POINT(${v.lng} ${v.lat})` : undefined;

    if (v.id) {
      const { data: current, error: cErr } = await supabase.from("poi").select("details,slug").eq("id", v.id).eq("kind", "place").maybeSingle();
      if (cErr) return dbFail(cErr);
      if (!current) return fail("Yer bulunamadı.", "not_found");
      const base = current.details && typeof current.details === "object" && !Array.isArray(current.details) ? current.details : {};
      const { error } = await supabase
        .from("poi")
        .update({ name: v.name, address: v.address || null, details: { ...base, ...patch }, ...(location ? { location } : {}), updated_at: new Date().toISOString() })
        .eq("id", v.id);
      if (error) return dbFail(error);
      await revalidatePlaces(current.slug);
      return ok({ slug: current.slug }, "Yer güncellendi.");
    }

    if (!location) return fail("Haritadan konum seç.");
    const slug = `${slugifyTr(v.name).slice(0, 60) || "yer"}-${Math.random().toString(36).slice(2, 6)}`;
    const { error } = await supabase.from("poi").insert({ kind: "place", name: v.name, slug, address: v.address || null, location, details: patch, source: "manual", license: null });
    if (error) return dbFail(error, "Yer eklenemedi.");
    await revalidatePlaces(slug);
    return ok({ slug }, "Yer eklendi.");
  });
}

export async function deletePlaceAction(input: { id: string }): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const id = zId.safeParse(input.id);
    if (!id.success) return fail("Geçersiz yer.");
    const { data, error } = await supabase.from("poi").delete().eq("id", id.data).eq("kind", "place").select("slug").maybeSingle();
    if (error) return dbFail(error);
    if (!data) return fail("Yer bulunamadı.", "not_found");
    await revalidatePlaces(data.slug);
    return ok(null, "Yer silindi.");
  });
}
