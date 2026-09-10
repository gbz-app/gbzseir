"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type ChoiceOption<T extends string = string> = {
  value: T;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
};

type BaseProps<T extends string> = {
  options: ChoiceOption<T>[];
  ariaLabel?: string;
  ariaLabelledBy?: string;
  size?: "sm" | "md";
  className?: string;
};

export type ChoiceChipsProps<T extends string = string> = BaseProps<T> &
  (
    | { multiple?: false; value: T | null; onChange: (value: T | null) => void; allowDeselect?: boolean }
    | { multiple: true; value: T[]; onChange: (value: T[]) => void; allowDeselect?: never }
  );

/** Wrapping chip group (single or multi select) for forms and filter sheets. 44px targets by default. */
export function ChoiceChips<T extends string = string>(props: ChoiceChipsProps<T>) {
  const { options, ariaLabel, ariaLabelledBy, size = "md", className } = props;
  const isActive = (v: T) => (props.multiple ? props.value.includes(v) : props.value === v);

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
      role={props.multiple ? "group" : "radiogroup"}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      className={cn("flex flex-wrap gap-2", className)}
    >
      {options.map((o) => {
        const active = isActive(o.value);
        return (
          <button
            key={o.value}
            type="button"
            role={props.multiple ? "checkbox" : "radio"}
            aria-checked={active}
            disabled={o.disabled}
            onClick={() => toggle(o.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
              size === "sm" ? "min-h-10 px-3.5 text-[13px]" : "min-h-11 px-4 text-sm",
              active ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-card text-foreground hover:bg-muted",
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
