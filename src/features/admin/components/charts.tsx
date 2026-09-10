import { cn } from "@/lib/utils";
import { formatNumber } from "@/core/format";

/** Server-safe, dependency-free charts for the admin screens. */

const dayFmt = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat("tr-TR", { month: "short", year: "2-digit", timeZone: "UTC" });

/** "2026-09-11" -> "11 Eyl" */
export function dayLabel(date: string): string {
  return dayFmt.format(new Date(`${date.slice(0, 10)}T12:00:00Z`));
}

/** "2026-09" -> "Eyl 26" */
export function monthLabel(month: string): string {
  return monthFmt.format(new Date(`${month}-15T12:00:00Z`));
}

/** 75 -> "1 dk 15 sn", 3900 -> "1 sa 5 dk" */
export function formatDuration(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(seconds ?? 0));
  if (s < 60) return `${s} sn`;
  if (s < 3600) return `${Math.floor(s / 60)} dk${s % 60 ? ` ${s % 60} sn` : ""}`;
  return `${Math.floor(s / 3600)} sa${Math.floor((s % 3600) / 60) ? ` ${Math.floor((s % 3600) / 60)} dk` : ""}`;
}

export type ColumnDatum = { label: string; value: number; secondary?: number };

/**
 * Vertical columns. With `secondary`, two columns per slot (e.g. income vs expense).
 * Values show on hover / focus and in an accessible table for screen readers.
 */
export function ColumnChart({
  data,
  height = 150,
  color = "bg-primary",
  secondaryColor = "bg-rose-400",
  formatValue = (v: number) => formatNumber(v),
  ariaLabel,
  legend,
}: {
  data: ColumnDatum[];
  height?: number;
  color?: string;
  secondaryColor?: string;
  formatValue?: (v: number) => string;
  ariaLabel: string;
  legend?: [string, string?];
}) {
  const max = Math.max(1, ...data.flatMap((d) => [d.value, d.secondary ?? 0]));
  const every = Math.max(1, Math.ceil(data.length / 7));
  const bar = (v: number, cls: string, label: string) => (
    <div
      className={cn("w-full min-w-0 rounded-t-md transition-opacity", cls, v ? "" : "opacity-25")}
      style={{ height: `${Math.max(v ? 3 : 1.5, (v / max) * 100)}%` }}
      title={`${label}: ${formatValue(v)}`}
    />
  );
  return (
    <figure aria-label={ariaLabel} className="min-w-0">
      {legend ? (
        <figcaption className="mb-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-sm", color)} aria-hidden />
            {legend[0]}
          </span>
          {legend[1] ? (
            <span className="inline-flex items-center gap-1.5">
              <span className={cn("size-2.5 rounded-sm", secondaryColor)} aria-hidden />
              {legend[1]}
            </span>
          ) : null}
        </figcaption>
      ) : null}
      <div className="flex items-end gap-1" style={{ height }} aria-hidden>
        {data.map((d, i) => (
          <div key={`${d.label}-${i}`} className="group relative flex h-full min-w-0 flex-1 items-end gap-0.5">
            <span className="pointer-events-none absolute -top-6 left-1/2 z-10 hidden -translate-x-1/2 rounded-md bg-foreground px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap text-background tabular-nums group-hover:block">
              {formatValue(d.value)}
              {d.secondary !== undefined ? ` / ${formatValue(d.secondary)}` : ""}
            </span>
            {bar(d.value, color, d.label)}
            {d.secondary !== undefined ? bar(d.secondary, secondaryColor, d.label) : null}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1 text-[10px] text-muted-foreground" aria-hidden>
        {data.map((d, i) => (
          <span key={`${d.label}-l${i}`} className="flex min-w-0 flex-1 justify-center overflow-visible whitespace-nowrap">
            {i % every === 0 || i === data.length - 1 ? d.label : ""}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <tbody>
          {data.map((d, i) => (
            <tr key={`${d.label}-t${i}`}>
              <th scope="row">{d.label}</th>
              <td>{formatValue(d.value)}</td>
              {d.secondary !== undefined ? <td>{formatValue(d.secondary)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export type BarItem = { label: string; value: number; hint?: string; color?: string };

/** Horizontal bars with the value on the right (top pages, devices, categories). */
export function HBarList({ items, formatValue = (v: number) => formatNumber(v), empty = "Henüz veri yok." }: { items: BarItem[]; formatValue?: (v: number) => string; empty?: string }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((it) => (
        <li key={it.label} className="min-w-0">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{it.label}</span>
            <span className="shrink-0 font-semibold tabular-nums">
              {formatValue(it.value)}
              {it.hint ? <span className="ml-1 text-xs font-normal text-muted-foreground">{it.hint}</span> : null}
            </span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-muted">
            <div className={cn("h-2 rounded-full", it.color ? "" : "bg-primary")} style={{ width: `${Math.max(2, (it.value / max) * 100)}%`, backgroundColor: it.color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
