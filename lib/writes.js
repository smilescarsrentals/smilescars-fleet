// lib/writes.js — every POST action that mutates structured data, ported to
// Supabase. Binary uploads (photos, signatures, agreement PDFs) live in
// lib/files.js; everything here is plain relational work.
import crypto from "node:crypto";
import {
  q, q1, run, insert, update, coerce, D, nowTZ, todayTZ,
  updateFleetRow, clearFleetRow, addHistory, staffRow, staffActive, requireManagerOrAdmin,
} from "./core.js";
import { deleteFile } from "./files.js";

// Exact-match fetch of a Fleet row (mirrors Apps Script findRow, case-sensitive).
async function fleetRow(plate) {
  const r = await q1(`SELECT * FROM fleet WHERE plate=$1 LIMIT 1`, [plate]);
  if (!r) throw new Error("Car not found: " + plate);
  return r;
}

// ── Auth ────────────────────────────────────────────────────────────────────
export async function verifyStaff(body) {
  if (!body.name || !body.password) throw new Error("Name and password required");
  const row = await staffRow(body.name);
  if (!row) return { success: false, message: "Staff not found" };
  if (!staffActive(row)) return { success: false, message: "This account has been deactivated." };
  if (!row.password) return { success: false, message: "No password set for this account" };
  if (String(row.password).trim() !== String(body.password).trim())
    return { success: false, message: "Incorrect password" };
  const fuel = await q(`SELECT value FROM config WHERE type='FuelAccess'`);
  const fuelAccess = fuel.map((r) => String(r.value || "").trim()).filter(Boolean);
  return { success: true, role: String(row.role || "Staff").trim(), fuelAccess };
}

// ── Fleet lifecycle ─────────────────────────────────────────────────────────
export async function checkOut(body) {
  if (!body.plate) throw new Error("Plate is required");
  if (!body.client) throw new Error("Client name is required");
  if (!body.staffName) throw new Error("Staff name is required");
  const bookingType = body.bookingType === "Transfer" ? "Transfer" : "Rental";
  const remarks = bookingType === "Transfer"
    ? [body.pickupFrom ? "PickUp From: " + body.pickupFrom : "", body.dropoffTo ? "DropOff To: " + body.dropoffTo : "", body.remarks || ""].filter(Boolean).join(" | ")
    : (body.remarks || "");

  await updateFleetRow(body.plate, {
    status: "Rented", currentClient: body.client, clientPhone: body.clientPhone || "",
    bookedFrom: body.bookedFrom || "", returnDate: body.returnDate || "", remarks,
    location: body.location || "", fuelOut: body.fuelOut || "", amount: body.amount || "",
    currency: body.currency || "TZS", garage: "", paymentStatus: body.paymentStatus || "Unpaid",
    amountPaid: body.amountPaid || "", policeFineOut: body.policeFine || "",
    parkingFineOut: body.parkingFine || "", kmOut: body.kmOut || "", driver: body.driver || "",
    checkedOutBy: body.staffName, bookingType,
  });
  // Fleet row is the source of truth; don't fail the checkout if history logging hiccups.
  try {
    await addHistory({
      plate: body.plate, type: body.type, action: bookingType === "Transfer" ? "Transfer Out" : "Checked Out",
      client: body.client, clientPhone: body.clientPhone || "", bookedFrom: body.bookedFrom || "",
      returnDate: body.returnDate || "", location: body.location || "", remarks,
      staffName: body.staffName, fuelOut: body.fuelOut || "", amount: body.amount || "",
      currency: body.currency || "TZS", policeFine: body.policeFine || "", parkingFine: body.parkingFine || "",
      paymentStatus: body.paymentStatus || "Unpaid", amountPaid: body.amountPaid || "",
      kmOut: body.kmOut || "", driver: body.driver || "",
    });
  } catch (err) {
    console.error("addHistory failed after checkOut for " + body.plate + ": " + err.message);
  }
  return { success: true };
}

