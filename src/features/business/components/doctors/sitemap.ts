import type { MetadataRoute } from "next";
import { SITE_URL } from "@/config/site";
import { routes } from "@/core/routes";
import { createPublicClient } from "../../lib/public-client";

/** PostgREST returns at most 1000 rows per request; MAX_ROWS keeps the whole sitemap under 50,000 URLs. */
const PAGE = 1000;
const MAX_ROWS = 10_000;

type Row = { slug: string | null; updated_at: string };

/**
 * Sitemap entries of the doctor profiles (/doktor/<slug>): active doctors of approved clinics, without sample doctors
 * or sample clinics. RLS already leaves out hidden doctors and clinics that are not public. Failures return [] so
 * /sitemap.xml never breaks.
 */
export async function doctorSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const supabase = createPublicClient();
    const rows: Row[] = [];
    for (let from = 0; from < MAX_ROWS; from += PAGE) {
      const { data, error } = await supabase
        .from("business_staff")
        .select("slug,updated_at,businesses!inner(status,is_demo)")
        .eq("is_active", true)
        .eq("is_demo", false)
        .eq("businesses.status", "approved")
        .eq("businesses.is_demo", false)
        .order("updated_at", { ascending: false })
        .order("id")
        .range(from, from + PAGE - 1);
      if (error || !data) break;
      rows.push(...(data as unknown as Row[]));
      if (data.length < PAGE) break;
    }
    return rows
      .filter((r): r is { slug: string; updated_at: string } => !!r.slug)
      .map((r) => ({
        url: `${SITE_URL}${routes.doctors.detail(r.slug)}`,
        lastModified: new Date(r.updated_at),
        changeFrequency: "monthly" as const,
        priority: 0.5,
      }));
  } catch {
    return [];
  }
}
