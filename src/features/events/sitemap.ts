import "server-only";
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/config/site";
import { routes } from "@/core/routes";
import { createPublicClient } from "@/features/business/lib/public-client";

/**
 * Sitemap entries of upcoming events (/etkinlik/<slug>): published, not ended (no end time: 3 hours after the start,
 * same as listUpcomingEvents) and neither the event nor its organizer is demo. RLS already leaves out events of
 * non-public firms. Failures return [].
 */
export async function eventSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const now = new Date();
    const startedSince = new Date(now.getTime() - 3 * 3600_000).toISOString();
    const { data, error } = await createPublicClient()
      .from("events")
      .select("slug,updated_at,businesses(is_demo)")
      .eq("status", "published")
      .eq("is_demo", false)
      .not("slug", "is", null)
      .or(`ends_at.gte.${now.toISOString()},and(ends_at.is.null,starts_at.gte.${startedSince})`)
      .order("starts_at")
      .limit(1000);
    if (error || !data) return [];
    return (data as unknown as Array<{ slug: string; updated_at: string; businesses: { is_demo: boolean } | null }>)
      .filter((e) => !e.businesses?.is_demo)
      .map((e) => ({
        url: `${SITE_URL}${routes.events.detail(e.slug)}`,
        lastModified: new Date(e.updated_at),
        changeFrequency: "daily" as const,
        priority: 0.6,
      }));
  } catch {
    return [];
  }
}
