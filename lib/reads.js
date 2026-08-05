// lib/reads.js — every GET action, returning the same JSON shape the frontend
// already consumes (camelCase keys, formatted dates, defaults).
import { q, S, D, T, todayTZ } from "./core.js";

// ── Row mappers ─────────────────────────────────────────────────────────────
const mapFleet = (r, idx) => ({
  rowIndex: idx + 2,
  plate: S(r.plate), type: S(r.type), location: S(r.location),
  status: r.status || "Available",
  currentClient: S(r.current_client), clientPhone: S(r.client_phone),
  bookedFrom: D(r.booked_from), returnDate: D(r.return_date),
  remarks: S(r.remarks), fuelOut: S(r.fuel_out), amount: S(r.amount),
  currency: r.currency || "TZS", garage: S(r.garage),
  paymentStatus: S(r.payment_status), amountPaid: S(r.amount_paid),
  policeFineOut: S(r.police_fine_out), parkingFineOut: S(r.parking_fine_out),
  kmOut: S(r.km_out), driver: S(r.driver),
  regCardUrl: S(r.reg_card_url), photosUrl: S(r.photos_url),
  checkedOutBy: S(r.checked_out_by), bookingType: r.booking_type || "Rental",
  nextServiceDueKm: r.next_service_due_km != null ? Number(r.next_service_due_km) : null,
  lastKnownOdometer: r.last_known_odometer != null ? Number(r.last_known_odometer) : null,
  odometerUpdatedAt: T(r.odometer_updated_at),
});

const mapHistory = (r) => ({
  timestamp: T(r.timestamp), plate: S(r.plate), type: S(r.type), action: S(r.action),
  client: S(r.client), clientPhone: S(r.client_phone),
  bookedFrom: D(r.booked_from), returnDate: D(r.return_date),
  location: S(r.location), remarks: S(r.remarks), staffName: S(r.staff_name),
  fuelOut: S(r.fuel_out), fuelIn: S(r.fuel_in), amount: S(r.amount), currency: S(r.currency),
  policeFine: S(r.police_fine), parkingFine: S(r.parking_fine), garage: S(r.garage),
  paymentStatus: S(r.payment_status), amountPaid: S(r.amount_paid),
  kmOut: S(r.km_out), kmIn: S(r.km_in), driver: S(r.driver),
});

const mapSubHire = (r, idx) => ({
  rowIndex: idx + 2,
  id: S(r.id), status: r.status || "Active", supplierName: S(r.supplier_name),
  supplierContact: S(r.supplier_contact), vehicleDesc: S(r.vehicle_description),
  client: S(r.client), clientPhone: S(r.client_phone),
  bookedFrom: D(r.booked_from), returnDate: D(r.return_date), actualReturn: D(r.actual_return),
  location: S(r.location), fuelOut: S(r.fuel_out), fuelIn: S(r.fuel_in),
  amount: S(r.amount), currency: r.currency || "TZS",
  paymentStatus: r.payment_status || "Unpaid", amountPaid: S(r.amount_paid),
  supplierAmount: S(r.supplier_amount), supplierCurrency: r.supplier_currency || "TZS",
  supplierPayStatus: r.supplier_pay_status || "Unpaid", supplierAmountPaid: S(r.supplier_amount_paid),
  policeFine: S(r.police_fine), parkingFine: S(r.parking_fine),
  remarks: S(r.remarks), staffName: S(r.staff_name), timestamp: T(r.timestamp), plate: S(r.plate_no),
});

const mapFuel = (r) => ({
  timestamp: T(r.timestamp), refNo: S(r.ref_no), date: D(r.date), plate: S(r.plate),
  type: S(r.vehicle_type), product: S(r.product), amount: S(r.amount_tsh), litres: S(r.litres),
  authorisedBy: S(r.authorised_by), submittedBy: S(r.submitted_by), linkedClient: S(r.linked_client),
});

const mapReservation = (r) => ({
  id: S(r.id), plate: S(r.plate), carType: S(r.car_type), client: S(r.client_name),
  phone: S(r.phone), pickupDate: D(r.pickup_date), returnDate: D(r.return_date),
  pickUpFrom: S(r.pick_up_from), remarks: S(r.remarks), staffName: S(r.staff_name), timestamp: T(r.timestamp),
  bookingType: S(r.booking_type) || "Rental", dropOffTo: S(r.drop_off_to), transferDate: D(r.transfer_date),
});

