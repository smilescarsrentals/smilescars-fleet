// scripts/check-db.mjs — run with: npm run db:check
//
// Connects to whatever lib/db.js resolved (DATABASE_URL, else the hardcoded
// fallback) and prints the same report /api?action=health serves, so you can
// verify the database before the app is deployed anywhere.
import { health } from "../lib/health.js";
import { pool, connectionSummary } from "../lib/db.js";

const conn = connectionSummary();
if (!conn.configured) {
  console.error("\n✗ No database configured.\n");
  console.error("  Set DATABASE_URL, or paste the password into");
  console.error("  HARDCODED_DATABASE_URL in lib/db.js (replace PUT_PASSWORD_HERE).\n");
  process.exit(1);
}
if (!conn.valid) {
  console.error(`\n✗ The connection string from ${conn.source} could not be read.\n`);
  console.error("  Expected:  postgresql://USER:PASSWORD@HOST:PORT/DATABASE");
  console.error("  The password may contain characters as-is (#, ?, /, %) — that's fine,");
  console.error("  but the rest of the string has to keep that shape.\n");
  process.exit(1);
}

console.log(`\nChecking ${conn.database} on ${conn.host}:${conn.port} as ${conn.user}`);
console.log(`(from ${conn.source})\n`);

const r = await health();

if (!r.connected) {
  console.error(`✗ Could not connect: ${r.error}\n`);
  console.error("  Common causes: wrong password, the project is paused in Supabase,");
  console.error("  or the wrong pooler port (6543 = transaction, 5432 = session).\n");
  await pool.end();
  process.exit(1);
}

const name = (s) => s.padEnd(18);
for (const [table, info] of Object.entries(r.tables)) {
  if (!info.exists) {
    console.log(`  ✗ ${name(table)} MISSING`);
  } else if (info.missingColumns.length) {
    console.log(`  ✗ ${name(table)} ${String(info.rowCount).padStart(6)} rows — missing: ${info.missingColumns.join(", ")}`);
  } else {
    console.log(`  ✓ ${name(table)} ${String(info.rowCount).padStart(6)} rows`);
  }
}

console.log("");
if (r.success) {
  console.log(`✓ Schema is complete — the API is ready to serve. (${r.elapsedMs}ms)\n`);
} else {
  console.log("✗ Problems found:\n");
  r.problems.forEach((p) => console.log(`  - ${p}`));
  console.log("\n  Fix: run db/schema.sql in the Supabase SQL editor, then re-run this check.\n");
}

await pool.end();
process.exit(r.success ? 0 : 1);
