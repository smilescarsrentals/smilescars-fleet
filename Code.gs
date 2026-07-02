// ============================================================
//  SMILES FLEET MANAGER — Google Apps Script Backend v9
//  Added: Fuel Module (getFuel, getFuelByPlate, addFuel, editFuel)
// ============================================================

const SPREADSHEET_ID     = "1xK1tVQa1bHR-FVb1Tr2MjZdtm3_QHt1PdulfVLgoFtc";
const FLEET_SHEET        = "Fleet";
const HISTORY_SHEET      = "History";
const CONFIG_SHEET       = "Config";
const SOLD_SHEET         = "Sold";
const SUBHIRE_SHEET      = "SubHire";
const FUEL_SHEET         = "Fuel";
const RESERVATIONS_SHEET = "Reservations";

function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── GET Router ───────────────────────────────────────────────
function doGet(e) {
  const action = e.parameter.action;
  try {
    if (action === "getFleet")        return respond(getFleet());
    if (action === "getHistory")      return respond(getHistory());
    if (action === "getConfig")       return respond(getConfigV7());
    if (action === "getSold")         return respond(getSold());
    if (action === "getSubHire")      return respond(getSubHire());
    if (action === "getClients")      return respond(getClients());
    if (action === "getDashboard")    return respond(getDashboard());
    if (action === "getCarByPlate")   return respond(getCarByPlate(e.parameter.plate   || ""));
    if (action === "getCarHistory")   return respond(getCarHistory(e.parameter.plate   || ""));
    if (action === "getFuel")         return respond(getFuel());
    if (action === "getFuelByPlate")  return respond(getFuelByPlate(e.parameter.plate  || ""));
    if (action === "testRole")        return respond(testRole(e.parameter.name         || ""));
    return respond({ error: "Unknown action: " + action });
  } catch (err) {
    return respond({ error: err.message });
  }
}

// ── POST Router ──────────────────────────────────────────────
function doPost(e) {
  const body   = JSON.parse(e.postData.contents);
  const action = body.action;
  try {
    if (action === "verifyStaff")          return respond(verifyStaff(body));
    if (action === "checkOut")             return respond(checkOut(body));
    if (action === "markReturned")         return respond(markReturned(body));
    if (action === "extendBooking")        return respond(extendBooking(body));
    if (action === "setMaintenance")       return respond(setMaintenance(body));
    if (action === "setAvailable")         return respond(setAvailable(body));
    if (action === "updateLocation")       return respond(updateLocation(body));
    if (action === "updatePayment")        return respond(updatePayment(body));
    if (action === "markSold")             return respond(markSold(body));
    if (action === "addStaff")             return respond(addStaff(body));
    if (action === "addLocation")          return respond(addConfigItem("Location", body.name));
    if (action === "addGarage")            return respond(addConfigItem("Garage",   body.name));
    if (action === "addDriver")            return respond(addConfigItem("Driver",   body.name));
    if (action === "addCarNote")           return respond(addCarNote(body));
    if (action === "addSubHire")           return respond(addSubHire(body));
    if (action === "returnSubHire")        return respond(returnSubHire(body));
    if (action === "updateSubHirePayment") return respond(updateSubHirePayment(body));
    if (action === "addFuel")              return respond(addFuel(body));
    if (action === "editFuel")             return respond(editFuel(body));
    return respond({ error: "Unknown action: " + action });
  } catch (err) {
    return respond({ error: err.message });
  }
}

// ── Date helper ──────────────────────────────────────────────
function fmtDate(val) {
  if (!val) return "";
  if (val instanceof Date) {
    const tz = SpreadsheetApp.openById(SPREADSHEET_ID).getSpreadsheetTimeZone();
    return Utilities.formatDate(val, tz, "yyyy-MM-dd");
  }
  return String(val).split("T")[0];
}

// ── Fleet ────────────────────────────────────────────────────
function getFleet() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(FLEET_SHEET);
  const rows  = sheet.getDataRange().getValues();
  return { success: true, data: rows.slice(1).map((row, i) => mapFleetRow(row, i)) };
}

function findRow(plate) {
  const sheet  = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(FLEET_SHEET);
  const plates = sheet.getRange("A:A").getValues().flat();
  const idx    = plates.findIndex(p => p === plate);
  if (idx < 1) throw new Error("Car not found: " + plate);
  return { sheet, rowIndex: idx + 1 };
}

function updateFleetRow(plate, fields) {
  const { sheet, rowIndex } = findRow(plate);
  const map = {
    location: 3, status: 4, currentClient: 5, clientPhone: 6, bookedFrom: 7,
    returnDate: 8, remarks: 9, fuelOut: 10, amount: 11, currency: 12, garage: 13,
    paymentStatus: 14, amountPaid: 15, policeFineOut: 16, parkingFineOut: 17,
    kmOut: 18, driver: 19,
  };
  Object.keys(map).forEach(key => {
    if (fields[key] !== undefined) sheet.getRange(rowIndex, map[key]).setValue(fields[key]);
  });
}

function clearFleetRow(plate, status, extra) {
  updateFleetRow(plate, Object.assign({
    status, currentClient: "", clientPhone: "", bookedFrom: "", returnDate: "",
    remarks: (extra && extra.remarks) || "", fuelOut: "", amount: "", currency: "",
    garage: "", paymentStatus: "", amountPaid: "", policeFineOut: "",
    parkingFineOut: "", kmOut: "", driver: "",
  }, extra || {}));
}

