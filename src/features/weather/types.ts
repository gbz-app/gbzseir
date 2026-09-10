/** 5-day forecast for Gebze (Open-Meteo). Client and server safe. */

export type WeatherNow = {
  temperature: number;
  apparent: number | null;
  code: number;
  isDay: boolean;
  humidity: number | null;
  wind: number | null;
  time: string;
};

export type WeatherDay = {
  /** Istanbul date "YYYY-MM-DD" */
  date: string;
  code: number;
  max: number;
  min: number;
  /** Max precipitation probability (%) */
  rain: number | null;
  /** Max wind (km/s) */
  wind: number | null;
};

export type Forecast = { now: WeatherNow; days: WeatherDay[]; updatedAt: number };
