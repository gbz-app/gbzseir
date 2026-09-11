"use client";

import { ChevronRight, MapPin } from "lucide-react";
import { appleDirectionsUrl, googleDirectionsUrl } from "@/core/geo";
import { logContactEvent } from "@/lib/contact";
import { isIOS } from "@/lib/platform";

export type AddressDirectionsProps = {
  businessId: string;
  name: string;
  /** Address shown on the card. */
  address: string;
  lat: number | null;
  lng: number | null;
  /** Destination text when there are no coordinates ("Street 1, Gebze, Kocaeli"). */
  query: string;
};

/**
 * Tappable address card: opens turn-by-turn directions like DirectionsButton (Apple Maps on iOS, Google Maps
 * elsewhere; logs a 'directions' contact_event). Without coordinates the address text is the destination.
 */
export function AddressDirections({ businessId, name, address, lat, lng, query }: AddressDirectionsProps) {
  const hasCoords = typeof lat === "number" && typeof lng === "number";
  const target = hasCoords ? { lat, lng, name } : null;
  const href = target ? googleDirectionsUrl(target) : `https://www.google.com/maps/dir/?${new URLSearchParams({ api: "1", destination: query })}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        logContactEvent({ subjectType: "business", subjectId: businessId, event: "directions" });
        if (isIOS()) {
          e.preventDefault();
          window.location.href = target ? appleDirectionsUrl(target) : `https://maps.apple.com/?${new URLSearchParams({ daddr: query, dirflg: "d" })}`;
        }
      }}
      className="flex items-center gap-3 rounded-3xl bg-card p-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted/60"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-muted text-foreground">
        <MapPin className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] leading-snug font-medium">{address}</span>
        <span className="mt-0.5 block text-sm font-semibold text-primary">Yol tarifi al</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </a>
  );
}
