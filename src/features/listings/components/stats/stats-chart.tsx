"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/core/format";
import { shortDay, weekdayShort, type StatDay } from "./stats-data";

// viewBox units (the SVG scales to the card width; ~1:1 on a 390px phone).
const W = 320;
const H = 156;
const PAD_L = 28;
const PAD_R = 4;
const PAD_T = 10;
const PAD_B = 22;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;
const BASE = PAD_T + PLOT_H;

/** Upper bound with an integer midpoint on 1-2-5 steps: 0 -> 2, 3 -> 4, 7 -> 10, 13 -> 20, 150 -> 200. */
function niceMax(v: number): number {
  const half = Math.max(1, v / 2);
  const pow = 10 ** Math.floor(Math.log10(half));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= half) ?? 10 * pow;
  return step * 2;
}

/** Column anchored to the baseline with a rounded top (data end). */
function barPath(x: number, y: number, w: number): string {
  const h = BASE - y;
  if (h <= 0) return "";
  const r = Math.min(4, w / 2, h);
  return `M${x},${BASE}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${BASE}Z`;
}

/**
 * Daily views (columns) with calls overlaid (dots) on one shared axis. Tap / hover / arrow keys pick a day; the
 * values show in the line above the chart and in a screen-reader table. Dependency-free SVG, theme-aware colors.
 */
export function StatsChart({ days, today }: { days: StatDay[]; today: string }) {
  const n = days.length;
  const [picked, setPicked] = React.useState<number | null>(null);
  const sel = picked !== null && picked < n ? picked : n - 1;
  if (!n) return null;

  const max = niceMax(Math.max(0, ...days.map((d) => Math.max(d.views, d.calls))));
  const slot = PLOT_W / n;
  const barW = Math.max(3, Math.min(22, slot - (n > 14 ? 3 : 10)));
  const y = (v: number) => BASE - (v / max) * PLOT_H;
  const labelEvery = n > 7 ? 7 : 1;
  const current = days[sel];
  const totalViews = days.reduce((s, d) => s + d.views, 0);
  const totalCalls = days.reduce((s, d) => s + d.calls, 0);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const next = { ArrowLeft: sel - 1, ArrowRight: sel + 1, Home: 0, End: n - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setPicked(Math.min(n - 1, Math.max(0, next)));
  };

  return (
    <figure className="min-w-0">
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] bg-primary dark:bg-violet-500" aria-hidden />
          Görüntülenme
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-amber-500 dark:bg-amber-600" aria-hidden />
          Arama
        </span>
      </figcaption>

      <p className="mt-2 min-h-5 text-sm tabular-nums" aria-live="polite">
        {current ? (
          <>
            <span className="font-semibold">
              {shortDay(current.day)} {weekdayShort(current.day)}
              {current.day === today ? " (bugün)" : ""}
            </span>
            <span className="text-muted-foreground">
              {" "}
              · {formatNumber(current.views)} görüntülenme · {formatNumber(current.calls)} arama
            </span>
          </>
        ) : null}
      </p>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-1 block h-auto w-full touch-manipulation rounded-lg outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50"
        role="img"
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-label={`Son ${n} gün: toplam ${formatNumber(totalViews)} görüntülenme, ${formatNumber(totalCalls)} arama. Gün seçmek için ok tuşlarını kullan.`}
      >
        {[0, max / 2, max].map((t) => (
          <g key={t}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)} strokeWidth={1} className="stroke-border" />
            <text x={PAD_L - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} className="fill-muted-foreground tabular-nums">
              {formatNumber(t)}
            </text>
          </g>
        ))}

        <rect x={PAD_L + sel * slot + 1} y={PAD_T - 4} width={Math.max(1, slot - 2)} height={PLOT_H + 4} rx={Math.min(6, slot / 3)} className="fill-muted" />

        {days.map((d, i) =>
          d.views > 0 ? (
            <path key={`v-${d.day}`} d={barPath(PAD_L + i * slot + (slot - barW) / 2, y(d.views), barW)} className="fill-primary dark:fill-violet-500" />
          ) : null,
        )}

        {days.map((d, i) =>
          d.calls > 0 ? (
            <circle key={`c-${d.day}`} cx={PAD_L + i * slot + slot / 2} cy={y(d.calls)} r={4} strokeWidth={2} className="fill-amber-500 stroke-card dark:fill-amber-600" />
          ) : null,
        )}

        {days.map((d, i) => {
          if ((n - 1 - i) % labelEvery !== 0) return null;
          const last = i === n - 1 && n > 7;
          return (
            <text
              key={`l-${d.day}`}
              x={last ? PAD_L + (i + 1) * slot : PAD_L + i * slot + slot / 2}
              y={H - 6}
              textAnchor={last ? "end" : "middle"}
              fontSize={9.5}
              className={cn(i === sel ? "fill-foreground font-semibold" : "fill-muted-foreground")}
            >
              {shortDay(d.day)}
            </text>
          );
        })}

        {/* Hit targets: the whole column, bigger than the mark. */}
        {days.map((d, i) => (
          <rect
            key={`h-${d.day}`}
            x={PAD_L + i * slot}
            y={0}
            width={slot}
            height={H}
            fill="transparent"
            onClick={() => setPicked(i)}
            onPointerEnter={(e) => {
              if (e.pointerType === "mouse") setPicked(i);
            }}
          />
        ))}
      </svg>

      <table className="sr-only">
        <caption>Günlük görüntülenme ve arama</caption>
        <thead>
          <tr>
            <th scope="col">Gün</th>
            <th scope="col">Görüntülenme</th>
            <th scope="col">Arama</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={`t-${d.day}`}>
              <th scope="row">{shortDay(d.day)}</th>
              <td>{d.views}</td>
              <td>{d.calls}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
