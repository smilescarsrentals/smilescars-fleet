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

export async function reverseGeocode(lat, lng) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("Reverse geocoding is not configured — set GOOGLE_MAPS_API_KEY.");
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google Geocoding request failed: HTTP ${res.status}`);
  const body = await res.json();
  if (body.status === "ZERO_RESULTS") return null; // e.g. open water, far outside any mapped area
  if (body.status !== "OK") throw new Error(`Google Geocoding error: ${body.status}${body.error_message ? " — " + body.error_message : ""}`);
  const formatted = body.results?.[0]?.formatted_address;
  return formatted || null;
}
