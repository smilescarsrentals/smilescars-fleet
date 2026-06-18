// ============================================================
//  SMILES FLEET MANAGER — Google Apps Script Backend
//  Paste this entire file into your Google Apps Script editor
//  Then deploy as a Web App (see setup guide)
// ============================================================

// ---- CONFIGURATION ----
// Replace these with your actual Google Sheet IDs
// (found in the sheet URL: docs.google.com/spreadsheets/d/SHEET_ID/edit)
const FLEET_SHEET_ID   = 'YOUR_FLEET_SHEET_ID_HERE'
const HISTORY_SHEET_ID = 'YOUR_HISTORY_SHEET_ID_HERE'

// Sheet tab names (must match exactly)
const FLEET_TAB    = 'Fleet'
const HISTORY_TAB  = 'History'
const STAFF_TAB    = 'Staff'
const LOCATION_TAB = 'Locations'

// ---- COLUMN INDEXES (0-based) for Fleet sheet ----
const COL = {
  PLATE:          0,
  TYPE:           1,
  LOCATION:       2,
  STATUS:         3,
  CLIENT:         4,
  CLIENT_PHONE:   5,
  RETURN_DATE:    6,
  REMARKS:        7,
}

// ---- CORS HEADERS ----
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  }
}

// ---- ENTRY POINTS ----
function doGet(e) {
  const action = e.parameter.action
  let result

  try {
    switch (action) {
      case 'getFleet':     result = getFleet();     break
      case 'getStaff':     result = getStaff();     break
      case 'getLocations': result = getLocations(); break
      case 'getHistory':   result = getHistory();   break
      default:             result = { error: 'Unknown action: ' + action }
    }
  } catch (err) {
    result = { error: err.message }
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON)
}

function doPost(e) {
  let body
  try {
    body = JSON.parse(e.postData.contents)
  } catch (err) {
    return respond({ error: 'Invalid JSON body' })
  }

  const action = body.action
  let result

  try {
    switch (action) {
      case 'checkOut':         result = checkOut(body);         break
      case 'markReturned':     result = markReturned(body);     break
      case 'setMaintenance':   result = setMaintenance(body);   break
      case 'setGarage':        result = setGarage(body);        break
      case 'markAvailable':    result = markAvailable(body);    break
      case 'updateLocation':   result = updateLocation(body);   break
      case 'addStaff':         result = addStaff(body);         break
      case 'addLocation':      result = addLocation(body);      break
      default:                 result = { error: 'Unknown action: ' + action }
    }
  } catch (err) {
    result = { error: err.message }
  }

  return respond(result)
}

function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON)
}

// ============================================================
//  READ FUNCTIONS
// ============================================================

function getFleet() {
  const sheet = SpreadsheetApp.openById(FLEET_SHEET_ID).getSheetByName(FLEET_TAB)
  const rows  = sheet.getDataRange().getValues()
  const headers = rows[0]
  const data = rows.slice(1).map((row, i) => ({
    rowIndex:    i + 2, // 1-based, skipping header
    plate:       row[COL.PLATE]        || '',
    type:        row[COL.TYPE]         || '',
    location:    row[COL.LOCATION]     || '',
    status:      row[COL.STATUS]       || 'Available',
    client:      row[COL.CLIENT]       || '',
    clientPhone: row[COL.CLIENT_PHONE] || '',
    returnDate:  row[COL.RETURN_DATE]  ? formatDate(row[COL.RETURN_DATE]) : '',
    remarks:     row[COL.REMARKS]      || '',
  }))
  return { success: true, data }
}

function getStaff() {
  const sheet = SpreadsheetApp.openById(FLEET_SHEET_ID).getSheetByName(STAFF_TAB)
  const rows  = sheet.getDataRange().getValues()
  const names = rows.slice(1).map(r => r[0]).filter(n => n !== '')
  return { success: true, data: names }
}

function getLocations() {
  const sheet = SpreadsheetApp.openById(FLEET_SHEET_ID).getSheetByName(LOCATION_TAB)
  const rows  = sheet.getDataRange().getValues()
  const locs  = rows.slice(1).map(r => r[0]).filter(l => l !== '')
  return { success: true, data: locs }
}

function getHistory() {
  const sheet = SpreadsheetApp.openById(HISTORY_SHEET_ID).getSheetByName(HISTORY_TAB)
  const rows  = sheet.getDataRange().getValues()
  if (rows.length <= 1) return { success: true, data: [] }
  const data = rows.slice(1).reverse().map(row => ({
    timestamp:   row[0] ? formatDateTime(row[0]) : '',
    plate:       row[1] || '',
    type:        row[2] || '',
    action:      row[3] || '',
    client:      row[4] || '',
    clientPhone: row[5] || '',
    returnDate:  row[6] ? formatDate(row[6]) : '',
    location:    row[7] || '',
    remarks:     row[8] || '',
    staffName:   row[9] || '',
  }))
  return { success: true, data }
}

