// lib/core.js — formatting, type-aware write coercion, auth, and the shared
// write helpers (insert / update / the Fleet-row + History pattern).
import { q, q1, run, tx } from "./db.js";

export { q, q1, run, tx };

// ── Column types (authoritative — matches how the tables were built) ────────
// Any column listed here as numeric/timestamp must receive NULL (not "") when
// the app tries to "clear" it, or Postgres rejects the write.
const NUMERIC = {
  fleet: ["amount", "amount_paid", "police_fine_out", "parking_fine_out", "next_service_due_km", "last_known_odometer"],
  history: ["amount", "police_fine", "amount_paid"],
  sub_hire: ["amount", "amount_paid", "supplier_amount", "supplier_amount_paid", "police_fine", "parking_fine"],
  fuel: ["current_km"],
  maintenance_log: ["parts_cost", "labor_cost", "total_cost", "flat_cost"],
  maintenance_items: ["quantity", "unit_cost", "line_total"],
  parts: ["unit_cost", "quantity_on_hand", "reorder_threshold"],
};
const TIMESTAMP = {
  fleet: ["booked_from", "return_date", "odometer_updated_at"],
  history: ["timestamp", "booked_from", "return_date"],
  sub_hire: ["booked_from", "return_date", "actual_return", "timestamp"],
  fuel: ["timestamp", "date"],
  reservations: ["pickup_date", "return_date", "timestamp", "transfer_date", "cancelled_at"],
  sold: ["timestamp"],
  blacklist: ["timestamp"],
  agreements: ["timestamp"],
  export_log: ["timestamp"],
  maintenance_log: ["date_opened", "date_closed", "created_at", "updated_at"],
  maintenance_updates: ["created_at"],
  leads: ["pickup_date", "return_date", "last_contact_date", "created_at", "updated_at"],
  vendors: ["created_at", "updated_at"],
  parts: ["created_at", "updated_at"],
};
const BOOLEAN = { settings: ["value"] };

const inList = (map, t, c) => (map[t] || []).includes(c);

// Coerce a JS value for writing into `table.col`. Returns `undefined` to mean
// "skip this column in the statement".
export function coerce(table, col, val) {
  if (val === undefined) return undefined;
  if (inList(NUMERIC, table, col) || inList(TIMESTAMP, table, col)) {
    if (val === "" || val === null) return null;
  }
  if (inList(BOOLEAN, table, col)) {
    const s = String(val).trim().toUpperCase();
    return s === "TRUE" || s === "1" || s === "YES";
  }
  return val;
}

// ── Read formatting ─────────────────────────────────────────────────────────
export const S = (v) => (v === null || v === undefined ? "" : v); // pass-through, null -> ""
export const D = (v) => (v ? String(v).slice(0, 10) : ""); // "YYYY-MM-DD"
export const T = (v) => {
  if (!v) return "";
  const s = String(v);
  return s.length >= 19 ? s.slice(0, 10) + "T" + s.slice(11, 19) : s.slice(0, 10);
}; // "YYYY-MM-DDTHH:mm:ss"

// Tanzania is UTC+3 year-round (no DST). Produce a naive local timestamp string
// so new rows line up with the existing (local-time) data.
export function nowTZ() {
  return new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ");
}
export const todayTZ = () => nowTZ().slice(0, 10);

// ── Generic write builders ──────────────────────────────────────────────────
export async function insert(table, obj, returning) {
  const cols = [], ph = [], vals = [];
  let i = 1;
  for (const [c, v] of Object.entries(obj)) {
    cols.push(`"${c}"`);
    ph.push(`$${i++}`);
    vals.push(coerce(table, c, v));
  }
  const ret = returning ? ` RETURNING ${returning}` : "";
  const rows = await q(`INSERT INTO "${table}" (${cols.join(",")}) VALUES (${ph.join(",")})${ret}`, vals);
  return rows[0] || null;
}

// UPDATE table SET ... WHERE whereCol = whereVal. Skips undefined fields.
// Returns affected row count.
export async function update(table, setObj, whereCol, whereVal) {
  const set = [], vals = [];
  let i = 1;
  for (const [c, v] of Object.entries(setObj)) {
    const cv = coerce(table, c, v);
    if (cv === undefined) continue;
    set.push(`"${c}"=$${i++}`);
    vals.push(cv);
  }
  if (!set.length) return 0;
  vals.push(whereVal);
  return run(`UPDATE "${table}" SET ${set.join(",")} WHERE "${whereCol}"=$${i}`, vals);
}

