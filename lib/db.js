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

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set — the API cannot reach Supabase.");
}

// Supabase requires TLS; a local Postgres (used for testing) has none.
const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(connectionString || "");

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
