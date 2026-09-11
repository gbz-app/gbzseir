"use client";

import * as React from "react";
import { MapPinOff } from "lucide-react";
import { CITY } from "@/config/site";
import { LazyNearbyMap } from "@/features/nearby/map/lazy-map";
import type { MapPoint } from "@/features/nearby/map/types";
import type { GuideEntry } from "./list-config";
import { GuideCard } from "./guide-card";

const hasPin = (e: GuideEntry): e is GuideEntry & { lat: number; lng: number } => typeof e.lat === "number" && typeof e.lng === "number";

/** Map of a list page: pins of the rows with a location; a tapped pin shows its card. Rows without a pin stay in the list. */
export function GuideMapView({ entries, title }: { entries: GuideEntry[]; title: string }) {
  const pinned = React.useMemo(() => entries.filter(hasPin), [entries]);
  const points = React.useMemo<MapPoint[]>(() => pinned.map((e) => ({ id: e.id, lat: e.lat, lng: e.lng, kind: e.kind, label: e.name })), [pinned]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const selected = pinned.find((e) => e.id === selectedId) ?? null;
  const missing = entries.length - pinned.length;
  const fitKey = points.length ? `${points.length}:${points[0].id}:${points[points.length - 1].id}` : "";

  return (
    <div className="flex flex-col gap-3">
      <div className="relative h-[min(60vh,32rem)] min-h-80 w-full overflow-hidden rounded-3xl bg-card">
        {points.length ? (
          <LazyNearbyMap
            points={points}
            center={CITY.center}
            zoom={12}
            selectedId={selectedId}
            onSelect={setSelectedId}
            fitKey={fitKey}
            showControls
            className="h-full w-full"
            ariaLabel={`${title} haritası`}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground">
            <MapPinOff className="size-8" aria-hidden />
            <p className="text-sm font-semibold">Bu kayıtların harita konumu henüz yok.</p>
          </div>
        )}
      </div>
      {selected ? (
        <GuideCard entry={selected} />
      ) : points.length ? (
        <p className="px-1 text-sm text-muted-foreground">Ayrıntı için haritada bir işarete dokun.</p>
      ) : null}
      {missing > 0 && points.length ? (
        <p className="rounded-2xl bg-muted/70 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          {missing} kaydın harita konumu henüz yok. Onları listede görebilirsin.
        </p>
      ) : null}
    </div>
  );
}
