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
  for (const result of extras) if (result.status === "fulfilled") base.push(...result.value);
  return base;
}
