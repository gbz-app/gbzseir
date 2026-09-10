"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarDays, Gift, Store } from "lucide-react";
import { istanbulDateKey, istanbulParts } from "@/core/time";
import { routes } from "@/core/routes";
import { Button } from "@/components/ui/button";
import { ExploreHeader, FilterChip } from "@/components/shared/explore-header";
import { EVENT_CATEGORIES, EVENT_CATEGORY_INFO, type EventCategory } from "@/features/business/lib/verticals";
import { eventDayRange } from "../format";
import type { EventItem } from "../queries";
import { EventCard } from "./event-card";

type When = "all" | "today" | "weekend";

/** Istanbul day keys of today / this weekend (Saturday + Sunday; on Sunday only today). */
function dayKeys(when: Exclude<When, "all">, now: Date): string[] {
  const day = (offset: number) => istanbulDateKey(new Date(now.getTime() + offset * 86_400_000));
  if (when === "today") return [day(0)];
  const wd = istanbulParts(now).weekday; // 0 = Sunday
  if (wd === 0) return [day(0)];
  const toSat = 6 - wd;
  return [day(toSat), day(toSat + 1)];
}

/** /etkinlikler: date + category chips over the upcoming events. */
export function EventsExplorer({ events }: { events: EventItem[] }) {
  const [when, setWhen] = React.useState<When>("all");
  const [freeOnly, setFreeOnly] = React.useState(false);
  const [cat, setCat] = React.useState<EventCategory | null>(null);

  const categories = React.useMemo(() => EVENT_CATEGORIES.filter((c) => events.some((e) => e.category === c)), [events]);

  const filtered = React.useMemo(() => {
    const keys = when === "all" ? null : dayKeys(when, new Date());
    return events.filter((e) => {
      if (freeOnly && !e.is_free) return false;
      if (cat && e.category !== cat) return false;
      if (keys) {
        const [first, last] = eventDayRange(e.starts_at, e.ends_at);
        if (!keys.some((k) => k >= first && k <= last)) return false;
      }
      return true;
    });
  }, [events, when, freeOnly, cat]);

  const anyFilter = when !== "all" || freeOnly || !!cat;
  const clearAll = () => {
    setWhen("all");
    setFreeOnly(false);
    setCat(null);
  };

  return (
    <div className="flex flex-col gap-4 px-4 pb-28">
      <ExploreHeader title="Etkinlikler" subtitle="Konser, tiyatro, atölye ve festivaller" />

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-1" role="group" aria-label="Tarih filtresi">
        <FilterChip active={!anyFilter} onClick={clearAll}>
          Tümü
        </FilterChip>
        <FilterChip active={when === "today"} onClick={() => setWhen((w) => (w === "today" ? "all" : "today"))} icon={CalendarDays}>
          Bugün
        </FilterChip>
        <FilterChip active={when === "weekend"} onClick={() => setWhen((w) => (w === "weekend" ? "all" : "weekend"))} icon={CalendarDays}>
          Hafta sonu
        </FilterChip>
        <FilterChip active={freeOnly} onClick={() => setFreeOnly((v) => !v)} icon={Gift}>
          Ücretsiz
        </FilterChip>
      </div>

      {categories.length > 1 ? (
        <div className="no-scrollbar -mx-4 -mt-2 flex gap-2 overflow-x-auto px-4 py-1" role="group" aria-label="Kategori">
          {categories.map((c) => {
            const info = EVENT_CATEGORY_INFO[c];
            return (
              <FilterChip key={c} active={cat === c} onClick={() => setCat((v) => (v === c ? null : c))} icon={info.icon}>
                {info.label}
              </FilterChip>
            );
          })}
        </div>
      ) : null}

      {events.length === 0 ? (
        <div className="flex flex-col items-center rounded-3xl bg-card px-6 py-10 text-center shadow-soft ring-1 ring-foreground/[0.05]">
          <CalendarDays className="size-10 text-primary/50" strokeWidth={1.5} aria-hidden />
          <p className="mt-3 font-semibold">Yaklaşan etkinlik yok</p>
          <p className="mt-1 text-sm text-muted-foreground">İşletmen etkinlik düzenliyorsa işletme panelinden ekleyebilirsin.</p>
          <Button asChild variant="outline" className="mt-5">
            <Link href={routes.business.intro()}>
              <Store /> İşletme sayfası aç
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {filtered.length} etkinlik
          </p>
          {filtered.length === 0 ? (
            <div className="rounded-3xl bg-card px-6 py-8 text-center shadow-soft ring-1 ring-foreground/[0.05]">
              <p className="font-semibold">Bu filtrelere uygun etkinlik yok</p>
              <Button variant="outline" className="mt-4" onClick={clearAll}>
                Filtreleri temizle
              </Button>
            </div>
          ) : (
            <ul className="flex flex-col gap-4">
              {filtered.map((e, i) => (
                <li key={e.id}>
                  <EventCard event={e} eager={i < 2} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
