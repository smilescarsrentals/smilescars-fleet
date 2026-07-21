// ============================================================
//  SMILES FLEET MANAGER — Google Apps Script Backend v9
//  Added: Fuel Module (getFuel, getFuelByPlate, addFuel, editFuel)
// ============================================================

const SPREADSHEET_ID     = "1xK1tVQa1bHR-FVb1Tr2MjZdtm3_QHt1PdulfVLgoFtc";
const FLEET_SHEET        = "Fleet";
const HISTORY_SHEET      = "History";
const CONFIG_SHEET       = "Config";
const SETTINGS_SHEET     = "Settings";
const EXPORT_LOG_SHEET   = "ExportLog";
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
    if (action === "getHistoryByStaff") return respond(getHistoryByStaff(e.parameter.staffName || ""));
    if (action === "getFuel")         return respond(getFuel());
    if (action === "getFuelByPlate")  return respond(getFuelByPlate(e.parameter.plate  || ""));
    if (action === "getReservations")    return respond(getReservations(e.parameter.month || "", e.parameter.year || ""));
    if (action === "getAllReservations") return respond(getReservations("", ""));
    if (action === "getBlacklist")    return respond(getBlacklist());
    if (action === "testRole")        return respond(testRole(e.parameter.name         || ""));
    if (action === "getSignature")      return respond(getSignature(e));
    if (action === "getStaffSignature") return respond(getStaffSignature(e));
    if (action === "getNextAgreementRef") return respond(getNextAgreementRef());
    if (action === "getStaffList")        return respond(getStaffList());
    if (action === "getSettings")         return respond(getSettings());
    if (action === "getExportLog")        return respond(getExportLog());
    if (action === "getDropboxSyncStatus") return respond(getDropboxSyncStatus());
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
    if (action === "addCar")               return respond(addCar(body));
    if (action === "markReturned")         return respond(markReturned(body));
    if (action === "extendBooking")        return respond(extendBooking(body));
    if (action === "setMaintenance")       return respond(setMaintenance(body));
    if (action === "setAvailable")         return respond(setAvailable(body));
    if (action === "setStaffUse")          return respond(setStaffUse(body));
    if (action === "updateLocation")       return respond(updateLocation(body));
    if (action === "updatePayment")        return respond(updatePayment(body));
    if (action === "markSold")             return respond(markSold(body));
    if (action === "addStaff")             return respond(addStaff(body));
    if (action === "setStaffActive")       return respond(setStaffActive(body));
    if (action === "addLocation")          return respond(addConfigItem("Location", body.name));
    if (action === "addGarage")            return respond(addConfigItem("Garage",   body.name));
    if (action === "addDriver")            return respond(addConfigItem("Driver",   body.name));
    if (action === "updateConfigItem")     return respond(updateConfigItem(body));
    if (action === "deleteConfigItem")     return respond(deleteConfigItem(body));
    if (action === "updateSetting")        return respond(updateSetting(body));
    if (action === "logExport")            return respond(logExport(body));
    if (action === "enableDropboxSync")    return respond(enableDropboxSync());
    if (action === "disableDropboxSync")   return respond(disableDropboxSync());
    if (action === "createBackupSnapshot") return respond(createBackupSnapshot());
    if (action === "addCarNote")           return respond(addCarNote(body));
    if (action === "addSubHire")           return respond(addSubHire(body));
    if (action === "returnSubHire")        return respond(returnSubHire(body));
    if (action === "updateSubHirePayment") return respond(updateSubHirePayment(body));
    if (action === "addFuel")              return respond(addFuel(body));
    if (action === "editFuel")             return respond(editFuel(body));
    if (action === "replaceVehicle")       return respond(replaceVehicle(body));
    if (action === "addReservation")       return respond(addReservation(body));
    if (action === "editReservation")      return respond(editReservation(body));
    if (action === "deleteReservation")    return respond(deleteReservation(body));
    if (action === "addToBlacklist")       return respond(addToBlacklist(body));
    if (action === "uploadBlacklistImage") return respond(uploadBlacklistImage(body));
    if (action === "deleteFromBlacklist")  return respond(deleteFromBlacklist(body));
    if (action === "storeSignature")       return respond(storeSignature(body));
    if (action === "storeStaffSignature")  return respond(storeStaffSignature(body));
    if (action === "deleteStaffSignature") return respond(deleteStaffSignature(body));
    if (action === "uploadAgreement")      return respond(uploadAgreement(body));
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
  const range = sheet.getDataRange();
  const rows     = range.getValues();
  const richRows = range.getRichTextValues();
  return { success: true, data: rows.slice(1).map((row, i) => mapFleetRow(row, i, richRows[i + 1])) };
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
    kmOut: 18, driver: 19, checkedOutBy: 22, bookingType: 23,
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
    parkingFineOut: "", kmOut: "", driver: "", bookingType: "",
  }, extra || {}));
}

// Reg Card / Photos cells can be either a plain URL string, or a rich-text
// hyperlink cell (e.g. showing "Open Reg Card" as clickable display text).
// getValues() on the latter returns the DISPLAY TEXT, not the real URL — so
// reading those two columns needs the corresponding getRichTextValues() row
// too, to pull the actual link out from underneath the label.
function resolveLinkCell_(plainValue, richTextCell) {
  if (richTextCell) {
    const url = richTextCell.getLinkUrl();
    if (url) return url;
  }
  return plainValue || "";
}

function mapFleetRow(row, i, richRow) {
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
    regCardUrl:     richRow ? resolveLinkCell_(row[19], richRow[19]) : (row[19] || ""),
    photosUrl:      richRow ? resolveLinkCell_(row[20], richRow[20]) : (row[20] || ""),
    checkedOutBy:   row[21] || "",
    bookingType:    row[22] || "Rental", };
}

// Adds a brand-new car to the Fleet sheet. Only the fields that make sense
// before a car has ever been rented — everything else (client, dates,
// amounts, etc.) stays blank until the first checkout populates it.
function addCar(body) {
  if (!body.plate)    throw new Error("Plate is required");
  if (!body.type)     throw new Error("Type is required");
  if (!body.location) throw new Error("Location is required");
  const sheet  = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(FLEET_SHEET);
  const plates = sheet.getRange("A:A").getValues().flat();
  if (plates.includes(body.plate)) throw new Error("A car with this plate already exists: " + body.plate);
  sheet.appendRow([
    body.plate,           // A  plate
    body.type,            // B  type
    body.location,        // C  location
    "Available",          // D  status
    "",                   // E  currentClient
    "",                   // F  clientPhone
    "",                   // G  bookedFrom
    "",                   // H  returnDate
    "",                   // I  remarks
    "",                   // J  fuelOut
    "",                   // K  amount
    "TZS",                // L  currency
    "",                   // M  garage
    "",                   // N  paymentStatus
    "",                   // O  amountPaid
    "",                   // P  policeFineOut
    "",                   // Q  parkingFineOut
    "",                   // R  kmOut
    "",                   // S  driver
    body.regCardUrl || "",// T  regCardUrl
    body.photosUrl  || "",// U  photosUrl
    "",                   // V  checkedOutBy
    "",                   // W  bookingType
  ]);
  return { success: true };
}

