"use client";

import { Loader2, LocateFixed, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { ApproxLocation } from "@/lib/location/use-approx-location";

export type LocationPromptProps = {
  loc: ApproxLocation;
  /** Ask for the GPS position (from a tap). */
  onLocate: () => void;
  /** Open the neighbourhood picker. */
  onPickNeighbourhood: () => void;
  className?: string;
};

/**
 * Shown when there is no GPS fix: "Konum izni ver" + "Mahalle seç". With a manual neighbourhood it becomes
 * a one-line hint ("Hacıhalil merkezine göre sıralanıyor").
 */
export function LocationPrompt({ loc, onLocate, onPickNeighbourhood, className }: LocationPromptProps) {
  if (loc.pointSource === "gps") return null;
  const locating = loc.status === "locating";

  if (loc.pointSource === "neighbourhood" && loc.neighbourhood) {
    return (
      <div className={cn("flex items-center gap-2 rounded-2xl bg-muted/70 py-1 pr-1 pl-3.5 text-sm", className)}>
        <MapPin className="size-4 shrink-0 text-primary" aria-hidden />
        <p className="min-w-0 flex-1 truncate">
          <span className="font-semibold">{loc.neighbourhood.name}</span> merkezine göre
        </p>
        <Button type="button" variant="ghost" size="sm" className="h-11 text-primary" onClick={onPickNeighbourhood}>
          Değiştir
        </Button>
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
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        Yaklaşık konumun yalnızca bu cihazda tutulur. İstersen mahalleni seçebilirsin.
      </p>
      {loc.error ? <p className="mt-2 text-sm font-medium text-destructive">{loc.error}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" onClick={onLocate} disabled={locating} className="flex-1">
          {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />}
          Konum izni ver
        </Button>
        <Button type="button" variant="outline" onClick={onPickNeighbourhood} className="flex-1">
          <MapPin />
          Mahalle seç
        </Button>
      </div>
    </div>
  );
}
