/* 5LB База знаний — service worker (offline-first для статики) */
const CACHE = "5lb-baza-v2";
const SHELL = ["./", "./index.html"]; // critical, cached atomically
const EXTRA = [
  "./assets/css/styles.css",
  "./assets/js/main.js",
  "./manifest.webmanifest",
  "./assets/img/icon.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then(async (c) => {
      await c.addAll(SHELL); // fail install only if the shell is unreachable
      await Promise.all(EXTRA.map((u) => c.add(u).catch(() => {}))); // optional assets non-fatal
      await self.skipWaiting();
    })
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // HTML: network-first (freshest), fall back to cache offline
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
    );
    return;
  }

  // Same-origin static: stale-while-revalidate (instant, but updates after deploy)
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
  // Cross-origin (Google Fonts): let the browser handle it normally
});