function mapFleetRow(row, i) {
  return {
    rowIndex:       i + 2,
    plate:          row[0]  || "",
    type:           row[1]  || "",
    location:       row[2]  || "",
    status:         row[3]  || "Available",
    currentClient:  row[4]  || "",
    clientPhone:    row[5]  || "",
    bookedFrom:     fmtDate(row[6]),
    returnDate:     fmtDate(row[7]),
    remarks:        row[8]  || "",
    fuelOut:        row[9]  || "",
    amount:         row[10] || "",
    currency:       row[11] || "TZS",
    garage:         row[12] || "",
    paymentStatus:  row[13] || "",
    amountPaid:     row[14] || "",
    policeFineOut:  row[15] || "",
    parkingFineOut: row[16] || "",
    kmOut:          row[17] || "",
    driver:         row[18] || "",
    regCardUrl:     row[19] || "",
    photosUrl:      row[20] || "",
  };
}

function getCarByPlate(plate) {
  if (!plate) return { success: false, error: "Plate required" };
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(FLEET_SHEET);
  const rows  = sheet.getDataRange().getValues();
  const norm  = plate.trim().toLowerCase();
  const row   = rows.slice(1).find(r => (r[0] || "").toString().trim().toLowerCase() === norm);
  if (!row) return { success: false, error: "Car not found: " + plate };
  return { success: true, data: mapFleetRow(row, 0) };
}

// ── History ──────────────────────────────────────────────────
function addHistory(entry) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(HISTORY_SHEET);
  sheet.appendRow([
    new Date(),
    entry.plate         || "",
    entry.type          || "",
    entry.action        || "",
    entry.client        || "",
    entry.clientPhone   || "",
    entry.bookedFrom    || "",
    entry.returnDate    || "",
    entry.location      || "",
    entry.remarks       || "",
    entry.staffName     || "",
    entry.fuelOut       || "",
    entry.fuelIn        || "",
    entry.amount        || "",
    entry.currency      || "",
    entry.policeFine    || "",
    entry.parkingFine   || "",
    entry.garage        || "",
    entry.paymentStatus || "",
    entry.amountPaid    || "",
    entry.kmOut         || "",
    entry.kmIn          || "",
    entry.driver        || "",
  ]);
}

function getHistory() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(HISTORY_SHEET);
  const rows  = sheet.getDataRange().getValues();
  if (rows.length <= 1) return { success: true, data: [], total: 0 };
  const tz       = SpreadsheetApp.openById(SPREADSHEET_ID).getSpreadsheetTimeZone();
  const dataRows = rows.slice(1);
  const total    = dataRows.length;
  const sliced   = dataRows.slice(-300).reverse();
  return { success: true, data: sliced.map(row => mapHistoryRow(row, tz)), total };
}

function getCarHistory(plate) {
  if (!plate) return { success: true, data: [] };
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(HISTORY_SHEET);
  const rows  = sheet.getDataRange().getValues();
  if (rows.length <= 1) return { success: true, data: [] };
  const tz   = SpreadsheetApp.openById(SPREADSHEET_ID).getSpreadsheetTimeZone();
  const norm = plate.trim().toLowerCase();
  const data = rows.slice(1)
    .filter(row => (row[1] || "").toString().trim().toLowerCase() === norm)
    .reverse()
    .map(row => mapHistoryRow(row, tz));
  return { success: true, data };
}

function mapHistoryRow(row, tz) {
  return {
    timestamp:     row[0]  ? Utilities.formatDate(new Date(row[0]), tz, "yyyy-MM-dd'T'HH:mm:ss") : "",
    plate:         row[1]  || "",
    type:          row[2]  || "",
    action:        row[3]  || "",
    client:        row[4]  || "",
    clientPhone:   row[5]  || "",
    bookedFrom:    fmtDate(row[6]),
    returnDate:    fmtDate(row[7]),
    location:      row[8]  || "",
    remarks:       row[9]  || "",
    staffName:     row[10] || "",
    fuelOut:       row[11] || "",
    fuelIn:        row[12] || "",
    amount:        row[13] || "",
    currency:      row[14] || "",
    policeFine:    row[15] || "",
    parkingFine:   row[16] || "",
    garage:        row[17] || "",
    paymentStatus: row[18] || "",
    amountPaid:    row[19] || "",
    kmOut:         row[20] || "",
    kmIn:          row[21] || "",
    driver:        row[22] || "",
  };
}

// ── Sold ─────────────────────────────────────────────────────
function getSold() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SOLD_SHEET);
  const rows  = sheet.getDataRange().getValues();
  if (rows.length <= 1) return { success: true, data: [] };
  return {
    success: true,
    data: rows.slice(1).reverse().map(row => ({
      timestamp: row[0] ? new Date(row[0]).toISOString() : "",
      plate:     row[1] || "",
      type:      row[2] || "",
      remarks:   row[3] || "",
      staffName: row[4] || "",
    })),
  };
}

// ── Auth & Roles ─────────────────────────────────────────────
function requireManagerOrAdmin(staffName) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(CONFIG_SHEET);
  const rows  = sheet.getDataRange().getValues();
  const match = rows.find(r => r[0] === "Staff" && r[1].toString().trim() === staffName.toString().trim());
  const role  = match ? (match[3] || "Staff").toString().trim() : "Staff";
  if (role !== "Manager" && role !== "Admin")
    throw new Error("This action requires a Manager or Admin account.");
}

function verifyStaff(body) {
  if (!body.name || !body.password) throw new Error("Name and password required");
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(CONFIG_SHEET);
  const rows  = sheet.getDataRange().getValues();
  const match = rows.find(r => r[0] === "Staff" && r[1].toString().trim() === body.name.toString().trim());
  if (!match)  return { success: false, message: "Staff not found" };
  if (!match[2]) return { success: false, message: "No password set for this account" };
  if (match[2].toString().trim() !== body.password.toString().trim())
    return { success: false, message: "Incorrect password" };
  return { success: true, role: (match[3] || "Staff").toString().trim() };
}

