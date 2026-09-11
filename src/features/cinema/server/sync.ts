import "server-only";
import { addDaysToKey, istanbulDateKey } from "@/core/time";
import type { Json } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { CINEVERSE_BRANCH_PATH, CINEVERSE_ORIGIN, CINEVERSE_UPCOMING_PATH } from "../config";
import { buildImportPayload, parseBranchPage, parseUpcomingPage, type CinemaImportPayload, type ParsedDay, type ParsedFilm } from "./parse";

/**
 * Cinema import behind /api/cron/cinema: reads the source pages (or pages pushed from a Turkish connection when the
 * source blocks the server), parses them (./parse.ts) and stores the result with public.cinema_import (service role).
 *
 * Requests per run: today's programme (its date picker lists the published days, 3 today), each other published day,
 * and the "Yakında" list, 1.5 s apart; the schedule runs twice a day. /biletleme/ (robots.txt) is never requested.
 * Posters are NOT copied to R2: the operator's terms (paribucineverse.com/kullanim-kosullari) forbid copying the site's
 * images, so the source poster URL is stored as is.
 */

const USER_AGENT = "Mozilla/5.0 (compatible; GebzemBot/1.0; +https://gbzsehir.vercel.app)";
const REQUEST_GAP_MS = 1500;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_HTML_BYTES = 3_000_000;
const MAX_DAYS = 31;

export type CinemaPushedPage = { date: string; html: string };
export type CinemaPush = { pages: CinemaPushedPage[]; upcomingHtml: string | null };

export type CinemaSyncResult = {
  ok: boolean;
  mode: "fetch" | "push";
  dryRun: boolean;
  /** Days whose session lists were complete. */
  dates: string[];
  films: number;
  showtimes: number;
  /** Films without sessions yet (release date later in the window). */
  upcoming: number;
  /** What public.cinema_import wrote (null on dry runs and failures). */
  stored: { films: number; showtimes: number; removed: number } | null;
  /** Fatal error (nothing readable), else null. */
  error: string | null;
  warnings: string[];
};

const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Source URL of one programme day 'YYYY-MM-DD'. */
export function branchFetchUrl(day: string): string {
  const [y, m, d] = day.split("-");
  return `${CINEVERSE_ORIGIN}${CINEVERSE_BRANCH_PATH}?tarih=${d}-${m}-${y}`;
}

async function getHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml", "Accept-Language": "tr-TR,tr;q=0.9" },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  if (html.length > MAX_HTML_BYTES) throw new Error("Sayfa beklenenden büyük");
  return html;
}

/** Today's programme first (a failure there is fatal), then the other published days and "Yakında". */
async function fetchSource(today: string, warnings: string[]): Promise<{ days: ParsedDay[]; upcoming: ParsedFilm[] }> {
  const first = parseBranchPage(await getHtml(branchFetchUrl(today)), today);
  const days = [first];
  const yesterday = addDaysToKey(today, -1);
  const others = first.pickerDates.filter((d) => d !== today && d >= yesterday).slice(0, MAX_DAYS);
  for (const day of others) {
    await sleep(REQUEST_GAP_MS);
    try {
      days.push(parseBranchPage(await getHtml(branchFetchUrl(day)), day));
    } catch (e) {
      warnings.push(`${day}: ${message(e)}`);
    }
  }
  let upcoming: ParsedFilm[] = [];
  await sleep(REQUEST_GAP_MS);
  try {
    upcoming = parseUpcomingPage(await getHtml(`${CINEVERSE_ORIGIN}${CINEVERSE_UPCOMING_PATH}`));
  } catch (e) {
    warnings.push(`Yakında: ${message(e)}`);
  }
  return { days, upcoming };
}

function parsePushed(push: CinemaPush, warnings: string[]): { days: ParsedDay[]; upcoming: ParsedFilm[] } {
  const days: ParsedDay[] = [];
  for (const p of push.pages) {
    try {
      days.push(parseBranchPage(p.html, p.date));
    } catch (e) {
      warnings.push(`${p.date}: ${message(e)}`);
    }
  }
  let upcoming: ParsedFilm[] = [];
  if (push.upcomingHtml) {
    try {
      upcoming = parseUpcomingPage(push.upcomingHtml);
    } catch (e) {
      warnings.push(`Yakında: ${message(e)}`);
    }
  }
  return { days, upcoming };
}

/**
 * One import run. `push` parses the given pages instead of fetching; `dryRun` parses without writing. A run that reads
 * nothing is still recorded (cinema_import_runs) so a blocked source shows up, and keeps the stored programme.
 */
export async function runCinemaSync(opts: { push?: CinemaPush | null; dryRun?: boolean } = {}): Promise<CinemaSyncResult> {
  const today = istanbulDateKey();
  const mode = opts.push ? "push" : "fetch";
  const dryRun = opts.dryRun === true;
  const warnings: string[] = [];

  let days: ParsedDay[] = [];
  let upcoming: ParsedFilm[] = [];
  let fatal: string | null = null;
  try {
    ({ days, upcoming } = opts.push ? parsePushed(opts.push, warnings) : await fetchSource(today, warnings));
  } catch (e) {
    fatal = `Kaynak okunamadı: ${message(e)}`;
  }
  if (!fatal && !days.some((d) => d.matched)) fatal = warnings[0] ? `Kaynak okunamadı: ${warnings[0]}` : "Kaynakta seans günü bulunamadı";

  const payload: CinemaImportPayload = fatal
    ? { source: "cineverse", dates: [], films: [], showtimes: [], error: fatal, warnings }
    : buildImportPayload(days, upcoming, today, warnings);
  const withSessions = new Set(payload.showtimes.map((s) => s.film_key));
  const base = {
    mode,
    dryRun,
    dates: payload.dates,
    films: payload.films.length,
    showtimes: payload.showtimes.length,
    upcoming: payload.films.filter((f) => !withSessions.has(f.source_key)).length,
    error: fatal,
    warnings,
  } as const;
  if (dryRun) return { ok: !fatal, ...base, stored: null };

  const { data, error } = await createAdminClient().rpc("cinema_import", { p_payload: payload as unknown as Json });
  if (error) throw new Error(`cinema_import failed: ${error.message}`);
  const r = (data ?? {}) as { films?: number; showtimes?: number; removed?: number };
  return {
    ok: !fatal,
    ...base,
    stored: fatal ? null : { films: Number(r.films ?? 0), showtimes: Number(r.showtimes ?? 0), removed: Number(r.removed ?? 0) },
  };
}
