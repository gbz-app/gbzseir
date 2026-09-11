import type { ListingStatus, ListingType } from "../../constants";

/** Columns of public.listing_daily_stats / the days of listing_owner_stats. */
export const STAT_KEYS = ["views", "unique_views", "calls", "phone_reveals", "favorites_added", "shares"] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type StatValues = Record<StatKey, number>;
export type StatDay = StatValues & { day: string };

export type ListingStatsListing = {
  id: string;
  type: ListingType;
  title: string;
  status: ListingStatus;
  price: number | null;
  publishedAt: string | null;
  expiresAt: string;
  photos: number;
  /** Lifetime public counter (unique viewers per day). */
  viewCount: number;
  callCount: number;
  /** People who have the listing in their favourites right now (owner only). */
  favoritesNow: number;
};

export type ListingStats = {
  /** Europe/Istanbul days, "YYYY-MM-DD"; `to` is today. */
  from: string;
  to: string;
  /** Zero-filled, oldest first. */
  days: StatDay[];
  listing: ListingStatsListing;
};

/** Daily history starts with the stats release (older days only exist in the lifetime counters). */
export const DAILY_STATS_SINCE = "2026-09-11";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const count = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
};
const text = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export function zeroStats(): StatValues {
  return { views: 0, unique_views: 0, calls: 0, phone_reveals: 0, favorites_added: 0, shares: 0 };
}

export function sumStats(days: readonly StatValues[]): StatValues {
  const total = zeroStats();
  for (const d of days) for (const k of STAT_KEYS) total[k] += d[k];
  return total;
}

export function hasActivity(d: StatValues): boolean {
  return STAT_KEYS.some((k) => d[k] > 0);
}

/** listing_owner_stats jsonb -> view model; null when the listing is not the caller's ({ok:false}). */
export function parseListingStats(raw: unknown): ListingStats | null {
  const r = obj(raw);
  if (r.ok !== true) return null;
  const l = obj(r.listing);
  const days: StatDay[] = [];
  for (const x of Array.isArray(r.days) ? r.days : []) {
    const d = obj(x);
    const day = String(d.day ?? "").slice(0, 10);
    if (!day) continue;
    const row: StatDay = { day, ...zeroStats() };
    for (const k of STAT_KEYS) row[k] = count(d[k]);
    days.push(row);
  }
  const price = l.price_try === null || l.price_try === undefined ? null : Number(l.price_try);
  return {
    from: text(r.from) ?? days[0]?.day ?? "",
    to: text(r.to) ?? days.at(-1)?.day ?? "",
    days,
    listing: {
      id: String(l.id ?? ""),
      type: l.type === "job" ? "job" : "classified",
      title: String(l.title ?? ""),
      status: (text(l.status) ?? "draft") as ListingStatus,
      price: price !== null && Number.isFinite(price) ? price : null,
      publishedAt: text(l.published_at),
      expiresAt: text(l.expires_at) ?? new Date(0).toISOString(),
      photos: count(l.photos),
      viewCount: count(l.view_count),
      callCount: count(l.call_count),
      favoritesNow: count(l.favorites_now),
    },
  };
}

// ---------------------------------------------------------------------------
// Day helpers ("YYYY-MM-DD" calendar days; formatted at UTC noon so server and client agree)
// ---------------------------------------------------------------------------

const DAY_FMT = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" });
const WEEKDAY_FMT = new Intl.DateTimeFormat("tr-TR", { weekday: "short", timeZone: "UTC" });
const LONG_FMT = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const ISTANBUL_DAY_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" });

const noon = (day: string) => new Date(`${day.slice(0, 10)}T12:00:00Z`);

/** "2026-09-11" -> "11 Eyl" */
export const shortDay = (day: string) => DAY_FMT.format(noon(day));
/** "2026-09-11" -> "Cum" */
export const weekdayShort = (day: string) => WEEKDAY_FMT.format(noon(day));
/** "2026-09-11" -> "11 Eylül 2026" */
export const longDay = (day: string) => LONG_FMT.format(noon(day));

/** Today's calendar day in Istanbul ("YYYY-MM-DD"), the day the DB stats use. */
export function istanbulToday(): string {
  return ISTANBUL_DAY_FMT.format(new Date());
}

export function addDays(day: string, n: number): string {
  const d = noon(day);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
