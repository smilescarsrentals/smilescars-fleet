// api/index.js — the whole backend, in one Vercel serverless function.
//
// It re-serves the exact action API the SmilesCars frontend already spoke to
// Google Apps Script, but every read and write now goes to Supabase Postgres:
//
//   GET  ?action=getFleet             -> Supabase read
//   GET  ?action=file&id=…            -> a stored photo / signature / PDF
//   POST {action:"checkOut", …}       -> Supabase write
//   anything unrecognised             -> optional proxy to the legacy Apps Script
//
// The connection string lives only here, server-side: a browser can't speak the
// Postgres protocol, and the password must never ship to users.
import * as reads from "../lib/reads.js";
import * as writes from "../lib/writes.js";
import * as files from "../lib/files.js";
import { health } from "../lib/health.js";
import { extractInvoiceData } from "../lib/invoiceScan.js";
import { requireMaintenanceEditAccess } from "../lib/core.js";

// Optional. Only used for actions this API doesn't implement — leave it unset
// once the Apps Script is retired.
const LEGACY = process.env.LEGACY_SCRIPT_URL || "";

// GET action -> handler(params). Params come from the query string.
const READS = {
  getFleet: reads.getFleet,
  getHistory: reads.getHistory,
  getConfig: reads.getConfig,
  getSold: reads.getSold,
  getSubHire: reads.getSubHire,
  getClients: reads.getClients,
  getDashboard: reads.getDashboard,
  getCarByPlate: reads.getCarByPlate,
  getCarHistory: reads.getCarHistory,
  getHistoryByStaff: reads.getHistoryByStaff,
  getFuel: reads.getFuel,
  getFuelByPlate: reads.getFuelByPlate,
  getReservations: reads.getReservations,
  getAllReservations: () => reads.getReservations({}),
  getBlacklist: reads.getBlacklist,
  getMaintenanceLog: reads.getMaintenanceLog,
  getMaintenanceItems: reads.getMaintenanceItems,
  getAllMaintenanceItems: reads.getAllMaintenanceItems,
  getMaintenanceUpdates: reads.getMaintenanceUpdates,
  getCustomerJobs: reads.getCustomerJobs,
  getCustomerJobItems: reads.getCustomerJobItems,
  getCustomerJobUpdates: reads.getCustomerJobUpdates,
  getLeads: reads.getLeads,
  getVendors: reads.getVendors,
  getVendorCategories: reads.getVendorCategories,
  getNotifications: reads.getNotifications,
  getUnreadNotificationCount: reads.getUnreadNotificationCount,
  getPushSubscriptions: reads.getPushSubscriptions,
  getPartCostHistory: reads.getPartCostHistory,
  getDriversV2: reads.getDriversV2,
  getDriverById: reads.getDriverById,
  getDriverDocuments: reads.getDriverDocuments,
  getAllDriverDocuments: reads.getAllDriverDocuments,
  getPurchaseInvoices: reads.getPurchaseInvoices,
  getPurchaseInvoiceItems: reads.getPurchaseInvoiceItems,
  getSystemHealth: reads.getSystemHealth,
  getNotificationTriggerSettings: reads.getNotificationTriggerSettings,
  getParts: reads.getParts,
  getServiceTemplates: reads.getServiceTemplates,
  getCarServiceAssignments: reads.getCarServiceAssignments,
  getChecklistTemplates: reads.getChecklistTemplates,
  getChecklistInstances: reads.getChecklistInstances,
  getSettings: reads.getSettings,
  getStaffList: reads.getStaffList,
  getDrivers: reads.getDrivers,
  // Files, signatures, agreements — formerly Google Drive
  getSignature: files.getSignature,
  getStaffSignature: files.getStaffSignature,
  getNextAgreementRef: files.getNextAgreementRef,
  getAgreements: files.getAgreements,
  getExportLog: files.getExportLog,
  getDropboxSyncStatus: files.getDropboxSyncStatus,
  health,
};

