import Image from "next/image";
import Link from "next/link";
import { Store } from "lucide-react";
import { CITY } from "@/config/site";
import { routes } from "@/core/routes";
import { cn } from "@/lib/utils";
import { VERTICAL_INFO, type Vertical } from "@/features/business/lib/verticals";
import { PlaceVisual, isOptimizable } from "@/features/nearby/components/place-card";
import { placeCategoryMeta, type PlaceCategoryDef } from "@/features/nearby/config";
import type { PopularPlace } from "../query";

function verticalInfo(key: string | null) {
  return key && key in VERTICAL_INFO ? VERTICAL_INFO[key as Vertical] : null;
}

/** White card: photo (or the category visual) with a type chip, then name and category / district. Server-safe. */
function PopularPlaceCard({ place, categories, priority }: { place: PopularPlace; categories?: readonly PlaceCategoryDef[]; priority?: boolean }) {
  const isPlace = place.kind === "place";
  const placeMeta = isPlace ? placeCategoryMeta(place.category, categories) : null;
  const vertical = isPlace ? null : verticalInfo(place.category);
  const Icon = placeMeta?.icon ?? vertical?.icon ?? Store;
  const chip = placeMeta?.label ?? vertical?.label ?? "İşletme";
  const sub = [place.label, place.districtName].filter(Boolean).join(" · ") || CITY.province;

  return (
    <Link
      href={isPlace ? routes.nearby.place(place.slug) : routes.businesses.detail(place.slug)}
      className="group block overflow-hidden rounded-3xl bg-card outline-none transition-transform active:scale-[0.98] focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        {isPlace ? (
          <PlaceVisual
            category={place.category ?? "diger"}
            categories={categories}
            photo={place.imageUrl ? { url: place.imageUrl, alt: null, credit: null } : null}
            name={place.name}
            sizes="160px"
            priority={priority}
            className="absolute inset-0"
            iconClassName="size-12"
          />
        ) : place.imageUrl ? (
          <Image
            src={place.imageUrl}
            alt=""
            fill
            sizes="160px"
            priority={priority}
            unoptimized={!isOptimizable(place.imageUrl)}
            className="object-cover"
          />
        ) : (
          <div className={cn("absolute inset-0 flex items-center justify-center", vertical?.tone ?? "bg-brand-soft text-primary")}>
            <Icon className="size-10" strokeWidth={1.5} aria-hidden />
          </div>
        )}
        <span className="absolute top-2 left-2 inline-flex h-6 max-w-[calc(100%-1rem)] items-center gap-1 rounded-full bg-card px-2 text-[11px] font-semibold text-foreground">
          <Icon className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{chip}</span>
        </span>
      </div>
      <div className="p-3">
        <p className="line-clamp-2 min-h-10 text-sm leading-5 font-semibold">{place.name}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>
      </div>
    </Link>
  );
}

/** "Popüler yerler": horizontal rail in its own scroll container (the page itself never scrolls sideways). */
export function PopularPlacesRail({ places, categories }: { places: PopularPlace[]; categories?: readonly PlaceCategoryDef[] }) {
  if (!places.length) return null;
  return (
    <section aria-labelledby="ara-populer-yerler">
      <h2 id="ara-populer-yerler" className="mb-3 text-lg font-semibold">
        Popüler yerler
      </h2>
      <ul className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto scroll-px-4 px-4 pb-1">
        {places.map((p, i) => (
          <li key={`${p.kind}:${p.id}`} className="w-40 shrink-0 snap-start">
            <PopularPlaceCard place={p} categories={categories} priority={i < 2} />
          </li>
        ))}
      </ul>
    </section>
  );
}
