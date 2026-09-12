#!/usr/bin/env node
/**
 * Builds the bus timetable served to the app from the Kocaeli GTFS:
 * - public/transit/stop-times/<n>.json (n = Number(stop_id) % 128): per stop, service_id -> line (route_short_name) ->
 *   departure minutes after midnight, sorted, de-duplicated and delta-encoded ([first, +gap, +gap, ...]). Times past
 *   24:00 keep their value (24:30 = 1470): they belong to the previous service day.
 * - public/transit/stop-times/stops.json: position of every GTFS stop that has times, for stop rows without a GTFS
 *   stop_id (older OpenStreetMap stops; the app takes the nearest one within a few dozen metres).
 * - public/transit/stop-times/meta.json: build date, services, source.
 * stop_times.txt is not in the repo (about 100 MB): pass its path. trips.txt, routes.txt and stops.txt come from
 * kocaeli/toplu-ulasim (git-ignored raw data). calendar.txt is empty, so the app reads the three services by their trip
 * counts: 1 = hafta içi, 2 = cumartesi, 3 = pazar (src/features/nearby/lib/stop-times.ts). Stop ids match
 * poi.details.stop_id (scripts/db/import-kocaeli.mjs).
 *
 *   node scripts/transit/build-stop-times.mjs --stop-times <path/to/stop_times.txt> [--gtfs kocaeli/toplu-ulasim]
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const SHARDS = 128;
const OUT_DIR = "public/transit/stop-times";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const stopTimesPath = arg("--stop-times");
const gtfsDir = arg("--gtfs", "kocaeli/toplu-ulasim");
if (!stopTimesPath || !fs.existsSync(stopTimesPath)) {
  console.error("Kullanım: node scripts/transit/build-stop-times.mjs --stop-times <stop_times.txt> [--gtfs <klasör>]");
  process.exit(1);
}

/** One CSV line (RFC 4180 quotes: "a, b" and "" inside quotes). */
function splitCsv(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function readCsv(file) {
  const [head, ...lines] = fs.readFileSync(path.join(gtfsDir, file), "utf8").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
  const cols = splitCsv(head);
  return lines.map((l) => {
    const v = splitCsv(l);
    return Object.fromEntries(cols.map((c, i) => [c, v[i]]));
  });
}

const lineOfRoute = new Map(readCsv("routes.txt").map((r) => [r.route_id, (r.route_short_name ?? "").trim()]));
const tripInfo = new Map(readCsv("trips.txt").map((t) => [t.trip_id, { line: lineOfRoute.get(t.route_id) ?? "", svc: t.service_id }]));
const stopPos = new Map(readCsv("stops.txt").map((s) => [s.stop_id, [Number(s.stop_lat), Number(s.stop_lon)]]));

/** stop_id -> service_id -> line -> Set(minutes) */
const stops = new Map();
let head = null;
let col = null;
let rows = 0;
let skipped = 0;
const rl = readline.createInterface({ input: fs.createReadStream(stopTimesPath, "utf8"), crlfDelay: Infinity });
for await (const raw of rl) {
  if (!head) {
    head = splitCsv(raw.replace(/^﻿/, ""));
    col = { trip: head.indexOf("trip_id"), dep: head.indexOf("departure_time"), arr: head.indexOf("arrival_time"), stop: head.indexOf("stop_id") };
    continue;
  }
  if (!raw) continue;
  const v = raw.split(",");
  const trip = tripInfo.get(v[col.trip]);
  const m = /^(\d{1,2}):(\d{2})/.exec(v[col.dep] || v[col.arr] || "");
  const stopId = v[col.stop];
  if (!trip || !trip.line || !m || !stopId) {
    skipped++;
    continue;
  }
  rows++;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  let byService = stops.get(stopId);
  if (!byService) stops.set(stopId, (byService = {}));
  const byLine = (byService[trip.svc] ??= {});
  (byLine[trip.line] ??= new Set()).add(minutes);
}

const byName = (a, b) => a.localeCompare(b, "tr", { numeric: true });
function encode(byService) {
  const out = {};
  for (const svc of Object.keys(byService).sort()) {
    out[svc] = {};
    for (const line of Object.keys(byService[svc]).sort(byName)) {
      const sorted = [...byService[svc][line]].sort((a, b) => a - b);
      out[svc][line] = sorted.map((x, i) => (i ? x - sorted[i - 1] : x));
    }
  }
  return out;
}

const shards = Array.from({ length: SHARDS }, () => ({}));
const positions = {};
for (const id of [...stops.keys()].sort(byName)) {
  const n = Number(id);
  if (!Number.isInteger(n)) continue;
  shards[n % SHARDS][id] = encode(stops.get(id));
  const p = stopPos.get(id);
  if (p && Number.isFinite(p[0]) && Number.isFinite(p[1])) positions[id] = [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5];
}

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });
let bytes = 0;
shards.forEach((s, i) => {
  const json = JSON.stringify({ v: 1, stops: s });
  bytes += json.length;
  fs.writeFileSync(path.join(OUT_DIR, `${i}.json`), json);
});
const index = JSON.stringify({ v: 1, stops: positions });
fs.writeFileSync(path.join(OUT_DIR, "stops.json"), index);
const meta = {
  v: 1,
  shards: SHARDS,
  generatedAt: new Date().toISOString().slice(0, 10),
  services: { 1: "hafta içi", 2: "cumartesi", 3: "pazar" },
  source: "Kocaeli Büyükşehir Belediyesi toplu ulaşım verisi (GTFS)",
};
fs.writeFileSync(path.join(OUT_DIR, "meta.json"), JSON.stringify(meta));
console.log(
  `duraklar ${stops.size} (konumlu ${Object.keys(positions).length}), satır ${rows} (atlanan ${skipped}), ${SHARDS} dosya ${(bytes / 1024).toFixed(0)} KB, stops.json ${(index.length / 1024).toFixed(0)} KB -> ${OUT_DIR}`,
);
