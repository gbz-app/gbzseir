// Seed Gebze neighbourhoods (mahalleler) from OpenStreetMap (ODbL) via Overpass.
// Boundaries (admin_level=8 inside Gebze admin_level=6) are assembled into polygons in PostGIS;
// centre = ST_PointOnSurface (always inside the polygon). Idempotent (upsert by osm_id / slug).
// Usage: node --env-file=.env.local scripts/db/seed-neighbourhoods.mjs
import { overpass, sql, lit, trSlug } from "./lib.mjs";

const query = `[out:json][timeout:180];
area["name"="Gebze"]["boundary"="administrative"]["admin_level"="6"]->.g;
relation(area.g)["boundary"="administrative"]["admin_level"="8"];
out geom;`;

const data = await overpass(query);
const rels = data.elements.filter((e) => e.type === "relation" && e.tags?.name);
console.log(`overpass: ${rels.length} neighbourhood relations`);

let ok = 0;
for (const r of rels) {
  const full = r.tags.name.trim();
  const name = full.replace(/\s+Mahallesi$/i, "").trim();
  const slug = trSlug(name);
  const lines = r.members
    .filter((m) => m.type === "way" && Array.isArray(m.geometry) && m.geometry.length >= 2 && (m.role === "outer" || m.role === "" || m.role === "inner"))
    .map((m) => `LINESTRING(${m.geometry.map((p) => `${p.lon} ${p.lat}`).join(",")})`);
  if (!lines.length) {
    console.warn(`skip ${full}: no geometry`);
    continue;
  }
  const collection = `GEOMETRYCOLLECTION(${lines.join(",")})`;
  const q = `
with g as (
  select extensions.st_multi(extensions.st_collectionextract(extensions.st_makevalid(
           extensions.st_buildarea(extensions.st_node(extensions.st_collectionextract(extensions.st_geomfromtext(${lit(collection)}, 4326), 2)))), 3)) as poly
), up as (
  insert into public.neighbourhoods (name, slug, district, center, osm_id)
  select ${lit(name)}, ${lit(slug)}, 'Gebze', extensions.st_pointonsurface(poly)::extensions.geography, ${r.id}
    from g where poly is not null and not extensions.st_isempty(poly)
  on conflict (slug) do update set name = excluded.name, center = excluded.center, osm_id = excluded.osm_id, district = excluded.district
  returning id
)
insert into private.neighbourhood_boundaries (neighbourhood_id, boundary)
select up.id, g.poly from up, g
on conflict (neighbourhood_id) do update set boundary = excluded.boundary
returning neighbourhood_id;`;
  try {
    const out = await sql(q);
    if (Array.isArray(out) && out.length) ok++;
    else console.warn(`no polygon for ${full}`);
  } catch (e) {
    console.error(`failed ${full}: ${e.message.slice(0, 300)}`);
  }
}
console.log(`upserted ${ok}/${rels.length} neighbourhoods with boundaries`);
const summary = await sql(`select count(*) as n, round(min(lat)::numeric,4) as min_lat, round(max(lat)::numeric,4) as max_lat,
  round(min(lng)::numeric,4) as min_lng, round(max(lng)::numeric,4) as max_lng from public.neighbourhoods where district='Gebze'`);
console.log(JSON.stringify(summary));
