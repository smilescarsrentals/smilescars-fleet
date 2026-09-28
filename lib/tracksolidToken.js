// lib/tracksolidToken.js — shares ONE TrackSolid access token across every
// serverless instance, and stands down when TrackSolid refuses to issue one.
//
// Why this exists: jimi.oauth.token.get is rate-limited ("1006 request
// frequency too high"), and a token is good for 2 hours. The old code kept
// the token only in per-process memory. On Vercel each request can land on a
// different (or cold) instance, so nearly every TrackSolid-touching request
// — a Tracking page load after the 5-minute device cache expired, "Sync now",
// the nightly cron — began by asking for a brand-new token. That tripped the
// limiter, and because a failure was remembered nowhere, every following
// batch / page load asked again and kept it tripped (a full sync once failed
// all 15 batches this way with 0 cars updated).
//
// Now: the token is kept in the database (store), so all instances reuse it
// until it's within REFRESH_MARGIN_MS of expiry (~12 token requests a day at
// most). If TrackSolid refuses with a rate-limit error, that's recorded too,
// and everything stands down for BLOCK_MS instead of piling more requests
// onto a limiter that's already saying no.
//
// Pure of I/O by design — the store, the token fetch and the clock are
// injected — so scripts/testTracksolidToken.mjs can exercise it directly.

export const REFRESH_MARGIN_MS = 5 * 60_000;
export const BLOCK_MS = 2 * 60_000;

export class TokenUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = "TokenUnavailableError";
    this.code = "TS_TOKEN_UNAVAILABLE";
  }
}

// TrackSolid's rate-limit response is code 1006.
export function isRateLimitError(err) {
  return /\b1006\b/.test(String((err && err.message) || ""));
}

// Any failure to obtain a token (rate limit, stand-down, bad credentials).
// Callers looping over many batches use this to stop after the FIRST such
// failure instead of repeating it N times — every later batch would fail
// identically.
export function isTokenError(err) {
  return !!err && (err.code === "TS_TOKEN_UNAVAILABLE" || /jimi\.oauth\.token\.get/.test(String(err.message || "")));
}

// store:      { read(): {token, expiresAt, blockedUntil, blockedReason}|null,
//               writeToken({token, expiresAt}), writeBlock({blockedUntil, blockedReason}) }
//             (all times as epoch milliseconds)
// fetchToken: async () => ({ token, expiresInSec })
export function createTokenManager({ store, fetchToken, now = Date.now }) {
  let mem = null; // fast path within a warm instance: { token, expiresAt }

  return {
    async get() {
      const t = now();
      if (mem && mem.expiresAt > t + REFRESH_MARGIN_MS) return mem.token;

      const row = await store.read();
      if (row && row.token && row.expiresAt > t + REFRESH_MARGIN_MS) {
        mem = { token: row.token, expiresAt: row.expiresAt };
        return row.token;
      }
      if (row && row.blockedUntil && row.blockedUntil > t) {
        const secs = Math.ceil((row.blockedUntil - t) / 1000);
        throw new TokenUnavailableError(
          `TrackSolid is rate-limiting token requests, so syncing is paused — it will retry automatically in about ${secs}s. (${row.blockedReason || "rate limited"})`
        );
      }

      try {
        const { token, expiresInSec } = await fetchToken();
        const expiresAt = now() + expiresInSec * 1000;
        await store.writeToken({ token, expiresAt });
        mem = { token, expiresAt };
        return token;
      } catch (err) {
        if (isRateLimitError(err)) {
          // Best-effort: failing to record the block must not mask the real error.
          await Promise.resolve(store.writeBlock({ blockedUntil: now() + BLOCK_MS, blockedReason: err.message })).catch(() => {});
        }
        throw err;
      }
    },
  };
}
