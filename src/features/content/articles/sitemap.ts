import "server-only";
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/config/site";
import { routes } from "@/core/routes";
import { listPublishedArticleSlugs } from "./queries";

/** Sitemap entries of our published articles (/haberler/<slug>). */
export async function articleSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  const rows = await listPublishedArticleSlugs();
  return rows.map((r) => ({
    url: `${SITE_URL}${routes.content.newsArticle(r.slug)}`,
    lastModified: new Date(r.updatedAt),
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));
}
