// AZCL app service worker: keeps the site shell available offline.
// Pages and scripts are fetched fresh when online (so updates show right away) and fall back to the cache offline.
// Database calls (Supabase) and other sites are never cached here.
const CACHE = "azcl-v1";
const SHELL = ["/", "/index.html", "/styles.css", "/config.js", "/common.js", "/app.js", "/assets/logo.png", "/assets/mark.png", "/assets/icon-192.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("/index.html")))
  );
});
