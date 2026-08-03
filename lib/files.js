// lib/files.js — everything that used to live in Google Drive.
//
// Blacklist licence photos, client + staff signatures, generated rental
// agreement PDFs and backup snapshots are stored as bytea in Supabase and
// served back through this same API at:
//
//     /api?action=file&id=<fileId>
//
// URLs are stored RELATIVE on purpose: the app and the API are one deployment,
// so a stored link keeps working if the domain ever changes. Rows created in
// the Drive era keep their absolute googleusercontent.com URLs and still render.
import crypto from "node:crypto";
import { q, q1, run, insert, nowTZ, S, T } from "./core.js";

// Vercel caps a serverless request body at ~4.5 MB; base64 inflates by ~33%.
// Reject earlier than that with a message a user can act on.
const MAX_FILE_BYTES = 3 * 1024 * 1024;

const newId = (prefix) => prefix + "-" + crypto.randomBytes(8).toString("hex").toUpperCase();
const fileUrl = (id) => `/api?action=file&id=${encodeURIComponent(id)}`;

// The frontend sometimes sends a full data URL, sometimes raw base64.
function stripDataUrlPrefix(s) {
  const str = String(s || "");
  const idx = str.indexOf(",");
  return str.includes("base64,") && idx !== -1 ? str.slice(idx + 1) : str;
}

// Guess a content type from a data URL prefix, falling back to the magic bytes.
function sniffMime(dataUrl, buf, fallback) {
  const m = /^data:([^;,]+)[;,]/.exec(String(dataUrl || ""));
  if (m) return m[1];
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.length >= 4 && buf.toString("ascii", 0, 4) === "%PDF") return "application/pdf";
  return fallback || "application/octet-stream";
}

// ── Storage primitives ──────────────────────────────────────────────────────
export async function storeFile({ id, kind, filename, mimeType, buffer, createdBy }) {
  if (!buffer || !buffer.length) throw new Error("Empty file");
  if (buffer.length > MAX_FILE_BYTES)
    throw new Error(`File is too large (${(buffer.length / 1024 / 1024).toFixed(1)} MB). Maximum is ${MAX_FILE_BYTES / 1024 / 1024} MB — please use a smaller image.`);
  const fileId = id || newId("F");
  await insert("files", {
    id: fileId, kind: kind || "", filename: filename || fileId,
    mime_type: mimeType || "application/octet-stream", size_bytes: buffer.length,
    data: buffer, created_at: nowTZ(), created_by: createdBy || "",
  });
  return { fileId, url: fileUrl(fileId), size: buffer.length };
}

export async function readFile(id) {
  if (!id) return null;
  return q1(`SELECT id, filename, mime_type, size_bytes, data FROM files WHERE id=$1`, [id]);
}

export async function deleteFile(id) {
  if (!id) return 0;
  return run(`DELETE FROM files WHERE id=$1`, [id]);
}

// Stores a base64 payload and returns { fileId, url }.
async function storeBase64({ base64, kind, filename, mimeType, createdBy }) {
  const buf = Buffer.from(stripDataUrlPrefix(base64), "base64");
  return storeFile({
    kind, filename, buffer: buf, createdBy,
    mimeType: sniffMime(base64, buf, mimeType),
  });
}

// ── Blacklist licence photos ────────────────────────────────────────────────
export async function uploadBlacklistImage(body) {
  if (!body.imageBase64) throw new Error("Missing image data");
  const ext = (body.filename || "").split(".").pop();
  const { fileId, url } = await storeBase64({
    base64: body.imageBase64,
    kind: "blacklist",
    filename: body.filename || `blacklist.${ext || "jpg"}`,
    mimeType: body.mimeType || "image/jpeg",
    createdBy: body.addedBy || "",
  });
  return { success: true, url, fileId };
}

// ── Client signatures (QR-code flow on the rental agreement) ────────────────
// The pointer expires after 24h — it only needs to live long enough to build
// the one PDF.
const SIGNATURE_TTL_MS = 24 * 60 * 60 * 1000;

