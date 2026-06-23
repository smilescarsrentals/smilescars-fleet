// ============================================================
//  SMILES FLEET MANAGER — Google Apps Script Backend v6
//  New: Currency, Checkout fines, Payment status, Sold cars,
//       Move car (reuses Location Updated), Expiring/Unpaid views
// ============================================================

const SPREADSHEET_ID = "1xK1tVQa1bHR-FVb1Tr2MjZdtm3_QHt1PdulfVLgoFtc";
const FLEET_SHEET    = "Fleet";
const HISTORY_SHEET  = "History";
const CONFIG_SHEET   = "Config";
const SOLD_SHEET     = "Sold";

function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Router ────────────────────────────────────────────────────
function doGet(e) {
  const action = e.parameter.action;
  try {
    if (action === "getFleet")     return respond(getFleet());
    if (action === "getHistory")   return respond(getHistory());
    if (action === "getConfig")    return respond(getConfig());
    if (action === "getSold")      return respond(getSold());
    if (action === "getSubHire")   return respond(getSubHire());
    if (action === "getDashboard") return respond(getDashboard());
    return respond({ error: "Unknown action: " + action });
  } catch (err) {
    return respond({ error: err.message });
  }
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const action = body.action;
  try {
    if (action === "verifyStaff")     return respond(verifyStaff(body));
    if (action === "checkOut")        return respond(checkOut(body));
    if (action === "markReturned")    return respond(markReturned(body));
    if (action === "extendBooking")   return respond(extendBooking(body));
    if (action === "setMaintenance")  return respond(setMaintenance(body));
    if (action === "setAvailable")    return respond(setAvailable(body));
    if (action === "updateLocation")  return respond(updateLocation(body));
    if (action === "updatePayment")   return respond(updatePayment(body));
    if (action === "markSold")        return respond(markSold(body));
    if (action === "addStaff")        return respond(addStaff(body));
    if (action === "addLocation")     return respond(addConfigItem("Location", body.name));
    if (action === "addGarage")       return respond(addConfigItem("Garage",   body.name));
    if (action === "addSubHire")           return respond(addSubHire(body));
    if (action === "returnSubHire")        return respond(returnSubHire(body));
    if (action === "updateSubHirePayment") return respond(updateSubHirePayment(body));
    return respond({ error: "Unknown action: " + action });
  } catch (err) {
    return respond({ error: err.message });
  }
}

// ── Date helper ───────────────────────────────────────────────
// Google Sheets stores dates as Date objects. getValues() returns them as
// JS Date objects which toISOString() shifts by timezone offset (Tanzania = UTC+3,
// so midnight local becomes 21:00 previous day UTC). Fix: format using the
// spreadsheet's own timezone so the date is always read back correctly.
function fmtDate(val) {
  if (!val) return "";
  if (val instanceof Date) {
    const tz = SpreadsheetApp.openById(SPREADSHEET_ID).getSpreadsheetTimeZone();
    return Utilities.formatDate(val, tz, "yyyy-MM-dd");
  }
  // Already a string — strip any time component just in case
  return String(val).split("T")[0];
}

// ── Fleet Sheet ───────────────────────────────────────────────
// A=Plate B=Type C=Location D=Status E=CurrentClient F=ClientPhone
// G=BookedFrom H=ReturnDate I=Remarks J=FuelOut K=Amount L=Currency
// M=Garage N=PaymentStatus O=AmountPaid P=PoliceFineOut Q=ParkingFineOut R=KmOut

function getFleet() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(FLEET_SHEET);
  const rows  = sheet.getDataRange().getValues();
  const data  = rows.slice(1).map((row, i) => ({
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
  }));
  return { success: true, data };
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
    paymentStatus: 14, amountPaid: 15, policeFineOut: 16, parkingFineOut: 17, kmOut: 18,
  };
  Object.keys(map).forEach(key => {
    if (fields[key] !== undefined) sheet.getRange(rowIndex, map[key]).setValue(fields[key]);
  });
}

function clearFleetRow(plate, status, extra) {
  updateFleetRow(plate, Object.assign({
    status, currentClient: "", clientPhone: "", bookedFrom: "", returnDate: "",
    remarks: (extra && extra.remarks) || "", fuelOut: "", amount: "", currency: "",
    garage: "", paymentStatus: "", amountPaid: "", policeFineOut: "", parkingFineOut: "", kmOut: "",
  }, extra || {}));
}

// ── History Sheet ─────────────────────────────────────────────
// A=Timestamp B=Plate C=Type D=Action E=Client F=ClientPhone G=BookedFrom
// H=ReturnDate I=Location J=Remarks K=StaffName L=FuelOut M=FuelIn
// N=Amount O=Currency P=PoliceFine Q=ParkingFine R=Garage
// S=PaymentStatus T=AmountPaid

