import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createHash } from "node:crypto";
import { SITE_URL } from "@/config/site";
import { routes } from "@/core/routes";
import { createAdminClient } from "@/lib/supabase/admin";
import { CONTENT_CACHE_TAGS } from "../cache-tags";
import { createPublicClient } from "../server/public-client";
import { hashString, inferCategory, isLocalText, parseFeed, safeHttpUrl, selectNews, titleKey, type NewsItem, type NewsSourceRef } from "./parse";

/** Feeds and the derived list are refreshed every 20 minutes. */
export const NEWS_REVALIDATE_SECONDS = 1200;

const FEED_TIMEOUT_MS = 6_000;
const PERSIST_TIMEOUT_MS = 4_000;
const MAX_FEED_BYTES = 3_000_000;
const ARCHIVE_DAYS = 30;
// Header values must be ASCII.
const USER_AGENT = `GebzemNews/1.0 (+${SITE_URL}${routes.content.sources()}; Gebze city guide, headline aggregator)`;

export type NewsResult = {
  items: NewsItem[];
  sources: NewsSourceRef[];
  /** Feeds that answered with at least one item. */
  okCount: number;
  fetchedAt: string;
  /** All feeds failed and the list comes from the last stored headlines. */
  fromArchive: boolean;
};

type SourceRow = { id: string; name: string; site_url: string; feed_url: string };

function errorText(e: unknown): string {
  if (e instanceof Error) {
    if (e.name === "TimeoutError" || e.name === "AbortError") return `Zaman aşımı (${FEED_TIMEOUT_MS / 1000} sn)`;
    return e.message.slice(0, 200) || "Bilinmeyen hata";
  }
  return "Bilinmeyen hata";
}

function detectCharset(contentType: string | null, head: string): string {
  const m = /charset=["']?([\w-]+)/i.exec(contentType ?? "") ?? /<\?xml[^>]*encoding\s*=\s*["']([\w-]+)["']/i.exec(head);
  return (m?.[1] ?? "utf-8").toLowerCase();
}

async function fetchFeed(source: SourceRow): Promise<NewsItem[]> {
  const res = await fetch(source.feed_url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.1",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
    next: { revalidate: NEWS_REVALIDATE_SECONDS, tags: [CONTENT_CACHE_TAGS.news] },
  });
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

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<undefined>((resolve) => (timer = setTimeout(() => resolve(undefined), ms)))]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Stores the headline rows (title + <=280 char summary + link only, never full text) and each feed's status,
 * so admins can see failing feeds and the page has an archive when every feed is down. Old rows are pruned.
 */
async function persist(sources: SourceRow[], settled: PromiseSettledResult<NewsItem[]>[], items: NewsItem[], fetchedAt: string) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const admin = createAdminClient();
  const cutoffIso = new Date(Date.now() - ARCHIVE_DAYS * 86_400_000).toISOString();

  const rows = new Map<string, { source_id: string; guid: string; title: string; summary: string | null; url: string; published_at: string | null; title_hash: string }>();
  for (const item of items) {
    if (!item.publishedAt || item.publishedAt < cutoffIso) continue;
    rows.set(`${item.sourceId}|${item.guid}`, {
      source_id: item.sourceId,
      guid: item.guid,
      title: item.title,
      summary: item.summary,
      url: item.url,
      published_at: item.publishedAt,
      title_hash: createHash("sha1").update(titleKey(item.title)).digest("hex").slice(0, 16),
    });
  }

  const tasks: PromiseLike<unknown>[] = [];
  if (rows.size) tasks.push(admin.from("news_items").upsert([...rows.values()], { onConflict: "source_id,guid" }));
  sources.forEach((source, i) => {
    const r = settled[i];
    const lastError = r.status === "rejected" ? errorText(r.reason) : r.value.length ? null : "Akışta haber bulunamadı";
    tasks.push(admin.from("news_sources").update({ last_fetched_at: fetchedAt, last_error: lastError }).eq("id", source.id));
  });
  tasks.push(admin.from("news_items").delete().lt("published_at", cutoffIso));
  await Promise.allSettled(tasks);
}

/** Last stored headlines (used only when every feed fails). */
async function loadArchive(): Promise<NewsItem[]> {
  const since = new Date(Date.now() - ARCHIVE_DAYS * 86_400_000).toISOString();
  const { data, error } = await createPublicClient()
    .from("news_items")
    .select("guid,title,summary,url,published_at,source_id,news_sources(name,site_url,active)")
    .gte("published_at", since)
    .order("published_at", { ascending: false })
    .limit(60);
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
      category: inferCategory(row.title, "", source.name),
      local: isLocalText(row.title, row.summary),
    });
  }
  return selectNews(items, { minInWindow: 1, fallbackCount: 40, max: 40 });
}

async function loadNews(): Promise<NewsResult> {
  const { data, error } = await createPublicClient().from("news_sources").select("id,name,site_url,feed_url").eq("active", true).order("name");
  if (error) throw new Error(error.message);
  const sources = data ?? [];

  const settled = await Promise.allSettled(sources.map(fetchFeed));
  const fetchedAt = new Date().toISOString();
  const items = selectNews(settled.flatMap((r) => (r.status === "fulfilled" ? r.value : [])));
  const okCount = settled.filter((r) => r.status === "fulfilled" && r.value.length > 0).length;
  const refs: NewsSourceRef[] = sources.map((s) => ({ id: s.id, name: s.name, siteUrl: s.site_url }));

  await withTimeout(
    persist(sources, settled, items, fetchedAt).catch(() => undefined),
    PERSIST_TIMEOUT_MS,
  );

  if (items.length) return { items, sources: refs, okCount, fetchedAt, fromArchive: false };
  const archive = await loadArchive().catch(() => [] as NewsItem[]);
  return { items: archive, sources: refs, okCount, fetchedAt, fromArchive: archive.length > 0 };
}

// Parsing ~12 feeds is done at most once per revalidation window, shared by /haberler and the home widget.
const loadNewsCached = unstable_cache(loadNews, ["content-news-v1"], {
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
