"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { routes } from "@/core/routes";
import { CONTENT_CACHE_TAGS } from "@/features/content/cache-tags";
import { testNewsFeed } from "@/features/content/news/get-news";
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
  // Omitted by the active switch: the note stays as it is.
  permissionNote: z.string().trim().max(500, "İzin notu en fazla 500 karakter olabilir.").optional(),
});

async function refreshNews() {
  revalidatePath(routes.admin.news());
  await revalidatePublic({ tags: [CONTENT_CACHE_TAGS.news], paths: [routes.content.news(), routes.home()] });
}

function feedTestError(e: unknown): string {
  if (!(e instanceof Error)) return "Akış okunamadı.";
  if (e.name === "TimeoutError" || e.name === "AbortError") return "Akış zamanında yanıt vermedi.";
  if (e.message.startsWith("HTTP ")) return `Akış açılamadı (${e.message}).`;
  return /^(Akış|RSS)/.test(e.message) ? e.message : "Akış okunamadı.";
}

export async function saveNewsSourceAction(input: z.input<typeof sourceSchema>): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = sourceSchema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const v = parsed.data;
    let feedChanged = false;
    if (v.id) {
      const { data: prev, error: prevError } = await supabase.from("news_sources").select("feed_url").eq("id", v.id).maybeSingle();
      if (prevError) return dbFail(prevError, "Kaynak kaydedilemedi.");
      if (!prev) return fail("Kaynak bulunamadı.");
      feedChanged = prev.feed_url !== v.feedUrl;
    }
    const row = {
      name: v.name,
      site_url: v.siteUrl,
      feed_url: v.feedUrl,
      active: v.active,
      ...(v.permissionNote === undefined ? {} : { permission_note: v.permissionNote || null }),
      // A new feed address starts with a clean status.
      ...(feedChanged ? { last_error: null, fail_count: 0, failing_since: null } : {}),
    };
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

/** Fetch the feed once, the way the scheduled job does, and report how many headlines it has (stores nothing). */
export async function testNewsFeedAction(input: { feedUrl: string; name?: string }): Promise<ActionResult<{ count: number; titles: string[] }>> {
  return withAdmin(async () => {
    const url = httpUrl("RSS adresi").safeParse(input.feedUrl);
    if (!url.success) return fail(firstIssue(url.error));
    try {
      const items = await testNewsFeed(url.data, input.name || "Test");
      if (!items.length) return fail("Akışta haber bulunamadı. RSS adresini kontrol et.");
      return ok({ count: items.length, titles: items.slice(0, 3).map((i) => i.title) }, `${items.length} başlık bulundu.`);
    } catch (e) {
      return fail(feedTestError(e));
    }
  });
}

type RefreshStart = { started?: boolean; reason?: "no_sources" | "recent" | "pending" | "no_secret" };

/**
 * "Şimdi çek": queues the same call as the 20-minute job (admin_refresh_news_now -> pg_net -> the public app's
 * /api/cron/news, which fetches every active feed, stores the headlines and expires the public news pages). Returns at
 * once; `queued` tells the button to reload /admin/haberler a few seconds later. The admin site needs no service role.
 */
export async function refreshNewsAction(): Promise<ActionResult<{ queued: boolean }>> {
  return withAdmin<{ queued: boolean }>(async ({ supabase }) => {
    const { data: raw, error } = await supabase.rpc("admin_refresh_news_now");
    if (error) return dbFail(error, "Haber çekimi başlatılamadı. Tekrar dene.");
    const data = raw as RefreshStart | null;
    revalidatePath(routes.admin.news());
    if (data?.started) return ok({ queued: true }, "Çekim başladı. Başlıklar birkaç saniye içinde güncellenir.");
    switch (data?.reason) {
      case "pending":
        return ok({ queued: true }, "Çekim zaten sırada. Başlıklar birkaç saniye içinde güncellenir.");
      case "recent":
        return ok({ queued: false }, "Başlıklar az önce çekildi. Bir dakika sonra tekrar deneyebilirsin.");
      case "no_sources":
        return ok({ queued: false }, "Aktif haber kaynağı yok.");
      case "no_secret":
        return fail("Çekim başlatılamadı: zamanlanmış çekimin anahtarı tanımlı değil. Başlıklar şimdilik sayfa ziyaretlerinde çekiliyor.");
      default:
        return fail("Haber çekimi başlatılamadı. Tekrar dene.");
    }
  });
}
