"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { routes } from "@/core/routes";
import { revalidatePublic } from "@/lib/revalidate-public";
import { parseFlowSchema, type FlowStep } from "@/core/flow";
import { dbFail, withAdmin, type AdminContext } from "../server/guard";
import { fail, ok, type ActionResult } from "../lib/action-result";
import { firstIssue, zId } from "../lib/zod";
import { cleanFlowSchema, validateFlowDraft } from "../lib/flow-draft";

async function revalidateCategory(supabase: AdminContext["supabase"], id: string) {
  revalidatePath(routes.admin.serviceCategories());
  revalidatePath(routes.admin.serviceCategory(id));
  const paths: string[] = [routes.services.root()];
  const { data } = await supabase.from("service_categories").select("slug,parent_id").eq("id", id).maybeSingle();
  if (data?.slug) {
    paths.push(routes.services.category(data.slug), routes.services.request(data.slug));
  }
  if (data?.parent_id) {
    const { data: parent } = await supabase.from("service_categories").select("slug").eq("id", data.parent_id).maybeSingle();
    if (parent?.slug) paths.push(routes.services.category(parent.slug));
  }
  // Public pages live on another deployment (own cache) when the admin runs as a separate site.
  await revalidatePublic({ tags: ["services"], paths });
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
    const max = patch.max_providers ?? current.max_providers;
    const pool = patch.notify_pool_size ?? current.notify_pool_size;
    if (pool < max) return fail(`Bildirim havuzu (${pool}), kabul limitinden (${max}) küçük olamaz.`, "pool_lt_max");
    const { error } = await supabase.from("service_categories").update(patch).eq("id", id);
    if (error) return dbFail(error);
    await revalidateCategory(supabase, id);
    const msg =
      patch.auto_dispatch !== undefined
        ? patch.auto_dispatch
          ? "Otomatik eşleştirme açıldı: yeni talepler hemen firmalara gider."
          : "Concierge modu: yeni talepler önce yönetici incelemesine düşer."
        : "Kategori güncellendi.";
    return ok(null, msg);
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