export async function storeSignature(body) {
  if (!body.token || !body.signature) throw new Error("Missing token or signature");
  const { fileId, url } = await storeBase64({
    base64: body.signature, kind: "signature",
    filename: `client-${body.token}.png`, mimeType: "image/png",
  });
  const prev = await q1(`SELECT file_id FROM signature_tokens WHERE token=$1`, [body.token]);
  const n = await run(
    `UPDATE signature_tokens SET file_id=$1, url=$2, created_at=$3 WHERE token=$4`,
    [fileId, url, nowTZ(), body.token]
  );
  if (!n) {
    await insert("signature_tokens", { token: body.token, file_id: fileId, url, created_at: nowTZ() });
  } else if (prev && prev.file_id) {
    await deleteFile(prev.file_id); // re-signing shouldn't leave the old image behind
  }
  return { success: true, url };
}

// Age of a stored timestamp. Timestamps are written as Tanzania local time
// (see nowTZ) and read back as raw strings, so compare against the same clock.
// A `timestamptz` column would come back as a Date instead — handle both.
function ageMs(stored) {
  if (!stored) return 0;
  if (stored instanceof Date) return Date.now() - stored.getTime();
  const t = Date.parse(String(stored).replace(" ", "T") + "Z");
  return isNaN(t) ? 0 : Date.now() + 3 * 3600 * 1000 - t;
}

export async function getSignature({ token }) {
  if (!token) throw new Error("Missing token");
  const row = await q1(`SELECT file_id, url, created_at FROM signature_tokens WHERE token=$1`, [token]);
  if (!row || !row.url) return { success: true, signature: null };
  if (ageMs(row.created_at) > SIGNATURE_TTL_MS) {
    await run(`DELETE FROM signature_tokens WHERE token=$1`, [token]);
    await deleteFile(row.file_id);
    return { success: true, signature: null };
  }
  return { success: true, signature: row.url };
}

// ── Staff signatures (captured once, reused on every agreement) ─────────────
export async function getStaffSignature({ staffName }) {
  const name = String(staffName || "").trim().toLowerCase();
  if (!name) throw new Error("Missing staffName");
  const row = await q1(`SELECT url FROM staff_signatures WHERE staff_name=$1`, [name]);
  return { success: true, signature: row && row.url ? row.url : null };
}

export async function storeStaffSignature(body) {
  const name = String(body.staffName || "").trim().toLowerCase();
  if (!name || !body.signature) throw new Error("Missing staffName or signature");
  const { fileId, url } = await storeBase64({
    base64: body.signature, kind: "staff-signature",
    filename: name.replace(/[^a-z0-9]/gi, "_") + ".png", mimeType: "image/png",
    createdBy: body.staffName,
  });
  const prev = await q1(`SELECT file_id FROM staff_signatures WHERE staff_name=$1`, [name]);
  const n = await run(
    `UPDATE staff_signatures SET file_id=$1, url=$2, updated_at=$3 WHERE staff_name=$4`,
    [fileId, url, nowTZ(), name]
  );
  if (!n) await insert("staff_signatures", { staff_name: name, file_id: fileId, url, updated_at: nowTZ() });
  // Re-signing (or switching from draw to upload) shouldn't leave orphans.
  if (prev && prev.file_id) await deleteFile(prev.file_id);
  return { success: true, url };
}

export async function deleteStaffSignature(body) {
  const name = String(body.staffName || "").trim().toLowerCase();
  if (!name) throw new Error("Missing staffName");
  const row = await q1(`SELECT file_id FROM staff_signatures WHERE staff_name=$1`, [name]);
  await run(`DELETE FROM staff_signatures WHERE staff_name=$1`, [name]);
  if (row && row.file_id) await deleteFile(row.file_id);
  return { success: true };
}