export async function markReturned(body) {
  if (!body.plate) throw new Error("Plate is required");
  if (!body.staffName) throw new Error("Staff name is required");
  const r = await fleetRow(body.plate);
  const wasTransfer = (r.booking_type || "Rental") === "Transfer";
  await clearFleetRow(body.plate, "Available", { remarks: body.remarks || "" });
  await addHistory({
    plate: body.plate, type: body.type || r.type, action: wasTransfer ? "Transfer Completed" : "Returned",
    client: r.current_client, clientPhone: r.client_phone, bookedFrom: D(r.booked_from),
    returnDate: body.actualReturn || D(r.return_date), location: body.location || r.location,
    remarks: body.remarks || "", staffName: body.staffName, fuelOut: r.fuel_out, fuelIn: body.fuelIn || "",
    amount: body.amount || r.amount || "", currency: r.currency || "TZS",
    policeFine: body.policeFine || r.police_fine_out || "", parkingFine: body.parkingFine || r.parking_fine_out || "",
    paymentStatus: body.paymentStatus || r.payment_status || "", amountPaid: body.amountPaid || r.amount_paid || "",
    kmOut: r.km_out || "", kmIn: body.kmIn || "",
  });
  return { success: true };
}

export async function extendBooking(body) {
  if (!body.plate) throw new Error("Plate is required");
  if (!body.returnDate) throw new Error("New return date is required");
  if (!body.staffName) throw new Error("Staff name is required");
  const r = await fleetRow(body.plate);
  const oldReturnDate = D(r.return_date);
  await updateFleetRow(body.plate, {
    returnDate: body.returnDate, remarks: body.remarks || "",
    ...(body.amount ? { amount: body.amount, currency: body.currency || "TZS" } : {}),
    ...(body.paymentStatus ? { paymentStatus: body.paymentStatus } : {}),
    ...(body.amountPaid ? { amountPaid: body.amountPaid } : {}),
  });
  await addHistory({
    plate: body.plate, type: body.type || r.type, action: "Booking Extended",
    client: r.current_client, clientPhone: r.client_phone, bookedFrom: D(r.booked_from),
    returnDate: body.returnDate, location: body.location || r.location,
    remarks: `Extended from ${oldReturnDate} to ${body.returnDate}. ${body.remarks || ""}`.trim(),
    staffName: body.staffName, amount: body.amount || "", currency: body.currency || "",
    paymentStatus: body.paymentStatus || "", amountPaid: body.amountPaid || "",
  });
  return { success: true };
}

export async function setMaintenance(body) {
  if (!body.plate) throw new Error("Plate is required");
  if (!body.staffName) throw new Error("Staff name is required");
  if (!body.garage) throw new Error("Garage is required");
  await clearFleetRow(body.plate, "Maintenance", { remarks: body.remarks || "", garage: body.garage });
  await addHistory({ plate: body.plate, type: body.type || "", action: "Sent to Maintenance", remarks: body.remarks || "", location: body.location || "", staffName: body.staffName, garage: body.garage });

  // Auto-create a Queued work order on the Maintenance side so the Garage
  // Manager sees it land without anyone re-typing what Fleet already knows.
  // One-directional by design: this creates the work order, but a work
  // order's status does NOT write back to change Fleet status (that's the
  // other half of Phase 2c, intentionally not built yet).
  const { refNo, now } = await nextMaintenanceRefNo();
  const id = "MX-" + crypto.randomUUID().split("-")[0].toUpperCase();
  await insert("maintenance_log", {
    id, ref_no: refNo, plate: body.plate, opened_by: body.staffName, assigned_mechanic: "",
    issue_description: body.remarks || "", status: "Queued", date_opened: now,
    odometer: "", notes: `Auto-created from Fleet "Send to Garage" (${body.garage}).`,
  });

  return { success: true, workOrderRefNo: refNo };
}

export async function setAvailable(body) {
  if (!body.plate || !body.staffName) throw new Error("Plate and staff required");
  await clearFleetRow(body.plate, "Available", { remarks: body.remarks || "" });
  await addHistory({ plate: body.plate, type: body.type || "", action: "Marked Available", remarks: body.remarks || "", location: body.location || "", staffName: body.staffName, kmOut: body.kmOut || "" });
  return { success: true };
}

