// Run: node scripts/testReservationMatch.mjs
// Cases are modelled on real client-name patterns and the specific failures
// found when dry-running against production data.
import assert from "node:assert/strict";
import { nameTier, NAME_TIER, typesMatch, pickReservationForEvent, addDays, pickupInWindow } from "../lib/reservationMatch.js";

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log("  ok  " + name); };
const R = (id, clientName, carType, pickup) => ({ id, clientName, carType, pickup });

console.log("nameTier");
t("case/spacing/punctuation are ignored", () => assert.equal(nameTier("Aga Khan Foundation", "AGAKHAN foundation"), NAME_TIER.exact));
t("stray tabs/trailing spaces are ignored", () => assert.equal(nameTier("\tHeidi Lum / Auto Union", "heidi lum/auto union "), NAME_TIER.exact));
t("'Anna Marie Watters Auto Union' = 'Anna-Marie Watters / Auto Union'", () => assert.equal(nameTier("Anna Marie Watters Auto Union", "Anna-Marie Watters / Auto Union"), NAME_TIER.exact));
t("one-letter typo on a long name is fuzzy", () => assert.equal(nameTier("Vinesh Bandiya", "Vinesh Bandia "), NAME_TIER.fuzzy));
t("truncated name is 'contains' (Agakhan Foundatio)", () => assert.equal(nameTier("Agakhan Foundatio", "Agakhan Foundation"), NAME_TIER.contains));
t("abbreviated agency name is 'contains' (Makemy Safar)", () => assert.equal(nameTier("Makemy Safar", "Make My Safari / Mehnoor"), NAME_TIER.contains));
t("agency inside agency/guest is 'contains'", () => assert.equal(nameTier("Waljis", "Waljis / Rukkaiya"), NAME_TIER.contains));
t("word order swapped: 'Sojitz - Takuma' = 'Takuma Sojitz'", () => assert.equal(nameTier("Sojitz - Takuma", "Takuma Sojitz "), NAME_TIER.token));
t("abbreviation: 'Auto U Heidi' ~ 'Heidi Lum / Auto Union'", () => assert.equal(nameTier("Auto U Heidi", "Heidi Lum / Auto Union"), NAME_TIER.token));
t("short fragments never match", () => { assert.equal(nameTier("Sean", "Sean 2nd Booking"), NAME_TIER.none); assert.equal(nameTier("Ali", "Ali Murji"), NAME_TIER.none); });
t("same first name, different person = no match", () => assert.equal(nameTier("Mohammed Nathoo", "Mohammed Karim"), NAME_TIER.none));
t("same agency, different guest = no match", () => assert.equal(nameTier("Make My Safari / Nadeem", "Make My Safari / Mehnoor"), NAME_TIER.none));
t("same agency, different guest (Auto Union) = no match", () => { assert.equal(nameTier("Auto U Wanske", "Klusch Hans / Auto Union"), NAME_TIER.none); assert.equal(nameTier("Auto U  Nunzio", "Heidi Lum / Auto Union"), NAME_TIER.none); });
t("empty never matches", () => { assert.equal(nameTier("", "x".repeat(10)), NAME_TIER.none); assert.equal(nameTier(null, null), NAME_TIER.none); });

console.log("typesMatch");
t("brand-prefixed description fits", () => assert.ok(typesMatch("Alphard", "Toyota Alphard 2019 white")));
t("New Harrier fits Harrier", () => assert.ok(typesMatch("New Harrier", "Harrier")));
t("Prado 120 does NOT fit Prado 150", () => assert.ok(!typesMatch("Prado 120", "Prado 150")));
t("blank never fits", () => { assert.ok(!typesMatch("", "Rav4")); assert.ok(!typesMatch("Rav4", "")); });

