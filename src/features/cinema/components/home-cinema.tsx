"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatTime } from "@/core/format";
import { routes } from "@/core/routes";
import { filmMetaLine, releaseLabel, shortDayLabel } from "../lib/format";
import { CINEMA_TABS, cinemaDayKey, filmsForTab, type CinemaTab, type FilmEntry } from "../lib/schedule";
import { useNow } from "../lib/use-now";
import type { CinemaFilm, CinemaShowtime, CinemaVenue } from "../types";
import { FilmPoster } from "./film-poster";

const RAIL_MAX = 12;

/** Card line under the title: today's next times, the next day + time, or the release date. */
function CardFoot({ entry, tab, now }: { entry: FilmEntry; tab: CinemaTab; now: Date }) {
  if (entry.upcoming && entry.film.releaseDate) {
    return (
      <span className="mt-2 inline-flex h-6 max-w-full items-center rounded-full bg-brand-soft px-2 text-[11px] font-semibold text-primary">
        <span className="truncate">Vizyon: {releaseLabel(entry.film.releaseDate)}</span>
      </span>
    );
  }
  if (tab === "bugun") {
    const times = entry.days[0]?.showtimes ?? [];
    return (
      <span className="mt-2 flex flex-wrap gap-1">
        {times.slice(0, 2).map((s) => (
          <span key={s.id} className="inline-flex h-6 items-center rounded-full bg-muted px-2 text-[11px] font-semibold tabular-nums">
            {formatTime(s.startsAt)}
          </span>
        ))}
        {times.length > 2 ? (
          <span className="inline-flex h-6 items-center rounded-full px-1 text-[11px] font-semibold text-muted-foreground">+{times.length - 2}</span>
        ) : null}
      </span>
    );
  }
  if (!entry.next) return null;
  return (
    <span className="mt-2 block truncate text-xs font-medium">
      {shortDayLabel(cinemaDayKey(entry.next.startsAt), now)} · {formatTime(entry.next.startsAt)}
    </span>
  );
}

/**
 * Home "Vizyondaki filmler": Bugün / Bu hafta / Bu ay tabs (the home tab style) and a rail of 2:3 poster cards. Opens
 * on "Bu hafta" when no session is left today. Times follow the device clock after hydration.
 */
export function HomeCinema({
  films,
  showtimes,
  venue,
  serverNow,
}: {
  films: CinemaFilm[];
  showtimes: CinemaShowtime[];
  venue: CinemaVenue;
  serverNow: string;
}) {
  const now = useNow(serverNow);
  const lists = React.useMemo(
    () => ({
      bugun: filmsForTab(films, showtimes, "bugun", now),
      hafta: filmsForTab(films, showtimes, "hafta", now),
      ay: filmsForTab(films, showtimes, "ay", now),
    }),
    [films, showtimes, now],
  );
  const [picked, setPicked] = React.useState<CinemaTab | null>(null);
  const tab: CinemaTab = picked ?? (lists.bugun.length ? "bugun" : lists.hafta.length ? "hafta" : "ay");
  const entries = lists[tab].slice(0, RAIL_MAX);

  return (
    <div>
      <div role="tablist" aria-label="Dönem" className="no-scrollbar -mx-4 mt-1 flex gap-5 overflow-x-auto px-4">
        {CINEMA_TABS.map((t) => {
          const active = tab === t.value;
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setPicked(t.value)}
              className={cn(
                "relative shrink-0 pb-2 text-[15px] transition-colors outline-none focus-visible:text-foreground",
                active ? "font-semibold text-foreground" : "font-medium text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              <span className={cn("absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-foreground transition-opacity", active ? "opacity-100" : "opacity-0")} aria-hidden />
            </button>
          );
        })}
      </div>

      {entries.length ? (
        <ul className="no-scrollbar -mx-4 mt-3 flex snap-x gap-3 overflow-x-auto scroll-px-4 px-4 pb-2">
          {entries.map((e, i) => {
            const meta = filmMetaLine(e.film);
            return (
              <li key={e.film.id} className="w-[9.5rem] shrink-0 snap-start">
                <Link
                  href={routes.cinema.film(e.film.slug)}
                  className="block h-full rounded-[1.4rem] bg-card p-1.5 outline-none transition-transform focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.99]"
                >
                  <FilmPoster url={e.film.posterUrl} width={342} eager={i < 2} className="rounded-[1.05rem]" />
                  <span className="block px-1.5 pt-2 pb-1.5">
                    <span className="line-clamp-2 text-sm leading-snug font-semibold">{e.film.title}</span>
                    {meta ? <span className="mt-0.5 block truncate text-xs text-muted-foreground">{meta}</span> : null}
                    <CardFoot entry={e} tab={tab} now={now} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-3xl bg-card p-4">
          <p className="text-sm text-muted-foreground">{tab === "bugun" ? "Bugün için kalan seans yok." : "Bu dönemde seans yok."}</p>
          {tab === "bugun" && lists.hafta.length ? (
            <button
              type="button"
              onClick={() => setPicked("hafta")}
              className="inline-flex h-9 shrink-0 items-center rounded-full bg-foreground px-4 text-[13px] font-semibold text-background outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Bu hafta
            </button>
          ) : null}
        </div>
      )}

      <p className="mt-1 text-xs text-muted-foreground">
        Seanslar:{" "}
        <a href={venue.url} target="_blank" rel="noopener noreferrer" className="font-medium underline-offset-2 hover:underline">
          {venue.cinema}
        </a>
      </p>
    </div>
  );
}