function getCarByPlate(plate) {
  if (!plate) return { success: false, error: "Plate required" };
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(FLEET_SHEET);
  const range = sheet.getDataRange();
  const rows  = range.getValues();
  const norm  = plate.trim().toLowerCase();
  const idx   = rows.slice(1).findIndex(r => (r[0] || "").toString().trim().toLowerCase() === norm);
  if (idx < 0) return { success: false, error: "Car not found: " + plate };
  const richRow = range.getRichTextValues()[idx + 1];
  return { success: true, data: mapFleetRow(rows[idx + 1], 0, richRow) };
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
  return { success: true, data: dataRows.reverse().map(row => mapHistoryRow(row, tz)), total };
}

function getHistoryByStaff(staffName) {
  if (!staffName) return { success: true, data: [] };
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(HISTORY_SHEET);
  const rows  = sheet.getDataRange().getValues();
  if (rows.length <= 1) return { success: true, data: [] };
  const tz   = SpreadsheetApp.openById(SPREADSHEET_ID).getSpreadsheetTimeZone();
  const norm = staffName.trim().toLowerCase();
  const data = rows.slice(1)
    .filter(row => (row[10] || "").toString().trim().toLowerCase() === norm)
    .reverse()
    .map(row => mapHistoryRow(row, tz));
  return { success: true, data };
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
  if (match && !isStaffActive_(match)) throw new Error("This account has been deactivated.");
  const role  = match ? (match[3] || "Staff").toString().trim() : "Staff";
  if (role !== "Manager" && role !== "Admin")
    throw new Error("This action requires a Manager or Admin account.");
}

// Config "Staff" rows: [Type, Name, Password, Role, Active]. The Active column
// is new — existing rows won't have it yet, so a blank/missing value defaults
// to TRUE (active). Only an explicit "FALSE" counts as deactivated.
function isStaffActive_(row) {
  const v = (row[4] === undefined || row[4] === null || row[4] === "") ? "TRUE" : row[4].toString().trim().toUpperCase();
  return v !== "FALSE";
}

function verifyStaff(body) {
  if (!body.name || !body.password) throw new Error("Name and password required");
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(CONFIG_SHEET);
  const rows  = sheet.getDataRange().getValues();
  const match = rows.find(r => r[0] === "Staff" && r[1].toString().trim() === body.name.toString().trim());
  if (!match)  return { success: false, message: "Staff not found" };
  if (!isStaffActive_(match)) return { success: false, message: "This account has been deactivated." };
  if (!match[2]) return { success: false, message: "No password set for this account" };
  if (match[2].toString().trim() !== body.password.toString().trim())
    return { success: false, message: "Incorrect password" };
  const fuelAccess = rows.filter(r => r[0] === "FuelAccess").map(r => r[1].toString().trim()).filter(Boolean);
  return { success: true, role: (match[3] || "Staff").toString().trim(), fuelAccess };
}

function addStaff(body) {
  if (!body.name) throw new Error("Name is required");
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(CONFIG_SHEET);
  sheet.appendRow(["Staff", body.name, body.password || "", body.role || "Staff", "TRUE"]);
  return { success: true };
}

// Admin-only: full staff list including inactive ones, with role/active status.
// (getConfig's plain `staff` array stays active-only, for everyday pickers.)
function getStaffList() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(CONFIG_SHEET);
  const rows  = sheet.getDataRange().getValues();
  const staff = rows
    .filter(r => r[0] === "Staff" && r[1])
    .map(r => ({ name: r[1], role: r[3] || "Staff", active: isStaffActive_(r) }));
  return { success: true, staff };
}

function setStaffActive(body) {
  if (!body.name) throw new Error("Staff name is required");
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(CONFIG_SHEET);
  const rows  = sheet.getDataRange().getValues();
  const idx   = rows.findIndex(r => r[0] === "Staff" && r[1].toString().trim() === body.name.toString().trim());
  if (idx < 0) throw new Error("Staff not found: " + body.name);
  sheet.getRange(idx + 1, 5).setValue(body.active ? "TRUE" : "FALSE");
  return { success: true };
}

// ── Actions ──────────────────────────────────────────────────
function checkOut(body) {
  if (!body.plate)     throw new Error("Plate is required");
  if (!body.client)    throw new Error("Client name is required");
  if (!body.staffName) throw new Error("Staff name is required");
  const bookingType = body.bookingType === "Transfer" ? "Transfer" : "Rental";
  // For a Transfer, fold the pickup/dropoff addresses into remarks — Fleet
  // and History don't have dedicated columns for those, and this keeps them
  // visible to anyone reading the row without a wider schema change.
  const remarks = bookingType === "Transfer"
    ? [
        body.pickupFrom ? "PickUp From: " + body.pickupFrom : "",
        body.dropoffTo  ? "DropOff To: "  + body.dropoffTo  : "",
        body.remarks || "",
      ].filter(Boolean).join(" | ")
    : (body.remarks || "");

  updateFleetRow(body.plate, {
    status: "Rented", currentClient: body.client,
    clientPhone: body.clientPhone || "", bookedFrom: body.bookedFrom || "",
    returnDate: body.returnDate || "", remarks: remarks,
    location: body.location || "", fuelOut: body.fuelOut || "",
    amount: body.amount || "", currency: body.currency || "TZS",
    garage: "", paymentStatus: body.paymentStatus || "Unpaid",
    amountPaid: body.amountPaid || "",
    policeFineOut: body.policeFine || "", parkingFineOut: body.parkingFine || "",
    kmOut: body.kmOut || "", driver: body.driver || "",
    checkedOutBy: body.staffName, bookingType: bookingType,
  });
  // The Fleet row above is the source of truth for the car's status — it's
  // already saved at this point. Don't let a hiccup in the secondary History
  // log (Apps Script + concurrent Sheets access can throw transient lock
  // errors on appendRow) report the whole checkout as failed to the client,
  // which would otherwise send a staff member back to a "Confirm Check Out"
  // screen for a car that's already checked out.
  try {
    addHistory({
      plate: body.plate, type: body.type, action: bookingType === "Transfer" ? "Transfer Out" : "Checked Out",
      client: body.client, clientPhone: body.clientPhone || "",
      bookedFrom: body.bookedFrom || "", returnDate: body.returnDate || "",
      location: body.location || "", remarks: remarks,
      staffName: body.staffName, fuelOut: body.fuelOut || "",
      amount: body.amount || "", currency: body.currency || "TZS",
      policeFine: body.policeFine || "", parkingFine: body.parkingFine || "",
      paymentStatus: body.paymentStatus || "Unpaid",
      amountPaid: body.amountPaid || "", kmOut: body.kmOut || "",
      driver: body.driver || "",
    });
  } catch (err) {
    console.error("addHistory failed after a successful checkOut for " + body.plate + ": " + err.message);
  }
  return { success: true };
}

