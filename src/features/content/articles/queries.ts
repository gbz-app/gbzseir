import "server-only";
import { cache } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { toArticleCategory, type Article, type ArticleSummary } from "./meta";

/** Allowed in PUBLIC_CACHE_TAGS; admin edits expire it through revalidatePublic. */
export const ARTICLES_CACHE_TAG = "content:articles";
export const ARTICLES_REVALIDATE_SECONDS = 300;

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Cookie-less anon client for our articles. RLS returns only published rows whose published_at has passed, and every
 * request goes through the Next.js data cache (5 min, tag "content:articles"), so pages using it stay static / ISR.
 */
function createArticlesClient(): SupabaseClient<Database> {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, next: { revalidate: ARTICLES_REVALIDATE_SECONDS, tags: [ARTICLES_CACHE_TAG] } }),
    },
  });
}

type SummaryRow = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  category: string;
  cover_url: string | null;
  published_at: string | null;
};

function toSummary(r: SummaryRow): ArticleSummary | null {
  if (!r.published_at) return null;
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    summary: r.summary,
    category: toArticleCategory(r.category),
    coverUrl: r.cover_url,
    publishedAt: r.published_at,
  };
}

/** Newest published articles (no body). Throws on errors; callers decide the fallback. */
export const listPublishedArticles = cache(async (limit = 20): Promise<ArticleSummary[]> => {
  const { data, error } = await createArticlesClient()
    .from("news_articles")
    .select("id,slug,title,summary,category,cover_url,published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).flatMap((r) => toSummary(r) ?? []);
});

/** One published article by slug. null = unknown, draft or not yet due. */
export const getPublishedArticle = cache(async (slug: string): Promise<Article | null> => {
  if (slug.length > 120 || !SLUG_RE.test(slug)) return null;
  const { data, error } = await createArticlesClient()
    .from("news_articles")
    .select("id,slug,title,summary,category,cover_url,published_at,body,updated_at")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const summary = data ? toSummary(data) : null;
  return data && summary ? { ...summary, body: data.body, updatedAt: data.updated_at } : null;
});

/** Slugs of published articles (generateStaticParams, sitemap). */
export async function listPublishedArticleSlugs(limit = 500): Promise<Array<{ slug: string; updatedAt: string }>> {
  const { data, error } = await createArticlesClient()
    .from("news_articles")
    .select("slug,updated_at")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ slug: r.slug, updatedAt: r.updated_at }));
}
