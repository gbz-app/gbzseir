"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { readString, writeString } from "@/lib/storage";
import { useIsClient } from "@/lib/use-is-client";

export type CoachStep = {
  targetRef: React.RefObject<HTMLElement | null>;
  text: string;
  /** Where the tooltip goes (default: the side with more room). */
  placement?: "top" | "bottom";
};

export type CoachMarksProps = {
  steps: CoachStep[];
  /** localStorage key; the tour is shown once per device. */
  storageKey: string;
  /** Start only when the targets are on screen. */
  enabled: boolean;
};

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/** First-visit coach marks: spotlight on the target + tooltip with "1/3" and "Anladım". */
export function CoachMarks({ steps, storageKey, enabled }: CoachMarksProps) {
  const isClient = useIsClient();
  const [dismissed, setDismissed] = React.useState(false);
  const [index, setIndex] = React.useState(0);
  const [rect, setRect] = React.useState<DOMRect | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const titleId = React.useId();

  const seen = isClient ? readString(storageKey) !== null : true;
  const active = enabled && isClient && !seen && !dismissed;
  const step = steps[index];

  const finish = React.useCallback(() => {
    writeString(storageKey, new Date().toISOString());
    setDismissed(true);
  }, [storageKey]);

  // Measure the target (after sheet/map transitions settle, and on resize).
  React.useEffect(() => {
    if (!active || !step) return;
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = step.targetRef.current;
        setRect(el ? el.getBoundingClientRect() : null);
      });
    };
    measure();
    const settle = window.setTimeout(measure, 400);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(settle);
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [active, step]);

  const hasRect = !!rect;
  React.useEffect(() => {
    if (active && hasRect) buttonRef.current?.focus({ preventScroll: true });
  }, [active, hasRect, index]);

  React.useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, finish]);

  if (!active || !step || !rect) return null;

  const next = () => {
    if (index >= steps.length - 1) finish();
    else {
      setRect(null);
      setIndex((i) => i + 1);
    }
  };

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pad = 6;
  const spot = { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 };
  const below = step.placement ? step.placement === "bottom" : rect.top + rect.height / 2 < vh / 2;
  const tipWidth = Math.min(320, vw - 24);
  const tipLeft = clamp(rect.left + rect.width / 2 - tipWidth / 2, 12, vw - tipWidth - 12);
  const arrowLeft = clamp(rect.left + rect.width / 2 - tipLeft, 22, tipWidth - 22);
  const tipStyle: React.CSSProperties = below
    ? { top: spot.top + spot.height + 14, left: tipLeft, width: tipWidth }
    : { bottom: vh - spot.top + 14, left: tipLeft, width: tipWidth };

  return createPortal(
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div
        aria-hidden
        className="pointer-events-none absolute rounded-2xl ring-2 ring-white/90 transition-all duration-300"
        style={{ ...spot, boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.62)" }}
      />
      <div className="absolute animate-pop rounded-2xl bg-popover p-4 text-popover-foreground shadow-card ring-1 ring-foreground/[0.06]" style={tipStyle}>
        <span
          aria-hidden
          className="absolute size-3 rotate-45 bg-popover"
          style={below ? { top: -6, left: arrowLeft - 6 } : { bottom: -6, left: arrowLeft - 6 }}
        />
        <p id={titleId} className="text-[15px] leading-relaxed font-semibold text-balance">
          {step.text}
        </p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-muted-foreground tabular-nums">
            <span className="sr-only">Adım </span>
            {index + 1}/{steps.length}
          </span>
          <div className="flex items-center gap-1">
            {index < steps.length - 1 ? (
              <Button type="button" variant="ghost" size="sm" className="h-11" onClick={finish}>
                Geç
              </Button>
            ) : null}
            <Button ref={buttonRef} type="button" size="sm" className="h-11 px-5" onClick={next}>
              Anladım
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