function markReturned(body) {
  if (!body.plate)     throw new Error("Plate is required");
  if (!body.staffName) throw new Error("Staff name is required");
  const { sheet, rowIndex } = findRow(body.plate);
  const row = sheet.getRange(rowIndex, 1, 1, 23).getValues()[0];
  const wasTransfer = (row[22] || "Rental") === "Transfer";
  clearFleetRow(body.plate, "Available", { remarks: body.remarks || "" });
  addHistory({
    plate: body.plate, type: body.type || row[1], action: wasTransfer ? "Transfer Completed" : "Returned",
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
  updateFleetRow(body.plate, {
    returnDate: body.returnDate,
    remarks: body.remarks || "",
    ...(body.amount        ? { amount: body.amount, currency: body.currency || "TZS" } : {}),
    ...(body.paymentStatus ? { paymentStatus: body.paymentStatus }                      : {}),
    ...(body.amountPaid    ? { amountPaid: body.amountPaid }                            : {}),
  });
  addHistory({
    plate: body.plate, type: body.type || row[1], action: "Booking Extended",
    client: row[4], clientPhone: row[5], bookedFrom: fmtDate(row[6]),
    returnDate: body.returnDate, location: body.location || row[2],
    remarks: `Extended from ${oldReturnDate} to ${body.returnDate}. ${body.remarks || ""}`.trim(),
    staffName: body.staffName,
    amount: body.amount || "", currency: body.currency || "",
    paymentStatus: body.paymentStatus || "", amountPaid: body.amountPaid || "",
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

function setStaffUse(body) {
  if (!body.plate)        throw new Error("Plate is required");
  if (!body.staffName)    throw new Error("Staff name is required");
  if (!body.assignedTo)   throw new Error("Assigned staff member is required");
  updateFleetRow(body.plate, {
    status:        "Staff Use",
    currentClient: body.assignedTo,
    clientPhone:   "",
    bookedFrom:    "",
    returnDate:    "",
    remarks:       body.remarks  || "",
    fuelOut:       body.fuelOut  || "",
    kmOut:         body.kmOut    || "",
    location:      body.location || "",
    amount: "", currency: "", garage: "", paymentStatus: "",
    amountPaid: "", policeFineOut: "", parkingFineOut: "", driver: "",
  });
  addHistory({
    plate:     body.plate,
    type:      body.type || "",
    action:    "Staff Use",
    client:    body.assignedTo,
    location:  body.location  || "",
    remarks:   body.remarks   || "",
    fuelOut:   body.fuelOut   || "",
    kmOut:     body.kmOut     || "",
    staffName: body.staffName,
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
  const staff     = rows.filter(r => r[0] === "Staff" && isStaffActive_(r)).map(r => r[1]).filter(Boolean);
  const locations = rows.filter(r => r[0] === "Location").map(r => r[1]).filter(Boolean);
  const garages    = rows.filter(r => r[0] === "Garage").map(r => r[1]).filter(Boolean);
  const drivers    = rows.filter(r => r[0] === "Driver").map(r => r[1]).filter(Boolean);
  const fuelAccess = rows.filter(r => r[0] === "FuelAccess").map(r => r[1]).filter(Boolean);
  return { success: true, staff, locations, garages, drivers, fuelAccess };
}

function addConfigItem(type, name) {
  if (!name) throw new Error("Name is required");
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(CONFIG_SHEET);
  sheet.appendRow([type, name]);
  return { success: true };
}

// Rename/delete a Location, Garage, or Driver entry. Notably does NOT check
// whether it's currently referenced by a Fleet row — deleting an in-use value
// is allowed; existing rows just keep the old text. Acceptable for this scale.
function updateConfigItem(body) {
  if (!body.type || !body.oldValue || !body.newValue) throw new Error("type, oldValue, and newValue are required");
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(CONFIG_SHEET);
  const rows  = sheet.getDataRange().getValues();
  const idx   = rows.findIndex(r => r[0] === body.type && (r[1]||"").toString().trim() === body.oldValue.toString().trim());
  if (idx < 0) throw new Error("Not found: " + body.oldValue);
  sheet.getRange(idx + 1, 2).setValue(body.newValue);
  return { success: true };
}

function deleteConfigItem(body) {
  if (!body.type || !body.value) throw new Error("type and value are required");
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(CONFIG_SHEET);
  const rows  = sheet.getDataRange().getValues();
  const idx   = rows.findIndex(r => r[0] === body.type && (r[1]||"").toString().trim() === body.value.toString().trim());
  if (idx < 0) throw new Error("Not found: " + body.value);
  sheet.deleteRow(idx + 1);
  return { success: true };
}

// ── Settings (feature toggles) ──────────────────────────────────────────────
function getOrCreateSettingsSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(SETTINGS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(SETTINGS_SHEET);
    sh.getRange(1,1,1,2).setValues([["Key","Value"]]).setFontWeight("bold");
    sh.appendRow(["RentalAgreementEnabled", "TRUE"]);
  }
  return sh;
}

function getSettings() {
  const sh   = getOrCreateSettingsSheet_();
  const rows = sh.getDataRange().getValues();
  const settings = {};
  rows.slice(1).forEach(r => { if (r[0]) settings[r[0]] = r[1]; });
  if (!("RentalAgreementEnabled" in settings)) settings.RentalAgreementEnabled = "TRUE";
  return { success: true, settings };
}

function updateSetting(body) {
  if (!body.key) throw new Error("Setting key is required");
  const sh   = getOrCreateSettingsSheet_();
  const rows = sh.getDataRange().getValues();
  const idx  = rows.findIndex(r => r[0] === body.key);
  if (idx >= 1) sh.getRange(idx + 1, 2).setValue(String(body.value));
  else sh.appendRow([body.key, String(body.value)]);
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
      plate:              row[26] || "",
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
    body.plate        || "",
  ]);
  return { success: true, id };
}

function addSubHirePlateHeader() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SUBHIRE_SHEET);
  sheet.getRange(1, 27).setValue("Plate No.").setFontWeight("bold");
  Logger.log("✅ Plate No. column added to SubHire sheet (column AA).");
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
      linkedClient: row[10] || "",
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
        linkedClient: row[10] || "",
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

  // Auto-lookup vehicle type from Fleet, then SubHire
  let vehicleType = body.type || "";
  if (!vehicleType) {
    try {
      const norm      = body.plate.trim().toLowerCase();
      const fleetRows = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(FLEET_SHEET).getDataRange().getValues();
      const fleetMatch = fleetRows.slice(1).find(r => (r[0] || "").toString().trim().toLowerCase() === norm);
      if (fleetMatch) vehicleType = fleetMatch[1] || "";
    } catch(e) {}
  }
  if (!vehicleType) {
    try {
      const norm       = body.plate.trim().toLowerCase();
      const shRows     = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SUBHIRE_SHEET).getDataRange().getValues();
      const shMatch    = shRows.slice(1).find(r => (r[26] || "").toString().trim().toLowerCase() === norm);
      if (shMatch) vehicleType = shMatch[4] || ""; // vehicleDesc is column E (index 4)
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
    body.linkedClient || "",
    body.currentKm    || "",
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
function addCheckedOutByHeader() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(FLEET_SHEET);
  sheet.getRange(1, 22).setValue("Checked Out By").setFontWeight("bold");
  Logger.log("✅ Checked Out By column added to Fleet sheet (column V).");
}

// Run once to backfill checkedOutBy from History for all currently rented cars
function populateCheckedOutBy() {
  const ss          = SpreadsheetApp.openById(SPREADSHEET_ID);
  const fleetSheet  = ss.getSheetByName(FLEET_SHEET);
  const histSheet   = ss.getSheetByName(HISTORY_SHEET);
  const fleetRows   = fleetSheet.getDataRange().getValues();
  const histRows    = histSheet.getDataRange().getValues();

  // Build map: plate → most recent "Checked Out" staffName from History
  const staffMap = {};
  histRows.slice(1).forEach(row => {
    const action = (row[3] || "").toString().trim();
    const plate  = (row[1] || "").toString().trim();
    const staff  = (row[10] || "").toString().trim();
    if (action === "Checked Out" && plate && staff) {
      // History is already in order; last write wins (most recent)
      staffMap[plate] = staff;
    }
  });

  let updated = 0;
  fleetRows.slice(1).forEach((row, i) => {
    const plate  = (row[0] || "").toString().trim();
    const status = (row[3] || "").toString().trim();
    const existing = (row[21] || "").toString().trim();
    // Only fill if rented/staff use and column V is empty
    if (plate && !existing && (status === "Rented" || status === "Staff Use")) {
      const staff = staffMap[plate];
      if (staff) {
        fleetSheet.getRange(i + 2, 22).setValue(staff);
        updated++;
        Logger.log(`✅ ${plate} → ${staff}`);
      }
    }
  });

  Logger.log(`✅ Done. Updated ${updated} cars.`);
}

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
  ss.getSheetByName(CONFIG_SHEET).getRange(1, 3, 1, 3).setValues([["Password","Role","Active"]]).setFontWeight("bold");
  let sold = ss.getSheetByName(SOLD_SHEET);
  if (!sold) sold = ss.insertSheet(SOLD_SHEET);
  sold.getRange(1, 1, 1, 5).setValues([["Timestamp","Plate","Type","Remarks","Staff Name"]]).setFontWeight("bold");
}

function setupFuelSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh   = ss.getSheetByName(FUEL_SHEET);
  if (!sh) sh = ss.insertSheet(FUEL_SHEET);
  sh.getRange(1, 1, 1, 12).setValues([[
    "Timestamp","Ref No","Date","Plate","Vehicle Type",
    "Product","Amount (TSH)","Litres","Authorised By","Submitted By","Linked Client","Current KM"
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

// Writes a proper hyperlink cell with custom display text (e.g. "Open Reg Card")
// instead of a raw, messy-looking URL — same visual result as Insert > Link
// in the Sheets UI, done programmatically.
function setLinkCell_(range, url, label) {
  const richText = SpreadsheetApp.newRichTextValue().setText(label).setLinkUrl(url).build();
  range.setRichTextValue(richText);
}

// Dropbox access tokens (Bearer tokens) expire after a few hours by design —
// that's what caused the "expired_access_token" error, not a bug. The fix is
// a refresh token (doesn't expire) that mints a fresh access token on demand.
// One-time setup required — see setup instructions. Cached per-execution only
// (Apps Script resets globals between runs), so each syncDropboxLinks() run
// mints exactly one fresh token and reuses it for all its internal API calls.
let _dropboxAccessTokenCache = null;
function getDropboxAccessToken_() {
  if (_dropboxAccessTokenCache) return _dropboxAccessTokenCache;
  const props = PropertiesService.getScriptProperties();
  const refreshToken = props.getProperty("DROPBOX_REFRESH_TOKEN");
  const appKey        = props.getProperty("DROPBOX_APP_KEY");
  const appSecret     = props.getProperty("DROPBOX_APP_SECRET");
  if (!refreshToken || !appKey || !appSecret) {
    throw new Error("Missing DROPBOX_REFRESH_TOKEN / DROPBOX_APP_KEY / DROPBOX_APP_SECRET in Script Properties — see one-time Dropbox setup instructions.");
  }
  const res = UrlFetchApp.fetch("https://api.dropbox.com/oauth2/token", {
    method: "POST",
    payload: {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: appKey,
      client_secret: appSecret,
    },
    muteHttpExceptions: true,
  });
  const json = JSON.parse(res.getContentText());
  if (json.error || !json.access_token) throw new Error("Dropbox token refresh failed: " + JSON.stringify(json));
  _dropboxAccessTokenCache = json.access_token;
  return _dropboxAccessTokenCache;
}

// One-time helper — run this manually once, with the "code" from the
// authorize-URL step, to obtain the refresh token. See setup instructions.
// One-time helper — run this with the ▶ Run button (no arguments needed, since
// the Apps Script editor's Run button can't actually pass function arguments —
// that's what caused the "invalid_client" error last time).
//
// Before running, set these three temporary Script Properties
// (Project Settings → Script Properties):
//   DROPBOX_TEMP_CODE    — the "code" from the authorize URL step
//   DROPBOX_APP_KEY      — your Dropbox app's App Key
//   DROPBOX_APP_SECRET   — your Dropbox app's App Secret
//
// On success this saves DROPBOX_REFRESH_TOKEN directly — no copy-pasting the
// token yourself — and removes DROPBOX_TEMP_CODE since it's single-use.
// DROPBOX_APP_KEY / DROPBOX_APP_SECRET stay in place; getDropboxAccessToken_
// needs them on every future run too.
function exchangeDropboxAuthCode() {
  const props     = PropertiesService.getScriptProperties();
  const code      = props.getProperty("DROPBOX_TEMP_CODE");
  const appKey    = props.getProperty("DROPBOX_APP_KEY");
  const appSecret = props.getProperty("DROPBOX_APP_SECRET");
  if (!code || !appKey || !appSecret) {
    throw new Error("Set DROPBOX_TEMP_CODE, DROPBOX_APP_KEY, DROPBOX_APP_SECRET in Script Properties first, then run this again.");
  }
  const res = UrlFetchApp.fetch("https://api.dropbox.com/oauth2/token", {
    method: "POST",
    payload: {
      grant_type: "authorization_code",
      code: code,
      client_id: appKey,
      client_secret: appSecret,
    },
    muteHttpExceptions: true,
  });
  const json = JSON.parse(res.getContentText());
  Logger.log(JSON.stringify(json, null, 2));
  if (json.refresh_token) {
    props.setProperty("DROPBOX_REFRESH_TOKEN", json.refresh_token);
    props.deleteProperty("DROPBOX_TEMP_CODE");
    Logger.log("✅ DROPBOX_REFRESH_TOKEN saved to Script Properties. You can now delete the old DROPBOX_TOKEN property.");
  } else {
    Logger.log("❌ No refresh_token in the response — see the error above. The code from the authorize URL is single-use and expires quickly; if this failed, generate a fresh one and update DROPBOX_TEMP_CODE before retrying.");
  }
  return json;
}

// The Apps Script editor's "Run" button calls a function with ZERO arguments —
// it cannot pass code/appKey/appSecret in directly. Fill in the three values
// below, select THIS function (not exchangeDropboxAuthCode) in the dropdown,
// and run it instead. Delete this function once you have your refresh token.
function TEMP_runDropboxExchange() {
  exchangeDropboxAuthCode(
    "PASTE_THE_CODE_FROM_THE_AUTHORIZE_URL_HERE",
    "PASTE_YOUR_APP_KEY_HERE",
    "PASTE_YOUR_APP_SECRET_HERE"
  );
}

function dropboxPost(endpoint, payload) {
  const token = getDropboxAccessToken_();
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
        try { setLinkCell_(sheet.getRange(match.rowIndex, 20), getSharedLink(folder.path_lower), "Open Reg Card"); regMatched++; }
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
          try { setLinkCell_(sheet.getRange(match.rowIndex, 21), getSharedLink(folder.path_lower), "Open Car Pics"); picsMatched++; }
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
          try { setLinkCell_(sheet.getRange(match.rowIndex, 21), getSharedLink(folder.path_lower), "Open Car Pics"); picsMatched++; }
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
    const allDone  = regDone >= regTotal && picsDone > 0;
    props.setProperty("SYNC_STATUS_JSON", JSON.stringify({
      lastRun: new Date().toISOString(),
      regDone, regTotal, picsDone: picsDone > 0,
      regMatched, regFailed, picsMatched, picsFailed, allDone,
    }));
    if (allDone) {
      Logger.log("🎉 ALL DONE");
      props.deleteProperty("SYNC_DONE_REG");
      props.deleteProperty("SYNC_DONE_PICS");
      // Stop the automatic trigger now that everything's synced — no reason to
      // keep re-running (and re-fetching/re-sharing links) forever.
      ScriptApp.getProjectTriggers().forEach(t => {
        if (t.getHandlerFunction() === "syncDropboxLinks") ScriptApp.deleteTrigger(t);
      });
      Logger.log("🛑 Auto-sync trigger removed — everything is synced. Run setupDropboxSyncTrigger() again later if you add a lot of new cars/folders at once and want to bulk-sync them.");
    } else {
      Logger.log("▶ Run again. Reg: " + regDone + "/" + regTotal + " Pics: " + (picsDone > 0 ? "done" : "pending"));
    }
  } catch(e) {}
  Logger.log("Reg +" + regMatched + " matched +" + regFailed + " failed | Pics +" + picsMatched + " matched +" + picsFailed + " failed");
}

// ── Admin Panel: Dropbox sync status/toggle ─────────────────────────────────
function getDropboxSyncStatus() {
  const props = PropertiesService.getScriptProperties();
  const statusJson = props.getProperty("SYNC_STATUS_JSON");
  const status = statusJson ? JSON.parse(statusJson) : null;
  const triggerActive = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === "syncDropboxLinks");
  return { success: true, status, triggerActive };
}

function enableDropboxSync() {
  setupDropboxSyncTrigger();
  return { success: true };
}

function disableDropboxSync() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "syncDropboxLinks") ScriptApp.deleteTrigger(t);
  });
  return { success: true };
}

