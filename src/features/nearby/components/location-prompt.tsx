"use client";

import { Loader2, LocateFixed, Navigation } from "lucide-react";
import { cn } from "@/lib/utils";
import { districtBySlug } from "@/config/districts";
import { Button } from "@/components/ui/button";
import type { ApproxLocation } from "@/lib/location/use-approx-location";

export type LocationPromptProps = {
  loc: ApproxLocation;
  /** Ask for the GPS position (from a tap). */
  onLocate: () => void;
  className?: string;
};

/**
 * Shown when there is no GPS fix: one "Konum izni ver" button (no district picking, owner 12.09). A district saved on
 * this device earlier still centres the list; then it is a one-line hint ("Darıca merkezine göre") with "Konumum".
 */
export function LocationPrompt({ loc, onLocate, className }: LocationPromptProps) {
  if (loc.pointSource === "gps") return null;
  const locating = loc.status === "locating";
  const district = loc.pointSource === "district" ? districtBySlug(loc.district) : undefined;

  if (district) {
    return (
      <div className={cn("flex items-center gap-2 rounded-2xl bg-muted/70 py-1 pr-1 pl-3.5 text-sm", className)}>
        <Navigation className="size-4 shrink-0 text-primary" aria-hidden />
        <p className="min-w-0 flex-1 truncate">
          <span className="font-semibold">{district.name}</span> merkezine göre
        </p>
        <Button type="button" variant="ghost" size="sm" className="h-11 text-primary" onClick={onLocate} disabled={locating}>
          {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />}
          Konumum
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("rounded-2xl bg-brand-soft p-4", className)}>
      <p className="font-bold text-primary">Yakınındakileri görmek için konumunu paylaş</p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Yaklaşık konumun yalnızca bu cihazda tutulur.</p>
      {loc.error ? <p className="mt-2 text-sm font-medium text-destructive">{loc.error}</p> : null}
      <Button type="button" onClick={onLocate} disabled={locating} className="mt-3 w-full">
        {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />}
        Konum izni ver
      </Button>
    </div>
  );
}
