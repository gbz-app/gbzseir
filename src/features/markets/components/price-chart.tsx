"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { MarketPoint } from "../types";

const W = 320;
const H = 150;
const PAD_Y = 12;

/**
 * Lightweight SVG area chart (evenly spaced points, like trading charts: no gaps over weekends).
 * Drag / hover to read a value; the color comes from `currentColor`.
 */
export function PriceChart({
  points,
  formatValue,
  formatTime,
  className,
}: {
  points: MarketPoint[];
  formatValue: (v: number) => string;
  formatTime: (t: number) => string;
  className?: string;
}) {
  const gradientId = `pc${React.useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const box = React.useRef<HTMLDivElement>(null);
  const [hover, setHover] = React.useState<number | null>(null);

  const geo = React.useMemo(() => {
    if (points.length < 2) return null;
    const values = points.map((p) => p[1]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const lo = min === max ? min - 1 : min;
    const hi = min === max ? max + 1 : max;
    const xs = points.map((_, i) => (i / (points.length - 1)) * W);
    const ys = values.map((v) => PAD_Y + (1 - (v - lo) / (hi - lo)) * (H - 2 * PAD_Y));
    const line = xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(2)} ${ys[i].toFixed(2)}`).join(" ");
    return { xs, ys, line, area: `${line} L${W} ${H} L0 ${H} Z`, min, max };
  }, [points]);

  if (!geo) {
    return <div className={cn("flex h-40 items-center justify-center rounded-2xl bg-muted/60 text-sm text-muted-foreground", className)}>Grafik verisi yok</div>;
  }

  const pick = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || !r.width) return;
    const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    setHover(Math.round(ratio * (points.length - 1)));
  };

  const h = hover !== null ? { x: (geo.xs[hover] / W) * 100, y: (geo.ys[hover] / H) * 100, p: points[hover] } : null;

  return (
    <div className={cn("relative", className)}>
      <div className="mb-1 flex justify-between text-[11px] font-medium text-muted-foreground tabular-nums">
        <span>En yüksek {formatValue(geo.max)}</span>
        <span>En düşük {formatValue(geo.min)}</span>
      </div>
      <div
        ref={box}
        data-vaul-no-drag
        className="relative h-40 w-full touch-pan-y select-none"
        onPointerDown={(e) => pick(e.clientX)}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`Fiyat grafiği: en düşük ${formatValue(geo.min)}, en yüksek ${formatValue(geo.max)}`}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={geo.area} fill={`url(#${gradientId})`} />
          <path d={geo.line} fill="none" stroke="currentColor" strokeWidth={2.25} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        {h ? (
          <>
            <span className="pointer-events-none absolute inset-y-0 w-px bg-foreground/25" style={{ left: `${h.x}%` }} aria-hidden />
            <span
              className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-current shadow-soft"
              style={{ left: `${h.x}%`, top: `${h.y}%` }}
              aria-hidden
            />
            <span
              className="pointer-events-none absolute -top-1 -translate-x-1/2 -translate-y-full rounded-xl bg-foreground px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap text-background tabular-nums shadow-float"
              style={{ left: `${Math.min(80, Math.max(20, h.x))}%` }}
            >
              {formatValue(h.p[1])} · {formatTime(h.p[0])}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}