function syncDropboxReset() {
  PropertiesService.getScriptProperties().deleteProperty("SYNC_DONE_REG");
  PropertiesService.getScriptProperties().deleteProperty("SYNC_DONE_PICS");
  Logger.log("✅ Reset done.");
}

// One-time cleanup — reformats any Reg Card/Photos cells already written as
// raw URLs (e.g. from before this hyperlink change) into the same
// "Open Reg Card" / "Open Car Pics" clickable-text format going forward.
// Safe to run any time; skips cells that are already blank.
function reformatExistingLinks() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(FLEET_SHEET);
  const rows  = sheet.getDataRange().getValues();
  let count = 0;
  rows.slice(1).forEach((row, i) => {
    const rowIndex = i + 2;
    const regUrl  = row[19]; // column T
    const picsUrl = row[20]; // column U
    if (regUrl  && String(regUrl).indexOf("http")  === 0) { setLinkCell_(sheet.getRange(rowIndex, 20), regUrl,  "Open Reg Card"); count++; }
    if (picsUrl && String(picsUrl).indexOf("http") === 0) { setLinkCell_(sheet.getRange(rowIndex, 21), picsUrl, "Open Car Pics"); count++; }
  });
  Logger.log("✅ Reformatted " + count + " existing link cell(s).");
}

