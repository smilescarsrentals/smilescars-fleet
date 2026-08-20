// api/cron-tracker-sync.js — invoked by Vercel Cron once daily at 6am
// Zanzibar time (see vercel.json for the UTC schedule). Pulls yesterday's
// mileage AND the latest location for every confirmed car from
// TrackSolid, checks the 100km/day threshold. Logs to system_health_log
// every run, same as cron-notifications.js, so "did last night's sync
// actually run" is answerable from data.
//
// Secured with CRON_SECRET — see cron-notifications.js for the same note.
import { runFullSync } from "../lib/trackerSync.js";
import { run } from "../lib/core.js";
import crypto from "node:crypto";

async function logHealth(status, detail) {
  try {
    const id = "SHL-" + crypto.randomUUID().split("-")[0].toUpperCase();
    await run(`INSERT INTO system_health_log (id, job_name, status, detail) VALUES ($1,$2,$3,$4)`,
      [id, "cron-tracker-sync", status, detail || ""]);
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

  try {
    const result = await runFullSync();
    await logHealth("success", `day:${result.day} checked:${result.carsChecked} saved:${result.saved} overLimit:${result.overLimit} skipped:${result.skipped} locations:${result.locationsUpdated}`);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error("Cron tracker sync error:", err);
    await logHealth("failure", err.message);
    return res.status(200).json({ error: err.message });
  }
}
