"use client";

import * as React from "react";
import Link from "next/link";
import { BadgeCheck, Heart, Navigation, Star, Store, Tag } from "lucide-react";
import { routes } from "@/core/routes";
import { ChipFilter, type ChipOption } from "@/components/shared/chip-filter";
import { EmptyState } from "@/components/shared/empty-state";
import { FavoriteButton } from "@/components/shared/favorite-button";
import { ListingFavoritesProvider } from "@/features/listings/components/favorites";
import { ClassifiedCard, JobCard } from "@/features/listings/components/listing-cards";
import type { ListingCardData } from "@/features/listings/types";
import { KindIcon } from "@/features/nearby/components/kind-icon";
import { poiHref } from "@/features/nearby/config";
import type { PoiKind } from "@/features/nearby/types";

export type FavoriteBusiness = {
  id: string;
  name: string;
  slug: string | null;
  logo_url: string | null;
  category_label: string | null;
  rating_avg: number;
  rating_count: number;
  verification_level: number;
};

/** districtName: display name of the place's district (ilçe), null when unknown. */
export type FavoritePoi = { id: string; kind: PoiKind; name: string; slug: string; districtName: string | null };

type Tab = "ilanlar" | "isletmeler" | "yerler";

/** G6 - Favorilerim: İlanlar · İşletmeler · Yerler. */
export function FavoritesView({ listings, businesses, pois }: { listings: ListingCardData[]; businesses: FavoriteBusiness[]; pois: FavoritePoi[] }) {
  const first: Tab = listings.length ? "ilanlar" : businesses.length ? "isletmeler" : pois.length ? "yerler" : "ilanlar";
  const [tab, setTab] = React.useState<Tab>(first);
  const options: ChipOption<Tab>[] = [
    { value: "ilanlar", label: "İlanlar", count: listings.length },
    { value: "isletmeler", label: "İşletmeler", count: businesses.length },
    { value: "yerler", label: "Yerler", count: pois.length },
  ];
  const classifieds = listings.filter((l) => l.type === "classified");
  const jobs = listings.filter((l) => l.type === "job");

  if (!listings.length && !businesses.length && !pois.length) {
    return (
      <EmptyState
        icon={Heart}
        title="Henüz favorin yok"
        description="Beğendiğin ilanları, işletmeleri ve yerleri kalp simgesine dokunarak buraya ekleyebilirsin."
        actionLabel="İlanlara göz at"
        actionHref={routes.listings.root()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 px-4 pt-3 pb-6">
      <ChipFilter options={options} value={tab} onChange={(v) => v && setTab(v)} ariaLabel="Favori türü" size="sm" />

      {tab === "ilanlar" ? (
        listings.length ? (
          <ListingFavoritesProvider>
            {classifieds.length ? (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {classifieds.map((i) => (
                  <ClassifiedCard key={i.id} item={i} headingLevel="h2" />
                ))}
              </ul>
            ) : null}
            {jobs.length ? (
              <ul className="mt-3 flex flex-col gap-3">
                {jobs.map((i) => (
                  <JobCard key={i.id} item={i} headingLevel="h2" />
                ))}
              </ul>
            ) : null}
          </ListingFavoritesProvider>
        ) : (
          <EmptyState compact icon={Tag} title="Favori ilanın yok" description="Yayından kalkan ilanlar burada görünmez." />
        )
      ) : null}

      {tab === "isletmeler" ? (
        businesses.length ? (
          <ul className="divide-y overflow-hidden rounded-2xl bg-card">
            {businesses.map((b) => (
              <li key={b.id} className="flex items-center gap-3 px-3 py-3">
                <Link href={b.slug ? routes.businesses.detail(b.slug) : routes.businesses.root()} className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-brand-soft text-primary">
                    {b.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={b.logo_url} alt="" className="size-full object-cover" />
                    ) : (
                      <Store className="size-6" strokeWidth={1.75} aria-hidden />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 font-semibold">
                      <span className="truncate">{b.name}</span>
                      {b.verification_level >= 1 ? <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Onaylı işletme" /> : null}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
                      {b.category_label ? <span className="truncate">{b.category_label}</span> : null}
                      {b.rating_count > 0 ? (
                        <span className="inline-flex items-center gap-0.5 tabular-nums">
                          <Star className="size-3.5 fill-current text-highlight" aria-hidden /> {b.rating_avg.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </Link>
                <FavoriteButton targetType="business" targetId={b.id} initialFavorited />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact icon={Store} title="Favori işletmen yok" />
        )
      ) : null}

      {tab === "yerler" ? (
        pois.length ? (
          <ul className="divide-y overflow-hidden rounded-2xl bg-card">
            {pois.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-3">
                <Link href={poiHref(p.kind, p.slug)} className="flex min-w-0 flex-1 items-center gap-3">
                  <KindIcon kind={p.kind} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{p.name}</span>
                    {p.districtName ? (
                      <span className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                        <Navigation className="size-3.5" aria-hidden /> {p.districtName}
                      </span>
                    ) : null}
                  </span>
                </Link>
                <FavoriteButton targetType="poi" targetId={p.id} initialFavorited />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact icon={Navigation} title="Favori yerin yok" />
        )
      ) : null}
    </div>
  );
}
