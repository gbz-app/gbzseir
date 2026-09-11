import Link from "next/link";
import { Briefcase, SearchX, Tag } from "lucide-react";
import { routes } from "@/core/routes";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { TAB_TYPE } from "../constants";
import { isFiltered, queryKey, resolveSearch, type ListingsQuery } from "../filters";
import { fetchListingsPage } from "../search";
import { safeCategories } from "../server/queries";
import { createPublicClient } from "../server/public-client";
import { ListingFavoritesProvider } from "./favorites";
import { ClassifiedCard, JobCard } from "./listing-cards";
import { ListingsHeader } from "./listings-header";
import { ListingsNavProvider, ListingsResults } from "./listings-nav";
import { LoadMore } from "./load-more";
import { PostListingFab } from "./post-fab";

/**
 * Body of the two list pages, /ilanlar (İkinci El) and /is-ilanlari: header, chips, cards and infinite loading.
 * All filters live in the URL; the first page is rendered on the server.
 */
export async function ListingsScreen({ query }: { query: ListingsQuery }) {
  const type = TAB_TYPE[query.tab];
  const isJob = type === "job";
  const categories = (await safeCategories()).filter((c) => c.type === type);
  const resolved = resolveSearch(query, {
    categoryIdBySlug: (slug) => categories.find((c) => c.slug === slug)?.id ?? null,
  });
  const page = await fetchListingsPage(createPublicClient(), resolved, 0, { withCount: true });
  const filtered = isFiltered(query);

  return (
    <ListingFavoritesProvider>
      <ListingsNavProvider>
        <div className="flex flex-col gap-4 px-4 pb-32">
          <ListingsHeader query={query} categories={categories} total={page.total} />
          <ListingsResults>
            {page.error ? (
              <EmptyState className="rounded-3xl bg-card" icon={SearchX} title="İlanlar yüklenemedi" description="Bağlantını kontrol edip sayfayı yenile." />
            ) : page.items.length === 0 ? (
              <EmptyState
                className="rounded-3xl bg-card"
                icon={isJob ? Briefcase : Tag}
                title={filtered ? (isJob ? "Aramana uygun iş ilanı yok" : "Aramana uygun ilan yok") : isJob ? "Henüz iş ilanı yok" : "Henüz ilan yok"}
                description={
                  filtered
                    ? "Filtreleri değiştirmeyi ya da temizlemeyi dene."
                    : isJob
                      ? "Yeni iş ilanları burada listelenecek."
                      : "İlk ilanı sen ver, alıcılar seni doğrudan arasın."
                }
                action={
                  filtered || !isJob ? (
                    // Own button: EmptyState's default one has a shadow.
                    <Button asChild className="shadow-none">
                      <Link href={filtered ? routes.listings.root(query.tab) : routes.listings.postClassified()}>
                        {filtered ? "Filtreleri temizle" : "İlan ver"}
                      </Link>
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <>
                {isJob ? (
                  <ul className="flex flex-col gap-3">
                    {page.items.map((i) => (
                      <JobCard key={i.id} item={i} headingLevel="h2" />
                    ))}
                  </ul>
                ) : (
                  <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {page.items.map((i, n) => (
                      <ClassifiedCard key={i.id} item={i} headingLevel="h2" eager={n < 4} />
                    ))}
                  </ul>
                )}
                {page.hasMore ? <LoadMore key={queryKey(query)} resolved={resolved} type={type} seenIds={page.items.map((i) => i.id)} /> : null}
              </>
            )}
          </ListingsResults>
        </div>
        <PostListingFab type={type} />
      </ListingsNavProvider>
    </ListingFavoritesProvider>
  );
}