const mapBlacklist = (r) => ({
  id: S(r.id), name: S(r.name), phone: S(r.phone), licenseNo: S(r.license_no),
  imageUrl: S(r.license_image_url), fileId: S(r.file_id), addedBy: S(r.added_by), timestamp: T(r.timestamp),
});

const mapMaintenance = (r) => ({
  id: S(r.id), refNo: S(r.ref_no), plate: S(r.plate), openedBy: S(r.opened_by), assignedMechanic: S(r.assigned_mechanic),
  issueDescription: S(r.issue_description), status: S(r.status) || "Queued",
  dateOpened: T(r.date_opened), dateClosed: T(r.date_closed), odometer: S(r.odometer),
  partsCost: Number(r.parts_cost) || 0, laborCost: Number(r.labor_cost) || 0, totalCost: Number(r.total_cost) || 0,
  notes: S(r.notes),
});

// ── Fleet ───────────────────────────────────────────────────────────────────
export async function getFleet() {
  const rows = await q(`SELECT * FROM fleet ORDER BY plate`);
  return { success: true, data: rows.map(mapFleet) };
}
export async function getCarByPlate({ plate }) {
  if (!plate) return { success: false, error: "Plate required" };
  const rows = await q(`SELECT * FROM fleet WHERE lower(btrim(plate))=lower(btrim($1)) LIMIT 1`, [plate]);
  if (!rows.length) return { success: false, error: "Car not found: " + plate };
  return { success: true, data: mapFleet(rows[0], 0) };
}

// ── History ─────────────────────────────────────────────────────────────────
export async function getHistory() {
  const rows = await q(`SELECT * FROM history ORDER BY id DESC`);
  return { success: true, data: rows.map(mapHistory), total: rows.length };
}
export async function getCarHistory({ plate }) {
  if (!plate) return { success: true, data: [] };
  const rows = await q(`SELECT * FROM history WHERE lower(btrim(plate))=lower(btrim($1)) ORDER BY id DESC`, [plate]);
  return { success: true, data: rows.map(mapHistory) };
}
export async function getHistoryByStaff({ staffName }) {
  if (!staffName) return { success: true, data: [] };
  const rows = await q(`SELECT * FROM history WHERE lower(btrim(staff_name))=lower(btrim($1)) ORDER BY id DESC`, [staffName]);
  return { success: true, data: rows.map(mapHistory) };
}

// ── Sold ────────────────────────────────────────────────────────────────────
export async function getSold() {
  const rows = await q(`SELECT * FROM sold ORDER BY id DESC`);
  return {
    success: true,
    data: rows.map((r) => ({ timestamp: T(r.timestamp), plate: S(r.plate), type: S(r.type), remarks: S(r.remarks), staffName: S(r.staff_name) })),
  };
}

// ── Config / staff ──────────────────────────────────────────────────────────
export async function getConfig() {
  const rows = await q(`SELECT type, value, COALESCE(active,'TRUE') AS active FROM config`);
  const pick = (t) => rows.filter((r) => r.type === t && r.value).map((r) => r.value);
  const staff = rows
    .filter((r) => r.type === "Staff" && r.value && String(r.active).trim().toUpperCase() !== "FALSE")
    .map((r) => r.value);
  return {
    success: true,
    staff,
    locations: pick("Location"),
    garages: pick("Garage"),
    drivers: pick("Driver"),
    fuelAccess: pick("FuelAccess"),
  };
}
export async function getStaffList() {
  const rows = await q(`SELECT value, role, COALESCE(active,'TRUE') AS active FROM config WHERE type='Staff' AND value<>''`);
  return {
    success: true,
    staff: rows.map((r) => ({ name: r.value, role: r.role || "Staff", active: String(r.active).trim().toUpperCase() !== "FALSE" })),
  };
}

// ── Settings ────────────────────────────────────────────────────────────────
// settings.value is a boolean column in Supabase; the app expects "TRUE"/"FALSE"
// strings, so convert on the way out.
export async function getSettings() {
  const rows = await q(`SELECT key, value FROM settings`);
  const settings = {};
  rows.forEach((r) => {
    if (r.key) settings[r.key] = r.value === true ? "TRUE" : r.value === false ? "FALSE" : S(r.value);
  });
  if (!("RentalAgreementEnabled" in settings)) settings.RentalAgreementEnabled = "TRUE";
  return { success: true, settings };
}

