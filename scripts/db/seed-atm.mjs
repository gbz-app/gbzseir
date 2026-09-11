// Seed / re-sync ATMs (poi.kind = 'atm') for Gebze from OpenStreetMap (amenity=atm, ODbL) via Overpass.
// Written through public.poi_sync_apply (upsert on (source, source_ref), neighbourhood = polygon containing the point,
// fallback nearest centre; the stored phone is kept). ATMs OSM no longer lists are hidden (never deleted, locked rows
// untouched). Same rules as the monthly sync (src/features/nearby/server/poi-sync.ts).
// Usage: node --env-file=.env.local scripts/db/seed-atm.mjs [--dry-run]   (--dry-run: print the counts, write nothing)
import { overpass, poiSyncApply, sql, trSlug } from "./lib.mjs";

const DRY_RUN = process.argv.includes("--dry-run");
const OSM_LICENSE = "ODbL - © OpenStreetMap katkıcıları";
const AREA = `area["name"="Gebze"]["boundary"="administrative"]["admin_level"="6"]->.g;`;

/** tags.name, else "<operator|brand> ATM" (no double "ATM"), else "ATM". */
function atmName(t) {
  if (t.name?.trim()) return t.name.trim();
  const bank = (t.operator || t.brand || "").trim();
  if (!bank) return "ATM";
  return /\batm\b/i.test(bank) ? bank : `${bank} ATM`;
}

const osm = await overpass(`[out:json][timeout:120];${AREA}(nwr(area.g)["amenity"="atm"];);out center tags;`);
if (typeof osm.remark === "string" && /error/i.test(osm.remark)) throw new Error(`Overpass: ${osm.remark}`);
const rows = [];
for (const e of osm.elements || []) {
  const t = e.tags || {};
  const lat = e.lat ?? e.center?.lat;
  const lon = e.lon ?? e.center?.lon;
  if (typeof lat !== "number" || typeof lon !== "number") continue;
  const street = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ");
  // No "phone" key: OSM ATMs have no phone, the stored one stays.
  rows.push({
    kind: "atm",
    name: atmName(t),
    address: street || null,
    x: lon,
    y: lat,
    srid: 4326,
    details: {},
    source: "osm",
    source_ref: `${e.type}/${e.id}`,
    license: OSM_LICENSE,
  });
}
console.log(`OSM ATMs: ${rows.length}`);

const existing = await sql(`select slug, source, source_ref from public.poi`);
const bySrc = new Map(existing.map((r) => [`${r.source}|${r.source_ref}`, r.slug]));
const taken = new Set(existing.map((r) => r.slug));
for (const r of rows) {
  const keep = bySrc.get(`osm|${r.source_ref}`);
  if (keep) {
    r.slug = keep;
    continue;
  }
  // "Ziraat Bankası ATM" -> "atm-ziraat-bankasi"; a bare "ATM" -> "atm-noktasi".
  const base = `atm-${trSlug(r.name.replace(/\s*\batm\b\s*/gi, " ").trim()) || "noktasi"}`;
  let s = base;
  let i = 2;
  while (taken.has(s)) s = `${base}-${i++}`;
  taken.add(s);
  r.slug = s;
}

// An empty answer is not a complete list: nothing is hidden then.
await poiSyncApply(rows, rows.length ? [{ source: "osm", kind: "atm" }] : [], { dryRun: DRY_RUN });
