"use client";

import { ArrowLeft } from "lucide-react";
import { IS_ADMIN_SITE } from "@/config/app-mode";

export const SIGNUP_STEPS = 3;

/**
 * Header of the sign-in / sign-up screens: optional round back button, slim progress (phone 1/3 -> code 2/3 -> profile 3/3),
 * big title and a short text. `fill` (0..1) fills the current segment partly (profile name -> photo).
 */
export function AuthStepHeader({
  step,
  fill = 1,
  title,
  description,
  onBack,
  backLabel = "Geri",
}: {
  step: number;
  fill?: number;
  title: string;
  description?: React.ReactNode;
  onBack?: () => void;
  backLabel?: string;
}) {
  return (
    <div className="mb-7">
      <div className="flex h-11 items-center gap-3">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label={backLabel}
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-card text-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ArrowLeft className="size-5" strokeWidth={2.2} aria-hidden />
          </button>
        ) : null}
        {/* Sign-up happens only on the public app. */}
        {IS_ADMIN_SITE ? null : (
          <div className="flex flex-1 items-center gap-3">
            <div className="flex flex-1 gap-1.5" role="progressbar" aria-label="Kayıt adımı" aria-valuemin={1} aria-valuemax={SIGNUP_STEPS} aria-valuenow={step}>
              {Array.from({ length: SIGNUP_STEPS }, (_, i) => {
                const n = i + 1;
                const pct = n < step ? 100 : n === step ? Math.round(Math.min(1, Math.max(0, fill)) * 100) : 0;
                return (
                  <span key={n} className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10">
                    <span className="block h-full rounded-full bg-primary transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
                  </span>
                );
              })}
            </div>
            <span className="text-xs font-semibold text-muted-foreground tabular-nums" aria-hidden>
              {step}/{SIGNUP_STEPS}
            </span>
          </div>
        )}
      </div>
      <h1 className="mt-6 text-[2rem] leading-[1.15] font-bold tracking-tight text-balance">{title}</h1>
      {description ? <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{description}</p> : null}
    </div>
  );
}
