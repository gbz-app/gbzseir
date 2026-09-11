import Link from "next/link";
import { Clapperboard } from "lucide-react";
import { routes } from "@/core/routes";
import { DirectionsButton } from "@/components/shared/directions-button";
import type { CinemaVenue } from "../types";

/** "Gebze Center AVM · Paribu Cineverse Gebze Center" with directions (white card, no border). Server-safe. */
export function VenueCard({ venue }: { venue: CinemaVenue }) {
  return (
    <div className="flex items-center gap-3 rounded-3xl bg-card p-3.5">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-primary">
        <Clapperboard className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        {venue.placeSlug ? (
          <Link href={routes.nearby.place(venue.placeSlug)} className="block truncate text-[15px] font-semibold outline-none hover:underline focus-visible:underline">
            {venue.venue}
          </Link>
        ) : (
          <p className="truncate text-[15px] font-semibold">{venue.venue}</p>
        )}
        <p className="truncate text-xs text-muted-foreground">{venue.cinema}</p>
      </div>
      {venue.lat != null && venue.lng != null ? <DirectionsButton lat={venue.lat} lng={venue.lng} name={venue.venue} variant="secondary" size="sm" /> : null}
    </div>
  );
}
