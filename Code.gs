// ============================================================
//  SMILES FLEET MANAGER — Google Apps Script Backend v4
// ============================================================

const SPREADSHEET_ID = "1xK1tVQa1bHR-FVb1Tr2MjZdtm3_QHt1PdulfVLgoFtc";
const FLEET_SHEET    = "Fleet";
const HISTORY_SHEET  = "History";
const CONFIG_SHEET   = "Config";

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
    if (action === "setGarage")       return respond(setGarage(body));
    if (action === "setAvailable")    return respond(setAvailable(body));
    if (action === "updateLocation")  return respond(updateLocation(body));
    if (action === "addStaff")        return respond(addStaff(body));
    if (action === "addLocation")     return respond(addConfigItem("Location", body.name));
    return respond({ error: "Unknown action: " + action });
  } catch (err) {
    return respond({ error: err.message });
  }
}

// ── Fleet Sheet ───────────────────────────────────────────────
// Columns: A=Plate B=Type C=Location D=Status E=CurrentClient
//          F=ClientPhone G=BookedFrom H=ReturnDate I=Remarks
//          J=FuelOut K=AmountCharged

function getFleet() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(FLEET_SHEET);
  const rows  = sheet.getDataRange().getValues();
  const data  = rows.slice(1).map((row, i) => ({
    rowIndex:      i + 2,
    plate:         row[0]  || "",
    type:          row[1]  || "",
    location:      row[2]  || "",
    status:        row[3]  || "Available",
    currentClient: row[4]  || "",
    clientPhone:   row[5]  || "",
    bookedFrom:    row[6]  || "",
    returnDate:    row[7]  || "",
    remarks:       row[8]  || "",
    fuelOut:       row[9]  || "",
    amountCharged: row[10] || "",
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
  if (fields.location      !== undefined) sheet.getRange(rowIndex, 3).setValue(fields.location);
  if (fields.status        !== undefined) sheet.getRange(rowIndex, 4).setValue(fields.status);
  if (fields.currentClient !== undefined) sheet.getRange(rowIndex, 5).setValue(fields.currentClient);
  if (fields.clientPhone   !== undefined) sheet.getRange(rowIndex, 6).setValue(fields.clientPhone);
  if (fields.bookedFrom    !== undefined) sheet.getRange(rowIndex, 7).setValue(fields.bookedFrom);
  if (fields.returnDate    !== undefined) sheet.getRange(rowIndex, 8).setValue(fields.returnDate);
  if (fields.remarks       !== undefined) sheet.getRange(rowIndex, 9).setValue(fields.remarks);
  if (fields.fuelOut       !== undefined) sheet.getRange(rowIndex, 10).setValue(fields.fuelOut);
  if (fields.amountCharged !== undefined) sheet.getRange(rowIndex, 11).setValue(fields.amountCharged);
}

// ── History Sheet ─────────────────────────────────────────────
// Columns: A=Timestamp B=Plate C=Type D=Action E=Client F=ClientPhone
//          G=BookedFrom H=ReturnDate I=Location I=Remarks J=StaffName
//          K=FuelOut L=FuelIn M=AmountCharged N=PoliceFine O=ParkingFine

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
    entry.amountCharged || "",
    entry.policeFine    || "",
    entry.parkingFine   || "",
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
    amountCharged: row[13] || "",
    policeFine:    row[14] || "",
    parkingFine:   row[15] || "",
  }));
  return { success: true, data };
}

// ── Staff Login ───────────────────────────────────────────────
// Config sheet: Col A = Type, Col B = Name/Value, Col C = Password (for Staff rows)

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
    status:        "Rented",
    currentClient: body.client,
    clientPhone:   body.clientPhone   || "",
    bookedFrom:    body.bookedFrom    || "",
    returnDate:    body.returnDate    || "",
    remarks:       body.remarks       || "",
    location:      body.location      || "",
    fuelOut:       body.fuelOut       || "",
    amountCharged: body.amountCharged || "",
  });

  addHistory({
    plate:         body.plate,        type:          body.type,
    action:        "Checked Out",     client:        body.client,
    clientPhone:   body.clientPhone   || "",
    bookedFrom:    body.bookedFrom    || "",
    returnDate:    body.returnDate    || "",
    location:      body.location      || "",
    remarks:       body.remarks       || "",
    staffName:     body.staffName,
    fuelOut:       body.fuelOut       || "",
    amountCharged: body.amountCharged || "",
  });

  return { success: true };
}

