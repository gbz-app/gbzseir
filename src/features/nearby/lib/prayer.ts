/**
 * Prayer times (Diyanet method via AlAdhan, method=13). Pure helpers shared by server and client.
 * Diyanet "İmsak" is the Fajr time (AlAdhan's own "Imsak" is Fajr - 10 min, which Diyanet does not use).
 */
import { istanbulDateKey, istanbulDateTime, addDaysToKey } from "@/core/time";

export const PRAYER_KEYS = ["imsak", "gunes", "ogle", "ikindi", "aksam", "yatsi"] as const;
export type PrayerKey = (typeof PRAYER_KEYS)[number];

export const PRAYER_LABELS: Record<PrayerKey, string> = {
  imsak: "İmsak",
  gunes: "Güneş",
  ogle: "Öğle",
  ikindi: "İkindi",
  aksam: "Akşam",
  yatsi: "Yatsı",
};

/** One day of prayer times. `date` is 'YYYY-MM-DD' (Istanbul); times are 'HH:MM'. */
export type PrayerDay = { date: string; times: Record<PrayerKey, string> };

export const PRAYER_METHOD_NOTE = "Diyanet yöntemiyle hesaplanmıştır";

export type NextPrayer = { key: PrayerKey; label: string; time: string; at: number; date: string; isTomorrow: boolean };

function instant(day: PrayerDay, key: PrayerKey): number {
  return istanbulDateTime(day.date, day.times[key]).getTime();
}

/** Today's row (Istanbul date of `now`) or null. */
export function prayerDayFor(days: PrayerDay[], now: number): PrayerDay | null {
  const key = istanbulDateKey(now);
  return days.find((d) => d.date === key) ?? null;
}

/** Next prayer time after `now` (today, or tomorrow's İmsak after Yatsı). */
export function nextPrayer(days: PrayerDay[], now: number): NextPrayer | null {
  const todayKey = istanbulDateKey(now);
  const ordered = [...days].filter((d) => d.date >= todayKey).sort((a, b) => a.date.localeCompare(b.date));
  for (const day of ordered) {
    for (const key of PRAYER_KEYS) {
      const at = instant(day, key);
      if (at > now) {
        return { key, label: PRAYER_LABELS[key], time: day.times[key], at, date: day.date, isTomorrow: day.date === addDaysToKey(todayKey, 1) };
      }
    }
  }
  return null;
}

/** Key of the prayer time whose period we are in right now (for highlighting), or null before İmsak. */
export function currentPrayerKey(day: PrayerDay | null, now: number): PrayerKey | null {
  if (!day) return null;
  let cur: PrayerKey | null = null;
  for (const key of PRAYER_KEYS) if (instant(day, key) <= now) cur = key;
  return cur;
}

/** "1 sa 12 dk", "12 dk", "45 sn". */
export function formatCountdown(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "şimdi";
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec} sn`;
  const totalMin = Math.ceil(totalSec / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} dk`;
  return m === 0 ? `${h} sa` : `${h} sa ${m} dk`;
}

/** "Akşam vaktine" / "Güneş doğuşuna". */
export function countdownLead(key: PrayerKey): string {
  return key === "gunes" ? "Güneş doğuşuna" : `${PRAYER_LABELS[key]} vaktine`;
}
