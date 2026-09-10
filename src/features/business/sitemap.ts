import type { MetadataRoute } from "next";
import { SITE_URL } from "@/config/site";
import { routes } from "@/core/routes";
import { createPublicClient } from "./lib/public-client";

/**
 * Sitemap entries of the business module: one entry per approved firm page (/firma/<slug>).
 * "/firmalar" itself is already listed in PUBLIC_STATIC_ROUTES (core/routes), so it is not repeated here.
 * Failures return [] so /sitemap.xml never breaks.
 */
export async function sitemapEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const { data, error } = await createPublicClient()
      .from("businesses")
      .select("slug,updated_at")
      .eq("status", "approved")
      .order("updated_at", { ascending: false })
      .limit(5000);
    if (error || !data) return [];
    return data.map((b) => ({
      url: `${SITE_URL}${routes.businesses.detail(b.slug)}`,
      lastModified: new Date(b.updated_at),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));
  } catch {
    return [];
  }
}