export async function setStaffUse(body) {
  if (!body.plate) throw new Error("Plate is required");
  if (!body.staffName) throw new Error("Staff name is required");
  if (!body.assignedTo) throw new Error("Assigned staff member is required");
  await updateFleetRow(body.plate, {
    status: "Staff Use", currentClient: body.assignedTo, clientPhone: "", bookedFrom: "", returnDate: "",
    remarks: body.remarks || "", fuelOut: body.fuelOut || "", kmOut: body.kmOut || "", location: body.location || "",
    amount: "", currency: "", garage: "", paymentStatus: "", amountPaid: "", policeFineOut: "", parkingFineOut: "", driver: "",
  });
  await addHistory({ plate: body.plate, type: body.type || "", action: "Staff Use", client: body.assignedTo, location: body.location || "", remarks: body.remarks || "", fuelOut: body.fuelOut || "", kmOut: body.kmOut || "", staffName: body.staffName });
  return { success: true };
}

export async function updateLocation(body) {
  if (!body.plate || !body.location) throw new Error("Plate and location required");
  await updateFleetRow(body.plate, { location: body.location });
  await addHistory({ plate: body.plate, type: body.type || "", action: "Location Updated", location: body.location, staffName: body.staffName || "" });
  return { success: true };
}

export async function updatePayment(body) {
  if (!body.plate) throw new Error("Plate is required");
  if (!body.paymentStatus) throw new Error("Payment status is required");
  if (!body.staffName) throw new Error("Staff name is required");
  await requireManagerOrAdmin(body.staffName);
  await updateFleetRow(body.plate, { paymentStatus: body.paymentStatus, amountPaid: body.amountPaid || "" });
  const r = await fleetRow(body.plate);
  await addHistory({ plate: body.plate, type: body.type || r.type, action: "Payment Updated", client: r.current_client, remarks: body.remarks || "", staffName: body.staffName, paymentStatus: body.paymentStatus, amountPaid: body.amountPaid || "" });
  return { success: true };
}

export async function markSold(body) {
  if (!body.plate) throw new Error("Plate is required");
  if (!body.staffName) throw new Error("Staff name is required");
  await requireManagerOrAdmin(body.staffName);
  const r = await fleetRow(body.plate);
  const type = r.type;
  await insert("sold", { timestamp: nowTZ(), plate: body.plate, type, remarks: body.remarks || "", staff_name: body.staffName });
  await run(`DELETE FROM fleet WHERE plate=$1`, [body.plate]);
  await addHistory({ plate: body.plate, type, action: "Sold", remarks: body.remarks || "", staffName: body.staffName });
  return { success: true };
}

export async function addCar(body) {
  if (!body.plate) throw new Error("Plate is required");
  if (!body.type) throw new Error("Type is required");
  if (!body.location) throw new Error("Location is required");
  if (await q1(`SELECT 1 FROM fleet WHERE plate=$1`, [body.plate]))
    throw new Error("A car with this plate already exists: " + body.plate);
  await insert("fleet", {
    plate: body.plate, type: body.type, location: body.location, status: "Available",
    current_client: "", client_phone: "", booked_from: "", return_date: "", remarks: "",
    fuel_out: "", amount: "", currency: "TZS", garage: "", payment_status: "", amount_paid: "",
    police_fine_out: "", parking_fine_out: "", km_out: "", driver: "",
    reg_card_url: body.regCardUrl || "", photos_url: body.photosUrl || "", checked_out_by: "", booking_type: "",
  });
  return { success: true };
}

export async function addCarNote(body) {
  if (!body.plate) throw new Error("Plate is required");
  if (!body.note) throw new Error("Note is required");
  if (!body.staffName) throw new Error("Staff name is required");
  await addHistory({ plate: body.plate, type: body.type || "", action: "Note Added", remarks: body.note, staffName: body.staffName });
  return { success: true };
}

