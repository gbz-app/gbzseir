/**
 * Parser of the Paribu Cineverse pages used for the Gebze Center AVM programme. Pure (no imports), so the cron route
 * and a local push script share it.
 *
 * Branch page https://www.paribucineverse.com/sinemalar/gebze-center?tarih=DD-MM-YYYY, per film (div#movieRow):
 *   data-movie-title            -> title              data-movie-description   -> original_title
 *   a.cinema-detail-link href   -> slug / source_key  img[src*=movie_posters]  -> poster_url (size segment dropped)
 *   data-trailer-url            -> trailer_url (HLS)  img ticket_flow/<16|18plus|genel..>.png -> age_rating
 *   .cinema-detail-tech-text    -> format + language ("2D - ALTYAZILI"), followed by its a[data-go-session] links
 *   a data-url "...session~<id>" -> showtime source_key; link text "HH:MM" -> starts_at (before 05:00 = next day)
 *   No hall on this page (only on the ticketing steps, which robots.txt disallows): hall stays null.
 * The page's ld+json (MovieTheater > ItemList > Movie, joined by title) adds genre, description (synopsis),
 * datePublished (release date), duration (PT86M), director[], actor[] and url (film page).
 * The date picker (data-full-date-reverse="DD-MM-YYYY") lists the published days; the active card is the day shown
 * (a date outside the picker returns a page without films, which must not count as "no sessions that day").
 *
 * "Yakında" page https://www.paribucineverse.com/gelecek-filmler: ld+json ItemList of Movie (same fields).
 */

export type ParsedLanguage = "dublaj" | "altyazi";

export type ParsedFilm = {
  sourceKey: string;
  slug: string;
  title: string;
  originalTitle: string | null;
  posterUrl: string | null;
  durationMin: number | null;
  genres: string[];
  ageRating: string | null;
  synopsis: string | null;
  releaseDate: string | null;
  trailerUrl: string | null;
  sourceUrl: string | null;
  directors: string[];
  actors: string[];
};

export type ParsedShowtime = {
  sourceKey: string;
  filmKey: string;
  /** ISO instant (UTC). */
  startsAt: string;
  format: string | null;
  language: ParsedLanguage | null;
  hall: string | null;
};

export type ParsedDay = {
  /** Requested day 'YYYY-MM-DD'. */
  date: string;
  /** The page really shows the requested day (so its session list is complete). */
  matched: boolean;
  /** Days the source publishes (date picker), ascending. */
  pickerDates: string[];
  films: ParsedFilm[];
  showtimes: ParsedShowtime[];
};

/** Body of public.cinema_import (snake_case, as the SQL reads it). */
export type CinemaImportPayload = {
  source: "cineverse";
  /** Days whose session lists are complete in this payload: their other future sessions are removed. */
  dates: string[];
  films: Array<{
    source_key: string;
    slug: string;
    title: string;
    original_title: string | null;
    poster_url: string | null;
    duration_min: number | null;
    genres: string[];
    age_rating: string | null;
    synopsis: string | null;
    release_date: string | null;
    trailer_url: string | null;
    source_url: string | null;
    directors: string[];
    actors: string[];
  }>;
  showtimes: Array<{ source_key: string; film_key: string; starts_at: string; format: string | null; language: ParsedLanguage | null; hall: string | null }>;
  /** Set when nothing could be read (the run is only recorded). */
  error: string | null;
  warnings: string[];
};

export class CinemaParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CinemaParseError";
  }
}

const KEY_PREFIX = "cineverse:";
const POSTER_HOST = "https://cdn-web.marsgate.tr";
const MAX_FILMS = 150;
const MAX_SHOWTIMES = 5000;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

/** Decoded, whitespace-collapsed text or null. */
function clean(s: unknown, max = 500): string | null {
  if (typeof s !== "string") return null;
  const t = decodeEntities(s).replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max).trim() : null;
}

function attr(chunk: string, name: string): string | null {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(chunk);
  return m ? clean(m[1]) : null;
}

function httpsUrl(v: unknown, max = 500): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length <= max && /^https:\/\/[^\s"'<>]+$/.test(t) ? t : null;
}

function isoDate(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v.trim()) ? v.trim().slice(0, 10) : null;
}

function addDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const pad = (n: number) => String(n).padStart(2, "0");

const TR_FOLD: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" };

/** ASCII slug: "Ruhlar Bölgesi" -> "ruhlar-bolgesi". */
export function foldSlug(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşü]/g, (c) => TR_FOLD[c] ?? c)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

