// lib/reservationResolve.js — DB layer around lib/reservationMatch.js.
//
// When a car goes out (Fleet checkout or Sub-Hire) for a client who has a
// reservation with NO car assigned, that reservation's "needs a car" alert
// should clear on its own. Two entry points:
//   - resolveUnassignedReservationForEvent: called right at checkout/sub-hire
//     time, so the alert clears immediately.
//   - reconcileUnassignedReservations: safety net run from the cron —
//     catches checkouts that happened before this existed, or via a path
//     that doesn't call the real-time hook.
//
// A resolved reservation becomes Fulfilled (which every "needs a car" /
// "pickup due" surface excludes) and gets the car's plate attached, plus a
// remark saying exactly what matched, so it's auditable from the reservation
// itself. Each event can resolve at most one reservation, and `resolved_by`
// ("history:4079" / "subhire:SH-123456") records which event did it — so the
// cron can never let the same event resolve a second reservation later.
import { q, run, todayTZ } from "./core.js";
import {
  pickReservationForEvent, nameTier, pickupInWindow, addDays, NAME_TIER, DAYS_BEFORE, DAYS_AFTER,
} from "./reservationMatch.js";

const LOOKBACK_DAYS = 10;

const REASON_TEXT = {
  "name-exact": "same client name",
  "name-contains": "client name matches",
  "name-token": "client name matches, allowing for word order/abbreviation",
  "name-fuzzy": "client name matches, allowing for a typo",
};

// Open reservations with no car yet (never Transfers — those don't need one).
async function loadOpenUnassigned(fromDate, toDate) {
  const rows = await q(
    `SELECT id, client_name, car_type, pickup_date::date::text AS pickup
       FROM reservations
      WHERE status = 'Active'
        AND COALESCE(plate, '') = ''
        AND COALESCE(booking_type, '') <> 'Transfer'
        AND pickup_date::date BETWEEN $1::date AND $2::date`,
    [fromDate, toDate]
  );
  return rows.map((r) => ({ id: r.id, clientName: r.client_name || "", carType: r.car_type || "", pickup: r.pickup }));
}

// Reservations where STAFF already assigned a plate (resolved_by IS NULL
// excludes ones this module assigned itself — otherwise a car reused by a
// second client a day or two later would wrongly look "already spoken for").
async function loadStaffAssigned(fromDate, toDate) {
  const rows = await q(
    `SELECT plate, client_name, pickup_date::date::text AS pickup
       FROM reservations
      WHERE COALESCE(plate, '') <> ''
        AND resolved_by IS NULL
        AND status IN ('Active', 'Fulfilled')
        AND pickup_date::date BETWEEN $1::date AND $2::date`,
    [fromDate, toDate]
  );
  return rows.map((r) => ({ plate: r.plate, clientName: r.client_name || "", pickup: r.pickup }));
}

// If this plate was already reserved for THIS client by staff, the event
// belongs to that reservation (reconcileFulfilledReservations handles it) —
// it must not also consume a different, still-unassigned booking (e.g. a
// client who reserved two cars, only one assigned so far).
function explainedByAssignedReservation(ev, staffAssigned) {
  if (!ev.plate) return false;
  return staffAssigned.some((r) =>
    r.plate === ev.plate && pickupInWindow(r.pickup, ev.eventDate) && nameTier(ev.client, r.clientName) > 0);
}

async function applyResolution(pick, ev) {
  const label = ev.source === "subhire" ? "sub-hire" : "checkout";
  const carBit = ev.plate ? `car ${ev.plate}` : "a sub-hired car";
  const note = `Auto-fulfilled ${todayTZ()}: ${carBit} went out on ${label} to "${String(ev.client).trim()}" (${REASON_TEXT[pick.reason]}).`;
  const n = await run(
    `UPDATE reservations
        SET plate = CASE WHEN $2 <> '' THEN $2 ELSE plate END,
            status = 'Fulfilled',
            resolved_by = $3,
            remarks = CASE WHEN COALESCE(remarks, '') = '' THEN $4 ELSE remarks || ' | ' || $4 END
      WHERE id = $1 AND status = 'Active' AND COALESCE(plate, '') = ''`,
    [pick.reservation.id, ev.plate || "", `${ev.source}:${ev.sourceId}`, note]
  );
  return n > 0;
}