// ── Clients (aggregated from History) ───────────────────────────────────────
export async function getClients() {
  const rows = await q(`SELECT * FROM history`);
  const clients = {};
  rows.forEach((r) => {
    const action = r.action || "";
    const client = String(r.client || "").trim();
    if (!client || action !== "Checked Out") return;
    if (!clients[client]) {
      clients[client] = { name: client, phone: S(r.client_phone), totalRentals: 0, lastRentalDate: "", totalAmount: 0, currency: r.currency || "TZS", unpaidCount: 0, rentals: [] };
    }
    const c = clients[client];
    c.totalRentals++;
    const ts = D(r.timestamp);
    if (!c.lastRentalDate || ts > c.lastRentalDate) c.lastRentalDate = ts;
    c.totalAmount += Number(r.amount) || 0;
    const payStatus = r.payment_status || "";
    if (payStatus === "Unpaid" || payStatus === "Partial Paid") c.unpaidCount++;
    c.rentals.push({ date: ts, plate: S(r.plate), type: S(r.type), returnDate: D(r.return_date), amount: S(r.amount), currency: r.currency || "TZS", payStatus, location: S(r.location), staff: S(r.staff_name) });
  });
  return { success: true, data: Object.values(clients).sort((a, b) => b.lastRentalDate.localeCompare(a.lastRentalDate)) };
}

// ── Sub-Hire ────────────────────────────────────────────────────────────────
export async function getSubHire() {
  const rows = await q(`SELECT * FROM sub_hire ORDER BY timestamp ASC NULLS FIRST, id`);
  return { success: true, data: rows.map(mapSubHire) };
}

// ── Fuel ────────────────────────────────────────────────────────────────────
export async function getFuel() {
  const rows = await q(`SELECT * FROM fuel ORDER BY timestamp DESC NULLS LAST, ref_no DESC`);
  return { success: true, data: rows.map(mapFuel) };
}
export async function getFuelByPlate({ plate }) {
  if (!plate) return { success: true, data: [] };
  const rows = await q(`SELECT * FROM fuel WHERE lower(btrim(plate))=lower(btrim($1)) ORDER BY timestamp DESC NULLS LAST, ref_no DESC`, [plate]);
  return { success: true, data: rows.map(mapFuel) };
}

// ── Reservations ────────────────────────────────────────────────────────────
export async function getReservations({ month, year } = {}) {
  const rows = await q(`SELECT * FROM reservations ORDER BY timestamp ASC NULLS FIRST, id`);
  let data = rows.map(mapReservation).filter((r) => r.id && (r.pickupDate || r.transferDate));
  if (month && year) {
    const key = `${String(year)}-${String(month).padStart(2, "0")}`;
    data = data.filter((r) =>
      (r.pickupDate && r.pickupDate.startsWith(key)) ||
      (r.returnDate && r.returnDate.startsWith(key)) ||
      (r.transferDate && r.transferDate.startsWith(key))
    );
  }
  return { success: true, data };
}

// ── Blacklist ───────────────────────────────────────────────────────────────
export async function getBlacklist() {
  const rows = await q(`SELECT * FROM blacklist ORDER BY timestamp ASC NULLS FIRST, id`);
  return { success: true, data: rows.map(mapBlacklist).filter((r) => r.id) };
}

// ── Maintenance ─────────────────────────────────────────────────────────────
export async function getMaintenanceLog() {
  const rows = await q(`SELECT * FROM maintenance_log ORDER BY date_opened DESC NULLS LAST, id DESC`);
  return { success: true, data: rows.map(mapMaintenance).filter((r) => r.id) };
}

export async function getMaintenanceItems({ workOrderId } = {}) {
  if (!workOrderId) return { success: true, data: [] };
  const rows = await q(`SELECT * FROM maintenance_items WHERE work_order_id=$1 ORDER BY created_at ASC, id ASC`, [workOrderId]);
  return {
    success: true,
    data: rows.map((r) => ({
      id: S(r.id), workOrderId: S(r.work_order_id), itemName: S(r.item_name),
      quantity: Number(r.quantity) || 0, unitCost: Number(r.unit_cost) || 0, lineTotal: Number(r.line_total) || 0,
    })),
  };
}

