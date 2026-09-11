"use client";

import * as React from "react";
import Link from "next/link";
import { BookOpen, ChevronRight, Landmark, MapPin } from "lucide-react";
import { routes } from "@/core/routes";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { orderByDefs } from "@/features/business/lib/category-visuals";
import { EventChip } from "@/features/events/components/chip";
import { PLACE_CATEGORY_DEFS, placeCategoryMeta, type PlaceCategoryDef } from "@/features/nearby/config";
import { PlaceVisual } from "@/features/nearby/components/place-card";
import type { PlaceSummary } from "@/features/nearby/types";
import { placeTypeLabel } from "./list-config";
import { GuidePhoto } from "./guide-photo";

const ALL = "tumu";
const PAGE_SIZE = 24;
const TILE_MEDIA = "aspect-[4/3] w-full rounded-[1.15rem]";

/** Photo card of a place: photo (or category art), category, name and district. White surface, no shadow or ring. */
function PlaceTile({
  place,
  categories,
  district,
  priority,
}: {
  place: PlaceSummary;
  categories: readonly PlaceCategoryDef[];
  district: string | undefined;
  priority?: boolean;
}) {
  const photo = place.details.photos[0];
  const type = placeTypeLabel(place.details.category, place.details.subkind, categories);
  const where = district ?? (place.neighbourhoodName ? `${place.neighbourhoodName} Mah.` : null);
  return (
    <Link
      href={routes.nearby.place(place.slug)}
      className="group flex h-full flex-col rounded-3xl bg-card p-1.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {photo ? (
        // alt="": the place name is already the link text.
        <GuidePhoto src={photo.url} alt="" sizes="(max-width: 672px) 50vw, 224px" priority={priority} className={TILE_MEDIA} />
      ) : (
        <PlaceVisual category={place.details.category} categories={categories} name={place.name} className={TILE_MEDIA} iconClassName="size-10" />
      )}
      <span className="flex flex-1 flex-col px-2 pt-2.5 pb-2">
        <span className="truncate text-xs font-medium text-primary">{type}</span>
        <span className="mt-0.5 line-clamp-2 text-[15px] leading-snug font-semibold underline-offset-2 group-hover:underline">{place.name}</span>
        {where ? (
          <span className="mt-auto flex min-w-0 items-center gap-1 pt-1.5 text-xs text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{where}</span>
          </span>
        ) : null}
      </span>
    </Link>
  );
}

/** D6 /gezilecek-yerler: category chips (admin order) and a two-column grid of photo cards (curated places first). */
export function GuidePlacesBrowser({
  places,
  categories = PLACE_CATEGORY_DEFS,
  districtNames = {},
}: {
  places: PlaceSummary[];
  categories?: readonly PlaceCategoryDef[];
  /** Place id -> district name (poi.district_id). */
  districtNames?: Readonly<Record<string, string>>;
}) {
  const [cat, setCat] = React.useState<string>(ALL);
  const [limit, setLimit] = React.useState(PAGE_SIZE);
  const keyOf = React.useCallback((p: PlaceSummary) => placeCategoryMeta(p.details.category, categories).value, [categories]);

  const chips = React.useMemo(
    () => orderByDefs(new Set(places.map(keyOf)), categories).map((key) => ({ value: key, label: placeCategoryMeta(key, categories).label })),
    [places, categories, keyOf],
  );

  const filtered = cat === ALL ? places : places.filter((p) => keyOf(p) === cat);
  const shown = filtered.slice(0, limit);
  const pick = (value: string) => {
    setCat(value);
    setLimit(PAGE_SIZE);
  };

  return (
    <>
      <PageHeader title="Gezilecek Yerler" subtitle="Tarihi yapılar, parklar ve doğal güzellikler" backHref={routes.home()}>
        {chips.length > 1 ? (
          <div role="group" aria-label="Kategori" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-0.5">
            <EventChip active={cat === ALL} onClick={() => pick(ALL)} className="h-9 px-3.5">
              Tümü
            </EventChip>
            {chips.map((c) => (
              <EventChip key={c.value} active={cat === c.value} onClick={() => pick(cat === c.value ? ALL : c.value)} className="h-9 px-3.5">
                {c.label}
              </EventChip>
            ))}
          </div>
        ) : null}
      </PageHeader>

      <div className="flex flex-col gap-5 px-4 pt-2 pb-8">
        {filtered.length === 0 ? (
          <div className="rounded-3xl bg-card">
            <EmptyState
              icon={Landmark}
              title={places.length ? "Bu kategoride yer yok" : "Henüz yer yok"}
              description={places.length ? "Başka bir kategori seçmeyi dene." : "Gezilecek yerler yakında burada."}
            />
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {shown.map((p, i) => (
              <li key={p.id}>
                <PlaceTile place={p} categories={categories} district={districtNames[p.id]} priority={i < 2} />
              </li>
            ))}
          </ul>
        )}

        {filtered.length > limit ? (
          <button
            type="button"
            onClick={() => setLimit((l) => l + PAGE_SIZE)}
            className="inline-flex h-11 items-center justify-center gap-1.5 self-center rounded-full bg-card px-5 text-sm font-semibold transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Daha fazla göster
            <span className="font-medium text-muted-foreground">({filtered.length - limit})</span>
          </button>
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
