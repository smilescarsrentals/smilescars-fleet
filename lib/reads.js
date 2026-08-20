// lib/reads.js — every GET action, returning the same JSON shape the frontend
// already consumes (camelCase keys, formatted dates, defaults).
import { q, S, D, T, todayTZ } from "./core.js";
import { getDeviceList } from "./tracksolid.js";

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
// Resolves every plate a car has ever been known by — follows the chain
// both directions (a plate could have been renamed more than once) so
// getCarHistory can search under all of them, not just the two most
// recent. Small, bounded dataset (plate renames are rare), so a simple
// iterative expansion is fine rather than a recursive SQL CTE.
async function getPlateAliases(plate) {
  const known = new Set([plate.trim()]);
  let changed = true;
  while (changed) {
    changed = false;
    const rows = await q(
      `SELECT old_plate, new_plate FROM plate_history WHERE old_plate = ANY($1) OR new_plate = ANY($1)`,
      [Array.from(known)]
    );
    for (const r of rows) {
      if (!known.has(r.old_plate)) { known.add(r.old_plate); changed = true; }
      if (!known.has(r.new_plate)) { known.add(r.new_plate); changed = true; }
    }
  }
  return Array.from(known);
}

export async function getCarByPlate({ plate }) {
  if (!plate) return { success: false, error: "Plate required" };
  const rows = await q(`SELECT * FROM fleet WHERE lower(btrim(plate))=lower(btrim($1)) LIMIT 1`, [plate]);
  if (rows.length) return { success: true, data: mapFleet(rows[0], 0) };

  // markSold() deletes the Fleet row entirely once a car is sold (see
  // lib/writes.js) — its History rows are untouched, so the car's rental
  // record isn't actually gone, just no longer "live". Fall back to the
  // sold record so Car Profile can still show something real (and still
  // load History) instead of a bare "not found" for every sold car.
  const soldRows = await q(`SELECT * FROM sold WHERE lower(btrim(plate))=lower(btrim($1)) ORDER BY id DESC LIMIT 1`, [plate]);
  if (soldRows.length) {
    const s = soldRows[0];
    return {
      success: true,
      data: {
        plate: S(s.plate), type: S(s.type), status: "Sold",
        location: "", currentClient: "", clientPhone: "", bookedFrom: "", returnDate: "",
        remarks: S(s.remarks), soldDate: T(s.timestamp), soldBy: S(s.staff_name),
      },
    };
  }

  return { success: false, error: "Car not found: " + plate };
}