function addStaff(body) {
  if (!body.name) throw new Error("Name is required");
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(CONFIG_SHEET);
  sheet.appendRow(["Staff", body.name, body.password || "", body.role || "Staff"]);
  return { success: true };
}

// ── Actions ──────────────────────────────────────────────────
function checkOut(body) {
  if (!body.plate)     throw new Error("Plate is required");
  if (!body.client)    throw new Error("Client name is required");
  if (!body.staffName) throw new Error("Staff name is required");
  updateFleetRow(body.plate, {
    status: "Rented", currentClient: body.client,
    clientPhone: body.clientPhone || "", bookedFrom: body.bookedFrom || "",
    returnDate: body.returnDate || "", remarks: body.remarks || "",
    location: body.location || "", fuelOut: body.fuelOut || "",
    amount: body.amount || "", currency: body.currency || "TZS",
    garage: "", paymentStatus: body.paymentStatus || "Unpaid",
    amountPaid: body.amountPaid || "",
    policeFineOut: body.policeFine || "", parkingFineOut: body.parkingFine || "",
    kmOut: body.kmOut || "", driver: body.driver || "",
  });
  addHistory({
    plate: body.plate, type: body.type, action: "Checked Out",
    client: body.client, clientPhone: body.clientPhone || "",
    bookedFrom: body.bookedFrom || "", returnDate: body.returnDate || "",
    location: body.location || "", remarks: body.remarks || "",
    staffName: body.staffName, fuelOut: body.fuelOut || "",
    amount: body.amount || "", currency: body.currency || "TZS",
    policeFine: body.policeFine || "", parkingFine: body.parkingFine || "",
    paymentStatus: body.paymentStatus || "Unpaid",
    amountPaid: body.amountPaid || "", kmOut: body.kmOut || "",
    driver: body.driver || "",
  });
  return { success: true };
}

function markReturned(body) {
  if (!body.plate)     throw new Error("Plate is required");
  if (!body.staffName) throw new Error("Staff name is required");
  const { sheet, rowIndex } = findRow(body.plate);
  const row = sheet.getRange(rowIndex, 1, 1, 19).getValues()[0];
  clearFleetRow(body.plate, "Available", { remarks: body.remarks || "" });
  addHistory({
    plate: body.plate, type: body.type || row[1], action: "Returned",
    client: row[4], clientPhone: row[5], bookedFrom: fmtDate(row[6]),
    returnDate: body.actualReturn || fmtDate(row[7]),
    location: body.location || row[2], remarks: body.remarks || "",
    staffName: body.staffName, fuelOut: row[9], fuelIn: body.fuelIn || "",
    amount: body.amount || row[10] || "", currency: row[11] || "TZS",
    policeFine: body.policeFine || row[15] || "",
    parkingFine: body.parkingFine || row[16] || "",
    paymentStatus: body.paymentStatus || row[13] || "",
    amountPaid: body.amountPaid || row[14] || "",
    kmOut: row[17] || "", kmIn: body.kmIn || "",
  });
  return { success: true };
}

function extendBooking(body) {
  if (!body.plate)      throw new Error("Plate is required");
  if (!body.returnDate) throw new Error("New return date is required");
  if (!body.staffName)  throw new Error("Staff name is required");
  const { sheet, rowIndex } = findRow(body.plate);
  const row = sheet.getRange(rowIndex, 1, 1, 19).getValues()[0];
  const oldReturnDate = fmtDate(row[7]);
  updateFleetRow(body.plate, { returnDate: body.returnDate, remarks: body.remarks || "" });
  addHistory({
    plate: body.plate, type: body.type || row[1], action: "Booking Extended",
    client: row[4], clientPhone: row[5], bookedFrom: fmtDate(row[6]),
    returnDate: body.returnDate, location: body.location || row[2],
    remarks: `Extended from ${oldReturnDate} to ${body.returnDate}. ${body.remarks || ""}`.trim(),
    staffName: body.staffName,
  });
  return { success: true };
}

function setMaintenance(body) {
  if (!body.plate)     throw new Error("Plate is required");
  if (!body.staffName) throw new Error("Staff name is required");
  if (!body.garage)    throw new Error("Garage is required");
  clearFleetRow(body.plate, "Maintenance", { remarks: body.remarks || "", garage: body.garage });
  addHistory({
    plate: body.plate, type: body.type || "", action: "Sent to Maintenance",
    remarks: body.remarks || "", location: body.location || "",
    staffName: body.staffName, garage: body.garage,
  });
  return { success: true };
}

function setAvailable(body) {
  if (!body.plate || !body.staffName) throw new Error("Plate and staff required");
  clearFleetRow(body.plate, "Available", { remarks: body.remarks || "" });
  addHistory({
    plate: body.plate, type: body.type || "", action: "Marked Available",
    remarks: body.remarks || "", location: body.location || "",
    staffName: body.staffName, kmOut: body.kmOut || "",
  });
  return { success: true };
}

function updateLocation(body) {
  if (!body.plate || !body.location) throw new Error("Plate and location required");
  updateFleetRow(body.plate, { location: body.location });
  addHistory({
    plate: body.plate, type: body.type || "", action: "Location Updated",
    location: body.location, staffName: body.staffName || "",
  });
  return { success: true };
}

