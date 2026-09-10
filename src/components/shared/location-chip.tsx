"use client";

import * as React from "react";
import { ChevronDown, LocateFixed, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { CITY } from "@/config/site";
import { useApproxLocation } from "@/lib/location/use-approx-location";
import { NeighbourhoodPicker } from "./neighbourhood-picker";

/** Top-bar chip showing the current neighbourhood (or "Gebze"); tap to change or use GPS. */
export function LocationChip({ className }: { className?: string }) {
  const loc = useApproxLocation();
  const [open, setOpen] = React.useState(false);
  const label = loc.neighbourhood?.name ?? (loc.coords ? "Konumum" : CITY.name);
  const Icon = loc.coords ? LocateFixed : MapPin;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Konum: ${label}. Değiştirmek için dokun`}
        className={cn(
          "flex h-11 max-w-[11rem] min-w-0 items-center gap-1.5 rounded-full bg-card pr-3 pl-3.5 text-sm font-semibold text-foreground shadow-soft ring-1 ring-foreground/[0.06] transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
          className,
        )}
      >
        <Icon className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="truncate">{label}</span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </button>
      <NeighbourhoodPicker
        open={open}
        onOpenChange={setOpen}
        showTrigger={false}
        showUseLocation
        value={loc.neighbourhood?.id ?? null}
        title="Konumunu seç"
      />
    </>
  );
}
