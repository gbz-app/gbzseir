import "server-only";
import { CITY } from "@/config/site";
import type { Forecast, WeatherDay } from "./types";

type OpenMeteo = {
  current?: {
    time?: string;
    temperature_2m?: number;
    apparent_temperature?: number;
    weather_code?: number;
    is_day?: number;
    relative_humidity_2m?: number;
    wind_speed_10m?: number;
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: Array<number | null>;
    wind_speed_10m_max?: Array<number | null>;
  };
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Current weather + 5 days for Gebze, cached 30 minutes. Throws when unavailable. */
export async function getForecast(): Promise<Forecast> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${CITY.center.lat}&longitude=${CITY.center.lng}` +
    "&current=temperature_2m,apparent_temperature,weather_code,is_day,relative_humidity_2m,wind_speed_10m" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max" +
    "&timezone=Europe%2FIstanbul&forecast_days=5";
  const res = await fetch(url, { next: { revalidate: 1800, tags: ["weather"] }, signal: AbortSignal.timeout(7000) });
  if (!res.ok) throw new Error(`open-meteo ${res.status}`);
  const json = (await res.json()) as OpenMeteo;
  const c = json.current;
  const d = json.daily;
  if (!c || num(c.temperature_2m) === null || num(c.weather_code) === null || !d?.time?.length) throw new Error("open-meteo: empty");

  const days: WeatherDay[] = d.time.flatMap((date, i) => {
    const max = num(d.temperature_2m_max?.[i]);
    const min = num(d.temperature_2m_min?.[i]);
    const code = num(d.weather_code?.[i]);
    if (max === null || min === null || code === null) return [];
    return [{ date, code, max, min, rain: num(d.precipitation_probability_max?.[i]), wind: num(d.wind_speed_10m_max?.[i]) }];
  });

  return {
    now: {
      temperature: c.temperature_2m!,
      apparent: num(c.apparent_temperature),
      code: c.weather_code!,
      isDay: c.is_day !== 0,
      humidity: num(c.relative_humidity_2m),
      wind: num(c.wind_speed_10m),
      time: c.time ?? "",
    },
    days,
    updatedAt: Date.now(),
  };
}
