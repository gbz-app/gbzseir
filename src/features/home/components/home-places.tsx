"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { Clock, MapPin, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";
import { districtName } from "@/config/districts";
import { routes } from "@/core/routes";
import { parseMediaUrl } from "@/lib/media/kinds";
import { orderByDefs } from "@/features/business/lib/category-visuals";
import { PLACE_CATEGORY_DEFS, placeCategoryMeta, type PlaceCategoryDef } from "@/features/nearby/config";
import { PlaceVisual } from "@/features/nearby/components/place-card";
import type { PlaceSummary } from "@/features/nearby/types";

/**
 * Home "Gezilecek Yerler": category tabs (admin order, labels and icons of place_categories) and tall photo cards with
 * a white info card. Layout follows the travel-app reference the user sent.
 */
export function HomePlaces({ places, categories = PLACE_CATEGORY_DEFS }: { places: PlaceSummary[]; categories?: readonly PlaceCategoryDef[] }) {
  const [tab, setTab] = React.useState<string>("tumu");
  // Resolved key: one the vocabulary does not know groups under "diger" (see placeCategoryMeta).
  const keyOf = (p: PlaceSummary) => placeCategoryMeta(p.details.category, categories).value;
  const tabs = orderByDefs(places.map(keyOf), categories).map((key) => placeCategoryMeta(key, categories));
  const shown = tab === "tumu" ? places : places.filter((p) => keyOf(p) === tab);
  const big = shown.slice(0, 10);

  return (
    <div>
      <div role="tablist" aria-label="Yer türü" className="no-scrollbar -mx-4 mt-1 flex gap-5 overflow-x-auto px-4">
        {[{ value: "tumu", label: "Tümü" }, ...tabs].map((c) => {
          const active = tab === c.value;
          return (
            <button
              key={c.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(c.value)}
              className={cn(
                "relative shrink-0 pb-2 text-[15px] transition-colors outline-none focus-visible:text-foreground",
                active ? "font-semibold text-foreground" : "font-medium text-muted-foreground hover:text-foreground",
              )}
            >
              {c.label}
              <span className={cn("absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-foreground transition-opacity", active ? "opacity-100" : "opacity-0")} aria-hidden />
            </button>
          );
        })}
      </div>

      <ul className="no-scrollbar -mx-4 mt-3 flex snap-x gap-3 overflow-x-auto scroll-px-4 px-4 pb-2">
        {big.map((p) => {
          const meta = placeCategoryMeta(p.details.category, categories);
          const photo = p.details.photos[0];
          // The 1024 px variant first (as PlaceVisual does), and whichever candidate is in our stores gets resized.
          const candidates = photo ? [photo.thumbUrl, photo.url].filter((u): u is string => !!u) : [];
          const src = candidates.find((u) => parseMediaUrl(u)) ?? candidates[0];
          return (
            <li key={p.id} className="w-[15.5rem] shrink-0 snap-start">
              <Link
                href={routes.nearby.place(p.slug)}
                className="group relative block h-[21rem] overflow-hidden rounded-media outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {photo && src ? (
                  // Our stores (R2, Supabase media) go through the next/image resizer: a 248px card gets a ~750px
                  // WebP instead of the 1920-2560px original (up to 1.7 MB each). Lazy, async decode, no preload.
                  <span className="absolute inset-0 overflow-hidden bg-muted">
                    <Image src={src} alt={photo.alt ?? p.name} fill sizes="248px" unoptimized={!parseMediaUrl(src)} className="object-cover" />
                  </span>
                ) : (
                  <PlaceVisual category={p.details.category} categories={categories} photo={null} name={p.name} className="absolute inset-0" />
                )}
                <span className="absolute top-3 right-3 inline-flex h-7 items-center gap-1 rounded-full bg-white/95 px-2.5 text-xs font-semibold text-neutral-900">
                  <meta.icon className="size-3.5" aria-hidden />
                  {meta.label}
                </span>
                <span className="absolute inset-x-2.5 bottom-2.5 rounded-xl bg-card p-3.5">
                  <span className="line-clamp-2 text-base leading-snug font-semibold">{p.name}</span>
                  <span className="mt-1 block truncate text-sm text-muted-foreground">{districtName(p.districtId)}</span>
                  <span className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    {p.details.hours ? (
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <Clock className="size-3.5 shrink-0" aria-hidden />
                        <span className="truncate">{p.details.hours}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3.5" aria-hidden /> Yol tarifi
                      </span>
                    )}
                    <span className="inline-flex shrink-0 items-center gap-1">
                      <Ticket className="size-3.5" aria-hidden />
                      {p.details.fee || "Ücretsiz"}
                    </span>
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
