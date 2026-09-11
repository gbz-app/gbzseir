"use client";

import * as React from "react";
import { Check, ChevronDown, LocateFixed, Loader2, MapPin, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { KOCAELI_DISTRICTS, districtBySlug, type KocaeliDistrict } from "@/config/districts";
import { setDefaultDistrict } from "@/lib/location/store";
import { districtForPoint, useApproxLocation } from "@/lib/location/use-approx-location";
import { BottomSheet } from "./bottom-sheet";

export type DistrictPickerProps = {
  /** Selected district slug (districts.id, e.g. "gebze"); an unknown value shows the placeholder. */
  value?: string | null;
  /** Called with the chosen district (or null when cleared). */
  onChange?: (district: KocaeliDistrict | null) => void;
  /** Controlled sheet state (use with showTrigger={false}). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Render the select-like field button (default true). */
  showTrigger?: boolean;
  /** Field placeholder (default "İlçe seç"). */
  placeholder?: string;
  /** Sheet title (default "İlçeni seç"). */
  title?: string;
  /** Sheet description under the title. */
  description?: string;
  /** Also save the choice as the user's default district on this device (default false). */
  persistDefault?: boolean;
  /** Show a clear row above the list while a district is selected. */
  allowClear?: boolean;
  /** Text of the clear row (default "İlçe seçimini kaldır"; e.g. "Tüm ilçeler" in filters). */
  clearLabel?: string;
  /** Show a "Konumumu kullan" row (asks location on tap, picks the district of the fix). */
  showUseLocation?: boolean;
  /** Called after the user chose "Konumumu kullan" successfully. */
  onLocationUsed?: () => void;
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
};

/** District (ilçe) sheet over the static list of Kocaeli's 12 districts; same family as the old NeighbourhoodPicker. */
export function DistrictPicker({
  value,
  onChange,
  open: openProp,
  onOpenChange,
  showTrigger = true,
  placeholder = "İlçe seç",
  title = "İlçeni seç",
  description = "Kocaeli'nin 12 ilçesinden birini seç.",
  persistDefault = false,
  allowClear,
  clearLabel = "İlçe seçimini kaldır",
  showUseLocation,
  onLocationUsed,
  id,
  invalid,
  disabled,
  className,
}: DistrictPickerProps) {
  const [innerOpen, setInnerOpen] = React.useState(false);
  const open = openProp ?? innerOpen;
  const setOpen = React.useCallback(
    (o: boolean) => {
      if (openProp === undefined) setInnerOpen(o);
      onOpenChange?.(o);
    },
    [openProp, onOpenChange],
  );
  const location = useApproxLocation();
  const selected = districtBySlug(value) ?? null;

  const choose = (d: KocaeliDistrict | null) => {
    if (persistDefault) setDefaultDistrict(d?.slug ?? null);
    onChange?.(d);
    setOpen(false);
  };

  const locateMe = async () => {
    const coords = await location.request();
    if (!coords) return; // error is shown inline
    // request() already stored the fix and its district; this lookup is served from the same cache.
    const d = districtBySlug(await districtForPoint(coords));
    onLocationUsed?.();
    if (!d) {
      toast.info("Konumun Kocaeli dışında görünüyor. İlçeni listeden seçebilirsin.");
      return;
    }
    toast.success(`Konumun alındı: ${d.name}`);
    onChange?.(d);
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

      <BottomSheet open={open} onOpenChange={setOpen} title={title} description={description}>
        {showUseLocation ? (
          <div className="mb-3">
            <button
              type="button"
              onClick={locateMe}
              disabled={location.status === "locating"}
              className="flex min-h-14 w-full items-center gap-3 rounded-card bg-brand-soft px-4 text-left font-semibold text-primary transition-colors hover:bg-brand-soft/80 disabled:opacity-70"
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
          <button
            type="button"
            onClick={() => choose(null)}
            className="mb-2 flex min-h-12 w-full items-center gap-3 rounded-chip px-3 text-left text-sm font-semibold text-muted-foreground hover:bg-muted"
          >
            <X className="size-4" /> {clearLabel}
          </button>
        ) : null}

        <ul className="grid grid-cols-2 gap-2" role="listbox" aria-label="İlçeler">
          {KOCAELI_DISTRICTS.map((d) => {
            const active = selected?.slug === d.slug;
            return (
              <li key={d.slug}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => choose(d)}
                  className={cn(
                    "flex min-h-12 w-full items-center gap-2 rounded-chip px-3.5 text-left font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    active ? "bg-brand-soft text-primary" : "bg-muted hover:bg-muted/70",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{d.name}</span>
                  {active ? <Check className="size-4 shrink-0" aria-hidden /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </BottomSheet>
    </>
  );
}