export async function replaceVehicle(body) {
  if (!body.originalPlate) throw new Error("Original plate is required");
  if (!body.replacePlate) throw new Error("Replacement plate is required");
  if (!body.staffName) throw new Error("Staff name is required");
  const today = todayTZ();
  const note = `Replacement for ${body.originalPlate}. ${body.remarks || ""}`.trim();
  const origNote = `Broken down — replaced by ${body.replacePlate}. ${body.remarks || ""}`.trim();

  if (body.originalAction === "available") {
    await clearFleetRow(body.originalPlate, "Available", { remarks: origNote });
    await addHistory({ plate: body.originalPlate, type: body.originalType || "", action: "Marked Available", remarks: origNote, location: body.location || "", staffName: body.staffName });
  } else {
    await clearFleetRow(body.originalPlate, "Maintenance", { remarks: origNote, garage: body.garage || "" });
    await addHistory({ plate: body.originalPlate, type: body.originalType || "", action: "Sent to Maintenance", remarks: origNote, garage: body.garage || "", location: body.location || "", staffName: body.staffName });
  }

  await updateFleetRow(body.replacePlate, {
    status: "Rented", currentClient: body.client, clientPhone: body.clientPhone || "",
    bookedFrom: body.bookedFrom || today, returnDate: body.returnDate || "", amount: body.amount || "",
    currency: body.currency || "TZS", paymentStatus: body.paymentStatus || "Paid", amountPaid: body.amountPaid || "",
    driver: body.driver || "", location: body.location || "", fuelOut: "", remarks: note, checkedOutBy: body.staffName,
  });
  await addHistory({
    plate: body.replacePlate, type: body.replaceType || "", action: "Checked Out", client: body.client,
    clientPhone: body.clientPhone || "", bookedFrom: body.bookedFrom || today, returnDate: body.returnDate || "",
    location: body.location || "", remarks: note, staffName: body.staffName, amount: body.amount || "",
    currency: body.currency || "TZS", paymentStatus: body.paymentStatus || "Paid", amountPaid: body.amountPaid || "",
    driver: body.driver || "", fuelOut: "",
  });
  return { success: true };
}

// ── Staff / Config ──────────────────────────────────────────────────────────
export async function addStaff(body) {
  if (!body.name) throw new Error("Name is required");
  await insert("config", { type: "Staff", value: body.name, password: body.password || "", role: body.role || "Staff", active: "TRUE" });
  return { success: true };
}

export async function setStaffActive(body) {
  if (!body.name) throw new Error("Staff name is required");
  const n = await run(`UPDATE config SET active=$1 WHERE type='Staff' AND btrim(value)=btrim($2)`, [body.active ? "TRUE" : "FALSE", body.name]);
  if (!n) throw new Error("Staff not found: " + body.name);
  return { success: true };
}

export async function addConfigItem(type, name) {
  if (!name) throw new Error("Name is required");
  await insert("config", { type, value: name });
  return { success: true };
}

export async function updateConfigItem(body) {
  if (!body.type || !body.oldValue || !body.newValue) throw new Error("type, oldValue, and newValue are required");
  const row = await q1(`SELECT id FROM config WHERE type=$1 AND btrim(value)=btrim($2) ORDER BY id LIMIT 1`, [body.type, body.oldValue]);
  if (!row) throw new Error("Not found: " + body.oldValue);
  await run(`UPDATE config SET value=$1 WHERE id=$2`, [body.newValue, row.id]);
  return { success: true };
}

export async function deleteConfigItem(body) {
  if (!body.type || !body.value) throw new Error("type and value are required");
  const row = await q1(`SELECT id FROM config WHERE type=$1 AND btrim(value)=btrim($2) ORDER BY id LIMIT 1`, [body.type, body.value]);
  if (!row) throw new Error("Not found: " + body.value);
  await run(`DELETE FROM config WHERE id=$1`, [row.id]);
  return { success: true };
}

// ── Settings ────────────────────────────────────────────────────────────────
// UPDATE-then-INSERT rather than ON CONFLICT: the settings table came from a
// sheet export and may not carry a unique constraint on `key`.
export async function updateSetting(body) {
  if (!body.key) throw new Error("Setting key is required");
  const value = coerce("settings", "value", body.value);
  const n = await run(`UPDATE settings SET value=$1 WHERE key=$2`, [value, body.key]);
  if (!n) await run(`INSERT INTO settings (key, value) VALUES ($1, $2)`, [body.key, value]);
  return { success: true };
}

