// lib/notificationTriggers.js — the two time-based notification checks
// (everything else fires immediately from the action that caused it, in
// lib/writes.js). Both are called by api/cron-notifications.js on Vercel
// Cron's schedule (9am / 2pm / 4:30pm EAT). Dedup keys include the date so
// re-running within the same day never double-notifies, even if the cron
// fires more than once or a run is retried.
import { q, todayTZ, createNotification, notifyRole } from "./core.js";

// Backup plan for a notification trigger left disabled: a reminder to
// Admin/Manager if it's been off for 7+ days, so a "temporarily" disabled
// trigger doesn't stay silently off for months unnoticed. Deduped per
// trigger per day, same as the other checks, so this doesn't nag more than
// once a day even across 3 cron runs.
export async function checkDisabledTriggers() {
  const today = todayTZ();
  const rows = await q(
    `SELECT type, label, updated_by, updated_at FROM notification_trigger_settings
      WHERE enabled = 'FALSE' AND updated_at <= (now() - interval '7 days')`
  );
  let created = 0;
  for (const t of rows) {
    const payload = {
      type: "trigger_disabled_reminder",
      title: `"${t.label}" notifications have been off for over a week`,
      message: (t.updated_by ? `Disabled by ${t.updated_by}. ` : "") + "Check Admin Panel → Notifications to re-enable.",
      linkPath: "/",
    };
    const dedupeKey = `trigger_disabled:${t.type}:${today}`;
    await notifyRole("Admin", { ...payload, dedupeKey });
    await notifyRole("Manager", { ...payload, dedupeKey });
    created++;
  }
  return { checked: rows.length, created };
}

// #1 — storage monitoring. Free-tier Supabase caps at 500MB; this warns
// well before that, so there's time to act (compress more aggressively,
// move to object storage, or upgrade) rather than finding out when writes
// start failing. Deduped per day so it doesn't repeat 3x/day once past
// the threshold.
export async function checkStorageUsage() {
  const today = todayTZ();
  const row = await q(`SELECT pg_database_size(current_database()) AS bytes`);
  const bytes = Number(row[0]?.bytes) || 0;
  const mb = bytes / (1024 * 1024);
  const THRESHOLD_MB = 350; // ~70% of the 500MB free tier

  if (mb >= THRESHOLD_MB) {
    await notifyRole("Admin", {
      type: "storage_threshold", title: "Database storage is getting full",
      message: `Currently using ${mb.toFixed(0)}MB. Free tier caps at 500MB — consider archiving old invoice photos or upgrading the plan.`,
      linkPath: "/", dedupeKey: `storage_threshold:${today}`,
    });
    return { mb, overThreshold: true };
  }
  return { mb, overThreshold: false };
}

// Trigger #1 — 24h reservation reminder. The booking's own staff member
// gets notified about their own reservation; any staff member flagged
// receives_all_reservation_reminders gets notified about EVERY reservation
// due tomorrow, not just their own.
export async function checkReservationReminders() {
  const today = todayTZ();
  const rows = await q(
    `SELECT id, plate, client_name, staff_name, pickup_date
       FROM reservations
      WHERE status = 'Active'
        AND pickup_date = (date($1) + interval '1 day')::date`,
    [today]
  );

  const allStaff = await q(`SELECT value FROM config WHERE type='Staff' AND COALESCE(active,'TRUE')='TRUE' AND COALESCE(receives_all_reservation_reminders,'FALSE')='TRUE'`);
  let created = 0;

  for (const r of rows) {
    const title = `Pickup tomorrow: ${r.client_name}`;
    const message = `${r.plate || "No car assigned yet"} — pickup on ${r.pickup_date}.`;
    const linkPath = "/reservations";

    if (r.staff_name) {
      const id = await createNotification({
        recipient: r.staff_name, type: "reservation_reminder", title, message, linkPath,
        dedupeKey: `res_reminder:${r.id}:${today}`,
      });
      if (id) created++;
    }
    for (const s of allStaff) {
      if (s.value === r.staff_name) continue; // already notified above, don't double up
      const id = await createNotification({
        recipient: s.value, type: "reservation_reminder", title, message, linkPath,
        dedupeKey: `res_reminder:${r.id}:${today}:${s.value}`,
      });
      if (id) created++;
    }
  }
  return { checked: rows.length, created };
}

// Trigger #2 — Customer Job unpaid 3+ days after completion. Notifies
// Admin/Manager once per job per day it remains unpaid past the
// threshold (not just once ever), since an unpaid job sitting for a week
// is worth repeated visibility, not a single notification that gets
// buried and forgotten.
export async function checkUnpaidCustomerJobs() {
  const today = todayTZ();
  const rows = await q(
    `SELECT id, ref_no, customer_name, price_charged, date_closed
       FROM customer_jobs
      WHERE status = 'Completed'
        AND payment_status != 'Paid'
        AND date_closed IS NOT NULL
        AND date_closed <= (now() - interval '3 days')`
  );

  let created = 0;
  for (const j of rows) {
    const title = `Unpaid job: ${j.customer_name}`;
    const message = `${j.ref_no || j.id} — TZS ${Number(j.price_charged || 0).toLocaleString()} still outstanding, completed over 3 days ago.`;
    const payload = { type: "unpaid_customer_job", title, message, linkPath: "/garage/customer-jobs" };
    const dedupeKey = `unpaid_job:${j.id}:${today}`;
    await notifyRole("Admin", { ...payload, dedupeKey });
    await notifyRole("Manager", { ...payload, dedupeKey });
    created++;
  }
  return { checked: rows.length, created };
}

// Driver document expiry — fires two reminders per document (30 days and
// 7 days before expiry), to any staff member flagged
// receives_driver_document_reminders. Deduped by document+threshold+
// recipient, same shape as every other check here, so each reminder
// point fires once per document per person, not every cron run while
// within range.
export async function checkDriverDocumentExpiry() {
  const today = todayTZ();
  const rows = await q(
    `SELECT dd.id, dd.doc_type, dd.label, dd.expiry_date, d.name AS driver_name
       FROM driver_documents dd JOIN drivers d ON d.id = dd.driver_id
      WHERE dd.expiry_date IS NOT NULL
        AND d.active = 'TRUE'
        AND dd.expiry_date::date IN (
          (date($1) + interval '30 days')::date,
          (date($1) + interval '7 days')::date
        )`,
    [today]
  );
  const recipients = await q(`SELECT value FROM config WHERE type='Staff' AND COALESCE(active,'TRUE')='TRUE' AND COALESCE(receives_driver_document_reminders,'FALSE')='TRUE'`);

  let created = 0;
  for (const doc of rows) {
    const daysLeft = Math.round((new Date(doc.expiry_date).getTime() - new Date(today).getTime()) / 86400000);
    const docLabel = doc.doc_type === "Other" && doc.label ? doc.label : doc.doc_type;
    const title = `${docLabel} for ${doc.driver_name} expires in ${daysLeft} days`;
    const message = `Expires ${doc.expiry_date}.`;
    for (const s of recipients) {
      const id = await createNotification({
        recipient: s.value, type: "driver_document_expiry", title, message, linkPath: "/drivers",
        dedupeKey: `driver_doc_expiry:${doc.id}:${daysLeft}:${s.value}`,
      });
      if (id) created++;
    }
  }
  return { checked: rows.length, created };
}