function updatePayment(body) {
  if (!body.plate)         throw new Error("Plate is required");
  if (!body.paymentStatus) throw new Error("Payment status is required");
  if (!body.staffName)     throw new Error("Staff name is required");
  requireManagerOrAdmin(body.staffName);
  updateFleetRow(body.plate, {
    paymentStatus: body.paymentStatus,
    amountPaid:    body.amountPaid || "",
  });
  const { sheet, rowIndex } = findRow(body.plate);
  const row = sheet.getRange(rowIndex, 1, 1, 19).getValues()[0];
  addHistory({
    plate: body.plate, type: body.type || row[1], action: "Payment Updated",
    client: row[4], remarks: body.remarks || "", staffName: body.staffName,
    paymentStatus: body.paymentStatus, amountPaid: body.amountPaid || "",
  });
  return { success: true };
}

function markSold(body) {
  if (!body.plate)     throw new Error("Plate is required");
  if (!body.staffName) throw new Error("Staff name is required");
  requireManagerOrAdmin(body.staffName);
  const { sheet, rowIndex } = findRow(body.plate);
  const row  = sheet.getRange(rowIndex, 1, 1, 2).getValues()[0];
  const type = row[1];
  const soldSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SOLD_SHEET);
  soldSheet.appendRow([new Date(), body.plate, type, body.remarks || "", body.staffName]);
  sheet.deleteRow(rowIndex);
  addHistory({
    plate: body.plate, type, action: "Sold",
    remarks: body.remarks || "", staffName: body.staffName,
  });
  return { success: true };
}

function addCarNote(body) {
  if (!body.plate)     throw new Error("Plate is required");
  if (!body.note)      throw new Error("Note is required");
  if (!body.staffName) throw new Error("Staff name is required");
  addHistory({
    plate: body.plate, type: body.type || "", action: "Note Added",
    remarks: body.note, staffName: body.staffName,
  });
  return { success: true };
}

// ── Config ───────────────────────────────────────────────────
function getConfigV7() {
  const sheet     = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(CONFIG_SHEET);
  const rows      = sheet.getDataRange().getValues();
  const staff     = rows.filter(r => r[0] === "Staff").map(r => r[1]).filter(Boolean);
  const locations = rows.filter(r => r[0] === "Location").map(r => r[1]).filter(Boolean);
  const garages   = rows.filter(r => r[0] === "Garage").map(r => r[1]).filter(Boolean);
  const drivers   = rows.filter(r => r[0] === "Driver").map(r => r[1]).filter(Boolean);
  return { success: true, staff, locations, garages, drivers };
}

function addConfigItem(type, name) {
  if (!name) throw new Error("Name is required");
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(CONFIG_SHEET);
  sheet.appendRow([type, name]);
  return { success: true };
}

// ── Clients ──────────────────────────────────────────────────
function getClients() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(HISTORY_SHEET);
  const rows  = sheet.getDataRange().getValues();
  if (rows.length <= 1) return { success: true, data: [] };
  const tz      = SpreadsheetApp.openById(SPREADSHEET_ID).getSpreadsheetTimeZone();
  const clients = {};
  rows.slice(1).forEach(row => {
    const action = row[3] || "";
    const client = (row[4] || "").trim();
    const phone  = row[5] || "";
    if (!client || action !== "Checked Out") return;
    if (!clients[client]) {
      clients[client] = {
        name: client, phone, totalRentals: 0, lastRentalDate: "",
        totalAmount: 0, currency: row[14] || "TZS", unpaidCount: 0, rentals: [],
      };
    }
    const c  = clients[client];
    c.totalRentals++;
    const ts = row[0] ? Utilities.formatDate(new Date(row[0]), tz, "yyyy-MM-dd") : "";
    if (!c.lastRentalDate || ts > c.lastRentalDate) c.lastRentalDate = ts;
    c.totalAmount += Number(row[13]) || 0;
    const payStatus = row[18] || "";
    if (payStatus === "Unpaid" || payStatus === "Partial Paid") c.unpaidCount++;
    c.rentals.push({
      date: ts, plate: row[1] || "", type: row[2] || "",
      returnDate: fmtDate(row[7]), amount: row[13] || "",
      currency: row[14] || "TZS", payStatus,
      location: row[8] || "", staff: row[10] || "",
    });
  });
  return {
    success: true,
    data: Object.values(clients).sort((a, b) => b.lastRentalDate.localeCompare(a.lastRentalDate)),
  };
}

// ── Sub-Hire ─────────────────────────────────────────────────
function getSubHire() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SUBHIRE_SHEET);
  if (!sheet) return { success: true, data: [] };
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return { success: true, data: [] };
  const tz = SpreadsheetApp.openById(SPREADSHEET_ID).getSpreadsheetTimeZone();
  return {
    success: true,
    data: rows.slice(1).map((row, i) => ({
      rowIndex:           i + 2,
      id:                 row[0]  || "",
      status:             row[1]  || "Active",
      supplierName:       row[2]  || "",
      supplierContact:    row[3]  || "",
      vehicleDesc:        row[4]  || "",
      client:             row[5]  || "",
      clientPhone:        row[6]  || "",
      bookedFrom:         fmtDate(row[7]),
      returnDate:         fmtDate(row[8]),
      actualReturn:       fmtDate(row[9]),
      location:           row[10] || "",
      fuelOut:            row[11] || "",
      fuelIn:             row[12] || "",
      amount:             row[13] || "",
      currency:           row[14] || "TZS",
      paymentStatus:      row[15] || "Unpaid",
      amountPaid:         row[16] || "",
      supplierAmount:     row[17] || "",
      supplierCurrency:   row[18] || "TZS",
      supplierPayStatus:  row[19] || "Unpaid",
      supplierAmountPaid: row[20] || "",
      policeFine:         row[21] || "",
      parkingFine:        row[22] || "",
      remarks:            row[23] || "",
      staffName:          row[24] || "",
      timestamp:          row[25] ? Utilities.formatDate(new Date(row[25]), tz, "yyyy-MM-dd'T'HH:mm:ss") : "",
    })),
  };
}

