const CACHE = "smilescars-v2";
const ASSETS = ["/", "/index.html"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || !e.request.url.startsWith(self.location.origin)) return;
  if (e.request.url.includes("script.google.com")) return;
  // The API is same-origin now (/api -> Supabase). Never cache it: a stale
  // fleet list served from the cache would look like data loss to staff.
  if (new URL(e.request.url).pathname.startsWith("/api")) return;
  e.respondWith(
    fetch(e.request)
      .then(res => { const clone = res.clone(); caches.open(CACHE).then(c => c.put(e.request, clone)); return res; })
      .catch(() => caches.match(e.request))
  );
});
