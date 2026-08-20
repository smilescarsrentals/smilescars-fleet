// lib/tracksolid.js — thin client for the TrackSolid Pro / JIMI Open API.
//
// Node it belongs to: SmilesCars' account lives on the EU node
// (eu-open.tracksolidpro.com). Confirmed by hand-testing on 2026-08-20 —
// the default "TS" node returns "Missing AppKey" for this account.
//
// Auth model: every request is signed with MD5 using app_secret + sorted
// param string (see signParams below). A short-lived access_token (2h) is
// obtained via jimi.oauth.token.get and cached in-memory for the lifetime
// of the serverless function instance — cheap enough to just re-fetch if
// the cache is cold or expired, since this only runs once/night.
import crypto from "crypto";

const BASE_URL = "https://eu-open.tracksolidpro.com/route/rest";

function nowUTC() {
  // TrackSolid's API works in UTC regardless of account region — do not
  // pass Zanzibar-local time here. Callers convert business-local ranges
  // to UTC before calling this module (see nowTZ()/dayRangeUTC() usage
  // in the caller, not here).
  const d = new Date();
  return d.toISOString().slice(0, 19).replace("T", " ");
}

// Signs a flat {key: value} param object per TrackSolid's rule:
//   md5(secret + sortedKey1 + value1 + sortedKey2 + value2 + ... + secret)
// uppercased. `sign` itself is never included in the base string.
function sign(params, secret) {
  const keys = Object.keys(params).sort();
  let base = secret;
  for (const k of keys) base += k + params[k];
  base += secret;
  return crypto.createHash("md5").update(base).digest("hex").toUpperCase();
}

async function call(method, extraParams = {}) {
  const appKey = process.env.TRACKSOLID_APP_KEY;
  const appSecret = process.env.TRACKSOLID_APP_SECRET;
  if (!appKey || !appSecret) {
    throw new Error("TrackSolid is not configured — set TRACKSOLID_APP_KEY / TRACKSOLID_APP_SECRET.");
  }

  const params = {
    app_key: appKey,
    format: "json",
    method,
    sign_method: "md5",
    timestamp: nowUTC(),
    v: "1.0",
    ...extraParams,
  };
  params.sign = sign(params, appSecret);

  const url = BASE_URL + "?" + new URLSearchParams(params).toString();
  const res = await fetch(url);
  const body = await res.json();
  if (body.code !== 0) {
    throw new Error(`TrackSolid error (${method}): ${body.code} ${body.message || ""}`.trim());
  }
  return body;
}

// --- access_token caching -------------------------------------------------
// Module-level cache: survives across invocations on a warm serverless
// instance, but each cold start re-fetches. Fine for a once-nightly job.
let cachedToken = null; // { token, expiresAt }

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  const userId = process.env.TRACKSOLID_USER_ID;
  const userPwdMd5 = process.env.TRACKSOLID_USER_PWD_MD5;
  if (!userId || !userPwdMd5) {
    throw new Error("TrackSolid is not configured — set TRACKSOLID_USER_ID / TRACKSOLID_USER_PWD_MD5.");
  }
  const body = await call("jimi.oauth.token.get", {
    expires_in: "7200",
    user_id: userId,
    user_pwd_md5: userPwdMd5,
  });
  const token = body.result.accessToken;
  const expiresInSec = Number(body.result.expiresIn || 7200);
  cachedToken = { token, expiresAt: Date.now() + expiresInSec * 1000 };
  return token;
}

// Every device on the account. TrackSolid's account is a tree: SmilesCars'
// root account ("Stock") holds the cars not currently with a client, and
// each client (EXIM BANK, Schneigder, NETIs, ...) is a SEPARATE
// sub-account holding the cars currently rented to them — confirmed by
// hand-checking on 2026-08-20 (root shows "Stock250/Total379": 250 devices
// directly on the root, 379 across the whole tree). jimi.user.device.list
// only returns devices belonging to whichever single account you pass as
// `target` — it does NOT recurse into sub-accounts on its own (this is
// also why TrackSolid's own website has a "Sub-account devices" checkbox).
// So: list every sub-account first, then fetch devices for the root AND
// every sub-account, and merge. This replaces an earlier, wrong attempt
// at pagination (start_row/page_size aren't real parameters for this
// endpoint — TrackSolid silently ignored them and returned the same full
// list every time, which duplicated the root's 250 devices 50x with no
// error. Nothing was written to the database from that bug — plate is a
// unique column — but it's the reason for this rewrite.)
async function listDevicesForTarget(accessToken, target) {
  const body = await call("jimi.user.device.list", { access_token: accessToken, target });
  return body.result || [];
}

async function listSubAccounts(accessToken, target) {
  const body = await call("jimi.user.child.list", { access_token: accessToken, target });
  return (body.result || []).map((r) => r.account).filter(Boolean);
}

export async function getDeviceList() {
  const accessToken = await getAccessToken();
  const root = process.env.TRACKSOLID_USER_ID;

  const subAccounts = await listSubAccounts(accessToken, root);
  const targets = [root, ...subAccounts];

  const seenImeis = new Set();
  const all = [];
  for (const target of targets) {
    const devices = await listDevicesForTarget(accessToken, target);
    for (const d of devices) {
      // A device could in principle appear under more than one target if
      // TrackSolid's own data has overlap — de-dupe defensively rather
      // than trust the account tree is perfectly clean.
      if (seenImeis.has(d.imei)) continue;
      seenImeis.add(d.imei);
      all.push(d);
    }
  }
  return all;
}

// Daily mileage for one or more IMEIs, over a UTC time range.
// beginTimeUTC/endTimeUTC: "yyyy-MM-dd HH:mm:ss" strings, already in UTC —
// callers are responsible for the Zanzibar-time-to-UTC conversion.
export async function getMileage(imeis, beginTimeUTC, endTimeUTC) {
  const accessToken = await getAccessToken();
  const body = await call("jimi.device.track.mileage", {
    access_token: accessToken,
    imeis: Array.isArray(imeis) ? imeis.join(",") : imeis,
    begin_time: beginTimeUTC,
    end_time: endTimeUTC,
  });
  // result = trip-by-trip list; data = per-IMEI totals ({imei,totalMileage} in meters)
  return { trips: body.result || [], totals: body.data || [] };
}