// ── Sub-Hire ────────────────────────────────────────────────────────────────
export async function addSubHire(body) {
  if (!body.supplierName) throw new Error("Supplier name is required");
  if (!body.client) throw new Error("Client name is required");
  if (!body.staffName) throw new Error("Staff name is required");
  const id = "SH-" + Date.now().toString().slice(-6);
  await insert("sub_hire", {
    id, status: "Active", supplier_name: body.supplierName, supplier_contact: body.supplierContact || "",
    vehicle_description: body.vehicleDesc || "", client: body.client, client_phone: body.clientPhone || "",
    booked_from: body.bookedFrom || "", return_date: body.returnDate || "", actual_return: "",
    location: body.location || "", fuel_out: body.fuelOut || "", fuel_in: "",
    amount: body.amount || "", currency: body.currency || "TZS",
    payment_status: body.paymentStatus || "Unpaid", amount_paid: body.amountPaid || "",
    supplier_amount: body.supplierAmount || "", supplier_currency: body.supplierCurrency || "TZS",
    supplier_pay_status: body.supplierPayStatus || "Unpaid", supplier_amount_paid: body.supplierAmountPaid || "",
    police_fine: body.policeFine || "", parking_fine: body.parkingFine || "",
    remarks: body.remarks || "", staff_name: body.staffName, timestamp: nowTZ(), plate_no: body.plate || "",
  });
  return { success: true, id };
}

export async function returnSubHire(body) {
  if (!body.id) throw new Error("Sub-hire ID is required");
  if (!body.staffName) throw new Error("Staff name is required");
  const n = await update("sub_hire", {
    status: "Returned", actual_return: body.actualReturn || "", fuel_in: body.fuelIn || "",
    payment_status: body.paymentStatus || "", amount_paid: body.amountPaid || "",
    supplier_pay_status: body.supplierPayStatus || "", supplier_amount_paid: body.supplierAmountPaid || "",
    police_fine: body.policeFine || "", parking_fine: body.parkingFine || "", remarks: body.remarks || "",
  }, "id", body.id);
  if (!n) throw new Error("Sub-hire booking not found: " + body.id);
  return { success: true };
}

export async function updateSubHirePayment(body) {
  if (!body.id) throw new Error("Sub-hire ID is required");
  const setObj = {};
  if (body.paymentStatus !== undefined) setObj.payment_status = body.paymentStatus;
  if (body.amountPaid !== undefined) setObj.amount_paid = body.amountPaid;
  if (body.supplierPayStatus !== undefined) setObj.supplier_pay_status = body.supplierPayStatus;
  if (body.supplierAmountPaid !== undefined) setObj.supplier_amount_paid = body.supplierAmountPaid;
  const n = await update("sub_hire", setObj, "id", body.id);
  if (!n) throw new Error("Sub-hire booking not found");
  return { success: true };
}

// ── Fuel ────────────────────────────────────────────────────────────────────
export async function addFuel(body) {
  if (!body.plate) throw new Error("Plate is required");
  if (!body.product) throw new Error("Product is required");
  if (!body.authorisedBy) throw new Error("Authorised By is required");
  if (!body.date) throw new Error("Date is required");
  if (!body.amount && !body.litres) throw new Error("Amount or Litres is required");

  // Sequential, month-scoped reference: SC/FUEL/2026/08/0001, resets each
  // month. Scoped by the fuel entry's own date (not "today"), matching how
  // reservations/maintenance refs are month-scoped by their own relevant date.
  // Derived from the highest existing ref in that month, not a row count, so
  // a deleted row can never cause a duplicate.
  const refPrefix = `SC/FUEL/${body.date.slice(0, 4)}/${body.date.slice(5, 7)}/`;
  const refRows = await q(`SELECT ref_no FROM fuel WHERE ref_no LIKE $1`, [refPrefix + "%"]);
  let maxRefNum = 0;
  refRows.forEach((r) => {
    const num = parseInt(String(r.ref_no).replace(refPrefix, ""), 10);
    if (!isNaN(num) && num > maxRefNum) maxRefNum = num;
  });
  const refNo = refPrefix + String(maxRefNum + 1).padStart(4, "0");

  let vehicleType = body.type || "";
  if (!vehicleType) {
    const f = await q1(`SELECT type FROM fleet WHERE lower(btrim(plate))=lower(btrim($1)) LIMIT 1`, [body.plate]);
    if (f) vehicleType = f.type || "";
  }
  if (!vehicleType) {
    const s = await q1(`SELECT vehicle_description FROM sub_hire WHERE lower(btrim(plate_no))=lower(btrim($1)) LIMIT 1`, [body.plate]);
    if (s) vehicleType = s.vehicle_description || "";
  }

  await insert("fuel", {
    timestamp: nowTZ(), ref_no: refNo, date: body.date, plate: body.plate, vehicle_type: vehicleType,
    product: body.product, amount_tsh: body.amount || "", litres: body.litres || "",
    authorised_by: body.authorisedBy, submitted_by: body.submittedBy || body.authorisedBy,
    linked_client: body.linkedClient || "", current_km: body.currentKm || "",
  });
  return { success: true, refNo };
}

