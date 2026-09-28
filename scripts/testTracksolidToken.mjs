// Run: node scripts/testTracksolidToken.mjs
// Includes a direct replay of the real failure: 15 sequential sync batches,
// each asking for a token while TrackSolid answers "1006 request frequency
// too high".
import assert from "node:assert/strict";
import { createTokenManager, isRateLimitError, isTokenError, TokenUnavailableError, REFRESH_MARGIN_MS, BLOCK_MS } from "../lib/tracksolidToken.js";

let passed = 0;
const t = async (name, fn) => { await fn(); passed++; console.log("  ok  " + name); };

// In-memory stand-in for the database row, shared between "instances".
function makeStore() {
  const s = { row: null, writes: { token: 0, block: 0 } };
  return {
    s,
    async read() { return s.row ? { ...s.row } : null; },
    async writeToken({ token, expiresAt }) { s.writes.token++; s.row = { token, expiresAt, blockedUntil: 0, blockedReason: null }; },
    async writeBlock({ blockedUntil, blockedReason }) { s.writes.block++; s.row = { ...(s.row || {}), blockedUntil, blockedReason }; },
  };
}
function makeEnv() {
  const clock = { t: 1_000_000_000 };
  const env = { clock, calls: 0, mode: "ok", store: makeStore() };
  env.fetchToken = async () => {
    env.calls++;
    if (env.mode === "ratelimit") throw new Error("TrackSolid error (jimi.oauth.token.get): 1006 非法访问,请求频率过高!");
    if (env.mode === "badcreds") throw new Error("TrackSolid error (jimi.oauth.token.get): 1001 invalid credentials");
    return { token: "tok-" + env.calls, expiresInSec: 7200 };
  };
  env.manager = () => createTokenManager({ store: env.store, fetchToken: env.fetchToken, now: () => clock.t });
  return env;
}

console.log("sharing one token");
await t("a warm instance fetches once, then reuses it", async () => {
  const e = makeEnv(); const m = e.manager();
  assert.equal(await m.get(), "tok-1"); assert.equal(await m.get(), "tok-1"); assert.equal(e.calls, 1);
});
await t("a DIFFERENT instance reuses the stored token instead of asking again (the core fix)", async () => {
  const e = makeEnv();
  await e.manager().get();
  for (let i = 0; i < 10; i++) assert.equal(await e.manager().get(), "tok-1"); // 10 cold starts
  assert.equal(e.calls, 1);
});
await t("refreshes once it is inside the expiry margin, not before", async () => {
  const e = makeEnv(); const m = e.manager();
  await m.get();
  e.clock.t += 7200_000 - REFRESH_MARGIN_MS - 1000; // just outside the margin
  assert.equal(await e.manager().get(), "tok-1"); assert.equal(e.calls, 1);
  e.clock.t += 2000;                               // now inside it
  assert.equal(await e.manager().get(), "tok-2"); assert.equal(e.calls, 2);
});

console.log("standing down when TrackSolid refuses");
await t("REPLAY OF THE REAL FAILURE: 15 batches => ONE token request, not 15", async () => {
  const e = makeEnv(); e.mode = "ratelimit";
  const errors = [];
  for (let batch = 0; batch < 15; batch++) {
    try { await e.manager().get(); } catch (err) { errors.push(err); }
  }
  assert.equal(errors.length, 15);
  assert.equal(e.calls, 1, "only the first batch may actually hit TrackSolid");
  assert.ok(isRateLimitError(errors[0]));
  assert.ok(errors.slice(1).every((x) => x instanceof TokenUnavailableError && x.code === "TS_TOKEN_UNAVAILABLE"));
});
await t("the stand-down message is human-readable and says it will retry", async () => {
  const e = makeEnv(); e.mode = "ratelimit";
  await e.manager().get().catch(() => {});
  const err = await e.manager().get().catch((x) => x);
  assert.match(err.message, /paused/); assert.match(err.message, /retry automatically/);
});
await t("retries by itself once the stand-down period has passed", async () => {
  const e = makeEnv(); e.mode = "ratelimit";
  await e.manager().get().catch(() => {});
  e.clock.t += BLOCK_MS - 1000;
  await e.manager().get().catch(() => {}); assert.equal(e.calls, 1); // still standing down
  e.mode = "ok"; e.clock.t += 2000;
  assert.equal(await e.manager().get(), "tok-2"); assert.equal(e.calls, 2);
});
await t("a successful token clears the block", async () => {
  const e = makeEnv(); e.mode = "ratelimit";
  await e.manager().get().catch(() => {});
  e.mode = "ok"; e.clock.t += BLOCK_MS + 1;
  await e.manager().get();
  assert.equal(e.store.s.row.blockedUntil, 0);
});
await t("a valid stored token is used even if a stale block record exists", async () => {
  const e = makeEnv();
  e.store.s.row = { token: "good", expiresAt: e.clock.t + 3600_000, blockedUntil: e.clock.t + 60_000, blockedReason: "old" };
  assert.equal(await e.manager().get(), "good"); assert.equal(e.calls, 0);
});
await t("non-rate-limit errors (bad credentials) do NOT trigger a stand-down", async () => {
  const e = makeEnv(); e.mode = "badcreds";
  await e.manager().get().catch(() => {}); await e.manager().get().catch(() => {});
  assert.equal(e.calls, 2); assert.equal(e.store.s.writes.block, 0);
});
await t("failing to record the block never masks the real error", async () => {
  const e = makeEnv(); e.mode = "ratelimit";
  e.store.writeBlock = async () => { throw new Error("db down"); };
  const err = await e.manager().get().catch((x) => x);
  assert.ok(isRateLimitError(err)); assert.doesNotMatch(err.message, /db down/);
});

console.log("error classification");
await t("isTokenError recognises token failures, not ordinary API errors", () => {
  assert.ok(isTokenError(new Error("TrackSolid error (jimi.oauth.token.get): 1006 x")));
  assert.ok(isTokenError(new TokenUnavailableError("paused")));
  assert.ok(!isTokenError(new Error("TrackSolid error (jimi.device.track.mileage): 1004 bad imei")));
  assert.ok(!isTokenError(null));
});

console.log(`\n${passed} tests passed`);