console.log("pickReservationForEvent — name matching");
t("client took a different model than booked: still matches on name (Adrian Kenya)", () => {
  const p = pickReservationForEvent({ client: "Adrian Kenya", carType: "Vellfire", plate: "T 980 ESX", eventDate: "2026-09-26" }, [R("e", "Adrian Kenya", "Estima", "2026-09-22")]);
  assert.equal(p.reservation.id, "e"); assert.equal(p.reason, "name-exact");
});
t("typo'd checkout name resolves the right booking", () => {
  const p = pickReservationForEvent(
    { client: "Vinesh Bandiya", carType: "Vellfire", plate: "T 320 ECC", eventDate: "2026-09-25" },
    [R("v", "Vinesh Bandia ", "Alphard", "2026-09-24"), R("i", "Ian Yosi Scg International", "Vellfire", "2026-09-28")]);
  assert.equal(p.reservation.id, "v"); assert.equal(p.reason, "name-fuzzy");
});
t("agency with several open bookings: takes the nearest, one at a time", () => {
  const rs = [R("far", "Waljis", "Wish", "2026-09-16"), R("near", "Waljis", "Wish", "2026-09-25"), R("mid", "Waljis", "Wish", "2026-09-20")];
  assert.equal(pickReservationForEvent({ client: "Waljis", carType: "Wish", plate: "T1", eventDate: "2026-09-26" }, rs).reservation.id, "near");
});
t("same tier: prefers the booking whose car type also matches", () => {
  const p = pickReservationForEvent(
    { client: "Garda World", carType: "Prado 150", plate: "T1", eventDate: "2026-09-26" },
    [R("alph", "Garda World", "Alphard", "2026-09-27"), R("prado", "Garda World", "Prado 150", "2026-09-22")]);
  assert.equal(p.reservation.id, "prado");
});
t("two different clients equally plausible => does not guess", () => {
  const p = pickReservationForEvent(
    { client: "Mohammed", carType: "Rav4", plate: "T1", eventDate: "2026-09-26" },
    [R("a", "Mohammed Nathoo", "Rav4", "2026-09-26"), R("b", "Mohammed Karim", "Rav4", "2026-09-26")]);
  assert.deepEqual(p, { ambiguous: true });
});
t("...but a clearly nearer booking wins without ambiguity", () => {
  const p = pickReservationForEvent(
    { client: "Mohammed", carType: "Rav4", plate: "T1", eventDate: "2026-09-26" },
    [R("a", "Mohammed Nathoo", "Rav4", "2026-09-26"), R("b", "Mohammed Karim", "Rav4", "2026-09-17")]);
  assert.equal(p.reservation.id, "a");
});
t("date window: too old, or more than 2 days ahead, never matches", () => {
  const ev = { client: "Garda World", carType: "Prado 150", plate: "T1", eventDate: "2026-09-26" };
  assert.equal(pickReservationForEvent(ev, [R("old", "Garda World", "Prado 150", "2026-09-10")]), null);
  assert.equal(pickReservationForEvent(ev, [R("later", "Garda World", "Prado 150", "2026-09-29")]), null);
  assert.ok(pickReservationForEvent(ev, [R("ok", "Garda World", "Prado 150", "2026-09-28")]));
  assert.ok(pickupInWindow("2026-09-16", "2026-09-26") && !pickupInWindow("2026-09-15", "2026-09-26"));
});
t("sub-hire: name match works with no plate and a free-text description", () => {
  const p = pickReservationForEvent({ client: "Sean Hong", carType: "Toyota Alphard 2019 white", plate: "", eventDate: "2026-09-06" }, [R("s", "Sean Hong ", "Alphard", "2026-09-06")]);
  assert.equal(p.reservation.id, "s");
});
t("minTier: an exact-only pass ignores looser matches", () => {
  const ev = { client: "Agakhan Foundatio", carType: "Alphard", plate: "", eventDate: "2026-09-24" };
  const rs = [R("a", "Agakhan Foundation", "Alphard", "2026-09-24")];
  assert.equal(pickReservationForEvent(ev, rs, { minTier: NAME_TIER.exact }), null);
  assert.equal(pickReservationForEvent(ev, rs).reservation.id, "a");
});

console.log("car type alone NEVER clears a reservation (the real-data failures)");
t("walk-in Alphard does not clear an agency's Alphard booking (Musa Lubamba / Heidi Lum)", () => {
  assert.equal(pickReservationForEvent(
    { client: "Musa Lubamba", carType: "Alphard", plate: "T 128 EDP", eventDate: "2026-09-18" },
    [R("heidi", "Heidi Lum / Auto Union", "Alphard", "2026-09-17")]), null);
});
t("walk-in Vellfire does not clear an unrelated Vellfire booking", () => {
  assert.equal(pickReservationForEvent(
    { client: "Vinesh Bandiya", carType: "Vellfire", plate: "T 320 ECC", eventDate: "2026-09-28" },
    [R("ian", "Ian Yosi Scg International", "Vellfire", "2026-09-28")]), null);
});
t("agent's Xtrail does not clear a different client's Xtrail booking", () => {
  assert.equal(pickReservationForEvent(
    { client: "Make My Safari / Nadeem", carType: "Xtrail", plate: "T 874 EGG", eventDate: "2026-09-27" },
    [R("nawaz", "Nawaz Baga", "Xtrail", "2026-09-29")]), null);
});
t("several open same-model bookings (Rav4 x3) => nothing cleared", () => {
  assert.equal(pickReservationForEvent(
    { client: "Goodfrey Goodluck", carType: "Rav4", plate: "T 117 EBA", eventDate: "2026-09-27" },
    [R("1", "Takuma Sojitz ", "Rav4", "2026-09-21"), R("2", "Anna-Marie Watters / Auto Union", "Rav4", "2026-09-26"), R("3", "Michael Agius / Iringa", "Rav4", "2026-09-27")]), null);
});
t("the checkout that DOES belong to the booking finds it (Auto U Heidi -> Heidi Lum)", () => {
  const p = pickReservationForEvent(
    { client: "Auto U Heidi", carType: "Alphard", plate: "T 735 EAS", eventDate: "2026-09-18" },
    [R("heidi", "Heidi Lum / Auto Union", "Alphard", "2026-09-17")]);
  assert.equal(p.reservation.id, "heidi"); assert.equal(p.reason, "name-token");
});

console.log("helpers");
t("addDays handles month/year boundaries", () => { assert.equal(addDays("2026-09-28", 3), "2026-10-01"); assert.equal(addDays("2026-01-02", -3), "2025-12-30"); });

console.log(`\n${passed} tests passed`);
