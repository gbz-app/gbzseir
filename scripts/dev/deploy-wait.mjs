// Waits until the latest deployment of each Vercel project for <sha> is READY (or fails). Never prints tokens.
// Usage: node deploy-wait.mjs <sha> <project> [project ...]
const [sha, ...projects] = process.argv.slice(2);
const token = process.env.VERCEL_TOKEN;
const team = process.env.VERCEL_ORG_ID;
if (!token || !team) {
  console.error("missing VERCEL_TOKEN / VERCEL_ORG_ID");
  process.exit(2);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const state = Object.fromEntries(projects.map((p) => [p, "?"]));
const deadline = Date.now() + 15 * 60 * 1000;
while (Date.now() < deadline) {
  for (const p of projects) {
    if (["READY", "ERROR", "CANCELED"].includes(state[p])) continue;
    const r = await fetch(`https://api.vercel.com/v6/deployments?app=${encodeURIComponent(p)}&limit=10&teamId=${team}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) {
      state[p] = `http ${r.status}`;
      continue;
    }
    const { deployments = [] } = await r.json();
    const d = deployments.find((x) => (x.meta?.githubCommitSha ?? "").startsWith(sha));
    state[p] = d ? d.state ?? d.readyState : "not found yet";
    if (d && ["READY", "ERROR", "CANCELED"].includes(state[p])) console.log(`${p}: ${state[p]} (${d.url})`);
  }
  if (projects.every((p) => ["READY", "ERROR", "CANCELED"].includes(state[p]))) break;
  await sleep(10000);
}
console.log(JSON.stringify(state));
process.exit(projects.every((p) => state[p] === "READY") ? 0 : 1);