function markReturned(body) {
  if (!body.plate)     throw new Error("Plate is required");
  if (!body.staffName) throw new Error("Staff name is required");

  const { sheet, rowIndex } = findRow(body.plate);
  const row = sheet.getRange(rowIndex, 1, 1, 11).getValues()[0];

  updateFleetRow(body.plate, {
    status: "Available", currentClient: "", clientPhone: "",
    bookedFrom: "", returnDate: "", remarks: body.remarks || "",
    fuelOut: "", amountCharged: "",
  });

  addHistory({
    plate:         body.plate,           type:          body.type || row[1],
    action:        "Returned",           client:        row[4],
    clientPhone:   row[5],              bookedFrom:    row[6],
    returnDate:    row[7],              location:      body.location || row[2],
    remarks:       body.remarks || "",  staffName:     body.staffName,
    fuelOut:       row[9],              fuelIn:        body.fuelIn        || "",
    amountCharged: body.amountCharged || row[10] || "",
    policeFine:    body.policeFine    || "",
    parkingFine:   body.parkingFine   || "",
  });

  return { success: true };
}

function extendBooking(body) {
  if (!body.plate)      throw new Error("Plate is required");
  if (!body.returnDate) throw new Error("New return date is required");
  if (!body.staffName)  throw new Error("Staff name is required");

  const { sheet, rowIndex } = findRow(body.plate);
  const row = sheet.getRange(rowIndex, 1, 1, 11).getValues()[0];
  const oldReturnDate = row[7];

  updateFleetRow(body.plate, { returnDate: body.returnDate, remarks: body.remarks || "" });

  addHistory({
    plate:      body.plate,       type:       body.type || row[1],
    action:     "Booking Extended", client:   row[4],
    clientPhone:row[5],           bookedFrom: row[6],
    returnDate: body.returnDate,  location:   body.location || row[2],
    remarks:    `Extended from ${oldReturnDate} to ${body.returnDate}. ${body.remarks || ""}`.trim(),
    staffName:  body.staffName,
  });

  return { success: true };
}

function setMaintenance(body) {
  if (!body.plate || !body.staffName) throw new Error("Plate and staff required");
  updateFleetRow(body.plate, { status: "Maintenance", currentClient: "", clientPhone: "", bookedFrom: "", returnDate: "", remarks: body.remarks || "", fuelOut: "", amountCharged: "" });
  addHistory({ plate: body.plate, type: body.type || "", action: "Sent to Maintenance", remarks: body.remarks || "", location: body.location || "", staffName: body.staffName });
  return { success: true };
}

function setGarage(body) {
  if (!body.plate || !body.staffName) throw new Error("Plate and staff required");
  updateFleetRow(body.plate, { status: "Garage", currentClient: "", clientPhone: "", bookedFrom: "", returnDate: "", remarks: body.remarks || "", fuelOut: "", amountCharged: "" });
  addHistory({ plate: body.plate, type: body.type || "", action: "Sent to Garage", remarks: body.remarks || "", location: body.location || "", staffName: body.staffName });
  return { success: true };
}

function setAvailable(body) {
  if (!body.plate || !body.staffName) throw new Error("Plate and staff required");
  updateFleetRow(body.plate, { status: "Available", currentClient: "", clientPhone: "", bookedFrom: "", returnDate: "", remarks: body.remarks || "", fuelOut: "", amountCharged: "" });
  addHistory({ plate: body.plate, type: body.type || "", action: "Marked Available", remarks: body.remarks || "", location: body.location || "", staffName: body.staffName });
  return { success: true };
}

function updateLocation(body) {
  if (!body.plate || !body.location) throw new Error("Plate and location required");
  updateFleetRow(body.plate, { location: body.location });
  addHistory({ plate: body.plate, type: body.type || "", action: "Location Updated", location: body.location, staffName: body.staffName || "" });
  return { success: true };
}

// ── Config ────────────────────────────────────────────────────

function getConfig() {
  const sheet     = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(CONFIG_SHEET);
  const rows      = sheet.getDataRange().getValues();
  const staff     = rows.filter(r => r[0] === "Staff").map(r => r[1]).filter(Boolean);
  const locations = rows.filter(r => r[0] === "Location").map(r => r[1]).filter(Boolean);
  return { success: true, staff, locations };
}

function addConfigItem(type, name) {
  if (!name) throw new Error("Name is required");
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(CONFIG_SHEET);
  sheet.appendRow([type, name]);
  return { success: true };
}

// ── Run once to update sheet headers ─────────────────────────
function updateHeaders() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  ss.getSheetByName(FLEET_SHEET).getRange(1, 1, 1, 11).setValues([[
    "Plate","Type","Location","Status","Current Client",
    "Client Phone","Booked From","Return Date","Remarks",
    "Fuel Out","Amount Charged (TZS)"
  ]]).setFontWeight("bold");

  ss.getSheetByName(HISTORY_SHEET).getRange(1, 1, 1, 16).setValues([[
    "Timestamp","Plate","Type","Action","Client","Client Phone",
    "Booked From","Return Date","Location","Remarks","Staff Name",
    "Fuel Out","Fuel In","Amount Charged (TZS)","Police Fine (TZS)","Parking Fine (TZS)"
  ]]).setFontWeight("bold");

  // Add Password column header to Config
  ss.getSheetByName(CONFIG_SHEET).getRange(1, 3).setValue("Password").setFontWeight("bold");
}
