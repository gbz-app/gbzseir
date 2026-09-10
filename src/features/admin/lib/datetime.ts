/**
 * <input type="datetime-local"> helpers. The admin always edits times in Europe/Istanbul (UTC+3, no DST),
 * whatever the browser timezone is.
 */
import { istanbulDateKey, istanbulDateTime, istanbulParts } from "@/core/time";

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO instant -> 'YYYY-MM-DDTHH:mm' in Istanbul ('' for empty/invalid). */
export function isoToIstanbulInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = istanbulParts(d);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** 'YYYY-MM-DDTHH:mm' (Istanbul) -> ISO instant (null for empty/invalid). */
export function istanbulInputToIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!m) return null;
  const d = istanbulDateTime(m[1], m[2]);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Start of the current Istanbul day as an ISO instant (for "bugün" counters). */
export function istanbulTodayStartIso(now: Date = new Date()): string {
  return istanbulDateTime(istanbulDateKey(now)).toISOString();
}
