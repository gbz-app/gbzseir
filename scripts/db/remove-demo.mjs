// Remove DEMO data (rows marked is_demo / source 'demo') before going live. Same as the admin panel's
// "Örnek veri temizliği" (admin_clear_demo_data) with every scope selected.
// Usage: node --env-file=.env.local scripts/db/remove-demo.mjs --yes [--include-admin]
//   Deletes: demo listings, reviews, announcements, requests, events, finance rows, news articles, businesses
//            (cascades categories/areas/photos/menus/rooms/leads), demo duty rows, demo POIs (source 'demo'),
//            demo auth users (profiles.is_demo; demo admins only with --include-admin and only while a real,
//            non-demo admin exists) and the demo photos in the media bucket (demo/...).
//   Stops the demo duty roll: duty_data_mode 'demo' becomes 'off' and 'gebzem-roll-demo-duty' is unscheduled.
//   Does NOT touch POIs from KBB/OSM, reference data or real users.
import { sql, adminFetch } from "./lib.mjs";

if (!process.argv.includes("--yes")) {
  console.error("Refusing to run without --yes (this deletes demo data).");
  process.exit(2);
}
const includeAdmin = process.argv.includes("--include-admin");
if (includeAdmin) {
  const [{ n }] = await sql(`select count(*)::int as n from public.profiles where role = 'admin' and not is_demo and status = 'active'`);
  if (!n) {
    console.error("Refusing --include-admin: there is no real (non-demo, active) admin yet.");
    process.exit(2);
  }
}

await sql(`
  delete from public.listings where is_demo;
  delete from public.reviews where is_demo;
  delete from public.announcements where is_demo;
  delete from public.service_requests where is_demo;
  delete from public.events where is_demo;
  delete from public.finance_entries where is_demo;
  delete from public.listings where business_id in (select id from public.businesses where is_demo);
  delete from public.businesses where is_demo;
  delete from public.news_articles where is_demo;
  delete from public.pharmacy_duty where source = 'demo';
  delete from public.poi where source = 'demo';
  insert into public.app_settings (key, value, updated_at) values ('duty_data_mode', '"off"'::jsonb, now())
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at
    where public.app_settings.value = '"demo"'::jsonb;
  select cron.unschedule(jobid) from cron.job where jobname = 'gebzem-roll-demo-duty';
`);
const users = await sql(`select id, role from public.profiles where is_demo ${includeAdmin ? "" : "and role <> 'admin'"}`);
let n = 0;
for (const u of users) {
  const r = await adminFetch(`/auth/v1/admin/users/${u.id}`, { method: "DELETE" });
  if (r.ok) n++;
  else console.error(`could not delete user ${u.id}: ${r.status}`);
}

// Demo photos (seed-verticals.mjs): list every file under demo/ (folders walked, pages of 100), then remove in chunks.
const PAGE = 100;
async function listMedia(root) {
  const files = [];
  const queue = [root];
  while (queue.length) {
    const dir = queue.shift();
    for (let offset = 0; ; offset += PAGE) {
      const r = await adminFetch("/storage/v1/object/list/media", {
        method: "POST",
        body: { prefix: dir, limit: PAGE, offset, sortBy: { column: "name", order: "asc" } },
      });
      if (!r.ok) throw new Error(`storage list ${dir}: ${r.status}`);
      const items = Array.isArray(r.body) ? r.body : [];
      // Folders are returned without an id.
      for (const item of items) (item.id === null ? queue : files).push(`${dir}/${item.name}`);
      if (items.length < PAGE) break;
    }
  }
  return files;
}
const files = await listMedia("demo");
let removed = 0;
for (let i = 0; i < files.length; i += PAGE) {
  const r = await adminFetch("/storage/v1/object/media", { method: "DELETE", body: { prefixes: files.slice(i, i + PAGE) } });
  if (r.ok) removed += Array.isArray(r.body) ? r.body.length : 0;
  else console.error(`could not remove demo photos ${i + 1}-${Math.min(i + PAGE, files.length)}: ${r.status}`);
}

console.log(`removed demo rows, ${n}/${users.length} demo users and ${removed}/${files.length} demo photos; demo duty roll stopped`);
