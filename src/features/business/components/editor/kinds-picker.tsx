"use client";

import { Briefcase, Check, Store, Wrench, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BusinessKind } from "@/lib/types";
import { BUSINESS_KINDS, KIND_DESCRIPTIONS, KIND_LABELS } from "../../lib/kinds";

const ICONS: Record<BusinessKind, LucideIcon> = { service: Wrench, shop: Store, employer: Briefcase };

/** Multi-select of business kinds (Hizmet veren firma / Dükkan-Mağaza / İşveren). */
export function KindsPicker({ value, onChange, disabled }: { value: BusinessKind[]; onChange: (v: BusinessKind[]) => void; disabled?: boolean }) {
  const toggle = (k: BusinessKind) => onChange(value.includes(k) ? value.filter((x) => x !== k) : BUSINESS_KINDS.filter((x) => x === k || value.includes(x)));
  return (
    <div role="group" aria-label="İşletme türü" className="grid gap-2.5">
      {BUSINESS_KINDS.map((k) => {
        const active = value.includes(k);
        const Icon = ICONS[k];
        return (
          <button
            key={k}
            type="button"
            role="checkbox"
            aria-checked={active}
            disabled={disabled}
            onClick={() => toggle(k)}
            className={cn(
              // Borderless white row; the chosen one turns brand-soft (same as the wizard's option rows).
              "flex min-h-16 w-full items-start gap-3 rounded-2xl bg-card p-4 text-left transition-[background-color,transform] outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.99] disabled:opacity-60",
              active && "bg-brand-soft hover:bg-brand-soft",
            )}
          >
            <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl text-primary", active ? "bg-card" : "bg-brand-soft")}>
              <Icon className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn("block text-[15px] font-bold", active && "text-primary")}>{KIND_LABELS[k]}</span>
              <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">{KIND_DESCRIPTIONS[k]}</span>
            </span>
            {/* Filled square (no outline) so several picks read as checkboxes. */}
            <span
              className={cn(
                "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg transition-colors",
                active ? "bg-primary text-primary-foreground" : "bg-foreground/10",
              )}
              aria-hidden
            >
              {active ? <Check className="size-3.5" strokeWidth={3} /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
