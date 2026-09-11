// Seed / re-sync taxi stands (poi.kind = 'taxi') for Gebze from OpenStreetMap (amenity=taxi, ODbL) via Overpass.
// Written through public.poi_sync_apply (upsert on (source, source_ref), neighbourhood = polygon containing the point,
// fallback nearest centre). Taxi stands OSM no longer lists are hidden (never deleted, locked rows untouched).
// Same rules as the monthly sync (src/features/nearby/server/poi-sync.ts).
// Usage: node --env-file=.env.local scripts/db/seed-taxi.mjs [--dry-run]   (--dry-run: print the counts, write nothing)
import { overpass, poiSyncApply, sql, trSlug } from "./lib.mjs";

const DRY_RUN = process.argv.includes("--dry-run");
const OSM_LICENSE = "ODbL - © OpenStreetMap katkıcıları";
const AREA = `area["name"="Gebze"]["boundary"="administrative"]["admin_level"="6"]->.g;`;

/** "+90 262 ..." / "0 (262) ..." -> "+90262..." (Turkish numbers only), else null. */
function phoneE164(raw) {
  const d = String(raw || "").split(/[;,/]/)[0].replace(/\D/g, "");
  const n = d.startsWith("90") ? d.slice(2) : d.startsWith("0") ? d.slice(1) : d;
  return /^[2-5]\d{9}$/.test(n) ? `+90${n}` : null;
}

const osm = await overpass(`[out:json][timeout:120];${AREA}(nwr(area.g)["amenity"="taxi"];);out center tags;`);
if (typeof osm.remark === "string" && /error/i.test(osm.remark)) throw new Error(`Overpass: ${osm.remark}`);
const rows = [];
for (const e of osm.elements || []) {
  const t = e.tags || {};
  const lat = e.lat ?? e.center?.lat;
  const lon = e.lon ?? e.center?.lon;
  if (typeof lat !== "number" || typeof lon !== "number") continue;
  const street = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ");
  rows.push({
    kind: "taxi",
    name: (t.name || "Taksi Durağı").trim(),
    address: street || null,
    phone: phoneE164(t.phone || t["contact:phone"]),
    x: lon,
    y: lat,
    srid: 4326,
    details: {},
    source: "osm",
    source_ref: `${e.type}/${e.id}`,
    license: OSM_LICENSE,
  });
}
console.log(`OSM taxi stands: ${rows.length}`);

const existing = await sql(`select slug, source, source_ref from public.poi`);
const bySrc = new Map(existing.map((r) => [`${r.source}|${r.source_ref}`, r.slug]));
const taken = new Set(existing.map((r) => r.slug));
for (const r of rows) {
  const keep = bySrc.get(`osm|${r.source_ref}`);
  if (keep) {
    r.slug = keep;
    continue;
  }
  const base = `taksi-${trSlug(r.name) || "duragi"}`;
  let s = base;
  let i = 2;
  while (taken.has(s)) s = `${base}-${i++}`;
  taken.add(s);
  r.slug = s;
}

// An empty answer is not a complete list: nothing is hidden then.
await poiSyncApply(rows, rows.length ? [{ source: "osm", kind: "taxi" }] : [], { dryRun: DRY_RUN });
