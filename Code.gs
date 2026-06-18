// ============================================================
//  SMILES FLEET MANAGER — Google Apps Script Backend
//  Paste this entire file into your Google Apps Script editor
//  Tools → Script Editor (inside your Google Sheet)
// ============================================================

// ── Sheet names (must match exactly in your Google Sheet) ───
const SPREADSHEET_ID = "1xK1tVQa1bHR-FVb1Tr2MjZdtm3_QHt1PdulfVLgoFtc";
const FLEET_SHEET   = "Fleet";
const HISTORY_SHEET = "History";
const CONFIG_SHEET  = "Config";   // stores staff names & locations

// ── CORS helper ─────────────────────────────────────────────
function setCORS(output) {
  return output
    .setMimeType(ContentService.MimeType.JSON)
    .setHeaders({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST",
      "Access-Control-Allow-Headers": "Content-Type",
    });
}

function respond(data) {
  return setCORS(
    ContentService.createTextOutput(JSON.stringify(data))
  );
}

// ── Router ───────────────────────────────────────────────────
function doGet(e) {
  const action = e.parameter.action;
  try {
    if (action === "getFleet")     return respond(getFleet());
    if (action === "getHistory")   return respond(getHistory());
    if (action === "getConfig")    return respond(getConfig());
    return respond({ error: "Unknown action: " + action });
  } catch (err) {
    return respond({ error: err.message });
  }
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const action = body.action;
  try {
    if (action === "checkOut")        return respond(checkOut(body));
    if (action === "markReturned")    return respond(markReturned(body));
    if (action === "setMaintenance")  return respond(setMaintenance(body));
    if (action === "setGarage")       return respond(setGarage(body));
    if (action === "setAvailable")    return respond(setAvailable(body));
    if (action === "updateLocation")  return respond(updateLocation(body));
    if (action === "addStaff")        return respond(addConfigItem("Staff", body.name));
    if (action === "addLocation")     return respond(addConfigItem("Location", body.name));
    return respond({ error: "Unknown action: " + action });
  } catch (err) {
    return respond({ error: err.message });
  }
}

// ── Fleet helpers ────────────────────────────────────────────

// Fleet columns: A=Plate B=Type C=Location D=Status E=CurrentClient F=ClientPhone G=ReturnDate H=Remarks
function getFleet() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(FLEET_SHEET);
  const rows  = sheet.getDataRange().getValues();
  const headers = rows[0];
  const data = rows.slice(1).map((row, i) => ({
    rowIndex: i + 2,   // 1-based, row 1 = header
    plate:         row[0] || "",
    type:          row[1] || "",
    location:      row[2] || "",
    status:        row[3] || "Available",
    currentClient: row[4] || "",
    clientPhone:   row[5] || "",
    returnDate:    row[6] || "",
    remarks:       row[7] || "",
  }));
  return { success: true, data };
}

function findRow(plate) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(FLEET_SHEET);
  const plates = sheet.getRange("A:A").getValues().flat();
  const idx = plates.findIndex(p => p === plate);
  if (idx < 1) throw new Error("Car not found: " + plate);
  return { sheet, rowIndex: idx + 1 };
}

function updateFleetRow(plate, fields) {
  // fields: { status, currentClient, clientPhone, returnDate, remarks, location }
  const { sheet, rowIndex } = findRow(plate);
  if (fields.status        !== undefined) sheet.getRange(rowIndex, 4).setValue(fields.status);
  if (fields.currentClient !== undefined) sheet.getRange(rowIndex, 5).setValue(fields.currentClient);
  if (fields.clientPhone   !== undefined) sheet.getRange(rowIndex, 6).setValue(fields.clientPhone);
  if (fields.returnDate    !== undefined) sheet.getRange(rowIndex, 7).setValue(fields.returnDate);
  if (fields.remarks       !== undefined) sheet.getRange(rowIndex, 8).setValue(fields.remarks);
  if (fields.location      !== undefined) sheet.getRange(rowIndex, 3).setValue(fields.location);
}

