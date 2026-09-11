"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { routes } from "@/core/routes";
import { dbFail, withAdmin, type AdminContext } from "../server/guard";
import { fail, ok, type ActionResult } from "../lib/action-result";
import { firstIssue, zId } from "../lib/zod";

const optionalText = (max: number, label: string) => z.string().trim().max(max, `${label} en fazla ${max} karakter olabilir.`).optional();

/** Receipts live in private-docs/finance/<entry id>/<file> (admin-only storage policies, 2026091334). */
const RECEIPT_BUCKET = "private-docs";
const receiptPathOk = (entryId: string, path: string) => new RegExp(`^finance/${entryId}/[A-Za-z0-9_-]{1,80}\\.(pdf|jpg|png|webp)$`).test(path);

const entrySchema = z.object({
  id: zId.optional(),
  /** Id for a new entry, chosen by the client so the receipt can be uploaded under it before the insert. */
  newId: zId.optional(),
  kind: z.enum(["income", "expense"]),
  categoryId: zId.nullable().optional(),
  amount: z.coerce.number().positive("Tutar sıfırdan büyük olmalı.").max(999_999_999, "Tutar çok büyük."),
  vatRate: z.coerce.number().min(0).max(100, "KDV oranı 0-100 arası olmalı."),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih seç."),
  description: optionalText(300, "Açıklama"),
  counterparty: optionalText(120, "Karşı taraf"),
  businessId: zId.nullable().optional(),
  paymentMethod: z.enum(["nakit", "havale", "kart", "diger"]),
  /** undefined: keep the current receipt, null: remove it, string: newly uploaded receipt path. */
  receiptPath: z.string().max(200).nullable().optional(),
});

function revalidateFinance() {
  revalidatePath(routes.admin.finance());
}

/** Best-effort removal of receipt files (a leftover file is harmless; the row is the source of truth). */
async function removeReceipts(supabase: AdminContext["supabase"], paths: string[]) {
  if (!paths.length) return;
  try {
    await supabase.storage.from(RECEIPT_BUCKET).remove(paths);
  } catch {
    // ignore
  }
}

/** Gelir / gider kaydı ekle ya da güncelle. */
export async function saveFinanceEntryAction(input: z.input<typeof entrySchema>): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = entrySchema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const v = parsed.data;
    const entryId = v.id ?? v.newId;
    if (v.receiptPath && (!entryId || !receiptPathOk(entryId, v.receiptPath))) return fail("Belge yüklenemedi. Sayfayı yenileyip tekrar dene.");
    const row = {
      kind: v.kind,
      category_id: v.categoryId ?? null,
      amount: Math.round(v.amount * 100) / 100,
      vat_rate: v.vatRate,
      occurred_on: v.occurredOn,
      description: v.description || null,
      counterparty: v.counterparty || null,
      business_id: v.businessId ?? null,
      payment_method: v.paymentMethod,
      ...(v.receiptPath !== undefined ? { document_path: v.receiptPath } : {}),
    };

    if (v.id) {
      const { data: before, error: bErr } = await supabase.from("finance_entries").select("document_path").eq("id", v.id).maybeSingle();
      if (bErr) return dbFail(bErr);
      if (!before) return fail("Kayıt bulunamadı.", "not_found");
      const { error } = await supabase.from("finance_entries").update(row).eq("id", v.id);
      if (error) return dbFail(error);
      const oldPath = before.document_path;
      if (v.receiptPath !== undefined && oldPath && oldPath !== v.receiptPath) await removeReceipts(supabase, [oldPath]);
    } else {
      const { error } = await supabase.from("finance_entries").insert({ ...row, ...(v.newId ? { id: v.newId } : {}) });
      if (error) return dbFail(error);
    }
    revalidateFinance();
    return ok(null, v.id ? "Kayıt güncellendi." : v.kind === "income" ? "Gelir eklendi." : "Gider eklendi.");
  });
}

export async function deleteFinanceEntryAction(input: { id: string }): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const id = zId.safeParse(input.id);
    if (!id.success) return fail("Geçersiz kayıt.");
    const { data, error } = await supabase.from("finance_entries").delete().eq("id", id.data).select("id").maybeSingle();
    if (error) return dbFail(error);
    if (!data) return fail("Kayıt bulunamadı.", "not_found");
    // Remove every file in the entry's receipt folder (also leftovers of an interrupted save).
    try {
      const { data: files } = await supabase.storage.from(RECEIPT_BUCKET).list(`finance/${id.data}`, { limit: 100 });
      await removeReceipts(supabase, (files ?? []).map((f) => `finance/${id.data}/${f.name}`));
    } catch {
      // ignore
    }
    revalidateFinance();
    return ok(null, "Kayıt silindi.");
  });
}

