"use client";

import * as React from "react";
import { Map as MapIcon, MapPinOff } from "lucide-react";
import { CITY } from "@/config/site";
import { GoogleMap } from "@/components/maps/google-map";
import { MAP_OPEN_BUTTON, MapPattern } from "@/components/maps/map-states";
import type { MapPoint } from "@/components/maps/types";
import type { GuideEntry } from "./list-config";
import { GuideCard } from "./guide-card";

const hasPin = (e: GuideEntry): e is GuideEntry & { lat: number; lng: number } => typeof e.lat === "number" && typeof e.lng === "number";

/**
 * Map of a list page: pins of the rows with a location; a tapped pin shows its card. Rows without a pin stay in the list.
 * The Google map (a billed load) is created right away only when the user switched to "Harita" (`autoLoad`); a page
 * opened with ?gorunum=harita shows the map pattern and a "Haritayı aç" button first. `onLoad` reports that tap, so the
 * parent can auto-load the map again when this view remounts (e.g. after a filter briefly empties the list).
 */
export function GuideMapView({
  entries,
  title,
  autoLoad = false,
  onLoad,
}: {
  entries: GuideEntry[];
  title: string;
  autoLoad?: boolean;
  onLoad?: () => void;
}) {
  const pinned = React.useMemo(() => entries.filter(hasPin), [entries]);
  const points = React.useMemo<MapPoint[]>(() => pinned.map((e) => ({ id: e.id, lat: e.lat, lng: e.lng, kind: e.kind, label: e.name })), [pinned]);
  const [loaded, setLoaded] = React.useState(autoLoad);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const selected = pinned.find((e) => e.id === selectedId) ?? null;
  const missing = entries.length - pinned.length;
  const fitKey = points.length ? `${points.length}:${points[0].id}:${points[points.length - 1].id}` : "";

  return (
    <div className="flex flex-col gap-3">
      <div className="relative h-[min(60vh,32rem)] min-h-80 w-full overflow-hidden rounded-3xl bg-card">
        {!points.length ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground">
            <MapPinOff className="size-8" aria-hidden />
            <p className="text-sm font-semibold">Bu kayıtların harita konumu henüz yok.</p>
          </div>
        ) : loaded ? (
          <GoogleMap
            points={points}
            center={CITY.center}
            zoom={12}
            selectedId={selectedId}
            onSelect={setSelectedId}
            fitKey={fitKey}
            gestures="cooperative"
            showZoomButtons
            className="h-full w-full"
            ariaLabel={`${title} haritası`}
          />
        ) : (
          <MapPattern className="flex h-full w-full items-center justify-center">
            <button
              type="button"
              onClick={() => {
                setLoaded(true);
                onLoad?.();
              }}
              className={MAP_OPEN_BUTTON}
            >
              <MapIcon className="size-5" aria-hidden />
              Haritayı aç
            </button>
          </MapPattern>
        )}
      </div>
      {selected ? (
        <GuideCard entry={selected} />
      ) : points.length && loaded ? (
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
