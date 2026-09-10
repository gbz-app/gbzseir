"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { OpenStatusBadge } from "@/components/shared/badges";
import { useIsClient } from "@/lib/use-is-client";
import { DAY_KEYS, DAY_LABELS, dayKeyOf, describeOpenStatus, formatDayHours, openStatusAt, type WorkingHours } from "../lib/hours";

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
 */
export function OpenNowStatus({ hours, className }: { hours: WorkingHours; className?: string }) {
  const isClient = useIsClient();
  const now = useNow();
  if (!isClient) return <span className={cn("inline-block h-6 w-28 animate-pulse rounded-full bg-muted", className)} aria-hidden />;
  const status = openStatusAt(hours, new Date(now));
  if (!status.known) return null;
  const detail = describeOpenStatus(status);
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
    <dl className={cn("divide-y overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-foreground/[0.06]", className)}>
      {DAY_KEYS.map((key) => {
        const isToday = key === today;
        const day = hours[key];
        return (
          <div key={key} className={cn("flex items-center justify-between gap-3 px-4 py-2.5 text-sm", isToday && "bg-brand-soft/60 font-bold text-primary")}>
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