// Run this once (▶ Run button, no arguments needed) to have syncDropboxLinks
// run automatically every 5 minutes until every folder is processed. It
// self-removes once syncDropboxLinks logs "ALL DONE" — safe to leave alone
// after that. Re-run this function again in future if you bulk-add a lot of
// new cars/Dropbox folders at once and want to catch them all up quickly.
function setupDropboxSyncTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "syncDropboxLinks") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("syncDropboxLinks")
    .timeBased()
    .everyMinutes(5)
    .create();
  Logger.log("✅ Trigger created — syncDropboxLinks will now run automatically every 5 minutes until fully done, then stop itself.");
}

// ── Reservations ─────────────────────────────────────────────
// Sheet columns: A=ID, B=Date, C=ClientName, D=Phone,
//                E=CarType, F=NumCars, G=PickUpFrom, H=Remarks,
//                I=StaffName, J=Timestamp

// Sheet columns: A=ID, B=Plate, C=CarType, D=ClientName, E=Phone,
//                F=PickupDate, G=ReturnDate, H=PickUpFrom, I=Remarks,
//                J=StaffName, K=Timestamp

function getOrCreateReservationsSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh   = ss.getSheetByName(RESERVATIONS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(RESERVATIONS_SHEET);
    sh.getRange(1,1,1,11).setValues([[
      "ID","Plate","Car Type","Client Name","Phone",
      "Pickup Date","Return Date","Pick Up From","Remarks","Staff Name","Timestamp"
    ]]).setFontWeight("bold");
  }
  return sh;
}

