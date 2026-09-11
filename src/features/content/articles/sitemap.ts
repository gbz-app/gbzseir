import "server-only";
import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { SITE_URL } from "@/config/site";
import { routes } from "@/core/routes";
import { ARTICLES_CACHE_TAG, ARTICLES_REVALIDATE_SECONDS } from "./queries";

/** Sitemap entries of our published articles (/haberler/<slug>), without demo articles. RLS returns only published rows. */
export async function articleSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  const { data, error } = await createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, next: { revalidate: ARTICLES_REVALIDATE_SECONDS, tags: [ARTICLES_CACHE_TAG] } }),
    },
  })
    .from("news_articles")
    .select("slug,updated_at")
    .eq("status", "published")
    .eq("is_demo", false)
    .order("published_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    url: `${SITE_URL}${routes.content.newsArticle(r.slug)}`,
    lastModified: new Date(r.updated_at),
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));
}
