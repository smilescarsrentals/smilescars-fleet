// src/lib/driverImport.js — parses a CSV (or .xlsx) file of driver
// details into row objects the review screen can show and edit before
// anything is saved. Uses the xlsx library already installed for exports
// (src/lib/exportExcel.js) rather than adding a new CSV-parsing
// dependency — XLSX.read() handles CSV's real edge cases (quoted fields
// containing commas, embedded newlines) correctly, which a hand-rolled
// split(",") parser would not.
import * as XLSX from "xlsx";

const REQUIRED = ["name", "phone"];

// Accepts common header spellings/casing so a real-world CSV someone
// exported from Excel or Google Sheets doesn't need to be reformatted
// first — matched case-insensitively, spaces/underscores stripped.
const HEADER_ALIASES = {
  name: ["name", "fullname", "drivername"],
  phone: ["phone", "phonenumber", "mobile", "contact"],
  licenseNumber: ["licensenumber", "license", "licenceno", "licenceno"],
  nationalId: ["nationalid", "nida", "id"],
  address: ["address"],
};

function normalizeHeader(h) {
  return String(h || "").toLowerCase().replace(/[\s_]/g, "");
}

function mapRow(rawRow, headerMap) {
  const row = {};
  for (const [field, rawKey] of Object.entries(headerMap)) {
    row[field] = rawKey != null ? String(rawRow[rawKey] ?? "").trim() : "";
  }
  return row;
}

// Returns { rows: [{ name, phone, licenseNumber, nationalId, address, rowNum }], errors: [{ rowNum, reason }] }
// Every row is checked independently — one bad row never blocks the rest,
// per instruction (skip and report, don't halt the batch).
export async function parseDriverCsv(file) {
  const buf = await file.arrayBuffer();
  // raw: false forces every cell to come back as a formatted string rather
  // than xlsx auto-detecting numeric types — without this, a phone number
  // like "0700111222" or "255700111222" silently becomes a JS number and
  // loses its leading zero (or, with a leading "+", loses the "+" itself),
  // corrupting the exact data this import exists to preserve correctly.
  const wb = XLSX.read(buf, { type: "array", raw: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });

  if (raw.length === 0) return { rows: [], errors: [{ rowNum: 0, reason: "The file appears to be empty." }] };

  // Build a case/spacing-insensitive header -> actual-column-name map once,
  // from whatever headers this specific file actually has.
  const actualHeaders = Object.keys(raw[0]);
  const headerMap = {};
  for (const field of Object.keys(HEADER_ALIASES)) {
    const match = actualHeaders.find(h => HEADER_ALIASES[field].includes(normalizeHeader(h)));
    headerMap[field] = match || null;
  }

  const rows = [];
  const errors = [];
  raw.forEach((rawRow, i) => {
    const rowNum = i + 2; // +1 for header row, +1 for 1-indexing — matches what a spreadsheet shows
    const row = mapRow(rawRow, headerMap);
    const missing = REQUIRED.filter(f => !row[f]);
    if (missing.length > 0) {
      errors.push({ rowNum, reason: `Missing ${missing.join(" and ")}`, raw: rawRow });
      return;
    }
    rows.push({ ...row, rowNum });
  });

  return { rows, errors, headerMap };
}