function getReservations(month, year) {
  const sh   = getOrCreateReservationsSheet();
  const rows = sh.getDataRange().getValues();
  if (rows.length <= 1) return { success: true, data: [] };
  const tz   = SpreadsheetApp.openById(SPREADSHEET_ID).getSpreadsheetTimeZone();
  const data = rows.slice(1).map(row => ({
    id:         row[0]  || "",
    plate:      row[1]  || "",
    carType:    row[2]  || "",
    client:     row[3]  || "",
    phone:      row[4]  || "",
    pickupDate: row[5]  ? Utilities.formatDate(new Date(row[5]),  tz, "yyyy-MM-dd") : "",
    returnDate: row[6]  ? Utilities.formatDate(new Date(row[6]),  tz, "yyyy-MM-dd") : "",
    pickUpFrom: row[7]  || "",
    remarks:    row[8]  || "",
    staffName:  row[9]  || "",
    timestamp:  row[10] ? Utilities.formatDate(new Date(row[10]), tz, "yyyy-MM-dd'T'HH:mm:ss") : "",
  })).filter(r => r.id && r.pickupDate);

  if (month && year) {
    const m = String(month).padStart(2,"0");
    const y = String(year);
    return { success: true, data: data.filter(r => r.pickupDate.startsWith(`${y}-${m}`) || r.returnDate.startsWith(`${y}-${m}`)) };
  }
  return { success: true, data };
}

