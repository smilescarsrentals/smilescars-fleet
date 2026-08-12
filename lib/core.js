// lib/core.js — formatting, type-aware write coercion, auth, and the shared
// write helpers (insert / update / the Fleet-row + History pattern).
import { q, q1, run, tx } from "./db.js";
import crypto from "node:crypto";

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
  customer_jobs: ["total_cost", "price_charged", "amount_paid"],
  customer_job_items: ["quantity", "unit_cost", "line_total"],
  purchase_invoices: ["total_amount"],
  purchase_invoice_items: ["quantity", "unit_price", "line_total"],
  part_cost_history: ["old_unit_cost", "new_unit_cost"],
  service_templates: ["interval_km", "interval_months"],
  service_template_parts: ["quantity"],
  car_service_assignments: ["last_done_km"],
  checklist_template_items: ["sort_order"],
  checklist_instance_items: ["sort_order"],
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
  vendor_categories: ["created_at"],
  vendor_locations: ["created_at"],
  notifications: ["read_at", "created_at"],
  push_subscriptions: ["created_at", "last_used_at"],
  purchase_invoices: ["created_at", "updated_at"],
  purchase_invoice_items: ["created_at"],
  part_cost_history: ["created_at"],
  notification_trigger_settings: ["updated_at"],
  parts: ["created_at", "updated_at"],
  customer_jobs: ["date_opened", "date_closed", "created_at", "updated_at"],
  customer_job_items: ["created_at"],
  customer_job_updates: ["created_at"],
  service_templates: ["created_at", "updated_at"],
  service_template_parts: ["created_at"],
  car_service_assignments: ["last_done_date", "created_at", "updated_at"],
  checklist_templates: ["created_at", "updated_at"],
  checklist_template_items: ["created_at"],
  checklist_instances: ["created_at", "updated_at"],
  checklist_instance_items: ["created_at"],
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

// Driver records/documents: Admin always allowed; everyone else needs the
// can_manage_drivers flag explicitly granted in Admin Panel — role alone
// (Manager/Garage Manager) is deliberately NOT sufficient here, per
// instruction ("Admin and specific staff only"). Uses its own lookup
// rather than staffRow(), which doesn't select can_manage_drivers (kept
// staffRow's shape unchanged since it's shared by login and other checks).
export async function requireDriverManageAccess(name) {
  const row = await q1(
    `SELECT role, COALESCE(active,'TRUE') AS active, COALESCE(can_manage_drivers,'FALSE') AS can_manage_drivers
       FROM config WHERE type='Staff' AND btrim(value)=btrim($1) LIMIT 1`,
    [name]
  );
  if (row && !staffActive(row)) throw new Error("This account has been deactivated.");
  const role = row ? String(row.role || "Staff").trim() : "Staff";
  if (role === "Admin") return;
  const canManage = row ? String(row.can_manage_drivers).trim().toUpperCase() === "TRUE" : false;
  if (!canManage) throw new Error("You don't have permission to manage driver records.");
}

// Garage-facing labels ("SmilesCars Garage" / "SmilesCars Office") stay
// meaningful to Garage staff, but map to the REAL Fleet location values so
// a car physically sitting there shows the correct location everywhere
// else in the app too. Single source of truth — used both when writing
// Fleet's own location field and when recording a work order's location.
export const INTERNAL_LOCATION_MAP = {
  "SmilesCars Garage": "Kinondoni",
  "SmilesCars Office": "Dar - NBAA",
};
export function realFleetLocation(internalLabel) {
  return INTERNAL_LOCATION_MAP[internalLabel] || internalLabel;
}

// Shared by every notification trigger across the app, so recipients,
// dedup, and the read/unread shape stay consistent everywhere. recipient
// is either a specific staff name (individual) or a role string like
// "Garage Manager" / "Admin" (see notifyRole below for broadcasting to a
// whole role). dedupeKey is optional — pass one for anything that could
// otherwise fire twice (e.g. a scheduled check re-running); a duplicate
// insert is silently ignored rather than erroring, since two code paths
// racing to create the "same" notification is expected, not a bug.
// Phase 2d: all 6 original triggers now push. Phase 2c proved the
// pipeline with fleet_to_garage (action-triggered) and
// reservation_reminder (scheduled/cron) — this just extends the same
// allowlist to the remaining 4; the send mechanism itself is unchanged.
const PUSH_ENABLED_TYPES = new Set([
  "fleet_to_garage",
  "reservation_reminder",
  "low_stock",
  "car_out_for_service",
  "car_back_from_service",
  "unpaid_customer_job",
  "driver_document_expiry",
]);

