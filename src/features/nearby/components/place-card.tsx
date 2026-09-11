import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { routes } from "@/core/routes";
import { placeCategoryMeta, type PlaceCategoryDef } from "../config";
import type { PlaceCategory, PlacePhoto, PlaceSummary } from "../types";

/** place_categories (getVocabularies) for the admin's labels and icons; without it the built-in ones are used. */
type Categories = readonly PlaceCategoryDef[] | undefined;
import { DistanceLabel } from "./distance-label";

const SUPABASE_HOST = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host;
  } catch {
    return "";
  }
})();

/** next/image only optimizes our Supabase media; other hosts are shown as-is. */
export function isOptimizable(url: string): boolean {
  try {
    return !!SUPABASE_HOST && new URL(url).host === SUPABASE_HOST;
  } catch {
    return false;
  }
}

/** Photo, or a category gradient with a large icon when the place has no photo. Server-safe. */
export function PlaceVisual({
  category,
  categories,
  photo,
  name,
  sizes = "(max-width: 672px) 100vw, 672px",
  priority,
  className,
  iconClassName,
}: {
  category: PlaceCategory;
  categories?: Categories;
  photo?: PlacePhoto | null;
  name: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
  iconClassName?: string;
}) {
  const meta = placeCategoryMeta(category, categories);
  const Icon = meta.icon;
  if (photo) {
    return (
      <div className={cn("relative overflow-hidden bg-muted", className)}>
        <Image
          src={photo.url}
          alt={photo.alt ?? name}
          fill
          sizes={sizes}
          priority={priority}
          unoptimized={!isOptimizable(photo.url)}
          className="object-cover"
        />
      </div>
    );
  }
  return (
    <div className={cn("relative flex items-center justify-center overflow-hidden bg-gradient-to-br", meta.gradient, className)} aria-hidden>
      <span className="absolute -top-10 -left-10 size-36 rounded-full bg-white/10" />
      <span className="absolute -right-8 -bottom-12 size-44 rounded-full bg-black/10" />
      <Icon className={cn("relative size-16 text-white/90", iconClassName)} strokeWidth={1.5} />
    </div>
  );
}

/** Large photo card for curated places. */
export function PlaceCard({ place, categories, priority }: { place: PlaceSummary; categories?: Categories; priority?: boolean }) {
  const meta = placeCategoryMeta(place.details.category, categories);
  return (
    <Link
      href={routes.nearby.place(place.slug)}
      className="group block overflow-hidden rounded-3xl bg-card outline-none transition-transform active:scale-[0.99] focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="relative">
        <PlaceVisual
          category={place.details.category}
          categories={categories}
          photo={place.details.photos[0]}
          name={place.name}
          priority={priority}
          className="aspect-[16/10]"
        />
        <span className="absolute top-3 left-3 inline-flex h-7 items-center gap-1 rounded-full bg-white/90 px-2.5 text-xs font-bold text-foreground dark:bg-black/60 dark:text-white">
          <meta.icon className="size-3.5" aria-hidden />
          {meta.label}
        </span>
        <DistanceLabel
          lat={place.lat}
          lng={place.lng}
          withIcon
          className="absolute top-3 right-3 h-7 rounded-full bg-black/55 px-2.5 text-xs font-bold text-white backdrop-blur"
        />
      </div>
      <div className="p-4">
        <h3 className="text-lg leading-snug font-bold group-hover:underline">{place.name}</h3>
        {place.neighbourhoodName ? <p className="mt-0.5 text-sm text-muted-foreground">{place.neighbourhoodName} Mah.</p> : null}
        {place.details.description ? <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-foreground/85">{place.details.description}</p> : null}
      </div>
    </Link>
  );
}

/** Compact row for other (non-curated) places. */
export function PlaceRow({ place, categories }: { place: PlaceSummary; categories?: Categories }) {
  const meta = placeCategoryMeta(place.details.category, categories);
  return (
    <Link
      href={routes.nearby.place(place.slug)}
      className="flex min-h-16 items-center gap-3 px-4 py-2.5 outline-none hover:bg-muted/50 focus-visible:bg-muted/60"
    >
      <PlaceVisual
        category={place.details.category}
        categories={categories}
        photo={place.details.photos[0]}
        name={place.name}
        sizes="48px"
        className="size-12 shrink-0 rounded-xl"
        iconClassName="size-6"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{place.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {meta.label}
          {place.neighbourhoodName ? ` · ${place.neighbourhoodName} Mah.` : ""}
        </span>
      </span>
      <DistanceLabel lat={place.lat} lng={place.lng} className="shrink-0 text-sm font-semibold text-primary" />
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}
