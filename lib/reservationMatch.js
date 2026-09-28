// lib/reservationMatch.js — pure matching logic (no DB, no I/O) for deciding
// which still-unassigned reservation, if any, a Fleet checkout or Sub-Hire
// belongs to. Kept separate from the DB layer so it can be tested against
// real-looking names without a database.
//
// Design bias: PRECISION over recall. A leftover "needs a car" alert is
// visible and harmless; a wrongly-cleared one can mean a customer turns up
// with no car ready. So when in doubt, this returns "no match" and the alert
// stays. Specifically:
//   - The CLIENT NAME decides (tolerating case, spacing, punctuation, word
//     order, abbreviations and small typos — see nameTier).
//   - Car type is only ever a tiebreaker between a client's own bookings.
//     It is NEVER enough on its own: real data showed type-only matching
//     clears the wrong booking (a walk-in's Alphard "fulfilling" an agency's
//     Alphard booking) and steals the reservation from the checkout that
//     actually belongs to it, which carries a recognisable name fragment
//     ("Auto U Heidi" for "Heidi Lum / Auto Union").
//   - One event resolves at most ONE reservation.
//   - If two DIFFERENT clients' reservations are equally plausible, it does
//     not guess.

// A reservation's pickup may be up to DAYS_BEFORE days BEFORE the event (a
// booking whose car went out late) or DAYS_AFTER days AFTER it (a client
// collecting early — rare, so kept tight).
export const DAYS_BEFORE = 10;
export const DAYS_AFTER = 2;

export const NAME_TIER = { none: 0, fuzzy: 1, token: 2, contains: 3, exact: 4 };

// Words that say nothing about WHO the client is.
const GENERIC_TOKENS = new Set([
  "and", "the", "ltd", "limited", "co", "company", "inc", "llc", "travel", "travels",
  "tours", "tour", "safari", "safaris", "group", "international", "services", "service",
  "holdings", "trading", "tanzania", "foundation",
]);

function stripDiacritics(s) {
  return String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Lowercase letters/digits only: makes "Aga Khan", "agakhan" and "AGA-KHAN"
// identical, and strips the stray tabs/trailing spaces seen in real data.
export function compact(s) {
  return stripDiacritics(s).replace(/[^a-z0-9]/g, "");
}

// Distinctive words of a name: 3+ letters, not generic. ("Auto U Heidi" ->
// auto, heidi. The lone "U" is dropped.)
function distinctiveTokens(s) {
  return new Set(
    stripDiacritics(s).split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !GENERIC_TOKENS.has(t))
  );
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

// How strongly two client names look like the same client.
export function nameTier(a, b) {
  const x = compact(a), y = compact(b);
  if (!x || !y) return NAME_TIER.none;
  if (x === y) return NAME_TIER.exact;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  // "waljis" inside "waljisrukkaiya". The >=5 floor stops tiny fragments
  // ("ali", "sean") from matching half the client list.
  if (short.length >= 5 && long.includes(short)) return NAME_TIER.contains;

  // Word-order / abbreviation tolerant: "Sojitz - Takuma" = "Takuma Sojitz";
  // "Auto U Heidi" ~ "Heidi Lum / Auto Union". Every distinctive word of the
  // smaller name must appear in the other (2+ words, 8+ letters in total), so
  // one shared first name or agency word is never enough — "Make My Safari /
  // Nadeem" does not match "Make My Safari / Mehnoor".
  const ta = distinctiveTokens(a), tb = distinctiveTokens(b);
  const [small, big] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  if (small.size >= 2) {
    const all = [...small].every((t) => big.has(t));
    const letters = [...small].reduce((n, t) => n + t.length, 0);
    if (all && letters >= 8) return NAME_TIER.token;
  }

  // Typos: one edit on a reasonably long name, two on a very long one.
  const dist = levenshtein(x, y);
  if (short.length >= 8 && dist <= 1) return NAME_TIER.fuzzy;
  if (short.length >= 14 && dist <= 2) return NAME_TIER.fuzzy;
  return NAME_TIER.none;
}

// Does a reservation's requested car type fit a car type (Fleet) or a
// free-text vehicle description (Sub-Hire, e.g. "Toyota Alphard 2019 white")?
// Used only to prefer one of a client's own bookings over another.
export function typesMatch(reservedType, carTypeOrDesc) {
  const x = compact(reservedType), y = compact(carTypeOrDesc);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  // "harrier" fits "newharrier"; "prado120" does NOT fit "prado150".
  return short.length >= 4 && long.includes(short);
}

// Date helpers on plain "YYYY-MM-DD" strings (no timezone surprises).
function toDayNumber(dateStr) {
  const [y, m, d] = String(dateStr).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}
export function addDays(dateStr, n) {
  const dn = toDayNumber(dateStr);
  if (dn == null) return dateStr;
  return new Date((dn + n) * 86400000).toISOString().slice(0, 10);
}

// Is a reservation's pickup date close enough to an event date to be a
// candidate for it at all?
export function pickupInWindow(pickup, eventDate) {
  const pd = toDayNumber(pickup), ed = toDayNumber(eventDate);
  if (pd == null || ed == null) return false;
  const diff = pd - ed;
  return diff >= -DAYS_BEFORE && diff <= DAYS_AFTER;
}

// event:        { client, carType, plate, eventDate }
// reservations: [{ id, clientName, carType, pickup }]  — already filtered to
//               Active, no plate, not a Transfer.
// opts.minTier: ignore name matches weaker than this (lets the cron resolve
//               exact-name events across the whole window BEFORE weaker ones,
//               so a loose match can't take a reservation that a stronger one
//               would have claimed).
// Returns null, { ambiguous: true }, or
//   { reservation, reason: "name-exact"|"name-contains"|"name-token"|"name-fuzzy" }
export function pickReservationForEvent(event, reservations, opts = {}) {
  const minTier = opts.minTier ?? NAME_TIER.fuzzy;
  const evDay = toDayNumber(event.eventDate);
  if (evDay == null) return null;

  const named = [];
  for (const r of reservations) {
    const pd = toDayNumber(r.pickup);
    if (pd == null) continue;
    const diff = pd - evDay; // negative = pickup was before the event
    if (diff < -DAYS_BEFORE || diff > DAYS_AFTER) continue;
    const tier = nameTier(event.client, r.clientName);
    if (tier < minTier || tier === NAME_TIER.none) continue;
    named.push({ r, tier, dist: Math.abs(diff), typeOk: typesMatch(r.carType, event.carType) });
  }
  if (!named.length) return null;

  named.sort((a, b) => b.tier - a.tier || Number(b.typeOk) - Number(a.typeOk) || a.dist - b.dist);
  const top = named[0];
  // Ambiguity = another equally-ranked candidate belonging to a DIFFERENT
  // client, roughly as close in date. (Same client, several bookings — e.g. an
  // agency with five open reservations — is fine: one event just takes the
  // nearest.)
  const rivals = named.filter((c) =>
    c !== top && c.tier === top.tier && c.typeOk === top.typeOk &&
    compact(c.r.clientName) !== compact(top.r.clientName) && Math.abs(c.dist - top.dist) <= 1);
  if (rivals.length) return { ambiguous: true };

  const reason = { [NAME_TIER.exact]: "name-exact", [NAME_TIER.contains]: "name-contains", [NAME_TIER.token]: "name-token", [NAME_TIER.fuzzy]: "name-fuzzy" }[top.tier];
  return { reservation: top.r, reason };
}