/** Film key from a film page URL or path: "/korku-filmleri/kanli-korfez-filmi-izle" and "/kanli-korfez-filmi" -> "kanli-korfez". */
export function filmSlugFromUrl(url: string): string | null {
  let path: string;
  try {
    path = new URL(url, "https://source.invalid").pathname;
  } catch {
    return null;
  }
  let seg = path.split("/").filter(Boolean).pop() ?? "";
  try {
    seg = decodeURIComponent(seg);
  } catch {
    // keep the raw segment
  }
  seg = seg.replace(/-filmi-izle$/i, "").replace(/-filmi$/i, "");
  return foldSlug(seg) || null;
}

/** Canonical poster URL on the operator's CDN without the size segment (posterSrc() adds one). */
export function normalizePosterUrl(url: string | null): string | null {
  if (!url) return null;
  const m = /\/files\/movie_posters\/([^/?#"'\s<>]+\.(?:png|jpe?g|webp))(?:[?#].*)?$/i.exec(url.trim());
  if (m) {
    // Some file names carry Turkish letters ("ruhlar-bölgesi"): store them percent-encoded.
    let name = m[1];
    try {
      name = decodeURIComponent(name);
    } catch {
      // not encoded
    }
    return `${POSTER_HOST}/files/movie_posters/${encodeURIComponent(name)}`;
  }
  return httpsUrl(url);
}

function durationFromIso(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?/i.exec(v.trim());
  if (!m || (!m[1] && !m[2])) return null;
  const n = Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
  return n > 0 && n <= 600 ? n : null;
}

function durationFromText(v: string | null): number | null {
  if (!v) return null;
  const h = /(\d+)\s*sa/i.exec(v);
  const m = /(\d+)\s*dk/i.exec(v);
  if (!h && !m) return null;
  const n = Number(h?.[1] ?? 0) * 60 + Number(m?.[1] ?? 0);
  return n > 0 && n <= 600 ? n : null;
}

/** Rating icon name -> label: "genel"/"G" -> "Genel", "16plus"/"16" -> "16+", "6a" -> "6A"; content icons -> null. */
export function ageRatingFromIcon(name: string): string | null {
  const n = name.trim().toLowerCase();
  if (n === "g" || n === "genel") return "Genel";
  const m = /^(\d{1,2})(plus|a)?$/.exec(n);
  if (!m) return null;
  const age = Number(m[1]);
  if (age < 3 || age > 21) return null;
  return m[2] === "a" ? `${age}A` : `${age}+`;
}

/** "2D - ALTYAZILI" -> {format: "2D", language: "altyazi"}; "3D - DUBLAJLI" -> {3D, dublaj}; "2D" -> {2D, null}. */
export function parseTech(text: string | null): { format: string | null; language: ParsedLanguage | null } {
  const t = (text ?? "").trim();
  if (!t) return { format: null, language: null };
  const up = t.toLocaleUpperCase("tr");
  const language: ParsedLanguage | null = up.includes("DUBLAJ") ? "dublaj" : up.includes("ALTYAZI") ? "altyazi" : null;
  const format =
    t
      .split(/\s+-\s+/)
      .map((s) => s.trim())
      .filter((s) => s && !/DUBLAJ|ALTYAZI|TÜRKÇE|ORİJİNAL/.test(s.toLocaleUpperCase("tr")))
      .join(" ")
      .slice(0, 40) || null;
  return { format, language };
}

function names(v: unknown, max: number): string[] {
  const arr = Array.isArray(v) ? v : v ? [v] : [];
  const out: string[] = [];
  for (const x of arr) {
    const n = clean(typeof x === "string" ? x : x && typeof x === "object" ? (x as { name?: unknown }).name : null, 120);
    if (n && !out.includes(n)) out.push(n);
    if (out.length >= max) break;
  }
  return out;
}

function genresOf(v: unknown): string[] {
  const raw = Array.isArray(v) ? v.filter((x) => typeof x === "string").join(",") : typeof v === "string" ? v : "";
  const out: string[] = [];
  for (const g of raw.split(/[,/|]/)) {
    const c = clean(g, 40);
    if (c && !out.includes(c)) out.push(c);
  }
  return out.slice(0, 4);
}

// ---------------------------------------------------------------------------
// ld+json
// ---------------------------------------------------------------------------

type LdMovie = Record<string, unknown>;

function ldMovies(html: string): LdMovie[] {
  const out: LdMovie[] = [];
  const walk = (node: unknown, depth: number) => {
    if (depth > 10 || !node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const x of node) walk(x, depth + 1);
      return;
    }
    const o = node as Record<string, unknown>;
    if (o["@type"] === "Movie" && typeof o.name === "string") {
      out.push(o);
      return;
    }
    for (const v of Object.values(o)) walk(v, depth + 1);
  };
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      // Raw control characters (the source leaves \r\n inside strings) are invalid JSON; as whitespace they are harmless.
      walk(JSON.parse(m[1].replace(/[\u0000-\u001f]+/g, " ")), 0);
    } catch {
      // a broken block is skipped
    }
  }
  return out;
}