// ── History helper ───────────────────────────────────────────
// History columns: A=Timestamp B=Plate C=Type D=Action E=Client F=Phone G=ReturnDate H=Location I=Remarks J=StaffName
function addHistory(entry) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(HISTORY_SHEET);
  sheet.appendRow([
    new Date(),
    entry.plate       || "",
    entry.type        || "",
    entry.action      || "",
    entry.client      || "",
    entry.clientPhone || "",
    entry.returnDate  || "",
    entry.location    || "",
    entry.remarks     || "",
    entry.staffName   || "",
  ]);
}

function getHistory() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(HISTORY_SHEET);
  const rows  = sheet.getDataRange().getValues();
  if (rows.length <= 1) return { success: true, data: [] };
  const data = rows.slice(1).reverse().map(row => ({
    timestamp:   row[0] ? new Date(row[0]).toISOString() : "",
    plate:       row[1] || "",
    type:        row[2] || "",
    action:      row[3] || "",
    client:      row[4] || "",
    clientPhone: row[5] || "",
    returnDate:  row[6] || "",
    location:    row[7] || "",
    remarks:     row[8] || "",
    staffName:   row[9] || "",
  }));
  return { success: true, data };
}

// ── Actions ──────────────────────────────────────────────────

function checkOut(body) {
  // Required: plate, type, client, staffName
  // Optional: clientPhone, returnDate, location, remarks
  if (!body.plate)     throw new Error("Plate is required");
  if (!body.client)    throw new Error("Client name is required");
  if (!body.staffName) throw new Error("Staff name is required");

  updateFleetRow(body.plate, {
    status:        "Rented",
    currentClient: body.client,
    clientPhone:   body.clientPhone  || "",
    returnDate:    body.returnDate   || "",
    remarks:       body.remarks      || "",
    location:      body.location     || "",
  });

  addHistory({
    plate:       body.plate,
    type:        body.type,
    action:      "Checked Out",
    client:      body.client,
    clientPhone: body.clientPhone || "",
    returnDate:  body.returnDate  || "",
    location:    body.location    || "",
    remarks:     body.remarks     || "",
    staffName:   body.staffName,
  });

  return { success: true, message: `${body.plate} checked out to ${body.client}` };
}

function markReturned(body) {
  if (!body.plate)     throw new Error("Plate is required");
  if (!body.staffName) throw new Error("Staff name is required");

  // Read current row to log client info in history
  const { sheet, rowIndex } = findRow(body.plate);
  const row = sheet.getRange(rowIndex, 1, 1, 8).getValues()[0];
  const prevClient = row[4];
  const prevPhone  = row[5];
  const prevLocation = row[2];

  updateFleetRow(body.plate, {
    status:        "Available",
    currentClient: "",
    clientPhone:   "",
    returnDate:    "",
    remarks:       body.remarks || "",
  });

  addHistory({
    plate:       body.plate,
    type:        body.type || row[1],
    action:      "Returned",
    client:      prevClient,
    clientPhone: prevPhone,
    returnDate:  "",
    location:    body.location || prevLocation,
    remarks:     body.remarks || "",
    staffName:   body.staffName,
  });

  return { success: true, message: `${body.plate} marked as returned` };
}

function setMaintenance(body) {
  if (!body.plate)     throw new Error("Plate is required");
  if (!body.staffName) throw new Error("Staff name is required");

  updateFleetRow(body.plate, {
    status:        "Maintenance",
    currentClient: "",
    clientPhone:   "",
    returnDate:    "",
    remarks:       body.remarks || "",
  });

  addHistory({
    plate:     body.plate,
    type:      body.type || "",
    action:    "Sent to Maintenance",
    remarks:   body.remarks || "",
    location:  body.location || "",
    staffName: body.staffName,
  });

  return { success: true };
}

