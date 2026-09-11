"use client";

import * as React from "react";
import Link from "next/link";
import { Clapperboard } from "lucide-react";
import { routes } from "@/core/routes";
import { ChipFilter } from "@/components/shared/chip-filter";
import { DataSourceNote } from "@/components/shared/data-source-note";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { dayLabel, filmMetaLine, releaseLabel } from "../lib/format";
import { CINEMA_TABS, filmsForTab, type CinemaTab, type FilmEntry } from "../lib/schedule";
import { useNow } from "../lib/use-now";
import type { CinemaFilm, CinemaShowtime, CinemaVenue } from "../types";
import { DayShowtimes } from "./day-showtimes";
import { FilmPoster } from "./film-poster";
import { VenueCard } from "./venue-card";

function FilmRow({ entry, tab, now, venueUrl }: { entry: FilmEntry; tab: CinemaTab; now: Date; venueUrl: string }) {
  const { film } = entry;
  const href = routes.cinema.film(film.slug);
  const meta = filmMetaLine(film, { age: true });
  return (
    <li className="rounded-3xl bg-card p-3">
      <div className="flex gap-3">
        <Link href={href} tabIndex={-1} aria-hidden className="w-[5.5rem] shrink-0 self-start">
          <FilmPoster url={film.posterUrl} width={255} className="rounded-[1.1rem]" />
        </Link>
        <div className="min-w-0 flex-1 pt-0.5">
          <Link href={href} className="line-clamp-2 text-base leading-snug font-semibold outline-none hover:underline focus-visible:underline">
            {film.title}
          </Link>
          {meta ? <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p> : null}
          {entry.upcoming && film.releaseDate ? (
            <p className="mt-2.5 inline-flex h-7 items-center rounded-full bg-brand-soft px-2.5 text-xs font-semibold text-primary">
              Vizyona giriyor: {releaseLabel(film.releaseDate)}
            </p>
          ) : (
            <div className="mt-2.5 flex flex-col gap-3">
              {entry.days.map((d) => (
                <div key={d.day}>
                  {tab !== "bugun" ? <p className="mb-1.5 text-[13px] font-semibold">{dayLabel(d.day, now)}</p> : null}
                  <DayShowtimes showtimes={d.showtimes} day={d.day} venueUrl={venueUrl} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * /sinema: Bugün / Bu hafta / Bu ay chips, the venue with directions, one white row per film (poster, meta, sessions
 * grouped by day; a time opens the ticket page) and the source line.
 */
export function CinemaBrowser({
  films,
  showtimes,
  venue,
  updatedAt,
  serverNow,
}: {
  films: CinemaFilm[];
  showtimes: CinemaShowtime[];
  venue: CinemaVenue;
  updatedAt: string | null;
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
  const entries = lists[tab];
  const options = CINEMA_TABS.map((t) => ({ value: t.value, label: t.label, count: lists[t.value].length }));

  return (
    <>
      <PageHeader title="Vizyondaki filmler" subtitle={venue.venue} backHref={routes.home()}>
        <ChipFilter options={options} value={tab} onChange={(v) => v && setPicked(v)} ariaLabel="Dönem" size="sm" />
      </PageHeader>
      <div className="flex flex-col gap-3 px-4 pt-3 pb-8">
        <VenueCard venue={venue} />
        {entries.length ? (
          <ul className="flex flex-col gap-3">
            {entries.map((e) => (
              <FilmRow key={e.film.id} entry={e} tab={tab} now={now} venueUrl={venue.url} />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={Clapperboard}
            title={tab === "bugun" && lists.hafta.length ? "Bugün için kalan seans yok" : "Şu an seans bilgisi yok"}
            description={tab === "bugun" && lists.hafta.length ? "Bu haftanın seanslarına göz at." : "Güncel seanslar sinemanın sayfasında."}
            actionLabel={tab === "bugun" && lists.hafta.length ? undefined : "Sinemanın sayfası"}
            actionHref={tab === "bugun" && lists.hafta.length ? undefined : venue.url}
            compact
          />
        )}
        <DataSourceNote source={venue.cinema} sourceUrl={venue.url} updatedAt={updatedAt} note="Seans saatleri değişebilir; bileti alırken kontrol et." />
      </div>
    </>
  );
}
