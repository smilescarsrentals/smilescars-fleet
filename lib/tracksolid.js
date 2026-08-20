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

// Every device on the account (all 250+, across every client sub-group —
// TrackSolid doesn't split "our fleet" from "cars currently with a
// client", they're the same list). target = the top-level account name.
//
// Paginated: a single call was silently truncating the result — devices
// belonging to client sub-accounts further down the list (e.g. Schneigder,
// EXIM BANK, NETIs) were missing entirely, with no error, discovered by
// Ramzanali hand-checking specific plates on 2026-08-20. Loops using
// start_row/page_size (same private-parameter names TrackSolid documents
// for jimi.device.track.mileage) until a page comes back short of a full
// page, which is the only reliable "that was the last page" signal this
// API gives — it doesn't return a total count up front.
export async function getDeviceList() {
  const accessToken = await getAccessToken();
  const target = process.env.TRACKSOLID_USER_ID;
  const pageSize = 200;
  let startRow = 1;
  const all = [];
  // Hard ceiling so a misbehaving API (e.g. always returning a full page)
  // can't loop forever — 50 pages at 200/page is 10,000 devices, far past
  // any plausible size of this account.
  for (let i = 0; i < 50; i++) {
    const body = await call("jimi.user.device.list", {
      access_token: accessToken, target,
      start_row: String(startRow), page_size: String(pageSize),
    });
    const page = body.result || [];
    all.push(...page);
    if (page.length < pageSize) break;
    startRow += pageSize;
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
