"use client";

import { cn } from "@/lib/utils";
import { SERVICE_LABEL, formatClock, formatWait, useStopTimes } from "../lib/stop-times";
import { DetailSection } from "./detail-parts";

const LINE_CHIP =
  "inline-flex h-7 min-w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 px-2 text-sm font-bold text-sky-700 tabular-nums dark:bg-sky-500/15 dark:text-sky-300";
const NEXT = 8;
const byNumber = (a: string, b: string) => a.localeCompare(b, "tr-TR", { numeric: true });

/**
 * Durak page: "Yaklaşan otobüsler" (the next buses by the planned timetable, soonest first, refreshed as time passes)
 * and "Geçen hatlar" (the stop's lines from the data plus those of the timetable). Client-only: the time is the
 * visitor's now in Istanbul. Stops without a GTFS stop_id use the nearest timetable stop (stop-times.ts).
 */
export function StopTimetable({ stopId, lat, lng, lines: known }: { stopId: string | null; lat: number | null; lng: number | null; lines: string[] }) {
  const t = useStopTimes(stopId, lat, lng, NEXT);
  const lines = [...new Set([...known, ...t.lines])].sort(byNumber);

  return (
    <>
      <DetailSection title="Yaklaşan otobüsler">
        {t.status === "loading" ? (
          <div className="h-40 animate-pulse rounded-3xl bg-card motion-reduce:animate-none" aria-hidden />
        ) : t.status === "none" ? (
          <p className="text-sm text-muted-foreground">Bu durak için sefer saati bulunamadı.</p>
        ) : t.upcoming.length ? (
          <ul className="flex flex-col rounded-3xl bg-card p-1.5" aria-label="Yaklaşan otobüsler">
            {t.upcoming.map((d, i) => (
              <li key={`${d.line}-${d.minutes}`} className="flex min-h-12 items-center gap-3 px-2.5 py-1.5">
                <span className={LINE_CHIP}>{d.line}</span>
                <span className="min-w-0 flex-1 text-sm text-muted-foreground tabular-nums">{formatClock(d.minutes)}</span>
                {d.inMin < 60 ? (
                  <span className={cn("shrink-0 text-sm font-bold tabular-nums", i === 0 ? "text-primary" : "text-foreground")}>{formatWait(d)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Bugün bu duraktan başka sefer yok.</p>
        )}
        {t.status === "ready" && t.service ? (
          <p className="mt-2 px-1 text-xs leading-relaxed text-muted-foreground">
            Tarifeye göre ({SERVICE_LABEL[t.service]}). Canlı araç konumu değildir; trafik ve bayramlarda değişebilir.
          </p>
        ) : null}
      </DetailSection>

      <DetailSection title="Geçen hatlar">
        {lines.length ? (
          <ul className="flex flex-wrap gap-2">
            {lines.map((l) => (
              <li key={l} className="rounded-full bg-info-soft px-3 py-1.5 text-sm font-bold text-info tabular-nums">
                {l}
              </li>
            ))}
          </ul>
        ) : t.status === "loading" ? null : (
          <p className="text-sm text-muted-foreground">Bu durak için hat bilgisi henüz yok.</p>
        )}
      </DetailSection>
    </>
  );
}
