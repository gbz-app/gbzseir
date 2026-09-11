"use client";

import { Check, MapPinned } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { DISTRICT_SLUGS, KOCAELI_DISTRICTS, isDistrictSlug, type DistrictSlug } from "@/config/districts";

/**
 * FilterChip look without a border: white chip, black when chosen (with a check). On a white surface (EditCard bg-card,
 * dialog bg-popover) the idle chip turns bg-muted so it still shows.
 */
const CHIP =
  "inline-flex min-h-11 w-full items-center gap-1.5 rounded-full px-3.5 text-left text-sm font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const CHIP_ON = "bg-foreground text-background";
const CHIP_OFF =
  "bg-card text-foreground hover:bg-muted in-[.bg-card]:bg-muted in-[.bg-card]:hover:bg-foreground/10 in-[.bg-popover]:bg-muted in-[.bg-popover]:hover:bg-foreground/10";
/** The "Tüm Kocaeli" row: white on the page, muted on a white surface, brand-soft when on. */
const ALL_ROW =
  "flex min-h-14 cursor-pointer items-center gap-3 rounded-card bg-card px-4 py-3 transition-colors in-[.bg-card]:bg-muted in-[.bg-popover]:bg-muted has-[button[aria-checked=true]]:bg-brand-soft has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50";

/**
 * Districts (ilçe slugs, districts.id) the business travels to; "Tüm Kocaeli" selects all 12. Values that are not a
 * district slug (e.g. an old neighbourhood id from a saved draft) are ignored and dropped on the next change.
 */
export function AreaPicker({ value, onChange, id }: { value: string[]; onChange: (v: string[]) => void; id?: string }) {
  const selected = value.filter(isDistrictSlug);
  const all = DISTRICT_SLUGS.every((slug) => selected.includes(slug));
  const toggle = (slug: DistrictSlug) => onChange(selected.includes(slug) ? selected.filter((x) => x !== slug) : [...selected, slug]);

  return (
    <div id={id} className="flex flex-col gap-3">
      <label className={ALL_ROW}>
        <MapPinned className="size-5 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold">Tüm Kocaeli</span>
          <span className="block text-xs text-muted-foreground">12 ilçenin hepsine gidiyorum.</span>
        </span>
        <Switch checked={all} onCheckedChange={(c) => onChange(c ? [...DISTRICT_SLUGS] : [])} aria-label="Tüm Kocaeli" />
      </label>

      <p className="text-sm font-semibold text-muted-foreground" aria-live="polite">
        {all ? "Tüm ilçeler seçili" : selected.length > 0 ? `${selected.length} ilçe seçildi` : "Gittiğin ilçeleri seç"}
      </p>

      <div role="group" aria-label="İlçeler" className="grid grid-cols-2 gap-2">
        {KOCAELI_DISTRICTS.map((d) => {
          const active = selected.includes(d.slug);
          return (
            <button key={d.slug} type="button" role="checkbox" aria-checked={active} onClick={() => toggle(d.slug)} className={cn(CHIP, active ? CHIP_ON : CHIP_OFF)}>
              {active ? <Check className="size-4 shrink-0" aria-hidden /> : null}
              <span className="min-w-0 truncate">{d.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
