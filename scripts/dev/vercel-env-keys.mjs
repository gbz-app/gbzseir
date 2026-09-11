// Lists environment variable NAMES (never values) and their targets for the given Vercel projects.
// Usage: node vercel-env-keys.mjs <project> [project ...]   (after dot-sourcing secrets.ps1)
const token = process.env.VERCEL_TOKEN;
const team = process.env.VERCEL_ORG_ID;
if (!token || !team) {
  console.error("missing VERCEL_TOKEN / VERCEL_ORG_ID");
  process.exit(2);
}
for (const p of process.argv.slice(2)) {
  const r = await fetch(`https://api.vercel.com/v9/projects/${encodeURIComponent(p)}/env?teamId=${team}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) {
    console.log(`${p}: http ${r.status}`);
    continue;
  }
  const { envs = [] } = await r.json();
  console.log(`${p}:`);
  for (const e of envs.sort((a, b) => a.key.localeCompare(b.key))) console.log(`  ${e.key}  [${(e.target || []).join(",")}]  (${e.type})`);
}