// POST action -> handler(body).
const WRITES = {
  // Phase 1: extraction only, doesn't write to the database — kept in
  // WRITES (not READS) since it's a POST carrying image data, and the
  // access-gating (Garage staff only) matches everything else here.
  scanInvoice: async (body) => {
    await requireMaintenanceEditAccess(body.staffName);
    const data = await extractInvoiceData({ imageBase64: body.imageBase64, mimeType: body.mimeType });
    return { success: true, data };
  },
  confirmInvoiceScan: writes.confirmInvoiceScan,
  verifyStaff: writes.verifyStaff,
  checkOut: writes.checkOut,
  addCar: writes.addCar,
  markReturned: writes.markReturned,
  extendBooking: writes.extendBooking,
  setMaintenance: writes.setMaintenance,
  sendRentedCarToMaintenance: writes.sendRentedCarToMaintenance,
  setAvailable: writes.setAvailable,
  setStaffUse: writes.setStaffUse,
  updateLocation: writes.updateLocation,
  updatePayment: writes.updatePayment,
  markSold: writes.markSold,
  addStaff: writes.addStaff,
  setStaffActive: writes.setStaffActive,
  addDriverWithPhone: writes.addDriverWithPhone,
  setStaffPhone: writes.setStaffPhone,
  addLocation: (b) => writes.addConfigItem("Location", b.name),
  addGarage: (b) => writes.addConfigItem("Garage", b.name),
  addDriver: (b) => writes.addConfigItem("Driver", b.name),
  updateConfigItem: writes.updateConfigItem,
  deleteConfigItem: writes.deleteConfigItem,
  updateSetting: writes.updateSetting,
  addCarNote: writes.addCarNote,
  addSubHire: writes.addSubHire,
  returnSubHire: writes.returnSubHire,
  updateSubHirePayment: writes.updateSubHirePayment,
  addFuel: writes.addFuel,
  editFuel: writes.editFuel,
  replaceVehicle: writes.replaceVehicle,
  addReservation: writes.addReservation,
  editReservation: writes.editReservation,
  deleteReservation: writes.deleteReservation,
  cancelReservation: writes.cancelReservation,
  addToBlacklist: writes.addToBlacklist,
  deleteFromBlacklist: writes.deleteFromBlacklist,
  addMaintenanceLog: writes.addMaintenanceLog,
  editMaintenanceLog: writes.editMaintenanceLog,
  addMaintenanceItem: writes.addMaintenanceItem,
  editMaintenanceItem: writes.editMaintenanceItem,
  deleteMaintenanceItem: writes.deleteMaintenanceItem,
  addMaintenanceUpdate: writes.addMaintenanceUpdate,
  addCustomerJob: writes.addCustomerJob,
  editCustomerJob: writes.editCustomerJob,
  addCustomerJobItem: writes.addCustomerJobItem,
  deleteCustomerJobItem: writes.deleteCustomerJobItem,
  addCustomerJobUpdate: writes.addCustomerJobUpdate,
  addLead: writes.addLead,
  addVendor: writes.addVendor,
  editVendor: writes.editVendor,
  deleteVendor: writes.deleteVendor,
  addVendorLocation: writes.addVendorLocation,
  deleteVendorLocation: writes.deleteVendorLocation,
  markNotificationRead: writes.markNotificationRead,
  markAllNotificationsRead: writes.markAllNotificationsRead,
  savePushSubscription: writes.savePushSubscription,
  deletePushSubscription: writes.deletePushSubscription,
  setNotificationTriggerEnabled: writes.setNotificationTriggerEnabled,
  setReceivesDriverDocumentReminders: writes.setReceivesDriverDocumentReminders,
  setCanManageDrivers: writes.setCanManageDrivers,
  addDriverV2: writes.addDriverV2,
  editDriver: writes.editDriver,
  addDriverDocument: writes.addDriverDocument,
  editDriverDocument: writes.editDriverDocument,
  deleteDriverDocument: writes.deleteDriverDocument,
  setReceivesAllReservationReminders: writes.setReceivesAllReservationReminders,
  addVendorCategory: writes.addVendorCategory,
  setVendorCategories: writes.setVendorCategories,
  addPart: writes.addPart,
  editPart: writes.editPart,
  deletePart: writes.deletePart,
  addServiceTemplate: writes.addServiceTemplate,
  editServiceTemplate: writes.editServiceTemplate,
  deleteServiceTemplate: writes.deleteServiceTemplate,
  addTemplatePart: writes.addTemplatePart,
  deleteTemplatePart: writes.deleteTemplatePart,
  assignServiceTemplate: writes.assignServiceTemplate,
  editCarServiceAssignment: writes.editCarServiceAssignment,
  removeServiceAssignment: writes.removeServiceAssignment,
  createWorkOrderFromTemplate: writes.createWorkOrderFromTemplate,
  addChecklistTemplate: writes.addChecklistTemplate,
  editChecklistTemplate: writes.editChecklistTemplate,
  deleteChecklistTemplate: writes.deleteChecklistTemplate,
  addChecklistTemplateItem: writes.addChecklistTemplateItem,
  deleteChecklistTemplateItem: writes.deleteChecklistTemplateItem,
  submitChecklist: writes.submitChecklist,
  editLead: writes.editLead,
  deleteLead: writes.deleteLead,
  markCarAvailable: writes.markCarAvailable,
  setServiceSchedule: writes.setServiceSchedule,
  // Files, signatures, agreements — formerly Google Drive
  uploadBlacklistImage: files.uploadBlacklistImage,
  storeSignature: files.storeSignature,
  storeStaffSignature: files.storeStaffSignature,
  deleteStaffSignature: files.deleteStaffSignature,
  uploadAgreement: files.uploadAgreement,
  logExport: files.logExport,
  createBackupSnapshot: files.createBackupSnapshot,
  enableDropboxSync: files.dropboxSyncUnavailable,
  disableDropboxSync: files.dropboxSyncUnavailable,
};