function filmFromLd(o: LdMovie): ParsedFilm | null {
  const url = httpsUrl(o.url);
  const title = clean(o.name, 200);
  const slug = (url && filmSlugFromUrl(url)) || (title ? foldSlug(title) : null);
  if (!slug || !title) return null;
  const synopsis = clean(o.description, 2000);
  return {
    sourceKey: KEY_PREFIX + slug,
    slug,
    title,
    originalTitle: null,
    posterUrl: normalizePosterUrl(typeof o.image === "string" ? o.image : null),
    durationMin: durationFromIso(o.duration),
    genres: genresOf(o.genre),
    ageRating: null,
    // The film pages' own ld+json carries a sales line instead of the plot.
    synopsis: synopsis && !/filmini mi arıyorsunuz/i.test(synopsis) ? synopsis : null,
    releaseDate: isoDate(o.datePublished),
    trailerUrl: null,
    sourceUrl: url,
    directors: names(o.director, 4),
    actors: names(o.actor, 8),
  };
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

const TIME_RE = /^([01]?\d|2[0-3])[:.]([0-5]\d)$/;

function dayFromReverse(v: string): string | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(v.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Merge film records by sourceKey: the first non-empty value of each field wins (branch rows come first). */
export function mergeFilms(...lists: ParsedFilm[][]): ParsedFilm[] {
  const map = new Map<string, ParsedFilm>();
  const empty = (v: unknown) => v == null || (Array.isArray(v) && v.length === 0);
  for (const list of lists) {
    for (const f of list) {
      const prev = map.get(f.sourceKey);
      if (!prev) {
        map.set(f.sourceKey, { ...f });
        continue;
      }
      const target = prev as Record<string, unknown>;
      for (const [k, v] of Object.entries(f)) if (empty(target[k]) && !empty(v)) target[k] = v;
    }
  }
  return [...map.values()];
}

/** One day of the branch programme. Throws CinemaParseError when the page is not the programme page (blocked or changed). */
export function parseBranchPage(html: string, date: string): ParsedDay {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new CinemaParseError("Geçersiz tarih");
  const flat = html.replace(/\s+/g, " ");
  if (!/page-cinema-title|calendar-card/.test(flat)) {
    throw new CinemaParseError("Sinema sayfası beklenen yapıda değil (erişim engellenmiş ya da sayfa değişmiş olabilir)");
  }

  const pickerDates = [
    ...new Set([...flat.matchAll(/data-full-date-reverse="([^"]+)"/g)].map((m) => dayFromReverse(m[1])).filter((d): d is string => !!d)),
  ].sort();
  const activeRaw = /data-full-date-reverse="([^"]+)"[^>]*class="[^"]*calendar-card active/.exec(flat)?.[1];
  const active = activeRaw ? dayFromReverse(activeRaw) : null;
  const matched = active ? active === date : pickerDates.includes(date);
  if (!matched) return { date, matched, pickerDates, films: [], showtimes: [] };

  const ld = ldMovies(html).map(filmFromLd).filter((f): f is ParsedFilm => !!f);
  const ldByTitle = new Map(ld.map((f) => [f.title.toLocaleLowerCase("tr"), f]));
  const ldBySlug = new Map(ld.map((f) => [f.slug, f]));

  const footer = flat.search(/<footer\b/i);
  const body = footer > 0 ? flat.slice(0, footer) : flat;
  const films: ParsedFilm[] = [];
  const showtimes = new Map<string, ParsedShowtime>();

  for (const chunk of body.split(/\sid="movieRow"/).slice(1)) {
    const title = attr(chunk, "data-movie-title");
    if (!title) continue;
    const href = /class="cinema-detail-link"[^>]*\shref="([^"]+)"/.exec(chunk)?.[1] ?? null;
    const slug = (href && filmSlugFromUrl(decodeEntities(href))) || foldSlug(title);
    if (!slug) continue;
    const meta = ldByTitle.get(title.toLocaleLowerCase("tr")) ?? ldBySlug.get(slug) ?? null;
    const sourceKey = KEY_PREFIX + slug;

    const original = attr(chunk, "data-movie-description");
    let ageRating: string | null = null;
    for (const m of chunk.matchAll(/ticket_flow\/([^"/]+?)\.png/g)) {
      ageRating = ageRatingFromIcon(m[1]);
      if (ageRating) break;
    }
    const row: ParsedFilm = {
      sourceKey,
      slug,
      title: title.slice(0, 200),
      originalTitle: original && original.toLocaleLowerCase("tr") !== title.toLocaleLowerCase("tr") ? original.slice(0, 200) : null,
      posterUrl: normalizePosterUrl(/<img[^>]*\ssrc="([^"]*\/files\/movie_posters\/[^"]+)"/.exec(chunk)?.[1] ?? null),
      durationMin: durationFromText(/id="movieRuntime"[^>]*>([^<]*)</.exec(chunk)?.[1] ?? null),
      genres: genresOf(attr(chunk, "data-genre")),
      ageRating,
      synopsis: null,
      releaseDate: null,
      trailerUrl: httpsUrl(attr(chunk, "data-trailer-url")),
      sourceUrl: href ? httpsUrl(new URL(decodeEntities(href), "https://www.paribucineverse.com").toString()) : null,
      directors: [],
      actors: [],
    };
    // ld+json has the canonical film URL and exact duration; the row has the rest.
    films.push(meta ? mergeFilms([{ ...row, sourceUrl: meta.sourceUrl ?? row.sourceUrl, durationMin: meta.durationMin ?? row.durationMin }], [meta])[0] : row);

    // Session links follow their "2D - ALTYAZILI" label; without labels every link counts with an unknown variant.
    const parts = chunk.split(/cinema-detail-tech-text"\s*>/);
    const groups = parts.length > 1 ? parts.slice(1).map((p) => ({ tech: clean(p.slice(0, Math.max(0, p.indexOf("<")))), html: p })) : [{ tech: null, html: chunk }];
    for (const g of groups) {
      const { format, language } = parseTech(g.tech);
      for (const a of g.html.matchAll(/<a\b([^>]*)>([^<]*)<\/a>/g)) {
        if (!/data-go-session="true"/.test(a[1])) continue;
        const tm = TIME_RE.exec((clean(a[2]) ?? "").trim());
        if (!tm) continue;
        const hh = Number(tm[1]);
        const mm = Number(tm[2]);
        const day = hh < 5 ? addDays(date, 1) : date;
        const startsAt = new Date(`${day}T${pad(hh)}:${pad(mm)}:00+03:00`).toISOString();
        const id = /session~(\d{1,12})/.exec(a[1])?.[1];
        const key = id ? `${KEY_PREFIX}session:${id}` : `${sourceKey}:${startsAt}:${format ?? ""}:${language ?? ""}`;
        if (!showtimes.has(key)) showtimes.set(key, { sourceKey: key, filmKey: sourceKey, startsAt, format, language, hall: null });
      }
    }
  }

  return { date, matched, pickerDates, films: mergeFilms(films), showtimes: [...showtimes.values()] };
}

/** "Yakında" films (chain-wide). Throws CinemaParseError when the list is missing. */
export function parseUpcomingPage(html: string): ParsedFilm[] {
  const films = ldMovies(html)
    .map(filmFromLd)
    .filter((f): f is ParsedFilm => !!f);
  if (!films.length) throw new CinemaParseError("Yakında listesi okunamadı");
  return mergeFilms(films).slice(0, 80);
}

/**
 * Import payload from parsed days + the "Yakında" list: films of the programme, upcoming films whose release date is
 * today or later, the sessions, and the days whose session lists are complete.
 */
export function buildImportPayload(days: ParsedDay[], upcoming: ParsedFilm[], today: string, warnings: string[] = []): CinemaImportPayload {
  const complete = days.filter((d) => d.matched);
  const films = mergeFilms(
    ...complete.map((d) => d.films),
    upcoming.filter((f) => f.releaseDate && f.releaseDate >= today),
  ).slice(0, MAX_FILMS);
  const known = new Set(films.map((f) => f.sourceKey));
  const showtimes = new Map<string, ParsedShowtime>();
  for (const d of complete) for (const s of d.showtimes) if (known.has(s.filmKey) && !showtimes.has(s.sourceKey)) showtimes.set(s.sourceKey, s);

  return {
    source: "cineverse",
    dates: [...new Set(complete.map((d) => d.date))].sort(),
    films: films.map((f) => ({
      source_key: f.sourceKey,
      slug: f.slug,
      title: f.title,
      original_title: f.originalTitle,
      poster_url: f.posterUrl,
      duration_min: f.durationMin,
      genres: f.genres,
      age_rating: f.ageRating,
      synopsis: f.synopsis,
      release_date: f.releaseDate,
      trailer_url: f.trailerUrl,
      source_url: f.sourceUrl,
      directors: f.directors,
      actors: f.actors,
    })),
    showtimes: [...showtimes.values()].slice(0, MAX_SHOWTIMES).map((s) => ({
      source_key: s.sourceKey,
      film_key: s.filmKey,
      starts_at: s.startsAt,
      format: s.format,
      language: s.language,
      hall: s.hall,
    })),
    error: null,
    warnings: warnings.slice(0, 20),
  };
}