function addReservation(body) {
  if (!body.client)     throw new Error("Client name is required");
  if (!body.pickupDate) throw new Error("Pickup date is required");
  if (!body.returnDate) throw new Error("Return date is required");
  const sh   = getOrCreateReservationsSheet();
  const tz   = SpreadsheetApp.openById(SPREADSHEET_ID).getSpreadsheetTimeZone();
  const now  = new Date();
  const year = Utilities.formatDate(now, tz, "yyyy");
  const mon  = Utilities.formatDate(now, tz, "MM");
  const prefix = `RES/SC/${year}/${mon}/`;

  // Find highest number for this month prefix
  const rows = sh.getDataRange().getValues();
  let maxNum = 99;
  rows.slice(1).forEach(row => {
    const id = String(row[0] || "");
    if (id.startsWith(prefix)) {
      const num = parseInt(id.replace(prefix, ""), 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  });
  const id = prefix + (maxNum + 1);

  sh.appendRow([
    id,
    body.plate      || "",
    body.carType    || "",
    body.client,
    body.phone      || "",
    new Date(body.pickupDate),
    new Date(body.returnDate),
    body.pickUpFrom || "",
    body.remarks    || "",
    body.staffName  || "",
    now,
  ]);
  return { success: true, id };
}

function editReservation(body) {
  if (!body.id) throw new Error("ID is required");
  const sh   = getOrCreateReservationsSheet();
  const rows = sh.getDataRange().getValues();
  const idx  = rows.findIndex(r => r[0] === body.id);
  if (idx < 1) throw new Error("Reservation not found");
  if (body.plate      !== undefined) sh.getRange(idx+1, 2).setValue(body.plate);
  if (body.carType    !== undefined) sh.getRange(idx+1, 3).setValue(body.carType);
  if (body.client)                   sh.getRange(idx+1, 4).setValue(body.client);
  if (body.phone      !== undefined) sh.getRange(idx+1, 5).setValue(body.phone);
  if (body.pickupDate)               sh.getRange(idx+1, 6).setValue(new Date(body.pickupDate));
  if (body.returnDate)               sh.getRange(idx+1, 7).setValue(new Date(body.returnDate));
  if (body.pickUpFrom !== undefined) sh.getRange(idx+1, 8).setValue(body.pickUpFrom);
  if (body.remarks    !== undefined) sh.getRange(idx+1, 9).setValue(body.remarks);
  return { success: true };
}

function deleteReservation(body) {
  if (!body.id) throw new Error("ID is required");
  const sh   = getOrCreateReservationsSheet();
  const rows = sh.getDataRange().getValues();
  const idx  = rows.findIndex(r => r[0] === body.id);
  if (idx < 1) throw new Error("Reservation not found");
  sh.deleteRow(idx + 1);
  return { success: true };
}

// ── Vehicle Replacement ───────────────────────────────────────
function replaceVehicle(body) {
  if (!body.originalPlate) throw new Error("Original plate is required");
  if (!body.replacePlate)  throw new Error("Replacement plate is required");
  if (!body.staffName)     throw new Error("Staff name is required");

  const tz      = SpreadsheetApp.openById(SPREADSHEET_ID).getSpreadsheetTimeZone();
  const today   = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
  const note    = `Replacement for ${body.originalPlate}. ${body.remarks || ""}`.trim();
  const origNote= `Broken down — replaced by ${body.replacePlate}. ${body.remarks || ""}`.trim();

  // 1. Handle original car based on choice
  if (body.originalAction === "available") {
    clearFleetRow(body.originalPlate, "Available", { remarks: origNote });
    addHistory({
      plate: body.originalPlate, type: body.originalType || "", action: "Marked Available",
      remarks: origNote, location: body.location || "", staffName: body.staffName,
    });
  } else {
    clearFleetRow(body.originalPlate, "Maintenance", {
      remarks: origNote, garage: body.garage || "",
    });
    addHistory({
      plate: body.originalPlate, type: body.originalType || "", action: "Sent to Maintenance",
      remarks: origNote, garage: body.garage || "",
      location: body.location || "", staffName: body.staffName,
    });
  }

  // 2. Check out replacement car to same client with same details
  updateFleetRow(body.replacePlate, {
    status:        "Rented",
    currentClient: body.client,
    clientPhone:   body.clientPhone  || "",
    bookedFrom:    body.bookedFrom   || today,
    returnDate:    body.returnDate   || "",
    amount:        body.amount       || "",
    currency:      body.currency     || "TZS",
    paymentStatus: body.paymentStatus|| "Paid",
    amountPaid:    body.amountPaid   || "",
    driver:        body.driver       || "",
    location:      body.location     || "",
    fuelOut:       "",
    remarks:       note,
    checkedOutBy:  body.staffName,
  });
  addHistory({
    plate:       body.replacePlate,
    type:        body.replaceType || "",
    action:      "Checked Out",
    client:      body.client,
    clientPhone: body.clientPhone  || "",
    bookedFrom:  body.bookedFrom   || today,
    returnDate:  body.returnDate   || "",
    location:    body.location     || "",
    remarks:     note,
    staffName:   body.staffName,
    amount:      body.amount       || "",
    currency:    body.currency     || "TZS",
    paymentStatus: body.paymentStatus || "Paid",
    amountPaid:  body.amountPaid   || "",
    driver:      body.driver       || "",
    fuelOut:     "",
  });

  return { success: true };
}

// ── Blacklist ─────────────────────────────────────────────────
// Sheet columns: A=ID, B=Name, C=Phone, D=LicenseNo, E=ImageUrl, F=AddedBy, G=Timestamp

const BLACKLIST_SHEET        = "Blacklist";
const BLACKLIST_DRIVE_FOLDER = "SmilesCars/Blacklist Photos";

function getBlacklistFolder() {
  const parts  = BLACKLIST_DRIVE_FOLDER.split("/");
  let   folder = DriveApp.getRootFolder();
  for (const part of parts) {
    const found = folder.getFoldersByName(part);
    folder = found.hasNext() ? found.next() : folder.createFolder(part);
  }
  return folder;
}

function uploadBlacklistImage(body) {
  if (!body.imageBase64) throw new Error("No image data provided");
  if (!body.filename)    throw new Error("Filename required");
  const folder = getBlacklistFolder();
  const blob   = Utilities.newBlob(
    Utilities.base64Decode(body.imageBase64),
    body.mimeType || "image/jpeg",
    body.filename
  );
  const file   = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const fileId = file.getId();
  const url = `https://lh3.googleusercontent.com/d/${fileId}`;
  return { success: true, url, fileId };
}

function getOrCreateBlacklistSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh   = ss.getSheetByName(BLACKLIST_SHEET);
  if (!sh) {
    sh = ss.insertSheet(BLACKLIST_SHEET);
    sh.getRange(1,1,1,8).setValues([["ID","Name","Phone","License No","Image URL","File ID","Added By","Timestamp"]]).setFontWeight("bold");
  }
  return sh;
}

function getBlacklist() {
  const sh   = getOrCreateBlacklistSheet();
  const rows = sh.getDataRange().getValues();
  if (rows.length <= 1) return { success: true, data: [] };
  const tz   = SpreadsheetApp.openById(SPREADSHEET_ID).getSpreadsheetTimeZone();
  return {
    success: true,
    data: rows.slice(1).map(row => ({
      id:        row[0] || "",
      name:      row[1] || "",
      phone:     row[2] || "",
      licenseNo: row[3] || "",
      imageUrl:  row[4] || "",
      fileId:    row[5] || "",
      addedBy:   row[6] || "",
      timestamp: row[7] ? Utilities.formatDate(new Date(row[7]), tz, "yyyy-MM-dd'T'HH:mm:ss") : "",
    })).filter(r => r.id)
  };
}

function addToBlacklist(body) {
  if (!body.name && !body.phone && !body.licenseNo)
    throw new Error("At least name, phone or license number is required.");
  const sh = getOrCreateBlacklistSheet();
  const id = "BL-" + Utilities.getUuid().split("-")[0].toUpperCase();
  const ts = new Date();
  sh.appendRow([id, body.name||"", body.phone||"", body.licenseNo||"", body.imageUrl||"", body.fileId||"", body.addedBy||"", ts]);
  return { success: true, id };
}

function deleteFromBlacklist(body) {
  if (!body.id) throw new Error("ID is required");
  const sh   = getOrCreateBlacklistSheet();
  const rows = sh.getDataRange().getValues();
  const idx  = rows.findIndex(r => r[0] === body.id);
  if (idx < 1) throw new Error("Entry not found");
  if (body.fileId) { try { DriveApp.getFileById(body.fileId).setTrashed(true); } catch {} }
  sh.deleteRow(idx + 1);
  return { success: true };
}

// ── Signature Storage (Drive-based) ─────────────────────────────────────────
// Signature images are saved as real Drive files (same pattern as Blacklist
// photos above), with only the small resulting URL kept in Script Properties.
// IMPORTANT: Script Properties has a ~9KB limit per value — a raw base64 PNG
// signature can exceed that, which is why these are files, not property values.
const SIGNATURES_DRIVE_FOLDER = "SmilesCars/Signatures";

function getSignaturesFolder() {
  const parts  = SIGNATURES_DRIVE_FOLDER.split("/");
  let   folder = DriveApp.getRootFolder();
  for (const part of parts) {
    const found = folder.getFoldersByName(part);
    folder = found.hasNext() ? found.next() : folder.createFolder(part);
  }
  return folder;
}

function uploadSignatureImage_(base64, filename) {
  const folder = getSignaturesFolder();
  const blob   = Utilities.newBlob(Utilities.base64Decode(base64), "image/png", filename);
  const file   = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const fileId = file.getId();
  return { fileId, url: `https://lh3.googleusercontent.com/d/${fileId}` };
}

// Strips a "data:image/png;base64," prefix if present — the frontend sometimes
// sends a full data URL, sometimes just the raw base64.
function stripDataUrlPrefix_(s) {
  const idx = s.indexOf(",");
  return (s.indexOf("base64,") !== -1 && idx !== -1) ? s.slice(idx + 1) : s;
}

// ── Client Signatures (QR code / signature pad on RentalAgreementModal) ────
// The URL pointer auto-expires after 24h since it's only needed long enough
// to generate the one PDF; the Drive file itself is small and harmless to leave.
function getSignature(e) {
  const token = e.parameter.token || "";
  if (!token) throw new Error("Missing token");
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty("SIG_URL_" + token);
  const ts  = props.getProperty("SIG_TS_" + token);
  if (!url || !ts) return { success: true, signature: null };
  const ageMs = Date.now() - Number(ts);
  if (ageMs > 24 * 60 * 60 * 1000) {
    props.deleteProperty("SIG_URL_" + token);
    props.deleteProperty("SIG_TS_" + token);
    return { success: true, signature: null };
  }
  return { success: true, signature: url };
}

function storeSignature(body) {
  if (!body.token || !body.signature) throw new Error("Missing token or signature");
  const uploaded = uploadSignatureImage_(stripDataUrlPrefix_(body.signature), "client-" + body.token + ".png");
  const props = PropertiesService.getScriptProperties();
  props.setProperty("SIG_URL_" + body.token, uploaded.url);
  props.setProperty("SIG_TS_" + body.token, String(Date.now()));
  return { success: true, url: uploaded.url };
}

// ── Staff Signatures (persist indefinitely, keyed by staff name) ───────────
// Captured once per staff member, then reused automatically on every agreement.
function getStaffSignature(e) {
  const staffName = (e.parameter.staffName || "").trim().toLowerCase();
  if (!staffName) throw new Error("Missing staffName");
  const url = PropertiesService.getScriptProperties().getProperty("STAFFSIG_URL_" + staffName);
  return { success: true, signature: url || null };
}

function storeStaffSignature(body) {
  const staffName = (body.staffName || "").trim().toLowerCase();
  if (!staffName || !body.signature) throw new Error("Missing staffName or signature");
  const props = PropertiesService.getScriptProperties();
  // Trash the previous file so re-signing (or switching from draw to upload)
  // doesn't leave orphaned copies behind in Drive.
  const oldFileId = props.getProperty("STAFFSIG_FILEID_" + staffName);
  if (oldFileId) { try { DriveApp.getFileById(oldFileId).setTrashed(true); } catch (err) {} }
  const uploaded = uploadSignatureImage_(stripDataUrlPrefix_(body.signature), staffName.replace(/[^a-z0-9]/gi, "_") + ".png");
  props.setProperty("STAFFSIG_URL_" + staffName, uploaded.url);
  props.setProperty("STAFFSIG_FILEID_" + staffName, uploaded.fileId);
  return { success: true, url: uploaded.url };
}

// Clears a staff member's stored signature entirely — e.g. when they resign.
// Trashes the Drive file too, not just the pointer, so it doesn't linger.
function deleteStaffSignature(body) {
  const staffName = (body.staffName || "").trim().toLowerCase();
  if (!staffName) throw new Error("Missing staffName");
  const props = PropertiesService.getScriptProperties();
  const fileId = props.getProperty("STAFFSIG_FILEID_" + staffName);
  if (fileId) { try { DriveApp.getFileById(fileId).setTrashed(true); } catch (err) {} }
  props.deleteProperty("STAFFSIG_URL_" + staffName);
  props.deleteProperty("STAFFSIG_FILEID_" + staffName);
  return { success: true };
}

// ── Rental Agreement PDF storage ────────────────────────────────────────────
// Saves each generated agreement to Drive and logs it in an "Agreements" sheet
// (same folder-path pattern as the Blacklist photo upload above).
const AGREEMENTS_DRIVE_FOLDER = "SmilesCars/Rental Agreements";
const AGREEMENTS_SHEET        = "Agreements";

function getAgreementsFolder() {
  const parts  = AGREEMENTS_DRIVE_FOLDER.split("/");
  let   folder = DriveApp.getRootFolder();
  for (const part of parts) {
    const found = folder.getFoldersByName(part);
    folder = found.hasNext() ? found.next() : folder.createFolder(part);
  }
  return folder;
}

// ── Admin Panel: one-click full backup snapshot ─────────────────────────────
// Copies the ENTIRE spreadsheet (every tab, as-is right now) into a dated
// Drive folder — a one-click backup snapshot.
function createBackupSnapshot() {
  const parts  = "SmilesCars/Backups".split("/");
  let   folder = DriveApp.getRootFolder();
  for (const part of parts) {
    const found = folder.getFoldersByName(part);
    folder = found.hasNext() ? found.next() : folder.createFolder(part);
  }
  const tz = SpreadsheetApp.openById(SPREADSHEET_ID).getSpreadsheetTimeZone();
  const ts = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd_HH-mm");
  const original = DriveApp.getFileById(SPREADSHEET_ID);
  const copy = original.makeCopy("SmilesCars Fleet Backup - " + ts, folder);
  return { success: true, url: copy.getUrl(), name: copy.getName() };
}

// ── Export audit log ─────────────────────────────────────────────────────
// Every data export (Fleet list, etc.) gets recorded — who, when, how many
// rows, and what filters were active (did they export everything, or just a
// filtered slice?). This is the direct response to "someone could quietly
// export the client/fleet list" — it doesn't prevent that, but it makes it
// traceable, and the exported file itself also carries a visible + metadata
// watermark (see exportToExcel on the frontend) so a leaked file can be
// traced back to who pulled it.
function getOrCreateExportLogSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(EXPORT_LOG_SHEET);
  if (!sh) {
    sh = ss.insertSheet(EXPORT_LOG_SHEET);
    sh.getRange(1, 1, 1, 6).setValues([["Timestamp", "Staff", "Role", "Export Type", "Row Count", "Filters"]]).setFontWeight("bold");
  }
  return sh;
}

