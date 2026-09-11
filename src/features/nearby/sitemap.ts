import "server-only";
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/config/site";
import { routes } from "@/core/routes";
import { GUIDE_SECTIONS } from "@/features/guide/lib/constants";
import { GUIDE_EXTRA_LIST_SLUGS } from "@/features/guide/components/list-config";
import { poiHref } from "./config";
import { createPublicClient } from "./server/public-client";
import type { PoiKind } from "./types";

type Freq = NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;

/** Kinds with a detail page (taxi stands only open the map, so they are left out). */
const KINDS: Partial<Record<PoiKind, { priority: number; changeFrequency: Freq }>> = {
  place: { priority: 0.6, changeFrequency: "monthly" },
  institution: { priority: 0.5, changeFrequency: "monthly" },
  pharmacy: { priority: 0.5, changeFrequency: "weekly" },
  mosque: { priority: 0.4, changeFrequency: "monthly" },
  bus_stop: { priority: 0.3, changeFrequency: "monthly" },
  bank: { priority: 0.3, changeFrequency: "monthly" },
  fuel: { priority: 0.3, changeFrequency: "monthly" },
  ev_charge: { priority: 0.3, changeFrequency: "monthly" },
  atm: { priority: 0.2, changeFrequency: "monthly" },
};

/** PostgREST returns at most 1000 rows per request; MAX_ROWS keeps the whole sitemap under 50,000 URLs. */
const PAGE = 1000;
const MAX_ROWS = 15_000;

/**
 * Sitemap entries of the nearby module and the city guide: the /rehber/<section> lists, then /gezilecek-yerler/<slug>,
 * /kurum/<slug>, /eczane/<slug>, /cami/<slug> and /durak/<slug>. Hidden pois (RLS + explicit filter) and sample rows
 * (source 'demo') are left out. Failures return the section lists only.
 */
export async function poiSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  const sections: MetadataRoute.Sitemap = [...GUIDE_EXTRA_LIST_SLUGS, ...GUIDE_SECTIONS.map((s) => s.slug)].map((slug) => ({
    url: `${SITE_URL}${routes.guide.category(slug)}`,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));
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
    return [
      ...sections,
      ...rows.flatMap((p) => {
        const meta = KINDS[p.kind as PoiKind];
        if (!meta) return [];
        return [{ url: `${SITE_URL}${poiHref(p.kind as PoiKind, p.slug)}`, lastModified: new Date(p.updated_at), ...meta }];
      }),
    ];
  } catch {
    return sections;
  }
}