// ============================================================
//  WRITE FUNCTIONS
// ============================================================

function checkOut(body) {
  const { plate, client, clientPhone, returnDate, remarks, staffName, location } = body
  if (!plate || !client || !returnDate || !staffName) {
    return { error: 'Missing required fields: plate, client, returnDate, staffName' }
  }

  const fleetSheet = SpreadsheetApp.openById(FLEET_SHEET_ID).getSheetByName(FLEET_TAB)
  const rowIndex   = findRowByPlate(fleetSheet, plate)
  if (!rowIndex) return { error: 'Car not found: ' + plate }

  const row = fleetSheet.getRange(rowIndex, 1, 1, 8).getValues()[0]
  const carType = row[COL.TYPE]

  // Update fleet row
  fleetSheet.getRange(rowIndex, COL.STATUS + 1).setValue('Rented')
  fleetSheet.getRange(rowIndex, COL.CLIENT + 1).setValue(client)
  fleetSheet.getRange(rowIndex, COL.CLIENT_PHONE + 1).setValue(clientPhone || '')
  fleetSheet.getRange(rowIndex, COL.RETURN_DATE + 1).setValue(returnDate)
  fleetSheet.getRange(rowIndex, COL.REMARKS + 1).setValue(remarks || '')
  if (location) fleetSheet.getRange(rowIndex, COL.LOCATION + 1).setValue(location)

  // Log to history
  addHistory({
    plate, type: carType, action: 'Checked Out',
    client, clientPhone, returnDate,
    location: location || row[COL.LOCATION],
    remarks, staffName,
  })

  return { success: true, message: plate + ' checked out to ' + client }
}

function markReturned(body) {
  const { plate, remarks, staffName } = body
  if (!plate || !staffName) return { error: 'Missing required fields: plate, staffName' }

  const fleetSheet = SpreadsheetApp.openById(FLEET_SHEET_ID).getSheetByName(FLEET_TAB)
  const rowIndex   = findRowByPlate(fleetSheet, plate)
  if (!rowIndex) return { error: 'Car not found: ' + plate }

  const row     = fleetSheet.getRange(rowIndex, 1, 1, 8).getValues()[0]
  const carType = row[COL.TYPE]
  const client  = row[COL.CLIENT]
  const phone   = row[COL.CLIENT_PHONE]
  const loc     = row[COL.LOCATION]

  // Clear rental info, set available
  fleetSheet.getRange(rowIndex, COL.STATUS + 1).setValue('Available')
  fleetSheet.getRange(rowIndex, COL.CLIENT + 1).setValue('')
  fleetSheet.getRange(rowIndex, COL.CLIENT_PHONE + 1).setValue('')
  fleetSheet.getRange(rowIndex, COL.RETURN_DATE + 1).setValue('')
  fleetSheet.getRange(rowIndex, COL.REMARKS + 1).setValue(remarks || '')

  addHistory({
    plate, type: carType, action: 'Returned',
    client, clientPhone: phone,
    returnDate: '', location: loc,
    remarks, staffName,
  })

  return { success: true, message: plate + ' marked as returned' }
}

function setMaintenance(body) {
  return setStatus(body, 'Maintenance', 'Sent to Maintenance')
}

function setGarage(body) {
  return setStatus(body, 'Garage', 'Sent to Garage')
}

function markAvailable(body) {
  return setStatus(body, 'Available', 'Marked Available')
}

function setStatus(body, newStatus, actionLabel) {
  const { plate, remarks, staffName } = body
  if (!plate || !staffName) return { error: 'Missing required fields: plate, staffName' }

  const fleetSheet = SpreadsheetApp.openById(FLEET_SHEET_ID).getSheetByName(FLEET_TAB)
  const rowIndex   = findRowByPlate(fleetSheet, plate)
  if (!rowIndex) return { error: 'Car not found: ' + plate }

  const row = fleetSheet.getRange(rowIndex, 1, 1, 8).getValues()[0]

  fleetSheet.getRange(rowIndex, COL.STATUS + 1).setValue(newStatus)
  fleetSheet.getRange(rowIndex, COL.REMARKS + 1).setValue(remarks || '')
  if (newStatus === 'Available') {
    fleetSheet.getRange(rowIndex, COL.CLIENT + 1).setValue('')
    fleetSheet.getRange(rowIndex, COL.CLIENT_PHONE + 1).setValue('')
    fleetSheet.getRange(rowIndex, COL.RETURN_DATE + 1).setValue('')
  }

  addHistory({
    plate, type: row[COL.TYPE], action: actionLabel,
    client: row[COL.CLIENT], clientPhone: row[COL.CLIENT_PHONE],
    returnDate: '', location: row[COL.LOCATION],
    remarks, staffName,
  })

  return { success: true, message: plate + ' → ' + newStatus }
}