// Map a camelCase field object to snake_case columns, keeping only present keys.
export function mapFields(map, fields) {
  const o = {};
  for (const k of Object.keys(map)) if (fields[k] !== undefined) o[map[k]] = fields[k];
  return o;
}

// Fleet field (camelCase from the app) -> Fleet column (snake_case in Supabase).
export const FLEET_MAP = {
  location: "location", status: "status", currentClient: "current_client",
  clientPhone: "client_phone", bookedFrom: "booked_from", returnDate: "return_date",
  remarks: "remarks", fuelOut: "fuel_out", amount: "amount", currency: "currency",
  garage: "garage", paymentStatus: "payment_status", amountPaid: "amount_paid",
  policeFineOut: "police_fine_out", parkingFineOut: "parking_fine_out", kmOut: "km_out",
  driver: "driver", checkedOutBy: "checked_out_by", bookingType: "booking_type",
  nextServiceDueKm: "next_service_due_km", lastKnownOdometer: "last_known_odometer",
  odometerUpdatedAt: "odometer_updated_at",
};

export async function updateFleetRow(plate, fields) {
  const n = await update("fleet", mapFields(FLEET_MAP, fields), "plate", plate);
  if (!n) throw new Error("Car not found: " + plate);
}

// Mirror of the Apps Script clearFleetRow: reset a car to a status, blanking the
// rental fields. Numeric/date blanks become NULL via coerce().
export async function clearFleetRow(plate, status, extra = {}) {
  await updateFleetRow(plate, Object.assign({
    status, currentClient: "", clientPhone: "", bookedFrom: "", returnDate: "",
    remarks: extra.remarks || "", fuelOut: "", amount: "", currency: "", garage: "",
    paymentStatus: "", amountPaid: "", policeFineOut: "", parkingFineOut: "",
    kmOut: "", driver: "", bookingType: "",
  }, extra));
}

// Append a row to History (surrogate id auto-fills).
export async function addHistory(e) {
  await insert("history", {
    timestamp: nowTZ(),
    plate: e.plate || "", type: e.type || "", action: e.action || "",
    client: e.client || "", client_phone: e.clientPhone || "",
    booked_from: e.bookedFrom || "", return_date: e.returnDate || "",
    location: e.location || "", remarks: e.remarks || "", staff_name: e.staffName || "",
    fuel_out: e.fuelOut || "", fuel_in: e.fuelIn || "", amount: e.amount || "",
    currency: e.currency || "", police_fine: e.policeFine || "", parking_fine: e.parkingFine || "",
    garage: e.garage || "", payment_status: e.paymentStatus || "", amount_paid: e.amountPaid || "",
    km_out: e.kmOut || "", km_in: e.kmIn || "", driver: e.driver || "",
  });
}

// ── Auth / roles (Config table) ─────────────────────────────────────────────
// Requires an `active` column on config (see db/schema.sql).
export async function staffRow(name) {
  return q1(
    `SELECT value, password, role, COALESCE(active,'TRUE') AS active
       FROM config WHERE type='Staff' AND btrim(value)=btrim($1) LIMIT 1`,
    [name]
  );
}
export const staffActive = (row) => !!row && String(row.active).trim().toUpperCase() !== "FALSE";

export async function requireManagerOrAdmin(name) {
  const row = await staffRow(name);
  if (row && !staffActive(row)) throw new Error("This account has been deactivated.");
  const role = row ? String(row.role || "Staff").trim() : "Staff";
  if (role !== "Manager" && role !== "Admin")
    throw new Error("This action requires a Manager or Admin account.");
}

// Maintenance is Garage Manager's operational tool. Manager gets full
// visibility (dashboard, analytics) but is explicitly view-only there —
// this blocks writes even if someone bypasses the UI (e.g. calling the API
// directly), matching the frontend's canEdit gating in MaintenancePage.jsx.
export async function requireMaintenanceEditAccess(name) {
  const row = await staffRow(name);
  if (row && !staffActive(row)) throw new Error("This account has been deactivated.");
  const role = row ? String(row.role || "Staff").trim() : "Staff";
  if (role === "Manager")
    throw new Error("Managers have view-only access to Maintenance.");
}