function addSubHire(body) {
  if (!body.supplierName) throw new Error("Supplier name is required");
  if (!body.client)       throw new Error("Client name is required");
  if (!body.staffName)    throw new Error("Staff name is required");
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SUBHIRE_SHEET);
  const id    = "SH-" + new Date().getTime().toString().slice(-6);
  sheet.appendRow([
    id, "Active",
    body.supplierName, body.supplierContact  || "",
    body.vehicleDesc  || "",
    body.client,       body.clientPhone      || "",
    body.bookedFrom   || "", body.returnDate || "",
    "",
    body.location     || "",
    body.fuelOut      || "", "",
    body.amount       || "", body.currency   || "TZS",
    body.paymentStatus|| "Unpaid", body.amountPaid || "",
    body.supplierAmount || "", body.supplierCurrency || "TZS",
    body.supplierPayStatus || "Unpaid", body.supplierAmountPaid || "",
    body.policeFine   || "", body.parkingFine || "",
    body.remarks      || "", body.staffName,
    new Date(),
  ]);
  return { success: true, id };
}

function returnSubHire(body) {
  if (!body.id)        throw new Error("Sub-hire ID is required");
  if (!body.staffName) throw new Error("Staff name is required");
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SUBHIRE_SHEET);
  const ids   = sheet.getRange("A:A").getValues().flat();
  const idx   = ids.findIndex(id => id === body.id);
  if (idx < 1) throw new Error("Sub-hire booking not found: " + body.id);
  const rowIndex = idx + 1;
  sheet.getRange(rowIndex, 2).setValue("Returned");
  sheet.getRange(rowIndex, 10).setValue(body.actualReturn      || "");
  sheet.getRange(rowIndex, 13).setValue(body.fuelIn            || "");
  sheet.getRange(rowIndex, 16).setValue(body.paymentStatus     || "");
  sheet.getRange(rowIndex, 17).setValue(body.amountPaid        || "");
  sheet.getRange(rowIndex, 20).setValue(body.supplierPayStatus || "");
  sheet.getRange(rowIndex, 21).setValue(body.supplierAmountPaid|| "");
  sheet.getRange(rowIndex, 22).setValue(body.policeFine        || "");
  sheet.getRange(rowIndex, 23).setValue(body.parkingFine       || "");
  sheet.getRange(rowIndex, 24).setValue(body.remarks           || "");
  return { success: true };
}

function updateSubHirePayment(body) {
  if (!body.id) throw new Error("Sub-hire ID is required");
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SUBHIRE_SHEET);
  const ids   = sheet.getRange("A:A").getValues().flat();
  const idx   = ids.findIndex(id => id === body.id);
  if (idx < 1) throw new Error("Sub-hire booking not found");
  const rowIndex = idx + 1;
  if (body.paymentStatus      !== undefined) sheet.getRange(rowIndex, 16).setValue(body.paymentStatus);
  if (body.amountPaid         !== undefined) sheet.getRange(rowIndex, 17).setValue(body.amountPaid);
  if (body.supplierPayStatus  !== undefined) sheet.getRange(rowIndex, 20).setValue(body.supplierPayStatus);
  if (body.supplierAmountPaid !== undefined) sheet.getRange(rowIndex, 21).setValue(body.supplierAmountPaid);
  return { success: true };
}

// ── Fuel ─────────────────────────────────────────────────────
// Sheet columns: A=Timestamp B=RefNo C=Date D=Plate E=Type
//                F=Product G=Amount H=Litres I=AuthorisedBy J=SubmittedBy

function getFuel() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(FUEL_SHEET);
  if (!sheet) return { success: true, data: [] };
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return { success: true, data: [] };
  const tz = SpreadsheetApp.openById(SPREADSHEET_ID).getSpreadsheetTimeZone();
  return {
    success: true,
    data: rows.slice(1).reverse().map(row => ({
      timestamp:    row[0] ? Utilities.formatDate(new Date(row[0]), tz, "yyyy-MM-dd'T'HH:mm:ss") : "",
      refNo:        row[1] || "",
      date:         fmtDate(row[2]),
      plate:        row[3] || "",
      type:         row[4] || "",
      product:      row[5] || "",
      amount:       row[6] || "",
      litres:       row[7] || "",
      authorisedBy: row[8] || "",
      submittedBy:  row[9] || "",
    })),
  };
}

function getFuelByPlate(plate) {
  if (!plate) return { success: true, data: [] };
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(FUEL_SHEET);
  if (!sheet) return { success: true, data: [] };
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return { success: true, data: [] };
  const tz   = SpreadsheetApp.openById(SPREADSHEET_ID).getSpreadsheetTimeZone();
  const norm = plate.trim().toLowerCase();
  return {
    success: true,
    data: rows.slice(1)
      .filter(row => (row[3] || "").toString().trim().toLowerCase() === norm)
      .reverse()
      .map(row => ({
        timestamp:    row[0] ? Utilities.formatDate(new Date(row[0]), tz, "yyyy-MM-dd'T'HH:mm:ss") : "",
        refNo:        row[1] || "",
        date:         fmtDate(row[2]),
        plate:        row[3] || "",
        type:         row[4] || "",
        product:      row[5] || "",
        amount:       row[6] || "",
        litres:       row[7] || "",
        authorisedBy: row[8] || "",
        submittedBy:  row[9] || "",
      })),
  };
}

