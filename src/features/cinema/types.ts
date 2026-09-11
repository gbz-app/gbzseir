/** Vizyondaki filmler: Gebze Center AVM sineması (public.cinema_films / cinema_showtimes, filled by /api/cron/cinema). */

export type CinemaLanguage = "dublaj" | "altyazi";

/** One film as the pages read it. */
export type CinemaFilm = {
  id: string;
  slug: string;
  title: string;
  originalTitle: string | null;
  /** Source poster (operator CDN, never copied); size it with posterSrc(). */
  posterUrl: string | null;
  durationMin: number | null;
  genres: string[];
  /** "Genel", "7+", "13+", "16+", "18+", "6A" ... */
  ageRating: string | null;
  synopsis: string | null;
  /** Vizyon tarihi, 'YYYY-MM-DD'. */
  releaseDate: string | null;
  /** Trailer stream of the source (HLS); pages link to sourceUrl instead, which plays it everywhere. */
  trailerUrl: string | null;
  /** Film page on the operator's site (trailer + tickets). */
  sourceUrl: string | null;
  directors: string[];
  actors: string[];
};

export type CinemaShowtime = {
  id: number;
  filmId: string;
  /** ISO instant. */
  startsAt: string;
  /** "2D", "3D", "IMAX 3D" ... */
  format: string | null;
  language: CinemaLanguage | null;
  hall: string | null;
};

/** app_settings 'cinema_source': the venue and the operator page the programme comes from. */
export type CinemaVenue = {
  enabled: boolean;
  /** "Gebze Center AVM" */
  venue: string;
  /** "Paribu Cineverse Gebze Center" */
  cinema: string;
  /** "Paribu Cineverse" */
  operator: string;
  /** Branch page (programme + tickets). */
  url: string;
  /** poi slug of the mall (/gezilecek-yerler/<slug>). */
  placeSlug: string | null;
  lat: number | null;
  lng: number | null;
};

export type CinemaSchedule = {
  films: CinemaFilm[];
  /** Showtimes from the start of the current cinema day for ~31 days, ascending. */
  showtimes: CinemaShowtime[];
  venue: CinemaVenue;
  /** Newest last_seen_at of the films (the last import that stored them), for "Son güncelleme". */
  updatedAt: string | null;
};
