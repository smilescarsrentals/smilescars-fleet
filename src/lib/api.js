// The backend lives at /api in this same deployment (Supabase-backed — see
// /api/index.js).
//
// VITE_SCRIPT_URL is deliberately IGNORED. Vite inlines env variables at build
// time, so a leftover VITE_SCRIPT_URL in the Vercel project silently sends the
// whole app back to Google Apps Script — which is what it did after the
// migration, until this constant took over. To point the app somewhere else
// (another deployment, or back to Apps Script), edit this line; don't
// reintroduce the env variable.
const SCRIPT_URL = "/api";

if (import.meta.env.VITE_SCRIPT_URL) {
  console.warn(
    `[SmilesCars] Ignoring VITE_SCRIPT_URL (${import.meta.env.VITE_SCRIPT_URL}) — ` +
    `the app reads Supabase through ${SCRIPT_URL}. Delete that variable from the ` +
    `Vercel project when you get the chance; it has no effect either way.`
  );
}

export async function get(action, params = {}) {
  const url = new URL(SCRIPT_URL, window.location.origin); // second arg resolves the relative "/api"
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res  = await fetch(url.toString(), { method: "GET", redirect: "follow" });
  const text = await res.text();
  const data = JSON.parse(text);
  if (data.error) throw new Error(data.error);
  return data;
}

export async function post(body) {
  const res  = await fetch(SCRIPT_URL, {
    method: "POST", redirect: "follow",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const data = JSON.parse(text);
  if (data.error) throw new Error(data.error);
  return data;
}

export const api = {
  getFleet:              ()      => get("getFleet"),
  getHistory:            ()      => get("getHistory"),
  getConfig:             ()      => get("getConfig"),
  getSold:               ()      => get("getSold"),
  getSubHire:            ()      => get("getSubHire"),
  getClients:            ()      => get("getClients"),
  getFuel:               ()      => get("getFuel"),
  getCarByPlate:         (plate) => get("getCarByPlate", { plate }),
  getCarHistory:         (plate)       => get("getCarHistory",     { plate }),
  getHistoryByStaff:     (staffName)   => get("getHistoryByStaff", { staffName }),
  getReservations:       (month, year) => get("getReservations", { month, year }),
  getAllReservations:     ()            => get("getAllReservations"),
  getBlacklist:          ()            => get("getBlacklist"),
  uploadBlacklistImage:  (body)        => post({ action: "uploadBlacklistImage", ...body }),
  addToBlacklist:        (body)        => post({ action: "addToBlacklist",       ...body }),
  deleteFromBlacklist:   (body)        => post({ action: "deleteFromBlacklist",  ...body }),
  addReservation:        (body)  => post({ action: "addReservation",    ...body }),
  editReservation:       (body)  => post({ action: "editReservation",   ...body }),
  deleteReservation:     (body)  => post({ action: "deleteReservation", ...body }),
  verifyStaff:           (body)  => post({ action: "verifyStaff",           ...body }),
  checkOut:              (body)  => post({ action: "checkOut",               ...body }),
  addCar:                (body)  => post({ action: "addCar",                 ...body }),
  addStaff:              (body)  => post({ action: "addStaff",               ...body }),
  getStaffList:           ()     => get("getStaffList"),
  setStaffActive:        (body)  => post({ action: "setStaffActive",         ...body }),
  getSettings:            ()     => get("getSettings"),
  updateSetting:         (body)  => post({ action: "updateSetting",          ...body }),
  updateConfigItem:      (body)  => post({ action: "updateConfigItem",       ...body }),
  deleteConfigItem:      (body)  => post({ action: "deleteConfigItem",       ...body }),
  getDropboxSyncStatus:   ()     => get("getDropboxSyncStatus"),
  enableDropboxSync:      ()     => post({ action: "enableDropboxSync" }),
  disableDropboxSync:     ()     => post({ action: "disableDropboxSync" }),
  createBackupSnapshot:   ()     => post({ action: "createBackupSnapshot" }),
  deleteStaffSignature:  (body)  => post({ action: "deleteStaffSignature",   ...body }),
  markReturned:          (body)  => post({ action: "markReturned",           ...body }),
  extendBooking:         (body)  => post({ action: "extendBooking",          ...body }),
  setMaintenance:        (body)  => post({ action: "setMaintenance",         ...body }),
  setAvailable:          (body)  => post({ action: "setAvailable",           ...body }),
  setStaffUse:           (body)  => post({ action: "setStaffUse",            ...body }),
  replaceVehicle:        (body)  => post({ action: "replaceVehicle",          ...body }),
  updateLocation:        (body)  => post({ action: "updateLocation",         ...body }),
  updatePayment:         (body)  => post({ action: "updatePayment",          ...body }),
  markSold:              (body)  => post({ action: "markSold",               ...body }),
  addLocation:           (name)  => post({ action: "addLocation",            name }),
  addGarage:             (name)  => post({ action: "addGarage",              name }),
  addDriver:             (name)  => post({ action: "addDriver",              name }),
  addCarNote:            (body)  => post({ action: "addCarNote",             ...body }),
  addFuel:               (body)  => post({ action: "addFuel",                ...body }),
  editFuel:              (body)  => post({ action: "editFuel",               ...body }),
  addSubHire:            (body)  => post({ action: "addSubHire",             ...body }),
  returnSubHire:         (body)  => post({ action: "returnSubHire",          ...body }),
  updateSubHirePayment:  (body)  => post({ action: "updateSubHirePayment",   ...body }),
};
