// Remove DEMO data (rows marked is_demo / source 'demo') before going live.
// Usage: node --env-file=.env.local scripts/db/remove-demo.mjs --yes [--include-admin]
//   Deletes: demo listings, reviews, announcements, businesses (cascades categories/areas/photos/leads),
//            demo duty rows, and demo auth users (profiles.is_demo; the admin only with --include-admin).
//   Does NOT touch POIs from KBB/OSM, reference data or real users.
import { sql, adminFetch } from "./lib.mjs";

if (!process.argv.includes("--yes")) {
  console.error("Refusing to run without --yes (this deletes demo data).");
  process.exit(2);
}
const includeAdmin = process.argv.includes("--include-admin");

await sql(`
  delete from public.listings where is_demo;
  delete from public.reviews where is_demo;
  delete from public.announcements where is_demo;
  delete from public.service_requests where is_demo;
  delete from public.businesses where is_demo;
  delete from public.pharmacy_duty where source = 'demo';
`);
const users = await sql(`select id, role from public.profiles where is_demo ${includeAdmin ? "" : "and role <> 'admin'"}`);
let n = 0;
for (const u of users) {
  const r = await adminFetch(`/auth/v1/admin/users/${u.id}`, { method: "DELETE" });
  if (r.ok) n++;
  else console.error(`could not delete user ${u.id}: ${r.status}`);
}
console.log(`removed demo rows and ${n}/${users.length} demo users`);
console.log("Remember: also unschedule 'gebzem-roll-demo-duty' (select cron.unschedule('gebzem-roll-demo-duty')) once real duty data is imported.");
