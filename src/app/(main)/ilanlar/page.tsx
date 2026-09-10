import type { Metadata } from "next";
import { Briefcase, SearchX, Tag } from "lucide-react";
import { routes } from "@/core/routes";
import { CITY } from "@/config/site";
import { EmptyState } from "@/components/shared/empty-state";
import { TAB_TYPE } from "@/features/listings/constants";
import { isFiltered, parseListingsQuery, queryKey, resolveSearch } from "@/features/listings/filters";
import { fetchListingsPage } from "@/features/listings/search";
import { safeCategories, safeNeighbourhoods } from "@/features/listings/server/queries";
import { createPublicClient } from "@/features/listings/server/public-client";
import { ListingsNavProvider, ListingsResults } from "@/features/listings/components/listings-nav";
import { ListingsHeader } from "@/features/listings/components/listings-header";
import { ClassifiedCard, JobCard } from "@/features/listings/components/listing-cards";
import { LoadMore } from "@/features/listings/components/load-more";
import { PostListingFab } from "@/features/listings/components/post-fab";
import { ListingFavoritesProvider } from "@/features/listings/components/favorites";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const query = parseListingsQuery(await searchParams);
  const isJob = query.tab === "is-ilanlari";
  return {
    title: isJob ? `${CITY.name} İş İlanları` : `${CITY.name} 2. El İlanlar`,
    description: isJob
      ? `${CITY.name} ve OSB'lerdeki güncel iş ilanları. Başvurmak için işverenle doğrudan telefonla görüş.`
      : `${CITY.name}'de ikinci el eşya ilanları. Satıcıyı doğrudan ara, mesajlaşmayla uğraşma.`,
    alternates: { canonical: routes.listings.root(isJob ? "is-ilanlari" : undefined) },
    robots: isFiltered(query) ? { index: false, follow: true } : undefined,
  };
}

/** E1 - İlanlar (2. el + iş ilanları). All filters live in the URL; the first page is rendered on the server. */
export default async function ListingsPage({ searchParams }: Props) {
  const query = parseListingsQuery(await searchParams);
  const type = TAB_TYPE[query.tab];
  const [allCategories, neighbourhoods] = await Promise.all([safeCategories(), safeNeighbourhoods()]);
  const categories = allCategories.filter((c) => c.type === type);
  const neighbourhood = query.mahalle ? (neighbourhoods.find((n) => n.slug === query.mahalle) ?? null) : null;
  const resolved = resolveSearch(query, {
    categoryIdBySlug: (slug) => categories.find((c) => c.slug === slug)?.id ?? null,
    neighbourhoodIdBySlug: (slug) => neighbourhoods.find((n) => n.slug === slug)?.id ?? null,
  });
  const page = await fetchListingsPage(createPublicClient(), resolved, 0, { withCount: true });
  const filtered = isFiltered(query);

  return (
    <ListingFavoritesProvider>
      <ListingsNavProvider>
        <h1 className="sr-only">{type === "job" ? "İş ilanları" : "2. el ilanlar"}</h1>
        <ListingsHeader query={query} categories={categories} neighbourhood={neighbourhood} total={page.total} />
        <ListingsResults className="px-4 pt-3 pb-24">
          {page.error ? (
            <EmptyState icon={SearchX} title="İlanlar yüklenemedi" description="Bağlantını kontrol edip sayfayı yenile." />
          ) : page.items.length === 0 ? (
            <EmptyState
              icon={type === "job" ? Briefcase : Tag}
              title={filtered ? "Aramana uygun ilan yok" : "Henüz ilan yok"}
              description={filtered ? "Filtreleri değiştirmeyi ya da temizlemeyi dene." : "İlk ilanı sen ver."}
              actionLabel={filtered ? "Filtreleri temizle" : "İlan ver"}
              actionHref={filtered ? routes.listings.root(query.tab) : routes.listings.post()}
            />
          ) : (
            <>
              {type === "classified" ? (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {page.items.map((i) => (
                    <ClassifiedCard key={i.id} item={i} headingLevel="h2" />
                  ))}
                </ul>
              ) : (
                <ul className="flex flex-col gap-3">
                  {page.items.map((i) => (
                    <JobCard key={i.id} item={i} headingLevel="h2" />
                  ))}
                </ul>
              )}
              {page.hasMore ? <LoadMore key={queryKey(query)} resolved={resolved} type={type} seenIds={page.items.map((i) => i.id)} /> : null}
            </>
          )}
        </ListingsResults>
        <PostListingFab />
      </ListingsNavProvider>
    </ListingFavoritesProvider>
  );
}
