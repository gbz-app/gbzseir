import type { MetadataRoute } from "next";
import { SITE_URL } from "@/config/site";
import { routes } from "@/core/routes";
import { LEGAL_PATHS, LEGAL_SLUGS } from "@/features/legal/meta";
import { getPublishedLegalText } from "@/features/legal/queries";
import { getNews } from "./news/get-news";

/**
 * Sitemap entries of the content module (news, announcements, help, sources, legal pages). Registered in
 * src/config/sitemap-extra.ts; these paths are not in PUBLIC_STATIC_ROUTES (app/sitemap.ts also dedupes by url).
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
  // Live version of each legal text (legal_texts.published_at); no date when none is published or the lookup failed.
  const legal = await Promise.all(LEGAL_SLUGS.map(async (slug) => ({ slug, text: await getPublishedLegalText(slug).catch(() => null) })));
  const url = (path: string) => `${SITE_URL}${path}`;

  return [
    { url: url(routes.content.news()), lastModified: newsModified, changeFrequency: "hourly", priority: 0.6 },
    { url: url(routes.content.announcements()), lastModified: now, changeFrequency: "daily", priority: 0.5 },
    { url: url(routes.content.help()), changeFrequency: "monthly", priority: 0.3 },
    { url: url(routes.content.sources()), changeFrequency: "monthly", priority: 0.3 },
    ...legal.map(({ slug, text }) => ({
      url: url(LEGAL_PATHS[slug]),
      ...(text ? { lastModified: new Date(text.publishedAt) } : {}),
      changeFrequency: "yearly" as const,
      priority: 0.2,
    })),
  ];
}
