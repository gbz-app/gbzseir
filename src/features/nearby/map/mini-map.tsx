"use client";

import * as React from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { googleMapsPlaceUrl } from "@/core/geo";
import type { MarkerKind } from "../types";
import { LazyNearbyMap, MapPlaceholder } from "./lazy-map";
import type { MapPoint } from "./types";

export type MiniMapProps = {
  lat: number;
  lng: number;
  kind: MarkerKind;
  name: string;
  className?: string;
};

/** Small non-interactive map for detail pages. The map chunk loads only when the box scrolls into view. */
export function MiniMap({ lat, lng, kind, name, className }: MiniMapProps) {
  const boxRef = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      const id = window.setTimeout(() => setVisible(true), 0);
      return () => window.clearTimeout(id);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const points = React.useMemo<MapPoint[]>(() => [{ id: "self", lat, lng, kind, label: name }], [lat, lng, kind, name]);
  const center = React.useMemo(() => ({ lat, lng }), [lat, lng]);

  return (
    <div ref={boxRef} className={cn("relative aspect-[16/9] w-full overflow-hidden rounded-2xl ring-1 ring-foreground/[0.06]", className)}>
      {visible ? (
        <LazyNearbyMap points={points} center={center} zoom={15.5} interactive={false} className="h-full w-full" ariaLabel={`${name} haritada`} />
      ) : (
        <MapPlaceholder />
      )}
      <a
        href={googleMapsPlaceUrl({ lat, lng, name })}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-2 right-2 inline-flex h-9 items-center gap-1.5 rounded-full bg-background/95 px-3 text-xs font-semibold shadow-soft ring-1 ring-foreground/[0.06] outline-none hover:bg-background focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Haritada aç
        <ExternalLink className="size-3.5" aria-hidden />
      </a>
    </div>
  );
}
