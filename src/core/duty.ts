/**
 * Pharmacy duty ("nöbet") rules (pure TS).
 * The duty day switches at 08:30 Europe/Istanbul: at 07:00 on 11 Sept the active duty day is still 10 Sept.
 * An expired duty window must NEVER be shown.
 */
import { formatDayLabel, formatTime } from "./format";
import { addDaysToKey, istanbulDateKey, istanbulDateTime, istanbulParts, toDate, type DateInput } from "./time";

export const DUTY_SWITCH_TIME = "08:30";
const SWITCH_MINUTES = 8 * 60 + 30;

/** Duty day ('YYYY-MM-DD') that is active at the given instant. */
export function dutyDayFor(input: DateInput = new Date()): string {
  const d = toDate(input);
  const p = istanbulParts(d);
  const key = istanbulDateKey(d);
  return p.hour * 60 + p.minute < SWITCH_MINUTES ? addDaysToKey(key, -1) : key;
}

export type DutyWindow = { start: Date; end: Date };

/** Standard window of a duty day: day 08:30 -> next day 08:30 (Istanbul). */
export function dutyWindowFor(dutyDay: string): DutyWindow {
  return {
    start: istanbulDateTime(dutyDay, DUTY_SWITCH_TIME),
    end: istanbulDateTime(addDaysToKey(dutyDay, 1), DUTY_SWITCH_TIME),
  };
}

/** Window active right now. */
export function currentDutyWindow(now: DateInput = new Date()): DutyWindow {
  return dutyWindowFor(dutyDayFor(now));
}

/** Next moment the duty list changes. */
export function nextDutySwitch(now: DateInput = new Date()): Date {
  return currentDutyWindow(now).end;
}

/** True when now ∈ [start, end). Use for every duty row before rendering it. */
export function isDutyActive(start: DateInput, end: DateInput, now: DateInput = new Date()): boolean {
  const t = toDate(now).getTime();
  const s = toDate(start).getTime();
  const e = toDate(end).getTime();
  if (Number.isNaN(s) || Number.isNaN(e)) return false;
  return s <= t && t < e;
}

/** Filter rows to the ones whose duty window is active now. */
export function filterActiveDuties<T>(rows: T[], getWindow: (row: T) => { start: DateInput; end: DateInput }, now: DateInput = new Date()): T[] {
  return rows.filter((r) => {
    const w = getWindow(r);
    return isDutyActive(w.start, w.end, now);
  });
}

/** Human label: "Bugün 08:30 - Yarın 08:30". */
export function describeDutyWindow(window: { start: DateInput; end: DateInput }, now: DateInput = new Date()): string {
  return `${formatDayLabel(window.start, now)} ${formatTime(window.start)} - ${formatDayLabel(window.end, now)} ${formatTime(window.end)}`;
}