export async function createNotification({ recipient, type, title, message, linkPath, dedupeKey }) {
  if (!recipient || !type || !title) return null;
  // Admin Panel's per-trigger on/off — checked once here, so a muted
  // trigger is suppressed everywhere (bell AND push), not just push. Fails
  // OPEN (treats a missing/unreadable settings row as enabled) so a
  // settings-table hiccup never silently swallows real notifications.
  try {
    const setting = await q1(`SELECT enabled FROM notification_trigger_settings WHERE type=$1`, [type]);
    if (setting && String(setting.enabled).trim().toUpperCase() === "FALSE") return null;
  } catch (e) {
    console.error("notification_trigger_settings lookup failed, proceeding as enabled:", e.message);
  }
  const id = "NOTIF-" + crypto.randomUUID().split("-")[0].toUpperCase();
  try {
    const rows = await q(
      `INSERT INTO notifications (id, recipient, type, title, message, link_path, dedupe_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
       RETURNING id`,
      [id, recipient, type, title, message || "", linkPath || "", dedupeKey || null]
    );
    // RETURNING comes back empty when the dedupe conflict skipped the
    // insert — don't push for a notification that wasn't actually created
    // (e.g. a scheduled check re-running within the same day).
    const actuallyCreated = rows && rows.length > 0;
    if (actuallyCreated && PUSH_ENABLED_TYPES.has(type)) {
      // Never let a push failure affect the in-app notification, which is
      // already safely committed above by this point.
      sendPushToStaff(recipient, { title, body: message || "", url: linkPath || "/" }).catch((e) => {
        console.error("sendPushToStaff failed:", e.message);
      });
    }
    return id;
  } catch (e) {
    console.error("createNotification failed:", e.message);
    return null;
  }
}

// Sends a real push to every device the given staff member has enabled
// push on. Best-effort per-subscription: one dead device (expired/
// unsubscribed) doesn't stop the others from receiving it, and a 404/410
// response (the push service's way of saying "this subscription is gone
// for good") triggers cleanup so it stops being retried forever.
async function sendPushToStaff(staffName, payload) {
  const publicKey = process.env.VITE_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return; // not configured yet — silently skip, in-app notification already exists
  const subs = await q(`SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE staff_name=$1`, [staffName]);
  if (subs.length === 0) return;

  const webpushModule = await import("web-push");
  const webpush = webpushModule.default; // web-push is CommonJS; dynamic import lands its real exports under .default, not top-level
  webpush.setVapidDetails("mailto:admin@smilescars.co.tz", publicKey, privateKey);

  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      );
      await run(`UPDATE push_subscriptions SET last_used_at = now() WHERE id=$1`, [sub.id]);
    } catch (e) {
      const statusCode = e && e.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        // Subscription is permanently gone (browser unsubscribed, user
        // cleared site data, etc.) — remove it so we stop trying.
        await run(`DELETE FROM push_subscriptions WHERE id=$1`, [sub.id]).catch(() => {});
      } else {
        console.error(`Push send failed for subscription ${sub.id}:`, e.message);
      }
    }
  }));
}

// Broadcasts a notification to every active staff member with the given
// role, using the role name itself as each notification's recipient isn't
// right — recipients need to be resolvable to "who should see this in
// their bell," so this fans out to each matching staff member's own name
// instead of storing the role as a single shared row.
export async function notifyRole(role, { type, title, message, linkPath, dedupeKey }) {
  const staff = await q(`SELECT value FROM config WHERE type='Staff' AND role=$1 AND COALESCE(active,'TRUE')='TRUE'`, [role]);
  for (const s of staff) {
    await createNotification({
      recipient: s.value, type, title, message, linkPath,
      dedupeKey: dedupeKey ? `${dedupeKey}:${s.value}` : null,
    });
  }
}

// Garage Manager gets real Fleet access for Maintenance / Mark Available —
// that IS their job now — but stays blocked from rental-operations actions
// (Check Out, Extend Booking, Staff Use, Move, Sold, Replace, Returned).
// This is the backend half of the frontend's per-status button gating in
// FleetPage.jsx — without this, someone could bypass the hidden buttons by
// calling the API directly.
export async function requireNotGarageManager(name) {
  const row = await staffRow(name);
  if (row && !staffActive(row)) throw new Error("This account has been deactivated.");
  const role = row ? String(row.role || "Staff").trim() : "Staff";
  if (role === "Garage Manager")
    throw new Error("Garage Managers don't have access to this action.");
}

