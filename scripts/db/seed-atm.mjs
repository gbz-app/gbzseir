// Seed ATMs (poi.kind = 'atm') for Gebze from OpenStreetMap (amenity=atm, ODbL) via Overpass.
// Neighbourhood = polygon containing the point (fallback: nearest centre). Idempotent: upsert on (source, source_ref).
// Usage: node --env-file=.env.local scripts/db/seed-atm.mjs
import { overpass, sql, lit, trSlug } from "./lib.mjs";

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
const rows = [];
for (const e of osm.elements || []) {
  const t = e.tags || {};
  const lat = e.lat ?? e.center?.lat;
  const lon = e.lon ?? e.center?.lon;
  if (typeof lat !== "number" || typeof lon !== "number") continue;
  const street = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ");
  rows.push({
    name: atmName(t),
    address: street || null,
    x: lon,
    y: lat,
    source_ref: `${e.type}/${e.id}`,
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

let n = 0;
for (let i = 0; i < rows.length; i += 80) {
  const values = rows
    .slice(i, i + 80)
    .map((r) => `('atm', ${lit(r.name)}, ${lit(r.slug)}, ${lit(r.address)}, ${r.x}, ${r.y}, 'osm', ${lit(r.source_ref)}, ${lit(OSM_LICENSE)})`)
    .join(",\n");
  const out = await sql(`
with v(kind, name, slug, address, x, y, source, source_ref, license) as (values ${values}),
p as (select v.*, extensions.st_setsrid(extensions.st_makepoint(x, y), 4326) as g from v)
insert into public.poi (kind, name, slug, address, phone, location, neighbourhood_id, details, source, source_ref, license)
select p.kind, p.name, p.slug, p.address, null, p.g::extensions.geography,
  coalesce(
    (select b.neighbourhood_id from private.neighbourhood_boundaries b where extensions.st_contains(b.boundary, p.g) limit 1),
    (select nb.id from public.neighbourhoods nb order by nb.center operator(extensions.<->) p.g::extensions.geography limit 1)),
  '{}'::jsonb, p.source, p.source_ref, p.license
from p
on conflict (source, source_ref) do update set
  kind = excluded.kind, name = excluded.name, address = excluded.address,
  location = excluded.location, neighbourhood_id = excluded.neighbourhood_id, license = excluded.license
returning id`);
  n += out.length;
}
console.log(`upserted ${n} ATMs`);
