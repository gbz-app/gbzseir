"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { routes } from "@/core/routes";
import { getAppSettings } from "@/lib/app-settings";
import { revalidatePublic, type PublicCacheTag } from "@/lib/revalidate-public";
import { parseFlowSchema, type FlowStep } from "@/core/flow";
import { dbFail, withAdmin, type AdminContext } from "../server/guard";
import { fail, ok, type ActionResult } from "../lib/action-result";
import { firstIssue, zId } from "../lib/zod";
import { cleanFlowSchema, validateFlowDraft } from "../lib/flow-draft";

/** Public /hizmetler and request-wizard paths of the given category slugs. */
function servicePaths(slugs: Array<string | null | undefined>): string[] {
  const paths: string[] = [routes.services.root()];
  for (const slug of new Set(slugs)) {
    if (slug) paths.push(routes.services.category(slug), routes.services.request(slug));
  }
  return paths;
}

/** Catalog changes (add, rename, move, on/off, delete) also show on /firmalar and firm pages (category names, filter list). */
const CATALOG_TAGS: PublicCacheTag[] = ["services", "businesses"];

/** Admin list + detail and the public pages of the category, its parent and any previous slug / parent. */
async function revalidateCategory(
  supabase: AdminContext["supabase"],
  id: string,
  previousSlugs: Array<string | null | undefined> = [],
  tags: PublicCacheTag[] = ["services"],
) {
  revalidatePath(routes.admin.serviceCategories());
  revalidatePath(routes.admin.serviceCategory(id));
  const slugs = [...previousSlugs];
  const { data } = await supabase.from("service_categories").select("slug,parent_id").eq("id", id).maybeSingle();
  if (data?.slug) slugs.push(data.slug);
  if (data?.parent_id) {
    const { data: parent } = await supabase.from("service_categories").select("slug").eq("id", data.parent_id).maybeSingle();
    if (parent?.slug) slugs.push(parent.slug);
  }
  // Public pages live on another deployment (own cache) when the admin runs as a separate site.
  await revalidatePublic({ tags, paths: servicePaths(slugs) });
}

const patchSchema = z
  .object({
    id: zId,
    active: z.boolean().optional(),
    popular: z.boolean().optional(),
    auto_dispatch: z.boolean().optional(),
    max_providers: z.number().int("Tam sayı gir.").min(1, "Kabul limiti en az 1 olmalı.").max(10, "Kabul limiti en fazla 10 olabilir.").optional(),
    notify_pool_size: z.number().int("Tam sayı gir.").min(1, "Bildirim havuzu en az 1 olmalı.").max(50, "Bildirim havuzu en fazla 50 olabilir.").optional(),
  })
  .strict();

/** Toggle active / popular / auto_dispatch or change max_providers / notify_pool_size. */
export async function updateServiceCategoryAction(input: z.input<typeof patchSchema>): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = patchSchema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const { id, ...patch } = parsed.data;
    if (Object.keys(patch).length === 0) return fail("Değişiklik yok.");
    const { data: current, error: cErr } = await supabase
      .from("service_categories")
      .select("max_providers,notify_pool_size,parent_id")
      .eq("id", id)
      .maybeSingle();
    if (cErr) return dbFail(cErr);
    if (!current) return fail("Kategori bulunamadı.", "not_found");
    // A category without its own limit uses the admin default (2026091332).
    const max = patch.max_providers ?? current.max_providers ?? (await getAppSettings()).maxProvidersDefault;
    const pool = patch.notify_pool_size ?? current.notify_pool_size;
    if (pool < max) return fail(`Bildirim havuzu (${pool}), kabul limitinden (${max}) küçük olamaz.`, "pool_lt_max");
    const { error } = await supabase.from("service_categories").update(patch).eq("id", id);
    if (error) return dbFail(error);
    await revalidateCategory(supabase, id, [], patch.active !== undefined ? CATALOG_TAGS : ["services"]);
    const msg =
      patch.auto_dispatch !== undefined
        ? patch.auto_dispatch
          ? "Otomatik eşleştirme açıldı: yeni talepler hemen firmalara gider."
          : "Concierge modu: yeni talepler önce yönetici incelemesine düşer."
        : "Kategori güncellendi.";
    return ok(null, msg);
  });
}