/** Short-lived signed URL (2 minutes) for an entry's receipt in the private-docs bucket. */
export async function getFinanceReceiptUrlAction(input: { id: string }): Promise<ActionResult<{ url: string }>> {
  return withAdmin(async ({ supabase }) => {
    const id = zId.safeParse(input.id);
    if (!id.success) return fail("Geçersiz kayıt.");
    const { data: entry, error } = await supabase.from("finance_entries").select("document_path").eq("id", id.data).maybeSingle();
    if (error) return dbFail(error);
    const path = entry?.document_path;
    if (!path) return fail("Belge bulunamadı.", "not_found");
    const { data, error: sErr } = await supabase.storage.from(RECEIPT_BUCKET).createSignedUrl(path, 120);
    if (sErr || !data?.signedUrl) return fail("Belge bağlantısı oluşturulamadı. Dosya silinmiş olabilir.", "storage");
    return ok({ url: data.signedUrl }, "Belge bağlantısı 2 dakika geçerli.");
  });
}

const categoryName = z.string().trim().min(1, "Kategori adı yaz.").max(60, "Kategori adı en fazla 60 karakter olabilir.");
const categoryColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Renk seç.");
const categorySchema = z.object({ kind: z.enum(["income", "expense"]), name: categoryName, color: categoryColor });
const categoryUpdateSchema = z.object({ id: zId, name: categoryName, color: categoryColor });

export async function createFinanceCategoryAction(input: z.input<typeof categorySchema>): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = categorySchema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const { data: max } = await supabase.from("finance_categories").select("sort").eq("kind", parsed.data.kind).order("sort", { ascending: false }).limit(1).maybeSingle();
    const { error } = await supabase.from("finance_categories").insert({ ...parsed.data, sort: (max?.sort ?? 0) + 1 });
    if (error) return error.code === "23505" ? fail("Bu adla bir kategori zaten var.") : dbFail(error, "Kategori eklenemedi.");
    revalidateFinance();
    return ok(null, "Kategori eklendi.");
  });
}

/** Rename / recolour a category (its entries show the new name; the kind never changes). */
export async function updateFinanceCategoryAction(input: z.input<typeof categoryUpdateSchema>): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = categoryUpdateSchema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const { id, name, color } = parsed.data;
    const { data, error } = await supabase.from("finance_categories").update({ name, color }).eq("id", id).select("id").maybeSingle();
    if (error) return error.code === "23505" ? fail("Bu adla bir kategori zaten var.") : dbFail(error, "Kategori kaydedilemedi.");
    if (!data) return fail("Kategori bulunamadı.", "not_found");
    revalidateFinance();
    return ok(null, "Kategori kaydedildi.");
  });
}

/** Delete an unused category. A category with entries is blocked (FK restrict); hide it instead. */
export async function deleteFinanceCategoryAction(input: { id: string }): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const id = zId.safeParse(input.id);
    if (!id.success) return fail("Geçersiz kategori.");
    const inUse = (n: number | null) => fail(`Bu kategori ${n ? `${n} kayıtta ` : ""}kullanılıyor; silinemez. Yeni kayıtlarda görünmesin istersen gizle.`, "in_use");
    const { count, error: cErr } = await supabase.from("finance_entries").select("id", { count: "exact", head: true }).eq("category_id", id.data);
    if (cErr) return dbFail(cErr);
    if (count) return inUse(count);
    const { data, error } = await supabase.from("finance_categories").delete().eq("id", id.data).select("id").maybeSingle();
    if (error) return error.code === "23503" ? inUse(null) : dbFail(error, "Kategori silinemedi.");
    if (!data) return fail("Kategori bulunamadı.", "not_found");
    revalidateFinance();
    return ok(null, "Kategori silindi.");
  });
}

export async function setFinanceCategoryActiveAction(input: { id: string; active: boolean }): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const id = zId.safeParse(input.id);
    if (!id.success) return fail("Geçersiz kategori.");
    const { error } = await supabase.from("finance_categories").update({ is_active: !!input.active }).eq("id", id.data);
    if (error) return dbFail(error);
    revalidateFinance();
    return ok(null, input.active ? "Kategori açıldı." : "Kategori gizlendi.");
  });
}
