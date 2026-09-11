// Runs the SQL in <file> through the Management API and prints the rows as JSON. Never prints tokens.
// Usage: node --env-file=.env.local sqlq.mjs <file.sql>
import fs from "node:fs";
import { runSql } from "file:///C:/Users/gebze/OneDrive/Desktop/gbzsehir/scripts/db/sql.mjs";

const rows = await runSql(fs.readFileSync(process.argv[2], "utf8"));
console.log(JSON.stringify(rows, null, 1));
