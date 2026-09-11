/**
 * Splits duty rows into "now" and "next" lists at render time (never trust cached HTML for this).
 */
import { describeDutyWindow, dutyDayFor, dutyWindowFor, filterActiveDuties, type DutyWindow } from "@/core/duty";
import { distanceMeters, type LatLng } from "@/core/geo";
import { addDaysToKey, istanbulDateKey } from "@/core/time";
import { trCompare } from "@/core/tr";

type DutyLike = { duty_start: string; duty_end: string; name: string; district_name?: string | null; lat: number; lng: number };

export type DutyView<T> = {
  current: T[];
  next: T[];
  currentWindow: DutyWindow;
  nextWindow: DutyWindow;
  /** Between 00:00 and 08:30 the active duty day is still "yesterday". */
  afterMidnight: boolean;
  currentLabel: string;
  nextLabel: string;
  currentText: string;
  nextText: string;
};

export function buildDutyView<T extends DutyLike>(rows: T[], now: number): DutyView<T> {
  const day = dutyDayFor(now);
  const currentWindow = dutyWindowFor(day);
  const nextWindow = dutyWindowFor(addDaysToKey(day, 1));
  const current = filterActiveDuties(rows, (r) => ({ start: r.duty_start, end: r.duty_end }), now);
  const nextStart = currentWindow.end.getTime() - 60_000;
  const nextEnd = nextWindow.end.getTime();
  const next = rows.filter((r) => {
    const s = new Date(r.duty_start).getTime();
    return s >= nextStart && s < nextEnd;
  });
  const afterMidnight = day !== istanbulDateKey(now);
  return {
    current,
    next,
    currentWindow,
    nextWindow,
    afterMidnight,
    currentLabel: afterMidnight ? "Şu an" : "Bugün",
    nextLabel: afterMidnight ? "08:30'dan sonra" : "Yarın",
    currentText: describeDutyWindow(currentWindow, now),
    nextText: describeDutyWindow(nextWindow, now),
  };
}

/** Nearest first when a point is known, otherwise by district then name (Turkish collation). */
export function sortDutyRows<T extends DutyLike>(rows: T[], point: LatLng | null): Array<T & { distance: number | null }> {
  const withDistance = rows.map((r) => ({ ...r, distance: point ? distanceMeters(point, { lat: r.lat, lng: r.lng }) : null }));
  if (point) return withDistance.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
  return withDistance.sort((a, b) => trCompare(a.district_name ?? "", b.district_name ?? "") || trCompare(a.name, b.name));
}