const SORT_MSG = "Sıra 0 ile 10000 arasında bir tam sayı olmalı.";
const categoryFields = {
  parentId: zId.nullable(),
  name: z.string().trim().min(2, "Kategori adı en az 2 karakter olmalı.").max(60, "Kategori adı en fazla 60 karakter olabilir."),
  /** Normalised with tr_slug and checked for uniqueness in the database; empty = from the name. */
  slug: z.string().trim().max(60, "Adres (slug) en fazla 60 karakter olabilir."),
  icon: z.string().trim().regex(/^[a-z0-9-]{1,40}$/, "Simge adı geçersiz.").nullable(),
  description: z.string().trim().max(300, "Açıklama en fazla 300 karakter olabilir."),
  synonyms: z
    .array(z.string().trim().max(40, "Bir arama kelimesi en fazla 40 karakter olabilir."))
    .max(30, "En fazla 30 arama kelimesi ekleyebilirsin."),
  sort: z.coerce.number().int(SORT_MSG).min(0, SORT_MSG).max(10000, SORT_MSG),
};
const createSchema = z.object({ ...categoryFields, active: z.boolean() }).strict();
const editSchema = z.object({ id: zId, ...categoryFields }).strict();

type SaveResult =
  | { ok: true; id: string; slug: string; created: boolean; old_slug: string | null; old_parent_slug: string | null }
  | { ok: false; reason: "not_found" };

async function saveCategory(
  supabase: AdminContext["supabase"],
  id: string | null,
  v: z.output<typeof editSchema> | z.output<typeof createSchema>,
): Promise<ActionResult<{ id: string; slug: string }>> {
  const { data, error } = await supabase.rpc("admin_save_service_category", {
    // null = new category / main category (generated types do not mark uuid args nullable).
    p_id: id as string,
    p_parent_id: v.parentId as string,
    p_name: v.name,
    p_slug: v.slug || undefined,
    p_icon: v.icon ?? undefined,
    p_description: v.description || undefined,
    p_synonyms: v.synonyms,
    p_sort: v.sort,
    p_active: "active" in v ? v.active : true,
  });
  if (error) return dbFail(error, "Kategori kaydedilemedi.");
  const res = data as unknown as SaveResult | null;
  if (!res?.ok) return fail("Kategori bulunamadı.", "not_found");
  await revalidateCategory(supabase, res.id, [res.old_slug, res.old_parent_slug], CATALOG_TAGS);
  const msg = res.created
    ? "Kategori eklendi."
    : res.old_slug && res.old_slug !== res.slug
      ? `Kategori güncellendi. Yeni adres: ${routes.services.category(res.slug)}`
      : "Kategori güncellendi.";
  return ok({ id: res.id, slug: res.slug }, msg);
}

/** New service category (main or sub). The slug comes from tr_slug and must be unique. */
export async function createServiceCategoryAction(input: z.input<typeof createSchema>): Promise<ActionResult<{ id: string; slug: string }>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    return saveCategory(supabase, null, parsed.data);
  });
}

/** Edit name, slug, parent, icon, description, search words and sort of a category. */
export async function editServiceCategoryAction(input: z.input<typeof editSchema>): Promise<ActionResult<{ id: string; slug: string }>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = editSchema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    return saveCategory(supabase, parsed.data.id, parsed.data);
  });
}

type DeleteResult =
  | { ok: true; slug: string; parent_slug: string | null }
  | { ok: false; reason: "not_found" | "in_use"; children?: number; firms?: number; requests?: number };