export async function editFuel(body) {
  if (!body.refNo) throw new Error("Ref No is required");
  if (!body.staffName) throw new Error("Staff name is required");
  await requireManagerOrAdmin(body.staffName);
  const setObj = {};
  if (body.date) setObj.date = body.date;
  if (body.plate) setObj.plate = body.plate;
  if (body.product) setObj.product = body.product;
  if (body.amount !== undefined) setObj.amount_tsh = body.amount;
  if (body.litres !== undefined) setObj.litres = body.litres;
  if (body.authorisedBy) setObj.authorised_by = body.authorisedBy;
  const n = await update("fuel", setObj, "ref_no", body.refNo);
  if (!n) throw new Error("Fuel entry not found: " + body.refNo);
  return { success: true };
}

// ── Reservations ────────────────────────────────────────────────────────────
export async function addReservation(body) {
  const bookingType = body.bookingType === "Transfer" ? "Transfer" : "Rental";
  if (!body.client) throw new Error("Client name is required");
  if (bookingType === "Transfer") {
    if (!body.transferDate) throw new Error("Transfer date is required");
  } else {
    if (!body.pickupDate) throw new Error("Pickup date is required");
    if (!body.returnDate) throw new Error("Return date is required");
  }
  const now = nowTZ();
  const prefix = `RES/SC/${now.slice(0, 4)}/${now.slice(5, 7)}/`;
  const rows = await q(`SELECT id FROM reservations WHERE id LIKE $1`, [prefix + "%"]);
  let maxNum = 99;
  rows.forEach((r) => {
    const num = parseInt(String(r.id).replace(prefix, ""), 10);
    if (!isNaN(num) && num > maxNum) maxNum = num;
  });
  const id = prefix + (maxNum + 1);
  await insert("reservations", {
    id, plate: body.plate || "", car_type: body.carType || "", client_name: body.client, phone: body.phone || "",
    pickup_date: body.pickupDate || "", return_date: body.returnDate || "", pick_up_from: body.pickUpFrom || "",
    remarks: body.remarks || "", staff_name: body.staffName || "", timestamp: now,
    booking_type: bookingType, drop_off_to: body.dropOffTo || "", transfer_date: body.transferDate || "",
  });
  return { success: true, id };
}

export async function editReservation(body) {
  if (!body.id) throw new Error("ID is required");
  const setObj = {};
  if (body.plate !== undefined) setObj.plate = body.plate;
  if (body.carType !== undefined) setObj.car_type = body.carType;
  if (body.client) setObj.client_name = body.client;
  if (body.phone !== undefined) setObj.phone = body.phone;
  if (body.pickupDate) setObj.pickup_date = body.pickupDate;
  if (body.returnDate) setObj.return_date = body.returnDate;
  if (body.pickUpFrom !== undefined) setObj.pick_up_from = body.pickUpFrom;
  if (body.remarks !== undefined) setObj.remarks = body.remarks;
  if (body.bookingType !== undefined) setObj.booking_type = body.bookingType;
  if (body.dropOffTo !== undefined) setObj.drop_off_to = body.dropOffTo;
  if (body.transferDate !== undefined) setObj.transfer_date = body.transferDate;
  const n = await update("reservations", setObj, "id", body.id);
  if (!n) throw new Error("Reservation not found");
  return { success: true };
}

