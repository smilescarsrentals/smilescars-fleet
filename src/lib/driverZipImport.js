// src/lib/driverZipImport.js — parses a ZIP of driver documents named
// "Name - DocType.ext" into entries the review screen can show (matched
// to an existing driver, or flagged as unmatched) before anything
// uploads. Filenames are parsed and matched entirely client-side; only
// confirmed, already-matched entries get sent to the backend for actual
// upload, same pattern as the CSV import.
import JSZip from "jszip";

const DOC_TYPES = ["Driving License", "National ID (NIDA)", "TIN Certificate", "Defensive Driving Cert", "Others"];

function normalizeForMatch(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Best-effort match against the 5 real types — exact match first, then
// common shorthand (e.g. "License" alone, "NIDA" alone). Never rejects a
// file outright for an unrecognized doc type; falls back to "Others"
// rather than silently dropping it, so nothing gets lost, only mis-typed
// (visible and correctable on the review screen).
function matchDocType(raw) {
  const norm = normalizeForMatch(raw);
  const exact = DOC_TYPES.find(t => normalizeForMatch(t) === norm);
  if (exact) return exact;
  if (norm.includes("licen")) return "Driving License"; // covers license/licence
  if (norm.includes("nida") || norm.includes("nationalid")) return "National ID (NIDA)";
  if (norm.includes("tin")) return "TIN Certificate";
  if (norm.includes("defensive")) return "Defensive Driving Cert";
  return "Others";
}

// "Name - DocType.ext" -> { name, docTypeRaw } — everything after the
// FIRST " - " is treated as the doc type, so a doc type that itself
// contains a dash (unlikely with the 5 real types, but not impossible)
// doesn't get truncated.
function parseFilename(filename) {
  const base = filename.replace(/\.[^.]+$/, "");
  const dashIndex = base.indexOf(" - ");
  if (dashIndex === -1) return null;
  return {
    name: base.slice(0, dashIndex).trim(),
    docTypeRaw: base.slice(dashIndex + 3).trim(),
  };
}

function extToMime(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return "application/octet-stream";
}

// Returns { matched: [{ filename, driverId, driverName, docType, base64, mimeType }],
//           unmatched: [{ filename, reason }] }
// drivers = the already-loaded driver list (name -> id), matched
// case-insensitively with whitespace trimmed, since a ZIP filename and a
// driver record being off by capitalization shouldn't be treated as a
// real mismatch.
export async function parseDriverZip(file, drivers) {
  const zip = await JSZip.loadAsync(file);
  const matched = [];
  const unmatched = [];

  const driverByName = new Map(drivers.map(d => [normalizeForMatch(d.name), d]));

  const entries = Object.values(zip.files).filter(f => !f.dir && !f.name.startsWith("__MACOSX"));
  for (const entry of entries) {
    const filename = entry.name.split("/").pop(); // strip any folder path inside the zip
    const parsed = parseFilename(filename);
    if (!parsed) {
      unmatched.push({ filename, reason: 'Filename doesn\'t match "Name - DocType" format' });
      continue;
    }
    const driver = driverByName.get(normalizeForMatch(parsed.name));
    if (!driver) {
      unmatched.push({ filename, reason: `No driver named "${parsed.name}"` });
      continue;
    }
    const ext = filename.split(".").pop().toLowerCase();
    if (!["pdf", "png", "jpg", "jpeg"].includes(ext)) {
      unmatched.push({ filename, reason: `Unsupported file type ".${ext}"` });
      continue;
    }

    const base64 = await entry.async("base64");
    matched.push({
      filename, driverId: driver.id, driverName: driver.name,
      docType: matchDocType(parsed.docTypeRaw), base64, mimeType: extToMime(filename),
    });
  }

  return { matched, unmatched };
}
