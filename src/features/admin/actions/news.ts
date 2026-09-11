"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { routes } from "@/core/routes";
import { CONTENT_CACHE_TAGS } from "@/features/content/cache-tags";
import { parseFeed } from "@/features/content/news/parse";
import { revalidatePublic } from "@/lib/revalidate-public";
import { dbFail, withAdmin } from "../server/guard";
import { fail, ok, type ActionResult } from "../lib/action-result";
import { firstIssue, zId } from "../lib/zod";

const httpUrl = (label: string) =>
  z
    .string()
    .trim()
    .url(`${label} geçerli bir adres olmalı.`)
    .max(400)
    .refine((u) => /^https?:\/\//i.test(u), `${label} http(s) ile başlamalı.`)
    .refine((u) => !/^https?:\/\/(localhost|127\.|10\.|192\.168\.|169\.254\.|\[::1\])/i.test(u), `${label} yerel bir adres olamaz.`);

const sourceSchema = z.object({
  id: zId.optional(),
  name: z.string().trim().min(2, "Kaynak adı yaz.").max(60),
  siteUrl: httpUrl("Site adresi"),
  feedUrl: httpUrl("RSS adresi"),
  active: z.boolean(),
});

async function refreshNews() {
  revalidatePath(routes.admin.news());
  await revalidatePublic({ tags: [CONTENT_CACHE_TAGS.news], paths: [routes.content.news(), routes.home()] });
}

export async function saveNewsSourceAction(input: z.input<typeof sourceSchema>): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = sourceSchema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const v = parsed.data;
    const row = { name: v.name, site_url: v.siteUrl, feed_url: v.feedUrl, active: v.active };
    const { error } = v.id ? await supabase.from("news_sources").update(row).eq("id", v.id) : await supabase.from("news_sources").insert(row);
    if (error) return dbFail(error, "Kaynak kaydedilemedi.");
    await refreshNews();
    return ok(null, v.id ? "Kaynak güncellendi." : "Kaynak eklendi.");
  });
}

export async function deleteNewsSourceAction(input: { id: string }): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const id = zId.safeParse(input.id);
    if (!id.success) return fail("Geçersiz kaynak.");
    const { error } = await supabase.from("news_sources").delete().eq("id", id.data);
    if (error) return dbFail(error);
    await refreshNews();
    return ok(null, "Kaynak ve arşivlenmiş başlıkları silindi.");
  });
}

/** Fetch the feed once and report how many headlines it has (does not store anything). */
export async function testNewsFeedAction(input: { feedUrl: string; name?: string }): Promise<ActionResult<{ count: number; titles: string[] }>> {
  return withAdmin(async () => {
    const url = httpUrl("RSS adresi").safeParse(input.feedUrl);
    if (!url.success) return fail(firstIssue(url.error));
    try {
      const res = await fetch(url.data, {
        headers: { "User-Agent": "GebzemNews/1.0 (admin feed test)", Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.1" },
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
      if (!res.ok) return fail(`Akış açılamadı (HTTP ${res.status}).`);
      const xml = await res.text();
      const items = parseFeed(xml, { id: "test", name: input.name || "Test", siteUrl: url.data });
      if (!items.length) return fail("Akışta haber bulunamadı. RSS adresini kontrol et.");
      return ok({ count: items.length, titles: items.slice(0, 3).map((i) => i.title) }, `${items.length} başlık bulundu.`);
    } catch (e) {
      return fail(e instanceof Error && e.name === "TimeoutError" ? "Akış 8 saniyede yanıt vermedi." : "Akış okunamadı.");
    }
  });
}

export async function refreshNewsAction(): Promise<ActionResult<null>> {
  return withAdmin(async () => {
    await refreshNews();
    return ok(null, "Haberler bir sonraki ziyarette yeniden çekilecek.");
  });
}
