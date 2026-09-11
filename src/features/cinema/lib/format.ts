import { formatDate, formatDayLabel } from "@/core/format";
import { istanbulDateTime } from "@/core/time";
import type { CinemaFilm, CinemaLanguage, CinemaShowtime } from "../types";

/** Widths the operator's poster CDN serves (JPEG, 2:3). */
export type PosterWidth = 200 | 255 | 342 | 500;

const POSTER_RE = /^https:\/\/cdn-web\.marsgate\.tr\/(files\/movie_posters\/[^?#\s]+)$/;

/** Sized poster URL ("https://cdn-web.marsgate.tr/342//files/movie_posters/x.png"); other URLs are returned as is. */
export function posterSrc(url: string | null, width: PosterWidth): string | null {
  if (!url) return null;
  const m = POSTER_RE.exec(url);
  return m ? `https://cdn-web.marsgate.tr/${width}//${m[1]}` : url;
}

/** 86 -> "1 sa 26 dk", 120 -> "2 sa", 45 -> "45 dk". */
export function durationLabel(min: number | null): string | null {
  if (!min || min <= 0) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} dk`;
  return m ? `${h} sa ${m} dk` : `${h} sa`;
}

export const LANGUAGE_LABEL: Record<CinemaLanguage, string> = { dublaj: "Dublaj", altyazi: "Altyazılı" };

/** "2D · Altyazılı", "3D · Dublaj", "2D" ("" when unknown). */
export function variantLabel(s: Pick<CinemaShowtime, "format" | "language">): string {
  return [s.format, s.language ? LANGUAGE_LABEL[s.language] : null].filter(Boolean).join(" · ");
}

/** "Korku · 1 sa 26 dk" (+ " · 16+" with `age`). */
export function filmMetaLine(film: Pick<CinemaFilm, "genres" | "durationMin" | "ageRating">, opts: { age?: boolean } = {}): string {
  return [film.genres.slice(0, 2).join(", ") || null, durationLabel(film.durationMin), opts.age ? film.ageRating : null].filter(Boolean).join(" · ");
}

/** "Bugün", "Yarın", "13 Eylül Pazar" for a cinema day 'YYYY-MM-DD'. */
export function dayLabel(dayKey: string, now: Date): string {
  const d = istanbulDateTime(dayKey, "12:00");
  const rel = formatDayLabel(d, now);
  if (rel === "Bugün" || rel === "Yarın") return rel;
  return formatDate(d, { month: "long", weekday: true });
}

/** Short day for a card line: "Bugün", "Yarın", "Cmt 13 Eyl". */
export function shortDayLabel(dayKey: string, now: Date): string {
  const d = istanbulDateTime(dayKey, "12:00");
  const rel = formatDayLabel(d, now);
  if (rel === "Bugün" || rel === "Yarın") return rel;
  return formatDate(d);
}

/** "18 Eylül" (year when not this year). */
export function releaseLabel(dateKey: string): string {
  return formatDate(istanbulDateTime(dateKey, "12:00"), { month: "long" });
}
