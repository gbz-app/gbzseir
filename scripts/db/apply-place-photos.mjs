// Merge free (Wikimedia Commons) place photos from a manifest into public.poi.details.photos (kind 'place' only).
// Usage (PowerShell, repo root, after dot-sourcing secrets.ps1 so SUPABASE_ACCESS_TOKEN is set):
//   node --env-file=.env.local scripts/db/apply-place-photos.mjs --manifest <manifest.json> [--dry-run] [--upgrade]
// manifest.json = [{ poi_id, slug, name, photos: [{ url, thumb_url, width, height, alt, author, credit, licence,
//                  licence_url, source_page, replaces? }] }]
// - Never removes a photo. A photo whose Commons file page (or url) is already on the row is skipped; with --upgrade,
//   an entry with `replaces` swaps that stored photo's url for the larger one in place (alt/credit kept).
// - New photos are appended after the stored ones, up to 12 per row (the admin form's limit).
// - Idempotent: a second run changes nothing. Each row is written only if its photos did not change since they were read.
// - --dry-run prints the plan, then runs the same UPDATE (triggers included) and rolls it back, so it shows how many
//   rows would be stored as planned; nothing is kept. Public pages refresh on their normal cache schedule afterwards.
import { readFileSync } from "node:fs";
import { jsonLit, lit, sql } from "./lib.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const dryRun = flag("--dry-run");
const upgrade = flag("--upgrade");
const manifestPath = opt("--manifest");
const MAX = 12;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isHttps = (u) => typeof u === "string" && /^https:\/\//.test(u) && u.length <= 500;

if (!manifestPath) {
  console.error("--manifest <path> is required");
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8").replace(/^﻿/, ""));
if (!Array.isArray(manifest)) throw new Error("manifest must be an array");

/** Same Commons file: compare decoded file-page titles, spaces and underscores alike. */
function pageKey(u) {
  if (typeof u !== "string" || !u) return null;
  try {
    const t = decodeURIComponent(u.split("/wiki/")[1] ?? u);
    return t.replace(/_/g, " ").trim().toLowerCase();
  } catch {
    return u.toLowerCase();
  }
}

function clean(p) {
  const out = {
    url: p.url,
    thumb_url: isHttps(p.thumb_url) ? p.thumb_url : null,
    width: Number.isFinite(p.width) ? p.width : null,
    height: Number.isFinite(p.height) ? p.height : null,
    alt: p.alt ? String(p.alt).slice(0, 160) : null,
    author: p.author ? String(p.author).slice(0, 200) : null,
    credit: p.credit ? String(p.credit).slice(0, 160) : null,
    licence: p.licence ? String(p.licence).slice(0, 80) : null,
    licence_url: isHttps(p.licence_url) || /^http:\/\//.test(p.licence_url ?? "") ? p.licence_url : null,
    source_page: isHttps(p.source_page) ? p.source_page : null,
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== null));
}

// Validate the manifest.
const entries = [];
for (const e of manifest) {
  if (!UUID.test(e?.poi_id ?? "") || !Array.isArray(e.photos)) {
    console.error(`skip malformed entry: ${JSON.stringify(e).slice(0, 120)}`);
    continue;
  }
  const photos = e.photos.filter((p) => isHttps(p?.url) && p.author !== undefined && p.licence && isHttps(p.source_page));
  if (photos.length !== e.photos.length) console.error(`${e.slug}: ${e.photos.length - photos.length} photo(s) without https url / licence / source page skipped`);
  entries.push({ ...e, photos });
}
if (!entries.length) {
  console.log("nothing to apply");
  process.exit(0);
}

// Current rows.
const ids = entries.map((e) => lit(e.poi_id)).join(", ");
const rows = await sql(
  `select id, slug, kind, locked, coalesce(details -> 'photos', 'null'::jsonb) as photos from public.poi where id in (${ids})`,
);
const byId = new Map(rows.map((r) => [r.id, { ...r, photos: typeof r.photos === "string" ? JSON.parse(r.photos) : r.photos }]));