function addFuel(body) {
  if (!body.plate)        throw new Error("Plate is required");
  if (!body.product)      throw new Error("Product is required");
  if (!body.authorisedBy) throw new Error("Authorised By is required");
  if (!body.date)         throw new Error("Date is required");
  if (!body.amount && !body.litres) throw new Error("Amount or Litres is required");

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(FUEL_SHEET);
  if (!sheet) throw new Error("Fuel sheet not found. Please create it first.");

  // Ref number = count of existing data rows + 1, zero-padded to 4 digits
  const rowCount = Math.max(sheet.getLastRow() - 1, 0); // subtract header
  const refNo    = "SC-FUEL-" + String(rowCount + 1).padStart(4, "0");

  // Auto-lookup vehicle type from Fleet
  let vehicleType = body.type || "";
  if (!vehicleType) {
    try {
      const fleetRows = SpreadsheetApp.openById(SPREADSHEET_ID)
        .getSheetByName(FLEET_SHEET).getDataRange().getValues();
      const norm  = body.plate.trim().toLowerCase();
      const match = fleetRows.slice(1).find(r => (r[0] || "").toString().trim().toLowerCase() === norm);
      if (match) vehicleType = match[1] || "";
    } catch(e) {}
  }

  sheet.appendRow([
    new Date(),
    refNo,
    body.date,
    body.plate,
    vehicleType,
    body.product,
    body.amount  || "",
    body.litres  || "",
    body.authorisedBy,
    body.submittedBy || body.authorisedBy,
  ]);

  return { success: true, refNo };
}

function editFuel(body) {
  if (!body.refNo)     throw new Error("Ref No is required");
  if (!body.staffName) throw new Error("Staff name is required");
  requireManagerOrAdmin(body.staffName);

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(FUEL_SHEET);
  if (!sheet) throw new Error("Fuel sheet not found");
  const refs     = sheet.getRange("B:B").getValues().flat();
  const idx      = refs.findIndex(r => r === body.refNo);
  if (idx < 1)   throw new Error("Fuel entry not found: " + body.refNo);
  const rowIndex = idx + 1;

  if (body.date)         sheet.getRange(rowIndex, 3).setValue(body.date);
  if (body.plate)        sheet.getRange(rowIndex, 4).setValue(body.plate);
  if (body.product)      sheet.getRange(rowIndex, 6).setValue(body.product);
  if (body.amount  !== undefined) sheet.getRange(rowIndex, 7).setValue(body.amount);
  if (body.litres  !== undefined) sheet.getRange(rowIndex, 8).setValue(body.litres);
  if (body.authorisedBy) sheet.getRange(rowIndex, 9).setValue(body.authorisedBy);

  return { success: true };
}

// ── Dashboard ────────────────────────────────────────────────
function getDashboard() {
  const tz    = Session.getScriptTimeZone();
  const today = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
  const fleetRows = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(FLEET_SHEET).getDataRange().getValues().slice(1);
  const histRows  = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(HISTORY_SHEET).getDataRange().getValues().slice(1);
  let checkedOutToday = 0, returnedToday = 0, dueToday = 0, overdue = 0;
  let collectedToday = { TZS: 0, USD: 0 }, outstanding = { TZS: 0, USD: 0 };
  const recentActivity = [];
  fleetRows.forEach(row => {
    const status = row[3], returnDate = fmtDate(row[7]);
    const currency = row[11] || "TZS", amount = Number(row[10]) || 0, amountPaid = Number(row[14]) || 0;
    const paymentStatus = row[13] || "";
    if (status === "Rented" && returnDate) {
      if (returnDate === today) dueToday++;
      else if (returnDate < today) overdue++;
    }
    if (status === "Rented" && (paymentStatus === "Unpaid" || paymentStatus === "Partial Paid")) {
      const owed = amount - amountPaid;
      if (owed > 0) outstanding[currency] = (outstanding[currency] || 0) + owed;
    }
  });
  histRows.forEach(row => {
    const ts = row[0] ? Utilities.formatDate(new Date(row[0]), tz, "yyyy-MM-dd") : "";
    const action = row[3], currency = row[14] || "TZS", amountPaid = Number(row[19]) || 0;
    if (ts === today) {
      if (action === "Checked Out") checkedOutToday++;
      if (action === "Returned")    returnedToday++;
      if (amountPaid > 0) collectedToday[currency] = (collectedToday[currency] || 0) + amountPaid;
    }
  });
  histRows.slice().reverse().slice(0, 15).forEach(row => {
    recentActivity.push({
      timestamp: row[0] ? new Date(row[0]).toISOString() : "",
      plate: row[1] || "", action: row[3] || "", client: row[4] || "", staffName: row[10] || "",
    });
  });
  return { success: true, today, checkedOutToday, returnedToday, dueToday, overdue, collectedToday, outstanding, recentActivity };
}

// ── Unpaid Reminder ──────────────────────────────────────────
const REMINDER_EMAILS = ["owner@smilescars.co.tz"];

function sendUnpaidReminder() {
  const sheet  = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(FLEET_SHEET);
  const rows   = sheet.getDataRange().getValues();
  const unpaid = rows.slice(1).filter(r => r[3] === "Rented" && (r[13] === "Unpaid" || r[13] === "Partial Paid"));
  if (unpaid.length === 0) return;
  let html = "<h2>SmilesCars — Unpaid Bookings (" + new Date().toDateString() + ")</h2>";
  html += "<table border='1' cellpadding='6' style='border-collapse:collapse;font-family:sans-serif;font-size:13px'>";
  html += "<tr style='background:#f3f4f6'><th>Plate</th><th>Type</th><th>Client</th><th>Phone</th><th>Return Date</th><th>Amount</th><th>Status</th><th>Paid So Far</th></tr>";
  unpaid.forEach(r => {
    html += "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td><td>" + r[4] + "</td><td>" + r[5] + "</td>" +
            "<td>" + r[7] + "</td><td>" + (r[11]||"TZS") + " " + r[10] + "</td>" +
            "<td>" + r[13] + "</td><td>" + (r[14] || "0") + "</td></tr>";
  });
  html += "</table>";
  REMINDER_EMAILS.forEach(email => {
    MailApp.sendEmail({ to: email, subject: "SmilesCars: " + unpaid.length + " unpaid booking(s) — " + new Date().toDateString(), htmlBody: html });
  });
}

