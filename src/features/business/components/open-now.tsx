"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { OpenStatusBadge } from "@/components/shared/badges";
import { useIsClient } from "@/lib/use-is-client";
import {
  DAY_KEYS,
  DAY_LABELS,
  dayKeyOf,
  describeOpenStatus,
  formatDayHours,
  isVacationStatus,
  openStatusAt,
  type VacationInfo,
  type WorkingHours,
} from "../lib/hours";
import { VacationBadge } from "./vacation-badge";

/** Re-renders every `intervalMs` so open/closed never goes stale on a long-lived (or offline cached) page. */
function useNow(intervalMs = 60_000): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * "Şu an açık · Kapanış 18:00" computed on the CLIENT (Istanbul time): firm pages are ISR-cached and may be
 * served offline by the service worker, so the server-rendered time would be wrong.
 * Tatil modu (`vacation`) wins over the hours and over `alwaysOpen`: "Tatilde · Dönüş: 14 Eylül".
 */
export function OpenNowStatus({
  hours,
  vacation,
  alwaysOpen,
  className,
}: {
  hours: WorkingHours;
  vacation?: VacationInfo | null;
  /** Every day 00:00 - 23:59: "7/24 açık" instead of the open/closed badge. */
  alwaysOpen?: boolean;
  className?: string;
}) {
  const isClient = useIsClient();
  const now = useNow();
  const alwaysOpenLabel = <span className={cn("text-sm font-semibold text-emerald-600 dark:text-emerald-400", className)}>7/24 açık</span>;
  // No tatil flag at all: "7/24 açık" does not depend on the clock, so the server HTML already shows it.
  if (alwaysOpen && !vacation?.vacation_mode) return alwaysOpenLabel;
  if (!isClient) return <span className={cn("inline-block h-6 w-28 animate-pulse rounded-full bg-muted", className)} aria-hidden />;
  const status = openStatusAt(hours, new Date(now), vacation);
  const detail = describeOpenStatus(status);
  if (isVacationStatus(status)) {
    return (
      <span className={cn("inline-flex flex-wrap items-center gap-x-2 gap-y-1", className)}>
        <VacationBadge />
        {detail ? <span className="text-xs font-medium text-muted-foreground">{detail}</span> : null}
      </span>
    );
  }
  if (alwaysOpen) return alwaysOpenLabel;
  if (!status.known) return null;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-2 gap-y-1", className)}>
      <OpenStatusBadge open={status.open} openLabel="Şu an açık" closedLabel="Şu an kapalı" />
      {detail ? <span className="text-xs font-medium text-muted-foreground tabular-nums">{detail}</span> : null}
    </span>
  );
}

/** Weekly hours with today's row highlighted (client: "today" depends on the viewer's clock). */
export function WorkingHoursTable({ hours, className }: { hours: WorkingHours; className?: string }) {
  const isClient = useIsClient();
  const today = isClient ? dayKeyOf(new Date()) : null;
  return (
    <dl className={cn("rounded-2xl bg-card p-1.5", className)}>
      {DAY_KEYS.map((key) => {
        const isToday = key === today;
        const day = hours[key];
        return (
          <div key={key} className={cn("flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm", isToday && "bg-brand-soft font-bold text-primary")}>
            <dt>
              {DAY_LABELS[key]}
              {isToday ? <span className="ml-1.5 text-xs font-semibold">(Bugün)</span> : null}
            </dt>
            <dd className={cn("tabular-nums", !day && !isToday && "text-muted-foreground")}>{formatDayHours(day)}</dd>
          </div>
        );
      })}
    </dl>
  );
}