export async function deleteReservation(body) {
  if (!body.id) throw new Error("ID is required");
  const n = await run(`DELETE FROM reservations WHERE id=$1`, [body.id]);
  if (!n) throw new Error("Reservation not found");
  return { success: true };
}

// ── Blacklist ───────────────────────────────────────────────────────────────
// The licence photo itself is uploaded first (uploadBlacklistImage in
// lib/files.js) and only its id/URL lands here.
export async function addToBlacklist(body) {
  if (!body.name && !body.phone && !body.licenseNo)
    throw new Error("At least name, phone or license number is required.");
  const id = "BL-" + crypto.randomUUID().split("-")[0].toUpperCase();
  await insert("blacklist", {
    id, name: body.name || "", phone: body.phone || "", license_no: body.licenseNo || "",
    license_image_url: body.imageUrl || "", file_id: body.fileId || "", added_by: body.addedBy || "", timestamp: nowTZ(),
  });
  return { success: true, id };
}

export async function deleteFromBlacklist(body) {
  if (!body.id) throw new Error("ID is required");
  const row = await q1(`SELECT file_id FROM blacklist WHERE id=$1`, [body.id]);
  if (!row) throw new Error("Entry not found");
  await run(`DELETE FROM blacklist WHERE id=$1`, [body.id]);
  // Drop the stored photo too. Rows carried over from the Drive era have a
  // Google file id that isn't in our files table — deleteFile just no-ops.
  const fileId = body.fileId || row.file_id;
  if (fileId) { try { await deleteFile(fileId); } catch { /* orphaned file is not worth failing the delete */ } }
  return { success: true };
}

// ── Maintenance ─────────────────────────────────────────────────────────────
// Phase 2a: pure logging — creating a work order does NOT touch Fleet status
// yet. That side-effect (car -> Maintenance / back to Available) is Phase 2c,
// built once the work order mechanics themselves are proven solid.
// Shared by addMaintenanceLog and the Fleet "Send to Garage" auto-create path
// below, so both entry points generate refs the same way and can never drift.
async function nextMaintenanceRefNo() {
  const now = nowTZ();
  const prefix = `SC/GAR/${now.slice(0, 4)}/${now.slice(5, 7)}/`;
  const rows = await q(`SELECT ref_no FROM maintenance_log WHERE ref_no LIKE $1`, [prefix + "%"]);
  let maxNum = 0;
  rows.forEach((r) => {
    const num = parseInt(String(r.ref_no).replace(prefix, ""), 10);
    if (!isNaN(num) && num > maxNum) maxNum = num;
  });
  return { refNo: prefix + String(maxNum + 1).padStart(4, "0"), now };
}

export async function addMaintenanceLog(body) {
  if (!body.plate) throw new Error("Plate is required");
  if (!body.assignedMechanic) throw new Error("Assigned mechanic is required");
  await fleetRow(body.plate); // throws "Car not found" if the plate doesn't exist — catches typos early
  const { refNo, now } = await nextMaintenanceRefNo();
  const id = "MX-" + crypto.randomUUID().split("-")[0].toUpperCase();
  await insert("maintenance_log", {
    id, ref_no: refNo, plate: body.plate, opened_by: body.openedBy || "", assigned_mechanic: body.assignedMechanic,
    issue_description: body.issueDescription || "", status: "Queued", date_opened: now,
    odometer: body.odometer || "", notes: body.notes || "",
  });
  return { success: true, id, refNo };
}

const MAINTENANCE_STATUSES = ["Queued", "In Progress", "Awaiting Parts", "Completed"];

export async function editMaintenanceLog(body) {
  if (!body.id) throw new Error("ID is required");
  const existing = await q1(`SELECT status FROM maintenance_log WHERE id=$1`, [body.id]);
  if (!existing) throw new Error("Work order not found");

  const setObj = {};
  if (body.assignedMechanic !== undefined) setObj.assigned_mechanic = body.assignedMechanic;
  if (body.issueDescription !== undefined) setObj.issue_description = body.issueDescription;
  if (body.odometer !== undefined) setObj.odometer = body.odometer;
  if (body.notes !== undefined) setObj.notes = body.notes;

  if (body.status !== undefined) {
    if (!MAINTENANCE_STATUSES.includes(body.status)) throw new Error("Invalid status: " + body.status);
    setObj.status = body.status;
    // Auto-stamp date_closed on completion; clear it if moved back out of
    // Completed (e.g. staff correcting a mistaken close).
    if (body.status === "Completed" && existing.status !== "Completed") {
      setObj.date_closed = nowTZ();
    } else if (body.status !== "Completed" && existing.status === "Completed") {
      setObj.date_closed = "";
    }
  }
  setObj.updated_at = nowTZ();

  const n = await update("maintenance_log", setObj, "id", body.id);
  if (!n) throw new Error("Work order not found");
  return { success: true };
}

