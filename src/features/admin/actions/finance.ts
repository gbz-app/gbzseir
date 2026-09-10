"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { routes } from "@/core/routes";
import { dbFail, withAdmin } from "../server/guard";
import { fail, ok, type ActionResult } from "../lib/action-result";
import { firstIssue, zId } from "../lib/zod";

const optionalText = (max: number, label: string) => z.string().trim().max(max, `${label} en fazla ${max} karakter olabilir.`).optional();

const entrySchema = z.object({
  id: zId.optional(),
  kind: z.enum(["income", "expense"]),
  categoryId: zId.nullable().optional(),
  amount: z.coerce.number().positive("Tutar sıfırdan büyük olmalı.").max(999_999_999, "Tutar çok büyük."),
  vatRate: z.coerce.number().min(0).max(100, "KDV oranı 0-100 arası olmalı."),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih seç."),
  description: optionalText(300, "Açıklama"),
  counterparty: optionalText(120, "Karşı taraf"),
  businessId: zId.nullable().optional(),
  paymentMethod: z.enum(["nakit", "havale", "kart", "diger"]),
  documentUrl: z.union([z.literal(""), z.string().trim().url("Geçerli bir bağlantı gir.").max(500)]).optional(),
});

function revalidateFinance() {
  revalidatePath(routes.admin.finance());
}

/** Gelir / gider kaydı ekle ya da güncelle. */
export async function saveFinanceEntryAction(input: z.input<typeof entrySchema>): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = entrySchema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const v = parsed.data;
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
      document_url: v.documentUrl || null,
    };
    const { error } = v.id ? await supabase.from("finance_entries").update(row).eq("id", v.id) : await supabase.from("finance_entries").insert(row);
    if (error) return dbFail(error);
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
    revalidateFinance();
    return ok(null, "Kayıt silindi.");
  });
}

const categorySchema = z.object({
  kind: z.enum(["income", "expense"]),
  name: z.string().trim().min(1, "Kategori adı yaz.").max(60, "Kategori adı en fazla 60 karakter olabilir."),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Renk seç."),
});

export async function createFinanceCategoryAction(input: z.input<typeof categorySchema>): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = categorySchema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const { data: max } = await supabase.from("finance_categories").select("sort").eq("kind", parsed.data.kind).order("sort", { ascending: false }).limit(1).maybeSingle();
    const { error } = await supabase.from("finance_categories").insert({ ...parsed.data, sort: (max?.sort ?? 0) + 1 });
    if (error) return dbFail(error, "Kategori eklenemedi.");
    revalidateFinance();
    return ok(null, "Kategori eklendi.");
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
