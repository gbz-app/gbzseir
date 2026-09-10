/**
 * Timezone helpers (pure TS, no React/Next). All "calendar" logic uses Europe/Istanbul.
 * Turkey has been permanently UTC+3 since 2016 (no DST), which istanbulDateTime relies on.
 */

export const TIMEZONE = "Europe/Istanbul";
export const ISTANBUL_UTC_OFFSET = "+03:00";

export type DateInput = Date | string | number;

export function toDate(input: DateInput): Date {
  return input instanceof Date ? input : new Date(input);
}

export function isValidDate(d: Date): boolean {
  return !Number.isNaN(d.getTime());
}

export type IstanbulParts = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday ... 6 = Saturday
};

let partsFormatter: Intl.DateTimeFormat | null = null;
const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function istanbulParts(input: DateInput = new Date()): IstanbulParts {
  partsFormatter ??= new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  });
  const out: Record<string, string> = {};
  for (const p of partsFormatter.formatToParts(toDate(input))) out[p.type] = p.value;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour) % 24,
    minute: Number(out.minute),
    second: Number(out.second),
    weekday: WEEKDAYS[out.weekday] ?? 0,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 'YYYY-MM-DD' of the given instant in Istanbul. */
export function istanbulDateKey(input: DateInput = new Date()): string {
  const p = istanbulParts(input);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Add (or subtract) whole days to a 'YYYY-MM-DD' key. */
export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Instant for a local Istanbul date key + 'HH:mm' time. */
export function istanbulDateTime(key: string, time = "00:00"): Date {
  return new Date(`${key}T${time}:00${ISTANBUL_UTC_OFFSET}`);
}

/** Whole calendar days between two instants, measured in Istanbul (b - a). */
export function istanbulDayDiff(a: DateInput, b: DateInput): number {
  const ka = istanbulDateKey(a);
  const kb = istanbulDateKey(b);
  const ta = Date.UTC(+ka.slice(0, 4), +ka.slice(5, 7) - 1, +ka.slice(8, 10));
  const tb = Date.UTC(+kb.slice(0, 4), +kb.slice(5, 7) - 1, +kb.slice(8, 10));
  return Math.round((tb - ta) / 86_400_000);
}