function addHistory(entry) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(HISTORY_SHEET);
  sheet.appendRow([
    new Date(),
    entry.plate          || "",
    entry.type            || "",
    entry.action           || "",
    entry.client             || "",
    entry.clientPhone         || "",
    entry.bookedFrom           || "",
    entry.returnDate             || "",
    entry.location                 || "",
    entry.remarks                   || "",
    entry.staffName                   || "",
    entry.fuelOut                       || "",
    entry.fuelIn                          || "",
    entry.amount                            || "",
    entry.currency                            || "",
    entry.policeFine                            || "",
    entry.parkingFine                             || "",
    entry.garage                                    || "",
    entry.paymentStatus                               || "",
    entry.amountPaid                                    || "",
    entry.kmOut                                           || "",
    entry.kmIn                                              || "",
  ]);
}

function getHistory() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(HISTORY_SHEET);
  const rows  = sheet.getDataRange().getValues();
  if (rows.length <= 1) return { success: true, data: [] };
  const tz = SpreadsheetApp.openById(SPREADSHEET_ID).getSpreadsheetTimeZone();
  const data = rows.slice(1).reverse().map(row => ({
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
  }));
  return { success: true, data };
}

// ── Sold Sheet ────────────────────────────────────────────────
// A=Timestamp B=Plate C=Type D=BuyerName E=BuyerPhone F=SalePrice
// G=Currency H=SaleDate I=Remarks J=StaffName

function getSold() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SOLD_SHEET);
  const rows  = sheet.getDataRange().getValues();
  if (rows.length <= 1) return { success: true, data: [] };
  const data = rows.slice(1).reverse().map(row => ({
    timestamp:   row[0] ? new Date(row[0]).toISOString() : "",
    plate:       row[1] || "",
    type:        row[2] || "",
    remarks:     row[3] || "",
    staffName:   row[4] || "",
  }));
  return { success: true, data };
}

function requireManager(staffName) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(CONFIG_SHEET);
  const rows  = sheet.getDataRange().getValues();
  const match = rows.find(r => r[0] === "Staff" && r[1] === staffName);
  const role  = match ? (match[3] || "Staff") : "Staff";
  if (role !== "Manager") throw new Error("This action requires a Manager account.");
}

function markSold(body) {
  if (!body.plate)      throw new Error("Plate is required");
  if (!body.staffName)  throw new Error("Staff name is required");
  requireManager(body.staffName);

  const { sheet, rowIndex } = findRow(body.plate);
  const row = sheet.getRange(rowIndex, 1, 1, 2).getValues()[0];
  const type = row[1];

  // Add to Sold sheet
  const soldSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SOLD_SHEET);
  soldSheet.appendRow([
    new Date(), body.plate, type, body.remarks || "", body.staffName,
  ]);

  // Remove from Fleet sheet entirely
  sheet.deleteRow(rowIndex);

  // Log in history
  addHistory({
    plate: body.plate, type, action: "Sold",
    remarks: body.remarks || "", staffName: body.staffName,
  });

  return { success: true };
}

// ── Staff Login ───────────────────────────────────────────────
// Config sheet: Col A = Type, Col B = Name/Value, Col C = Password, Col D = Role (Staff rows)
function verifyStaff(body) {
  if (!body.name || !body.password) throw new Error("Name and password required");
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(CONFIG_SHEET);
  const rows  = sheet.getDataRange().getValues();
  const match = rows.find(r => r[0] === "Staff" && r[1] === body.name);
  if (!match) return { success: false, message: "Staff not found" };
  if (!match[2]) return { success: false, message: "No password set for this account" };
  if (match[2].toString() !== body.password.toString()) return { success: false, message: "Incorrect password" };
  const role = match[3] || "Staff";
  return { success: true, role };
}

function addStaff(body) {
  if (!body.name) throw new Error("Name is required");
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(CONFIG_SHEET);
  sheet.appendRow(["Staff", body.name, body.password || "", body.role || "Staff"]);
  return { success: true };
}

// ── Actions ───────────────────────────────────────────────────

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
    kmOut: body.kmOut || "",
  });

  addHistory({
    plate: body.plate, type: body.type, action: "Checked Out", client: body.client,
    clientPhone: body.clientPhone || "", bookedFrom: body.bookedFrom || "",
    returnDate: body.returnDate || "", location: body.location || "",
    remarks: body.remarks || "", staffName: body.staffName,
    fuelOut: body.fuelOut || "", amount: body.amount || "", currency: body.currency || "TZS",
    policeFine: body.policeFine || "", parkingFine: body.parkingFine || "",
    paymentStatus: body.paymentStatus || "Unpaid", amountPaid: body.amountPaid || "",
    kmOut: body.kmOut || "",
  });

  return { success: true };
}

