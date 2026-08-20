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
// keeps this to a handful of requests total instead of one per car, which
// matters given the rate-limit lesson from 2026-08-20.
const BATCH_SIZE = 40;
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
  for (const batch of chunk(confirmed, BATCH_SIZE)) {
    const imeis = batch.map((r) => r.imei);
    try {
      const { totals } = await getMileage(imeis, beginUTC, endUTC);
      for (const t of totals) totalsByImei.set(t.imei, Number(t.totalMileage) || 0);
    } catch (err) {
      // One bad batch shouldn't take down the whole night's sync — the
      // cars in it simply come out as "no data" for today, same as a
      // tracker being offline. Logged by the caller (cron-tracker-sync.js)
      // via system_health_log's detail field either way.
      console.error(`Tracker sync: batch failed (${imeis.length} cars) — ${err.message}`);
    }
  }

  let saved = 0, overLimit = 0, skipped = 0;
  for (const { plate, imei } of confirmed) {
    const hasData = totalsByImei.has(imei);
    if (!hasData) { skipped++; continue; } // omitted silently, per Ramzanali's Phase 2 decision — no row written
    const distanceM = totalsByImei.get(imei);
    const isOverLimit = distanceM > DAILY_LIMIT_METERS;
    const id = "VM-" + crypto.randomUUID().split("-")[0].toUpperCase();
    await run(
      `INSERT INTO vehicle_mileage_daily (id, plate, imei, day, distance_m, over_limit, had_data, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,'TRUE', now())
       ON CONFLICT (plate, day) DO UPDATE SET imei=$3, distance_m=$5, over_limit=$6, had_data='TRUE', synced_at=now()`,
      [id, plate, imei, day, distanceM, isOverLimit]
    );
    saved++;
    if (isOverLimit) overLimit++;
  }

  // Route through notifyRole (Admin + Manager) — matches how every other
  // trigger in this app decides recipients.
  if (overLimit > 0) {
    const overLimitRows = await q(
      `SELECT plate, distance_m FROM vehicle_mileage_daily WHERE day=$1 AND over_limit='TRUE'`,
      [day]
    );
    for (const row of overLimitRows) {
      const km = (Number(row.distance_m) / 1000).toFixed(1);
      await notifyRole("Admin", {
        type: "tracker_over_limit",
        title: `${row.plate} drove ${km}km on ${day}`,
        message: `Over the 100km/day threshold.`,
        linkPath: "/tracking",
        dedupeKey: `tracker_over_limit:${row.plate}:${day}`,
      });
      await notifyRole("Manager", {
        type: "tracker_over_limit",
        title: `${row.plate} drove ${km}km on ${day}`,
        message: `Over the 100km/day threshold.`,
        linkPath: "/tracking",
        dedupeKey: `tracker_over_limit:${row.plate}:${day}`,
      });
    }
  }

  return { day, carsChecked: confirmed.length, saved, overLimit, skipped };
}
