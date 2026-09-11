/** Event date/price helpers (pure TS, Europe/Istanbul). */
import { formatDate, formatPrice, formatTime } from "@/core/format";
import { addDaysToKey, istanbulDateKey, istanbulDayDiff, istanbulParts } from "@/core/time";

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

const weekdayFmt = new Intl.DateTimeFormat("tr-TR", { weekday: "long", timeZone: "Europe/Istanbul" });

/** "Cumartesi" (Istanbul). */
export function weekdayName(iso: string): string {
  return weekdayFmt.format(new Date(iso));
}

/** "Bugün" / "Yarın" when the instant falls on today / tomorrow in Istanbul, else null. */
export function relativeDayWord(iso: string, now: Date): string | null {
  const diff = istanbulDayDiff(now, iso);
  if (diff === 0) return "Bugün";
  if (diff === 1) return "Yarın";
  return null;
}

/**
 * Second line of the event cards: "Cumartesi · 20:00", "12 Eyl - 14 Eyl · 10:00" (multi-day). With `now` (client,
 * after mount) it becomes "Bugün · 20:00" / "Yarın · 20:00", and a multi-day event that has begun "Devam ediyor".
 * Without `now` the text depends on the event alone, so server and client HTML always match.
 */
export function eventWhenLine(starts: string, ends: string | null, now?: Date | null): string {
  if (ends && isMultiDay(starts, ends)) {
    if (now && new Date(starts).getTime() <= now.getTime()) return `Devam ediyor · son gün ${formatDate(ends)}`;
    return `${formatDate(starts)} - ${formatDate(ends)} · ${formatTime(starts)}`;
  }
  const day = (now ? relativeDayWord(starts, now) : null) ?? weekdayName(starts);
  return `${day} · ${formatTime(starts)}`;
}

/**
 * Date row of the event page: { day: "Cumartesi, 14 Eylül" | "Bugün, 14 Eylül", time: "20:00 - 22:30" }.
 * Multi-day: { day: "12 Eylül Cuma - 14 Eylül Pazar", time: "Her gün 10:00 - 19:00" }.
 */
export function eventDateParts(starts: string, ends: string | null, now?: Date | null): { day: string; time: string } {
  if (ends && isMultiDay(starts, ends)) {
    return { day: `${formatDate(starts, { month: "long", weekday: true })} - ${formatDate(ends, { month: "long", weekday: true })}`, time: eventTimeLabel(starts, ends) };
  }
  const word = (now ? relativeDayWord(starts, now) : null) ?? weekdayName(starts);
  return { day: `${word}, ${formatDate(starts, { month: "long" })}`, time: eventTimeLabel(starts, ends) };
}

export type EventWhen = "today" | "weekend" | "week";

/**
 * Istanbul day window [from, to] of a quick date filter: today; this weekend (Saturday + Sunday, on Sunday only
 * today); this week (today through Sunday).
 */
export function eventDayWindow(when: EventWhen, now: Date): [string, string] {
  const today = istanbulDateKey(now);
  if (when === "today") return [today, today];
  const wd = istanbulParts(now).weekday; // 0 = Sunday
  const toSunday = wd === 0 ? 0 : 7 - wd;
  const sunday = addDaysToKey(today, toSunday);
  if (when === "week") return [today, sunday];
  return [wd === 0 ? today : addDaysToKey(today, Math.max(0, 6 - wd)), sunday];
}

/** True when the event's days overlap the [from, to] window. */
export function eventInWindow(starts: string, ends: string | null, [from, to]: [string, string]): boolean {
  const [first, last] = eventDayRange(starts, ends);
  return first <= to && last >= from;
}
