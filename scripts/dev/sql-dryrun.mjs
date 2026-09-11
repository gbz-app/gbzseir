// Dry-run a migration: runs the file inside BEGIN ... ROLLBACK so nothing is kept. Prints "DRY-RUN OK" or the error.
// Usage (PowerShell, from the repo dir, with SUPABASE_ACCESS_TOKEN set in the environment; never commit it):
//   node --env-file=.env.local scripts\dev\sql-dryrun.mjs supabase\migrations\<file>.sql
// Refuses files that manage their own transaction or use statements that cannot run in a transaction block.
import fs from "node:fs";
import { runSql } from "file:///C:/Users/gebze/OneDrive/Desktop/gbzsehir/scripts/db/sql.mjs";

const file = process.argv[2];
const sql = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
if (/^\s*(begin|commit|rollback)\s*;/im.test(sql) || /\bconcurrently\b/i.test(sql) || /alter\s+type\s+\S+\s+add\s+value/i.test(sql)) {
  console.error("REFUSED: the file has BEGIN/COMMIT/ROLLBACK, CONCURRENTLY or ALTER TYPE ... ADD VALUE; remove them (migrations run as one statement batch).");
  process.exit(2);
}
try {
  await runSql(`begin;\n${sql}\n;\nrollback;`);
  console.log("DRY-RUN OK (rolled back, nothing kept)");
} catch (e) {
  console.error(`DRY-RUN FAILED: ${e.message.slice(0, 2000)}`);
  process.exit(1);
}
