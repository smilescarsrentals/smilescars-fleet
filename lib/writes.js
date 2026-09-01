// lib/writes.js — every POST action that mutates structured data, ported to
// Supabase. Binary uploads (photos, signatures, agreement PDFs) live in
// lib/files.js; everything here is plain relational work.
import crypto from "node:crypto";
import {
  q, q1, run, insert, update, coerce, D, nowTZ, todayTZ,
  updateFleetRow, clearFleetRow, addHistory, staffRow, staffActive, requireManagerOrAdmin, requireAdmin, requireMaintenanceEditAccess, realFleetLocation, requireNotGarageManager, createNotification, notifyRole, requireDriverManageAccess, requireFuelVoucherAccess, requireHREditAccess, requireCOOAccess, requireHREditOrCOOAccess, requireWorkflowUploadAccess, requireWorkflowApproveAccess, HR_ENABLED_LOCATIONS, tx,
} from "./core.js";
import { deleteFile, storeFile } from "./files.js";
import { ONBOARDING_DEFAULT_ITEMS } from "./reads.js";
import { extractWorkflowInvoiceInfo } from "./workflowInvoiceScan.js";

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
  await requireNotGarageManager(body.staffName);
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
      timestamp: body.actualTimestamp || undefined,
    });
  } catch (err) {
    console.error("addHistory failed after checkOut for " + body.plate + ": " + err.message);
  }
  return { success: true };
}

// Logs several Transfer legs for the same car/client in one submission —
// built for the real-world case where transfers happen at odd hours
// (2am, then 9am) and staff can't realistically log each one live.
// Each leg gets its own "actually happened at" timestamp (not "now"),
// and each leg can independently be marked completed (with its own
// return time) or left open — the car's final Fleet status is whatever
// the LAST leg in the list says (still out, or back).
//
// Not wrapped in a single DB transaction: each leg's History rows are
// written with their own awaited insert, so a failure partway through
// leaves whatever legs succeeded before it actually saved (visible,
// not silently lost) rather than an all-or-nothing rollback — appropriate
// for a manual retroactive data-entry tool, not a financial operation.
export async function logMultiLegTransfer(body) {
  await requireNotGarageManager(body.staffName);
  if (!body.plate) throw new Error("Plate is required.");
  if (!body.client) throw new Error("Client name is required.");
  if (!body.staffName) throw new Error("Staff name is required.");
  const legs = Array.isArray(body.legs) ? body.legs : [];
  if (!legs.length) throw new Error("At least one leg is required.");
  for (const [i, leg] of legs.entries()) {
    if (!leg.pickupFrom || !leg.dropoffTo || !leg.outTimestamp) {
      throw new Error(`Leg ${i + 1} is missing a pickup, dropoff, or time.`);
    }
  }

  const r = await fleetRow(body.plate);
  const shared = {
    plate: body.plate, type: r.type, client: body.client, clientPhone: body.clientPhone || "",
    location: body.location || r.location || "", staffName: body.staffName,
    amount: body.amount || "", currency: body.currency || "TZS",
    policeFine: body.policeFine || "", parkingFine: body.parkingFine || "",
    paymentStatus: body.paymentStatus || "Unpaid", amountPaid: body.amountPaid || "",
    driver: body.driver || "",
  };

  for (const leg of legs) {
    const remarks = ["PickUp From: " + leg.pickupFrom, "DropOff To: " + leg.dropoffTo, body.remarks || ""].filter(Boolean).join(" | ");
    const outDate = String(leg.outTimestamp).slice(0, 10);
    await addHistory({
      ...shared, action: "Transfer Out", remarks,
      bookedFrom: outDate, returnDate: outDate, timestamp: leg.outTimestamp,
    });
    if (leg.inTimestamp) {
      const inDate = String(leg.inTimestamp).slice(0, 10);
      await addHistory({
        ...shared, action: "Transfer Completed", remarks,
        bookedFrom: outDate, returnDate: inDate, timestamp: leg.inTimestamp,
      });
    }
  }

  const lastLeg = legs[legs.length - 1];
  if (lastLeg.inTimestamp) {
    await clearFleetRow(body.plate, "Available", {
      remarks: `PickUp From: ${lastLeg.pickupFrom} | DropOff To: ${lastLeg.dropoffTo}`,
    });
  } else {
    const outDate = String(lastLeg.outTimestamp).slice(0, 10);
    await updateFleetRow(body.plate, {
      status: "Rented", currentClient: body.client, clientPhone: body.clientPhone || "",
      bookedFrom: outDate, returnDate: outDate,
      remarks: `PickUp From: ${lastLeg.pickupFrom} | DropOff To: ${lastLeg.dropoffTo}`,
      location: body.location || r.location || "", amount: body.amount || "",
      currency: body.currency || "TZS", garage: "", paymentStatus: body.paymentStatus || "Unpaid",
      amountPaid: body.amountPaid || "", driver: body.driver || "",
      checkedOutBy: body.staffName, bookingType: "Transfer",
    });
  }

  return { success: true, legsLogged: legs.length, carStatus: lastLeg.inTimestamp ? "Available" : "Rented" };
}

export async function markReturned(body) {
  await requireNotGarageManager(body.staffName);
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
    timestamp: body.actualTimestamp || undefined,
  });
  return { success: true };
}