function markReturned(body) {
  if (!body.plate)     throw new Error("Plate is required");
  if (!body.staffName) throw new Error("Staff name is required");

  const { sheet, rowIndex } = findRow(body.plate);
  const row = sheet.getRange(rowIndex, 1, 1, 18).getValues()[0];

  clearFleetRow(body.plate, "Available", { remarks: body.remarks || "" });

  addHistory({
    plate: body.plate, type: body.type || row[1], action: "Returned",
    client: row[4], clientPhone: row[5], bookedFrom: fmtDate(row[6]),
    returnDate: body.actualReturn || fmtDate(row[7]),
    location: body.location || row[2], remarks: body.remarks || "", staffName: body.staffName,
    fuelOut: row[9], fuelIn: body.fuelIn || "",
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
  const row = sheet.getRange(rowIndex, 1, 1, 18).getValues()[0];
  const oldReturnDate = fmtDate(row[7]);

  updateFleetRow(body.plate, { returnDate: body.returnDate, remarks: body.remarks || "" });

  addHistory({
    plate: body.plate, type: body.type || row[1], action: "Booking Extended",
    client: row[4], clientPhone: row[5], bookedFrom: fmtDate(row[6]), returnDate: body.returnDate,
    location: body.location || row[2],
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
  addHistory({ plate: body.plate, type: body.type || "", action: "Location Updated", location: body.location, staffName: body.staffName || "" });
  return { success: true };
}

function updatePayment(body) {
  if (!body.plate)         throw new Error("Plate is required");
  if (!body.paymentStatus) throw new Error("Payment status is required");
  if (!body.staffName)     throw new Error("Staff name is required");
  requireManager(body.staffName);

  updateFleetRow(body.plate, {
    paymentStatus: body.paymentStatus,
    amountPaid: body.amountPaid || "",
  });

  const { sheet, rowIndex } = findRow(body.plate);
  const row = sheet.getRange(rowIndex, 1, 1, 18).getValues()[0];

  addHistory({
    plate: body.plate, type: body.type || row[1], action: "Payment Updated",
    client: row[4], remarks: body.remarks || "", staffName: body.staffName,
    paymentStatus: body.paymentStatus, amountPaid: body.amountPaid || "",
  });

  return { success: true };
}

// ── Config ────────────────────────────────────────────────────

function getConfig() {
  const sheet     = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(CONFIG_SHEET);
  const rows      = sheet.getDataRange().getValues();
  const staff     = rows.filter(r => r[0] === "Staff").map(r => r[1]).filter(Boolean);
  const locations = rows.filter(r => r[0] === "Location").map(r => r[1]).filter(Boolean);
  const garages   = rows.filter(r => r[0] === "Garage").map(r => r[1]).filter(Boolean);
  return { success: true, staff, locations, garages };
}

function addConfigItem(type, name) {
  if (!name) throw new Error("Name is required");
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(CONFIG_SHEET);
  sheet.appendRow([type, name]);
  return { success: true };
}

// ── Dashboard ─────────────────────────────────────────────────
// Computes today's activity + outstanding totals server-side
function getDashboard() {
  const tz = Session.getScriptTimeZone();
  const today = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");

  const fleetSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(FLEET_SHEET);
  const fleetRows  = fleetSheet.getDataRange().getValues().slice(1);

  const histSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(HISTORY_SHEET);
  const histRows  = histSheet.getDataRange().getValues().slice(1);

  let checkedOutToday = 0, returnedToday = 0, dueToday = 0, overdue = 0;
  let collectedToday = { TZS: 0, USD: 0 };
  let outstanding = { TZS: 0, USD: 0 };
  const recentActivity = [];

  // From Fleet: due today / overdue / outstanding balance
  fleetRows.forEach(row => {
    const status = row[3];
    const returnDate = fmtDate(row[7]);
    const currency = row[11] || "TZS";
    const amount = Number(row[10]) || 0;
    const amountPaid = Number(row[14]) || 0;
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

  // From History: today's checkouts / returns / collections + recent feed
  histRows.forEach(row => {
    const ts = row[0] ? Utilities.formatDate(new Date(row[0]), tz, "yyyy-MM-dd") : "";
    const action = row[3];
    const currency = row[14] || "TZS";
    const amountPaid = Number(row[19]) || 0;

    if (ts === today) {
      if (action === "Checked Out") checkedOutToday++;
      if (action === "Returned")    returnedToday++;
      if (amountPaid > 0) collectedToday[currency] = (collectedToday[currency] || 0) + amountPaid;
    }
  });

  // Recent activity feed — last 15 entries overall
  const sorted = histRows.slice().reverse().slice(0, 15);
  sorted.forEach(row => {
    recentActivity.push({
      timestamp: row[0] ? new Date(row[0]).toISOString() : "",
      plate: row[1] || "", action: row[3] || "", client: row[4] || "", staffName: row[10] || "",
    });
  });

  return {
    success: true,
    today,
    checkedOutToday, returnedToday, dueToday, overdue,
    collectedToday, outstanding, recentActivity,
  };
}

// ── Unpaid Bookings Email Reminder ──────────────────────────────
// Run setupDailyReminder() ONCE to schedule this to run automatically every day.
// Edit REMINDER_EMAILS below first.

const REMINDER_EMAILS = ["owner@smilescars.co.tz"]; // ← change to real recipient(s)

function sendUnpaidReminder() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(FLEET_SHEET);
  const rows  = sheet.getDataRange().getValues();
  const unpaid = rows.slice(1).filter(r => r[3] === "Rented" && (r[13] === "Unpaid" || r[13] === "Partial Paid"));

  if (unpaid.length === 0) return; // nothing to report

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
    MailApp.sendEmail({
      to: email,
      subject: "SmilesCars: " + unpaid.length + " unpaid booking(s) — " + new Date().toDateString(),
      htmlBody: html,
    });
  });
}

// Run this ONCE manually to turn on the daily 8am email reminder
function setupDailyReminder() {
  // Remove any existing triggers for this function first (avoid duplicates)
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "sendUnpaidReminder") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("sendUnpaidReminder")
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .create();
  SpreadsheetApp.getUi().alert("✅ Daily 8am unpaid-bookings email reminder is now active.");
}



function updateHeaders() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  ss.getSheetByName(FLEET_SHEET).getRange(1, 1, 1, 18).setValues([[
    "Plate","Type","Location","Status","Current Client","Client Phone",
    "Booked From","Return Date","Remarks","Fuel Out","Amount","Currency",
    "Garage","Payment Status","Amount Paid","Police Fine (Out)","Parking Fine (Out)","KM Out"
  ]]).setFontWeight("bold");

  ss.getSheetByName(HISTORY_SHEET).getRange(1, 1, 1, 22).setValues([[
    "Timestamp","Plate","Type","Action","Client","Client Phone",
    "Booked From","Return Date","Location","Remarks","Staff Name",
    "Fuel Out","Fuel In","Amount","Currency","Police Fine","Parking Fine",
    "Garage","Payment Status","Amount Paid","KM Out","KM In"
  ]]).setFontWeight("bold");

  ss.getSheetByName(CONFIG_SHEET).getRange(1, 3, 1, 2).setValues([["Password", "Role"]]).setFontWeight("bold");

  // Create Sold sheet if missing
  let sold = ss.getSheetByName(SOLD_SHEET);
  if (!sold) sold = ss.insertSheet(SOLD_SHEET);
  sold.getRange(1, 1, 1, 5).setValues([[
    "Timestamp","Plate","Type","Remarks","Staff Name"
  ]]).setFontWeight("bold");
}

// ── Sub-Hire Sheet ────────────────────────────────────────────
// Sub-Hire: cars hired from external suppliers for client jobs
// A=ID B=Status C=SupplierName D=SupplierContact E=VehicleDesc
// F=Client G=ClientPhone H=BookedFrom I=ReturnDate J=ActualReturn
// K=Location L=FuelOut M=FuelIn N=Amount O=Currency P=PaymentStatus
// Q=AmountPaid R=SupplierAmount S=SupplierCurrency T=SupplierPayStatus
// U=SupplierAmountPaid V=PoliceFine W=ParkingFine X=Remarks Y=StaffName Z=Timestamp

const SUBHIRE_SHEET = "SubHire";

function getSubHire() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SUBHIRE_SHEET);
  if (!sheet) return { success: true, data: [] };
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return { success: true, data: [] };
  const tz = SpreadsheetApp.openById(SPREADSHEET_ID).getSpreadsheetTimeZone();
  const data = rows.slice(1).map((row, i) => ({
    rowIndex:          i + 2,
    id:                row[0]  || "",
    status:            row[1]  || "Active",
    supplierName:      row[2]  || "",
    supplierContact:   row[3]  || "",
    vehicleDesc:       row[4]  || "",
    client:            row[5]  || "",
    clientPhone:       row[6]  || "",
    bookedFrom:        fmtDate(row[7]),
    returnDate:        fmtDate(row[8]),
    actualReturn:      fmtDate(row[9]),
    location:          row[10] || "",
    fuelOut:           row[11] || "",
    fuelIn:            row[12] || "",
    amount:            row[13] || "",
    currency:          row[14] || "TZS",
    paymentStatus:     row[15] || "Unpaid",
    amountPaid:        row[16] || "",
    supplierAmount:    row[17] || "",
    supplierCurrency:  row[18] || "TZS",
    supplierPayStatus: row[19] || "Unpaid",
    supplierAmountPaid:row[20] || "",
    policeFine:        row[21] || "",
    parkingFine:       row[22] || "",
    remarks:           row[23] || "",
    staffName:         row[24] || "",
    timestamp:         row[25] ? Utilities.formatDate(new Date(row[25]), tz, "yyyy-MM-dd'T'HH:mm:ss") : "",
  }));
  return { success: true, data };
}

