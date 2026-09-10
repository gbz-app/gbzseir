// Run SQL against the Supabase project via the Management API.
// Usage (PowerShell, after dot-sourcing secrets.ps1 so SUPABASE_ACCESS_TOKEN is set):
//   node --env-file=.env.local scripts/db/sql.mjs -e "select 1"
//   node --env-file=.env.local scripts/db/sql.mjs supabase/migrations/20260910000001_init.sql [...more files]
//   node --env-file=.env.local scripts/db/sql.mjs --all        (applies every migration in order)
// Never prints the token.
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ref = process.env.SUPABASE_PROJECT_REF || "fboythglcjofakbskstg";
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN missing (dot-source secrets.ps1 first)");
  process.exit(2);
}

export async function runSql(query, { readOnly = false } = {}) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(readOnly ? { query, read_only: true } : { query }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    const err = new Error(`SQL failed (${res.status}): ${typeof body === "string" ? body : JSON.stringify(body)}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

if (isMain) {
  const args = process.argv.slice(2);
  try {
    if (args[0] === "-e") {
      const out = await runSql(args.slice(1).join(" "));
      console.log(JSON.stringify(out, null, 2));
    } else {
      let files = args;
      if (args[0] === "--all") {
        const dir = join(process.cwd(), "supabase", "migrations");
        files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().map((f) => join(dir, f));
      }
      for (const f of files) {
        const sql = readFileSync(f, "utf8");
        process.stdout.write(`-> ${f} ... `);
        const out = await runSql(sql);
        console.log("ok", Array.isArray(out) && out.length ? JSON.stringify(out).slice(0, 400) : "");
      }
    }
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