// For Analytics — every item across every work order in one query, rather
// than one getMaintenanceItems call per work order (which would be an N+1
// fetch pattern that gets worse as the fleet's maintenance history grows).
export async function getAllMaintenanceItems() {
  const rows = await q(`SELECT * FROM maintenance_items ORDER BY created_at ASC, id ASC`);
  return {
    success: true,
    data: rows.map((r) => ({
      id: S(r.id), workOrderId: S(r.work_order_id), itemName: S(r.item_name),
      quantity: Number(r.quantity) || 0, unitCost: Number(r.unit_cost) || 0, lineTotal: Number(r.line_total) || 0,
    })),
  };
}

export async function getMaintenanceUpdates({ workOrderId } = {}) {
  if (!workOrderId) return { success: true, data: [] };
  const rows = await q(`SELECT * FROM maintenance_updates WHERE work_order_id=$1 ORDER BY created_at DESC, id DESC`, [workOrderId]);
  return {
    success: true,
    data: rows.map((r) => ({
      id: S(r.id), workOrderId: S(r.work_order_id), author: S(r.author), message: S(r.message), createdAt: T(r.created_at),
    })),
  };
}

// ── Leads ───────────────────────────────────────────────────────────────────
const mapLead = (r) => ({
  id: S(r.id), clientName: S(r.client_name), phone: S(r.phone),
  bookingType: S(r.booking_type) || "Rental", pickUpLocation: S(r.pick_up_location), vehicle: S(r.vehicle),
  pickupDate: D(r.pickup_date), returnDate: D(r.return_date),
  source: S(r.source) || "WhatsApp", stage: S(r.stage) || "New", outcome: S(r.outcome),
  assignedStaff: S(r.assigned_staff), notes: S(r.notes), lostReason: S(r.lost_reason),
  lastContactDate: T(r.last_contact_date), convertedReservationId: S(r.converted_reservation_id),
  createdAt: T(r.created_at), updatedAt: T(r.updated_at),
});

export async function getLeads() {
  const rows = await q(`SELECT * FROM leads ORDER BY created_at DESC NULLS LAST, id DESC`);
  return { success: true, data: rows.map(mapLead).filter((r) => r.id) };
}

// ── Dashboard ───────────────────────────────────────────────────────────────
export async function getDashboard() {
  const today = todayTZ();
  const fleet = await q(`SELECT status, return_date, currency, amount, amount_paid, payment_status FROM fleet`);
  const hist = await q(`SELECT id, timestamp, plate, action, client, staff_name, currency, amount_paid FROM history ORDER BY id`);
  let dueToday = 0, overdue = 0, checkedOutToday = 0, returnedToday = 0;
  const collectedToday = { TZS: 0, USD: 0 }, outstanding = { TZS: 0, USD: 0 };
  fleet.forEach((r) => {
    const status = r.status, returnDate = D(r.return_date);
    const currency = r.currency || "TZS", amount = Number(r.amount) || 0, amountPaid = Number(r.amount_paid) || 0;
    const paymentStatus = r.payment_status || "";
    if (status === "Rented" && returnDate) {
      if (returnDate === today) dueToday++;
      else if (returnDate < today) overdue++;
    }
    if (status === "Rented" && (paymentStatus === "Unpaid" || paymentStatus === "Partial Paid")) {
      const owed = amount - amountPaid;
      if (owed > 0) outstanding[currency] = (outstanding[currency] || 0) + owed;
    }
  });
  hist.forEach((r) => {
    const ts = D(r.timestamp), action = r.action, currency = r.currency || "TZS", amountPaid = Number(r.amount_paid) || 0;
    if (ts === today) {
      if (action === "Checked Out") checkedOutToday++;
      if (action === "Returned") returnedToday++;
      if (amountPaid > 0) collectedToday[currency] = (collectedToday[currency] || 0) + amountPaid;
    }
  });
  const recentActivity = hist.slice().reverse().slice(0, 15).map((r) => ({ timestamp: T(r.timestamp), plate: S(r.plate), action: S(r.action), client: S(r.client), staffName: S(r.staff_name) }));
  return { success: true, today, checkedOutToday, returnedToday, dueToday, overdue, collectedToday, outstanding, recentActivity };
}
