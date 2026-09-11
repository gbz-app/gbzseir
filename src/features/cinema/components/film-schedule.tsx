"use client";

import * as React from "react";
import { dayLabel, releaseLabel } from "../lib/format";
import { cinemaDayKey, groupByDay } from "../lib/schedule";
import { useNow } from "../lib/use-now";
import type { CinemaShowtime } from "../types";
import { DayShowtimes } from "./day-showtimes";

/** Film page "Seanslar": the sessions that have not started, grouped by day (a time opens the ticket page). */
export function FilmSchedule({
  showtimes,
  venueUrl,
  releaseDate,
  serverNow,
}: {
  showtimes: CinemaShowtime[];
  venueUrl: string;
  releaseDate: string | null;
  serverNow: string;
}) {
  const now = useNow(serverNow);
  const days = React.useMemo(() => groupByDay(showtimes.filter((s) => Date.parse(s.startsAt) >= now.getTime())), [showtimes, now]);

  if (!days.length) {
    return (
      <p className="mt-2 text-sm text-muted-foreground">
        {releaseDate && releaseDate > cinemaDayKey(now)
          ? `Vizyon tarihi ${releaseLabel(releaseDate)}. Seanslar açıklanınca burada görünür.`
          : "Şu an açıklanmış seans yok."}
      </p>
    );
  }
  return (
    <div className="mt-3 flex flex-col gap-4">
      {days.map((d) => (
        <div key={d.day}>
          <p className="mb-1.5 text-[13px] font-semibold">{dayLabel(d.day, now)}</p>
          <DayShowtimes showtimes={d.showtimes} day={d.day} venueUrl={venueUrl} />
        </div>
      ))}
    </div>
  );
}