function updateLocation(body) {
  const { plate, location, staffName } = body
  if (!plate || !location || !staffName) return { error: 'Missing fields' }

  const fleetSheet = SpreadsheetApp.openById(FLEET_SHEET_ID).getSheetByName(FLEET_TAB)
  const rowIndex   = findRowByPlate(fleetSheet, plate)
  if (!rowIndex) return { error: 'Car not found: ' + plate }

  fleetSheet.getRange(rowIndex, COL.LOCATION + 1).setValue(location)

  addHistory({
    plate, type: '', action: 'Location Updated',
    client: '', clientPhone: '',
    returnDate: '', location, remarks: '', staffName,
  })

  return { success: true }
}

function addStaff(body) {
  const { name } = body
  if (!name) return { error: 'Name is required' }

  const sheet = SpreadsheetApp.openById(FLEET_SHEET_ID).getSheetByName(STAFF_TAB)
  const existing = sheet.getDataRange().getValues().map(r => r[0])
  if (existing.includes(name)) return { error: 'Staff member already exists' }

  sheet.appendRow([name])
  return { success: true, message: name + ' added to staff list' }
}

function addLocation(body) {
  const { location } = body
  if (!location) return { error: 'Location is required' }

  const sheet = SpreadsheetApp.openById(FLEET_SHEET_ID).getSheetByName(LOCATION_TAB)
  const existing = sheet.getDataRange().getValues().map(r => r[0])
  if (existing.includes(location)) return { error: 'Location already exists' }

  sheet.appendRow([location])
  return { success: true, message: location + ' added' }
}

// ============================================================
//  HELPERS
// ============================================================

function findRowByPlate(sheet, plate) {
  const data = sheet.getDataRange().getValues()
  for (let i = 1; i < data.length; i++) {
    if (data[i][COL.PLATE] === plate) return i + 1 // 1-based row number
  }
  return null
}

function addHistory({ plate, type, action, client, clientPhone, returnDate, location, remarks, staffName }) {
  const histSheet = SpreadsheetApp.openById(HISTORY_SHEET_ID).getSheetByName(HISTORY_TAB)
  histSheet.appendRow([
    new Date(),    // Timestamp
    plate,
    type,
    action,
    client        || '',
    clientPhone   || '',
    returnDate    || '',
    location      || '',
    remarks       || '',
    staffName,
  ])
}

function formatDate(val) {
  if (!val) return ''
  const d = new Date(val)
  if (isNaN(d)) return String(val)
  return d.toISOString().split('T')[0] // YYYY-MM-DD
}

function formatDateTime(val) {
  if (!val) return ''
  const d = new Date(val)
  if (isNaN(d)) return String(val)
  return d.toLocaleString('en-GB', { timeZone: 'Africa/Dar_es_Salaam' })
}

// ============================================================
//  FIRST-TIME SETUP — run this ONCE to create sheet structure
//  In Apps Script editor: select setupSheets → Run
// ============================================================
function setupSheets() {
  // --- Fleet Sheet ---
  const fleetSS = SpreadsheetApp.openById(FLEET_SHEET_ID)

  // Fleet tab
  let fleet = fleetSS.getSheetByName(FLEET_TAB)
  if (!fleet) fleet = fleetSS.insertSheet(FLEET_TAB)
  fleet.getRange(1, 1, 1, 8).setValues([[
    'Plate', 'Type', 'Location', 'Status', 'Current Client', 'Client Phone', 'Return Date', 'Remarks'
  ]])
  fleet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff')
  fleet.setFrozenRows(1)

  // Staff tab
  let staff = fleetSS.getSheetByName(STAFF_TAB)
  if (!staff) staff = fleetSS.insertSheet(STAFF_TAB)
  staff.getRange(1, 1).setValue('Name').setFontWeight('bold')
  const staffNames = ['Ramadhan Karim', 'Neema Sawaya', 'Rahma Mkali', 'Farhiya Ahmed', 'Menhal Kassam']
  staffNames.forEach((name, i) => staff.getRange(i + 2, 1).setValue(name))

  // Locations tab
  let locs = fleetSS.getSheetByName(LOCATION_TAB)
  if (!locs) locs = fleetSS.insertSheet(LOCATION_TAB)
  locs.getRange(1, 1).setValue('Location').setFontWeight('bold')
  const locations = ['Dar es Salaam', 'Arusha', 'Mwanza']
  locations.forEach((loc, i) => locs.getRange(i + 2, 1).setValue(loc))

  // --- History Sheet ---
  const histSS = SpreadsheetApp.openById(HISTORY_SHEET_ID)
  let hist = histSS.getSheetByName(HISTORY_TAB)
  if (!hist) hist = histSS.insertSheet(HISTORY_TAB)
  hist.getRange(1, 1, 1, 10).setValues([[
    'Timestamp', 'Plate', 'Type', 'Action', 'Client', 'Client Phone',
    'Return Date', 'Location', 'Remarks', 'Staff Name'
  ]])
  hist.getRange(1, 1, 1, 10).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff')
  hist.setFrozenRows(1)

  Logger.log('✅ Setup complete! Both sheets are ready.')
}
