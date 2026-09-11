import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createHash } from "node:crypto";
import { SITE_URL } from "@/config/site";
import { routes } from "@/core/routes";
import { createAdminClient, type AdminSupabase } from "@/lib/supabase/admin";
import { CONTENT_CACHE_TAGS } from "../cache-tags";
import { createPublicClient } from "../server/public-client";
import {
  hashString,
  inferCategory,
  isLocalText,
  NEWS_CATEGORY_ORDER,
  parseFeed,
  safeHttpUrl,
  selectNews,
  titleKey,
  type NewsCategory,
  type NewsItem,
  type NewsSourceRef,
} from "./parse";

/** Feeds are fetched every 20 minutes (pg_cron job gebzem-refresh-news -> /api/cron/news); pages read the stored rows. */
export const NEWS_REVALIDATE_SECONDS = 1200;

const FEED_TIMEOUT_MS = 6_000;
const RETRY_DELAY_MS = 1_500;
const PERSIST_TIMEOUT_MS = 4_000;
const MAX_FEED_BYTES = 3_000_000;
const ARCHIVE_DAYS = 30;
/** Stored rows are used while the cron ran within this window (two missed runs); after that the page fetches the feeds. */
const STORED_FRESH_MS = 45 * 60_000;
const STORED_LIMIT = 500;
// WAF and rate-limit refusals are often temporary: one retry.
const RETRY_STATUSES = new Set([403, 429, 500, 502, 503, 504]);
// Header values must be ASCII. Browser-like because some publisher WAFs refuse bot-only agents; still names us and /kaynaklar.
const USER_AGENT = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 GebzemNews/1.0 (+${SITE_URL}${routes.content.sources()})`;
const FEED_HEADERS = {
  "User-Agent": USER_AGENT,
  Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.1",
  "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.5",
};

export type NewsResult = {
  items: NewsItem[];
  sources: NewsSourceRef[];
  /** Feeds that answered with at least one item. */
  okCount: number;
  fetchedAt: string;
  /** All feeds failed and the list comes from the last stored headlines. */
  fromArchive: boolean;
};

/** One fetch of every active feed (cron or the admin "Şimdi çek" button). */
export type NewsRefreshResult = {
  fetchedAt: string;
  sources: number;
  /** Feeds that answered with at least one item. */
  okCount: number;
  failed: Array<{ name: string; error: string }>;
  /** Headline rows written (new or updated). */
  stored: number;
  /** Saving headlines or feed status failed; null when everything was stored. */
  saveError: string | null;
};

type SourceRow = { id: string; name: string; site_url: string; feed_url: string };
type FetchRun = { sources: SourceRow[]; settled: PromiseSettledResult<NewsItem[]>[]; fetchedAt: string };
type ItemRow = {
  source_id: string;
  guid: string;
  title: string;
  summary: string | null;
  url: string;
  published_at: string | null;
  title_hash: string;
  category: NewsCategory;
};
function errorText(e: unknown): string {
  if (e instanceof Error) {
    if (e.name === "TimeoutError" || e.name === "AbortError") return `Zaman aşımı (${FEED_TIMEOUT_MS / 1000} sn)`;
    return e.message.slice(0, 200) || "Bilinmeyen hata";
  }
  return "Bilinmeyen hata";
}

function sourceError(r: PromiseSettledResult<NewsItem[]>): string | null {
  if (r.status === "rejected") return errorText(r.reason);
  return r.value.length ? null : "Akışta haber bulunamadı";
}

function isCategory(v: string | null): v is NewsCategory {
  return !!v && (NEWS_CATEGORY_ORDER as string[]).includes(v);
}

function detectCharset(contentType: string | null, head: string): string {
  const m = /charset=["']?([\w-]+)/i.exec(contentType ?? "") ?? /<\?xml[^>]*encoding\s*=\s*["']([\w-]+)["']/i.exec(head);
  return (m?.[1] ?? "utf-8").toLowerCase();
}

/** GET a feed. `fresh` skips the HTTP data cache (cron, admin); page renders keep it. */
async function requestFeed(url: string, fresh: boolean): Promise<Response> {
  const init = (): RequestInit => ({
    headers: FEED_HEADERS,
    redirect: "follow",
    signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
    ...(fresh ? { cache: "no-store" as const } : { next: { revalidate: NEWS_REVALIDATE_SECONDS, tags: [CONTENT_CACHE_TAGS.news] } }),
  });
  const res = await fetch(url, init());
  if (res.ok || !RETRY_STATUSES.has(res.status)) return res;
  await res.body?.cancel().catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  return fetch(url, init());
}

async function fetchFeed(source: SourceRow, fresh: boolean): Promise<NewsItem[]> {
  const res = await requestFeed(source.feed_url, fresh);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_FEED_BYTES) throw new Error("Akış çok büyük");
  const bytes = new Uint8Array(buf);
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 300));
  let xml: string;
  try {
    xml = new TextDecoder(detectCharset(res.headers.get("content-type"), head)).decode(bytes);
  } catch {
    xml = new TextDecoder("utf-8").decode(bytes);
  }
  return parseFeed(xml, { id: source.id, name: source.name, siteUrl: source.site_url });
}

async function fetchAll(sources: SourceRow[], fresh: boolean): Promise<FetchRun> {
  const settled = await Promise.allSettled(sources.map((s) => fetchFeed(s, fresh)));
  return { sources, settled, fetchedAt: new Date().toISOString() };
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<undefined>((resolve) => (timer = setTimeout(() => resolve(undefined), ms)))]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Stores the headline rows (title + <=280 char summary + link only, never full text) and each feed's status
 * (news_record_fetch: last_error, fail_count, failing_since), so pages can read them and admins see failing feeds.
 * Rows older than 30 days are pruned.
 */
async function persist(admin: AdminSupabase, run: FetchRun): Promise<{ stored: number; error: string | null }> {
  const cutoffIso = new Date(Date.now() - ARCHIVE_DAYS * 86_400_000).toISOString();

  const rows = new Map<string, ItemRow>();
  for (const r of run.settled) {
    if (r.status !== "fulfilled") continue;
    for (const item of r.value) {
      if (!item.publishedAt || item.publishedAt < cutoffIso) continue;
      rows.set(`${item.sourceId}|${item.guid}`, {
        source_id: item.sourceId,
        guid: item.guid,
        title: item.title,
        summary: item.summary,
        url: item.url,
        published_at: item.publishedAt,
        title_hash: createHash("sha1").update(titleKey(item.title)).digest("hex").slice(0, 16),
        category: item.category,
      });
    }
  }

  const results = run.sources.map((source, i) => ({ id: source.id, error: sourceError(run.settled[i]) }));
  const [upserted, recorded, pruned] = await Promise.all([
    rows.size ? admin.from("news_items").upsert([...rows.values()], { onConflict: "source_id,guid" }) : Promise.resolve({ error: null }),
    admin.rpc("news_record_fetch", { p_fetched_at: run.fetchedAt, p_results: results }),
    admin.from("news_items").delete().lt("published_at", cutoffIso),
  ]);
  const error = upserted.error?.message ?? recorded.error?.message ?? pruned.error?.message ?? null;
  return { stored: upserted.error ? 0 : rows.size, error };
}

/** Stored headlines of active sources from the last 30 days, newest first (not deduped yet). */
async function loadStoredItems(limit: number): Promise<NewsItem[]> {
  const since = new Date(Date.now() - ARCHIVE_DAYS * 86_400_000).toISOString();
  const { data, error } = await createPublicClient()
    .from("news_items")
    .select("guid,title,summary,url,published_at,source_id,category,news_sources(name,site_url,active)")
    .gte("published_at", since)
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const items: NewsItem[] = [];
  for (const row of data ?? []) {
    const source = row.news_sources;
    const url = safeHttpUrl(row.url);
    if (!source || !source.active || !url) continue;
    items.push({
      id: `${row.source_id.slice(0, 8)}-${hashString(row.guid)}`,
      guid: row.guid,
      title: row.title,
      summary: row.summary,
      url,
      publishedAt: row.published_at,
      sourceId: row.source_id,
      sourceName: source.name,
      sourceUrl: source.site_url,
      category: isCategory(row.category) ? row.category : inferCategory(row.title, "", source.name),
      local: isLocalText(row.title, row.summary),
    });
  }
  return items;
}

/** Last stored headlines (used only when every feed fails). */
async function loadArchive(): Promise<NewsItem[]> {
  return selectNews(await loadStoredItems(60), { minInWindow: 1, fallbackCount: 40, max: 40 });
}

async function loadNews(): Promise<NewsResult> {
  const { data, error } = await createPublicClient()
    .from("news_sources")
    .select("id,name,site_url,feed_url,last_fetched_at,last_error")
    .eq("active", true)
    .order("name");
  if (error) throw new Error(error.message);
  const sources = data ?? [];
  const refs: NewsSourceRef[] = sources.map((s) => ({ id: s.id, name: s.name, siteUrl: s.site_url }));

  // Normal case: the cron stored fresh headlines.
  const lastFetchedMs = Math.max(0, ...sources.map((s) => (s.last_fetched_at ? Date.parse(s.last_fetched_at) : 0)));
  if (lastFetchedMs && Date.now() - lastFetchedMs < STORED_FRESH_MS) {
    const items = selectNews(await loadStoredItems(STORED_LIMIT).catch(() => [] as NewsItem[]));
    const okCount = sources.filter((s) => s.last_fetched_at && !s.last_error).length;
    if (items.length) return { items, sources: refs, okCount, fetchedAt: new Date(lastFetchedMs).toISOString(), fromArchive: okCount === 0 };
  }

  // Fallback while the cron is not running: fetch the feeds during this render.
  const run = await fetchAll(sources, false);
  const items = selectNews(run.settled.flatMap((r) => (r.status === "fulfilled" ? r.value : [])));
  const okCount = run.settled.filter((r) => r.status === "fulfilled" && r.value.length > 0).length;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    await withTimeout(
      persist(createAdminClient(), run).catch(() => undefined),
      PERSIST_TIMEOUT_MS,
    );
  }

  if (items.length) return { items, sources: refs, okCount, fetchedAt: run.fetchedAt, fromArchive: false };
  const archive = await loadArchive().catch(() => [] as NewsItem[]);
  return { items: archive, sources: refs, okCount, fetchedAt: run.fetchedAt, fromArchive: archive.length > 0 };
}

/**
 * Fetches every active feed now (no HTTP cache) and stores headlines + feed status. Used by the cron route
 * (/api/cron/news, every 20 minutes) and the admin "Şimdi çek" button. Throws when the service role is missing or
 * the sources cannot be read.
 */
export async function refreshNewsFeeds(): Promise<NewsRefreshResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("news_sources").select("id,name,site_url,feed_url").eq("active", true).order("name");
  if (error) throw new Error(error.message);
  const run = await fetchAll(data ?? [], true);
  const saved = await persist(admin, run);
  const failed = run.sources.flatMap((s, i) => {
    const e = sourceError(run.settled[i]);
    return e ? [{ name: s.name, error: e }] : [];
  });
  return {
    fetchedAt: run.fetchedAt,
    sources: run.sources.length,
    okCount: run.sources.length - failed.length,
    failed,
    stored: saved.stored,
    saveError: saved.error,
  };
}

/** Admin feed test: one feed fetched like the cron does (same headers, retry and charset handling), nothing stored. */
export async function testNewsFeed(feedUrl: string, name: string): Promise<NewsItem[]> {
  return fetchFeed({ id: "test", name, site_url: feedUrl, feed_url: feedUrl }, true);
}

// The list is rebuilt at most once per window (or right after the cron run), shared by /haberler and the home widget.
const loadNewsCached = unstable_cache(loadNews, ["content-news-v2"], {
  revalidate: NEWS_REVALIDATE_SECONDS,
  tags: [CONTENT_CACHE_TAGS.news],
});

/** "Gebze Gündemi" headlines. Never throws; returns an empty list when nothing is reachable. */
export const getNews = cache(async (): Promise<NewsResult> => {
  try {
    return await loadNewsCached();
  } catch {
    const fetchedAt = new Date().toISOString();
    try {
      const items = await loadArchive();
      return { items, sources: [], okCount: 0, fetchedAt, fromArchive: items.length > 0 };
    } catch {
      return { items: [], sources: [], okCount: 0, fetchedAt, fromArchive: false };
    }
  }
});
