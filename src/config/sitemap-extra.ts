import type { MetadataRoute } from "next";
import { PUBLIC_STATIC_ROUTES } from "@/core/routes";
import { sitemapEntries as businessSitemapEntries } from "@/features/business/sitemap";
import { articleSitemapEntries } from "@/features/content/articles/sitemap";
import { eventSitemapEntries } from "@/features/events/sitemap";
import { listingSitemapEntries } from "@/features/listings/sitemap";
import { poiSitemapEntries } from "@/features/nearby/sitemap";
import { sitemapEntries as serviceSitemapEntries } from "@/features/services/sitemap";

/**
 * Registry for dynamic sitemap entries. Feature agents add async sources to SOURCES (in priority order), e.g.
 *
 *   import { listingSitemapEntries } from "@/features/listings/sitemap";
 *
 * Each source returns absolute URLs (use SITE_URL) and leaves out demo rows. Failures are ignored so one broken source
 * never breaks /sitemap.xml.
 */
export type SitemapExtraSource = () => Promise<MetadataRoute.Sitemap>;

/** Google reads at most 50,000 URLs from one sitemap file (app/sitemap.ts puts the static routes first). */
const MAX_SITEMAP_URLS = 50_000;

const SOURCES: SitemapExtraSource[] = [
  serviceSitemapEntries,
  businessSitemapEntries,
  poiSitemapEntries,
  eventSitemapEntries,
  articleSitemapEntries,
  listingSitemapEntries,
];

/** Every source in one pass, cut so the static routes plus these stay under the limit (the last sources lose first). */
async function allSources(): Promise<MetadataRoute.Sitemap> {
  const results = await Promise.allSettled(SOURCES.map((source) => source()));
  const entries = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  return entries.slice(0, MAX_SITEMAP_URLS - PUBLIC_STATIC_ROUTES.length);
}

export const sitemapExtraSources: SitemapExtraSource[] = [allSources];
