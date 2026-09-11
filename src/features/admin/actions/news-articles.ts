"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { routes } from "@/core/routes";
import { slugifyTr } from "@/core/tr";
import { revalidatePublic } from "@/lib/revalidate-public";
import { CATEGORY_KEY_RE } from "@/features/business/lib/category-visuals";
import { dbFail, withAdmin, type AdminContext } from "../server/guard";
import { fail, ok, type ActionResult } from "../lib/action-result";
import { firstIssue, zId } from "../lib/zod";

const SLUG_MAX = 120;
const SLUG_ERROR = "Haber adresi oluşturulamadı. Tekrar dene.";
/** news_articles.category references news_categories (2026091363); a foreign key error means the category is gone. */
const CATEGORY_GONE = "Bu kategori artık yok. Sayfayı yenileyip başka bir kategori seç.";

const schema = z
  .object({
    id: zId.optional(),
    title: z.string().trim().min(5, "Başlık en az 5 karakter olmalı.").max(160, "Başlık en fazla 160 karakter olabilir."),
    // A news_categories key (admin-managed); the foreign key checks that it exists.
    category: z.string().regex(CATEGORY_KEY_RE, "Kategori seç."),
    summary: z.string().trim().max(300, "Özet en fazla 300 karakter olabilir.").optional(),
    body: z.string().trim().max(20000, "Haber metni en fazla 20.000 karakter olabilir."),
    coverUrl: z
      .string()
      .trim()
      .url("Kapak fotoğrafı adresi geçersiz.")
      .max(500)
      .refine((u) => u.startsWith("https://"), "Kapak fotoğrafı adresi https olmalı.")
      .nullable(),
    published: z.boolean(),
  })
  .refine((v) => !v.published || v.body.length > 0, { message: "Yayınlamak için haber metnini yaz.", path: ["body"] });

/** Plain text: unix line breaks, no trailing spaces, at most one blank line between paragraphs. */
function normalizeBody(body: string): string {
  return body
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Slug from the Turkish title (ş->s ğ->g ı->i ö->o ü->u ç->c, lowercase, other characters -> "-"),
 * made unique against existing slugs with -2, -3... null when the lookup fails.
 */
async function uniqueSlug(supabase: AdminContext["supabase"], title: string, exceptId?: string): Promise<string | null> {
  // Room for a "-NNN" suffix within the 120 character limit.
  const base = slugifyTr(title, SLUG_MAX - 5) || "haber";
  let query = supabase.from("news_articles").select("slug").or(`slug.eq.${base},slug.like.${base}-*`);
  if (exceptId) query = query.neq("id", exceptId);
  const { data, error } = await query.limit(1000);
  if (error) {
    console.error("[admin news-articles] slug lookup", error.code, error.message);
    return null;
  }
  const taken = new Set((data ?? []).map((r) => r.slug));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

async function revalidateArticles(slugs: string[]) {
  revalidatePath(routes.admin.newsArticles());
  await revalidatePublic({
    tags: ["content:articles"],
    paths: [routes.home(), routes.content.news(), ...[...new Set(slugs)].map((s) => routes.content.newsArticle(s))],
  });
}

/** Haber yazısı ekle / düzenle. published_at is set once, when the story is first published. */
export async function saveNewsArticleAction(input: z.input<typeof schema>): Promise<ActionResult<{ id: string; slug: string }>> {
  return withAdmin(async ({ supabase, userId }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const v = parsed.data;
    const now = new Date().toISOString();
    const status = v.published ? "published" : "draft";
    const fields = {
      title: v.title,
      category: v.category,
      summary: v.summary ? v.summary.replace(/\s+/g, " ") : null,
      body: normalizeBody(v.body),
      cover_url: v.coverUrl,
      status,
    };

    if (v.id) {
      const { data: current, error: cErr } = await supabase.from("news_articles").select("slug,title,status,published_at").eq("id", v.id).maybeSingle();
      if (cErr) return dbFail(cErr);
      if (!current) return fail("Haber bulunamadı.", "not_found");
      // Once published the address never changes (shared links keep working); a never-published draft follows its title.
      let slug = current.slug;
      if (!current.published_at && current.title !== v.title) {
        const next = await uniqueSlug(supabase, v.title, v.id);
        if (!next) return fail(SLUG_ERROR);
        slug = next;
      }
      const { error } = await supabase
        .from("news_articles")
        .update({ ...fields, slug, published_at: current.published_at ?? (v.published ? now : null), updated_at: now })
        .eq("id", v.id);
      if (error) return error.code === "23503" ? fail(CATEGORY_GONE) : dbFail(error);
      await revalidateArticles([slug, current.slug]);
      const message = current.status === status ? "Haber güncellendi." : v.published ? "Haber yayınlandı." : "Haber yayından kaldırıldı.";
      return ok({ id: v.id, slug }, message);
    }

    const slug = await uniqueSlug(supabase, v.title);
    if (!slug) return fail(SLUG_ERROR);
    const { data, error } = await supabase
      .from("news_articles")
      .insert({ ...fields, slug, published_at: v.published ? now : null, author_id: userId })
      .select("id")
      .single();
    if (error) return error.code === "23503" ? fail(CATEGORY_GONE) : dbFail(error, "Haber eklenemedi.");
    await revalidateArticles([slug]);
    return ok({ id: data.id, slug }, v.published ? "Haber yayınlandı." : "Taslak kaydedildi.");
  });
}

export async function deleteNewsArticleAction(input: { id: string }): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const id = zId.safeParse(input.id);
    if (!id.success) return fail("Geçersiz haber.");
    const { data, error } = await supabase.from("news_articles").delete().eq("id", id.data).select("slug").maybeSingle();
    if (error) return dbFail(error);
    if (!data) return fail("Haber bulunamadı.", "not_found");
    await revalidateArticles([data.slug]);
    return ok(null, "Haber silindi.");
  });
}
