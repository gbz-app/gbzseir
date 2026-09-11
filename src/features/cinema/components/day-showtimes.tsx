import { formatTime } from "@/core/format";
import { cn } from "@/lib/utils";
import { branchDayUrl } from "../config";
import { variantLabel } from "../lib/format";
import { groupByVariant } from "../lib/schedule";
import type { CinemaShowtime } from "../types";

const PILL =
  "inline-flex h-8 min-w-[3.25rem] items-center justify-center rounded-full bg-muted px-3 text-[13px] font-semibold tabular-nums outline-none transition-colors hover:bg-brand-soft hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * One day's sessions: a small "2D · Altyazılı" line per variant and time pills that open that day's ticket page on
 * the operator's site. Server-safe.
 */
export function DayShowtimes({ showtimes, day, venueUrl, className }: { showtimes: CinemaShowtime[]; day: string; venueUrl: string; className?: string }) {
  const href = branchDayUrl(venueUrl, day);
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {groupByVariant(showtimes).map((v) => {
        const label = variantLabel(v);
        return (
          <div key={v.key}>
            {label ? <p className="mb-1.5 text-xs text-muted-foreground">{label}</p> : null}
            <ul className="flex flex-wrap gap-1.5">
              {v.showtimes.map((s) => {
                const time = formatTime(s.startsAt);
                return (
                  <li key={s.id}>
                    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`${time} seansı için bilet al`} className={PILL}>
                      {time}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
