"use client";

import { Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/core/format";
import { istanbulDateTime } from "@/core/time";
import {
  PRAYER_KEYS,
  PRAYER_LABELS,
  PRAYER_METHOD_NOTE,
  countdownLead,
  currentPrayerKey,
  formatCountdown,
  nextPrayer,
  prayerDayFor,
  type PrayerDay,
} from "../lib/prayer";
import { useNow } from "../lib/use-now";

export type PrayerTimesProps = {
  days: PrayerDay[];
  /** Server render time (hydration "now"). */
  serverNow: number;
  className?: string;
};

/** Today's six prayer times with the next one highlighted and a live countdown (mosque page). */
export function PrayerTimesPanel({ days, serverNow, className }: PrayerTimesProps) {
  const now = useNow(serverNow);
  const today = prayerDayFor(days, now);
  const next = nextPrayer(days, now);
  const current = currentPrayerKey(today, now);

  if (!today) {
    return (
      <div className={cn("rounded-2xl bg-muted/70 px-4 py-3 text-sm text-muted-foreground", className)}>
        Namaz vakitleri şu an alınamadı. Biraz sonra tekrar dene.
      </div>
    );
  }

  const highlight = next && !next.isTomorrow ? next.key : null;

  return (
    <section aria-labelledby="namaz-vakitleri" className={cn("rounded-card bg-card p-4", className)}>
      <h2 id="namaz-vakitleri" className="text-base font-bold">
        Bugünkü namaz vakitleri
      </h2>
      <p className="text-xs text-muted-foreground">{formatDate(istanbulDateTime(today.date, "12:00"), { month: "long", weekday: true, year: false })} · Gebze</p>

      {next ? (
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-emerald-50 px-4 py-3 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100">
          <Clock3 className="size-5 shrink-0 text-emerald-600 dark:text-emerald-300" aria-hidden />
          <p className="min-w-0 flex-1 text-sm leading-snug" aria-live="polite">
            <span className="font-semibold">{countdownLead(next.key)}</span>{" "}
            <span className="text-lg font-extrabold tabular-nums">{formatCountdown(next.at - now)}</span> kaldı
          </p>
          <span className="shrink-0 text-sm font-bold tabular-nums">
            {next.isTomorrow ? "Yarın " : ""}
            {next.time}
          </span>
        </div>
      ) : null}

      <ul className="mt-3 grid grid-cols-3 gap-2">
        {PRAYER_KEYS.map((k) => (
          <li
            key={k}
            className={cn(
              "rounded-xl px-2 py-2.5 text-center",
              k === highlight ? "bg-emerald-600 text-white shadow-sm dark:bg-emerald-500 dark:text-emerald-950" : k === current ? "bg-muted" : "bg-muted/50",
            )}
          >
            <p className={cn("text-xs font-semibold", k === highlight ? "opacity-90" : "text-muted-foreground")}>{PRAYER_LABELS[k]}</p>
            <p className="mt-0.5 text-lg font-extrabold tabular-nums">{today.times[k]}</p>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">{PRAYER_METHOD_NOTE}. Vakitler Gebze merkezine göredir.</p>
    </section>
  );
}

/** Compact next prayer + countdown + the six times in a row (home widget). */
export function PrayerTimesCompact({ days, serverNow, className }: PrayerTimesProps) {
  const now = useNow(serverNow);
  const today = prayerDayFor(days, now);
  const next = nextPrayer(days, now);
  if (!today || !next) {
    return <p className={cn("text-sm text-muted-foreground", className)}>Namaz vakitleri şu an alınamadı.</p>;
  }
  const highlight = next.isTomorrow ? null : next.key;
  return (
    <div className={className}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground">
            Sıradaki: {next.label}
            {next.isTomorrow ? " (yarın)" : ""}
          </p>
          <p className="text-2xl leading-tight font-extrabold tabular-nums">{next.time}</p>
        </div>
        <p className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 tabular-nums dark:bg-emerald-500/15 dark:text-emerald-200" aria-live="polite">
          {formatCountdown(next.at - now)} kaldı
        </p>
      </div>
      <ul className="mt-3 grid grid-cols-6 gap-1 text-center">
        {PRAYER_KEYS.map((k) => (
          <li key={k} className={cn("rounded-lg py-1.5", k === highlight ? "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950" : "bg-muted/60")}>
            <p className={cn("text-[10px] leading-tight font-semibold", k === highlight ? "opacity-90" : "text-muted-foreground")}>{PRAYER_LABELS[k]}</p>
            <p className="text-xs font-bold tabular-nums">{today.times[k]}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
