// api/cron-notifications.js — invoked by Vercel Cron 3x/day (9am, 2pm,
// 4:30pm EAT, see vercel.json for the UTC schedule). Runs the two
// time-based notification checks that can't be triggered by a user action:
// the 24h reservation reminder and the unpaid-customer-job check.
//
// Secured with CRON_SECRET so this can't be hit by anyone who finds the
// URL — Vercel Cron sends this automatically as a Bearer token when the
// env var is set; see https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
import { checkReservationReminders, checkUnpaidCustomerJobs } from "../lib/notificationTriggers.js";

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${secret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  try {
    const [reminders, unpaid] = await Promise.all([
      checkReservationReminders(),
      checkUnpaidCustomerJobs(),
    ]);
    return res.status(200).json({ success: true, reminders, unpaid });
  } catch (err) {
    console.error("Cron notifications error:", err);
    return res.status(200).json({ error: err.message });
  }
}
