"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { routes } from "@/core/routes";
import { istanbulDateTime } from "@/core/time";
import { PRAYER_LABELS, countdownLead, currentPrayerKey, formatCountdown, nextPrayer, prayerDayFor, type PrayerDay } from "@/features/nearby/lib/prayer";
import { useNow } from "@/features/nearby/lib/use-now";

/**
 * "Sıradaki vakit" card: next prayer time, live countdown and a progress bar between the previous and the
 * next prayer (Anchor "Paid amount" style).
 */
export function PrayerProgress({ days, serverNow, className }: { days: PrayerDay[]; serverNow: number; className?: string }) {
  const now = useNow(serverNow);
  const next = nextPrayer(days, now);
  if (!next) return null;

  const today = prayerDayFor(days, now);
  const cur = currentPrayerKey(today, now);
  let prevLabel = "";
  let prevTime = "";
  let prevAt = now - 3_600_000;
  if (today && cur) {
    prevLabel = PRAYER_LABELS[cur];
    prevTime = today.times[cur];
    prevAt = istanbulDateTime(today.date, prevTime).getTime();
  } else if (today) {
    prevLabel = "Gece";
    prevTime = "00:00";
    prevAt = istanbulDateTime(today.date, "00:00").getTime();
  }
  const span = Math.max(1, next.at - prevAt);
  const pct = Math.min(100, Math.max(0, ((now - prevAt) / span) * 100));

  return (
    <Link
      href={routes.nearby.root("cami")}
      className={cn("block rounded-3xl bg-card p-5 shadow-soft ring-1 ring-foreground/[0.05] transition-colors outline-none hover:bg-card/80 focus-visible:ring-3 focus-visible:ring-ring/50", className)}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[15px] font-medium">Sıradaki vakit</span>
        <span className="text-[1.6rem] leading-none font-medium tabular-nums">{next.time}</span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>{countdownLead(next.key)}</span>
        <span className="font-semibold text-foreground tabular-nums">{formatCountdown(next.at - now)}</span>
      </div>
      <div className="relative mt-5 h-2 rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Vakit ilerlemesi">
        <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${pct}%` }} />
        <span
          aria-hidden
          className="absolute -top-2.5 size-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-foreground"
          style={{ left: `calc(${pct}% - 5px)` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>{prevLabel ? `${prevLabel} ${prevTime}` : ""}</span>
        <span>
          {next.label} {next.time}
        </span>
      </div>
    </Link>
  );
}
