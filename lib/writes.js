// lib/writes.js — every POST action that mutates structured data, ported to
// Supabase. Binary uploads (photos, signatures, agreement PDFs) live in
// lib/files.js; everything here is plain relational work.
import crypto from "node:crypto";
import {
  q, q1, run, insert, update, coerce, D, nowTZ, todayTZ,
  updateFleetRow, clearFleetRow, addHistory, staffRow, staffActive, requireManagerOrAdmin, requireMaintenanceEditAccess,
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
  const isExternal = body.serviceLocationType === "External";
  if (isExternal && !body.externalVendorId) throw new Error("Please select a garage.");
  let garageLabel = isExternal ? "" : (body.internalLocation || "SmilesCars Garage");
  if (isExternal) {
    const v = await q1(`SELECT name FROM vendors WHERE id=$1`, [body.externalVendorId]);
    garageLabel = v ? v.name : "External garage";
  }
  await clearFleetRow(body.plate, "Maintenance", { remarks: body.remarks || "", garage: garageLabel });
  await addHistory({ plate: body.plate, type: body.type || "", action: "Sent to Maintenance", remarks: body.remarks || "", location: body.location || "", staffName: body.staffName, garage: garageLabel });

  // Auto-create a Queued work order on the Maintenance side so the Garage
  // Manager sees it land without anyone re-typing what Fleet already knows.
  // One-directional by design: this creates the work order, but a work
  // order's status does NOT write back to change Fleet status (that's the
  // other half of Phase 2c, intentionally not built yet).
  const { refNo } = await createGarageWorkOrderFromFleet({
    plate: body.plate, staffName: body.staffName, remarks: body.remarks,
    serviceLocationType: body.serviceLocationType, internalLocation: body.internalLocation, externalVendorId: body.externalVendorId,
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
    const isExternal = body.serviceLocationType === "External";
    if (isExternal && !body.externalVendorId) throw new Error("Please select a garage.");
    let garageLabel = isExternal ? "" : (body.internalLocation || "SmilesCars Garage");
    if (isExternal) {
      const v = await q1(`SELECT name FROM vendors WHERE id=$1`, [body.externalVendorId]);
      garageLabel = v ? v.name : "External garage";
    }
    await clearFleetRow(body.originalPlate, "Maintenance", { remarks: origNote, garage: garageLabel });
    await addHistory({ plate: body.originalPlate, type: body.originalType || "", action: "Sent to Maintenance", remarks: origNote, garage: garageLabel, location: body.location || "", staffName: body.staffName });

    // This was the bug: replaceVehicle previously never created a work
    // order at all, so a car sent to garage via a replacement went
    // completely invisible on the Garage board. Now goes through the same
    // shared helper setMaintenance uses, so the two flows can't drift apart.
    await createGarageWorkOrderFromFleet({
      plate: body.originalPlate, staffName: body.staffName, remarks: origNote,
      serviceLocationType: body.serviceLocationType, internalLocation: body.internalLocation, externalVendorId: body.externalVendorId,
    });
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
    pick_up_city: body.pickUpCity || "", drop_off_city: body.dropOffCity || "", status: "Active",
  });
  return { success: true, id };
}

export async function editReservation(body) {
  if (!body.id) throw new Error("ID is required");
  const existing = await q1(`SELECT staff_name, status FROM reservations WHERE id=$1`, [body.id]);
  if (!existing) throw new Error("Reservation not found");
  await requireOwnReservationOrManager(body.staffName, existing.staff_name);
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
  if (body.pickUpCity !== undefined) setObj.pick_up_city = body.pickUpCity;
  if (body.dropOffCity !== undefined) setObj.drop_off_city = body.dropOffCity;
  const n = await update("reservations", setObj, "id", body.id);
  if (!n) throw new Error("Reservation not found");
  return { success: true };
}

// Edit/Cancel: allowed for the staff member who made the reservation, OR
// Admin/Manager (who retain full access to any reservation). Delete stays
// Admin/Manager-only, unchanged from before.
async function requireOwnReservationOrManager(staffName, ownerName) {
  const row = await staffRow(staffName);
  if (row && !staffActive(row)) throw new Error("This account has been deactivated.");
  const role = row ? String(row.role || "Staff").trim() : "Staff";
  if (role === "Manager" || role === "Admin") return;
  if (staffName && ownerName && staffName.trim() === ownerName.trim()) return;
  throw new Error("You can only edit or cancel your own reservations.");
}