function addSubHire(body) {
  if (!body.supplierName) throw new Error("Supplier name is required");
  if (!body.client)       throw new Error("Client name is required");
  if (!body.staffName)    throw new Error("Staff name is required");

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SUBHIRE_SHEET);
  const id    = "SH-" + new Date().getTime().toString().slice(-6);

  sheet.appendRow([
    id, "Active",
    body.supplierName, body.supplierContact || "",
    body.vehicleDesc  || "",
    body.client,       body.clientPhone     || "",
    body.bookedFrom   || "", body.returnDate || "",
    "",                // actualReturn — empty until returned
    body.location     || "",
    body.fuelOut      || "", "",  // fuelIn empty until returned
    body.amount       || "", body.currency || "TZS",
    body.paymentStatus|| "Unpaid", body.amountPaid || "",
    body.supplierAmount|| "", body.supplierCurrency || "TZS",
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

  // Update: status, actualReturn, fuelIn, paymentStatus, amountPaid, supplierPayStatus, supplierAmountPaid, remarks
  sheet.getRange(rowIndex, 2).setValue("Returned");
  sheet.getRange(rowIndex, 10).setValue(body.actualReturn || "");
  sheet.getRange(rowIndex, 13).setValue(body.fuelIn       || "");
  sheet.getRange(rowIndex, 16).setValue(body.paymentStatus|| "");
  sheet.getRange(rowIndex, 17).setValue(body.amountPaid   || "");
  sheet.getRange(rowIndex, 20).setValue(body.supplierPayStatus   || "");
  sheet.getRange(rowIndex, 21).setValue(body.supplierAmountPaid  || "");
  sheet.getRange(rowIndex, 22).setValue(body.policeFine   || "");
  sheet.getRange(rowIndex, 23).setValue(body.parkingFine  || "");
  sheet.getRange(rowIndex, 24).setValue(body.remarks      || "");

  return { success: true };
}

function updateSubHirePayment(body) {
  if (!body.id) throw new Error("Sub-hire ID is required");
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SUBHIRE_SHEET);
  const ids   = sheet.getRange("A:A").getValues().flat();
  const idx   = ids.findIndex(id => id === body.id);
  if (idx < 1) throw new Error("Sub-hire booking not found");
  const rowIndex = idx + 1;
  if (body.paymentStatus     !== undefined) sheet.getRange(rowIndex, 16).setValue(body.paymentStatus);
  if (body.amountPaid        !== undefined) sheet.getRange(rowIndex, 17).setValue(body.amountPaid);
  if (body.supplierPayStatus !== undefined) sheet.getRange(rowIndex, 20).setValue(body.supplierPayStatus);
  if (body.supplierAmountPaid!== undefined) sheet.getRange(rowIndex, 21).setValue(body.supplierAmountPaid);
  return { success: true };
}

// ── Add to router (run addSubHireRoutes() once) ───────────────
// Already added to doPost below — just deploy new version after pasting.

function setupSubHireSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(SUBHIRE_SHEET);
  if (!sh) sh = ss.insertSheet(SUBHIRE_SHEET);
  sh.getRange(1, 1, 1, 26).setValues([[
    "ID","Status","Supplier Name","Supplier Contact","Vehicle Description",
    "Client","Client Phone","Booked From","Return Date","Actual Return",
    "Location","Fuel Out","Fuel In","Amount","Currency","Payment Status","Amount Paid",
    "Supplier Amount","Supplier Currency","Supplier Pay Status","Supplier Amount Paid",
    "Police Fine","Parking Fine","Remarks","Staff Name","Timestamp"
  ]]).setFontWeight("bold");
}
