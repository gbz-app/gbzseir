import type { MetadataRoute } from "next";
import { SITE_URL } from "@/config/site";
import { routes } from "@/core/routes";
import { createPublicClient } from "./lib/public-client";

/** PostgREST returns at most 1000 rows per request; MAX_ROWS keeps the whole sitemap under 50,000 URLs. */
const PAGE = 1000;
const MAX_ROWS = 10_000;

/**
 * Sitemap entries of the business module: one entry per approved firm page (/firma/<slug>), without demo firms.
 * RLS already leaves out firms of banned owners. "/firmalar" itself is already listed in PUBLIC_STATIC_ROUTES
 * (core/routes), so it is not repeated here. Failures return [] so /sitemap.xml never breaks.
 */
export async function sitemapEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const supabase = createPublicClient();
    const rows: Array<{ slug: string; updated_at: string }> = [];
    for (let from = 0; from < MAX_ROWS; from += PAGE) {
      const { data, error } = await supabase
        .from("businesses")
        .select("slug,updated_at")
        .eq("status", "approved")
        .eq("is_demo", false)
        .order("updated_at", { ascending: false })
        .order("slug")
        .range(from, from + PAGE - 1);
      if (error || !data) break;
      rows.push(...data);
      if (data.length < PAGE) break;
    }
    return rows.map((b) => ({
      url: `${SITE_URL}${routes.businesses.detail(b.slug)}`,
      lastModified: new Date(b.updated_at),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));
  } catch {
    return [];
  }
}
