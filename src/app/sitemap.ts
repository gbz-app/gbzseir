import type { MetadataRoute } from "next";
import { IS_ADMIN_SITE } from "@/config/app-mode";
import { SITE_URL } from "@/config/site";
import { sitemapExtraSources } from "@/config/sitemap-extra";
import { PUBLIC_STATIC_ROUTES } from "@/core/routes";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // The separate admin site has no public pages.
  if (IS_ADMIN_SITE) return [];
  const now = new Date();
  const base: MetadataRoute.Sitemap = PUBLIC_STATIC_ROUTES.map((r) => ({
    url: `${SITE_URL}${r.path === "/" ? "" : r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
  const extras = await Promise.allSettled(sitemapExtraSources.map((source) => source()));
  // One entry per URL: a source that repeats a static path replaces it in place (it knows the real lastModified).
  const byUrl = new Map(base.map((entry) => [entry.url, entry]));
  for (const result of extras) if (result.status === "fulfilled") for (const entry of result.value) byUrl.set(entry.url, entry);
  return [...byUrl.values()];
}