/** Deletes an unused category (with its question flows). A category in use is refused (hint in_use): deactivate it instead. */
export async function deleteServiceCategoryAction(input: { id: string }): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const id = zId.safeParse(input.id);
    if (!id.success) return fail("Geçersiz kategori.");
    const { data, error } = await supabase.rpc("admin_delete_service_category", { p_id: id.data });
    if (error) return dbFail(error, "Kategori silinemedi.");
    const res = data as unknown as DeleteResult | null;
    if (!res) return fail("Kategori silinemedi.");
    if (!res.ok) {
      if (res.reason === "not_found") return fail("Kategori bulunamadı.", "not_found");
      const used = [
        res.children ? `${res.children} alt kategori` : null,
        res.firms ? `${res.firms} firma` : null,
        res.requests ? `${res.requests} hizmet talebi` : null,
      ].filter(Boolean);
      return fail(
        `Bu kategori silinemez, bağlı kayıtlar var: ${used.join(", ")}. Silmek yerine pasif yap: kayıtlar korunur, kategori sitede görünmez.`,
        "in_use",
      );
    }
    revalidatePath(routes.admin.serviceCategories());
    revalidatePath(routes.admin.serviceCategory(id.data));
    await revalidatePublic({ tags: CATALOG_TAGS, paths: servicePaths([res.slug, res.parent_slug]) });
    return ok(null, "Kategori silindi.");
  });
}

const optionSchema = z.object({ value: z.string(), label: z.string(), description: z.string().optional() });
const stepSchema = z.object({
  id: z.string(),
  type: z.enum(["single", "multi", "number", "text", "date"]),
  title: z.string(),
  help: z.string().optional(),
  required: z.boolean().optional(),
  options: z.array(optionSchema).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  unit: z.string().optional(),
  placeholder: z.string().optional(),
  multiline: z.boolean().optional(),
  showIf: z.object({ step: z.string(), in: z.array(z.string()) }).optional(),
});
const publishSchema = z.object({ categoryId: zId, steps: z.array(stepSchema).max(40, "Bir akışta en fazla 40 adım olabilir.") });

/** "Yeni sürüm olarak yayınla": validates, cleans and inserts version+1 (previous versions are unpublished, never edited). */
export async function publishFlowAction(input: { categoryId: string; steps: FlowStep[] }): Promise<ActionResult<{ version: number }>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = publishSchema.safeParse(input);
    if (!parsed.success) return fail(`Akış yapısı geçersiz: ${firstIssue(parsed.error)}`);
    const steps = parsed.data.steps as FlowStep[];
    const issues = validateFlowDraft(steps);
    if (issues.length) {
      const first = issues[0];
      return fail(first.stepIndex === null ? first.message : `${first.stepIndex + 1}. adım: ${first.message}`, "invalid_flow");
    }
    const schema = cleanFlowSchema(steps);
    try {
      parseFlowSchema(schema);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Akış geçersiz.", "invalid_flow");
    }
    if (JSON.stringify(schema).length > 100_000) return fail("Akış çok büyük.", "too_large");

    const { data: cat, error: cErr } = await supabase.from("service_categories").select("id,parent_id").eq("id", parsed.data.categoryId).maybeSingle();
    if (cErr) return dbFail(cErr);
    if (!cat) return fail("Kategori bulunamadı.", "not_found");
    if (!cat.parent_id) return fail("Soru akışı yalnızca alt kategoriler için yayınlanabilir.", "not_sub_category");

    const { data, error } = await supabase.rpc("admin_publish_flow", { p_category_id: cat.id, p_schema: schema });
    if (error) return dbFail(error);
    const res = data as { ok?: boolean; version?: number } | null;
    if (!res?.ok || !res.version) return fail("Akış yayınlanamadı.");
    await revalidateCategory(supabase, cat.id);
    return ok({ version: res.version }, `Sürüm ${res.version} yayınlandı. Yeni talepler bu sürümü kullanır.`);
  });
}
