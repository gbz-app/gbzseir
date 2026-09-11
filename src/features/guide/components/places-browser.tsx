"use client";

import * as React from "react";
import Link from "next/link";
import { BookOpen, ChevronRight, Landmark } from "lucide-react";
import { routes } from "@/core/routes";
import { trNormalize } from "@/core/tr";
import { ChipFilter, type ChipOption } from "@/components/shared/chip-filter";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { orderByDefs } from "@/features/business/lib/category-visuals";
import { PLACE_CATEGORY_DEFS, placeCategoryMeta, type PlaceCategoryDef } from "@/features/nearby/config";
import { DistanceLabel } from "@/features/nearby/components/distance-label";
import { PlaceVisual } from "@/features/nearby/components/place-card";
import type { PlaceSummary } from "@/features/nearby/types";
import { placeIconName, placeTypeLabel, type GuideEntry } from "./list-config";
import { GuideCard } from "./guide-card";
import { GuidePhoto } from "./guide-photo";

const ALL = "tumu";

function toEntry(p: PlaceSummary, categories: readonly PlaceCategoryDef[]): GuideEntry {
  const type = placeTypeLabel(p.details.category, p.details.subkind, categories);
  const hood = p.neighbourhoodName ? `${p.neighbourhoodName} Mah.` : null;
  return {
    id: p.id,
    kind: "place",
    name: p.name,
    href: routes.nearby.place(p.slug),
    type,
    sub: [type, hood].filter(Boolean).join(" · "),
    cat: placeCategoryMeta(p.details.category, categories).value,
    group: null,
    subkind: p.details.subkind,
    own: null,
    bank: null,
    brand: null,
    op: null,
    lat: p.lat,
    lng: p.lng,
    verified: false,
    photo: p.details.photos[0]?.url ?? null,
    icon: placeIconName(p.details.category, categories),
    q: trNormalize([p.name, type, p.neighbourhoodName].filter(Boolean).join(" ")),
  };
}

/** Large white card of a curated place (photo or category art, badge, distance, short text). No shadow or ring. */
function FeaturedPlaceCard({ place, categories, priority }: { place: PlaceSummary; categories: readonly PlaceCategoryDef[]; priority?: boolean }) {
  const meta = placeCategoryMeta(place.details.category, categories);
  const photo = place.details.photos[0];
  const type = placeTypeLabel(place.details.category, place.details.subkind, categories);
  return (
    <Link
      href={routes.nearby.place(place.slug)}
      className="group block overflow-hidden rounded-3xl bg-card outline-none transition-transform focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.99]"
    >
      <div className="relative">
        {photo ? (
          <GuidePhoto src={photo.url} alt={photo.alt ?? place.name} sizes="(max-width: 672px) 100vw, 672px" priority={priority} className="aspect-[16/10] w-full" />
        ) : (
          <PlaceVisual category={place.details.category} categories={categories} name={place.name} className="aspect-[16/10]" />
        )}
        <span className="absolute top-3 left-3 inline-flex h-7 items-center gap-1 rounded-full bg-white/90 px-2.5 text-xs font-bold text-foreground dark:bg-black/60 dark:text-white">
          <meta.icon className="size-3.5" aria-hidden />
          {type}
        </span>
        <DistanceLabel
          lat={place.lat}
          lng={place.lng}
          withIcon
          className="absolute top-3 right-3 h-7 rounded-full bg-black/55 px-2.5 text-xs font-bold text-white backdrop-blur"
        />
        {photo?.author ? (
          <span className="absolute right-2 bottom-2 max-w-[70%] truncate rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white">
            {photo.author}
            {photo.licence ? ` · ${photo.licence}` : ""}
          </span>
        ) : null}
      </div>
      <div className="p-4">
        <h3 className="text-lg leading-snug font-bold group-hover:underline">{place.name}</h3>
        {place.neighbourhoodName ? <p className="mt-0.5 text-sm text-muted-foreground">{place.neighbourhoodName} Mah.</p> : null}
        {place.details.description ? <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-foreground/85">{place.details.description}</p> : null}
      </div>
    </Link>
  );
}

/** D6 /gezilecek-yerler: category chips (admin order), big cards for curated places, white row cards for the rest. */
export function GuidePlacesBrowser({ places, categories = PLACE_CATEGORY_DEFS }: { places: PlaceSummary[]; categories?: readonly PlaceCategoryDef[] }) {
  const [cat, setCat] = React.useState<string>(ALL);
  const keyOf = React.useCallback((p: PlaceSummary) => placeCategoryMeta(p.details.category, categories).value, [categories]);

  const options = React.useMemo<ChipOption[]>(() => {
    const counts = new Map<string, number>();
    for (const p of places) counts.set(keyOf(p), (counts.get(keyOf(p)) ?? 0) + 1);
    return [
      { value: ALL, label: "Tümü", count: places.length },
      ...orderByDefs(counts.keys(), categories).map((key) => {
        const meta = placeCategoryMeta(key, categories);
        return { value: key, label: meta.label, icon: meta.icon, count: counts.get(key) };
      }),
    ];
  }, [places, categories, keyOf]);

  const filtered = cat === ALL ? places : places.filter((p) => keyOf(p) === cat);
  const featured = filtered.filter((p) => p.details.curated);
  const others = filtered.filter((p) => !p.details.curated);

  return (
    <>
      <PageHeader title="Gezilecek Yerler" subtitle="Gebze'nin tarihi ve doğal güzellikleri" backHref={routes.home()}>
        <ChipFilter options={options} value={cat} onChange={(v) => v && setCat(v)} ariaLabel="Kategori" size="sm" />
      </PageHeader>
      <div className="flex flex-col gap-6 px-4 pt-4 pb-6">
        {filtered.length === 0 ? <EmptyState icon={Landmark} title="Bu kategoride yer yok" description="Başka bir kategori seçmeyi dene." /> : null}

        {featured.length > 0 ? (
          <section aria-labelledby="one-cikanlar">
            <h2 id="one-cikanlar" className="sr-only">
              Öne çıkan yerler
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2">
              {featured.map((p, i) => (
                <li key={p.id}>
                  <FeaturedPlaceCard place={p} categories={categories} priority={i === 0} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {others.length > 0 ? (
          <section aria-labelledby="diger-yerler">
            <h2 id="diger-yerler" className="mb-2.5 text-lg font-bold">
              {featured.length > 0 ? "Diğer yerler" : "Yerler"}
            </h2>
            <ul className="flex flex-col gap-2.5">
              {others.map((p) => (
                <li key={p.id}>
                  <GuideCard entry={toEntry(p, categories)} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <Link
          href={routes.guide.root()}
          className="flex min-h-16 items-center gap-3 rounded-3xl bg-card p-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted/60"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-primary">
            <BookOpen className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">Şehir rehberi</span>
            <span className="block truncate text-[13px] text-muted-foreground">Resmî kurumlar, okullar, ATM, akaryakıt ve daha fazlası</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
      </div>
    </>
  );
}
