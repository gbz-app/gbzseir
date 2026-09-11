// Seed the Kocaeli district boundaries (OpenStreetMap, ODbL) into private.district_boundaries.
// The 12 districts are rows of public.districts (supabase/migrations/2026091380_kocaeli_districts.sql). For each one the
// admin_level=6 relation is fetched from Overpass by its osm_relation_id and re-verified by name, boundary=administrative
// and admin_level=6; when that fails it is looked up by name inside Kocaeli (ISO3166-2 TR-41). The polygon is assembled in
// PostGIS (same way as seed-neighbourhoods.mjs) and upserted. Afterwards, pinned rows still on the Gebze backfill move to
// the district their pin is in (private.district_reassign_pinned). Re-runnable; prints counts only.
// Usage (PowerShell, after dot-sourcing secrets.ps1):
//   node --env-file=.env.local scripts/db/seed-districts.mjs              fetch, upsert, re-check pins
//   node --env-file=.env.local scripts/db/seed-districts.mjs --dry-run    fetch and build the polygons read-only
//   node --env-file=.env.local scripts/db/seed-districts.mjs --sql-out f  write the upsert SQL to file f (no DB writes)
//   add --no-reassign to skip the pin re-check.
import { writeFileSync } from "node:fs";
import { overpass, sql, lit, runSql, sleep } from "./lib.mjs";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const SQL_OUT = args.includes("--sql-out") ? args[args.indexOf("--sql-out") + 1] : null;
const REASSIGN = !args.includes("--no-reassign");
if (args.includes("--sql-out") && !SQL_OUT) {
  console.error("--sql-out needs a file path");
  process.exit(2);
}

// Same values as the migration and src/config/districts.ts.
const DISTRICTS = [
  { id: "izmit", name: "İzmit", osm: 1211493, lat: 40.7721, lng: 29.9506 },
  { id: "gebze", name: "Gebze", osm: 1211496, lat: 40.8007, lng: 29.4318 },
  { id: "darica", name: "Darıca", osm: 1211490, lat: 40.7575, lng: 29.3841 },
  { id: "cayirova", name: "Çayırova", osm: 1211204, lat: 40.8337, lng: 29.3815 },
  { id: "dilovasi", name: "Dilovası", osm: 1211488, lat: 40.7756, lng: 29.5261 },
  { id: "korfez", name: "Körfez", osm: 1211492, lat: 40.7608, lng: 29.7839 },
  { id: "derince", name: "Derince", osm: 1211495, lat: 40.7574, lng: 29.8308 },
  { id: "kartepe", name: "Kartepe", osm: 1211033, lat: 40.7454, lng: 30.0113 },
  { id: "basiskele", name: "Başiskele", osm: 1211497, lat: 40.7129, lng: 29.9287 },
  { id: "golcuk", name: "Gölcük", osm: 1211494, lat: 40.7169, lng: 29.8196 },
  { id: "karamursel", name: "Karamürsel", osm: 1211489, lat: 40.6913, lng: 29.6166 },
  { id: "kandira", name: "Kandıra", osm: 1211491, lat: 41.0704, lng: 30.1523 },
];

const norm = (s) => String(s ?? "").normalize("NFC").toLocaleLowerCase("tr").trim();
const isDistrictRelation = (r, d) =>
  r && r.type === "relation" && r.tags?.boundary === "administrative" && r.tags?.admin_level === "6" && norm(r.tags?.name) === norm(d.name);