function setupDailyReminder() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "sendUnpaidReminder") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("sendUnpaidReminder").timeBased().everyDays(1).atHour(8).create();
}

// ── Reservations (legacy — kept for reference) ───────────────
function reserveCar(body) {
  if (!body.plate || !body.client || !body.staffName || !body.bookedFrom)
    throw new Error("Required fields missing");
  const { rowIndex } = findRow(body.plate);
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(FLEET_SHEET);
  const currentRow = sheet.getDataRange().getValues()[rowIndex - 1];
  let warning = null;
  if (currentRow[3] === "Reserved") warning = `Already has a reservation starting ${fmtDate(currentRow[6])}.`;
  updateFleetRow(body.plate, {
    status: "Reserved", currentClient: body.client, clientPhone: body.clientPhone || "",
    bookedFrom: body.bookedFrom, returnDate: body.returnDate || "",
    remarks: body.remarks || "", location: body.location || "",
    fuelOut: body.fuelOut || "", amount: body.amount || "", currency: body.currency || "TZS",
    paymentStatus: body.paymentStatus || "Unpaid", amountPaid: body.amountPaid || "",
    policeFineOut: body.policeFine || "", parkingFineOut: body.parkingFine || "",
    kmOut: body.kmOut || "", driver: body.driver || "",
  });
  addHistory({
    plate: body.plate, type: body.type, action: "Reserved",
    client: body.client, clientPhone: body.clientPhone || "",
    bookedFrom: body.bookedFrom, returnDate: body.returnDate || "",
    location: body.location || "", remarks: body.remarks || "",
    staffName: body.staffName, amount: body.amount || "",
    currency: body.currency || "TZS", paymentStatus: body.paymentStatus || "Unpaid",
  });
  return { success: true, warning };
}

// ── Debug ────────────────────────────────────────────────────
function testRole(name) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(CONFIG_SHEET);
  const rows  = sheet.getDataRange().getValues();
  const allStaff = rows.filter(r => r[0] === "Staff").map(r => ({
    name: r[1], nameLen: r[1].toString().length,
    role: r[3], roleLen: (r[3]||"").toString().length,
    roleTrimmed: (r[3]||"").toString().trim(),
  }));
  const match = rows.find(r => r[0] === "Staff" && r[1].toString().trim() === name.toString().trim());
  return { searchName: name, found: !!match, role: match ? (match[3]||"").toString() : null, allStaff };
}

// ── Setup helpers (run once) ─────────────────────────────────
function updateHeaders() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  ss.getSheetByName(FLEET_SHEET).getRange(1, 1, 1, 19).setValues([[
    "Plate","Type","Location","Status","Current Client","Client Phone",
    "Booked From","Return Date","Remarks","Fuel Out","Amount","Currency",
    "Garage","Payment Status","Amount Paid","Police Fine (Out)","Parking Fine (Out)","KM Out","Driver"
  ]]).setFontWeight("bold");
  ss.getSheetByName(HISTORY_SHEET).getRange(1, 1, 1, 23).setValues([[
    "Timestamp","Plate","Type","Action","Client","Client Phone",
    "Booked From","Return Date","Location","Remarks","Staff Name",
    "Fuel Out","Fuel In","Amount","Currency","Police Fine","Parking Fine",
    "Garage","Payment Status","Amount Paid","KM Out","KM In","Driver"
  ]]).setFontWeight("bold");
  ss.getSheetByName(CONFIG_SHEET).getRange(1, 3, 1, 2).setValues([["Password","Role"]]).setFontWeight("bold");
  let sold = ss.getSheetByName(SOLD_SHEET);
  if (!sold) sold = ss.insertSheet(SOLD_SHEET);
  sold.getRange(1, 1, 1, 5).setValues([["Timestamp","Plate","Type","Remarks","Staff Name"]]).setFontWeight("bold");
}

function setupFuelSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh   = ss.getSheetByName(FUEL_SHEET);
  if (!sh) sh = ss.insertSheet(FUEL_SHEET);
  sh.getRange(1, 1, 1, 10).setValues([[
    "Timestamp","Ref No","Date","Plate","Vehicle Type",
    "Product","Amount (TSH)","Litres","Authorised By","Submitted By"
  ]]).setFontWeight("bold");
  Logger.log("✅ Fuel sheet ready.");
}

function setupSubHireSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh   = ss.getSheetByName(SUBHIRE_SHEET);
  if (!sh) sh = ss.insertSheet(SUBHIRE_SHEET);
  sh.getRange(1, 1, 1, 26).setValues([[
    "ID","Status","Supplier Name","Supplier Contact","Vehicle Description",
    "Client","Client Phone","Booked From","Return Date","Actual Return",
    "Location","Fuel Out","Fuel In","Amount","Currency","Payment Status","Amount Paid",
    "Supplier Amount","Supplier Currency","Supplier Pay Status","Supplier Amount Paid",
    "Police Fine","Parking Fine","Remarks","Staff Name","Timestamp"
  ]]).setFontWeight("bold");
}

function updateDropboxHeaders() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(FLEET_SHEET);
  sheet.getRange(1, 20, 1, 2).setValues([["Reg Card URL","Photos URL"]]).setFontWeight("bold");
  Logger.log("✅ Dropbox URL columns added.");
}

// ── Dropbox Sync ─────────────────────────────────────────────
const REG_CARDS_PATH = "/Cars/Vehicle Registration Cards";
const CAR_PICS_PATH  = "/Cars/Car Pics";