const plan = [];
const totals = { added: 0, upgraded: 0, skipped: 0, rows: 0 };
for (const e of entries) {
  const row = byId.get(e.poi_id);
  if (!row) {
    console.log(`${e.slug}: poi ${e.poi_id} not found, skipped`);
    continue;
  }
  if (row.kind !== "place") {
    console.log(`${e.slug}: kind is ${row.kind}, not place, skipped`);
    continue;
  }
  const before = Array.isArray(row.photos) ? row.photos : [];
  const next = before.map((p) => (typeof p === "string" ? p : { ...p }));
  const urlOf = (p) => (typeof p === "string" ? p : p?.url ?? p?.src);
  const keyOf = (p) => (typeof p === "string" ? null : pageKey(p?.source_page));
  const log = [];
  for (const p of e.photos) {
    const key = pageKey(p.source_page);
    const idx = next.findIndex((q) => urlOf(q) === p.url || (key && keyOf(q) === key) || (p.replaces && urlOf(q) === p.replaces));
    if (idx >= 0) {
      const cur = next[idx];
      if (upgrade && p.replaces && urlOf(cur) === p.replaces && urlOf(cur) !== p.url) {
        const base = typeof cur === "string" ? {} : cur;
        const fresh = clean(p);
        next[idx] = { ...fresh, ...Object.fromEntries(Object.entries(base).filter(([k, v]) => v != null && !["url", "thumb_url", "width", "height"].includes(k))) };
        next[idx].url = fresh.url;
        if (fresh.thumb_url) next[idx].thumb_url = fresh.thumb_url;
        if (fresh.width) next[idx].width = fresh.width;
        if (fresh.height) next[idx].height = fresh.height;
        log.push(`upgrade #${idx + 1}`);
        totals.upgraded++;
      } else {
        totals.skipped++;
      }
      continue;
    }
    if (next.length >= MAX) {
      log.push(`full (${MAX}), rest skipped`);
      totals.skipped++;
      continue;
    }
    next.push(clean(p));
    log.push(`add #${next.length}`);
    totals.added++;
  }
  if (JSON.stringify(next) === JSON.stringify(before)) {
    console.log(`${e.slug}: unchanged (${before.length} photo${before.length === 1 ? "" : "s"})`);
    continue;
  }
  if (row.locked) console.log(`${e.slug}: row is locked; the poi trigger keeps stored photos for non-admin writers, so verify after the run`);
  plan.push({ id: e.poi_id, slug: e.slug, old: row.photos, next });
  console.log(`${e.slug}: ${before.length} -> ${next.length} photos (${log.join(", ")})`);
}
totals.rows = plan.length;
console.log(`plan: ${totals.rows} rows, ${totals.added} photos added, ${totals.upgraded} upgraded, ${totals.skipped} already there / skipped`);

/** RETURNING rows carried by the dry-run probe's exception, or null when the error is something else. */
function probeRows(e) {
  const msg = String(e?.message ?? "");
  let text = msg;
  try {
    const body = JSON.parse(msg.slice(msg.indexOf("{")));
    text = typeof body?.message === "string" ? body.message : JSON.stringify(body);
  } catch {
    // not JSON: match the raw message
  }
  const m = text.match(/rollback-probe:(\[.*\]):end/s);
  return m ? JSON.parse(m[1]) : null;
}

// No process.exit() after network use: on Windows it can abort Node while fetch sockets close (exit code 9).
if (!plan.length) {
  if (dryRun) console.log("DRY RUN - nothing to write.");
} else {
  // One UPDATE for both modes: write each row only if its photos are still what was read; return what was stored.
  const values = plan.map((p) => `(${lit(p.id)}::uuid, ${jsonLit(p.old)}, ${jsonLit(p.next)})`).join(",\n  ");
  const cte = `with v(id, old_photos, new_photos) as (values\n  ${values}\n),
u as (
  update public.poi p
     set details = jsonb_set(case when jsonb_typeof(p.details) = 'object' then p.details else '{}'::jsonb end, '{photos}', v.new_photos, true)
    from v
   where p.id = v.id and p.kind = 'place' and coalesce(p.details -> 'photos', 'null'::jsonb) = v.old_photos
  returning p.id, p.slug, (p.details -> 'photos') = v.new_photos as stored
)`;
  let out;
  if (dryRun) {
    // The same UPDATE (triggers included) inside a DO block that always raises: Postgres rolls it back and the
    // error message carries the RETURNING rows. Nothing is kept.
    if (cte.includes("$probe$")) throw new Error("manifest text contains $probe$");
    const probe = `do $probe$ declare r jsonb; begin
${cte}
select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'slug', u.slug, 'stored', u.stored)), '[]'::jsonb) into r from u;
raise exception 'rollback-probe:%:end', r;
end $probe$`;
    let raised = null;
    try {
      await sql(probe, 3);
    } catch (e) {
      raised = e;
    }
    out = probeRows(raised);
    if (!out) throw raised ?? new Error("rollback probe returned without raising");
  } else {
    out = await sql(`${cte}\nselect id, slug, stored from u`, 2);
  }
  const written = new Map(out.map((r) => [r.id, r]));
  let bad = 0;
  for (const p of plan) {
    const r = written.get(p.id);
    if (!r) {
      bad++;
      console.log(`${p.slug}: photos changed since read (or row gone), ${dryRun ? "would not be written" : "not written; run again"}`);
    } else if (r.stored !== true && r.stored !== "true") {
      bad++;
      console.log(`${p.slug}: ${dryRun ? "would be written" : "written"} but the stored photos differ (locked row?), check it`);
    }
  }
  if (bad) process.exitCode = 1;
  if (dryRun) {
    console.log(`DRY RUN - the UPDATE ran and was rolled back: ${written.size - bad} of ${plan.length} rows would be stored as planned${bad ? `, ${bad} need a look` : ""}. Nothing written.`);
  } else {
    console.log(`done: ${written.size - bad} rows updated${bad ? `, ${bad} need a look` : ""}. Public pages refresh on their cache schedule (or save the place in /admin to refresh now).`);
  }
}
