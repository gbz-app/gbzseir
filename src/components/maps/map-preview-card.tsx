"use client";

import * as React from "react";
import { ExternalLink, Map as MapIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { googleMapsPlaceUrl } from "@/core/geo";
import { pinSvg } from "@/features/nearby/map/markers";
import type { MarkerKind } from "@/features/nearby/types";
import { GoogleMap, useGoogleMapsAvailable } from "./google-map";
import { MAP_OPEN_BUTTON, MAP_UNAVAILABLE_TITLE, MapPattern } from "./map-states";
import type { MapPoint } from "./types";

export type MapPreviewCardProps = {
  lat: number;
  lng: number;
  kind: MarkerKind;
  name: string;
  /** Shown under the pattern; the name is used when missing. */
  address?: string | null;
  className?: string;
};

/**
 * Detail-page location card: a CSS map pattern with the kind's pin, the address and a black "Haritada göster" button.
 * The interactive Google map (a billed map load) is created inline only after that tap, with cooperative gestures
 * (two fingers) so the page keeps scrolling. Directions stay a plain Google Maps link on the page (no JS API).
 */
export function MapPreviewCard({ lat, lng, kind, name, address, className }: MapPreviewCardProps) {
  const [open, setOpen] = React.useState(false);
  const available = useGoogleMapsAvailable();
  const areaRef = React.useRef<HTMLDivElement>(null);
  const points = React.useMemo<MapPoint[]>(() => [{ id: "self", lat, lng, kind, label: name }], [lat, lng, kind, name]);
  const center = React.useMemo(() => ({ lat, lng }), [lat, lng]);
  // Static SVG built from our own constants (markers.ts).
  const pin = React.useMemo(() => ({ __html: pinSvg(kind) }), [kind]);
  const title = address?.trim() || name;
  const sub = !available ? MAP_UNAVAILABLE_TITLE : address?.trim() ? name : null;

  const show = () => {
    setOpen(true);
    // The button disappears: keep keyboard focus in the card.
    window.requestAnimationFrame(() => areaRef.current?.focus());
  };

  return (
    <div className={cn("overflow-hidden rounded-3xl bg-card", className)}>
      <div ref={areaRef} tabIndex={-1} className="relative aspect-[16/9] w-full outline-none">
        {open ? (
          <>
            <GoogleMap points={points} center={center} zoom={16} gestures="cooperative" showZoomButtons className="absolute inset-0" ariaLabel={`${name} haritada`} />
            <a
              href={googleMapsPlaceUrl({ lat, lng, name })}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute top-3 left-3 z-10 inline-flex h-9 items-center gap-1.5 rounded-full bg-card px-3 text-xs font-semibold outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Google Haritalar&apos;da aç
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </>
        ) : (
          <MapPattern className="absolute inset-0 flex items-center justify-center">
            <span className="inline-block drop-shadow-[0_2px_2px_rgb(0_0_0/0.28)]" aria-hidden dangerouslySetInnerHTML={pin} />
          </MapPattern>
        )}
      </div>
      {open ? null : (
        <div className="flex items-center gap-3 py-3 pr-3 pl-4">
          <p className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{title}</span>
            {sub ? <span className="block truncate text-xs text-muted-foreground">{sub}</span> : null}
          </p>
          {available ? (
            <button type="button" onClick={show} className={cn(MAP_OPEN_BUTTON, "h-11 shrink-0 px-4 text-sm")}>
              <MapIcon className="size-[1.125rem]" aria-hidden />
              Haritada göster
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