function normPlate(p) { return p.toString().replace(/\s+/g, "").toUpperCase(); }

function dropboxPost(endpoint, payload) {
  const token = PropertiesService.getScriptProperties().getProperty("DROPBOX_TOKEN");
  if (!token) throw new Error("DROPBOX_TOKEN not set in Script Properties.");
  const res  = UrlFetchApp.fetch("https://api.dropboxapi.com/2/" + endpoint, {
    method: "POST",
    headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  const json = JSON.parse(res.getContentText());
  if (json.error) throw new Error("Dropbox API error: " + JSON.stringify(json.error));
  return json;
}

function listDropboxFolder(path) {
  let result  = dropboxPost("files/list_folder", { path, recursive: false, limit: 2000 });
  let entries = result.entries || [];
  while (result.has_more) {
    result  = dropboxPost("files/list_folder/continue", { cursor: result.cursor });
    entries = entries.concat(result.entries || []);
  }
  return entries;
}

function getSharedLink(path) {
  try {
    const existing = dropboxPost("sharing/list_shared_links", { path, direct_only: true });
    if (existing.links && existing.links.length > 0) return existing.links[0].url;
  } catch(e) {}
  return dropboxPost("sharing/create_shared_link_with_settings", {
    path, settings: { requested_visibility: "public" },
  }).url;
}

function syncDropboxLinks() {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(FLEET_SHEET);
  const rows  = sheet.getDataRange().getValues();
  const props = PropertiesService.getScriptProperties();
  const plateMap = {};
  rows.slice(1).forEach((row, i) => {
    const plate = (row[0] || "").toString().trim();
    if (plate) plateMap[normPlate(plate)] = { rowIndex: i + 2, plate };
  });
  Logger.log("Fleet: " + Object.keys(plateMap).length + " cars.");
  const doneReg  = JSON.parse(props.getProperty("SYNC_DONE_REG")  || "[]");
  const donePics = JSON.parse(props.getProperty("SYNC_DONE_PICS") || "[]");
  let regMatched = 0, regFailed = 0;
  try {
    const typeEntries = listDropboxFolder(REG_CARDS_PATH).filter(e => e[".tag"] === "folder");
    const pending = typeEntries.filter(e => !doneReg.includes(e.name));
    if (pending.length > 0) {
      const tf = pending[0];
      listDropboxFolder(tf.path_lower).filter(e => e[".tag"] === "folder").forEach(folder => {
        const match = plateMap[normPlate(folder.name)];
        if (!match) return;
        try { sheet.getRange(match.rowIndex, 20).setValue(getSharedLink(folder.path_lower)); regMatched++; }
        catch(e) { regFailed++; }
      });
      doneReg.push(tf.name);
      props.setProperty("SYNC_DONE_REG", JSON.stringify(doneReg));
    } else { Logger.log("Reg Cards: all done ✅"); }
  } catch(e) { Logger.log("❌ Reg Cards: " + e.message); }
  let picsMatched = 0, picsFailed = 0;
  try {
    const topLevel = listDropboxFolder(CAR_PICS_PATH).filter(e => e[".tag"] === "folder");
    const isFlat   = topLevel.filter(e => normPlate(e.name) in plateMap).length > 5;
    if (isFlat) {
      if (donePics.length === 0) {
        topLevel.forEach(folder => {
          const match = plateMap[normPlate(folder.name)];
          if (!match) return;
          try { sheet.getRange(match.rowIndex, 21).setValue(getSharedLink(folder.path_lower)); picsMatched++; }
          catch(e) { picsFailed++; }
        });
        props.setProperty("SYNC_DONE_PICS", JSON.stringify(["done"]));
      } else { Logger.log("Car Pics: already done ✅"); }
    } else {
      const pending = topLevel.filter(e => !donePics.includes(e.name));
      if (pending.length > 0) {
        const tf = pending[0];
        listDropboxFolder(tf.path_lower).filter(e => e[".tag"] === "folder").forEach(folder => {
          const match = plateMap[normPlate(folder.name)];
          if (!match) return;
          try { sheet.getRange(match.rowIndex, 21).setValue(getSharedLink(folder.path_lower)); picsMatched++; }
          catch(e) { picsFailed++; }
        });
        donePics.push(tf.name);
        props.setProperty("SYNC_DONE_PICS", JSON.stringify(donePics));
      } else { Logger.log("Car Pics: all done ✅"); }
    }
  } catch(e) { Logger.log("❌ Car Pics: " + e.message); }
  try {
    const regTotal = listDropboxFolder(REG_CARDS_PATH).filter(e => e[".tag"] === "folder").length;
    const regDone  = JSON.parse(props.getProperty("SYNC_DONE_REG")  || "[]").length;
    const picsDone = JSON.parse(props.getProperty("SYNC_DONE_PICS") || "[]").length;
    if (regDone >= regTotal && picsDone > 0) {
      Logger.log("🎉 ALL DONE");
      props.deleteProperty("SYNC_DONE_REG");
      props.deleteProperty("SYNC_DONE_PICS");
    } else {
      Logger.log("▶ Run again. Reg: " + regDone + "/" + regTotal + " Pics: " + (picsDone > 0 ? "done" : "pending"));
    }
  } catch(e) {}
  Logger.log("Reg +" + regMatched + " matched +" + regFailed + " failed | Pics +" + picsMatched + " matched +" + picsFailed + " failed");
}

function syncDropboxReset() {
  PropertiesService.getScriptProperties().deleteProperty("SYNC_DONE_REG");
  PropertiesService.getScriptProperties().deleteProperty("SYNC_DONE_PICS");
  Logger.log("✅ Reset done.");
}
