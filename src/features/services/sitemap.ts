import type { MetadataRoute } from "next";
import { SITE_URL } from "@/config/site";
import { routes } from "@/core/routes";
import { getServiceCatalogSafe } from "./data";

/**
 * Sitemap entries of the services module: every top-level category page (/hizmetler/<slug>).
 * /hizmetler itself is already part of PUBLIC_STATIC_ROUTES (app/sitemap.ts), so it is not repeated here.
 */
export async function sitemapEntries(): Promise<MetadataRoute.Sitemap> {
  const catalog = await getServiceCatalogSafe();
  if (!catalog) return [];
  const now = new Date();
  return catalog.parents.map((p) => ({
    url: `${SITE_URL}${routes.services.category(p.slug)}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));
}