export async function extendBooking(body) {
  await requireNotGarageManager(body.staffName);
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

// A rented car going in for a quick service check, staying that same
// client's car the whole time (see markCarAvailable's "client" outcome,
// which is how it comes back). Unlike setMaintenance, this must NOT clear
// current_client/dates/amount -- the rental is still active, just paused
// at the garage. Status becomes Maintenance so it's visibly out of service,
// but everything about who it's rented to is preserved.
// Finds who made the reservation currently keeping this plate checked out
// — used to notify the right staff member when their client's car gets
// pulled into Garage mid-rental, or comes back out again. Best-effort:
// picks the most recent Active reservation whose window covers today: if
// none matches (e.g. an ad-hoc checkout with no matching reservation),
// notifications just go to Admin/Manager instead of failing outright.
async function findReservationStaffForPlate(plate) {
  const today = todayTZ();
  const row = await q1(
    `SELECT staff_name FROM reservations
      WHERE plate=$1 AND status='Active' AND pickup_date <= $2 AND return_date >= $2
      ORDER BY timestamp DESC LIMIT 1`,
    [plate, today]
  );
  return row ? row.staff_name : null;
}

export async function sendRentedCarToMaintenance(body) {
  if (!body.plate) throw new Error("Plate is required");
  if (!body.staffName) throw new Error("Staff name is required");
  if (!body.kmOut || !String(body.kmOut).trim()) throw new Error("Odometer (KM) is required");
  if (!body.fuelOut) throw new Error("Fuel Level is required");
  const isExternal = body.serviceLocationType === "External";
  if (isExternal && !body.externalVendorId) throw new Error("Please select a garage.");
  let garageLabel = isExternal ? "" : (body.internalLocation || "SmilesCars Garage");
  if (isExternal) {
    const v = await q1(`SELECT name FROM vendors WHERE id=$1`, [body.externalVendorId]);
    garageLabel = v ? v.name : "External garage";
  }
  const car = await fleetRow(body.plate);
  const fleetUpdate = { status: "Maintenance", garage: garageLabel, kmOut: body.kmOut, fuelOut: body.fuelOut };
  // A car sent to our own garage/office is physically there now — reflect
  // the real Fleet location (Kinondoni / Dar - NBAA), not just the Garage
  // label. External jobs don't change the car's physical location on our
  // side, so this only applies when isExternal is false.
  if (!isExternal) fleetUpdate.location = realFleetLocation(garageLabel);
  await updateFleetRow(body.plate, fleetUpdate);
  await addHistory({
    plate: body.plate, type: body.type || car.type || "", action: "Sent to Maintenance (Mid-Rental)",
    client: car.current_client || "", clientPhone: car.client_phone || "",
    remarks: body.remarks || "", garage: garageLabel, location: fleetUpdate.location || "", staffName: body.staffName,
    kmOut: body.kmOut, fuelOut: body.fuelOut,
  });

  const resStaff = await findReservationStaffForPlate(body.plate);
  const notifPayload = {
    type: "car_out_for_service", title: `${body.plate} sent for a quick service`,
    message: `${car.current_client || "Client"}'s car went to ${garageLabel} — it'll come straight back once done.`,
    linkPath: "/garage",
  };
  if (resStaff) await createNotification({ recipient: resStaff, ...notifPayload });
  await notifyRole("Admin", notifPayload);
  await notifyRole("Manager", notifPayload);

  const { refNo } = await createGarageWorkOrderFromFleet({
    plate: body.plate, staffName: body.staffName, remarks: body.remarks,
    serviceLocationType: body.serviceLocationType, internalLocation: body.internalLocation, externalVendorId: body.externalVendorId, externalVendorLocation: body.externalVendorLocation,
  });

  return { success: true, workOrderRefNo: refNo };
}

export async function setMaintenance(body) {
  if (!body.plate) throw new Error("Plate is required");
  if (!body.staffName) throw new Error("Staff name is required");
  if (!body.kmOut || !String(body.kmOut).trim()) throw new Error("Odometer (KM) is required");
  if (!body.fuelOut) throw new Error("Fuel Level is required");
  const isExternal = body.serviceLocationType === "External";
  if (isExternal && !body.externalVendorId) throw new Error("Please select a garage.");
  let garageLabel = isExternal ? "" : (body.internalLocation || "SmilesCars Garage");
  if (isExternal) {
    const v = await q1(`SELECT name FROM vendors WHERE id=$1`, [body.externalVendorId]);
    garageLabel = v ? v.name : "External garage";
  }
  const clearExtra = { remarks: body.remarks || "", garage: garageLabel, kmOut: body.kmOut, fuelOut: body.fuelOut };
  if (!isExternal) clearExtra.location = realFleetLocation(garageLabel);
  await clearFleetRow(body.plate, "Maintenance", clearExtra);
  await addHistory({ plate: body.plate, type: body.type || "", action: "Sent to Maintenance", remarks: body.remarks || "", location: clearExtra.location || "", staffName: body.staffName, garage: garageLabel, kmOut: body.kmOut, fuelOut: body.fuelOut });

  // Auto-create a Queued work order on the Maintenance side so the Garage
  // Manager sees it land without anyone re-typing what Fleet already knows.
  // One-directional by design: this creates the work order, but a work
  // order's status does NOT write back to change Fleet status (that's the
  // other half of Phase 2c, intentionally not built yet).
  const { refNo } = await createGarageWorkOrderFromFleet({
    plate: body.plate, staffName: body.staffName, remarks: body.remarks,
    serviceLocationType: body.serviceLocationType, internalLocation: body.internalLocation, externalVendorId: body.externalVendorId, externalVendorLocation: body.externalVendorLocation,
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
  await requireNotGarageManager(body.staffName);
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
  await requireNotGarageManager(body.staffName);
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

// Renames a car's plate WITHOUT rewriting History/Maintenance's existing
// rows (those stay accurate to what actually happened, under whatever
// plate the car had at the time). Instead records the rename in
// plate_history, which getCarByPlate/getCarHistory consult to resolve
// every plate a car has ever been known by, so a lookup under either the
// old or new plate finds the same car's complete history. Runs the Fleet
// update and the alias insert as one transaction — either both happen or
// neither does, since a plate rename with no alias record would silently
// break old-plate lookups going forward.
export async function renameFleetPlate(body) {
  await requireManagerOrAdmin(body.staffName);
  if (!body.oldPlate) throw new Error("Current plate is required");
  if (!body.newPlate || !body.newPlate.trim()) throw new Error("New plate is required");
  const newPlate = body.newPlate.trim();
  if (newPlate === body.oldPlate) throw new Error("New plate is the same as the current plate");

  const existing = await q1(`SELECT plate FROM fleet WHERE plate=$1`, [newPlate]);
  if (existing) throw new Error(`A car already exists with plate ${newPlate} — cannot rename to a plate already in use`);

  const car = await q1(`SELECT plate FROM fleet WHERE plate=$1`, [body.oldPlate]);
  if (!car) throw new Error("Car not found: " + body.oldPlate);

  await tx(async ({ run, q1: txQ1 }) => {
    const n = await run(`UPDATE fleet SET plate=$1 WHERE plate=$2`, [newPlate, body.oldPlate]);
    if (!n) throw new Error("Car not found: " + body.oldPlate);
    const id = "PH-" + crypto.randomUUID().split("-")[0].toUpperCase();
    await run(
      `INSERT INTO plate_history (id, old_plate, new_plate, changed_by) VALUES ($1,$2,$3,$4)`,
      [id, body.oldPlate, newPlate, body.staffName || ""]
    );
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
  await requireNotGarageManager(body.staffName);
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
    if (!body.kmOut || !String(body.kmOut).trim()) throw new Error("Odometer (KM) is required");
    if (!body.fuelOut) throw new Error("Fuel Level is required");
    let garageLabel = isExternal ? "" : (body.internalLocation || "SmilesCars Garage");
    if (isExternal) {
      const v = await q1(`SELECT name FROM vendors WHERE id=$1`, [body.externalVendorId]);
      garageLabel = v ? v.name : "External garage";
    }
    const clearExtra = { remarks: origNote, garage: garageLabel, kmOut: body.kmOut, fuelOut: body.fuelOut };
    if (!isExternal) clearExtra.location = realFleetLocation(garageLabel);
    await clearFleetRow(body.originalPlate, "Maintenance", clearExtra);
    await addHistory({ plate: body.originalPlate, type: body.originalType || "", action: "Sent to Maintenance", remarks: origNote, garage: garageLabel, location: clearExtra.location || "", staffName: body.staffName, kmOut: body.kmOut, fuelOut: body.fuelOut });

    // This was the bug: replaceVehicle previously never created a work
    // order at all, so a car sent to garage via a replacement went
    // completely invisible on the Garage board. Now goes through the same
    // shared helper setMaintenance uses, so the two flows can't drift apart.
    await createGarageWorkOrderFromFleet({
      plate: body.originalPlate, staffName: body.staffName, remarks: origNote,
      serviceLocationType: body.serviceLocationType, internalLocation: body.internalLocation, externalVendorId: body.externalVendorId, externalVendorLocation: body.externalVendorLocation,
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
  await insert("config", { type: "Staff", value: body.name, password: body.password || "", role: body.role || "Staff", phone: body.phone || "", active: "TRUE" });
  return { success: true };
}

// Dedicated function (not the generic addConfigItem, which Locations/
// Garages also use and don't have a phone concept for) — phone is
// required here per instruction, so every driver added through the
// DriverPicker genuinely has one for the rental agreement to print.
export async function addDriverWithPhone(body) {
  if (!body.name || !body.name.trim()) throw new Error("Driver name is required");
  if (!body.phone || !body.phone.trim()) throw new Error("Driver phone number is required");
  const existing = await q1(`SELECT id FROM config WHERE type='Driver' AND btrim(value)=btrim($1)`, [body.name]);
  if (existing) throw new Error("A driver with this name already exists.");
  await insert("config", { type: "Driver", value: body.name.trim(), phone: body.phone.trim() });
  return { success: true };
}

export async function setStaffActive(body) {
  if (!body.name) throw new Error("Staff name is required");
  const n = await run(`UPDATE config SET active=$1 WHERE type='Staff' AND btrim(value)=btrim($2)`, [body.active ? "TRUE" : "FALSE", body.name]);
  if (!n) throw new Error("Staff not found: " + body.name);
  return { success: true };
}

// Wasn't reachable from any UI before — now used by the HR Management
// staff detail view too, which is gated by hr_access rather than role, so
// this accepts either.
export async function setStaffPhone(body) {
  try { await requireManagerOrAdmin(body.staffName); }
  catch { await requireHREditAccess(body.staffName); }
  if (!body.name) throw new Error("Staff name is required");
  const n = await run(`UPDATE config SET phone=$1 WHERE type='Staff' AND btrim(value)=btrim($2)`, [body.phone || "", body.name]);
  if (!n) throw new Error("Staff not found: " + body.name);
  return { success: true };
}

export async function setReceivesAllReservationReminders(body) {
  await requireManagerOrAdmin(body.staffName);
  if (!body.name) throw new Error("Staff name is required");
  const n = await run(
    `UPDATE config SET receives_all_reservation_reminders=$1 WHERE type='Staff' AND btrim(value)=btrim($2)`,
    [body.enabled ? "TRUE" : "FALSE", body.name]
  );
  if (!n) throw new Error("Staff not found: " + body.name);
  return { success: true };
}

export async function setReceivesDriverDocumentReminders(body) {
  await requireManagerOrAdmin(body.staffName);
  if (!body.name) throw new Error("Staff name is required");
  const n = await run(
    `UPDATE config SET receives_driver_document_reminders=$1 WHERE type='Staff' AND btrim(value)=btrim($2)`,
    [body.enabled ? "TRUE" : "FALSE", body.name]
  );
  if (!n) throw new Error("Staff not found: " + body.name);
  return { success: true };
}

export async function setCanManageDrivers(body) {
  await requireManagerOrAdmin(body.staffName);
  if (!body.name) throw new Error("Staff name is required");
  const n = await run(
    `UPDATE config SET can_manage_drivers=$1 WHERE type='Staff' AND btrim(value)=btrim($2)`,
    [body.enabled ? "TRUE" : "FALSE", body.name]
  );
  if (!n) throw new Error("Staff not found: " + body.name);
  return { success: true };
}

export async function setCanIssueFuelVoucher(body) {
  await requireManagerOrAdmin(body.staffName);
  if (!body.name) throw new Error("Staff name is required");
  const n = await run(
    `UPDATE config SET can_issue_fuel_voucher=$1 WHERE type='Staff' AND btrim(value)=btrim($2)`,
    [body.enabled ? "TRUE" : "FALSE", body.name]
  );
  if (!n) throw new Error("Staff not found: " + body.name);
  return { success: true };
}

// Staff branch tagging — which physical location a staff member belongs to
// (Dar es Salaam / Zanzibar / Arusha / Mwanza). Admin-managed, same gate as
// the other Staff-tab controls (setCanManageDrivers/setCanIssueFuelVoucher).
export async function setStaffLocation(body) {
  await requireManagerOrAdmin(body.staffName);
  if (!body.name) throw new Error("Staff name is required");
  const n = await run(
    `UPDATE config SET location=$1 WHERE type='Staff' AND btrim(value)=btrim($2)`,
    [body.location || "", body.name]
  );
  if (!n) throw new Error("Staff not found: " + body.name);
  return { success: true };
}

// HR module access — None / View / Edit. Admin-managed only (not
// Manager-or-Admin like the other Staff-tab toggles): HR access is more
// sensitive than fuel vouchers or driver records, so it doesn't get the
// same Manager bypass.
export async function setHRAccess(body) {
  await requireAdmin(body.staffName);
  if (!body.name) throw new Error("Staff name is required");
  if (!["None", "View", "Edit"].includes(body.access)) throw new Error("Invalid HR access level: " + body.access);
  const n = await run(
    `UPDATE config SET hr_access=$1 WHERE type='Staff' AND btrim(value)=btrim($2)`,
    [body.access, body.name]
  );
  if (!n) throw new Error("Staff not found: " + body.name);
  return { success: true };
}

// COO flag for leave-request final approval. Admin-only to grant, same
// reasoning as setHRAccess.
export async function setIsCoo(body) {
  await requireAdmin(body.staffName);
  if (!body.name) throw new Error("Staff name is required");
  const n = await run(
    `UPDATE config SET is_coo=$1 WHERE type='Staff' AND btrim(value)=btrim($2)`,
    [body.enabled ? "TRUE" : "FALSE", body.name]
  );
  if (!n) throw new Error("Staff not found: " + body.name);
  return { success: true };
}

// ── HR module ────────────────────────────────────────────────────────────
export async function saveHRStaffProfile(body) {
  await requireHREditAccess(body.staffName);
  if (!body.targetStaffName) throw new Error("Target staff name is required");
  const target = await q1(`SELECT value FROM config WHERE type='Staff' AND btrim(value)=btrim($1)`, [body.targetStaffName]);
  if (!target) throw new Error("Staff not found: " + body.targetStaffName);
  await run(
    `INSERT INTO staff_hr_profile (staff_name, national_id, contract_type, start_date, next_of_kin_name, next_of_kin_relationship, next_of_kin_phone, notes, updated_by, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
     ON CONFLICT (staff_name) DO UPDATE SET
       national_id=$2, contract_type=$3, start_date=$4, next_of_kin_name=$5, next_of_kin_relationship=$6, next_of_kin_phone=$7, notes=$8, updated_by=$9, updated_at=now()`,
    [body.targetStaffName, body.nationalId || "", body.contractType || "", body.startDate || null,
     body.nextOfKinName || "", body.nextOfKinRelationship || "", body.nextOfKinPhone || "", body.notes || "", body.staffName]
  );
  return { success: true };
}

// Self-service: any active Dar-tagged staff member can submit their own
// leave request — this is a personal action, deliberately not gated by
// hr_access (see requireHRViewAccess's doc comment in core.js). Starts the
// two-stage approval at "Pending HR".
export async function submitLeaveRequest(body) {
  if (!body.staffName) throw new Error("Staff name is required");
  const row = await q1(`SELECT COALESCE(active,'TRUE') AS active, location FROM config WHERE type='Staff' AND btrim(value)=btrim($1)`, [body.staffName]);
  if (!row || String(row.active).trim().toUpperCase() === "FALSE") throw new Error("This account has been deactivated.");
  if (!HR_ENABLED_LOCATIONS.includes(row.location)) throw new Error("Leave requests aren't available for your location yet.");
  if (!body.leaveType) throw new Error("Leave type is required");
  if (!body.startDate || !body.endDate) throw new Error("Start and end dates are required");
  const start = new Date(body.startDate), end = new Date(body.endDate);
  if (isNaN(start) || isNaN(end) || end < start) throw new Error("Invalid date range");
  const daysNotice = Math.round((new Date(body.startDate) - new Date(todayTZ())) / 86400000);
  if (daysNotice < 2) throw new Error("Leave requests need at least 2 days' notice before the start date.");
  const daysRequested = Math.round((end - start) / 86400000) + 1;

  const id = "LV-" + crypto.randomUUID().split("-")[0].toUpperCase();
  await insert("staff_leave_requests", {
    id, staff_name: body.staffName, leave_type: body.leaveType, start_date: body.startDate, end_date: body.endDate,
    days_requested: daysRequested, reason: body.reason || "", status: "Pending HR",
  });
  return { success: true, id };
}

// Only the requester, and only while the leave is still something to
// revoke — Rejected/Cancelled are already terminal, nothing to undo.
// Deliberately allowed even after full approval (Ramzanali's call: a leave
// gets approved, then turns out not to be needed after all) — but anyone
// who already signed off on it gets notified, since they may have made
// staffing plans around it. A plain withdrawal while still Pending HR (no
// one has acted yet) needs no notification.
export async function cancelLeaveRequest(body) {
  if (!body.staffName) throw new Error("Staff name is required");
  if (!body.requestId) throw new Error("Request ID is required");
  const existing = await q1(`SELECT * FROM staff_leave_requests WHERE id=$1 AND btrim(staff_name)=btrim($2)`, [body.requestId, body.staffName]);
  if (!existing) throw new Error("Request not found or not yours.");
  if (existing.added_by) throw new Error("This was recorded by HR/COO, not requested by you — contact them to make changes.");
  if (!["Pending HR", "Pending COO", "Approved"].includes(existing.status)) {
    throw new Error("This request has already been rejected or cancelled — nothing to revoke.");
  }
  // Deadline is noon the day before the leave starts (start-of-day minus
  // 12 hours) — a leave request due to start imminently can't be pulled
  // at the last minute.
  const startOfDay = new Date(existing.start_date);
  const revokeDeadline = new Date(startOfDay.getTime() - 12 * 60 * 60 * 1000);
  if (new Date() > revokeDeadline) throw new Error("Too close to the start date — revoking now requires at least 12 hours' notice before it begins.");

  await run(`UPDATE staff_leave_requests SET status='Cancelled', cancelled_by=$1, cancelled_at=now() WHERE id=$2`, [body.staffName, body.requestId]);

  const period = `${D(existing.start_date)} to ${D(existing.end_date)}`;
  if ((existing.status === "Pending COO" || existing.status === "Approved") && existing.hr_reviewed_by) {
    await createNotification({
      recipient: existing.hr_reviewed_by, type: "leave_revoked", title: "Leave request revoked",
      message: `${body.staffName} revoked their ${existing.leave_type} leave (${period}) after you approved it.`,
      linkPath: "/hr",
    });
  }
  if (existing.status === "Approved" && existing.coo_reviewed_by) {
    await createNotification({
      recipient: existing.coo_reviewed_by, type: "leave_revoked", title: "Leave request revoked",
      message: `${body.staffName} revoked their ${existing.leave_type} leave (${period}) after final approval.`,
      linkPath: "/hr",
    });
  }
  return { success: true };
}

// HR/COO recording an absence directly -- a staff member who didn't
// submit a request and simply didn't show up. Skips the 2-day-notice
// rule (it's necessarily after the fact) and the approval flow entirely
// (whoever is recording it IS the approval) -- goes straight to Approved.
// added_by marks it as administratively entered, which also blocks the
// staff member from self-revoking it later (see cancelLeaveRequest).
export async function addLeaveOnBehalf(body) {
  await requireHREditOrCOOAccess(body.staffName);
  if (!body.targetStaffName) throw new Error("Target staff name is required");
  if (!body.leaveType) throw new Error("Leave type is required");
  if (!body.startDate || !body.endDate) throw new Error("Start and end dates are required");
  const start = new Date(body.startDate), end = new Date(body.endDate);
  if (isNaN(start) || isNaN(end) || end < start) throw new Error("Invalid date range");
  const target = await q1(`SELECT value, location FROM config WHERE type='Staff' AND btrim(value)=btrim($1)`, [body.targetStaffName]);
  if (!target) throw new Error("Staff not found: " + body.targetStaffName);
  if (!HR_ENABLED_LOCATIONS.includes(target.location)) throw new Error("Leave tracking isn't available for this staff member's location yet.");
  const daysRequested = Math.round((end - start) / 86400000) + 1;

  const id = "LV-" + crypto.randomUUID().split("-")[0].toUpperCase();
  await insert("staff_leave_requests", {
    id, staff_name: body.targetStaffName, leave_type: body.leaveType, start_date: body.startDate, end_date: body.endDate,
    days_requested: daysRequested, reason: body.reason || "", status: "Approved", added_by: body.staffName,
    hr_reviewed_by: body.staffName, hr_reviewed_at: nowTZ(), hr_notes: "Recorded administratively (staff did not submit a request).",
  });
  return { success: true, id };
}

export async function reviewLeaveRequestHR(body) {
  await requireHREditAccess(body.staffName);
  if (!body.requestId) throw new Error("Request ID is required");
  if (!["Approve", "Reject"].includes(body.decision)) throw new Error("Invalid decision");
  const newStatus = body.decision === "Approve" ? "Pending COO" : "Rejected by HR";
  const n = await run(
    `UPDATE staff_leave_requests SET status=$1, hr_reviewed_by=$2, hr_reviewed_at=now(), hr_notes=$3 WHERE id=$4 AND status='Pending HR'`,
    [newStatus, body.staffName, body.notes || "", body.requestId]
  );
  if (!n) throw new Error("Request not found or already reviewed by HR.");
  return { success: true };
}

export async function reviewLeaveRequestCOO(body) {
  await requireCOOAccess(body.staffName);
  if (!body.requestId) throw new Error("Request ID is required");
  if (!["Approve", "Reject"].includes(body.decision)) throw new Error("Invalid decision");
  const newStatus = body.decision === "Approve" ? "Approved" : "Rejected by COO";
  const n = await run(
    `UPDATE staff_leave_requests SET status=$1, coo_reviewed_by=$2, coo_reviewed_at=now(), coo_notes=$3 WHERE id=$4 AND status='Pending COO'`,
    [newStatus, body.staffName, body.notes || "", body.requestId]
  );
  if (!n) throw new Error("Request not found or not awaiting COO review.");
  return { success: true };
}

// Distinct from cancelLeaveRequest (self-service, only while Pending HR):
// this is HR/COO/Admin removing a request outright, any status — for
// genuine mistakes or requests that shouldn't have existed, not part of
// the normal review flow.
export async function deleteLeaveRequest(body) {
  await requireHREditOrCOOAccess(body.staffName);
  if (!body.requestId) throw new Error("Request ID is required");
  const n = await run(`DELETE FROM staff_leave_requests WHERE id=$1`, [body.requestId]);
  if (!n) throw new Error("Request not found.");
  return { success: true };
}

// Disciplinary records are add-only by design — a written or verbal
// warning is a record of what happened, not something to be edited or
// deleted after the fact.
export async function addDisciplinaryRecord(body) {
  await requireHREditAccess(body.staffName);
  if (!body.targetStaffName) throw new Error("Target staff name is required");
  if (!body.date) throw new Error("Date is required");
  if (!["Verbal", "Written", "Suspension", "Other"].includes(body.type)) throw new Error("Invalid record type");
  const target = await q1(`SELECT value FROM config WHERE type='Staff' AND btrim(value)=btrim($1)`, [body.targetStaffName]);
  if (!target) throw new Error("Staff not found: " + body.targetStaffName);
  const id = "DISC-" + crypto.randomUUID().split("-")[0].toUpperCase();
  await insert("staff_disciplinary", {
    id, staff_name: body.targetStaffName, date: body.date, type: body.type, description: body.description || "", issued_by: body.staffName,
  });
  return { success: true, id };
}

// Seeds the default new-hire checklist for a staff member the first time
// their onboarding tab is opened — a no-op (existing !== 0 rows) if it's
// already been seeded, so this is safe to call every time the tab loads.
export async function seedOnboardingChecklist(body) {
  await requireHREditAccess(body.staffName);
  if (!body.targetStaffName) throw new Error("Target staff name is required");
  const existing = await q(`SELECT id FROM staff_onboarding WHERE btrim(staff_name)=btrim($1)`, [body.targetStaffName]);
  if (existing.length > 0) return { success: true, seeded: false };
  const target = await q1(`SELECT value FROM config WHERE type='Staff' AND btrim(value)=btrim($1)`, [body.targetStaffName]);
  if (!target) throw new Error("Staff not found: " + body.targetStaffName);
  for (let i = 0; i < ONBOARDING_DEFAULT_ITEMS.length; i++) {
    const id = "OB-" + crypto.randomUUID().split("-")[0].toUpperCase();
    await insert("staff_onboarding", { id, staff_name: body.targetStaffName, item: ONBOARDING_DEFAULT_ITEMS[i], completed: "FALSE", sort_order: i });
  }
  return { success: true, seeded: true };
}

export async function addOnboardingItem(body) {
  await requireHREditAccess(body.staffName);
  if (!body.targetStaffName) throw new Error("Target staff name is required");
  if (!body.item || !body.item.trim()) throw new Error("Item text is required");
  const maxRow = await q1(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM staff_onboarding WHERE btrim(staff_name)=btrim($1)`, [body.targetStaffName]);
  const id = "OB-" + crypto.randomUUID().split("-")[0].toUpperCase();
  await insert("staff_onboarding", { id, staff_name: body.targetStaffName, item: body.item.trim(), completed: "FALSE", sort_order: (maxRow?.m ?? -1) + 1 });
  return { success: true, id };
}

export async function toggleOnboardingItem(body) {
  await requireHREditAccess(body.staffName);
  if (!body.itemId) throw new Error("Item ID is required");
  const n = await run(
    `UPDATE staff_onboarding SET completed=$1, completed_by=$2, completed_at=$3 WHERE id=$4`,
    [body.completed ? "TRUE" : "FALSE", body.completed ? body.staffName : "", body.completed ? new Date().toISOString() : null, body.itemId]
  );
  if (!n) throw new Error("Checklist item not found.");
  return { success: true };
}

export async function deleteOnboardingItem(body) {
  await requireHREditAccess(body.staffName);
  if (!body.itemId) throw new Error("Item ID is required");
  await run(`DELETE FROM staff_onboarding WHERE id=$1`, [body.itemId]);
  return { success: true };
}

// ── Workflows module (invoice approvals) ────────────────────────────────
// Notifies everyone with Approve tier (Menhal today, but this reads the
// live grants rather than a hardcoded name) whenever there's something new
// for them to look at — a fresh upload or a resubmission after Changes
// Requested. Doesn't notify the actor themselves if they happen to also
// hold Approve tier.
async function notifyWorkflowApprovers({ excludeName, type, title, message }) {
  const approvers = await q(`SELECT value FROM config WHERE type='Staff' AND (workflow_access='Approve' OR role='Admin') AND COALESCE(active,'TRUE')<>'FALSE'`);
  for (const a of approvers) {
    if (a.value.trim().toLowerCase() === (excludeName || "").trim().toLowerCase()) continue;
    await createNotification({ recipient: a.value, type, title, message, linkPath: "/workflows" });
  }
}

export async function uploadWorkflowInvoice(body) {
  await requireWorkflowUploadAccess(body.staffName);
  if (!body.fileBase64) throw new Error("A PDF file is required");
  const buf = Buffer.from(body.fileBase64, "base64");
  const { fileId } = await storeFile({ kind: "workflow-invoice", filename: body.filename || "invoice.pdf", mimeType: body.mimeType || "application/pdf", buffer: buf, createdBy: body.staffName });
  const { invoiceNumber, clientName } = await extractWorkflowInvoiceInfo({ fileBase64: body.fileBase64, mimeType: body.mimeType });

  const id = "WF-" + crypto.randomUUID().split("-")[0].toUpperCase();
  await insert("workflow_invoices", { id, file_id: fileId, note: body.note || "", status: "Pending", uploaded_by: body.staffName, invoice_number: invoiceNumber, client_name: clientName });
  await insert("workflow_invoice_events", { id: "WFE-" + crypto.randomUUID().split("-")[0].toUpperCase(), invoice_id: id, action: "Uploaded", by_staff: body.staffName, file_id: fileId });

  await notifyWorkflowApprovers({
    excludeName: body.staffName, type: "workflow_invoice_uploaded", title: "New invoice to review",
    message: `${body.staffName} uploaded an invoice for review.`,
  });
  return { success: true, id };
}

// Only usable while the invoice is sitting at Changes Requested — replaces
// the file (old one deleted, not kept, to avoid orphaned storage) and
// resets it back to Pending for another review pass. Any Upload-tier
// person can pick this up, not just the original uploader — a small team,
// no reason to block on one person being away.
export async function resubmitWorkflowInvoice(body) {
  await requireWorkflowUploadAccess(body.staffName);
  if (!body.invoiceId) throw new Error("Invoice ID is required");
  if (!body.fileBase64) throw new Error("A PDF file is required");
  const existing = await q1(`SELECT * FROM workflow_invoices WHERE id=$1`, [body.invoiceId]);
  if (!existing) throw new Error("Invoice not found.");
  if (existing.status !== "Changes Requested") throw new Error("This invoice isn't awaiting a resubmission.");

  const buf = Buffer.from(body.fileBase64, "base64");
  const { fileId } = await storeFile({ kind: "workflow-invoice", filename: body.filename || "invoice.pdf", mimeType: body.mimeType || "application/pdf", buffer: buf, createdBy: body.staffName });
  const { invoiceNumber, clientName } = await extractWorkflowInvoiceInfo({ fileBase64: body.fileBase64, mimeType: body.mimeType });
  await deleteFile(existing.file_id).catch(() => {});
  await run(
    `UPDATE workflow_invoices SET file_id=$1, status='Pending', revision=revision+1, reviewed_by='', reviewed_at=NULL, remarks='', invoice_number=$2, client_name=$3 WHERE id=$4`,
    [fileId, invoiceNumber, clientName, body.invoiceId]
  );
  await insert("workflow_invoice_events", { id: "WFE-" + crypto.randomUUID().split("-")[0].toUpperCase(), invoice_id: body.invoiceId, action: "Resubmitted", by_staff: body.staffName, file_id: fileId });

  await notifyWorkflowApprovers({
    excludeName: body.staffName, type: "workflow_invoice_uploaded", title: "Revised invoice to review",
    message: `${body.staffName} resubmitted an invoice for review.`,
  });
  return { success: true };
}

// Called once daily from the cron job. Deletes the actual PDF (not the
// invoice record or its history -- the audit trail of who uploaded/
// approved/requested changes stays intact, only the file itself goes) once
// it's been 14 days since that file was stored. Ties the age to the
// files table's own created_at rather than workflow_invoices.uploaded_at,
// because a resubmission after Changes Requested stores a genuinely new
// file -- using the original upload date would delete a PDF that's only
// been sitting for a day or two since being resubmitted.
export async function deleteExpiredWorkflowInvoicePdfs() {
  const stale = await q(
    `SELECT wi.id AS invoice_id, wi.file_id
       FROM workflow_invoices wi
       JOIN files f ON f.id = wi.file_id
      WHERE wi.file_id <> '' AND f.created_at < now() - interval '14 days'`
  );
  let deleted = 0;
  for (const row of stale) {
    await deleteFile(row.file_id).catch(() => {});
    await run(`UPDATE workflow_invoices SET file_id='', file_deleted_at=now() WHERE id=$1`, [row.invoice_id]);
    await insert("workflow_invoice_events", {
      id: "WFE-" + crypto.randomUUID().split("-")[0].toUpperCase(), invoice_id: row.invoice_id,
      action: "PDF Auto-Deleted", by_staff: "System", remarks: "Automatically removed after 14 days.",
    });
    deleted++;
  }
  return { deleted };
}

export async function reviewWorkflowInvoice(body) {
  await requireWorkflowApproveAccess(body.staffName);
  if (!body.invoiceId) throw new Error("Invoice ID is required");
  if (!["Approve", "RequestChanges"].includes(body.decision)) throw new Error("Invalid decision");
  const existing = await q1(`SELECT * FROM workflow_invoices WHERE id=$1`, [body.invoiceId]);
  if (!existing) throw new Error("Invoice not found.");
  if (existing.status !== "Pending") throw new Error("This invoice has already been reviewed.");

  const newStatus = body.decision === "Approve" ? "Approved" : "Changes Requested";
  await run(`UPDATE workflow_invoices SET status=$1, reviewed_by=$2, reviewed_at=now(), remarks=$3 WHERE id=$4`, [newStatus, body.staffName, body.remarks || "", body.invoiceId]);
  await insert("workflow_invoice_events", { id: "WFE-" + crypto.randomUUID().split("-")[0].toUpperCase(), invoice_id: body.invoiceId, action: newStatus, by_staff: body.staffName, remarks: body.remarks || "" });

  await createNotification({
    recipient: existing.uploaded_by, type: "workflow_invoice_reviewed",
    title: newStatus === "Approved" ? "Invoice approved" : "Changes requested on your invoice",
    message: newStatus === "Approved" ? `${body.staffName} approved your invoice.` : `${body.staffName} requested changes: ${body.remarks || "(no remarks)"}`,
    linkPath: "/workflows",
  });
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

// Bulk fuel-receipt reconciliation: each receipt (already OCR'd and
// human-confirmed on the frontend — plate picked from the real fleet list,
// not raw handwriting) tries to fill in the existing voucher-time row for
// that plate+date rather than creating a duplicate — that row already has
// the real current_km captured when the car was fuelled, only litres/amount
// were unknown until the receipt came in. Falls back to inserting a new row
// only when no such unreconciled row exists, so nothing from a receipt is
// ever silently dropped.
export async function confirmFuelReceipts(body) {
  await requireFuelVoucherAccess(body.staffName);
  if (!Array.isArray(body.receipts) || body.receipts.length === 0) throw new Error("No receipts to save.");

  const usedRefNos = new Set();
  const results = [];

  for (const r of body.receipts) {
    if (!r.plate) throw new Error("Every receipt needs a plate selected.");
    if (!r.date) throw new Error("Every receipt needs a date.");

    const candidates = await q(
      `SELECT ref_no FROM fuel
         WHERE lower(btrim(plate))=lower(btrim($1)) AND date::date = $2::date
           AND (amount_tsh IS NULL OR btrim(amount_tsh) = '')
         ORDER BY timestamp ASC NULLS LAST`,
      [r.plate, r.date]
    );
    const match = candidates.find((c) => !usedRefNos.has(c.ref_no));

    if (match) {
      usedRefNos.add(match.ref_no);
      const setObj = { amount_tsh: r.amount || "", litres: r.litres || "" };
      if (r.product) setObj.product = r.product;
      await update("fuel", setObj, "ref_no", match.ref_no);
      results.push({ plate: r.plate, refNo: match.ref_no, action: "updated" });
    } else {
      const refPrefix = `SC/FUEL/${r.date.slice(0, 4)}/${r.date.slice(5, 7)}/`;
      const refRows = await q(`SELECT ref_no FROM fuel WHERE ref_no LIKE $1`, [refPrefix + "%"]);
      let maxRefNum = 0;
      refRows.forEach((row) => {
        const num = parseInt(String(row.ref_no).replace(refPrefix, ""), 10);
        if (!isNaN(num) && num > maxRefNum) maxRefNum = num;
      });
      const refNo = refPrefix + String(maxRefNum + 1).padStart(4, "0");
      let vehicleType = "";
      const f = await q1(`SELECT type FROM fleet WHERE lower(btrim(plate))=lower(btrim($1)) LIMIT 1`, [r.plate]);
      if (f) vehicleType = f.type || "";
      await insert("fuel", {
        timestamp: nowTZ(), ref_no: refNo, date: r.date, plate: r.plate, vehicle_type: vehicleType,
        product: r.product || "", amount_tsh: r.amount || "", litres: r.litres || "",
        authorised_by: body.staffName, submitted_by: body.staffName,
      });
      results.push({ plate: r.plate, refNo, action: "created" });
    }
  }

  return { success: true, results };
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
async function createGarageWorkOrderFromFleet({ plate, staffName, remarks, serviceLocationType, internalLocation, externalVendorId, externalVendorLocation }) {
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
    external_vendor_location: isExternal ? (externalVendorLocation || null) : null,
  });
  await notifyRole("Garage Manager", {
    type: "fleet_to_garage", title: `${plate} sent to Garage`,
    message: isExternal ? `Sent to ${vendorName || "an external garage"}.` : `Sent to ${internalLocation || "SmilesCars Garage"}.`,
    linkPath: "/garage",
  });
  return { refNo, workOrderId: id };
}

// Phase 4 scheduling — Garage Manager manually records a car's current
// odometer and/or sets the next service threshold. Deliberately not derived
// from Fuel/Maintenance readings (those are point-in-time snapshots at
// different moments, not a reliable "right now" figure) — kept simple and
// explicit per instruction.
// Completing a work order and returning the car to service. Two outcomes:
//  - "client": the car was mid-rental (quick service check), goes straight
//    back to the SAME client -- status stays Rented, all rental fields
//    (client, dates, amount, etc.) are left completely untouched. This is
//    NOT the same as Available, and is logged as its own distinct action
//    so Fleet/Reservations can tell "back in service" apart from "back in
//    the available pool" at a glance.
//  - "available": normal case -- car becomes Available at the chosen
//    location (a real Fleet location, or the "At Garage (Ready for
//    Pickup)" note for a car that's done but not yet collected).
export async function markCarAvailable(body) {
  await requireMaintenanceEditAccess(body.staffName);
  if (!body.plate) throw new Error("Plate is required");
  if (!body.currentKm || !body.currentKm.trim()) throw new Error("Current KM is required");
  if (!body.outcome || !["client", "available"].includes(body.outcome)) throw new Error("Select where this car is going.");

  const car = await fleetRow(body.plate);

  if (body.outcome === "client") {
    await updateFleetRow(body.plate, { status: "Rented", kmOut: body.currentKm });
    await addHistory({
      plate: body.plate, type: car.type || "", action: "Returned to Client from Garage",
      client: car.current_client || "", clientPhone: car.client_phone || "",
      kmOut: body.currentKm, remarks: body.workOrderRef ? `Work order ${body.workOrderRef}` : "",
      staffName: body.staffName,
    });
    const resStaff = await findReservationStaffForPlate(body.plate);
    const notifPayload = {
      type: "car_back_from_service", title: `${body.plate} is back from Garage`,
      message: `Returned to ${car.current_client || "the client"}.`,
      linkPath: "/garage",
    };
    if (resStaff) await createNotification({ recipient: resStaff, ...notifPayload });
    await notifyRole("Admin", notifPayload);
    await notifyRole("Manager", notifPayload);
    return { success: true, outcome: "client", client: car.current_client || "" };
  }

  if (!body.location) throw new Error("Select a location.");
  await updateFleetRow(body.plate, { status: "Available", location: body.location, kmOut: body.currentKm });
  await addHistory({
    plate: body.plate, type: car.type || "", action: "Marked Available",
    location: body.location, kmOut: body.currentKm,
    remarks: body.workOrderRef ? `Returned from Garage — work order ${body.workOrderRef}` : "Returned from Garage",
    staffName: body.staffName,
  });
  return { success: true, outcome: "available" };
}

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
  // Only worth checking on decrements — restoring stock never crosses INTO
  // low territory. Deduped per part per day so a run of small item edits
  // doesn't fire a fresh notification every time; one per day per part is
  // enough signal without becoming noise.
  if (delta < 0) {
    const part = await q1(`SELECT name, quantity_on_hand, reorder_threshold FROM parts WHERE id=$1`, [partId]);
    if (part && Number(part.reorder_threshold) > 0 && Number(part.quantity_on_hand) <= Number(part.reorder_threshold)) {
      const today = nowTZ().slice(0, 10);
      await notifyRole("Garage Manager", {
        type: "low_stock", title: `Low stock: ${part.name}`,
        message: `${part.quantity_on_hand} left (reorder at ${part.reorder_threshold}).`,
        linkPath: "/garage/parts", dedupeKey: `low_stock:${partId}:${today}`,
      });
    }
  }
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
    supplier_vendor_id: body.supplierVendorId || null, supplier_location: body.supplierLocation || null,
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

// ── Garage: Customer Jobs (outside customers' cars, not our fleet) ─────────
const CUSTOMER_JOB_STATUSES = ["Queued", "In Progress", "Awaiting Parts", "Completed"];

async function nextCustomerJobRefNo() {
  const now = nowTZ();
  const prefix = `SC/CUST/${now.slice(0, 4)}/${now.slice(5, 7)}/`;
  const rows = await q(`SELECT ref_no FROM customer_jobs WHERE ref_no LIKE $1`, [prefix + "%"]);
  let maxNum = 0;
  rows.forEach((r) => {
    const num = parseInt(String(r.ref_no).replace(prefix, ""), 10);
    if (!isNaN(num) && num > maxNum) maxNum = num;
  });
  return { refNo: prefix + String(maxNum + 1).padStart(4, "0"), now };
}

export async function addCustomerJob(body) {
  await requireMaintenanceEditAccess(body.staffName);
  if (!body.customerName || !body.customerName.trim()) throw new Error("Customer name is required");
  if (!body.customerPhone || !body.customerPhone.trim()) throw new Error("Customer phone is required");
  if (!body.plate || !body.plate.trim()) throw new Error("Plate is required");
  const { refNo, now } = await nextCustomerJobRefNo();
  const id = "CJ-" + crypto.randomUUID().split("-")[0].toUpperCase();
  await insert("customer_jobs", {
    id, ref_no: refNo, customer_name: body.customerName.trim(), customer_phone: body.customerPhone.trim(),
    plate: body.plate.trim(), car_description: body.carDescription || "", assigned_mechanic: body.assignedMechanic || "",
    issue_description: body.issueDescription || "", status: "Queued", odometer: body.odometer || "",
    notes: body.notes || "", price_charged: Number(body.priceCharged) || 0,
    payment_status: body.paymentStatus || "Unpaid", amount_paid: Number(body.amountPaid) || 0,
    opened_by: body.staffName || "", date_opened: now,
  });
  return { success: true, id, refNo };
}

export async function editCustomerJob(body) {
  await requireMaintenanceEditAccess(body.staffName);
  if (!body.id) throw new Error("ID is required");
  const existing = await q1(`SELECT status FROM customer_jobs WHERE id=$1`, [body.id]);
  if (!existing) throw new Error("Customer job not found");

  const setObj = {};
  if (body.customerName !== undefined) setObj.customer_name = body.customerName;
  if (body.customerPhone !== undefined) setObj.customer_phone = body.customerPhone;
  if (body.carDescription !== undefined) setObj.car_description = body.carDescription;
  if (body.assignedMechanic !== undefined) setObj.assigned_mechanic = body.assignedMechanic;
  if (body.issueDescription !== undefined) setObj.issue_description = body.issueDescription;
  if (body.odometer !== undefined) setObj.odometer = body.odometer;
  if (body.notes !== undefined) setObj.notes = body.notes;
  if (body.priceCharged !== undefined) setObj.price_charged = Number(body.priceCharged) || 0;
  if (body.paymentStatus !== undefined) setObj.payment_status = body.paymentStatus;
  if (body.amountPaid !== undefined) setObj.amount_paid = Number(body.amountPaid) || 0;

  if (body.status !== undefined) {
    if (!CUSTOMER_JOB_STATUSES.includes(body.status)) throw new Error("Invalid status: " + body.status);
    setObj.status = body.status;
    if (body.status === "Completed" && existing.status !== "Completed") {
      setObj.date_closed = nowTZ();
    } else if (body.status !== "Completed" && existing.status === "Completed") {
      setObj.date_closed = "";
    }
  }
  setObj.updated_at = nowTZ();

  const n = await update("customer_jobs", setObj, "id", body.id);
  if (!n) throw new Error("Customer job not found");
  return { success: true };
}

async function sumCustomerJobItems(jobId) {
  const row = await q1(`SELECT COALESCE(SUM(line_total),0) AS total FROM customer_job_items WHERE job_id=$1`, [jobId]);
  return Number(row.total) || 0;
}
async function recomputeCustomerJobTotal(jobId) {
  const total = await sumCustomerJobItems(jobId);
  await update("customer_jobs", { total_cost: total, updated_at: nowTZ() }, "id", jobId);
}

export async function addCustomerJobItem(body) {
  await requireMaintenanceEditAccess(body.staffName);
  if (!body.jobId) throw new Error("Job ID is required");
  if (!body.itemName) throw new Error("Item name is required");
  const job = await q1(`SELECT id FROM customer_jobs WHERE id=$1`, [body.jobId]);
  if (!job) throw new Error("Customer job not found");
  const qty = Number(body.quantity) || 1;
  const unitCost = Number(body.unitCost) || 0;
  const id = "CJI-" + crypto.randomUUID().split("-")[0].toUpperCase();
  await insert("customer_job_items", {
    id, job_id: body.jobId, item_name: body.itemName, quantity: qty, unit_cost: unitCost,
    line_total: qty * unitCost, part_id: body.partId || null, supplier_vendor_id: body.supplierVendorId || null, supplier_location: body.supplierLocation || null,
  });
  await adjustPartStock(body.partId, -qty);
  await recomputeCustomerJobTotal(body.jobId);
  return { success: true, id };
}

export async function deleteCustomerJobItem(body) {
  await requireMaintenanceEditAccess(body.staffName);
  if (!body.id) throw new Error("Item ID is required");
  const row = await q1(`SELECT job_id, quantity, part_id FROM customer_job_items WHERE id=$1`, [body.id]);
  if (!row) throw new Error("Item not found");
  await run(`DELETE FROM customer_job_items WHERE id=$1`, [body.id]);
  await adjustPartStock(row.part_id, Number(row.quantity));
  await recomputeCustomerJobTotal(row.job_id);
  return { success: true };
}

export async function addCustomerJobUpdate(body) {
  await requireMaintenanceEditAccess(body.author || body.staffName);
  if (!body.jobId) throw new Error("Job ID is required");
  if (!body.message || !body.message.trim()) throw new Error("Update message is required");
  const job = await q1(`SELECT id FROM customer_jobs WHERE id=$1`, [body.jobId]);
  if (!job) throw new Error("Customer job not found");
  const id = "CJU-" + crypto.randomUUID().split("-")[0].toUpperCase();
  await insert("customer_job_updates", {
    id, job_id: body.jobId, author: body.author || "", message: body.message.trim(),
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

// Free-text branch/location names per supplier — e.g. "Kinondoni Branch",
// "Mwanza Branch". Shown as a second picker wherever that supplier is
// selected (Job Card Items, Fleet's External garage picker), only when
// the supplier actually has locations recorded.
export async function addVendorLocation(body) {
  await requireMaintenanceEditAccess(body.staffName);
  if (!body.vendorId) throw new Error("Supplier is required");
  if (!body.name || !body.name.trim()) throw new Error("Location name is required");
  const id = "VLOC-" + crypto.randomUUID().split("-")[0].toUpperCase();
  await insert("vendor_locations", { id, vendor_id: body.vendorId, name: body.name.trim() });
  return { success: true, id };
}

export async function deleteVendorLocation(body) {
  await requireMaintenanceEditAccess(body.staffName);
  if (!body.id) throw new Error("ID is required");
  await run(`DELETE FROM vendor_locations WHERE id=$1`, [body.id]);
  return { success: true };
}

// ── Garage: Vendor Categories ───────────────────────────────────────────────
// requireMaintenanceEditAccess already allows Admin + Garage Manager, blocks
// Manager -- exactly "Admin + Garage Managers can add more" categories.
export async function addVendorCategory(body) {
  await requireMaintenanceEditAccess(body.staffName);
  if (!body.name || !body.name.trim()) throw new Error("Category name is required");
  const existing = await q1(`SELECT id FROM vendor_categories WHERE lower(btrim(name))=lower(btrim($1))`, [body.name]);
  if (existing) throw new Error("That category already exists.");
  const id = "VC-" + crypto.randomUUID().split("-")[0].toUpperCase();
  await insert("vendor_categories", { id, name: body.name.trim() });
  return { success: true, id };
}

// Replaces a vendor's full category set in one call (simpler for a
// multi-select checkbox UI than incremental add/remove round-trips).
export async function setVendorCategories(body) {
  await requireMaintenanceEditAccess(body.staffName);
  if (!body.vendorId) throw new Error("Vendor ID is required");
  const categoryIds = Array.isArray(body.categoryIds) ? body.categoryIds : [];
  await run(`DELETE FROM vendor_category_links WHERE vendor_id=$1`, [body.vendorId]);
  for (const categoryId of categoryIds) {
    const id = "VCL-" + crypto.randomUUID().split("-")[0].toUpperCase();
    await insert("vendor_category_links", { id, vendor_id: body.vendorId, category_id: categoryId });
  }
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

// ── Notifications ────────────────────────────────────────────────────────
export async function markNotificationRead(body) {
  if (!body.id) throw new Error("ID is required");
  await update("notifications", { read: "TRUE", read_at: nowTZ() }, "id", body.id);
  return { success: true };
}

export async function markAllNotificationsRead(body) {
  if (!body.staffName) throw new Error("Staff name is required");
  await run(`UPDATE notifications SET read='TRUE', read_at=now() WHERE recipient=$1 AND read='FALSE'`, [body.staffName]);
  return { success: true };
}

// ── Push Subscriptions ───────────────────────────────────────────────────
// endpoint is globally unique per browser/device, so re-subscribing the
// same device (e.g. after a service worker update rotates nothing, but
// the frontend calls this again) updates that row in place instead of
// creating a duplicate. staff_name can change on conflict too — covers
// the edge case of a shared device being re-enabled for a different
// logged-in staff member.
export async function savePushSubscription(body) {
  if (!body.staffName) throw new Error("Staff name is required");
  if (!body.endpoint) throw new Error("Subscription endpoint is required");
  if (!body.keys || !body.keys.p256dh || !body.keys.auth) throw new Error("Subscription keys are required");
  const id = "PUSH-" + crypto.randomUUID().split("-")[0].toUpperCase();
  await run(
    `INSERT INTO push_subscriptions (id, staff_name, endpoint, p256dh, auth, user_agent, last_used_at)
     VALUES ($1,$2,$3,$4,$5,$6,now())
     ON CONFLICT (endpoint) DO UPDATE SET
       staff_name = EXCLUDED.staff_name, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
       user_agent = EXCLUDED.user_agent, last_used_at = now()`,
    [id, body.staffName, body.endpoint, body.keys.p256dh, body.keys.auth, body.userAgent || ""]
  );
  return { success: true };
}

export async function deletePushSubscription(body) {
  if (!body.endpoint) throw new Error("Subscription endpoint is required");
  await run(`DELETE FROM push_subscriptions WHERE endpoint=$1`, [body.endpoint]);
  return { success: true };
}

// Admin Panel: toggles a trigger on/off. Admin/Manager only — this
// silences a notification type app-wide (bell AND push), not something
// a regular staff member should be able to flip.
export async function setNotificationTriggerEnabled(body) {
  await requireManagerOrAdmin(body.staffName);
  if (!body.type) throw new Error("Trigger type is required");
  const n = await run(
    `UPDATE notification_trigger_settings SET enabled=$1, updated_at=now(), updated_by=$2 WHERE type=$3`,
    [body.enabled ? "TRUE" : "FALSE", body.staffName || "", body.type]
  );
  if (!n) throw new Error("Unknown trigger type");
  return { success: true };
}

// ── Invoice Scanning: Phase 2 — confirm & save ──────────────────────────────
// Everything the review screen collected: supplier (matched or new), each
// item (matched to an existing part or creating a new one), the photo, and
// an optional Work Order/Customer Job link. Stock updates and unit_cost
// changes happen here, immediately, per instruction (no separate
// "received" step) — this is the point where a scan stops being a preview
// and becomes real inventory/supplier data.
export async function confirmInvoiceScan(body) {
  await requireMaintenanceEditAccess(body.staffName);
  if (!body.imageBase64) throw new Error("Invoice photo is required");
  if (!Array.isArray(body.items) || body.items.length === 0) throw new Error("At least one item is required");

  // ── Supplier: use the picked vendor, or create one from the (possibly
  // edited) extracted name. ──
  let supplierVendorId = body.supplierVendorId || null;
  if (!supplierVendorId && body.supplierName && body.supplierName.trim()) {
    const vendorId = "VEN-" + crypto.randomUUID().split("-")[0].toUpperCase();
    await insert("vendors", {
      id: vendorId, name: body.supplierName.trim(), vendor_type: "Parts Supplier", active: "TRUE",
    });
    supplierVendorId = vendorId;
  }

  // ── Photo: stored now (Phase 1 only previewed it, never saved it). ──
  const buf = Buffer.from(body.imageBase64, "base64");
  const { fileId } = await storeFile({
    kind: "purchase-invoice", filename: "invoice.jpg", mimeType: body.mimeType || "image/jpeg",
    buffer: buf, createdBy: body.staffName,
  });

  const invoiceId = "PINV-" + crypto.randomUUID().split("-")[0].toUpperCase();
  await insert("purchase_invoices", {
    id: invoiceId, supplier_name: body.supplierName || "", supplier_vendor_id: supplierVendorId,
    invoice_date: body.invoiceDate || "", total_amount: Number(body.totalAmount) || 0,
    photo_file_id: fileId, work_order_id: body.workOrderId || null, customer_job_id: body.customerJobId || null,
    status: "Confirmed", scanned_by: body.staffName,
  });

  // ── Items: each either matches an existing part (stock + cost update,
  // with cost history logged) or creates a new one. ──
  for (const item of body.items) {
    if (!item.itemName || !item.itemName.trim()) continue; // skip blanks the reviewer cleared out
    const qty = Number(item.quantity) || 1;
    const unitPrice = Number(item.unitPrice) || 0;
    let partId = item.partId || null;

    if (partId) {
      const existing = await q1(`SELECT unit_cost, quantity_on_hand FROM parts WHERE id=$1`, [partId]);
      if (existing) {
        const oldCost = Number(existing.unit_cost) || 0;
        // Only log + change cost if the invoice actually shows a price and
        // it genuinely differs — an item with no price on the invoice
        // shouldn't silently zero out a part's known cost.
        if (unitPrice > 0 && unitPrice !== oldCost) {
          const histId = "PCH-" + crypto.randomUUID().split("-")[0].toUpperCase();
          await insert("part_cost_history", {
            id: histId, part_id: partId, old_unit_cost: oldCost, new_unit_cost: unitPrice,
            invoice_id: invoiceId, changed_by: body.staffName,
          });
          await update("parts", { unit_cost: unitPrice, updated_at: nowTZ() }, "id", partId);
        }
        await update("parts", {
          quantity_on_hand: Number(existing.quantity_on_hand || 0) + qty, updated_at: nowTZ(),
        }, "id", partId);
      } else {
        partId = null; // referenced part vanished between review and confirm — fall through to creating one
      }
    }
    if (!partId) {
      partId = "PRT-" + crypto.randomUUID().split("-")[0].toUpperCase();
      await insert("parts", {
        id: partId, name: item.itemName.trim(), vendor_id: supplierVendorId,
        unit_cost: unitPrice, quantity_on_hand: qty, reorder_threshold: 0, active: "TRUE",
      });
    }

    const lineId = "PINVI-" + crypto.randomUUID().split("-")[0].toUpperCase();
    await insert("purchase_invoice_items", {
      id: lineId, invoice_id: invoiceId, item_name: item.itemName.trim(), part_id: partId,
      quantity: qty, unit_price: unitPrice, line_total: qty * unitPrice,
    });
  }

  return { success: true, invoiceId, supplierVendorId };
}

// ── Drivers (own table) ─────────────────────────────────────────────────
export async function addDriverV2(body) {
  await requireDriverManageAccess(body.staffName);
  if (!body.name || !body.name.trim()) throw new Error("Driver name is required");
  if (!body.phone || !body.phone.trim()) throw new Error("Driver phone number is required");
  const id = "DRV-" + crypto.randomUUID().split("-")[0].toUpperCase();
  await insert("drivers", {
    id, name: body.name.trim(), phone: body.phone.trim(), license_number: body.licenseNumber || "",
    national_id: body.nationalId || "", tin_number: body.tinNumber || "", address: body.address || "", notes: body.notes || "", active: "TRUE",
  });
  return { success: true, id };
}

// Bulk CSV import (Drivers page): rows arrive already parsed and reviewed
// client-side (src/lib/driverImport.js handles the actual CSV parsing —
// this only ever receives clean, confirmed row objects, never raw file
// data). Each row is created independently; one failure doesn't stop the
// rest, matching the "skip and report" behavior already established for
// the review screen. Duplicate names are allowed, not blocked — the
// original 29-driver migration earlier this project deliberately kept
// exact-name duplicates rather than silently merging them, and this
// follows the same reasoning: a false merge is worse than a duplicate
// that gets manually cleaned up later.
export async function bulkAddDrivers(body) {
  await requireDriverManageAccess(body.staffName);
  if (!Array.isArray(body.rows) || body.rows.length === 0) throw new Error("No rows to import");

  const created = [];
  const failed = [];
  for (const row of body.rows) {
    try {
      if (!row.name || !row.name.trim()) throw new Error("Name is required");
      if (!row.phone || !row.phone.trim()) throw new Error("Phone is required");
      const id = "DRV-" + crypto.randomUUID().split("-")[0].toUpperCase();
      await insert("drivers", {
        id, name: row.name.trim(), phone: row.phone.trim(), license_number: row.licenseNumber || "",
        national_id: row.nationalId || "", address: row.address || "", notes: "", active: "TRUE",
      });
      created.push({ rowNum: row.rowNum, id, name: row.name.trim() });
    } catch (e) {
      failed.push({ rowNum: row.rowNum, name: row.name || "", reason: e.message });
    }
  }
  return { success: true, created, failed };
}

export async function editDriver(body) {
  await requireDriverManageAccess(body.staffName);
  if (!body.id) throw new Error("Driver ID is required");
  const setObj = {};
  if (body.name !== undefined) setObj.name = body.name;
  if (body.phone !== undefined) setObj.phone = body.phone;
  if (body.licenseNumber !== undefined) setObj.license_number = body.licenseNumber;
  if (body.nationalId !== undefined) setObj.national_id = body.nationalId;
  if (body.tinNumber !== undefined) setObj.tin_number = body.tinNumber;
  if (body.address !== undefined) setObj.address = body.address;
  if (body.notes !== undefined) setObj.notes = body.notes;
  if (body.active !== undefined) setObj.active = body.active ? "TRUE" : "FALSE";
  setObj.updated_at = nowTZ();
  const n = await update("drivers", setObj, "id", body.id);
  if (!n) throw new Error("Driver not found");
  return { success: true };
}

// Profile photo (headshot) — distinct from Documents. Same storeFile
// pattern as addDriverDocument, but writes directly to drivers.photo_file_id
// rather than creating a driver_documents row, since this isn't a
// license/certificate, just an identifying photo.
export async function setDriverPhoto(body) {
  await requireDriverManageAccess(body.staffName);
  if (!body.driverId) throw new Error("Driver is required");
  if (!body.imageBase64) throw new Error("Photo is required");
  const driver = await q1(`SELECT id FROM drivers WHERE id=$1`, [body.driverId]);
  if (!driver) throw new Error("Driver not found");

  const buf = Buffer.from(body.imageBase64, "base64");
  const stored = await storeFile({
    kind: "driver-photo", filename: body.filename || "photo.jpg",
    mimeType: body.mimeType || "image/jpeg", buffer: buf, createdBy: body.staffName,
  });
  await update("drivers", { photo_file_id: stored.fileId, updated_at: nowTZ() }, "id", body.driverId);
  return { success: true, fileId: stored.fileId };
}

export async function addDriverDocument(body) {
  await requireDriverManageAccess(body.staffName);
  if (!body.driverId) throw new Error("Driver is required");
  if (!body.docType) throw new Error("Document type is required");
  const driver = await q1(`SELECT id FROM drivers WHERE id=$1`, [body.driverId]);
  if (!driver) throw new Error("Driver not found");

  let fileId = null;
  if (body.imageBase64) {
    const buf = Buffer.from(body.imageBase64, "base64");
    const stored = await storeFile({
      kind: "driver-document", filename: body.filename || "document.jpg",
      mimeType: body.mimeType || "image/jpeg", buffer: buf, createdBy: body.staffName,
    });
    fileId = stored.fileId;
  }

  const id = "DDOC-" + crypto.randomUUID().split("-")[0].toUpperCase();
  await insert("driver_documents", {
    id, driver_id: body.driverId, doc_type: body.docType, label: body.label || "",
    file_id: fileId, expiry_date: body.expiryDate || null, notes: body.notes || "",
  });
  return { success: true, id };
}

// Bulk ZIP import (Drivers page): entries arrive already matched to a
// real driverId client-side (src/lib/driverZipImport.js parses the ZIP
// and matches filenames against the already-loaded driver list — this
// only ever receives confirmed, already-matched entries, never raw file
// data or unmatched guesses). Each document uploads independently; one
// failure (e.g. a driver deleted between review and confirm, or a file
// exceeding storeFile's size limit) doesn't stop the rest.
export async function bulkAddDriverDocuments(body) {
  await requireDriverManageAccess(body.staffName);
  if (!Array.isArray(body.entries) || body.entries.length === 0) throw new Error("No documents to import");

  const uploaded = [];
  const failed = [];
  for (const entry of body.entries) {
    try {
      if (!entry.driverId) throw new Error("Missing driver");
      if (!entry.imageBase64) throw new Error("Missing file data");
      const driver = await q1(`SELECT id FROM drivers WHERE id=$1`, [entry.driverId]);
      if (!driver) throw new Error("Driver not found");

      const buf = Buffer.from(entry.imageBase64, "base64");
      const stored = await storeFile({
        kind: "driver-document", filename: entry.filename || "document",
        mimeType: entry.mimeType || "application/octet-stream", buffer: buf, createdBy: body.staffName,
      });

      const id = "DDOC-" + crypto.randomUUID().split("-")[0].toUpperCase();
      await insert("driver_documents", {
        id, driver_id: entry.driverId, doc_type: entry.docType || "Others", label: entry.label || "",
        file_id: stored.fileId, expiry_date: null, notes: "",
      });
      uploaded.push({ filename: entry.filename, driverName: entry.driverName, id });
    } catch (e) {
      failed.push({ filename: entry.filename, driverName: entry.driverName, reason: e.message });
    }
  }
  return { success: true, uploaded, failed };
}

export async function editDriverDocument(body) {
  await requireDriverManageAccess(body.staffName);
  if (!body.id) throw new Error("Document ID is required");
  const setObj = {};
  if (body.docType !== undefined) setObj.doc_type = body.docType;
  if (body.label !== undefined) setObj.label = body.label;
  if (body.expiryDate !== undefined) setObj.expiry_date = body.expiryDate || null;
  if (body.notes !== undefined) setObj.notes = body.notes;
  setObj.updated_at = nowTZ();
  const n = await update("driver_documents", setObj, "id", body.id);
  if (!n) throw new Error("Document not found");
  return { success: true };
}

export async function deleteDriverDocument(body) {
  await requireDriverManageAccess(body.staffName);
  if (!body.id) throw new Error("Document ID is required");
  await run(`DELETE FROM driver_documents WHERE id=$1`, [body.id]);
  return { success: true };
}






// Saves a batch of human-confirmed IMEI<->plate pairings. Admin/Manager
// only — this decides which car's history a tracker's data gets attributed
// to, so it gets the same gate as other structural Fleet changes.
// body.matches: [{ imei, deviceName, plate }]
export async function confirmTrackerMatches(body) {
  await requireManagerOrAdmin(body.staffName);
  const matches = Array.isArray(body.matches) ? body.matches : [];
  if (!matches.length) throw new Error("No matches provided.");

  // Guards against a genuine data-quality case seen in testing: TrackSolid
  // can list the same physical tracker (same IMEI) more than once — e.g.
  // under more than one client sub-group after a car moves between
  // clients. If two rows in the same batch share an IMEI, only the first
  // is attempted; the rest are reported back as skipped rather than
  // silently failing on the database's IMEI-uniqueness constraint.
  const seenImeis = new Set();
  let saved = 0;
  const failed = []; // { plate, imei, deviceName, reason }

  for (const m of matches) {
    if (!m.imei || !m.plate) {
      failed.push({ plate: m.plate, imei: m.imei, deviceName: m.deviceName, reason: "Missing plate or IMEI." });
      continue;
    }
    if (seenImeis.has(m.imei)) {
      failed.push({ plate: m.plate, imei: m.imei, deviceName: m.deviceName, reason: "This tracker (IMEI) appears more than once in TrackSolid — only the first was saved. Check TrackSolid for a duplicate device entry." });
      continue;
    }
    seenImeis.add(m.imei);
    const id = "TM-" + crypto.randomUUID().split("-")[0].toUpperCase();
    // Each row commits independently — one bad row must never block the
    // rest of a 200+ row batch from saving (this previously threw and
    // silently aborted everything after the failing row).
    try {
      await run(
        `INSERT INTO vehicle_tracker_map (id, plate, imei, device_name, confirmed_by, confirmed_at)
         VALUES ($1,$2,$3,$4,$5, now())
         ON CONFLICT (plate) DO UPDATE SET imei=$3, device_name=$4, confirmed_by=$5, confirmed_at=now()`,
        [id, m.plate, m.imei, m.deviceName || null, body.staffName || null]
      );
      saved++;
    } catch (err) {
      const reason = String(err.message || "").includes("vehicle_tracker_map_imei_key")
        ? "This tracker (IMEI) is already matched to a different plate."
        : (err.message || "Unknown database error.");
      failed.push({ plate: m.plate, imei: m.imei, deviceName: m.deviceName, reason });
    }
  }
  return { success: true, saved, failed };
}

export async function removeTrackerMatch(body) {
  await requireManagerOrAdmin(body.staffName);
  if (!body.plate) throw new Error("Plate is required.");
  await run(`DELETE FROM vehicle_tracker_map WHERE plate=$1`, [body.plate]);
  return { success: true };
}

// Dismisses a tracker that isn't a SmilesCars fleet car (test device, or
// something else sitting on the same TrackSolid account) so it stops
// appearing in the unmatched-review list. Reversible via
// unignoreTrackerDevice — nothing about the tracker or its data is deleted.
export async function ignoreTrackerDevice(body) {
  await requireManagerOrAdmin(body.staffName);
  if (!body.imei) throw new Error("IMEI is required.");
  await run(
    `INSERT INTO ignored_tracker_devices (imei, device_name, ignored_by, ignored_at)
     VALUES ($1,$2,$3, now())
     ON CONFLICT (imei) DO UPDATE SET device_name=$2, ignored_by=$3, ignored_at=now()`,
    [body.imei, body.deviceName || null, body.staffName || null]
  );
  return { success: true };
}

export async function unignoreTrackerDevice(body) {
  await requireManagerOrAdmin(body.staffName);
  if (!body.imei) throw new Error("IMEI is required.");
  await run(`DELETE FROM ignored_tracker_devices WHERE imei=$1`, [body.imei]);
  return { success: true };
}

// Manual trigger for the nightly mileage sync — lets Admin/Manager run it
// on demand (testing, or catching up after confirming a batch of new
// matches) instead of waiting for the 6am cron.
export async function runTrackerSyncNow(body) {
  await requireManagerOrAdmin(body.staffName);
  const { runFullSync } = await import("./trackerSync.js");
  return { success: true, ...(await runFullSync()) };
}
