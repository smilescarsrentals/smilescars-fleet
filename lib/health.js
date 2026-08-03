// lib/health.js — GET /api?action=health
//
// A cutover aid: confirms the API can reach Supabase and reports, per table,
// whether it exists, how many rows it holds, and which columns the API expects
// but can't find. Run it right after db/schema.sql and again after go-live.
import { q } from "./core.js";

// Columns the API actually reads or writes. Anything missing here breaks a
// specific action, so the health check names it explicitly.
const EXPECTED = {
  fleet: ["plate", "type", "location", "status", "current_client", "client_phone", "booked_from",
    "return_date", "remarks", "fuel_out", "amount", "currency", "garage", "payment_status",
    "amount_paid", "police_fine_out", "parking_fine_out", "km_out", "driver", "reg_card_url",
    "photos_url", "checked_out_by", "booking_type"],
  history: ["id", "timestamp", "plate", "type", "action", "client", "client_phone", "booked_from",
    "return_date", "location", "remarks", "staff_name", "fuel_out", "fuel_in", "amount", "currency",
    "police_fine", "parking_fine", "garage", "payment_status", "amount_paid", "km_out", "km_in", "driver"],
  config: ["id", "type", "value", "password", "role", "active"],
  settings: ["key", "value"],
  sold: ["id", "timestamp", "plate", "type", "remarks", "staff_name"],
  sub_hire: ["id", "status", "supplier_name", "supplier_contact", "vehicle_description", "client",
    "client_phone", "booked_from", "return_date", "actual_return", "location", "fuel_out", "fuel_in",
    "amount", "currency", "payment_status", "amount_paid", "supplier_amount", "supplier_currency",
    "supplier_pay_status", "supplier_amount_paid", "police_fine", "parking_fine", "remarks",
    "staff_name", "timestamp", "plate_no"],
  fuel: ["timestamp", "ref_no", "date", "plate", "vehicle_type", "product", "amount_tsh", "litres",
    "authorised_by", "submitted_by", "linked_client", "current_km"],
  reservations: ["id", "plate", "car_type", "client_name", "phone", "pickup_date", "return_date",
    "pick_up_from", "remarks", "staff_name", "timestamp"],
  blacklist: ["id", "name", "phone", "license_no", "license_image_url", "file_id", "added_by", "timestamp"],
  agreements: ["ref", "plate", "client", "staff_name", "timestamp", "drive_url", "file_id"],
  export_log: ["timestamp", "staff_name", "role", "export_type", "row_count", "filters"],
  files: ["id", "kind", "filename", "mime_type", "size_bytes", "data", "created_at", "created_by"],
  signature_tokens: ["token", "file_id", "url", "created_at"],
  staff_signatures: ["staff_name", "file_id", "url", "updated_at"],
};

export async function health() {
  const started = Date.now();
  if (!process.env.DATABASE_URL) {
    return { success: false, connected: false, error: "DATABASE_URL is not set on this deployment." };
  }

  let columns;
  try {
    columns = await q(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name = ANY($1)`,
      [Object.keys(EXPECTED)]
    );
  } catch (err) {
    return { success: false, connected: false, error: err.message };
  }

  const present = {};
  columns.forEach((r) => {
    (present[r.table_name] = present[r.table_name] || new Set()).add(r.column_name);
  });

  const tables = {};
  const problems = [];
  for (const [table, cols] of Object.entries(EXPECTED)) {
    if (!present[table]) {
      tables[table] = { exists: false };
      problems.push(`Table "${table}" is missing — run db/schema.sql.`);
      continue;
    }
    const missing = cols.filter((c) => !present[table].has(c));
    let rowCount = null;
    try {
      const r = await q(`SELECT count(*)::int AS n FROM "${table}"`);
      rowCount = r[0].n;
    } catch { /* count is nice to have, not worth failing the check */ }
    tables[table] = { exists: true, rowCount, missingColumns: missing };
    if (missing.length) problems.push(`Table "${table}" is missing column(s): ${missing.join(", ")} — run db/schema.sql.`);
  }

  return {
    success: problems.length === 0,
    connected: true,
    elapsedMs: Date.now() - started,
    legacyProxyConfigured: !!process.env.LEGACY_SCRIPT_URL,
    tables,
    problems,
  };
}