export async function cancelReservation(body) {
  if (!body.id) throw new Error("ID is required");
  if (!body.reason || !body.reason.trim()) throw new Error("A cancellation reason is required");
  const existing = await q1(`SELECT staff_name, status FROM reservations WHERE id=$1`, [body.id]);
  if (!existing) throw new Error("Reservation not found");
  await requireOwnReservationOrManager(body.staffName, existing.staff_name);
  if (existing.status === "Cancelled") throw new Error("This reservation is already cancelled.");
  await update("reservations", {
    status: "Cancelled", cancel_reason: body.reason.trim(),
    cancelled_by: body.staffName || "", cancelled_at: nowTZ(),
  }, "id", body.id);
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

// Shared by setMaintenance and replaceVehicle -- both are "send this car to
// garage" from the Fleet side, and both must create the SAME kind of linked
// work order. Having one function here (instead of each caller re-writing
// its own insert) is what stops the two flows from silently drifting apart
// again, which is exactly how replaceVehicle ended up not creating a work
// order at all.
async function createGarageWorkOrderFromFleet({ plate, staffName, remarks, serviceLocationType, internalLocation, externalVendorId }) {
  const isExternal = serviceLocationType === "External";
  const { refNo, now } = await nextMaintenanceRefNo();
  const id = "MX-" + crypto.randomUUID().split("-")[0].toUpperCase();
  let vendorName = "";
  if (isExternal && externalVendorId) {
    const v = await q1(`SELECT name FROM vendors WHERE id=$1`, [externalVendorId]);
    vendorName = v ? v.name : "";
  }
  await insert("maintenance_log", {
    id, ref_no: refNo, plate, opened_by: staffName || "", assigned_mechanic: "",
    issue_description: remarks || "", status: "Queued", date_opened: now,
    odometer: "", notes: `Auto-created from Fleet "Send to Garage"${isExternal ? ` (${vendorName || "external vendor"})` : ""}.`,
    service_location_type: isExternal ? "External" : "Internal",
    internal_location: !isExternal ? (internalLocation || "SmilesCars Garage") : "",
    external_vendor_id: isExternal ? (externalVendorId || null) : null,
  });
  return { refNo, workOrderId: id };
}

// Phase 4 scheduling — Garage Manager manually records a car's current
// odometer and/or sets the next service threshold. Deliberately not derived
// from Fuel/Maintenance readings (those are point-in-time snapshots at
// different moments, not a reliable "right now" figure) — kept simple and
// explicit per instruction.
export async function setServiceSchedule(body) {
  await requireMaintenanceEditAccess(body.staffName);
  if (!body.plate) throw new Error("Plate is required");
  await fleetRow(body.plate);
  const setObj = {};
  if (body.nextServiceDueKm !== undefined) setObj.nextServiceDueKm = body.nextServiceDueKm;
  if (body.currentOdometer !== undefined) {
    setObj.lastKnownOdometer = body.currentOdometer;
    setObj.odometerUpdatedAt = nowTZ();
  }
  if (Object.keys(setObj).length === 0) throw new Error("Nothing to update");
  await updateFleetRow(body.plate, setObj);
  return { success: true };
}

export async function addMaintenanceLog(body) {
  await requireMaintenanceEditAccess(body.openedBy || body.staffName);
  if (!body.plate) throw new Error("Plate is required");
  const isExternal = body.serviceLocationType === "External";
  // Internal jobs (your own mechanic) still need a name; external jobs are
  // done by the vendor's staff, not tracked as one of your mechanics.
  if (!isExternal && !body.assignedMechanic) throw new Error("Assigned mechanic is required");
  await fleetRow(body.plate); // throws "Car not found" if the plate doesn't exist — catches typos early
  const { refNo, now } = await nextMaintenanceRefNo();
  const id = "MX-" + crypto.randomUUID().split("-")[0].toUpperCase();
  await insert("maintenance_log", {
    id, ref_no: refNo, plate: body.plate, opened_by: body.openedBy || "", assigned_mechanic: body.assignedMechanic || "",
    issue_description: body.issueDescription || "", status: "Queued", date_opened: now,
    odometer: body.odometer || "", notes: body.notes || "",
    service_location_type: isExternal ? "External" : "Internal",
    internal_location: !isExternal ? (body.internalLocation || "") : "",
    external_vendor_id: isExternal ? (body.externalVendorId || null) : null,
  });
  return { success: true, id, refNo };
}

const MAINTENANCE_STATUSES = ["Queued", "In Progress", "Awaiting Parts", "Completed"];

export async function editMaintenanceLog(body) {
  await requireMaintenanceEditAccess(body.staffName);
  if (!body.id) throw new Error("ID is required");
  const existing = await q1(`SELECT status, service_assignment_id, odometer FROM maintenance_log WHERE id=$1`, [body.id]);
  if (!existing) throw new Error("Work order not found");

  const setObj = {};
  if (body.assignedMechanic !== undefined) setObj.assigned_mechanic = body.assignedMechanic;
  if (body.issueDescription !== undefined) setObj.issue_description = body.issueDescription;
  if (body.odometer !== undefined) setObj.odometer = body.odometer;
  if (body.notes !== undefined) setObj.notes = body.notes;
  if (body.serviceLocationType !== undefined) {
    if (!["Internal", "External"].includes(body.serviceLocationType)) throw new Error("Invalid service location type");
    setObj.service_location_type = body.serviceLocationType;
  }
  if (body.internalLocation !== undefined) setObj.internal_location = body.internalLocation;
  if (body.externalVendorId !== undefined) setObj.external_vendor_id = body.externalVendorId || null;
  if (body.flatCost !== undefined) {
    // Explicit null clears flat-cost mode (falls back to itemized sum);
    // a number sets it and becomes the job's total_cost directly — a
    // flat-priced external job isn't the sum of its (possibly absent)
    // line items.
    setObj.flat_cost = body.flatCost === null || body.flatCost === "" ? null : Number(body.flatCost);
    setObj.total_cost = setObj.flat_cost != null ? setObj.flat_cost : await sumMaintenanceItems(body.id);
  }

  if (body.status !== undefined) {
    if (!MAINTENANCE_STATUSES.includes(body.status)) throw new Error("Invalid status: " + body.status);
    setObj.status = body.status;
    // Auto-stamp date_closed on completion; clear it if moved back out of
    // Completed (e.g. staff correcting a mistaken close).
    if (body.status === "Completed" && existing.status !== "Completed") {
      setObj.date_closed = nowTZ();
      // Reset the recurring-service baseline this work order was created
      // from, so the next-due calculation restarts from today. Best-effort
      // — the odometer entered on THIS work order becomes the new
      // last_done_km; falls back to no km update if none was entered.
      if (existing.service_assignment_id) {
        const kmDigits = String(body.odometer ?? existing.odometer ?? "").replace(/[^\d]/g, "");
        await update("car_service_assignments", {
          last_done_date: nowTZ(),
          ...(kmDigits ? { last_done_km: Number(kmDigits) } : {}),
          updated_at: nowTZ(),
        }, "id", existing.service_assignment_id);
      }
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
async function sumMaintenanceItems(workOrderId) {
  const row = await q1(`SELECT COALESCE(SUM(line_total),0) AS total FROM maintenance_items WHERE work_order_id=$1`, [workOrderId]);
  return Number(row.total) || 0;
}

// Recomputes total_cost from job card items -- UNLESS a flat_cost is set,
// in which case that flat price is the job's total regardless of what
// items exist (a flat-priced external job's total isn't the sum of its
// optional line items). Called after any item add/edit/delete.
async function recomputeMaintenanceTotal(workOrderId) {
  const wo = await q1(`SELECT flat_cost FROM maintenance_log WHERE id=$1`, [workOrderId]);
  if (wo && wo.flat_cost != null) return; // flat cost wins; item changes don't affect total_cost
  const total = await sumMaintenanceItems(workOrderId);
  await update("maintenance_log", { total_cost: total, updated_at: nowTZ() }, "id", workOrderId);
}

// Adjusts a part's stock by delta (negative to decrement, positive to
// restore). No-ops silently if partId is empty (free-text items aren't
// linked to inventory) — stock tracking is opt-in per item, not enforced.
async function adjustPartStock(partId, delta) {
  if (!partId || !delta) return;
  await run(`UPDATE parts SET quantity_on_hand = GREATEST(0, quantity_on_hand + $1), updated_at = now() WHERE id = $2`, [delta, partId]);
}

export async function addMaintenanceItem(body) {
  await requireMaintenanceEditAccess(body.staffName);
  if (!body.workOrderId) throw new Error("Work order ID is required");
  if (!body.itemName) throw new Error("Item name is required");
  const wo = await q1(`SELECT id FROM maintenance_log WHERE id=$1`, [body.workOrderId]);
  if (!wo) throw new Error("Work order not found");
  const qty = Number(body.quantity) || 1;
  const unitCost = Number(body.unitCost) || 0;
  const id = "MI-" + crypto.randomUUID().split("-")[0].toUpperCase();
  await insert("maintenance_items", {
    id, work_order_id: body.workOrderId, item_name: body.itemName,
    quantity: qty, unit_cost: unitCost, line_total: qty * unitCost, part_id: body.partId || null,
  });
  await adjustPartStock(body.partId, -qty);
  await recomputeMaintenanceTotal(body.workOrderId);
  return { success: true, id };
}

export async function editMaintenanceItem(body) {
  await requireMaintenanceEditAccess(body.staffName);
  if (!body.id) throw new Error("Item ID is required");
  const existing = await q1(`SELECT work_order_id, quantity, unit_cost, part_id FROM maintenance_items WHERE id=$1`, [body.id]);
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
  // Only adjust stock if quantity actually changed and the item is linked
  // to a part — the delta between old and new quantity is what moved.
  if (body.quantity !== undefined && existing.part_id) {
    const delta = Number(existing.quantity) - qty; // e.g. 3 -> 2 means 1 goes back to stock
    await adjustPartStock(existing.part_id, delta);
  }
  await recomputeMaintenanceTotal(existing.work_order_id);
  return { success: true };
}

export async function deleteMaintenanceItem(body) {
  await requireMaintenanceEditAccess(body.staffName);
  if (!body.id) throw new Error("Item ID is required");
  const row = await q1(`SELECT work_order_id, quantity, part_id FROM maintenance_items WHERE id=$1`, [body.id]);
  if (!row) throw new Error("Item not found");
  await run(`DELETE FROM maintenance_items WHERE id=$1`, [body.id]);
  await adjustPartStock(row.part_id, Number(row.quantity)); // restore stock on delete
  await recomputeMaintenanceTotal(row.work_order_id);
  return { success: true };
}

// Running timeline of updates on a work order — separate from the single
// notes field, entries are never overwritten so the whole history stays
// visible (who said what, when).
export async function addMaintenanceUpdate(body) {
  await requireMaintenanceEditAccess(body.author || body.staffName);
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

// ── Garage: Vendors ─────────────────────────────────────────────────────────
export async function addVendor(body) {
  await requireMaintenanceEditAccess(body.staffName);
  if (!body.name || !body.name.trim()) throw new Error("Vendor name is required");
  const id = "VEN-" + crypto.randomUUID().split("-")[0].toUpperCase();
  await insert("vendors", {
    id, name: body.name.trim(), contact_person: body.contactPerson || "", phone: body.phone || "",
    location: body.location || "", categories: body.categories || "", payment_terms: body.paymentTerms || "",
    vendor_type: body.vendorType || "Parts Supplier",
    notes: body.notes || "", active: "TRUE",
  });
  return { success: true, id };
}

export async function editVendor(body) {
  await requireMaintenanceEditAccess(body.staffName);
  if (!body.id) throw new Error("ID is required");
  const setObj = {};
  if (body.name !== undefined) setObj.name = body.name;
  if (body.contactPerson !== undefined) setObj.contact_person = body.contactPerson;
  if (body.phone !== undefined) setObj.phone = body.phone;
  if (body.location !== undefined) setObj.location = body.location;
  if (body.categories !== undefined) setObj.categories = body.categories;
  if (body.paymentTerms !== undefined) setObj.payment_terms = body.paymentTerms;
  if (body.vendorType !== undefined) setObj.vendor_type = body.vendorType;
  if (body.notes !== undefined) setObj.notes = body.notes;
  if (body.active !== undefined) setObj.active = body.active ? "TRUE" : "FALSE";
  setObj.updated_at = nowTZ();
  const n = await update("vendors", setObj, "id", body.id);
  if (!n) throw new Error("Vendor not found");
  return { success: true };
}

export async function deleteVendor(body) {
  await requireMaintenanceEditAccess(body.staffName);
  if (!body.id) throw new Error("ID is required");
  const inUse = await q1(`SELECT id FROM parts WHERE vendor_id=$1 LIMIT 1`, [body.id]);
  if (inUse) throw new Error("This vendor is linked to one or more parts — remove or reassign those first.");
  await run(`DELETE FROM vendors WHERE id=$1`, [body.id]);
  return { success: true };
}

// ── Garage: Parts Inventory ───────────────────────────────────────────────
export async function addPart(body) {
  await requireMaintenanceEditAccess(body.staffName);
  if (!body.name || !body.name.trim()) throw new Error("Part name is required");
  const id = "PRT-" + crypto.randomUUID().split("-")[0].toUpperCase();
  await insert("parts", {
    id, name: body.name.trim(), category: body.category || "", vendor_id: body.vendorId || null,
    unit_cost: Number(body.unitCost) || 0, quantity_on_hand: Number(body.quantityOnHand) || 0,
    reorder_threshold: Number(body.reorderThreshold) || 0, notes: body.notes || "", active: "TRUE",
  });
  return { success: true, id };
}

export async function editPart(body) {
  await requireMaintenanceEditAccess(body.staffName);
  if (!body.id) throw new Error("ID is required");
  const setObj = {};
  if (body.name !== undefined) setObj.name = body.name;
  if (body.category !== undefined) setObj.category = body.category;
  if (body.vendorId !== undefined) setObj.vendor_id = body.vendorId || null;
  if (body.unitCost !== undefined) setObj.unit_cost = Number(body.unitCost) || 0;
  if (body.quantityOnHand !== undefined) setObj.quantity_on_hand = Number(body.quantityOnHand) || 0;
  if (body.reorderThreshold !== undefined) setObj.reorder_threshold = Number(body.reorderThreshold) || 0;
  if (body.notes !== undefined) setObj.notes = body.notes;
  if (body.active !== undefined) setObj.active = body.active ? "TRUE" : "FALSE";
  setObj.updated_at = nowTZ();
  const n = await update("parts", setObj, "id", body.id);
  if (!n) throw new Error("Part not found");
  return { success: true };
}

export async function deletePart(body) {
  await requireMaintenanceEditAccess(body.staffName);
  if (!body.id) throw new Error("ID is required");
  const inUse = await q1(`SELECT id FROM maintenance_items WHERE part_id=$1 LIMIT 1`, [body.id]);
  if (inUse) throw new Error("This part has been used on a job card — deactivate it instead of deleting.");
  await run(`DELETE FROM parts WHERE id=$1`, [body.id]);
  return { success: true };
}

// ── Garage: Recurring Service Templates ────────────────────────────────────
export async function addServiceTemplate(body) {
  await requireMaintenanceEditAccess(body.staffName);
  if (!body.name || !body.name.trim()) throw new Error("Template name is required");
  if (!body.intervalKm && !body.intervalMonths) throw new Error("Set at least one interval (km or months)");
  const id = "TPL-" + crypto.randomUUID().split("-")[0].toUpperCase();
  await insert("service_templates", {
    id, name: body.name.trim(), description: body.description || "",
    interval_km: body.intervalKm || null, interval_months: body.intervalMonths || null, active: "TRUE",
  });
  return { success: true, id };
}

export async function editServiceTemplate(body) {
  await requireMaintenanceEditAccess(body.staffName);
  if (!body.id) throw new Error("ID is required");
  const setObj = {};
  if (body.name !== undefined) setObj.name = body.name;
  if (body.description !== undefined) setObj.description = body.description;
  if (body.intervalKm !== undefined) setObj.interval_km = body.intervalKm || null;
  if (body.intervalMonths !== undefined) setObj.interval_months = body.intervalMonths || null;
  if (body.active !== undefined) setObj.active = body.active ? "TRUE" : "FALSE";
  setObj.updated_at = nowTZ();
  const n = await update("service_templates", setObj, "id", body.id);
  if (!n) throw new Error("Template not found");
  return { success: true };
}

export async function deleteServiceTemplate(body) {
  await requireMaintenanceEditAccess(body.staffName);
  if (!body.id) throw new Error("ID is required");
  const inUse = await q1(`SELECT id FROM car_service_assignments WHERE template_id=$1 LIMIT 1`, [body.id]);
  if (inUse) throw new Error("This template is assigned to one or more cars — remove those assignments first.");
  await run(`DELETE FROM service_templates WHERE id=$1`, [body.id]);
  return { success: true };
}

export async function addTemplatePart(body) {
  await requireMaintenanceEditAccess(body.staffName);
  if (!body.templateId) throw new Error("Template ID is required");
  if (!body.partId) throw new Error("Part is required");
  const id = "TPP-" + crypto.randomUUID().split("-")[0].toUpperCase();
  await insert("service_template_parts", { id, template_id: body.templateId, part_id: body.partId, quantity: Number(body.quantity) || 1 });
  return { success: true, id };
}

export async function deleteTemplatePart(body) {
  await requireMaintenanceEditAccess(body.staffName);
  if (!body.id) throw new Error("ID is required");
  await run(`DELETE FROM service_template_parts WHERE id=$1`, [body.id]);
  return { success: true };
}

// ── Garage: Car <-> Template Assignments ───────────────────────────────────
export async function assignServiceTemplate(body) {
  await requireMaintenanceEditAccess(body.staffName);
  if (!body.plate) throw new Error("Plate is required");
  if (!body.templateId) throw new Error("Template is required");
  await fleetRow(body.plate);
  const existing = await q1(`SELECT id FROM car_service_assignments WHERE plate=$1 AND template_id=$2`, [body.plate, body.templateId]);
  if (existing) throw new Error("This car is already assigned to this template.");
  const id = "CSA-" + crypto.randomUUID().split("-")[0].toUpperCase();
  await insert("car_service_assignments", {
    id, plate: body.plate, template_id: body.templateId,
    last_done_km: body.lastDoneKm || null, last_done_date: body.lastDoneDate || null, active: "TRUE",
  });
  return { success: true, id };
}

export async function editCarServiceAssignment(body) {
  await requireMaintenanceEditAccess(body.staffName);
  if (!body.id) throw new Error("ID is required");
  const setObj = {};
  if (body.lastDoneKm !== undefined) setObj.last_done_km = body.lastDoneKm || null;
  if (body.lastDoneDate !== undefined) setObj.last_done_date = body.lastDoneDate || null;
  if (body.active !== undefined) setObj.active = body.active ? "TRUE" : "FALSE";
  setObj.updated_at = nowTZ();
  const n = await update("car_service_assignments", setObj, "id", body.id);
  if (!n) throw new Error("Assignment not found");
  return { success: true };
}

export async function removeServiceAssignment(body) {
  await requireMaintenanceEditAccess(body.staffName);
  if (!body.id) throw new Error("ID is required");
  await run(`DELETE FROM car_service_assignments WHERE id=$1`, [body.id]);
  return { success: true };
}

// Creates a Queued work order pre-filled from a template: links back via
// service_assignment_id (so completion can find and reset the right
// baseline), and adds the template's standard parts as job card items --
// each one drawn from live Parts Inventory (cost + stock decrement handled
// by the normal addMaintenanceItem path, not duplicated here).
export async function createWorkOrderFromTemplate(body) {
  await requireMaintenanceEditAccess(body.staffName);
  if (!body.assignmentId) throw new Error("Assignment ID is required");
  const assignment = await q1(`SELECT * FROM car_service_assignments WHERE id=$1`, [body.assignmentId]);
  if (!assignment) throw new Error("Assignment not found");
  const template = await q1(`SELECT * FROM service_templates WHERE id=$1`, [assignment.template_id]);
  if (!template) throw new Error("Template not found");
  await fleetRow(assignment.plate);

  const { refNo, now } = await nextMaintenanceRefNo();
  const id = "MX-" + crypto.randomUUID().split("-")[0].toUpperCase();
  await insert("maintenance_log", {
    id, ref_no: refNo, plate: assignment.plate, opened_by: body.staffName || "",
    assigned_mechanic: body.assignedMechanic || "",
    issue_description: template.name + (template.description ? " — " + template.description : ""),
    status: "Queued", date_opened: now, odometer: body.odometer || "",
    notes: `Auto-created from recurring template "${template.name}".`,
    service_location_type: "Internal", internal_location: body.internalLocation || "SmilesCars Garage",
    service_assignment_id: assignment.id,
  });

  const templateParts = await q(`SELECT * FROM service_template_parts WHERE template_id=$1`, [assignment.template_id]);
  for (const tp of templateParts) {
    // Reuse addMaintenanceItem's own logic path conceptually, but inline
    // here since we're already inside a batch of related inserts and want
    // one clear failure mode (template parts are best-effort — a missing/
    // deactivated part shouldn't block the whole work order from creating).
    const part = await q1(`SELECT * FROM parts WHERE id=$1`, [tp.part_id]);
    if (!part) continue;
    const qty = Number(tp.quantity) || 1;
    const unitCost = Number(part.unit_cost) || 0;
    const itemId = "MI-" + crypto.randomUUID().split("-")[0].toUpperCase();
    await insert("maintenance_items", {
      id: itemId, work_order_id: id, item_name: part.name, quantity: qty,
      unit_cost: unitCost, line_total: qty * unitCost, part_id: part.id,
    });
    await adjustPartStock(part.id, -qty);
  }
  await recomputeMaintenanceTotal(id);

  return { success: true, id, refNo };
}

// ── Garage: Checklist / Inspection Templates ───────────────────────────────
export async function addChecklistTemplate(body) {
  await requireMaintenanceEditAccess(body.staffName);
  if (!body.name || !body.name.trim()) throw new Error("Checklist name is required");
  const id = "CKT-" + crypto.randomUUID().split("-")[0].toUpperCase();
  await insert("checklist_templates", { id, name: body.name.trim(), description: body.description || "", active: "TRUE" });
  return { success: true, id };
}

export async function editChecklistTemplate(body) {
  await requireMaintenanceEditAccess(body.staffName);
  if (!body.id) throw new Error("ID is required");
  const setObj = {};
  if (body.name !== undefined) setObj.name = body.name;
  if (body.description !== undefined) setObj.description = body.description;
  if (body.active !== undefined) setObj.active = body.active ? "TRUE" : "FALSE";
  setObj.updated_at = nowTZ();
  const n = await update("checklist_templates", setObj, "id", body.id);
  if (!n) throw new Error("Template not found");
  return { success: true };
}

export async function deleteChecklistTemplate(body) {
  await requireMaintenanceEditAccess(body.staffName);
  if (!body.id) throw new Error("ID is required");
  const inUse = await q1(`SELECT id FROM checklist_instances WHERE template_id=$1 LIMIT 1`, [body.id]);
  if (inUse) throw new Error("This template has completed checklists on record — deactivate it instead of deleting.");
  await run(`DELETE FROM checklist_templates WHERE id=$1`, [body.id]);
  return { success: true };
}

export async function addChecklistTemplateItem(body) {
  await requireMaintenanceEditAccess(body.staffName);
  if (!body.templateId) throw new Error("Template ID is required");
  if (!body.label || !body.label.trim()) throw new Error("Item label is required");
  const id = "CKI-" + crypto.randomUUID().split("-")[0].toUpperCase();
  await insert("checklist_template_items", { id, template_id: body.templateId, label: body.label.trim(), sort_order: body.sortOrder || 0 });
  return { success: true, id };
}

export async function deleteChecklistTemplateItem(body) {
  await requireMaintenanceEditAccess(body.staffName);
  if (!body.id) throw new Error("ID is required");
  await run(`DELETE FROM checklist_template_items WHERE id=$1`, [body.id]);
  return { success: true };
}

// Fills out a checklist in one call: creates the instance and all its item
// results together, so the UI can submit a whole completed form at once
// rather than round-tripping per item. has_failure is computed here from
// the submitted items, not left to the client, so it can't drift.
export async function submitChecklist(body) {
  await requireMaintenanceEditAccess(body.staffName);
  if (!body.templateId) throw new Error("Template is required");
  if (!body.plate) throw new Error("Plate is required");
  if (!Array.isArray(body.items) || body.items.length === 0) throw new Error("At least one checklist item is required");
  await fleetRow(body.plate);
  const hasFailure = body.items.some((it) => it.state === "Fail");
  const id = "CKR-" + crypto.randomUUID().split("-")[0].toUpperCase();
  await insert("checklist_instances", {
    id, template_id: body.templateId, plate: body.plate, work_order_id: body.workOrderId || null,
    completed_by: body.staffName || "", has_failure: hasFailure ? "TRUE" : "FALSE",
  });
  for (let i = 0; i < body.items.length; i++) {
    const it = body.items[i];
    if (!["Good", "Needs Attention", "Fail"].includes(it.state)) throw new Error("Invalid item state: " + it.state);
    const itemId = "CKRI-" + crypto.randomUUID().split("-")[0].toUpperCase();
    await insert("checklist_instance_items", {
      id: itemId, instance_id: id, label: it.label, state: it.state, note: it.note || "", sort_order: i,
    });
  }
  return { success: true, id, hasFailure };
}

// ── Leads ───────────────────────────────────────────────────────────────────
const LEAD_STAGES = ["New", "Contacted", "Negotiating", "Outcome"];

export async function addLead(body) {
  if (!body.clientName || !body.clientName.trim()) throw new Error("Client name is required");
  if (!body.phone || !body.phone.trim()) throw new Error("Contact number is required");
  // id is server-generated — ignore whatever the frontend sent (it stamps a
  // temporary LEAD-<timestamp> id for optimistic UI before the real save).
  const id = "LEAD-" + crypto.randomUUID().split("-")[0].toUpperCase();
  const now = nowTZ();
  await insert("leads", {
    id, client_name: body.clientName.trim(), phone: body.phone.trim(),
    booking_type: body.bookingType || "Rental", pick_up_location: body.pickUpLocation || "",
    vehicle: body.vehicle || "", pickup_date: body.pickupDate || "", return_date: body.returnDate || "",
    source: body.source || "WhatsApp", stage: "New", outcome: "",
    assigned_staff: body.assignedStaff || "", notes: body.notes || "", lost_reason: "",
    last_contact_date: now, created_at: now, updated_at: now,
  });
  return { success: true, id };
}

export async function editLead(body) {
  if (!body.id) throw new Error("ID is required");
  const existing = await q1(`SELECT id FROM leads WHERE id=$1`, [body.id]);
  if (!existing) throw new Error("Lead not found");

  const setObj = {};
  if (body.clientName !== undefined) setObj.client_name = body.clientName;
  if (body.phone !== undefined) setObj.phone = body.phone;
  if (body.bookingType !== undefined) setObj.booking_type = body.bookingType;
  if (body.pickUpLocation !== undefined) setObj.pick_up_location = body.pickUpLocation;
  if (body.vehicle !== undefined) setObj.vehicle = body.vehicle;
  if (body.pickupDate !== undefined) setObj.pickup_date = body.pickupDate;
  if (body.returnDate !== undefined) setObj.return_date = body.returnDate;
  if (body.source !== undefined) setObj.source = body.source;
  if (body.assignedStaff !== undefined) setObj.assigned_staff = body.assignedStaff;
  if (body.notes !== undefined) setObj.notes = body.notes;
  if (body.convertedReservationId !== undefined) setObj.converted_reservation_id = body.convertedReservationId;

  if (body.stage !== undefined) {
    if (!LEAD_STAGES.includes(body.stage)) throw new Error("Invalid stage: " + body.stage);
    setObj.stage = body.stage;
  }
  if (body.outcome !== undefined) {
    if (body.outcome && !["Won", "Lost"].includes(body.outcome)) throw new Error("Invalid outcome: " + body.outcome);
    setObj.outcome = body.outcome;
  }
  if (body.lostReason !== undefined) setObj.lost_reason = body.lostReason;

  // Any edit counts as contact — drives the 3-day stale badge on the board.
  setObj.last_contact_date = nowTZ();
  setObj.updated_at = nowTZ();

  const n = await update("leads", setObj, "id", body.id);
  if (!n) throw new Error("Lead not found");
  return { success: true };
}

export async function deleteLead(body) {
  if (!body.id) throw new Error("ID is required");
  const n = await run(`DELETE FROM leads WHERE id=$1`, [body.id]);
  return { success: true };
}
