// lib/trackerSync.js — the daily job that turns confirmed tracker matches
// into actual mileage data + the 100km/day alert. Runs from
// api/cron-tracker-sync.js (Vercel Cron, 6am Zanzibar time) and can also
// be triggered manually from the Tracking page for testing.
import crypto from "node:crypto";
import { q, run, notifyRole } from "./core.js";
import { getMileage } from "./tracksolid.js";

const DAILY_LIMIT_METERS = 100_000; // 100km, per the original ask

// "Yesterday" in Zanzibar-local terms, expressed as a UTC begin/end range
// for TrackSolid's API (which works in UTC regardless of account region —
// see lib/tracksolid.js). Zanzibar is a fixed UTC+3 offset (no DST), so
// "yesterday 00:00–24:00 in Zanzibar" is "the day before 21:00 UTC to
// yesterday 21:00 UTC".
function yesterdayRangeUTC() {
  const nowLocal = new Date(Date.now() + 3 * 3600 * 1000); // shifted to Zanzibar wall-clock
  const y = new Date(Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth(), nowLocal.getUTCDate() - 1));
  const dayStr = y.toISOString().slice(0, 10); // the Zanzibar calendar date being reported on

  const beginUTC = new Date(y.getTime() - 3 * 3600 * 1000); // yesterday 00:00 Zanzibar -> UTC
  const endUTC = new Date(beginUTC.getTime() + 24 * 3600 * 1000); // + 24h = today 00:00 Zanzibar -> UTC
  const fmt = (d) => d.toISOString().slice(0, 19).replace("T", " ");
  return { day: dayStr, beginUTC: fmt(beginUTC), endUTC: fmt(endUTC) };
}

// TrackSolid accepts a comma-separated imeis list in one call — batching
// keeps this to a handful of requests total instead of one per car. Kept
// deliberately small (not the API's real limit, which is unknown) after
// a 40-IMEI request came back as a non-JSON error response — very likely
// the request URL got too long for something in TrackSolid's stack. 15
// IMEIs keeps the URL comfortably short regardless of the actual cause.
const BATCH_SIZE = 20;
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function syncVehicleMileage() {
  const { day, beginUTC, endUTC } = yesterdayRangeUTC();
  const confirmed = await q(`SELECT plate, imei FROM vehicle_tracker_map`);
  if (!confirmed.length) {
    return { day, carsChecked: 0, saved: 0, overLimit: 0, skipped: 0 };
  }

  // imei -> totalMileage(meters), collected across all batches
  const totalsByImei = new Map();
  const batchErrors = []; // surfaced back to the caller — a swallowed
  // error here previously showed up as a misleadingly clean "0 updated,
  // 289 had no tracker data" with zero indication anything had failed.
  for (const batch of chunk(confirmed, BATCH_SIZE)) {
    const imeis = batch.map((r) => r.imei);
    try {
      const { totals } = await getMileage(imeis, beginUTC, endUTC);
      for (const t of totals) totalsByImei.set(t.imei, Number(t.totalMileage) || 0);
    } catch (err) {
      batchErrors.push(`Batch of ${imeis.length} cars: ${err.message}`);
    }
    // ~20 batches for the full fleet — same rate-limit lesson as
    // getDeviceList's sub-account loop, applied here too.
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  let saved = 0, overLimit = 0;
  const toWrite = []; // build the whole list first, then write in a few bulk statements
  for (const { plate, imei } of confirmed) {
    if (!totalsByImei.has(imei)) continue; // omitted silently, per Ramzanali's Phase 2 decision — no row written
    const distanceM = totalsByImei.get(imei);
    const isOverLimit = distanceM > DAILY_LIMIT_METERS;
    toWrite.push({ plate, imei, distanceM, isOverLimit });
    saved++;
    if (isOverLimit) overLimit++;
  }

  // Bulk upsert instead of one awaited INSERT per car — with 289 confirmed
  // cars, 289 sequential round-trips to Supabase was very likely the real
  // reason the whole request ran long enough to hit Vercel's gateway
  // timeout (HTTP 504) even though every individual piece of work — the
  // TrackSolid calls, the notifications — had already succeeded by then.
  // WRITE_CHUNK keeps each statement's parameter count sane, not because
  // Postgres needs it for this size, but so one oversized statement can't
  // become its own slow point.
  const WRITE_CHUNK = 100;
  for (const rows of chunk(toWrite, WRITE_CHUNK)) {
    const values = [];
    const placeholders = rows.map((r, i) => {
      const id = "VM-" + crypto.randomUUID().split("-")[0].toUpperCase();
      const base = i * 6;
      values.push(id, r.plate, r.imei, day, r.distanceM, r.isOverLimit);
      return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},'TRUE', now())`;
    });
    await run(
      `INSERT INTO vehicle_mileage_daily (id, plate, imei, day, distance_m, over_limit, had_data, synced_at)
       VALUES ${placeholders.join(",")}
       ON CONFLICT (plate, day) DO UPDATE SET
         imei=EXCLUDED.imei, distance_m=EXCLUDED.distance_m,
         over_limit=EXCLUDED.over_limit, had_data='TRUE', synced_at=now()`,
      values
    );
  }

  // Route through notifyRole (Admin + Manager) — matches how every other
  // trigger in this app decides recipients. Run concurrently rather than
  // one row/role at a time — same reasoning as the bulk write above.
  if (overLimit > 0) {
    const overLimitRows = await q(
      `SELECT plate, distance_m FROM vehicle_mileage_daily WHERE day=$1 AND over_limit='TRUE'`,
      [day]
    );
    await Promise.all(overLimitRows.flatMap((row) => {
      const km = (Number(row.distance_m) / 1000).toFixed(1);
      const payload = {
        type: "tracker_over_limit",
        title: `${row.plate} drove ${km}km on ${day}`,
        message: `Over the 100km/day threshold.`,
        linkPath: "/tracking",
        dedupeKey: `tracker_over_limit:${row.plate}:${day}`,
      };
      return [notifyRole("Admin", payload), notifyRole("Manager", payload)];
    }));
  }

  return { day, carsChecked: confirmed.length, saved, overLimit, skipped: confirmed.length - saved, batchErrors };
}
