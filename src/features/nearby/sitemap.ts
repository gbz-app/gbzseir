import "server-only";
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/config/site";
import { poiHref } from "./config";
import { createPublicClient } from "./server/public-client";
import type { PoiKind } from "./types";

type Freq = NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;

/** Kinds with a detail page (taxi stands and ATMs only open the map, so they are left out). */
const KINDS: Partial<Record<PoiKind, { priority: number; changeFrequency: Freq }>> = {
  place: { priority: 0.6, changeFrequency: "monthly" },
  pharmacy: { priority: 0.5, changeFrequency: "weekly" },
  mosque: { priority: 0.4, changeFrequency: "monthly" },
  bus_stop: { priority: 0.3, changeFrequency: "monthly" },
};

/** PostgREST returns at most 1000 rows per request; MAX_ROWS keeps the whole sitemap under 50,000 URLs. */
const PAGE = 1000;
const MAX_ROWS = 15_000;

/**
 * Sitemap entries of the nearby module: /gezilecek-yerler/<slug>, /eczane/<slug>, /cami/<slug> and /durak/<slug>.
 * Hidden pois (RLS + explicit filter) and sample rows (source 'demo') are left out. Failures return [].
 */
export async function poiSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const supabase = createPublicClient(3600, ["nearby", "poi"]);
    const rows: Array<{ kind: string; slug: string; updated_at: string }> = [];
    for (let from = 0; from < MAX_ROWS; from += PAGE) {
      const { data, error } = await supabase
        .from("poi")
        .select("kind,slug,updated_at")
        .in("kind", Object.keys(KINDS))
        .eq("hidden", false)
        .neq("source", "demo")
        .order("kind")
        .order("slug")
        .range(from, from + PAGE - 1);
      if (error || !data) break;
      rows.push(...data);
      if (data.length < PAGE) break;
    }
    return rows.flatMap((p) => {
      const meta = KINDS[p.kind as PoiKind];
      if (!meta) return [];
      return [{ url: `${SITE_URL}${poiHref(p.kind as PoiKind, p.slug)}`, lastModified: new Date(p.updated_at), ...meta }];
    });
  } catch {
    return [];
  }
}
