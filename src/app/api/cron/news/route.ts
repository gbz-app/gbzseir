import { NextResponse } from "next/server";
import { routes } from "@/core/routes";
import { CONTENT_CACHE_TAGS } from "@/features/content/cache-tags";
import { refreshNewsFeeds, type NewsRefreshResult } from "@/features/content/news/get-news";
import { revalidatePublic } from "@/lib/revalidate-public";
import { isCronAuthorized } from "@/lib/server/cron-auth";

/**
 * Fetches every active news feed and stores the headlines and each feed's status (last_error, fail_count,
 * failing_since), then expires the news caches so /haberler and the home widget read the new rows.
 *
 * Called every 20 minutes by the pg_cron job `gebzem-refresh-news` through pg_net (header `x-cron-secret` = CRON_SECRET,
 * from Supabase Vault 'gebzem_push_webhook_secret'). Pages fetch the feeds themselves only when this job has not run
 * for 45 minutes.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

  let result: NewsRefreshResult;
  try {
    result = await refreshNewsFeeds();
  } catch (e) {
    console.error("[cron/news] sources could not be read", e);
    return NextResponse.json({ ok: false, error: "Haber kaynakları okunamadı" }, { status: 500 });
  }

  await revalidatePublic({ tags: [CONTENT_CACHE_TAGS.news], paths: [routes.content.news(), routes.home()] });

  if (result.failed.length) {
    console.warn(`[cron/news] ${result.failed.length}/${result.sources} feed(s) failed: ${result.failed.map((f) => `${f.name} (${f.error})`).join(", ")}`);
  }
  if (result.saveError) console.error(`[cron/news] saving failed: ${result.saveError}`);

  const { saveError, ...summary } = result;
  return NextResponse.json(
    { ok: !saveError, ...summary, ...(saveError ? { error: "Başlıklar kaydedilemedi" } : {}) },
    { status: saveError ? 500 : 200, headers: { "Cache-Control": "no-store" } },
  );
}

export const POST = handle;
export const GET = handle;
