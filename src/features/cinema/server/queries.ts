import "server-only";
import { cache } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { addDaysToKey, istanbulDateTime } from "@/core/time";
import { CINEMA_CACHE_TAG, CINEMA_REVALIDATE_SECONDS, DEFAULT_CINEMA_VENUE } from "../config";
import { cinemaDayKey } from "../lib/schedule";
import type { CinemaFilm, CinemaSchedule, CinemaShowtime, CinemaVenue } from "../types";

/**
 * Public cinema reads with a cookie-less anon client through the data cache (tag "cinema", 30 min), so the home page
 * and /sinema stay static. Filters use whole-day bounds, so the cache key only changes once a day.
 */

type FilmRow = Database["public"]["Tables"]["cinema_films"]["Row"];
type ShowtimeRow = Database["public"]["Tables"]["cinema_showtimes"]["Row"];

const FILM_COLUMNS =
  "id,slug,title,original_title,poster_url,duration_min,genres,age_rating,synopsis,release_date,trailer_url,source_url,directors,actors,last_seen_at";
const SHOWTIME_COLUMNS = "id,film_id,starts_at,format,language,hall";

function publicClient(): SupabaseClient<Database> {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, next: { revalidate: CINEMA_REVALIDATE_SECONDS, tags: [CINEMA_CACHE_TAG] } }),
    },
  });
}

function toFilm(r: Pick<FilmRow, Exclude<keyof FilmRow, "source" | "source_key" | "created_at" | "updated_at">>): CinemaFilm {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    originalTitle: r.original_title,
    posterUrl: r.poster_url,
    durationMin: r.duration_min,
    genres: r.genres ?? [],
    ageRating: r.age_rating,
    synopsis: r.synopsis,
    releaseDate: r.release_date,
    trailerUrl: r.trailer_url,
    sourceUrl: r.source_url,
    directors: r.directors ?? [],
    actors: r.actors ?? [],
  };
}

function toShowtime(r: Pick<ShowtimeRow, "id" | "film_id" | "starts_at" | "format" | "language" | "hall">): CinemaShowtime {
  return {
    id: r.id,
    filmId: r.film_id,
    startsAt: r.starts_at,
    format: r.format,
    language: r.language === "dublaj" || r.language === "altyazi" ? r.language : null,
    hall: r.hall,
  };
}

const str = (v: unknown, d: string, max = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : d);
const coord = (v: unknown, min: number, max: number, d: number | null) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : d);

/** app_settings 'cinema_source' (admin-editable) over the defaults; bad values fall back. */
function parseVenue(value: unknown): CinemaVenue {
  const d = DEFAULT_CINEMA_VENUE;
  if (!value || typeof value !== "object" || Array.isArray(value)) return d;
  const v = value as Record<string, unknown>;
  const url = typeof v.url === "string" && /^https:\/\/[^\s"'<>]+$/.test(v.url.trim()) ? v.url.trim() : d.url;
  const placeSlug = typeof v.place_slug === "string" && /^[a-z0-9-]{1,120}$/.test(v.place_slug) ? v.place_slug : v.place_slug === null ? null : d.placeSlug;
  return {
    enabled: v.enabled !== false,
    venue: str(v.venue, d.venue),
    cinema: str(v.cinema, d.cinema),
    operator: str(v.operator, d.operator),
    url,
    placeSlug,
    lat: coord(v.lat, -90, 90, d.lat),
    lng: coord(v.lng, -180, 180, d.lng),
  };
}

/**
 * Films seen in the last 14 days or releasing later, and sessions from the start of the current cinema day for 31
 * days. Tabs are cut from this on the page (lib/schedule.ts). Throws when the tables cannot be read.
 */
export const getCinemaSchedule = cache(async (): Promise<CinemaSchedule> => {
  const today = cinemaDayKey(new Date());
  const from = istanbulDateTime(today, "05:00").toISOString();
  const to = istanbulDateTime(addDaysToKey(today, 31), "05:00").toISOString();
  const seenSince = istanbulDateTime(addDaysToKey(today, -14)).toISOString();
  const sb = publicClient();
  const [st, fl, vs] = await Promise.all([
    sb.from("cinema_showtimes").select(SHOWTIME_COLUMNS).gte("starts_at", from).lt("starts_at", to).order("starts_at").limit(4000),
    sb.from("cinema_films").select(FILM_COLUMNS).or(`last_seen_at.gte."${seenSince}",release_date.gte."${today}"`).limit(300),
    sb.from("app_settings").select("value").eq("key", "cinema_source").maybeSingle(),
  ]);
  if (st.error) throw new Error(`cinema showtimes query failed: ${st.error.message}`);
  if (fl.error) throw new Error(`cinema films query failed: ${fl.error.message}`);

  const films = (fl.data ?? []).map(toFilm);
  const ids = new Set(films.map((f) => f.id));
  const updatedAt = (fl.data ?? []).reduce<string | null>((max, r) => (!max || r.last_seen_at > max ? r.last_seen_at : max), null);
  return {
    films,
    showtimes: (st.data ?? []).map(toShowtime).filter((s) => ids.has(s.filmId)),
    venue: parseVenue(vs.data?.value),
    updatedAt,
  };
});

export type CinemaFilmPage = { film: CinemaFilm; showtimes: CinemaShowtime[]; venue: CinemaVenue; updatedAt: string | null };

/** One film with its sessions of the next 31 days (an older film still opens, without sessions). */
export const getCinemaFilm = cache(async (slug: string): Promise<CinemaFilmPage | null> => {
  if (!/^[a-z0-9-]{1,100}$/.test(slug)) return null;
  const schedule = await getCinemaSchedule();
  let film = schedule.films.find((f) => f.slug === slug) ?? null;
  if (!film) {
    const { data, error } = await publicClient().from("cinema_films").select(FILM_COLUMNS).eq("slug", slug).maybeSingle();
    if (error) throw new Error(`cinema film query failed: ${error.message}`);
    film = data ? toFilm(data) : null;
  }
  if (!film) return null;
  const id = film.id;
  return { film, showtimes: schedule.showtimes.filter((s) => s.filmId === id), venue: schedule.venue, updatedAt: schedule.updatedAt };
});
