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
  pickUpCity: S(r.pick_up_city), dropOffCity: S(r.drop_off_city),
  status: S(r.status) || "Active", cancelReason: S(r.cancel_reason),
  cancelledBy: S(r.cancelled_by), cancelledAt: T(r.cancelled_at),
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
  serviceLocationType: S(r.service_location_type) || "Internal", internalLocation: S(r.internal_location),
  externalVendorId: S(r.external_vendor_id), externalVendorLocation: S(r.external_vendor_location), flatCost: r.flat_cost != null ? Number(r.flat_cost) : null,
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
  const rows = await q(`SELECT value, role, phone, COALESCE(active,'TRUE') AS active, COALESCE(receives_all_reservation_reminders,'FALSE') AS receives_all_reservation_reminders FROM config WHERE type='Staff' AND value<>''`);
  return {
    success: true,
    staff: rows.map((r) => ({
      name: r.value, role: r.role || "Staff", phone: r.phone || "", active: String(r.active).trim().toUpperCase() !== "FALSE",
      receivesAllReservationReminders: String(r.receives_all_reservation_reminders).trim().toUpperCase() === "TRUE",
    })),
  };
}

// Richer than config.drivers (which stays a flat string list for
// AdminPanel's generic ConfigListEditor, unchanged) — this one includes
// phone, for the DriverPicker type-ahead and the rental agreement.
export async function getDrivers() {
  const rows = await q(`SELECT value, phone FROM config WHERE type='Driver' AND value<>'' ORDER BY value ASC`);
  return { success: true, data: rows.map((r) => ({ name: r.value, phone: r.phone || "" })) };
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
      id: S(r.id), workOrderId: S(r.work_order_id), itemName: S(r.item_name), partId: S(r.part_id),
      supplierVendorId: S(r.supplier_vendor_id), supplierLocation: S(r.supplier_location),
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
      id: S(r.id), workOrderId: S(r.work_order_id), itemName: S(r.item_name), partId: S(r.part_id),
      supplierVendorId: S(r.supplier_vendor_id), supplierLocation: S(r.supplier_location),
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

// ── Garage: Customer Jobs (outside customers' cars, not our fleet) ─────────
const mapCustomerJob = (r) => ({
  id: S(r.id), refNo: S(r.ref_no), customerName: S(r.customer_name), customerPhone: S(r.customer_phone),
  plate: S(r.plate), carDescription: S(r.car_description), assignedMechanic: S(r.assigned_mechanic),
  issueDescription: S(r.issue_description), status: S(r.status) || "Queued", odometer: S(r.odometer), notes: S(r.notes),
  totalCost: Number(r.total_cost) || 0, priceCharged: Number(r.price_charged) || 0,
  paymentStatus: S(r.payment_status) || "Unpaid", amountPaid: Number(r.amount_paid) || 0,
  openedBy: S(r.opened_by), dateOpened: T(r.date_opened), dateClosed: T(r.date_closed),
});

export async function getCustomerJobs() {
  const rows = await q(`SELECT * FROM customer_jobs ORDER BY date_opened DESC NULLS LAST, id DESC`);
  return { success: true, data: rows.map(mapCustomerJob).filter((r) => r.id) };
}

export async function getCustomerJobItems({ jobId } = {}) {
  if (!jobId) return { success: true, data: [] };
  const rows = await q(`SELECT * FROM customer_job_items WHERE job_id=$1 ORDER BY created_at ASC, id ASC`, [jobId]);
  return {
    success: true,
    data: rows.map((r) => ({
      id: S(r.id), jobId: S(r.job_id), itemName: S(r.item_name), partId: S(r.part_id),
      supplierVendorId: S(r.supplier_vendor_id), supplierLocation: S(r.supplier_location),
      quantity: Number(r.quantity) || 0, unitCost: Number(r.unit_cost) || 0, lineTotal: Number(r.line_total) || 0,
    })),
  };
}

export async function getCustomerJobUpdates({ jobId } = {}) {
  if (!jobId) return { success: true, data: [] };
  const rows = await q(`SELECT * FROM customer_job_updates WHERE job_id=$1 ORDER BY created_at DESC, id DESC`, [jobId]);
  return {
    success: true,
    data: rows.map((r) => ({
      id: S(r.id), jobId: S(r.job_id), author: S(r.author), message: S(r.message), createdAt: T(r.created_at),
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

// ── Garage: Vendors & Parts ────────────────────────────────────────────────
const mapVendor = (r) => ({
  id: S(r.id), name: S(r.name), contactPerson: S(r.contact_person), phone: S(r.phone),
  location: S(r.location), categories: S(r.categories), paymentTerms: S(r.payment_terms),
  vendorType: S(r.vendor_type) || "Parts Supplier",
  notes: S(r.notes), active: String(r.active).trim().toUpperCase() !== "FALSE",
});

export async function getVendors() {
  const rows = await q(`SELECT * FROM vendors ORDER BY name ASC`);
  const vendors = rows.map(mapVendor).filter((r) => r.id);
  // Attach each vendor's categories and locations in two extra queries
  // rather than N+1 per vendor.
  const linkRows = await q(
    `SELECT vcl.vendor_id, vc.id AS category_id, vc.name AS category_name
       FROM vendor_category_links vcl JOIN vendor_categories vc ON vc.id = vcl.category_id`
  );
  const byVendor = {};
  linkRows.forEach((r) => {
    (byVendor[r.vendor_id] ||= []).push({ id: S(r.category_id), name: S(r.category_name) });
  });
  vendors.forEach((v) => { v.categoryList = byVendor[v.id] || []; });

  const locRows = await q(`SELECT * FROM vendor_locations ORDER BY name ASC`);
  const locByVendor = {};
  locRows.forEach((r) => {
    (locByVendor[r.vendor_id] ||= []).push({ id: S(r.id), name: S(r.name) });
  });
  vendors.forEach((v) => { v.locationList = locByVendor[v.id] || []; });

  return { success: true, data: vendors };
}

export async function getVendorCategories() {
  const rows = await q(`SELECT * FROM vendor_categories ORDER BY name ASC`);
  return { success: true, data: rows.map((r) => ({ id: S(r.id), name: S(r.name) })).filter((r) => r.id) };
}

// ── Notifications ────────────────────────────────────────────────────────
const mapNotification = (r) => ({
  id: S(r.id), recipient: S(r.recipient), type: S(r.type), title: S(r.title), message: S(r.message),
  linkPath: S(r.link_path), read: String(r.read).trim().toUpperCase() === "TRUE",
  readAt: T(r.read_at), createdAt: T(r.created_at),
});

// Bell dropdown: unread first, newest first — matches the index shape
// exactly, so this stays fast as notifications accumulate.
export async function getNotifications({ staffName } = {}) {
  if (!staffName) return { success: true, data: [] };
  const rows = await q(
    `SELECT * FROM notifications WHERE recipient=$1 ORDER BY read ASC, created_at DESC LIMIT 50`,
    [staffName]
  );
  return { success: true, data: rows.map(mapNotification).filter((r) => r.id) };
}

export async function getUnreadNotificationCount({ staffName } = {}) {
  if (!staffName) return { success: true, count: 0 };
  const row = await q1(`SELECT count(*) AS c FROM notifications WHERE recipient=$1 AND read='FALSE'`, [staffName]);
  return { success: true, count: Number(row?.c) || 0 };
}

// ── Push Subscriptions ───────────────────────────────────────────────────
// Lets the frontend know which of the CURRENT device's subscriptions (if
// any) already exists, so the toggle can show "enabled on this device"
// correctly rather than always defaulting to off after a page reload.
export async function getPushSubscriptions({ staffName } = {}) {
  if (!staffName) return { success: true, data: [] };
  const rows = await q(`SELECT * FROM push_subscriptions WHERE staff_name=$1 ORDER BY created_at DESC`, [staffName]);
  return {
    success: true,
    data: rows.map((r) => ({
      id: S(r.id), staffName: S(r.staff_name), endpoint: S(r.endpoint),
      userAgent: S(r.user_agent), createdAt: T(r.created_at), lastUsedAt: T(r.last_used_at),
    })).filter((r) => r.id),
  };
}

// Admin Panel: per-trigger on/off, for the settings area.
export async function getNotificationTriggerSettings() {
  const rows = await q(`SELECT * FROM notification_trigger_settings ORDER BY label ASC`);
  return {
    success: true,
    data: rows.map((r) => ({
      type: S(r.type), label: S(r.label), enabled: String(r.enabled).trim().toUpperCase() !== "FALSE",
    })),
  };
}

const mapPart = (r) => ({
  id: S(r.id), name: S(r.name), category: S(r.category), vendorId: S(r.vendor_id),
  unitCost: Number(r.unit_cost) || 0, quantityOnHand: Number(r.quantity_on_hand) || 0,
  reorderThreshold: Number(r.reorder_threshold) || 0, notes: S(r.notes),
  active: String(r.active).trim().toUpperCase() !== "FALSE",
});

export async function getParts() {
  const rows = await q(`SELECT * FROM parts ORDER BY name ASC`);
  return { success: true, data: rows.map(mapPart).filter((r) => r.id) };
}

// ── Garage: Recurring Service Templates ────────────────────────────────────
const mapTemplate = (r) => ({
  id: S(r.id), name: S(r.name), description: S(r.description),
  intervalKm: r.interval_km != null ? Number(r.interval_km) : null,
  intervalMonths: r.interval_months != null ? Number(r.interval_months) : null,
  active: String(r.active).trim().toUpperCase() !== "FALSE",
});

export async function getServiceTemplates() {
  const rows = await q(`SELECT * FROM service_templates ORDER BY name ASC`);
  const templates = rows.map(mapTemplate).filter((r) => r.id);
  // Attach each template's standard parts list in one extra query rather
  // than one query per template (N+1) -- small dataset, cheap to join here.
  const partRows = await q(
    `SELECT tp.template_id, tp.part_id, tp.quantity, p.name AS part_name, p.unit_cost
       FROM service_template_parts tp JOIN parts p ON p.id = tp.part_id`
  );
  const byTemplate = {};
  partRows.forEach((r) => {
    (byTemplate[r.template_id] ||= []).push({
      partId: S(r.part_id), partName: S(r.part_name), unitCost: Number(r.unit_cost) || 0, quantity: Number(r.quantity) || 1,
    });
  });
  templates.forEach((t) => { t.parts = byTemplate[t.id] || []; });
  return { success: true, data: templates };
}

// ── Garage: Car <-> Template Assignments ───────────────────────────────────
const mapAssignment = (r) => ({
  id: S(r.id), plate: S(r.plate), templateId: S(r.template_id),
  lastDoneKm: r.last_done_km != null ? Number(r.last_done_km) : null,
  lastDoneDate: D(r.last_done_date),
  active: String(r.active).trim().toUpperCase() !== "FALSE",
});

export async function getCarServiceAssignments() {
  const rows = await q(
    `SELECT a.*, t.name AS template_name, t.interval_km, t.interval_months
       FROM car_service_assignments a JOIN service_templates t ON t.id = a.template_id
      WHERE a.active = 'TRUE' AND t.active = 'TRUE'
      ORDER BY a.plate ASC`
  );
  return {
    success: true,
    data: rows.map((r) => ({
      ...mapAssignment(r), templateName: S(r.template_name),
      intervalKm: r.interval_km != null ? Number(r.interval_km) : null,
      intervalMonths: r.interval_months != null ? Number(r.interval_months) : null,
    })),
  };
}

// ── Garage: Checklist / Inspection Templates ───────────────────────────────
export async function getChecklistTemplates() {
  const rows = await q(`SELECT * FROM checklist_templates ORDER BY name ASC`);
  const templates = rows.map((r) => ({
    id: S(r.id), name: S(r.name), description: S(r.description),
    active: String(r.active).trim().toUpperCase() !== "FALSE",
  })).filter((r) => r.id);
  const itemRows = await q(`SELECT * FROM checklist_template_items ORDER BY template_id, sort_order ASC, id ASC`);
  const byTemplate = {};
  itemRows.forEach((r) => {
    (byTemplate[r.template_id] ||= []).push({ id: S(r.id), label: S(r.label), sortOrder: Number(r.sort_order) || 0 });
  });
  templates.forEach((t) => { t.items = byTemplate[t.id] || []; });
  return { success: true, data: templates };
}

// A car's filled-out checklists — used on Car Profile's Garage Updates tab.
// Each instance's items are attached inline (small dataset per car, no
// need for a separate per-instance fetch).
export async function getChecklistInstances({ plate, workOrderId } = {}) {
  let rows;
  if (workOrderId) {
    rows = await q(`SELECT ci.*, t.name AS template_name FROM checklist_instances ci JOIN checklist_templates t ON t.id = ci.template_id WHERE ci.work_order_id=$1 ORDER BY ci.created_at DESC`, [workOrderId]);
  } else if (plate) {
    rows = await q(`SELECT ci.*, t.name AS template_name FROM checklist_instances ci JOIN checklist_templates t ON t.id = ci.template_id WHERE ci.plate=$1 ORDER BY ci.created_at DESC`, [plate]);
  } else {
    return { success: true, data: [] };
  }
  const instances = rows.map((r) => ({
    id: S(r.id), templateId: S(r.template_id), templateName: S(r.template_name),
    plate: S(r.plate), workOrderId: S(r.work_order_id), completedBy: S(r.completed_by),
    hasFailure: String(r.has_failure).trim().toUpperCase() === "TRUE",
    createdAt: T(r.created_at),
  }));
  if (instances.length === 0) return { success: true, data: [] };
  const itemRows = await q(
    `SELECT * FROM checklist_instance_items WHERE instance_id = ANY($1) ORDER BY instance_id, sort_order ASC, id ASC`,
    [instances.map((i) => i.id)]
  );
  const byInstance = {};
  itemRows.forEach((r) => {
    (byInstance[r.instance_id] ||= []).push({ id: S(r.id), label: S(r.label), state: S(r.state) || "Good", note: S(r.note) });
  });
  instances.forEach((i) => { i.items = byInstance[i.id] || []; });
  return { success: true, data: instances };
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
