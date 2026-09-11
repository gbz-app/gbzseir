import type { MetadataRoute } from "next";
import { articleSitemapEntries } from "@/features/content/articles/sitemap";

/**
 * Registry for dynamic sitemap entries. Feature agents add async sources here, e.g.
 *
 *   import { listingSitemapEntries } from "@/features/listings/sitemap";
 *   export const sitemapExtraSources: SitemapExtraSource[] = [listingSitemapEntries];
 *
 * Each source returns absolute URLs (use SITE_URL). Failures are ignored so one broken source
 * never breaks /sitemap.xml.
 */
export type SitemapExtraSource = () => Promise<MetadataRoute.Sitemap>;

export const sitemapExtraSources: SitemapExtraSource[] = [articleSitemapEntries];
