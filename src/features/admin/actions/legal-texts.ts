"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { revalidatePublic } from "@/lib/revalidate-public";
import { LEGAL_BODY_MAX, LEGAL_PATHS, LEGAL_SLUGS, LEGAL_TITLE_MAX, LEGAL_VERSION_RE, isLegalSlug, legalAdminPath, type LegalSlug } from "@/features/legal/meta";
import { dbFail, withAdmin, type AdminContext } from "../server/guard";
import { fail, ok, type ActionResult } from "../lib/action-result";
import { firstIssue, zId } from "../lib/zod";

const schema = z
  .object({
    id: zId.optional(),
    slug: z.enum(LEGAL_SLUGS, { message: "Metin türü seç." }),
    version: z.string().trim().regex(LEGAL_VERSION_RE, "Sürüm en fazla 20 karakter olabilir; harf, rakam, nokta ve tire kullan (örn. 1.0)."),
    title: z.string().trim().min(3, "Başlık en az 3 karakter olmalı.").max(LEGAL_TITLE_MAX, "Başlık en fazla 160 karakter olabilir."),
    body: z.string().trim().max(LEGAL_BODY_MAX, "Metin en fazla 60.000 karakter olabilir."),
    pendingReview: z.boolean(),
    published: z.boolean(),
  })
  .refine((v) => !v.published || v.body.length >= 50, { message: "Yayınlamak için metni yaz.", path: ["body"] });

type PgError = { code?: string; message?: string; hint?: string | null } | null;

const legalTexts = (supabase: AdminContext["supabase"]) => supabase.from("legal_texts");

/** Plain text: unix line breaks, no trailing spaces, at most one blank line between paragraphs. */
function normalizeBody(body: string): string {
  return body
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function saveFail(error: PgError) {
  return error?.code === "23505" ? fail("Bu metin için bu sürüm numarası zaten var.", "duplicate_version") : dbFail(error);
}

/** Admin list always; the public page only when what it shows may have changed. */
async function revalidateLegal(slug: LegalSlug, publicPage: boolean) {
  revalidatePath(legalAdminPath());
  if (publicPage) await revalidatePublic({ paths: [LEGAL_PATHS[slug]] });
}

/**
 * Add / edit a version of a legal text. Drafts can change freely; publishing is final (the DB stamps published_at and
 * refuses later edits), so a published version only toggles its "hukuki inceleme bekliyor" note.
 */
export async function saveLegalTextAction(input: z.input<typeof schema>): Promise<ActionResult<{ id: string }>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const v = parsed.data;
    const now = new Date().toISOString();
    const fields = { version: v.version, title: v.title.replace(/\s+/g, " "), body_md: normalizeBody(v.body), pending_review: v.pendingReview };

    if (v.id) {
      const { data: current, error: cErr } = await legalTexts(supabase).select("slug,published_at").eq("id", v.id).maybeSingle();
      if (cErr) return dbFail(cErr);
      if (!current || !isLegalSlug(current.slug)) return fail("Metin bulunamadı.", "not_found");
      if (current.published_at) {
        const { error } = await legalTexts(supabase).update({ pending_review: v.pendingReview }).eq("id", v.id);
        if (error) return dbFail(error);
        await revalidateLegal(current.slug, true);
        return ok({ id: v.id }, v.pendingReview ? "Taslak notu açıldı." : "Taslak notu kaldırıldı.");
      }
      const { error } = await legalTexts(supabase)
        .update({ ...fields, published_at: v.published ? now : null })
        .eq("id", v.id);
      if (error) return saveFail(error);
      await revalidateLegal(current.slug, v.published);
      return ok({ id: v.id }, v.published ? "Sürüm yayınlandı." : "Taslak kaydedildi.");
    }

    const { data, error } = await legalTexts(supabase)
      .insert({ ...fields, slug: v.slug, published_at: v.published ? now : null })
      .select("id")
      .single();
    if (error) return saveFail(error);
    await revalidateLegal(v.slug, v.published);
    return ok({ id: data.id }, v.published ? "Sürüm yayınlandı." : "Taslak kaydedildi.");
  });
}

/** Delete an unpublished draft. Published versions stay forever (proof of what users accepted). */
export async function deleteLegalTextAction(input: { id: string }): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const id = zId.safeParse(input.id);
    if (!id.success) return fail("Geçersiz metin.");
    const { data: row, error } = await legalTexts(supabase).delete().eq("id", id.data).is("published_at", null).select("slug").maybeSingle();
    if (error) return dbFail(error);
    if (!row || !isLegalSlug(row.slug)) return fail("Taslak bulunamadı. Yayınlanan sürümler silinemez.", "not_found");
    await revalidateLegal(row.slug, false);
    return ok(null, "Taslak silindi.");
  });
}
