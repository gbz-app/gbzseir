"use client";

import { Check, CircleAlert, Info, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { BUSINESS_VERTICALS, VERTICAL_INFO, type Vertical } from "../../lib/verticals";
import { TYPE_DESCRIPTIONS, TYPE_FEATURES } from "./type-features";

/**
 * Step 1 of the apply wizard: big white type cards (icon, name, one line); the selected one opens "Sana neler açılır".
 * A resubmitted (unfinished) business shows only its own type: the type cannot change.
 */
export function TypeStep({
  value,
  onChange,
  rejectionReason,
  resubmit,
}: {
  value: Vertical | null;
  onChange: (v: Vertical) => void;
  rejectionReason: string | null;
  resubmit: boolean;
}) {
  const locked = resubmit && value !== null;
  const types = locked ? [value] : BUSINESS_VERTICALS;

  return (
    <div className="flex flex-col gap-4">
      {rejectionReason ? (
        <div role="note" className="flex items-start gap-3 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p>
            <strong className="block">İşletmen yayından kaldırıldı</strong>
            <span className="text-foreground">{rejectionReason}</span>
            <span className="mt-1 block text-foreground/80">Bilgilerini düzeltip gönderdiğinde tekrar yayına girer.</span>
          </p>
        </div>
      ) : resubmit ? (
        <div role="note" className="flex items-start gap-3 rounded-2xl bg-info-soft px-4 py-3 text-sm">
          <Info className="mt-0.5 size-5 shrink-0 text-info" aria-hidden />
          <p>İşletmen henüz yayında değil. Bilgilerini tamamlayıp gönderdiğinde hemen yayına girer.</p>
        </div>
      ) : null}

      <div role="radiogroup" aria-label="İşletme türü" className="flex flex-col gap-2.5">
        {types.map((v) => {
          const info = VERTICAL_INFO[v];
          const selected = value === v;
          const features = TYPE_FEATURES[v];
          return (
            <div key={v} className="rounded-3xl bg-card">
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={locked}
                onClick={() => onChange(v)}
                className="flex min-h-20 w-full items-center gap-3.5 rounded-3xl p-3.5 text-left transition-transform outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.99] disabled:active:scale-100"
              >
                <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-2xl", info.tone)}>
                  <info.icon className="size-6" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base leading-snug font-semibold">{info.label}</span>
                  <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">{TYPE_DESCRIPTIONS[v]}</span>
                </span>
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full transition-colors",
                    selected ? "bg-primary text-primary-foreground" : "bg-muted text-transparent",
                  )}
                  aria-hidden
                >
                  <Check className="size-4" strokeWidth={2.5} />
                </span>
              </button>
              {selected ? (
                <div className="px-4 pb-4">
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Sana neler açılır</p>
                  <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={`${info.label} için açılan araçlar`}>
                    {features.map((feature) => (
                      <li key={feature.key} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-brand-soft px-3 text-[13px] font-medium text-primary">
                        <feature.icon className="size-3.5 shrink-0" aria-hidden />
                        {feature.label}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <p className="flex items-start gap-2 px-1 text-sm leading-relaxed text-muted-foreground">
        <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
        {locked ? "İşletme türü değiştirilemez. Farklı bir tür için destek ekibimize yaz." : "İşletme türünü sonradan değiştiremezsin. Emin değilsen destek ekibimize sorabilirsin."}
      </p>
    </div>
  );
}
