import "server-only";
import { unstable_cache } from "next/cache";
import { trCompare } from "@/core/tr";
import type { PoiKind } from "@/features/nearby/types";
import { CONTENT_CACHE_TAGS } from "./cache-tags";
import { safeHttpUrl } from "./news/parse";
import { createPublicClient } from "./server/public-client";

/** External pages linked from /kaynaklar (sources and licences). */
export const SOURCE_URLS = {
  kbbPortal: "https://kavisacikveri.kocaeli.bel.tr",
  ccBy: "https://creativecommons.org/licenses/by/4.0/deed.tr",
  odbl: "https://opendatacommons.org/licenses/odbl/",
  googleMapsTerms: "https://www.google.com/intl/tr/help/terms_maps/",
  googlePrivacy: "https://policies.google.com/privacy?hl=tr",
  openMeteo: "https://open-meteo.com",
  aladhan: "https://aladhan.com",
} as const;

/** poi.license prefixes written by the seed scripts (scripts/db/seed-*.mjs). */
const LICENCE_PREFIX = { kbb: "CC BY%", osm: "ODbL%" } as const;
export type PoiSourceGroup = keyof typeof LICENCE_PREFIX;

const POI_DATASETS: Record<PoiSourceGroup, Array<{ kind: PoiKind; label: string }>> = {
  kbb: [
    { kind: "pharmacy", label: "Eczaneler" },
    { kind: "mosque", label: "Camiler" },
    { kind: "place", label: "Tarihi yerler" },
  ],
  osm: [
    { kind: "bus_stop", label: "Otobüs durakları ve hatları" },
    { kind: "taxi", label: "Taksi durakları" },
    { kind: "atm", label: "ATM'ler" },
    { kind: "place", label: "Parklar, doğa alanları ve AVM'ler" },
  ],
};

export type Dataset = { key: string; label: string; count: number | null };

/** Datasets that are not poi rows (no record count). */
const OTHER_DATASETS: Record<PoiSourceGroup, Dataset[]> = {
  kbb: [],
  osm: [{ key: "osm:neighbourhoods", label: "Mahalle sınırları", count: null }],
};

type PoiCounts = Record<string, number>;
export type NewsSourceLink = { id: string; name: string; url: string | null; host: string | null };
export type SourcesPageData = {
  /** Active news_sources (null when the query failed). */
  newsSources: NewsSourceLink[] | null;
  /** poi records per "group:kind" (null when the query failed). */
  poiCounts: PoiCounts | null;
};

const SOURCES_REVALIDATE_SECONDS = 3600;

// Admin news-source edits expire content:news; poi imports and demo cleanup expire "poi".
const loadNewsSources = unstable_cache(
  async (): Promise<NewsSourceLink[]> => {
    const { data, error } = await createPublicClient().from("news_sources").select("id,name,site_url").eq("active", true);
    if (error) throw new Error(error.message);
    return (data ?? [])
      .map((s) => {
        const url = safeHttpUrl(s.site_url);
        return { id: s.id, name: s.name, url, host: url ? new URL(url).hostname.replace(/^www\./, "") : null };
      })
      .sort((a, b) => trCompare(a.name, b.name));
  },
  ["content-sources-news-v1"],
  { revalidate: SOURCES_REVALIDATE_SECONDS, tags: [CONTENT_CACHE_TAGS.news] },
);

const loadPoiCounts = unstable_cache(
  async (): Promise<PoiCounts> => {
    const client = createPublicClient();
    const pairs = (Object.keys(POI_DATASETS) as PoiSourceGroup[]).flatMap((group) => POI_DATASETS[group].map((d) => ({ group, kind: d.kind })));
    const entries = await Promise.all(
      pairs.map(async ({ group, kind }) => {
        const { count, error } = await client
          .from("poi")
          .select("id", { count: "exact", head: true })
          .eq("kind", kind)
          .like("license", LICENCE_PREFIX[group]);
        if (error) throw new Error(error.message);
        return [`${group}:${kind}`, count ?? 0] as const;
      }),
    );
    return Object.fromEntries(entries);
  },
  ["content-sources-poi-v1"],
  { revalidate: SOURCES_REVALIDATE_SECONDS, tags: ["poi"] },
);

/** Data of /kaynaklar. Never throws; a failed part is null and is not cached. */
export async function getSourcesPageData(): Promise<SourcesPageData> {
  const [newsSources, poiCounts] = await Promise.all([loadNewsSources().catch(() => null), loadPoiCounts().catch(() => null)]);
  return { newsSources, poiCounts };
}

/** Datasets taken from one source, with record counts. Empty ones are hidden; without counts every dataset is listed. */
export function sourceDatasets(group: PoiSourceGroup, counts: PoiCounts | null): Dataset[] {
  const poi = POI_DATASETS[group]
    .map((d) => {
      const key = `${group}:${d.kind}`;
      return { key, label: d.label, count: counts ? (counts[key] ?? 0) : null };
    })
    .filter((d) => d.count !== 0);
  return [...poi, ...OTHER_DATASETS[group]];
}