// The frontend POSTs with Content-Type: text/plain, so the platform may not
// parse the body. Read it robustly.
async function getRawBody(req) {
  if (typeof req.body === "string") return req.body;
  if (req.body && typeof req.body === "object") return JSON.stringify(req.body);
  return new Promise((resolve) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => resolve(d));
    req.on("error", () => resolve(""));
  });
}

// Serve a stored file (blacklist photo, signature, agreement PDF, backup).
async function serveFile(req, res) {
  const row = await files.readFile(req.query.id);
  if (!row) return res.status(404).json({ error: "File not found" });
  const disposition = req.query.download ? "attachment" : "inline";
  res.setHeader("Content-Type", row.mime_type || "application/octet-stream");
  res.setHeader("Content-Disposition", `${disposition}; filename="${String(row.filename || row.id).replace(/"/g, "")}"`);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable"); // ids are unique, content never changes
  return res.status(200).send(row.data);
}

// Forward an unmatched action to the legacy Apps Script and relay its response.
async function proxyToLegacy(req, res, rawBody) {
  if (!LEGACY) {
    res.status(200).json({ error: "Unknown action — this API serves Supabase and does not implement it." });
    return;
  }
  try {
    let target = LEGACY;
    const init = { method: req.method, redirect: "follow" };
    if (req.method === "GET") {
      const qs = new URLSearchParams(req.query).toString();
      target = LEGACY + (LEGACY.includes("?") ? "&" : "?") + qs;
    } else {
      init.headers = { "Content-Type": "text/plain;charset=utf-8" };
      init.body = rawBody;
    }
    const upstream = await fetch(target, init);
    const text = await upstream.text();
    res.setHeader("Content-Type", "application/json");
    res.status(upstream.status).send(text);
  } catch (err) {
    res.status(200).json({ error: "Legacy proxy failed: " + err.message });
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    if (req.method === "GET") {
      const action = req.query.action;
      if (action === "file") return await serveFile(req, res);
      const handlerFn = READS[action];
      if (handlerFn) {
        res.setHeader("Cache-Control", "no-store"); // live data — never cached by the browser or a proxy
        return res.status(200).json(await handlerFn(req.query));
      }
      return proxyToLegacy(req, res, "");
    }

    if (req.method === "POST") {
      const rawBody = await getRawBody(req);
      let body = {};
      try { body = JSON.parse(rawBody || "{}"); } catch { body = {}; }
      const handlerFn = WRITES[body.action];
      if (handlerFn) return res.status(200).json(await handlerFn(body));
      return proxyToLegacy(req, res, rawBody);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    // Mirror the Apps Script contract: errors come back as { error } with a 200,
    // which is what the frontend's api.js checks for.
    console.error("API error:", err);
    return res.status(200).json({ error: err.message });
  }
}
