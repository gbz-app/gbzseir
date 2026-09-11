// Upserts one env var (value read from a file, never printed) on the given Vercel projects, all targets.
// Usage: node vercel-env-set.mjs <KEY> <valueFile> <project> [project ...]   (after dot-sourcing secrets.ps1)
import fs from "node:fs";

const [key, valueFile, ...projects] = process.argv.slice(2);
const token = process.env.VERCEL_TOKEN;
const team = process.env.VERCEL_ORG_ID;
if (!token || !team || !key || !valueFile || !projects.length) {
  console.error("usage: vercel-env-set.mjs <KEY> <valueFile> <project...> (and VERCEL_TOKEN / VERCEL_ORG_ID)");
  process.exit(2);
}
const value = fs.readFileSync(valueFile, "utf8").trim();
if (!value) throw new Error("empty value file");
for (const p of projects) {
  const r = await fetch(`https://api.vercel.com/v10/projects/${encodeURIComponent(p)}/env?upsert=true&teamId=${team}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ key, value, type: "encrypted", target: ["production", "preview", "development"] }),
  });
  console.log(`${p}: ${key} -> http ${r.status}${r.ok ? "" : " " + (await r.text()).slice(0, 200).replace(value, "***")}`);
}
