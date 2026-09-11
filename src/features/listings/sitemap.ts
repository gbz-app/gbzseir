import "server-only";
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/config/site";
import { routes } from "@/core/routes";
import { createPublicClient } from "./server/public-client";

/** PostgREST returns at most 1000 rows per request; MAX_ROWS keeps the whole sitemap under 50,000 URLs. */
const PAGE = 1000;
const MAX_ROWS = 15_000;

/**
 * Sitemap entries of live listings (/ilan/<id>, /is-ilani/<id>): active, not expired and not demo, the same rule that
 * makes a detail page indexable. RLS already leaves out listings of banned owners. Failures return [].
 */
export async function listingSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const supabase = createPublicClient();
    const now = new Date().toISOString();
    const rows: Array<{ id: string; type: string; updated_at: string }> = [];
    for (let from = 0; from < MAX_ROWS; from += PAGE) {
      const { data, error } = await supabase
        .from("listings")
        .select("id,type,updated_at")
        .eq("status", "active")
        .gt("expires_at", now)
        .eq("is_demo", false)
        .order("published_at", { ascending: false, nullsFirst: false })
        .order("id")
        .range(from, from + PAGE - 1);
      if (error || !data) break;
      rows.push(...data);
      if (data.length < PAGE) break;
    }
    return rows.map((l) => ({
      url: `${SITE_URL}${l.type === "job" ? routes.listings.job(l.id) : routes.listings.classified(l.id)}`,
      lastModified: new Date(l.updated_at),
      changeFrequency: "daily" as const,
      priority: 0.5,
    }));
  } catch {
    return [];
  }
}
