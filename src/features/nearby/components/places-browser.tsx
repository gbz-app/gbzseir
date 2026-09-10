"use client";

import * as React from "react";
import { Landmark } from "lucide-react";
import { routes } from "@/core/routes";
import { ChipFilter, type ChipOption } from "@/components/shared/chip-filter";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { PLACE_CATEGORIES } from "../config";
import type { PlaceCategory, PlaceSummary } from "../types";
import { PlaceCard, PlaceRow } from "./place-card";

type CategoryFilter = PlaceCategory | "tumu";

/** D6: header with category chips, large cards for curated places, compact rows for the rest. */
export function PlacesBrowser({ places }: { places: PlaceSummary[] }) {
  const [cat, setCat] = React.useState<CategoryFilter>("tumu");

  const options = React.useMemo<ChipOption<CategoryFilter>[]>(() => {
    const counts = new Map<PlaceCategory, number>();
    for (const p of places) counts.set(p.details.category, (counts.get(p.details.category) ?? 0) + 1);
    return [
      { value: "tumu", label: "Tümü", count: places.length },
      ...PLACE_CATEGORIES.filter((c) => counts.get(c.value)).map((c) => ({ value: c.value, label: c.label, icon: c.icon, count: counts.get(c.value) })),
    ];
  }, [places]);

  const filtered = cat === "tumu" ? places : places.filter((p) => p.details.category === cat);
  const featured = filtered.filter((p) => p.details.curated);
  const others = filtered.filter((p) => !p.details.curated);

  return (
    <>
      <PageHeader title="Gezilecek Yerler" subtitle="Gebze'nin tarihi ve doğal güzellikleri" backHref={routes.home()}>
        <ChipFilter options={options} value={cat} onChange={(v) => v && setCat(v)} ariaLabel="Kategori" size="sm" />
      </PageHeader>
      <div className="flex flex-col gap-6 px-4 pt-4 pb-6">
        {filtered.length === 0 ? (
          <EmptyState icon={Landmark} title="Bu kategoride yer yok" description="Başka bir kategori seçmeyi dene." />
        ) : null}

        {featured.length > 0 ? (
          <section aria-labelledby="one-cikanlar">
            <h2 id="one-cikanlar" className="sr-only">
              Öne çıkan yerler
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2">
              {featured.map((p, i) => (
                <li key={p.id}>
                  <PlaceCard place={p} priority={i === 0} />
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
            <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-foreground/[0.06]">
              {others.map((p) => (
                <li key={p.id}>
                  <PlaceRow place={p} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}
