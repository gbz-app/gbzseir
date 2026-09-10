/**
 * tr-TR formatting helpers (pure TS). Dates are always rendered in Europe/Istanbul.
 */
import { toNationalDigits } from "./phone";
import { TIMEZONE, istanbulDateKey, istanbulDayDiff, isValidDate, toDate, type DateInput } from "./time";

const intFmt = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const decFmt = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** 1250 -> "1.250"; 1.5 with fractionDigits -> "1,5". */
export function formatNumber(n: number, fractionDigits = 0): string {
  if (!Number.isFinite(n)) return "";
  if (fractionDigits === 0) return intFmt.format(n);
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: fractionDigits }).format(n);
}

/** Price in TRY: 1250 -> "1.250 TL". Null/empty -> fallback ("Fiyat belirtilmemiş"). */
export function formatPrice(amount: number | string | null | undefined, opts: { fallback?: string } = {}): string {
  const fallback = opts.fallback ?? "Fiyat belirtilmemiş";
  if (amount === null || amount === undefined || amount === "") return fallback;
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) return fallback;
  return `${Number.isInteger(n) ? intFmt.format(n) : decFmt.format(n)} TL`;
}

/** Salary/price range: "25.000 - 30.000 TL", "En az 25.000 TL", "En fazla 30.000 TL". */
export function formatPriceRange(
  min: number | null | undefined,
  max: number | null | undefined,
  opts: { fallback?: string } = {},
): string {
  const hasMin = typeof min === "number" && Number.isFinite(min);
  const hasMax = typeof max === "number" && Number.isFinite(max);
  if (hasMin && hasMax) return min === max ? formatPrice(min) : `${intFmt.format(min!)} - ${intFmt.format(max!)} TL`;
  if (hasMin) return `En az ${formatPrice(min)}`;
  if (hasMax) return `En fazla ${formatPrice(max)}`;
  return opts.fallback ?? "Belirtilmemiş";
}

/** Display a TR phone: "+905321234567" -> "0532 123 45 67". Unknown formats are returned unchanged. */
export function formatPhoneTR(phone: string | null | undefined): string {
  if (!phone) return "";
  const d = toNationalDigits(phone, { allowLandline: true });
  if (!d) return phone;
  return `0${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8, 10)}`;
}

/**
 * Mask a phone keeping only the last 2 digits: "5XX XXX XX 12".
 * With keepPrefix the operator code stays visible: "532 XXX XX 12".
 */
export function maskPhone(phone: string | null | undefined, opts: { keepPrefix?: boolean } = {}): string {
  const d = toNationalDigits(phone ?? "", { allowLandline: true });
  if (!d) return "XXX XXX XX XX";
  const head = opts.keepPrefix ? d.slice(0, 3) : `${d[0]}XX`;
  return `${head} XXX XX ${d.slice(8, 10)}`;
}

const dateFmtCache = new Map<string, Intl.DateTimeFormat>();
function dtf(key: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  let f = dateFmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("tr-TR", { timeZone: TIMEZONE, ...options });
    dateFmtCache.set(key, f);
  }
  return f;
}

export type FormatDateOptions = {
  /** 'short' -> "12 Eyl", 'long' -> "12 Eylül" (default 'short'). */
  month?: "short" | "long";
  /** Show year: true, false, or 'auto' (only when not the current year). Default 'auto'. */
  year?: boolean | "auto";
  /** Prefix weekday ("Cumartesi"). */
  weekday?: boolean;
};

/** "12 Eyl", "12 Eylül 2026", "12 Eylül 2026 Cumartesi" (Istanbul time). */
export function formatDate(input: DateInput, opts: FormatDateOptions = {}): string {
  const d = toDate(input);
  if (!isValidDate(d)) return "";
  const month = opts.month ?? "short";
  const yearOpt = opts.year ?? "auto";
  const showYear = yearOpt === "auto" ? istanbulDateKey(d).slice(0, 4) !== istanbulDateKey(new Date()).slice(0, 4) : yearOpt;
  const key = `d-${month}-${showYear}-${opts.weekday ? 1 : 0}`;
  return dtf(key, {
    day: "numeric",
    month,
    ...(showYear ? { year: "numeric" } : {}),
    ...(opts.weekday ? { weekday: "long" } : {}),
  }).format(d);
}

/** "14:30" (Istanbul time). */
export function formatTime(input: DateInput): string {
  const d = toDate(input);
  if (!isValidDate(d)) return "";
  return dtf("t", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}

/** "12 Eyl 14:30" (year added when not current year). */
export function formatDateTime(input: DateInput, opts: FormatDateOptions = {}): string {
  const d = toDate(input);
  if (!isValidDate(d)) return "";
  return `${formatDate(d, opts)} ${formatTime(d)}`;
}

/**
 * Turkish relative time: "az önce", "5 dk önce", "3 saat önce", "dün 21:40", "4 gün önce", "12 Eyl".
 * Future instants fall back to an absolute date-time.
 */
export function formatRelativeTime(input: DateInput, now: DateInput = new Date()): string {
  const d = toDate(input);
  const n = toDate(now);
  if (!isValidDate(d)) return "";
  const diffSec = Math.round((n.getTime() - d.getTime()) / 1000);
  if (diffSec < -60) return formatDateTime(d);
  if (diffSec < 45) return "az önce";
  if (diffSec < 3600) return `${Math.max(1, Math.round(diffSec / 60))} dk önce`;
  const dayDiff = istanbulDayDiff(d, n);
  if (dayDiff === 0) return `${Math.floor(diffSec / 3600)} saat önce`;
  if (dayDiff === 1) return `dün ${formatTime(d)}`;
  if (dayDiff < 7) return `${dayDiff} gün önce`;
  return formatDate(d);
}

/** "Bugün", "Yarın", "Dün" or a short date. Useful for duty windows and schedules. */
export function formatDayLabel(input: DateInput, now: DateInput = new Date()): string {
  const diff = istanbulDayDiff(now, input);
  if (diff === 0) return "Bugün";
  if (diff === 1) return "Yarın";
  if (diff === -1) return "Dün";
  return formatDate(input, { month: "long" });
}

/** Truncate with an ellipsis at a word boundary when possible. */
export function truncate(text: string | null | undefined, max: number): string {
  const t = (text ?? "").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Initials for avatars: "Ayşe Kaya" -> "AK". */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toLocaleUpperCase("tr-TR");
}

/** Public name: "Ayşe Kaya" -> "Ayşe K." (used for anonymized display). */
export function shortName(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(" ")} ${parts[parts.length - 1][0].toLocaleUpperCase("tr-TR")}.`;
}