// ── Rental agreement PDFs ───────────────────────────────────────────────────
export async function uploadAgreement(body) {
  if (!body.base64 || !body.refNo) throw new Error("Missing refNo or PDF data");
  const safeName = String(body.refNo).replace(/\//g, "-");
  const { fileId, url } = await storeBase64({
    base64: body.base64, kind: "agreement",
    filename: safeName + ".pdf", mimeType: "application/pdf",
    createdBy: body.staffName || "",
  });
  await insert("agreements", {
    ref: body.refNo, plate: body.plate || "", client: body.client || "",
    staff_name: body.staffName || "", timestamp: nowTZ(), drive_url: url, file_id: fileId,
  });
  return { success: true, url };
}

// Sequential agreement ref, SC/RA/YYYY/MM/1001+ — resets each month, derived by
// scanning existing refs so it can never drift out of sync with what was logged.
export async function getNextAgreementRef() {
  const now = nowTZ();
  const prefix = `SC/RA/${now.slice(0, 4)}/${now.slice(5, 7)}/`;
  const rows = await q(`SELECT ref FROM agreements WHERE ref LIKE $1`, [prefix + "%"]);
  let maxNum = 1000;
  rows.forEach((r) => {
    const num = parseInt(String(r.ref || "").slice(prefix.length), 10);
    if (!isNaN(num) && num > maxNum) maxNum = num;
  });
  return { success: true, refNo: prefix + (maxNum + 1) };
}

export async function getAgreements() {
  const rows = await q(`SELECT * FROM agreements ORDER BY timestamp DESC NULLS LAST`);
  return {
    success: true,
    data: rows.map((r) => ({
      refNo: S(r.ref), plate: S(r.plate), client: S(r.client),
      staffName: S(r.staff_name), timestamp: T(r.timestamp), url: S(r.drive_url),
    })),
  };
}

// ── Export audit log ────────────────────────────────────────────────────────
export async function logExport(body) {
  if (!body.staffName) throw new Error("Staff name is required");
  await insert("export_log", {
    timestamp: nowTZ(), staff_name: body.staffName, role: body.role || "",
    export_type: body.exportType || "Fleet", row_count: Number(body.rowCount) || 0,
    filters: body.filters || "",
  });
  return { success: true };
}

export async function getExportLog() {
  const rows = await q(`SELECT * FROM export_log ORDER BY timestamp DESC NULLS LAST LIMIT 50`);
  return {
    success: true,
    entries: rows.map((r) => ({
      timestamp: T(r.timestamp), staffName: S(r.staff_name), role: S(r.role),
      exportType: S(r.export_type), rowCount: S(r.row_count), filters: S(r.filters),
    })),
  };
}

// ── Backup snapshot ─────────────────────────────────────────────────────────
// The Drive-era version copied the whole spreadsheet. The equivalent here is a
// full JSON dump of every data table, stored as a downloadable file. Stored
// binaries (photos, signatures, PDFs) are deliberately excluded — they would
// balloon the snapshot, and Supabase's own backups already cover them.
const BACKUP_TABLES = [
  "fleet", "history", "config", "settings", "sold", "sub_hire",
  "fuel", "reservations", "blacklist", "agreements", "export_log",
];

export async function createBackupSnapshot() {
  const snapshot = { generatedAt: nowTZ(), timezone: "Africa/Dar_es_Salaam (UTC+3)", tables: {} };
  for (const table of BACKUP_TABLES) {
    try {
      snapshot.tables[table] = await q(`SELECT * FROM "${table}"`);
    } catch (err) {
      snapshot.tables[table] = { error: err.message }; // a missing table shouldn't kill the backup
    }
  }
  const stamp = nowTZ().slice(0, 16).replace(" ", "_").replace(":", "-");
  const name = `SmilesCars-Backup-${stamp}.json`;
  const buffer = Buffer.from(JSON.stringify(snapshot, null, 2), "utf8");
  const { url } = await storeFile({
    id: newId("BACKUP"), kind: "backup", filename: name,
    mimeType: "application/json", buffer,
  });
  return { success: true, url: url + "&download=1", name };
}

// ── Dropbox sync ────────────────────────────────────────────────────────────
// Dropbox auto-sync was an Apps Script time trigger that filled Reg Card /
// Photos links into the *sheet*. With Supabase as the source of truth there is
// nothing for it to write to, so the API reports it as unavailable rather than
// leaving the Admin Panel spinning on a failed request. Requests still reach
// the legacy script if LEGACY_SCRIPT_URL is set (see api/index.js).
export async function getDropboxSyncStatus() {
  return { success: true, status: null, triggerActive: false, available: false };
}
export async function dropboxSyncUnavailable() {
  throw new Error("Dropbox auto-sync ran inside Google Apps Script and is not available on the Supabase backend. Set Reg Card / Photos links on the car directly.");
}
