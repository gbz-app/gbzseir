import { addDaysToKey, istanbulDateKey, toDate, type DateInput } from "@/core/time";
import type { CinemaFilm, CinemaShowtime } from "../types";

/**
 * Tabs of the cinema lists (pure, client-safe). The source publishes a few days of sessions at a time, so "Bu hafta"
 * and "Bu ay" also list films whose release date (vizyon tarihi) falls in the window and that have no sessions yet.
 */
export type CinemaTab = "bugun" | "hafta" | "ay";

export const CINEMA_TABS: ReadonlyArray<{ value: CinemaTab; label: string }> = [
  { value: "bugun", label: "Bugün" },
  { value: "hafta", label: "Bu hafta" },
  { value: "ay", label: "Bu ay" },
];

/** Days in each window, counting today. */
const TAB_DAYS: Record<CinemaTab, number> = { bugun: 1, hafta: 7, ay: 30 };

/** A cinema day runs 05:00-05:00: late sessions after midnight belong to the previous day's programme (like the source). */
const DAY_START_MS = 5 * 3_600_000;

/** 'YYYY-MM-DD' cinema day of an instant. */
export function cinemaDayKey(input: DateInput): string {
  return istanbulDateKey(toDate(input).getTime() - DAY_START_MS);
}

export type FilmDay = { day: string; showtimes: CinemaShowtime[] };

export type FilmEntry = {
  film: CinemaFilm;
  /** Days with upcoming sessions in the window (ascending). Empty for `upcoming`. */
  days: FilmDay[];
  /** Next session in the window. */
  next: CinemaShowtime | null;
  /** No sessions yet: the release date falls in the window. */
  upcoming: boolean;
};

/**
 * Films of a tab at `now`: films with a session that has not started yet in the window (newest release first), then
 * films releasing later in the window (soonest first; not for "Bugün").
 */
export function filmsForTab(films: readonly CinemaFilm[], showtimes: readonly CinemaShowtime[], tab: CinemaTab, now: Date): FilmEntry[] {
  const today = cinemaDayKey(now);
  const lastDay = addDaysToKey(today, TAB_DAYS[tab] - 1);
  const nowMs = now.getTime();

  const byFilm = new Map<string, CinemaShowtime[]>();
  for (const s of showtimes) {
    const t = Date.parse(s.startsAt);
    if (!(t >= nowMs) || cinemaDayKey(t) > lastDay) continue;
    const list = byFilm.get(s.filmId);
    if (list) list.push(s);
    else byFilm.set(s.filmId, [s]);
  }

  const showing: FilmEntry[] = [];
  const upcoming: FilmEntry[] = [];
  for (const film of films) {
    const list = byFilm.get(film.id);
    if (list?.length) {
      list.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
      showing.push({ film, days: groupByDay(list), next: list[0], upcoming: false });
    } else if (tab !== "bugun" && film.releaseDate && film.releaseDate > today && film.releaseDate <= lastDay) {
      upcoming.push({ film, days: [], next: null, upcoming: true });
    }
  }

  const title = (a: FilmEntry, b: FilmEntry) => a.film.title.localeCompare(b.film.title, "tr");
  showing.sort((a, b) => (b.film.releaseDate ?? "").localeCompare(a.film.releaseDate ?? "") || title(a, b));
  upcoming.sort((a, b) => (a.film.releaseDate ?? "").localeCompare(b.film.releaseDate ?? "") || title(a, b));
  return [...showing, ...upcoming];
}

/** Sessions (ascending) grouped by cinema day. */
export function groupByDay(showtimes: readonly CinemaShowtime[]): FilmDay[] {
  const days: FilmDay[] = [];
  for (const s of showtimes) {
    const day = cinemaDayKey(s.startsAt);
    const last = days[days.length - 1];
    if (last && last.day === day) last.showtimes.push(s);
    else days.push({ day, showtimes: [s] });
  }
  return days;
}

export type ShowtimeVariant = { key: string; format: string | null; language: CinemaShowtime["language"]; showtimes: CinemaShowtime[] };

/** One day's sessions split by format + language ("2D Altyazılı" / "2D Dublaj"), in first-session order. */
export function groupByVariant(showtimes: readonly CinemaShowtime[]): ShowtimeVariant[] {
  const map = new Map<string, ShowtimeVariant>();
  for (const s of showtimes) {
    const key = `${s.format ?? ""}|${s.language ?? ""}`;
    const v = map.get(key);
    if (v) v.showtimes.push(s);
    else map.set(key, { key, format: s.format, language: s.language, showtimes: [s] });
  }
  return [...map.values()];
}
