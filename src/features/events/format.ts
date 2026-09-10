/** Event date/price helpers (pure TS, Europe/Istanbul). */
import { formatDate, formatPrice, formatTime } from "@/core/format";
import { istanbulDateKey } from "@/core/time";

const dayFmt = new Intl.DateTimeFormat("tr-TR", { day: "numeric", timeZone: "Europe/Istanbul" });
const monthFmt = new Intl.DateTimeFormat("tr-TR", { month: "short", timeZone: "Europe/Istanbul" });

/** Calendar badge parts: { day: "14", month: "Eyl" }. */
export function dateBadge(iso: string): { day: string; month: string } {
  const d = new Date(iso);
  return { day: dayFmt.format(d), month: monthFmt.format(d).replace(".", "") };
}

export function isMultiDay(starts: string, ends: string | null): boolean {
  return !!ends && istanbulDateKey(new Date(starts)) !== istanbulDateKey(new Date(ends));
}

/** "14 Eylül Pazartesi" or "12 Eylül - 14 Eylül" for multi-day events. */
export function eventDateLabel(starts: string, ends: string | null): string {
  if (ends && isMultiDay(starts, ends)) return `${formatDate(starts, { month: "long" })} - ${formatDate(ends, { month: "long" })}`;
  return formatDate(starts, { month: "long", weekday: true });
}

/** "20:30 - 22:30", "20:30" or "Her gün 10:00 - 19:00" (multi-day). */
export function eventTimeLabel(starts: string, ends: string | null): string {
  const s = formatTime(starts);
  if (!ends) return s;
  return isMultiDay(starts, ends) ? `Her gün ${s} - ${formatTime(ends)}` : `${s} - ${formatTime(ends)}`;
}

/** Short one-liner for cards: "14 Eyl Cmt · 20:30" / "12 - 14 Eyl". */
export function eventWhenShort(starts: string, ends: string | null): string {
  if (ends && isMultiDay(starts, ends)) return `${formatDate(starts)} - ${formatDate(ends)}`;
  const weekday = new Intl.DateTimeFormat("tr-TR", { weekday: "short", timeZone: "Europe/Istanbul" }).format(new Date(starts));
  return `${formatDate(starts)} ${weekday} · ${formatTime(starts)}`;
}

export function eventPriceLabel(e: { is_free: boolean; price_try: number | null }): string {
  if (e.is_free) return "Ücretsiz";
  return e.price_try != null ? formatPrice(e.price_try) : "Ücretli";
}

/** Istanbul day keys ("YYYY-MM-DD") an event covers, as [first, last]. */
export function eventDayRange(starts: string, ends: string | null): [string, string] {
  const first = istanbulDateKey(new Date(starts));
  return [first, ends ? istanbulDateKey(new Date(ends)) : first];
}
