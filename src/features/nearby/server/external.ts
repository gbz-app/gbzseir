import "server-only";
import { CITY } from "@/config/site";
import { addDaysToKey, istanbulDateKey } from "@/core/time";
import type { PrayerDay, PrayerKey } from "../lib/prayer";

const FETCH_TIMEOUT_MS = 6000;

/** AlAdhan field for each Diyanet vakit (İmsak = Fajr in the Diyanet calendar). */
const ALADHAN_FIELDS: Record<PrayerKey, string> = {
  imsak: "Fajr",
  gunes: "Sunrise",
  ogle: "Dhuhr",
  ikindi: "Asr",
  aksam: "Maghrib",
  yatsi: "Isha",
};

function hhmm(v: unknown): string | null {
  const m = /(\d{1,2}):(\d{2})/.exec(String(v ?? ""));
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}

async function fetchPrayerDay(key: string): Promise<PrayerDay | null> {
  const [y, m, d] = key.split("-");
  const url = `https://api.aladhan.com/v1/timings/${d}-${m}-${y}?latitude=${CITY.center.lat}&longitude=${CITY.center.lng}&method=13`;
  try {
    const res = await fetch(url, { next: { revalidate: 21600, tags: ["prayer-times"] }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { timings?: Record<string, string> } };
    const t = json.data?.timings;
    if (!t) return null;
    const times = {} as Record<PrayerKey, string>;
    for (const [k, field] of Object.entries(ALADHAN_FIELDS) as Array<[PrayerKey, string]>) {
      const v = hhmm(t[field]);
      if (!v) return null;
      times[k] = v;
    }
    return { date: key, times };
  } catch {
    return null;
  }
}

/** Today's and tomorrow's prayer times for Gebze (Istanbul dates). Empty array when the API is down. */
export async function getPrayerDays(): Promise<PrayerDay[]> {
  const today = istanbulDateKey(new Date());
  const days = await Promise.all([fetchPrayerDay(today), fetchPrayerDay(addDaysToKey(today, 1))]);
  return days.filter((d): d is PrayerDay => d !== null);
}

export type CurrentWeather = { temperature: number; code: number; isDay: boolean; time: string };

/** Current weather in Gebze (Open-Meteo), cached for 30 minutes. Null when unavailable. */
export async function getCurrentWeather(): Promise<CurrentWeather | null> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${CITY.center.lat}&longitude=${CITY.center.lng}` +
    `&current=temperature_2m,weather_code,is_day&timezone=Europe%2FIstanbul`;
  try {
    const res = await fetch(url, { next: { revalidate: 1800, tags: ["weather"] }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const json = (await res.json()) as { current?: { temperature_2m?: number; weather_code?: number; is_day?: number; time?: string } };
    const c = json.current;
    if (!c || typeof c.temperature_2m !== "number" || typeof c.weather_code !== "number") return null;
    return { temperature: c.temperature_2m, code: c.weather_code, isDay: c.is_day !== 0, time: c.time ?? "" };
  } catch {
    return null;
  }
}
