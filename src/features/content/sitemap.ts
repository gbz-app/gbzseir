import type { MetadataRoute } from "next";
import { SITE_URL } from "@/config/site";
import { routes } from "@/core/routes";
import { getNews } from "./news/get-news";

/** Last update of the draft legal texts (/yasal/*). */
const LEGAL_UPDATED_AT = "2026-09-10";

/**
 * Sitemap entries of the content module (news, announcements, help, sources, legal pages).
 * NOTE: these paths are also listed in PUBLIC_STATIC_ROUTES; wire only one of the two (or dedupe by url).
 */
export async function sitemapEntries(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  let newsModified = now;
  try {
    const { items } = await getNews();
    if (items[0]?.publishedAt) newsModified = new Date(items[0].publishedAt);
  } catch {
    // keep "now"
  }
  const legalModified = new Date(LEGAL_UPDATED_AT);
  const url = (path: string) => `${SITE_URL}${path}`;

  return [
    { url: url(routes.content.news()), lastModified: newsModified, changeFrequency: "hourly", priority: 0.6 },
    { url: url(routes.content.announcements()), lastModified: now, changeFrequency: "daily", priority: 0.5 },
    { url: url(routes.content.help()), lastModified: legalModified, changeFrequency: "monthly", priority: 0.3 },
    { url: url(routes.content.sources()), lastModified: legalModified, changeFrequency: "monthly", priority: 0.3 },
    ...[routes.legal.kvkk(), routes.legal.explicitConsent(), routes.legal.privacy(), routes.legal.terms(), routes.legal.cookies()].map((path) => ({
      url: url(path),
      lastModified: legalModified,
      changeFrequency: "yearly" as const,
      priority: 0.2,
    })),
  ];
}
