"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CITY } from "@/config/site";
import { routes } from "@/core/routes";
import { HideBottomNav } from "@/components/layout/nav-visibility";
import { LazyNearbyMap } from "@/features/nearby/map/lazy-map";
import type { MapPoint } from "@/features/nearby/map/types";
import { dateBadge, eventWhenLine } from "../format";
import type { EventItem } from "../queries";
import { EventCoverFallback, eventPlaceLine } from "./event-card";

/** Events at the same spot share one pin (a venue with several events). */
type Spot = { key: string; lat: number; lng: number; events: EventItem[] };

const spotKey = (lat: number, lng: number) => `${lat.toFixed(5)},${lng.toFixed(5)}`;

/** Round white button on the map (no shadow). */
const MAP_BUTTON =
  "pointer-events-auto flex size-11 shrink-0 items-center justify-center rounded-full bg-card text-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50";

function EventRow({ e, now, big }: { e: EventItem; now: Date | null; big?: boolean }) {
  const badge = dateBadge(e.starts_at);
  const where = eventPlaceLine(e);
  return (
    <Link
      href={routes.events.detail(e.slug)}
      className={cn("flex items-center gap-3 rounded-3xl bg-card outline-none focus-visible:ring-3 focus-visible:ring-ring/50", big ? "p-2.5" : "p-2")}
    >
      <span className={cn("relative shrink-0 overflow-hidden rounded-2xl bg-muted", big ? "size-20" : "size-16")}>
        {e.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={e.cover_url} alt="" className="size-full object-cover" />
        ) : (
          <EventCoverFallback icon={e.category_icon} iconClassName="size-7" />
        )}
        <span className="absolute top-1 left-1 rounded-lg bg-card px-1.5 py-0.5 text-center text-[10px] leading-tight font-bold">
          {badge.day} <span className="text-primary uppercase">{badge.month}</span>
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{e.title}</span>
        <span className="block truncate text-sm">{eventWhenLine(e.starts_at, e.ends_at, now)}</span>
        {where ? <span className="block truncate text-sm text-muted-foreground">{where}</span> : null}
      </span>
      <span className="mr-1 flex size-11 shrink-0 items-center justify-center rounded-full bg-foreground text-background" aria-hidden>
        <ArrowUpRight className="size-5" />
      </span>
    </Link>
  );
}

/** Full-screen map of the listed events with coordinates; tapping a pin shows its event(s) at the bottom. */
export function EventsMap({ events, now, onClose }: { events: EventItem[]; now: Date | null; onClose: () => void }) {
  const spots = React.useMemo<Spot[]>(() => {
    const map = new Map<string, Spot>();
    for (const e of events) {
      if (e.lat == null || e.lng == null) continue;
      const key = spotKey(e.lat, e.lng);
      const spot = map.get(key);
      if (spot) spot.events.push(e);
      else map.set(key, { key, lat: e.lat, lng: e.lng, events: [e] });
    }
    return [...map.values()];
  }, [events]);
  const [selected, setSelected] = React.useState<string | null>(spots[0]?.key ?? null);
  const points = React.useMemo<MapPoint[]>(
    () =>
      spots.map((s) => ({
        id: s.key,
        lat: s.lat,
        lng: s.lng,
        kind: "place",
        label: s.events.length > 1 ? `${s.events[0].venue_name ?? "Bu konum"}: ${s.events.length} etkinlik` : s.events[0].title,
      })),
    [spots],
  );
  const current = spots.find((s) => s.key === selected) ?? null;

  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] bg-background" role="dialog" aria-modal="true" aria-label="Etkinlikler haritası">
      <HideBottomNav />
      <LazyNearbyMap
        points={points}
        center={CITY.center}
        zoom={12.5}
        selectedId={selected}
        onSelect={setSelected}
        fitKey="all"
        padding={{ top: 96, right: 32, bottom: 220, left: 32 }}
        className="absolute inset-0"
        ariaLabel="Etkinlikler haritada"
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]">
        {/* Focus moves into the dialog (keyboard and screen readers); Escape or this button closes it. */}
        <button type="button" onClick={onClose} aria-label="Haritayı kapat" className={MAP_BUTTON} autoFocus>
          <X className="size-5" />
        </button>
        <span className="pointer-events-auto rounded-full bg-card px-4 py-2.5 text-sm font-semibold">
          Etkinlikler · {events.length}
        </span>
      </div>
      {current ? (
        <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-2xl px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
          {current.events.length === 1 ? (
            <EventRow e={current.events[0]} now={now} big />
          ) : (
            <div className="rounded-3xl bg-card p-2">
              <p className="truncate px-2.5 pt-1.5 pb-2 text-sm font-semibold">
                {current.events[0].venue_name ?? "Bu konumda"} · {current.events.length} etkinlik
              </p>
              <ul className="flex max-h-[42dvh] flex-col gap-1 overflow-y-auto overscroll-contain">
                {current.events.map((e) => (
                  <li key={e.id}>
                    <EventRow e={e} now={now} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
