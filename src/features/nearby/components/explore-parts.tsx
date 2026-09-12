"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DataSourceNoteProps } from "@/components/shared/data-source-note";
import type { GuideListKind } from "@/features/guide/lib/types";
import { KBB_SOURCE, OSM_COPYRIGHT_URL, OSM_SOURCE } from "../config";
import type { NearbyFilter } from "../types";

/** Small pieces of the explore screen's list sheet (explore-map.tsx). */

const SWITCH_BUTTON = "h-9 rounded-full text-sm font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const SWITCH_IDLE = "text-muted-foreground hover:text-foreground";

/** Tüm eczaneler / Nöbetçi, above the pharmacy list. Nöbetçi picked: solid red like the pins and badges (never yellow). */
export function PharmacySwitch({ duty, onChange }: { duty: boolean; onChange: (duty: boolean) => void }) {
  const options = [
    { duty: false, label: "Tüm eczaneler" },
    { duty: true, label: "Nöbetçi" },
  ] as const;
  return (
    <div role="radiogroup" aria-label="Eczaneler" className="grid grid-cols-2 rounded-full bg-card p-1">
      {options.map((o) => {
        const on = o.duty === duty;
        return (
          <button
            key={o.label}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.duty)}
            className={cn(SWITCH_BUTTON, on ? (o.duty ? "bg-red-600 text-white dark:bg-red-500" : "bg-foreground text-background") : SWITCH_IDLE)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** ATM / Şube: switches the list in place (the bank chip and the search stay). */
export function BankSwitch({
  current,
  counts,
  onChange,
}: {
  current: "atm" | "bank";
  counts?: { atm: number; bank: number };
  onChange: (kind: "atm" | "bank") => void;
}) {
  const items = [
    { kind: "atm", label: "ATM", count: counts?.atm },
    { kind: "bank", label: "Şube", count: counts?.bank },
  ] as const;
  return (
    <div role="radiogroup" aria-label="ATM ya da banka şubesi" className="grid grid-cols-2 rounded-full bg-card p-1">
      {items.map((it) => {
        const on = it.kind === current;
        return (
          <button
            key={it.kind}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => (on ? undefined : onChange(it.kind))}
            className={cn(SWITCH_BUTTON, "inline-flex items-center justify-center gap-1.5", on ? "bg-foreground text-background" : SWITCH_IDLE)}
          >
            {it.label}
            {typeof it.count === "number" ? <span className={cn("text-xs font-medium", on ? "text-background/75" : "")}>{it.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** Pill switch (radio group), e.g. Tümü / Devlet / Özel. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex shrink-0 self-start rounded-full bg-card p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-9 items-center rounded-full px-3.5 text-[13px] font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active ? "bg-primary text-primary-foreground" : SWITCH_IDLE,
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Search field of the list (Turkish-insensitive; the pins follow it). */
export function SheetSearch({
  value,
  onChange,
  onFocus,
  label,
  placeholder = "İsim ya da adres ara",
}: {
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  label: string;
  placeholder?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  return (
    <div role="search" className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 80))}
        onFocus={onFocus}
        placeholder={placeholder}
        aria-label={label}
        enterKeyHint="search"
        autoComplete="off"
        className="h-11 w-full rounded-full bg-card pr-11 pl-12 text-[15px] outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          aria-label="Aramayı temizle"
          className="absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

/** Data credit of a nearby list; none for Nöbetçi (its list ends with the cards, owner 12.09). */
export function nearbySource(filter: NearbyFilter): DataSourceNoteProps | null {
  switch (filter) {
    case "hepsi":
      return { source: `${KBB_SOURCE}, ${OSM_SOURCE}`, sourceUrl: OSM_COPYRIGHT_URL };
    case "eczane":
      return { source: KBB_SOURCE, callAhead: true };
    case "cami":
      return { source: KBB_SOURCE };
    case "durak":
      return { source: OSM_SOURCE, sourceUrl: OSM_COPYRIGHT_URL };
    case "taksi":
      return { source: OSM_SOURCE, sourceUrl: OSM_COPYRIGHT_URL, callAhead: true, note: "Telefonlar herkese açık rehber ve harita kayıtlarından alındı." };
    case "gezilecek":
      return { source: `${KBB_SOURCE}, ${OSM_SOURCE}` };
    default:
      return null;
  }
}

/** Data credit of a guide list (the OSM line wherever OSM data is listed). */
export function guideSource(kind: GuideListKind): DataSourceNoteProps {
  switch (kind) {
    case "institution":
      return {
        source: `Resmî kurum siteleri, ${OSM_SOURCE}`,
        sourceUrl: OSM_COPYRIGHT_URL,
        callAhead: true,
        note: "Telefon ve adresler kurum sitelerinden ve harita kayıtlarından derlendi.",
      };
    case "ev_charge":
      return { source: OSM_SOURCE, sourceUrl: OSM_COPYRIGHT_URL, note: "Soket ve müsaitlik bilgisini operatörün uygulamasından kontrol et." };
    case "place":
      return { source: `${KBB_SOURCE}, ${OSM_SOURCE}`, sourceUrl: OSM_COPYRIGHT_URL };
    case "atm":
    case "bank":
    case "fuel":
      return { source: OSM_SOURCE, sourceUrl: OSM_COPYRIGHT_URL };
  }
}
