"use client";

import * as React from "react";
import { Check, ChevronDown, LocateFixed, Loader2, MapPin, Search, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNeighbourhoods } from "@/lib/neighbourhoods";
import { getDefaultNeighbourhood, setDefaultNeighbourhood } from "@/lib/location/store";
import { useApproxLocation } from "@/lib/location/use-approx-location";
import { distanceMeters } from "@/core/geo";
import { trIncludes } from "@/core/tr";
import type { Neighbourhood } from "@/lib/types";
import { BottomSheet } from "./bottom-sheet";

export type NeighbourhoodPickerProps = {
  /** Selected neighbourhood id. */
  value?: string | null;
  /** Called with the chosen neighbourhood (or null when cleared). */
  onChange?: (neighbourhood: Neighbourhood | null) => void;
  /** Controlled sheet state (use with showTrigger={false}). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Render the select-like field button (default true). */
  showTrigger?: boolean;
  /** Field placeholder (default "Mahalle seç"). */
  placeholder?: string;
  /** Sheet title (default "Mahalleni seç"). */
  title?: string;
  /** Save the choice as the user's default neighbourhood in localStorage (default true). */
  persistDefault?: boolean;
  /** Show a "Mahalle seçimini kaldır" option. */
  allowClear?: boolean;
  /** Show a "Konumumu kullan" row (asks location on tap, picks the nearest neighbourhood). */
  showUseLocation?: boolean;
  /** Called after the user chose "Konumumu kullan" successfully. */
  onLocationUsed?: () => void;
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
};

/** Searchable neighbourhood sheet reading the `neighbourhoods` table. Always available as the location fallback. */
export function NeighbourhoodPicker({
  value,
  onChange,
  open: openProp,
  onOpenChange,
  showTrigger = true,
  placeholder = "Mahalle seç",
  title = "Mahalleni seç",
  persistDefault = true,
  allowClear,
  showUseLocation,
  onLocationUsed,
  id,
  invalid,
  disabled,
  className,
}: NeighbourhoodPickerProps) {
  const [innerOpen, setInnerOpen] = React.useState(false);
  const open = openProp ?? innerOpen;
  const setOpen = React.useCallback(
    (o: boolean) => {
      if (openProp === undefined) setInnerOpen(o);
      onOpenChange?.(o);
    },
    [openProp, onOpenChange],
  );
  const [query, setQuery] = React.useState("");
  const { neighbourhoods, loading, error, reload } = useNeighbourhoods();
  const location = useApproxLocation();

  const selected = React.useMemo(() => {
    if (!value) return null;
    const hit = neighbourhoods.find((n) => String(n.id) === String(value));
    if (hit) return hit;
    const stored = getDefaultNeighbourhood();
    return stored && stored.id === String(value) ? ({ ...stored } as Neighbourhood) : null;
  }, [value, neighbourhoods]);

  const filtered = React.useMemo(
    () => (query ? neighbourhoods.filter((n) => trIncludes(n.name, query) || trIncludes(n.district ?? "", query)) : neighbourhoods),
    [neighbourhoods, query],
  );

  const choose = (n: Neighbourhood | null) => {
    if (persistDefault) setDefaultNeighbourhood(n ? { id: String(n.id), name: n.name, district: n.district, lat: n.lat, lng: n.lng } : null);
    onChange?.(n);
    setQuery("");
    setOpen(false);
  };

  const useMyLocation = async () => {
    const coords = await location.request();
    if (!coords) return; // error is shown inline
    let nearest: Neighbourhood | null = null;
    let best = Infinity;
    for (const n of neighbourhoods) {
      if (typeof n.lat !== "number" || typeof n.lng !== "number") continue;
      const d = distanceMeters(coords, { lat: n.lat, lng: n.lng });
      if (d < best) {
        best = d;
        nearest = n;
      }
    }
    toast.success("Konumun alındı");
    if (nearest && best < 6000) {
      if (persistDefault) setDefaultNeighbourhood({ id: String(nearest.id), name: nearest.name, district: nearest.district, lat: nearest.lat, lng: nearest.lng }, { keepMode: true });
      onChange?.(nearest);
    }
    onLocationUsed?.();
    setOpen(false);
  };

  return (
    <>
      {showTrigger ? (
        <button
          type="button"
          id={id}
          disabled={disabled}
          data-invalid={invalid || undefined}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
          className={cn(
            "flex h-11 w-full items-center gap-2 rounded-card border border-input bg-card px-3.5 text-left text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 data-[invalid=true]:border-destructive data-[invalid=true]:ring-3 data-[invalid=true]:ring-destructive/20 dark:bg-input/30",
            className,
          )}
        >
          <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className={cn("min-w-0 flex-1 truncate", !selected && "text-muted-foreground")}>{selected ? selected.name : placeholder}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      ) : null}

      <BottomSheet open={open} onOpenChange={setOpen} title={title} description="Gebze mahallelerinden birini seç." fullHeight repositionInputs={false}>
        <div className="sticky top-0 z-10 -mx-5 bg-popover px-5 pb-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Mahalle ara"
              aria-label="Mahalle ara"
              className="pl-10"
              enterKeyHint="search"
              autoComplete="off"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Aramayı temizle"
                className="absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
        </div>

        {showUseLocation ? (
          <div className="mb-2">
            <button
              type="button"
              onClick={useMyLocation}
              disabled={location.status === "locating"}
              className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-brand-soft px-4 text-left font-semibold text-primary transition-colors hover:bg-brand-soft/80 disabled:opacity-70"
            >
              {location.status === "locating" ? <Loader2 className="size-5 animate-spin" /> : <LocateFixed className="size-5" />}
              <span className="flex-1">
                Konumumu kullan
                <span className="block text-xs font-medium text-muted-foreground">Yaklaşık konumun sadece bu cihazda tutulur.</span>
              </span>
            </button>
            {location.error ? <p className="mt-2 px-1 text-sm text-destructive">{location.error}</p> : null}
          </div>
        ) : null}

        {allowClear && selected ? (
          <button type="button" onClick={() => choose(null)} className="mb-1 flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold text-muted-foreground hover:bg-muted">
            <X className="size-4" /> Mahalle seçimini kaldır
          </button>
        ) : null}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Mahalleler yükleniyor…
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
            {error}
            <Button variant="outline" size="sm" onClick={reload}>
              Tekrar dene
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {neighbourhoods.length === 0 ? "Mahalle listesi henüz eklenmemiş." : `"${query}" ile eşleşen mahalle bulunamadı.`}
          </p>
        ) : (
          <ul className="flex flex-col" role="listbox" aria-label="Mahalleler">
            {filtered.map((n) => {
              const active = selected && String(selected.id) === String(n.id);
              return (
                <li key={String(n.id)}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={!!active}
                    onClick={() => choose(n)}
                    className={cn(
                      "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left transition-colors hover:bg-muted",
                      active && "bg-brand-soft text-primary hover:bg-brand-soft",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{n.name}</span>
                      {n.district ? <span className="block truncate text-xs text-muted-foreground">{n.district}</span> : null}
                    </span>
                    {active ? <Check className="size-5 shrink-0" aria-hidden /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </BottomSheet>
    </>
  );
}
