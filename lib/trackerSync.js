// lib/trackerSync.js — the daily job that turns confirmed tracker matches
// into actual mileage data + the 100km/day alert. Runs from
// api/cron-tracker-sync.js (Vercel Cron, 6am Zanzibar time) and can also
// be triggered manually from the Tracking page for testing.
import crypto from "node:crypto";
import { q, run } from "./core.js";
import { getMileage, getLocations } from "./tracksolid.js";
import { isTokenError } from "./tracksolidToken.js";
import { reverseGeocode, distanceMeters, REGEOCODE_THRESHOLD_M } from "./geocode.js";

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
  const batches = chunk(confirmed, BATCH_SIZE);
  let attempted = 0;
  for (const batch of batches) {
    attempted++;
    const imeis = batch.map((r) => r.imei);
    try {
      const { totals } = await getMileage(imeis, beginUTC, endUTC);
      for (const t of totals) totalsByImei.set(t.imei, Number(t.totalMileage) || 0);
    } catch (err) {
      if (isTokenError(err)) {
        // No usable token means every remaining batch would fail identically
        // (a real sync once reported the same failure 15 times, and each
        // repeat was another request at an already-refusing rate limiter).
        // Stop here and say so once.
        batchErrors.push(`Stopped at batch ${attempted} of ${batches.length}: ${err.message}`);
        break;
      }
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

  // Notifications for over-limit cars were removed 2026-08-20 — the
  // Tracking page's table already flags them clearly (red row, ⚠️,
  // "Sort by distance"), so a separate bell/push alert was redundant.
  // over_limit is still saved on every row above; only the notify step
  // is gone.

  return { day, carsChecked: confirmed.length, saved, overLimit, skipped: confirmed.length - saved, batchErrors };
}

// Refreshes vehicle_location_latest for every confirmed car. Cache-only —
// "current location" on the Tracking page is only ever as fresh as the
// last Sync, per Ramzanali's explicit choice (not a live/real-time feed).
//
// Also reverse-geocodes each car's position into a real address (TrackSolid
// itself never provides one — see geocode.js), but only when the car has
// moved more than REGEOCODE_THRESHOLD_M since its last geocoded position —
// a car sitting parked reuses its existing address rather than triggering a
// fresh, billable lookup every single sync. Geocoding errors are per-car and
// non-fatal: one bad lookup (or the key not being configured at all) leaves
// that car with its previous address rather than failing the whole sync.
export async function syncVehicleLocations() {
  const confirmed = await q(`SELECT plate, imei FROM vehicle_tracker_map`);
  if (!confirmed.length) return { updated: 0, geocoded: 0 };

  const imeiToPlate = new Map(confirmed.map((r) => [r.imei, r.plate]));
  let locations;
  try {
    locations = await getLocations();
  } catch (err) {
    return { updated: 0, geocoded: 0, error: err.message };
  }

  const existingRows = await q(`SELECT plate, address, address_lat, address_lng FROM vehicle_location_latest`);
  const existingByPlate = new Map(existingRows.map((r) => [r.plate, r]));

  const toWrite = [];
  for (const l of locations) {
    const plate = imeiToPlate.get(l.imei);
    if (!plate) continue; // a device on the account that isn't one of our confirmed cars
    if (l.lat == null || l.lng == null) continue;
    toWrite.push({
      plate, imei: l.imei,
      lat: Number(l.lat), lng: Number(l.lng),
      speedKmh: Number(l.speed) || 0,
      accOn: String(l.accStatus) === "1",
      gpsTime: l.gpsTime || null,
    });
  }

  let geocoded = 0;
  let loggedGeocodeError = false; // log the underlying reason once per sync, not once per car
  for (const r of toWrite) {
    const prev = existingByPlate.get(r.plate);
    const moved = distanceMeters(prev?.address_lat, prev?.address_lng, r.lat, r.lng);
    if (prev?.address && moved < REGEOCODE_THRESHOLD_M) {
      // Hasn't moved enough to bother — reuse what we already have.
      r.address = prev.address; r.addressLat = Number(prev.address_lat); r.addressLng = Number(prev.address_lng);
      continue;
    }
    try {
      const address = await reverseGeocode(r.lat, r.lng);
      r.address = address || prev?.address || null;
      r.addressLat = r.lat; r.addressLng = r.lng;
      if (address) geocoded++;
    } catch (err) {
      // Leave it with whatever address it had before (possibly none) —
      // this is a convenience layer on top of the real location data, not
      // something worth failing the sync over.
      r.address = prev?.address || null;
      r.addressLat = prev?.address_lat != null ? Number(prev.address_lat) : null;
      r.addressLng = prev?.address_lng != null ? Number(prev.address_lng) : null;
      if (!loggedGeocodeError) { console.error("reverseGeocode failed: " + err.message); loggedGeocodeError = true; }
    }
  }

  const WRITE_CHUNK = 100;
  for (const rows of chunk(toWrite, WRITE_CHUNK)) {
    const values = [];
    const placeholders = rows.map((r, i) => {
      const base = i * 9;
      values.push(r.plate, r.imei, r.lat, r.lng, r.speedKmh, r.accOn, r.address, r.addressLat, r.addressLng);
      return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9}, now(), now())`;
    });
    await run(
      `INSERT INTO vehicle_location_latest (plate, imei, lat, lng, speed_kmh, acc_on, address, address_lat, address_lng, updated_at, address_updated_at)
       VALUES ${placeholders.join(",")}
       ON CONFLICT (plate) DO UPDATE SET
         imei=EXCLUDED.imei, lat=EXCLUDED.lat, lng=EXCLUDED.lng,
         speed_kmh=EXCLUDED.speed_kmh, acc_on=EXCLUDED.acc_on, updated_at=now(),
         address=EXCLUDED.address, address_lat=EXCLUDED.address_lat, address_lng=EXCLUDED.address_lng,
         address_updated_at=CASE WHEN EXCLUDED.address IS DISTINCT FROM vehicle_location_latest.address
           THEN now() ELSE vehicle_location_latest.address_updated_at END`,
      values
    );
  }

  return { updated: toWrite.length, geocoded };
}

// What the "Sync now" button and the nightly cron both actually call —
// mileage and location together, one click / one run, per Ramzanali's
// request that Sync cover both.
export async function runFullSync() {
  const mileage = await syncVehicleMileage();
  const location = await syncVehicleLocations();
  return { ...mileage, locationsUpdated: location.updated, locationsGeocoded: location.geocoded, locationError: location.error || null };
}
