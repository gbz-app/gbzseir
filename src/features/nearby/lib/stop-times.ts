/**
 * Bus timetable of a stop, from the static files built by scripts/transit/build-stop-times.mjs:
 * - /transit/stop-times/<n>.json (n = stop_id % 128): service -> line -> delta-encoded departure minutes per stop;
 * - /transit/stop-times/stops.json: GTFS stop positions, for stop rows without a GTFS stop_id (older OpenStreetMap
 *   stops): the nearest GTFS stop within MATCH_M metres is used.
 * Services: 1 = hafta içi, 2 = cumartesi, 3 = pazar (the feed's calendar.txt is empty; read from the trip counts).
 * Times past 24:00 belong to the previous service day. This is the planned timetable, not live vehicle positions.
 * Browser only (fetch + React hook); the files are not cached by the service worker.
 */
import * as React from "react";
import { distanceMeters, type LatLng } from "@/core/geo";
import { istanbulParts } from "@/core/time";
import { useNow } from "./use-now";

const BASE = "/transit/stop-times";
const SHARDS = 128;
const MATCH_M = 60;

type Encoded = Record<string, Record<string, number[]>>;
/** service -> line -> departure minutes after midnight (absolute, sorted). */
export type Timetable = Record<string, Record<string, number[]>>;
export type Departure = { line: string; /** Minutes after today's midnight (Istanbul). */ minutes: number; /** Minutes from now. */ inMin: number };
export type ServiceKey = "1" | "2" | "3";

export const SERVICE_LABEL: Record<ServiceKey, string> = { 1: "hafta içi", 2: "cumartesi", 3: "pazar" };

const shards = new Map<number, Promise<Record<string, Encoded>>>();
let positions: Promise<Record<string, [number, number]>> | null = null;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

function loadShard(n: number): Promise<Record<string, Encoded>> {
  let p = shards.get(n);
  if (!p) {
    p = getJson<{ stops?: Record<string, Encoded> }>(`${BASE}/${n}.json`).then((j) => j.stops ?? {});
    p.catch(() => shards.delete(n));
    shards.set(n, p);
  }
  return p;
}

async function nearestStopId(point: LatLng): Promise<string | null> {
  if (!positions) {
    positions = getJson<{ stops?: Record<string, [number, number]> }>(`${BASE}/stops.json`).then((j) => j.stops ?? {});
    positions.catch(() => {
      positions = null;
    });
  }
  let best: string | null = null;
  let bestD = MATCH_M;
  for (const [id, [lat, lng]] of Object.entries(await positions)) {
    // About 110 m of latitude / 85 m of longitude here: a cheap box before the exact distance.
    if (Math.abs(lat - point.lat) > 0.001 || Math.abs(lng - point.lng) > 0.0013) continue;
    const d = distanceMeters(point, { lat, lng });
    if (d <= bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

/** The stop's timetable by its GTFS stop_id, else by the nearest GTFS stop to `point`; null when there is none. */
export async function loadTimetable(stopId: string | null, point: LatLng | null): Promise<Timetable | null> {
  const id = stopId && /^\d+$/.test(stopId) ? stopId : point ? await nearestStopId(point) : null;
  if (!id) return null;
  const enc = (await loadShard(Number(id) % SHARDS))[id];
  if (!enc) return null;
  const out: Timetable = {};
  for (const [svc, byLine] of Object.entries(enc)) {
    out[svc] = {};
    for (const [line, deltas] of Object.entries(byLine)) {
      let t = 0;
      out[svc][line] = deltas.map((d) => (t += d));
    }
  }
  return out;
}

/** Service of an Istanbul weekday (0 = Sunday). */
export function serviceFor(weekday: number): ServiceKey {
  return weekday === 0 ? "3" : weekday === 6 ? "2" : "1";
}

/** Next departures from `now`, soonest first: today's service, plus yesterday's trips running past midnight. */
export function upcomingDepartures(tt: Timetable, now: number, limit: number): Departure[] {
  const p = istanbulParts(now);
  const nowMin = p.hour * 60 + p.minute;
  const out: Departure[] = [];
  for (const [line, mins] of Object.entries(tt[serviceFor(p.weekday)] ?? {})) {
    for (const m of mins) if (m >= nowMin) out.push({ line, minutes: m, inMin: m - nowMin });
  }
  for (const [line, mins] of Object.entries(tt[serviceFor((p.weekday + 6) % 7)] ?? {})) {
    for (const m of mins) if (m >= 1440 && m - 1440 >= nowMin) out.push({ line, minutes: m - 1440, inMin: m - 1440 - nowMin });
  }
  out.sort((a, b) => a.inMin - b.inMin || a.line.localeCompare(b.line, "tr-TR", { numeric: true }));
  return out.slice(0, limit);
}

/** Every line of the timetable, in number order. */
export function timetableLines(tt: Timetable): string[] {
  const set = new Set<string>();
  for (const byLine of Object.values(tt)) for (const line of Object.keys(byLine)) set.add(line);
  return [...set].sort((a, b) => a.localeCompare(b, "tr-TR", { numeric: true }));
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 14:05 for minutes after midnight (past 24:00 wraps). */
export function formatClock(minutes: number): string {
  return `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
}

/** "Şimdi", "4 dk", then the clock from an hour on. */
export function formatWait(d: Departure): string {
  if (d.inMin < 1) return "Şimdi";
  return d.inMin < 60 ? `${d.inMin} dk` : formatClock(d.minutes);
}

export type StopTimes = { status: "loading" | "ready" | "none"; lines: string[]; upcoming: Departure[]; service: ServiceKey | null };

/** Timetable of a stop (GTFS stop_id, else its position) and the next `limit` departures, refreshed as time passes. */
export function useStopTimes(stopId: string | null, lat: number | null, lng: number | null, limit: number): StopTimes {
  const now = useNow();
  const key = `${stopId ?? ""}|${lat ?? ""}|${lng ?? ""}`;
  const [state, setState] = React.useState<{ key: string; tt: Timetable | null } | null>(null);

  React.useEffect(() => {
    let alive = true;
    const point = typeof lat === "number" && typeof lng === "number" ? { lat, lng } : null;
    loadTimetable(stopId, point)
      .then((tt) => alive && setState({ key, tt }))
      .catch(() => alive && setState({ key, tt: null }));
    return () => {
      alive = false;
    };
  }, [key, stopId, lat, lng]);

  const tt = state?.key === key ? state.tt : undefined;
  const minute = now ? Math.floor(now / 60_000) : 0;
  const upcoming = React.useMemo(() => (tt && minute ? upcomingDepartures(tt, minute * 60_000, limit) : []), [tt, minute, limit]);
  const lines = React.useMemo(() => (tt ? timetableLines(tt) : []), [tt]);
  if (tt === undefined) return { status: "loading", lines: [], upcoming: [], service: null };
  if (!tt) return { status: "none", lines: [], upcoming: [], service: null };
  return { status: "ready", lines, upcoming, service: minute ? serviceFor(istanbulParts(minute * 60_000).weekday) : null };
}
