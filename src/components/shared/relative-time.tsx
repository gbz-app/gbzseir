"use client";

import * as React from "react";
import { formatDateTime, formatRelativeTime } from "@/core/format";
import { toDate, type DateInput } from "@/core/time";

export type RelativeTimeProps = {
  date: DateInput;
  /** Text before the time, e.g. "Güncellendi: ". */
  prefix?: string;
  /** Re-render interval (default 60 s). */
  refreshMs?: number;
  className?: string;
};

/** "5 dk önce" that stays fresh; the absolute date is in the title tooltip. */
export function RelativeTime({ date, prefix, refreshMs = 60_000, className }: RelativeTimeProps) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), refreshMs);
    return () => window.clearInterval(id);
  }, [refreshMs]);
  const d = toDate(date);
  if (Number.isNaN(d.getTime())) return null;
  return (
    <time dateTime={d.toISOString()} title={formatDateTime(d, { year: true })} className={className} suppressHydrationWarning>
      {prefix}
      {formatRelativeTime(d, now)}
    </time>
  );
}
