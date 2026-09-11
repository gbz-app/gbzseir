"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ChipOption<T extends string = string> = {
  value: T;
  label: string;
  icon?: LucideIcon;
  /** Optional count shown after the label. */
  count?: number;
  disabled?: boolean;
};

type BaseProps<T extends string> = {
  options: ChipOption<T>[];
  /** Accessible name of the group, e.g. "Kategori". */
  ariaLabel?: string;
  /** Let the row bleed to the screen edges inside a px-4 container (default true). */
  bleed?: boolean;
  size?: "sm" | "md";
  /** Keep the selected chip horizontally centered (single select; instant on first render, smooth after). */
  centerSelected?: boolean;
  className?: string;
};

export type ChipFilterProps<T extends string = string> = BaseProps<T> &
  (
    | { multiple?: false; value: T | null; onChange: (value: T | null) => void; /** Tapping the active chip clears it. */ allowDeselect?: boolean }
    | { multiple: true; value: T[]; onChange: (value: T[]) => void; allowDeselect?: never }
  );

/** Horizontally scrolling filter chips (single or multi select). */
export function ChipFilter<T extends string = string>(props: ChipFilterProps<T>) {
  const { options, ariaLabel, bleed = true, size = "md", centerSelected = false, className } = props;
  const isActive = (v: T) => (props.multiple ? props.value.includes(v) : props.value === v);
  const rowRef = React.useRef<HTMLDivElement>(null);
  const centeredOnce = React.useRef(false);
  const selected = !props.multiple ? props.value : null;

  // Scrolls only the row itself (scrollIntoView would also move overflow-hidden ancestors).
  React.useEffect(() => {
    const row = rowRef.current;
    if (!centerSelected || !row || selected === null) return;
    const chip = row.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!chip) return;
    const rowBox = row.getBoundingClientRect();
    const chipBox = chip.getBoundingClientRect();
    const left = row.scrollLeft + (chipBox.left - rowBox.left) - (row.clientWidth - chipBox.width) / 2;
    row.scrollTo({ left: Math.max(0, left), behavior: centeredOnce.current ? "smooth" : "instant" });
    centeredOnce.current = true;
  }, [centerSelected, selected]);

  const toggle = (v: T) => {
    if (props.multiple) {
      props.onChange(props.value.includes(v) ? props.value.filter((x) => x !== v) : [...props.value, v]);
    } else if (props.value === v) {
      if (props.allowDeselect) props.onChange(null);
    } else {
      props.onChange(v);
    }
  };

  return (
    <div
      ref={rowRef}
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "no-scrollbar flex gap-2 overflow-x-auto py-1",
        // Snap points would pull a centered chip back to its start edge.
        !centerSelected && "snap-x",
        bleed && "-mx-4 scroll-px-4 px-4",
        className,
      )}
    >
      {options.map((o) => {
        const active = isActive(o.value);
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role={props.multiple ? "checkbox" : "radio"}
            aria-checked={active}
            disabled={o.disabled}
            onClick={() => toggle(o.value)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
              !centerSelected && "snap-start",
              size === "sm" ? "h-9 px-3 text-[13px]" : "h-10 px-4 text-sm",
              active
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border bg-card text-foreground hover:bg-muted",
            )}
          >
            {Icon ? <Icon className="size-4" aria-hidden /> : null}
            {o.label}
            {typeof o.count === "number" ? (
              <span className={cn("text-xs font-medium", active ? "text-primary-foreground/80" : "text-muted-foreground")}>{o.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