// ── History ─────────────────────────────────────────────────────────────────
export async function getHistory() {
  const rows = await q(`SELECT * FROM history ORDER BY id DESC`);
  return { success: true, data: rows.map(mapHistory), total: rows.length };
}
export async function getCarHistory({ plate }) {
  if (!plate) return { success: true, data: [] };
  const aliases = await getPlateAliases(plate.trim());
  const rows = await q(
    `SELECT * FROM history WHERE lower(btrim(plate)) = ANY($1) ORDER BY id DESC`,
    [aliases.map(p => p.toLowerCase())]
  );
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
  const rows = await q(`SELECT value, role, phone, COALESCE(active,'TRUE') AS active, COALESCE(receives_all_reservation_reminders,'FALSE') AS receives_all_reservation_reminders, COALESCE(receives_driver_document_reminders,'FALSE') AS receives_driver_document_reminders, COALESCE(can_manage_drivers,'FALSE') AS can_manage_drivers FROM config WHERE type='Staff' AND value<>''`);
  return {
    success: true,
    staff: rows.map((r) => ({
      name: r.value, role: r.role || "Staff", phone: r.phone || "", active: String(r.active).trim().toUpperCase() !== "FALSE",
      receivesAllReservationReminders: String(r.receives_all_reservation_reminders).trim().toUpperCase() === "TRUE",
      receivesDriverDocumentReminders: String(r.receives_driver_document_reminders).trim().toUpperCase() === "TRUE",
      canManageDrivers: String(r.can_manage_drivers).trim().toUpperCase() === "TRUE",
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
  const aliases = await getPlateAliases(plate.trim());
  const rows = await q(
    `SELECT * FROM fuel WHERE lower(btrim(plate)) = ANY($1) ORDER BY timestamp DESC NULLS LAST, ref_no DESC`,
    [aliases.map(p => p.toLowerCase())]
  );
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
      updatedBy: S(r.updated_by), updatedAt: T(r.updated_at),
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

// Part detail (Parts Inventory): every recorded cost change for this part,
// newest first — set by confirmInvoiceScan (lib/writes.js) whenever a
// matched invoice item's price differs from the part's current cost.
// Phase 3: the browsable list — every confirmed scan, newest first, with
// the linked Work Order/Customer Job resolved to something displayable
// (plate + ref) rather than leaving the frontend to guess.
export async function getPurchaseInvoices() {
  const rows = await q(
    `SELECT pi.*,
            ml.ref_no AS wo_ref_no, ml.plate AS wo_plate,
            cj.ref_no AS cj_ref_no, cj.plate AS cj_plate, cj.customer_name AS cj_customer_name
       FROM purchase_invoices pi
       LEFT JOIN maintenance_log ml ON ml.id = pi.work_order_id
       LEFT JOIN customer_jobs cj ON cj.id = pi.customer_job_id
      ORDER BY pi.created_at DESC`
  );
  return {
    success: true,
    data: rows.map((r) => ({
      id: S(r.id), supplierName: S(r.supplier_name), supplierVendorId: S(r.supplier_vendor_id),
      invoiceDate: S(r.invoice_date), totalAmount: Number(r.total_amount) || 0,
      photoFileId: S(r.photo_file_id), status: S(r.status), scannedBy: S(r.scanned_by), createdAt: T(r.created_at),
      workOrderId: S(r.work_order_id), workOrderRefNo: S(r.wo_ref_no), workOrderPlate: S(r.wo_plate),
      customerJobId: S(r.customer_job_id), customerJobRefNo: S(r.cj_ref_no),
      customerJobPlate: S(r.cj_plate), customerJobCustomerName: S(r.cj_customer_name),
    })).filter((r) => r.id),
  };
}

// Purchase Invoices detail: the items that invoice recorded (which parts
// it created/updated, quantities, prices).
export async function getPurchaseInvoiceItems({ invoiceId } = {}) {
  if (!invoiceId) return { success: true, data: [] };
  const rows = await q(`SELECT * FROM purchase_invoice_items WHERE invoice_id=$1 ORDER BY created_at ASC`, [invoiceId]);
  return {
    success: true,
    data: rows.map((r) => ({
      id: S(r.id), invoiceId: S(r.invoice_id), itemName: S(r.item_name), partId: S(r.part_id),
      quantity: Number(r.quantity) || 0, unitPrice: Number(r.unit_price) || 0, lineTotal: Number(r.line_total) || 0,
    })),
  };
}

// Admin Panel System tab: on-demand view of the same things the cron's
// checks watch for — is the scheduled job actually running, and how much
// database storage is in use. Answered from real data (system_health_log,
// pg_database_size), not assumed from silence.
export async function getSystemHealth() {
  const lastRun = await q1(`SELECT * FROM system_health_log WHERE job_name='cron-notifications' ORDER BY created_at DESC LIMIT 1`);
  const sizeRow = await q1(`SELECT pg_database_size(current_database()) AS bytes`);
  const bytes = Number(sizeRow?.bytes) || 0;
  const trackSolidVars = ["TRACKSOLID_APP_KEY", "TRACKSOLID_APP_SECRET", "TRACKSOLID_USER_ID", "TRACKSOLID_USER_PWD_MD5"];
  const trackSolidMissing = trackSolidVars.filter((v) => !process.env[v]);
  return {
    success: true,
    lastCronRun: lastRun ? { status: S(lastRun.status), detail: S(lastRun.detail), createdAt: T(lastRun.created_at) } : null,
    storageMB: bytes / (1024 * 1024),
    trackSolid: { configured: trackSolidMissing.length === 0, missing: trackSolidMissing },
  };
}

// ── Drivers (own table — see PROJECT_NOTES.md for the migration off
// config.type='Driver') ─────────────────────────────────────────────────
const mapDriver = (r) => ({
  id: S(r.id), name: S(r.name), phone: S(r.phone), licenseNumber: S(r.license_number),
  nationalId: S(r.national_id), tinNumber: S(r.tin_number), address: S(r.address), notes: S(r.notes), photoFileId: S(r.photo_file_id),
  active: String(r.active).trim().toUpperCase() !== "FALSE",
  createdAt: T(r.created_at), updatedAt: T(r.updated_at),
});

export async function getDriversV2() {
  const rows = await q(`SELECT * FROM drivers ORDER BY name ASC`);
  return { success: true, data: rows.map(mapDriver).filter((r) => r.id) };
}

export async function getDriverById({ id } = {}) {
  if (!id) return { success: false, error: "Driver ID required" };
  const row = await q1(`SELECT * FROM drivers WHERE id=$1`, [id]);
  if (!row) return { success: false, error: "Driver not found" };
  return { success: true, data: mapDriver(row) };
}

// Client assignment log: NOT a separately-tracked table — derived straight
// from history, which already records driver+client+dates together at
// checkout/transfer time. Building it this way means zero extra data
// entry for staff and the log can never drift from what actually
// happened. Matched by driver NAME (history predates the drivers table
// and only ever stored a plain name string) — a driver whose name here
// doesn't exactly match how it was typed at checkout won't match; this
// is an accepted tradeoff, not a bug, since name is the only link
// available for historical data.
export async function getDriverAssignmentLog({ driverName } = {}) {
  if (!driverName) return { success: true, data: [] };
  const rows = await q(
    `SELECT plate, action, client, client_phone, booked_from, return_date, staff_name, timestamp
       FROM history
      WHERE action IN ('Checked Out', 'Transfer Out') AND btrim(driver) = btrim($1)
      ORDER BY timestamp DESC`,
    [driverName]
  );
  return {
    success: true,
    data: rows.map((r) => ({
      plate: S(r.plate), action: S(r.action), client: S(r.client), clientPhone: S(r.client_phone),
      bookedFrom: D(r.booked_from), returnDate: D(r.return_date), staffName: S(r.staff_name), timestamp: T(r.timestamp),
    })),
  };
}

// Driver list page's Availability filter ("Free" / "With Client"): unlike
// getDriverAssignmentLog above (which reads HISTORY, i.e. what happened),
// this reads live FLEET state — a driver only counts as "With Client" if
// a car is actively rented out to them right now, not just that they've
// been assigned to someone at some point. One batched query for every
// driver's current assignment (if any), keyed by driver name, so the list
// page can resolve availability for all drivers in a single call instead
// of one Fleet lookup per driver.
export async function getDriverCurrentAssignments() {
  const rows = await q(
    `SELECT plate, driver, current_client, client_phone, booked_from, return_date
       FROM fleet
      WHERE status = 'Rented' AND driver IS NOT NULL AND btrim(driver) <> ''`
  );
  return {
    success: true,
    data: rows.map((r) => ({
      plate: S(r.plate), driverName: S(r.driver), client: S(r.current_client),
      clientPhone: S(r.client_phone), bookedFrom: D(r.booked_from), returnDate: D(r.return_date),
    })),
  };
}

// Client Name filter, "historically with" mode: which drivers were
// assigned to a given client within a date range, per instruction — reads
// history (what actually happened) rather than live Fleet state, since
// this is explicitly about the past, not "right now". Matches client name
// case-insensitively/trimmed, same as the driver-name matching already
// used elsewhere. Date range applies to bookedFrom, since that's when the
// assignment actually started.
export async function getDriversByClientHistory({ clientName, fromDate, toDate } = {}) {
  if (!clientName) return { success: true, data: [] };
  const params = [clientName];
  let dateClause = "";
  if (fromDate) { params.push(fromDate); dateClause += ` AND booked_from >= $${params.length}`; }
  if (toDate) { params.push(toDate); dateClause += ` AND booked_from <= $${params.length}`; }

  const rows = await q(
    `SELECT DISTINCT driver, plate, client, booked_from, return_date
       FROM history
      WHERE action IN ('Checked Out', 'Transfer Out')
        AND driver IS NOT NULL AND btrim(driver) <> ''
        AND lower(btrim(client)) = lower(btrim($1))${dateClause}
      ORDER BY booked_from DESC`,
    params
  );
  return {
    success: true,
    data: rows.map((r) => ({
      driverName: S(r.driver), plate: S(r.plate), client: S(r.client),
      bookedFrom: D(r.booked_from), returnDate: D(r.return_date),
    })),
  };
}

const mapDriverDocument = (r) => ({
  id: S(r.id), driverId: S(r.driver_id), docType: S(r.doc_type), label: S(r.label),
  fileId: S(r.file_id), fileMimeType: S(r.file_mime_type), expiryDate: S(r.expiry_date), notes: S(r.notes),
  createdAt: T(r.created_at), updatedAt: T(r.updated_at),
});

export async function getDriverDocuments({ driverId } = {}) {
  if (!driverId) return { success: true, data: [] };
  const rows = await q(
    `SELECT dd.*, f.mime_type AS file_mime_type FROM driver_documents dd
       LEFT JOIN files f ON f.id = dd.file_id
      WHERE dd.driver_id=$1 ORDER BY dd.expiry_date ASC NULLS LAST, dd.created_at DESC`,
    [driverId]
  );
  return { success: true, data: rows.map(mapDriverDocument) };
}

// For the Drivers list view — every document across every driver in one
// query, instead of one getDriverDocuments call per card (which was a
// real N+1 fetch pattern: 29+ simultaneous requests just to render a
// list, the same mistake getAllMaintenanceItems was built to avoid
// earlier in this project).
// For the Drivers list view — every document across every driver in one
// query, instead of one getDriverDocuments call per card (which was a
// real N+1 fetch pattern: 29+ simultaneous requests just to render a
// list, the same mistake getAllMaintenanceItems was built to avoid
// earlier in this project). Also the actual source of docs data for
// DriverDetailModal (passed down from the list page's already-loaded
// docsByDriver map) — so this needs the same files.mime_type join
// getDriverDocuments has, or every thumbnail in the detail view falls
// back to the generic icon regardless of file type. This was the real
// bug behind "images show a blank placeholder too" — getDriverDocuments
// was correctly joined and verified, but the detail modal was never
// actually calling it.
export async function getAllDriverDocuments() {
  const rows = await q(
    `SELECT dd.*, f.mime_type AS file_mime_type FROM driver_documents dd
       LEFT JOIN files f ON f.id = dd.file_id
      ORDER BY dd.expiry_date ASC NULLS LAST, dd.created_at DESC`
  );
  return { success: true, data: rows.map(mapDriverDocument) };
}


export async function getPartCostHistory({ partId } = {}) {
  if (!partId) return { success: true, data: [] };
  const rows = await q(
    `SELECT h.*, pi.invoice_date, pi.supplier_name FROM part_cost_history h
       LEFT JOIN purchase_invoices pi ON pi.id = h.invoice_id
      WHERE h.part_id=$1 ORDER BY h.created_at DESC`,
    [partId]
  );
  return {
    success: true,
    data: rows.map((r) => ({
      id: S(r.id), oldUnitCost: r.old_unit_cost != null ? Number(r.old_unit_cost) : null,
      newUnitCost: Number(r.new_unit_cost), invoiceId: S(r.invoice_id), invoiceDate: S(r.invoice_date),
      supplierName: S(r.supplier_name), changedBy: S(r.changed_by), createdAt: T(r.created_at),
    })),
  };
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

// Dashboard Revenue box, filterable by month. "Revenue" here means two
// separate totals per the user's explicit instruction: the total value
// of bookings that STARTED in the selected month (bookedFrom), and the
// amount actually paid across those same bookings — shown broken out
// per currency, not combined, since this business handles more than
// one. Only 'Checked Out' rows represent real bookings; other history
// actions (Returned, Note Added, etc.) aren't counted.
//
// Real data caveat, surfaced to the caller rather than hidden: amount/
// amount_paid are frequently null in practice (confirmed against live
// data — only ~36% of checkouts have an amount recorded at all), so
// totalBookings/bookingsWithAmount let the UI show "X of Y bookings had
// an amount recorded" instead of presenting an incomplete sum as if it
// were the whole picture.
export async function getMonthlyRevenue({ month, year } = {}) {
  const now = new Date();
  const m = month || now.getMonth() + 1; // 1-12
  const y = year || now.getFullYear();
  const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
  const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;

  const rows = await q(
    `SELECT amount, amount_paid, currency FROM history
      WHERE action = 'Checked Out' AND booked_from >= $1 AND booked_from < $2`,
    [monthStart, nextMonth]
  );

  const bookingTotal = {}; // currency -> sum of amount
  const paidTotal = {};    // currency -> sum of amount_paid
  let bookingsWithAmount = 0, bookingsWithAmountPaid = 0;

  for (const r of rows) {
    const currency = r.currency || "TZS";
    const amount = r.amount != null ? Number(r.amount) : null;
    const amountPaid = r.amount_paid != null ? Number(r.amount_paid) : null;
    if (amount != null && !isNaN(amount)) {
      bookingTotal[currency] = (bookingTotal[currency] || 0) + amount;
      bookingsWithAmount++;
    }
    if (amountPaid != null && !isNaN(amountPaid)) {
      paidTotal[currency] = (paidTotal[currency] || 0) + amountPaid;
      bookingsWithAmountPaid++;
    }
  }

  return {
    success: true, month: m, year: y,
    totalBookings: rows.length, bookingsWithAmount, bookingsWithAmountPaid,
    bookingTotal, paidTotal,
  };
}

// ── GPS tracker integration (TrackSolid Pro) ────────────────────────────────
// Normalize a plate-ish string for comparison: uppercase, strip everything
// that isn't a letter or digit. "T 263 ELM" and "T263ELM" both become
// "T263ELM"; this is comparison-only, never used for display.
function normalizePlate(s) {
  return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// TrackSolid deviceName is sometimes a clean plate ("T263ELM") and
// sometimes has trailing text ("T307EBB Nissan"). Pull out the
// plate-shaped leading token (Tanzanian pattern: letters+digits+letters)
// rather than normalizing the whole string, so "T307EBB Nissan" still
// matches "T307EBB".
// Plate-shaped token can appear anywhere in the device name — model names
// or descriptors can come before it ("Harrier T545EFT") or after it
// ("T307EBB Nissan"), so this deliberately isn't anchored to the start.
function extractPlateToken(deviceName) {
  const m = String(deviceName || "").trim().match(/([A-Za-z]{1,3}\s?\d{2,4}\s?[A-Za-z]{1,3})/);
  return m ? normalizePlate(m[1]) : normalizePlate(deviceName);
}

// Pulls TrackSolid's device list + our Fleet plates + any previously
// confirmed matches, and proposes pairings by comparing normalized plate
// text. Nothing here is auto-saved — see writes.confirmTrackerMatches.
// Every device is included exactly once, in confirmed / suggested /
// unmatched, so the UI can show a complete picture (not just the neat
// cases) — per the "never hide incomplete data" rule.
export async function getTrackerMatchSuggestions() {
  const [fleetRows, confirmedRows, ignoredRows, devices] = await Promise.all([
    q(`SELECT plate FROM fleet ORDER BY plate`),
    q(`SELECT plate, imei, device_name, confirmed_by, confirmed_at FROM vehicle_tracker_map`),
    q(`SELECT imei, device_name, ignored_by, ignored_at FROM ignored_tracker_devices`),
    getDeviceList(),
  ]);
  const ignoredImeis = new Set(ignoredRows.map((r) => r.imei));

  const confirmedByImei = new Map(confirmedRows.map((r) => [r.imei, r]));
  const fleetByNormalized = new Map(fleetRows.map((r) => [normalizePlate(r.plate), r.plate]));
  const matchedFleetPlates = new Set(confirmedRows.map((r) => r.plate));

  const confirmed = [];
  const suggested = [];
  const unmatchedDevices = [];
  // Tracks which plate a suggestion in THIS pass has already claimed, so a
  // second device whose name also normalizes to that plate doesn't get
  // suggested too (that's exactly what caused a handful of confirms to
  // silently fail on 2026-08-20 — two devices racing for one plate,
  // hitting the database's one-tracker-per-plate rule on save). The
  // second device is reported as unmatched, with a reason, instead.
  const claimedThisPass = new Map(); // normalizedPlate -> { deviceName, imei }

  for (const d of devices) {
    if (ignoredImeis.has(d.imei)) continue; // dismissed — not a fleet car, see ignored_tracker_devices
    const already = confirmedByImei.get(d.imei);
    if (already) {
      confirmed.push({
        imei: d.imei, deviceName: S(d.deviceName), plate: already.plate,
        confirmedBy: S(already.confirmed_by), confirmedAt: T(already.confirmed_at),
      });
      continue;
    }
    const token = extractPlateToken(d.deviceName);
    const fleetPlate = fleetByNormalized.get(token);
    if (fleetPlate && matchedFleetPlates.has(fleetPlate)) {
      unmatchedDevices.push({
        imei: d.imei, deviceName: S(d.deviceName), deviceGroup: S(d.deviceGroup),
        reason: `Plate ${fleetPlate} is already matched to a different tracker.`,
      });
    } else if (fleetPlate && claimedThisPass.has(token)) {
      const claimedBy = claimedThisPass.get(token);
      unmatchedDevices.push({
        imei: d.imei, deviceName: S(d.deviceName), deviceGroup: S(d.deviceGroup),
        reason: `Another tracker ("${claimedBy.deviceName}") also matches plate ${fleetPlate} — needs manual review, not auto-confirmed.`,
      });
    } else if (fleetPlate) {
      claimedThisPass.set(token, { deviceName: S(d.deviceName), imei: d.imei });
      suggested.push({
        imei: d.imei, deviceName: S(d.deviceName), deviceGroup: S(d.deviceGroup),
        suggestedPlate: fleetPlate,
      });
    } else {
      unmatchedDevices.push({
        imei: d.imei, deviceName: S(d.deviceName), deviceGroup: S(d.deviceGroup),
        reason: "No Fleet plate matched this tracker's name.",
      });
    }
  }

  const matchedOrSuggestedPlates = new Set([...matchedFleetPlates, ...suggested.map((s) => s.suggestedPlate)]);
  const unmatchedFleetPlates = fleetRows.map((r) => r.plate).filter((p) => !matchedOrSuggestedPlates.has(p));

  const ignored = ignoredRows.map((r) => ({
    imei: r.imei, deviceName: S(r.device_name), ignoredBy: S(r.ignored_by), ignoredAt: T(r.ignored_at),
  }));

  return {
    success: true,
    confirmed, suggested, unmatchedDevices, unmatchedFleetPlates, ignored,
    totalDevices: devices.length, totalFleetPlates: fleetRows.length,
  };
}

export async function getTrackerMap() {
  const rows = await q(`SELECT plate, imei, device_name, confirmed_by, confirmed_at FROM vehicle_tracker_map ORDER BY plate`);
  return {
    success: true,
    data: rows.map((r) => ({
      plate: r.plate, imei: r.imei, deviceName: S(r.device_name),
      confirmedBy: S(r.confirmed_by), confirmedAt: T(r.confirmed_at),
    })),
  };
}
