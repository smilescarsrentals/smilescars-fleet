// src/lib/cache.js
// In-memory cache for fleet data — avoids re-fetching on every tab navigation.
// Cache is cleared when a user performs an action (checkout, return, etc.)
// or manually clicks the refresh button.

const store = {};

export const cache = {
  set(key, data) {
    store[key] = { data, ts: Date.now() };
  },
  get(key, maxAgeMs = 60000) {
    const entry = store[key];
    if (!entry) return null;
    if (Date.now() - entry.ts > maxAgeMs) { delete store[key]; return null; }
    return entry.data;
  },
  clear(key) {
    if (key) delete store[key];
    else Object.keys(store).forEach(k => delete store[k]);
  },
};
