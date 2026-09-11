"use client";

import * as React from "react";
import Link from "next/link";
import { Clock, MapPin, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";
import { routes } from "@/core/routes";
import { PLACE_CATEGORIES, placeCategoryMeta } from "@/features/nearby/config";
import { PlaceVisual } from "@/features/nearby/components/place-card";
import type { PlaceSummary } from "@/features/nearby/types";

/**
 * Home "Gezilecek Yerler": category tabs and tall photo cards with a white info card.
 * Layout follows the travel-app reference the user sent.
 */
export function HomePlaces({ places }: { places: PlaceSummary[] }) {
  const [tab, setTab] = React.useState<string>("tumu");
  const categories = PLACE_CATEGORIES.filter((c) => places.some((p) => p.details.category === c.value));
  const shown = tab === "tumu" ? places : places.filter((p) => p.details.category === tab);
  const big = shown.slice(0, 10);

  return (
    <div>
      <div role="tablist" aria-label="Yer türü" className="no-scrollbar -mx-4 mt-1 flex gap-5 overflow-x-auto px-4">
        {[{ value: "tumu", label: "Tümü" }, ...categories].map((c) => {
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
        {big.map((p, i) => {
          const meta = placeCategoryMeta(p.details.category);
          return (
            <li key={p.id} className="w-[15.5rem] shrink-0 snap-start">
              <Link
                href={routes.nearby.place(p.slug)}
                className="group relative block h-[21rem] overflow-hidden rounded-[1.75rem] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <PlaceVisual category={p.details.category} photo={p.details.photos[0]} name={p.name} sizes="248px" priority={i === 0} className="absolute inset-0" />
                <span className="absolute top-3 right-3 inline-flex h-7 items-center gap-1 rounded-full bg-white/95 px-2.5 text-xs font-semibold text-neutral-900">
                  <meta.icon className="size-3.5" aria-hidden />
                  {meta.label}
                </span>
                <span className="absolute inset-x-2.5 bottom-2.5 rounded-xl bg-card p-3.5">
                  <span className="line-clamp-2 text-base leading-snug font-semibold">{p.name}</span>
                  <span className="mt-1 block truncate text-sm text-muted-foreground">{p.neighbourhoodName ? `${p.neighbourhoodName}, Gebze` : "Gebze"}</span>
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
