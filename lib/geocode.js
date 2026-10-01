// lib/geocode.js — reverse geocoding via Google's Geocoding API.
//
// Why this exists: TrackSolid's location API does NOT return a street
// address for GPS-positioned devices — its locDesc field is documented as
// Bluetooth-positioning-only and is always null for our vehicles (checked
// against a real sync response and Jimi's own API docs). So the address
// shown on the Tracking page has to be derived ourselves from the lat/lng
// TrackSolid does give us.
//
// Caching is the caller's job (see trackerSync.js): this module only ever
// does the actual lookup. At ~291 confirmed cars synced once a night, every
// car geocoded every time would be ~8,700 requests/month — under Google's
// current 10,000/month free tier on its own, but the caller skips
// re-geocoding a car that hasn't moved meaningfully since its last lookup,
// both to stay comfortably inside that margin (an extra manual "Sync now"
// or two on a busy day) and because re-fetching the same address for a
// parked car is pointless regardless of cost.

// Haversine distance in meters — accurate enough to decide "has this car
// moved far enough to be worth re-geocoding", not for anything precise.
export function distanceMeters(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return Infinity;
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Below this, a car is considered "still in the same spot" and reuses its
// cached address rather than triggering a fresh (billable) lookup.
export const REGEOCODE_THRESHOLD_M = 100;

// Cities worth the richer "Landmark, Road, City" treatment — everywhere
// else just gets "Town, Tanzania". Matched case-insensitively against
// several address-component levels at once (not just "locality"), since
// Zanzibar in particular rarely geocodes with a plain "Zanzibar" locality —
// it's far more often "Zanzibar City"/"Mjini Magharibi Region"/"Unguja" at
// the city or region level instead, with "Zanzibar" appearing as a
// substring rather than the whole field.
const FLAGSHIP_CITIES = ["dar es salaam", "arusha", "mwanza", "zanzibar"];
const CANONICAL_NAME = { "dar es salaam": "Dar es Salaam", arusha: "Arusha", mwanza: "Mwanza", zanzibar: "Zanzibar" };

// Each Geocoding result carries the FULL component hierarchy for its own
// precision level (a landmark result's own components include its name,
// route, locality, region, country together) — so rather than tracking
// which result index holds what, every component across every result is
// searched for the first match of a given type. Duplicates across results
// are harmless since this only ever takes the first hit.
function componentByTypes(results, types) {
  for (const r of results) {
    const comp = r.address_components?.find((c) => c.types?.some((t) => types.includes(t)));
    if (comp) return comp.long_name;
  }
  return null;
}

function matchFlagshipCity(results) {
  // Checked at every level a city name might actually appear at, broadest
  // first isn't right here — narrowest (locality) is the most trustworthy
  // signal, so it's checked first; region-level is only a fallback for
  // exactly the Zanzibar case above.
  const fields = ["locality", "sublocality", "administrative_area_level_2", "administrative_area_level_1"]
    .map((t) => componentByTypes(results, [t]))
    .filter(Boolean);
  for (const field of fields) {
    const hit = FLAGSHIP_CITIES.find((c) => field.toLowerCase().includes(c));
    if (hit) return CANONICAL_NAME[hit];
  }
  return null;
}

// Pure — takes Google's raw `results` array and builds the display string.
// Separated from the network call below so it can be unit tested directly
// against realistic response shapes without faking fetch().
export function buildAddressFromResults(results) {
  if (!results || !results.length) return null;

  const city = matchFlagshipCity(results);
  if (!city) {
    // Outside the four flagship cities — just the town/region and country,
    // no road or landmark detail. Falls back to broader fields only when a
    // specific town-level name isn't available at all.
    const town = componentByTypes(results, ["locality", "sublocality", "administrative_area_level_2", "administrative_area_level_1"]);
    return town ? `${town}, Tanzania` : "Tanzania";
  }

  // Landmark is opportunistic, not guaranteed — Google only surfaces one
  // when it has a notable place closely associated with this exact point in
  // its own database. No landmark just means "Road, City" instead, not an
  // error.
  const landmark = componentByTypes(results, ["point_of_interest", "establishment", "premise"]);
  const road = componentByTypes(results, ["route"]);
  return [landmark, road, city].filter(Boolean).join(", ");
}

export async function reverseGeocode(lat, lng) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("Reverse geocoding is not configured — set GOOGLE_MAPS_API_KEY.");
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google Geocoding request failed: HTTP ${res.status}`);
  const body = await res.json();
  if (body.status === "ZERO_RESULTS") return null; // e.g. open water, far outside any mapped area
  if (body.status !== "OK") throw new Error(`Google Geocoding error: ${body.status}${body.error_message ? " — " + body.error_message : ""}`);
  return buildAddressFromResults(body.results);
}
