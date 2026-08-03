// lib/db.js — single shared Postgres pool to Supabase.
//
// Type parsers are chosen for FAITHFULNESS to the Google Sheet the app used to
// read from:
//   * timestamp/date come back as raw strings, so we never shift a stored
//     wall-clock value across timezones (the sheet values were Dar es Salaam
//     local time and are stored that way).
//   * numeric comes back as a JS number (money values here are small and well
//     within IEEE-754 precision), matching what the Sheet returned.
import pg from "pg";

const { Pool, types } = pg;

types.setTypeParser(1114, (v) => v); // timestamp WITHOUT time zone -> raw string
types.setTypeParser(1082, (v) => v); // date -> raw string
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v))); // numeric -> Number

// ┌──────────────────────────────────────────────────────────────────────────┐
// │  TEMPORARY — hardcoded connection string                                 │
// │                                                                          │
// │  Paste the real database password over PUT_PASSWORD_HERE below. This is  │
// │  a stopgap for testing while nobody can set environment variables in     │
// │  Vercel. It is never sent to the browser (lib/ is server-only and is not │
// │  part of the Vite bundle) — the exposure is anyone who can read this     │
// │  repo, and git history keeps it even after this line is deleted.         │
// │                                                                          │
// │  To finish the job later:                                                │
// │    1. Set DATABASE_URL in Vercel — it already takes precedence over this │
// │    2. Blank this constant back out to ""                                 │
// │    3. Rotate the password (Supabase -> Settings -> Database -> Reset     │
// │       database password), because this one is in the history             │
// └──────────────────────────────────────────────────────────────────────────┘
const HARDCODED_DATABASE_URL =
  "postgresql://postgres.vqfjjmxyvxwdvlyivdfz:k7#+=hqE?S$cr^7@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

// The environment variable always wins, so switching to it later needs no code
// change — set it in Vercel and this fallback stops being consulted.
const connectionString =
  process.env.DATABASE_URL ||
  (HARDCODED_DATABASE_URL.includes("PUT_PASSWORD_HERE") ? "" : HARDCODED_DATABASE_URL);

if (!connectionString) {
  console.error(
    "No database connection configured — set DATABASE_URL, or put the password " +
    "into HARDCODED_DATABASE_URL in lib/db.js."
  );
}

// Supabase requires TLS; a local Postgres (used for testing) has none.
const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(connectionString || "");

// Where we're pointed, safe to print — the password is never included.
export function connectionSummary() {
  if (!connectionString) return { configured: false };
  try {
    const u = new URL(connectionString);
    return {
      configured: true,
      host: u.hostname,
      port: u.port || "5432",
      database: u.pathname.replace(/^\//, "") || "postgres",
      user: decodeURIComponent(u.username),
      source: process.env.DATABASE_URL ? "DATABASE_URL" : "lib/db.js fallback",
    };
  } catch {
    return { configured: true, host: "(unparseable connection string)" };
  }
}

// Reused across warm invocations. Small pool: the Supabase pooler already
// multiplexes, and serverless spins up many instances.
export const pool = new Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: 3,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});

pool.on("error", (err) => console.error("Unexpected idle pg client error:", err.message));

export async function q(text, params) {
  const r = await pool.query(text, params);
  return r.rows;
}
export async function q1(text, params) {
  const r = await pool.query(text, params);
  return r.rows[0] || null;
}
export async function run(text, params) {
  const r = await pool.query(text, params);
  return r.rowCount;
}

// Run a set of statements in one transaction. `fn` receives a client-scoped
// { q, q1, run } with the same shape as the module-level helpers.
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const scoped = {
      q: async (t, p) => (await client.query(t, p)).rows,
      q1: async (t, p) => (await client.query(t, p)).rows[0] || null,
      run: async (t, p) => (await client.query(t, p)).rowCount,
    };
    const out = await fn(scoped);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* connection already gone */ }
    throw err;
  } finally {
    client.release();
  }
}
