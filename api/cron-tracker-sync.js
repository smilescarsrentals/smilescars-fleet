// api/cron-tracker-sync.js — invoked by Vercel Cron once daily at 6am
// Zanzibar time (see vercel.json for the UTC schedule). Pulls yesterday's
// mileage AND the latest location for every confirmed car from
// TrackSolid, checks the 100km/day threshold. Logs to system_health_log
// every run, same as cron-notifications.js, so "did last night's sync
// actually run" is answerable from data.
//
// Also runs the daily Workflows PDF cleanup (deletes invoice PDFs older
// than 14 days) as an independent step below — a failure in one job never
// blocks or gets conflated with the other, each logs its own
// system_health_log row under its own job_name.
//
// Secured with CRON_SECRET — see cron-notifications.js for the same note.
import { runFullSync } from "../lib/trackerSync.js";
import { run } from "../lib/core.js";
import { deleteExpiredWorkflowInvoicePdfs } from "../lib/writes.js";
import crypto from "node:crypto";

async function logHealth(jobName, status, detail) {
  try {
    const id = "SHL-" + crypto.randomUUID().split("-")[0].toUpperCase();
    await run(`INSERT INTO system_health_log (id, job_name, status, detail) VALUES ($1,$2,$3,$4)`,
      [id, jobName, status, detail || ""]);
  } catch (e) {
    console.error("logHealth failed:", e.message);
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

  let trackerResult = null, trackerError = null;
  try {
    trackerResult = await runFullSync();
    await logHealth("cron-tracker-sync", "success",
      `day:${trackerResult.day} checked:${trackerResult.carsChecked} saved:${trackerResult.saved} overLimit:${trackerResult.overLimit} skipped:${trackerResult.skipped} locations:${trackerResult.locationsUpdated}`);
  } catch (err) {
    console.error("Cron tracker sync error:", err);
    trackerError = err.message;
    await logHealth("cron-tracker-sync", "failure", err.message);
  }

  let cleanupResult = null, cleanupError = null;
  try {
    cleanupResult = await deleteExpiredWorkflowInvoicePdfs();
    await logHealth("cron-workflow-pdf-cleanup", "success", `deleted:${cleanupResult.deleted}`);
  } catch (err) {
    console.error("Cron workflow PDF cleanup error:", err);
    cleanupError = err.message;
    await logHealth("cron-workflow-pdf-cleanup", "failure", err.message);
  }

  return res.status(200).json({
    success: !trackerError && !cleanupError,
    ...(trackerResult || {}),
    ...(trackerError ? { trackerError } : {}),
    workflowPdfCleanup: cleanupResult || { error: cleanupError },
  });
}