/** Great-circle distance in metres. */
function haversine(a, b) {
  const R = 6371008.8;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** PostGIS expression that assembles the relation's outer/inner ways into a valid MultiPolygon (4326). */
function polygonExpr(rel) {
  const lines = rel.members
    .filter((m) => m.type === "way" && Array.isArray(m.geometry) && m.geometry.length >= 2 && ["outer", "inner", ""].includes(m.role))
    .map((m) => `LINESTRING(${m.geometry.filter(Boolean).map((p) => `${+p.lon.toFixed(7)} ${+p.lat.toFixed(7)}`).join(",")})`);
  if (!lines.length) return null;
  const collection = `GEOMETRYCOLLECTION(${lines.join(",")})`;
  return `extensions.st_multi(extensions.st_collectionextract(extensions.st_makevalid(extensions.st_buildarea(extensions.st_node(
    extensions.st_collectionextract(extensions.st_geomfromtext(${lit(collection)}, 4326), 2)))), 3))`;
}

// 1) Overpass: all 12 relations by id in one polite query, then a by-name lookup for any that does not verify.
const found = new Map();
{
  const data = await overpass(`[out:json][timeout:180];\nrelation(id:${DISTRICTS.map((d) => d.osm).join(",")});\nout geom;`);
  const byId = new Map(data.elements.filter((e) => e.type === "relation").map((e) => [e.id, e]));
  for (const d of DISTRICTS) {
    const r = byId.get(d.osm);
    if (isDistrictRelation(r, d)) found.set(d.id, r);
  }
  console.log(`overpass: ${byId.size} relations fetched by id, ${found.size}/${DISTRICTS.length} verified (name + admin_level=6)`);
}
for (const d of DISTRICTS.filter((x) => !found.has(x.id))) {
  await sleep(3000);
  const q = `[out:json][timeout:180];\narea["ISO3166-2"="TR-41"]["admin_level"="4"]->.k;\nrelation(area.k)["boundary"="administrative"]["admin_level"="6"]["name"=${JSON.stringify(d.name)}];\nout geom;`;
  const data = await overpass(q);
  const rels = data.elements.filter((e) => isDistrictRelation(e, d));
  if (rels.length === 1) {
    console.warn(`${d.id}: relation ${d.osm} did not verify; found ${rels[0].id} by name`);
    found.set(d.id, rels[0]);
  } else {
    console.error(`${d.id}: no unique admin_level=6 relation named ${d.name} (${rels.length} found), skipped`);
  }
}

// 2) Build (dry run / SQL file) or upsert each polygon.
const statements = [];
let ok = 0;
for (const d of DISTRICTS) {
  const rel = found.get(d.id);
  if (!rel) continue;
  const expr = polygonExpr(rel);
  if (!expr) {
    console.error(`${d.id}: relation ${rel.id} has no way geometry, skipped`);
    continue;
  }
  const centre = rel.members.find((m) => m.type === "node" && m.role === "admin_centre" && m.lat != null);
  if (centre) {
    const off = haversine({ lat: d.lat, lng: d.lng }, { lat: centre.lat, lng: centre.lon });
    if (off > 1500) console.warn(`${d.id}: stored centre is ${Math.round(off)} m from the OSM admin_centre node`);
  }
  const pt = `extensions.st_setsrid(extensions.st_makepoint(${d.lng}, ${d.lat}), 4326)`;
  if (DRY) {
    const q = `with g as (select ${expr} as poly)
select round((extensions.st_area(poly::extensions.geography) / 1e6)::numeric, 1) as km2, extensions.st_npoints(poly) as points,
       extensions.st_isvalid(poly) as valid, extensions.st_intersects(poly, ${pt}) as has_centre from g`;
    let row;
    for (let i = 1; i <= 3 && !row; i++) {
      try {
        row = (await runSql(q, { readOnly: true }))?.[0];
      } catch (e) {
        if (i === 3) console.error(`${d.id}: ${String(e.message).slice(0, 300)}`);
        else await sleep(2000 * i);
      }
    }
    if (row) {
      ok++;
      console.log(`${d.id.padEnd(11)} rel ${rel.id}  ${row.km2} km2  ${row.points} points  valid=${row.valid}  centre inside=${row.has_centre}`);
    }
    continue;
  }
  const upsert = `with g as (select ${expr} as poly),
up as (
  insert into private.district_boundaries (district_id, boundary, osm_relation_id, fetched_at)
  select ${lit(d.id)}, g.poly, ${rel.id}, now() from g
   where g.poly is not null and not extensions.st_isempty(g.poly) and extensions.st_area(g.poly::extensions.geography) > 1e6
  on conflict (district_id) do update
    set boundary = excluded.boundary, osm_relation_id = excluded.osm_relation_id, fetched_at = excluded.fetched_at
  returning district_id, boundary
)
select up.district_id, round((extensions.st_area(up.boundary::extensions.geography) / 1e6)::numeric, 1) as km2,
       extensions.st_npoints(up.boundary) as points, extensions.st_isvalid(up.boundary) as valid,
       extensions.st_intersects(up.boundary, ds.center::extensions.geometry) as has_centre
  from up join public.districts ds on ds.id = up.district_id`;
  const fixId =
    rel.id !== d.osm
      ? `update public.districts set osm_relation_id = ${rel.id} where id = ${lit(d.id)} and osm_relation_id is distinct from ${rel.id}`
      : null;
  if (SQL_OUT) {
    if (fixId) statements.push(fixId);
    statements.push(upsert);
    ok++;
    continue;
  }
  try {
    if (fixId) await sql(fixId);
    const row = (await sql(upsert))?.[0];
    if (row) {
      ok++;
      console.log(`${d.id.padEnd(11)} rel ${rel.id}  ${row.km2} km2  ${row.points} points  valid=${row.valid}  centre inside=${row.has_centre}`);
    } else {
      console.error(`${d.id}: polygon could not be built (empty or under 1 km2), not stored`);
    }
  } catch (e) {
    console.error(`${d.id}: ${String(e.message).slice(0, 300)}`);
  }
}

if (DRY) {
  console.log(`DRY RUN - built ${ok}/${DISTRICTS.length} polygons, nothing written`);
  process.exit(ok === DISTRICTS.length ? 0 : 1);
}
if (SQL_OUT) {
  writeFileSync(SQL_OUT, `-- generated by scripts/db/seed-districts.mjs --sql-out (${ok} districts)\n${statements.join(";\n\n")};\n`, "utf8");
  console.log(`wrote ${statements.length} statements for ${ok} districts to ${SQL_OUT} - nothing written to the DB`);
  process.exit(ok === DISTRICTS.length ? 0 : 1);
}
console.log(`upserted ${ok}/${DISTRICTS.length} district boundaries`);

// 3) Checks (counts only).
const [check] = await sql(`select
  (select count(*) from public.districts) as districts,
  (select count(*) from private.district_boundaries) as with_boundary,
  (select round((sum(extensions.st_area(boundary::extensions.geography)) / 1e6)::numeric) from private.district_boundaries) as total_km2,
  (select round((coalesce(sum(extensions.st_area(extensions.st_intersection(a.boundary, b.boundary)::extensions.geography)), 0) / 1e6)::numeric, 2)
     from private.district_boundaries a
     join private.district_boundaries b on a.district_id < b.district_id and extensions.st_intersects(a.boundary, b.boundary)) as overlap_km2,
  (select count(*) from public.districts d where private.district_of(d.center::extensions.geometry) = d.id) as centres_in_own_district,
  (select count(*) from public.neighbourhoods) as neighbourhoods,
  (select count(*) from public.neighbourhoods n where private.district_of(n.center::extensions.geometry) = 'gebze') as neighbourhood_centres_in_gebze`);
console.log(JSON.stringify(check));

// 4) Pinned rows still on the Gebze backfill -> the district their pin is in.
if (REASSIGN) {
  const [r] = await sql(`select private.district_reassign_pinned() as r`);
  console.log(`pin re-check: ${typeof r?.r === "string" ? r.r : JSON.stringify(r?.r)}`);
  const counts = await sql(`select 'businesses' as t, district_id, count(*) as n from public.businesses group by 2
    union all select 'poi', district_id, count(*) from public.poi group by 2
    union all select 'events', district_id, count(*) from public.events group by 2
    order by 1, 3 desc`);
  console.log(counts.map((c) => `${c.t}:${c.district_id ?? "-"}=${c.n}`).join("  "));
}
process.exit(ok === DISTRICTS.length ? 0 : 1);
