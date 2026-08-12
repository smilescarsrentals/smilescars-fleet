// api/cron-notifications.js — invoked by Vercel Cron 3x/day (9am, 2pm,
// 4:30pm EAT, see vercel.json for the UTC schedule). Runs every time-based
// check that can't be triggered by a user action: the 24h reservation
// reminder, the unpaid-customer-job check, the disabled-trigger reminder,
// the storage threshold check, and driver document expiry. Every run logs
// itself to system_health_log (success or failure) so "is this actually
// running" is answerable from data rather than assumed from silence.
//
// Secured with CRON_SECRET so this can't be hit by anyone who finds the
// URL — Vercel Cron sends this automatically as a Bearer token when the
// env var is set; see https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
import { checkReservationReminders, checkUnpaidCustomerJobs, checkDisabledTriggers, checkStorageUsage, checkDriverDocumentExpiry } from "../lib/notificationTriggers.js";
import { run } from "../lib/core.js";
import crypto from "node:crypto";

async function logHealth(status, detail) {
  try {
    const id = "SHL-" + crypto.randomUUID().split("-")[0].toUpperCase();
    await run(`INSERT INTO system_health_log (id, job_name, status, detail) VALUES ($1,$2,$3,$4)`,
      [id, "cron-notifications", status, detail || ""]);
  } catch (e) {
    console.error("logHealth failed:", e.message); // never let logging itself break the actual job
  }
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${secret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  try {
    const [reminders, unpaid, disabledTriggers, storage, driverDocs] = await Promise.all([
      checkReservationReminders(),
      checkUnpaidCustomerJobs(),
      checkDisabledTriggers(),
      checkStorageUsage(),
      checkDriverDocumentExpiry(),
    ]);
    await logHealth("success", `reminders:${reminders.created} unpaid:${unpaid.created} disabledTriggers:${disabledTriggers.created} storageMB:${storage.mb.toFixed(0)} driverDocs:${driverDocs.created}`);
    return res.status(200).json({ success: true, reminders, unpaid, disabledTriggers, storage, driverDocs });
  } catch (err) {
    console.error("Cron notifications error:", err);
    await logHealth("failure", err.message);
    return res.status(200).json({ error: err.message });
  }
}
