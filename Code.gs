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
    if (action === "getFleet")   return respond(getFleet());
    if (action === "getHistory") return respond(getHistory());
    if (action === "getConfig")  return respond(getConfig());
    if (action === "getSold")    return respond(getSold());
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
    return respond({ error: "Unknown action: " + action });
  } catch (err) {
    return respond({ error: err.message });
  }
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
    bookedFrom:     row[6]  || "",
    returnDate:     row[7]  || "",
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
  const data = rows.slice(1).reverse().map(row => ({
    timestamp:     row[0]  ? new Date(row[0]).toISOString() : "",
    plate:         row[1]  || "",
    type:          row[2]  || "",
    action:        row[3]  || "",
    client:        row[4]  || "",
    clientPhone:   row[5]  || "",
    bookedFrom:    row[6]  || "",
    returnDate:    row[7]  || "",
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

function markSold(body) {
  if (!body.plate)      throw new Error("Plate is required");
  if (!body.staffName)  throw new Error("Staff name is required");

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
function verifyStaff(body) {
  if (!body.name || !body.password) throw new Error("Name and password required");
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(CONFIG_SHEET);
  const rows  = sheet.getDataRange().getValues();
  const match = rows.find(r => r[0] === "Staff" && r[1] === body.name);
  if (!match) return { success: false, message: "Staff not found" };
  if (!match[2]) return { success: false, message: "No password set for this account" };
  if (match[2].toString() !== body.password.toString()) return { success: false, message: "Incorrect password" };
  return { success: true };
}

function addStaff(body) {
  if (!body.name) throw new Error("Name is required");
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(CONFIG_SHEET);
  sheet.appendRow(["Staff", body.name, body.password || ""]);
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
    client: row[4], clientPhone: row[5], bookedFrom: row[6], returnDate: row[7],
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
  const oldReturnDate = row[7];

  updateFleetRow(body.plate, { returnDate: body.returnDate, remarks: body.remarks || "" });

  addHistory({
    plate: body.plate, type: body.type || row[1], action: "Booking Extended",
    client: row[4], clientPhone: row[5], bookedFrom: row[6], returnDate: body.returnDate,
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
  addHistory({ plate: body.plate, type: body.type || "", action: "Marked Available", remarks: body.remarks || "", location: body.location || "", staffName: body.staffName });
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

// ── One-time setup helpers ──────────────────────────────────────

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

  ss.getSheetByName(CONFIG_SHEET).getRange(1, 3).setValue("Password").setFontWeight("bold");

  // Create Sold sheet if missing
  let sold = ss.getSheetByName(SOLD_SHEET);
  if (!sold) sold = ss.insertSheet(SOLD_SHEET);
  sold.getRange(1, 1, 1, 5).setValues([[
    "Timestamp","Plate","Type","Remarks","Staff Name"
  ]]).setFontWeight("bold");
}
