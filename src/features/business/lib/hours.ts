/**
 * Working hours helpers (pure TS).
 * businesses.working_hours = {"mon":{"open":"09:00","close":"18:00"}, ..., "sun": null}; null/missing = closed.
 * A window whose close time is not after its open time runs past midnight (e.g. 18:00 - 02:00).
 * Every "now" calculation uses Europe/Istanbul.
 */
import { istanbulParts } from "@/core/time";

export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayKey = (typeof DAY_KEYS)[number];
export type DayHours = { open: string; close: string } | null;
export type WorkingHours = Record<DayKey, DayHours>;

export const DAY_LABELS: Record<DayKey, string> = {
  mon: "Pazartesi",
  tue: "Salı",
  wed: "Çarşamba",
  thu: "Perşembe",
  fri: "Cuma",
  sat: "Cumartesi",
  sun: "Pazar",
};

export const DAY_SHORT_LABELS: Record<DayKey, string> = {
  mon: "Pzt",
  tue: "Sal",
  wed: "Çar",
  thu: "Per",
  fri: "Cum",
  sat: "Cmt",
  sun: "Paz",
};

const SCHEMA_DAYS: Record<DayKey, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

/** JS weekday (0 = Sunday) -> key. */
const WEEKDAY_TO_KEY: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(value: unknown): value is string {
  return typeof value === "string" && TIME_RE.test(value);
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function emptyHours(): WorkingHours {
  return { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null };
}

/** Typical Gebze shop hours: weekdays 09:00-18:00, Saturday 09:00-14:00, Sunday closed. */
export function defaultHours(): WorkingHours {
  const weekday = () => ({ open: "09:00", close: "18:00" });
  return { mon: weekday(), tue: weekday(), wed: weekday(), thu: weekday(), fri: weekday(), sat: { open: "09:00", close: "14:00" }, sun: null };
}

/** Parse the jsonb column defensively (invalid days become closed). */
export function parseWorkingHours(value: unknown): WorkingHours {
  const out = emptyHours();
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  const record = value as Record<string, unknown>;
  for (const key of DAY_KEYS) {
    const day = record[key];
    if (!day || typeof day !== "object" || Array.isArray(day)) continue;
    const { open, close } = day as Record<string, unknown>;
    if (isValidTime(open) && isValidTime(close) && open !== close) out[key] = { open, close };
  }
  return out;
}

export function hasAnyHours(hours: WorkingHours): boolean {
  return DAY_KEYS.some((k) => hours[k] !== null);
}

/** Turkish validation message or null. */
export function validateHours(hours: WorkingHours): string | null {
  for (const key of DAY_KEYS) {
    const day = hours[key];
    if (!day) continue;
    if (!isValidTime(day.open) || !isValidTime(day.close)) return `${DAY_LABELS[key]} için geçerli bir saat seç.`;
    if (day.open === day.close) return `${DAY_LABELS[key]} için açılış ve kapanış saati farklı olmalı.`;
  }
  return null;
}

/** JSON value for businesses.working_hours (all seven keys, closed days as null). */
export function hoursToJson(hours: WorkingHours): { [K in DayKey]: { open: string; close: string } | null } {
  const out = emptyHours();
  for (const key of DAY_KEYS) {
    const day = hours[key];
    out[key] = day ? { open: day.open, close: day.close } : null;
  }
  return out;
}

export function formatDayHours(day: DayHours): string {
  return day ? `${day.open} - ${day.close}` : "Kapalı";
}

/** Compact weekly summary grouping consecutive equal days: ["Pzt - Cum: 09:00 - 18:00", "Cmt: 09:00 - 14:00", "Paz: Kapalı"]. */
export function summarizeHours(hours: WorkingHours): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < DAY_KEYS.length) {
    const label = formatDayHours(hours[DAY_KEYS[i]]);
    let j = i;
    while (j + 1 < DAY_KEYS.length && formatDayHours(hours[DAY_KEYS[j + 1]]) === label) j++;
    const days = i === j ? DAY_SHORT_LABELS[DAY_KEYS[i]] : `${DAY_SHORT_LABELS[DAY_KEYS[i]]} - ${DAY_SHORT_LABELS[DAY_KEYS[j]]}`;
    out.push(`${days}: ${label}`);
    i = j + 1;
  }
  return out;
}

/** Key of the Istanbul weekday of `date`. */
export function dayKeyOf(date: Date = new Date()): DayKey {
  return WEEKDAY_TO_KEY[istanbulParts(date).weekday];
}

function shiftKey(key: DayKey, delta: number): DayKey {
  const i = DAY_KEYS.indexOf(key);
  return DAY_KEYS[(i + delta + 7 * 2) % 7];
}

export type OpenStatus =
  | { known: false }
  | { known: true; open: true; closesAt: string }
  | { known: true; open: false; opensAt: string | null; opensDayLabel: string | null };

/** Open/closed at `date` (Istanbul) with the next change. `known: false` when no hours are set at all. */
export function openStatusAt(hours: WorkingHours, date: Date = new Date()): OpenStatus {
  if (!hasAnyHours(hours)) return { known: false };
  const p = istanbulParts(date);
  const now = p.hour * 60 + p.minute;
  const todayKey = WEEKDAY_TO_KEY[p.weekday];

  const today = hours[todayKey];
  if (today) {
    const o = toMinutes(today.open);
    const c = toMinutes(today.close);
    if (c > o ? now >= o && now < c : now >= o) return { known: true, open: true, closesAt: today.close };
  }
  const yesterday = hours[shiftKey(todayKey, -1)];
  if (yesterday) {
    const o = toMinutes(yesterday.open);
    const c = toMinutes(yesterday.close);
    if (c <= o && now < c) return { known: true, open: true, closesAt: yesterday.close };
  }

  // Closed: find the next opening within a week.
  if (today && now < toMinutes(today.open)) return { known: true, open: false, opensAt: today.open, opensDayLabel: "Bugün" };
  for (let d = 1; d <= 7; d++) {
    const key = shiftKey(todayKey, d);
    const day = hours[key];
    if (day) return { known: true, open: false, opensAt: day.open, opensDayLabel: d === 1 ? "Yarın" : DAY_LABELS[key] };
  }
  return { known: true, open: false, opensAt: null, opensDayLabel: null };
}

/** Short Turkish status line: "Kapanış 18:00" / "Açılış: Yarın 09:00". */
export function describeOpenStatus(status: OpenStatus): string | null {
  if (!status.known) return null;
  if (status.open) return `Kapanış ${status.closesAt}`;
  if (!status.opensAt) return null;
  return status.opensDayLabel === "Bugün" ? `Açılış ${status.opensAt}` : `Açılış: ${status.opensDayLabel} ${status.opensAt}`;
}

/** schema.org OpeningHoursSpecification list for JSON-LD. */
export function openingHoursSpecification(hours: WorkingHours): Array<Record<string, string>> {
  return DAY_KEYS.flatMap((key) => {
    const day = hours[key];
    return day ? [{ "@type": "OpeningHoursSpecification", dayOfWeek: `https://schema.org/${SCHEMA_DAYS[key]}`, opens: day.open, closes: day.close }] : [];
  });
}