// Shared core: decide + apply for one event against already-loaded data.
// On success the consumed reservation is removed from ctx.cands so a later
// event in the same pass can't take it again.
async function resolveWithContext(ev, ctx, opts) {
  if (!String(ev.client || "").trim() || !ev.eventDate) return { resolved: false };
  if (explainedByAssignedReservation(ev, ctx.staffAssigned)) return { resolved: false, reason: "plate-already-reserved" };
  const pick = pickReservationForEvent(ev, ctx.cands, opts);
  if (!pick) return { resolved: false };
  if (pick.ambiguous) return { resolved: false, ambiguous: true };
  const ok = await applyResolution(pick, ev);
  if (ok) ctx.cands = ctx.cands.filter((c) => c.id !== pick.reservation.id);
  return { resolved: ok, reservationId: pick.reservation.id, reason: pick.reason };
}

// ev: { source: "history"|"subhire", sourceId, client, carType, plate, eventDate: "YYYY-MM-DD" }
export async function resolveUnassignedReservationForEvent(ev) {
  if (!ev || !ev.eventDate) return { resolved: false };
  const from = addDays(ev.eventDate, -DAYS_BEFORE), to = addDays(ev.eventDate, DAYS_AFTER);
  const [cands, staffAssigned] = await Promise.all([loadOpenUnassigned(from, to), loadStaffAssigned(from, to)]);
  return resolveWithContext(ev, { cands, staffAssigned }, {});
}

// Cron safety net. Replays recent Fleet checkouts and Sub-Hires (oldest
// first) through the same resolver, skipping any event that already
// resolved a reservation. Data is loaded once for the whole span.
//
// Two passes: exact-name matches across ALL events first, then the looser
// matches (contains / word-order / typo) on whatever is left. Otherwise a
// loose match on an early event could take a reservation that a later event
// matches exactly — strongest evidence has to win.
export async function reconcileUnassignedReservations() {
  const used = new Set(
    (await q(`SELECT resolved_by FROM reservations WHERE resolved_by IS NOT NULL`)).map((r) => r.resolved_by)
  );

  const historyRows = await q(
    `SELECT h.id, h.plate, h.client, h.timestamp::date::text AS ev_date, h.timestamp AS ts, f.type AS car_type
       FROM history h LEFT JOIN fleet f ON f.plate = h.plate
      WHERE h.action = 'Checked Out'
        AND COALESCE(h.is_replacement, 'FALSE') <> 'TRUE'
        AND h.timestamp >= now() - make_interval(days => $1)`,
    [LOOKBACK_DAYS]
  );
  const subRows = await q(
    `SELECT id, plate_no, client, vehicle_description, timestamp::date::text AS ev_date, timestamp AS ts
       FROM sub_hire
      WHERE timestamp >= now() - make_interval(days => $1)`,
    [LOOKBACK_DAYS]
  );

  const events = [
    ...historyRows.map((r) => ({ source: "history", sourceId: String(r.id), client: r.client, carType: r.car_type || "", plate: r.plate || "", eventDate: r.ev_date, ts: r.ts })),
    ...subRows.map((r) => ({ source: "subhire", sourceId: String(r.id), client: r.client, carType: r.vehicle_description || "", plate: r.plate_no || "", eventDate: r.ev_date, ts: r.ts })),
  ].sort((a, b) => new Date(a.ts) - new Date(b.ts));
  if (!events.length) return { resolved: 0, examined: 0 };

  const first = events[0].eventDate, last = events[events.length - 1].eventDate;
  const from = addDays(first, -DAYS_BEFORE), to = addDays(last, DAYS_AFTER);
  const ctx = { cands: await loadOpenUnassigned(from, to), staffAssigned: await loadStaffAssigned(from, to) };

  let resolved = 0;
  const done = new Set();
  const examined = events.filter((ev) => !used.has(`${ev.source}:${ev.sourceId}`)).length;
  for (const minTier of [NAME_TIER.exact, NAME_TIER.fuzzy]) {
    for (const ev of events) {
      const key = `${ev.source}:${ev.sourceId}`;
      if (used.has(key) || done.has(key)) continue;
      try {
        const res = await resolveWithContext(ev, ctx, { minTier });
        if (res.resolved) { resolved++; done.add(key); }
      } catch (err) {
        console.error(`reconcileUnassignedReservations: ${key} failed: ${err.message}`);
      }
    }
  }
  return { resolved, examined };
}