function setGarage(body) {
  if (!body.plate)     throw new Error("Plate is required");
  if (!body.staffName) throw new Error("Staff name is required");

  updateFleetRow(body.plate, {
    status:        "Garage",
    currentClient: "",
    clientPhone:   "",
    returnDate:    "",
    remarks:       body.remarks || "",
  });

  addHistory({
    plate:     body.plate,
    type:      body.type || "",
    action:    "Sent to Garage",
    remarks:   body.remarks || "",
    location:  body.location || "",
    staffName: body.staffName,
  });

  return { success: true };
}

function setAvailable(body) {
  if (!body.plate)     throw new Error("Plate is required");
  if (!body.staffName) throw new Error("Staff name is required");

  updateFleetRow(body.plate, {
    status:        "Available",
    currentClient: "",
    clientPhone:   "",
    returnDate:    "",
    remarks:       body.remarks || "",
  });

  addHistory({
    plate:     body.plate,
    type:      body.type || "",
    action:    "Marked Available",
    remarks:   body.remarks || "",
    location:  body.location || "",
    staffName: body.staffName,
  });

  return { success: true };
}

function updateLocation(body) {
  if (!body.plate)    throw new Error("Plate is required");
  if (!body.location) throw new Error("Location is required");

  updateFleetRow(body.plate, { location: body.location });

  addHistory({
    plate:     body.plate,
    type:      body.type || "",
    action:    "Location Updated",
    location:  body.location,
    staffName: body.staffName || "",
  });

  return { success: true };
}

// ── Config (staff & locations) ───────────────────────────────
// Config sheet layout: Column A = "Staff" or "Location", Column B = name/value

function getConfig() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(CONFIG_SHEET);
  const rows  = sheet.getDataRange().getValues();
  const staff     = rows.filter(r => r[0] === "Staff").map(r => r[1]).filter(Boolean);
  const locations = rows.filter(r => r[0] === "Location").map(r => r[1]).filter(Boolean);
  return { success: true, staff, locations };
}

function addConfigItem(type, name) {
  if (!name) throw new Error("Name is required");
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(CONFIG_SHEET);
  sheet.appendRow([type, name]);
  return { success: true, message: `${type} "${name}" added` };
}

// ── One-time setup: run this once to create sheet structure ──
function setupSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // Fleet sheet
  let fleet = ss.getSheetByName(FLEET_SHEET);
  if (!fleet) fleet = ss.insertSheet(FLEET_SHEET);
  fleet.getRange(1, 1, 1, 8).setValues([[
    "Plate", "Type", "Location", "Status",
    "Current Client", "Client Phone", "Return Date", "Remarks"
  ]]);
  fleet.getRange(1, 1, 1, 8).setFontWeight("bold");

  // History sheet
  let history = ss.getSheetByName(HISTORY_SHEET);
  if (!history) history = ss.insertSheet(HISTORY_SHEET);
  history.getRange(1, 1, 1, 10).setValues([[
    "Timestamp", "Plate", "Type", "Action",
    "Client", "Client Phone", "Return Date",
    "Location", "Remarks", "Staff Name"
  ]]);
  history.getRange(1, 1, 1, 10).setFontWeight("bold");

  // Config sheet
  let config = ss.getSheetByName(CONFIG_SHEET);
  if (!config) config = ss.insertSheet(CONFIG_SHEET);
  config.getRange(1, 1, 1, 2).setValues([["Type", "Value"]]);
  config.getRange(1, 1, 1, 2).setFontWeight("bold");

  // Seed staff names
  const staffNames = [
    "Ramadhan Karim",
    "Neema Sawaya",
    "Rahma Mkali",
    "Farhiya Ahmed",
    "Menhal Kassam"
  ];
  staffNames.forEach(name => config.appendRow(["Staff", name]));

  // Seed locations
  ["Dar es Salaam", "Arusha", "Mwanza"].forEach(loc =>
    config.appendRow(["Location", loc])
  );

  SpreadsheetApp.getUi().alert("✅ Smiles Fleet sheets created successfully!");
}
