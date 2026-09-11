"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { routes } from "@/core/routes";
import { revalidatePublic } from "@/lib/revalidate-public";
import { dbFail, withAdmin } from "../server/guard";
import { fail, ok, type ActionResult } from "../lib/action-result";
import { firstIssue, zId } from "../lib/zod";

const option = z.object({ value: z.string().trim().regex(/^[a-z0-9_]{1,40}$/, "Seçenek anahtarı geçersiz."), label: z.string().trim().min(1).max(60) });
const field = z
  .object({
    key: z.string().trim().regex(/^[a-z][a-z0-9_]{0,39}$/, "Alan anahtarı küçük harf, rakam ve _ olmalı."),
    label: z.string().trim().min(1, "Alan adı yaz.").max(60, "Alan adı en fazla 60 karakter olabilir."),
    type: z.enum(["text", "number", "select", "boolean"]),
    required: z.boolean().optional(),
    filterable: z.boolean().optional(),
    options: z.array(option).max(40, "En fazla 40 seçenek olabilir.").optional(),
  })
  .refine((f) => f.type !== "select" || (f.options?.length ?? 0) >= 2, { message: "Seçimli alanda en az 2 seçenek olmalı." })
  // Listings store the option value, and filter links use it.
  .refine((f) => new Set((f.options ?? []).map((o) => o.value)).size === (f.options?.length ?? 0), { message: "Seçenekler birbirinden farklı olmalı." });

const schema = z
  .object({
    id: zId.optional(),
    type: z.enum(["classified", "job"]),
    parentId: zId.nullable(),
    name: z.string().trim().min(2, "Kategori adı en az 2 karakter olmalı.").max(60, "Kategori adı en fazla 60 karakter olabilir."),
    slug: z.string().trim().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Adres (slug) küçük harf, rakam ve tire olmalı.").max(60),
    icon: z.string().trim().max(40).nullable(),
    sort: z.coerce.number().int().min(0).max(10000),
    isBanned: z.boolean(),
    attributes: z.array(field).max(20, "En fazla 20 alan olabilir."),
  })
  .refine((c) => new Set(c.attributes.map((a) => a.key)).size === c.attributes.length, { message: "Alan anahtarları birbirinden farklı olmalı." });

async function revalidateCategories() {
  revalidatePath(routes.admin.listingCategories());
  await revalidatePublic({
    tags: ["listing-categories"],
    paths: [routes.listings.root(), routes.listings.post(), routes.listings.postClassified(), routes.listings.postJob()],
  });
}

/** İlan kategorisi ekle / güncelle (özellik ve filtre alanları dahil). */
export async function saveListingCategoryAction(input: z.input<typeof schema>): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const v = parsed.data;
    if (v.id && v.parentId === v.id) return fail("Kategori kendi alt kategorisi olamaz.");
    if (v.parentId) {
      const { data: parent } = await supabase.from("listing_categories").select("type,parent_id").eq("id", v.parentId).maybeSingle();
      if (!parent) return fail("Üst kategori bulunamadı.");
      if (parent.type !== v.type) return fail("Üst kategori aynı türde olmalı.");
      if (parent.parent_id) return fail("Yalnızca iki seviye desteklenir (ana kategori > alt kategori).");
    }
    const row = {
      type: v.type,
      parent_id: v.parentId,
      name: v.name,
      slug: v.slug,
      icon: v.icon || null,
      sort: v.sort,
      is_banned: v.isBanned,
      attributes_schema: v.attributes.map((a) => ({
        key: a.key,
        label: a.label,
        type: a.type,
        ...(a.required ? { required: true } : {}),
        // Free text is not filterable (select = equality, number = range, boolean = "yes").
        ...(a.filterable && a.type !== "text" ? { filterable: true } : {}),
        ...(a.type === "select" ? { options: a.options ?? [] } : {}),
      })),
    };
    const { error } = v.id ? await supabase.from("listing_categories").update(row).eq("id", v.id) : await supabase.from("listing_categories").insert(row);
    if (error) return dbFail(error, "Kategori kaydedilemedi.");
    await revalidateCategories();
    return ok(null, v.id ? "Kategori güncellendi." : "Kategori eklendi.");
  });
}

export async function deleteListingCategoryAction(input: { id: string }): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const id = zId.safeParse(input.id);
    if (!id.success) return fail("Geçersiz kategori.");
    const { count } = await supabase.from("listings").select("id", { count: "exact", head: true }).eq("category_id", id.data);
    if (count) return fail(`Bu kategoride ${count} ilan var. Silmek yerine 'Yasaklı' yapabilir ya da ilanları taşıyabilirsin.`, "in_use");
    const { error } = await supabase.from("listing_categories").delete().eq("id", id.data);
    if (error) return dbFail(error, "Kategori silinemedi.");
    await revalidateCategories();
    return ok(null, "Kategori silindi.");
  });
}