function logExport(body) {
  if (!body.staffName) throw new Error("Staff name is required");
  const ts = new Date();
  getOrCreateExportLogSheet_().appendRow([
    ts, body.staffName, body.role || "", body.exportType || "Fleet",
    body.rowCount || 0, body.filters || "",
  ]);
  return { success: true };
}

// Admin Panel System tab reads recent exports from here.
function getExportLog() {
  const sh = getOrCreateExportLogSheet_();
  const rows = sh.getDataRange().getValues().slice(1).filter(r => r[0]);
  const entries = rows.map(r => ({
    timestamp: toISOTimestamp_(r[0]), staffName: r[1], role: r[2],
    exportType: r[3], rowCount: r[4], filters: r[5],
  })).reverse().slice(0, 50); // most recent 50
  return { success: true, entries };
}

function uploadAgreement(body) {
  if (!body.base64 || !body.refNo) throw new Error("Missing refNo or PDF data");
  const folder   = getAgreementsFolder();
  const safeName = String(body.refNo).replace(/\//g, "-"); // refs contain "/", not valid to lean on for a filename
  const blob     = Utilities.newBlob(Utilities.base64Decode(body.base64), "application/pdf", safeName + ".pdf");
  const file     = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const url = file.getUrl();

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(AGREEMENTS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(AGREEMENTS_SHEET);
    sh.getRange(1,1,1,6).setValues([["Ref","Plate","Client","Staff","Timestamp","Drive URL"]]).setFontWeight("bold");
  }
  sh.appendRow([body.refNo, body.plate||"", body.client||"", body.staffName||"", new Date(), url]);
  return { success: true, url };
}

// Sequential agreement Ref, format SC/RA/YYYY/MM/1001+ — resets to 1001 each
// month, same pattern as the existing Reservations ID scheme (RES/SC/YYYY/MM/100+).
// Derived by scanning the "Agreements" sheet for the highest existing number
// this month, rather than a separate counter, so it can never drift out of
// sync with what's actually been logged.
function getNextAgreementRef() {
  const tz    = SpreadsheetApp.openById(SPREADSHEET_ID).getSpreadsheetTimeZone();
  const now   = new Date();
  const year  = Utilities.formatDate(now, tz, "yyyy");
  const month = Utilities.formatDate(now, tz, "MM");
  const prefix = "SC/RA/" + year + "/" + month + "/";

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName(AGREEMENTS_SHEET);
  let maxNum = 1000;
  if (sh) {
    const refs = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 0), 1).getValues();
    refs.forEach(row => {
      const ref = String(row[0] || "");
      if (ref.indexOf(prefix) === 0) {
        const num = parseInt(ref.slice(prefix.length), 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });
  }
  return { success: true, refNo: prefix + (maxNum + 1) };
}