// Recompute a work order's total_cost as the sum of its line items. Called
// after any item add/edit/delete so total_cost always reflects reality —
// the job card's line items ARE the cost breakdown (no separate labor field).
async function recomputeMaintenanceTotal(workOrderId) {
  const row = await q1(`SELECT COALESCE(SUM(line_total),0) AS total FROM maintenance_items WHERE work_order_id=$1`, [workOrderId]);
  await update("maintenance_log", { total_cost: Number(row.total) || 0, updated_at: nowTZ() }, "id", workOrderId);
}

export async function addMaintenanceItem(body) {
  if (!body.workOrderId) throw new Error("Work order ID is required");
  if (!body.itemName) throw new Error("Item name is required");
  const wo = await q1(`SELECT id FROM maintenance_log WHERE id=$1`, [body.workOrderId]);
  if (!wo) throw new Error("Work order not found");
  const qty = Number(body.quantity) || 1;
  const unitCost = Number(body.unitCost) || 0;
  const id = "MI-" + crypto.randomUUID().split("-")[0].toUpperCase();
  await insert("maintenance_items", {
    id, work_order_id: body.workOrderId, item_name: body.itemName,
    quantity: qty, unit_cost: unitCost, line_total: qty * unitCost,
  });
  await recomputeMaintenanceTotal(body.workOrderId);
  return { success: true, id };
}

export async function editMaintenanceItem(body) {
  if (!body.id) throw new Error("Item ID is required");
  const existing = await q1(`SELECT work_order_id, quantity, unit_cost FROM maintenance_items WHERE id=$1`, [body.id]);
  if (!existing) throw new Error("Item not found");
  const setObj = {};
  if (body.itemName !== undefined) setObj.item_name = body.itemName;
  const qty = body.quantity !== undefined ? Number(body.quantity) || 0 : Number(existing.quantity);
  const unitCost = body.unitCost !== undefined ? Number(body.unitCost) || 0 : Number(existing.unit_cost);
  if (body.quantity !== undefined) setObj.quantity = qty;
  if (body.unitCost !== undefined) setObj.unit_cost = unitCost;
  if (body.quantity !== undefined || body.unitCost !== undefined) setObj.line_total = qty * unitCost;
  const n = await update("maintenance_items", setObj, "id", body.id);
  if (!n) throw new Error("Item not found");
  await recomputeMaintenanceTotal(existing.work_order_id);
  return { success: true };
}

export async function deleteMaintenanceItem(body) {
  if (!body.id) throw new Error("Item ID is required");
  const row = await q1(`SELECT work_order_id FROM maintenance_items WHERE id=$1`, [body.id]);
  if (!row) throw new Error("Item not found");
  await run(`DELETE FROM maintenance_items WHERE id=$1`, [body.id]);
  await recomputeMaintenanceTotal(row.work_order_id);
  return { success: true };
}

// Running timeline of updates on a work order — separate from the single
// notes field, entries are never overwritten so the whole history stays
// visible (who said what, when).
export async function addMaintenanceUpdate(body) {
  if (!body.workOrderId) throw new Error("Work order ID is required");
  if (!body.message || !body.message.trim()) throw new Error("Update message is required");
  const wo = await q1(`SELECT id FROM maintenance_log WHERE id=$1`, [body.workOrderId]);
  if (!wo) throw new Error("Work order not found");
  const id = "MU-" + crypto.randomUUID().split("-")[0].toUpperCase();
  await insert("maintenance_updates", {
    id, work_order_id: body.workOrderId, author: body.author || "", message: body.message.trim(),
  });
  return { success: true, id };
}
