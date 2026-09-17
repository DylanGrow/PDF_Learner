// =============================================================================
//  PDF Quiz Maker — Service Worker  (sw.js)
//  Strategy: Cache-first for static assets, network-first for navigation
//  Bump CACHE_VERSION when you deploy new assets to invalidate old cache
// =============================================================================
"use strict";

const CACHE_VERSION = "v7";
const CACHE_NAME    = `pdf-quiz-${CACHE_VERSION}`;

// All static assets that make the app work offline
const PRECACHE_ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./tailwind.css",
  "./pdf.min.js",
  "./pdf.worker.min.js",
  "./favicon.svg",
  "./favicon-192.png",
  "./favicon-512.png",
  "./manifest.webmanifest",
];

// ── Install: pre-cache everything ────────────────────────────────────────────
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting()) // activate immediately
  );
});

// ── Activate: delete stale caches ────────────────────────────────────────────
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim()) // take control of all open tabs
  );
});

// ── Fetch: cache-first for static assets, network-first for HTML ─────────────
self.addEventListener("fetch", event => {
  // Only handle GET requests to same origin
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Navigation requests (HTML): network-first, fall back to cached index
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      // Not in cache — fetch, cache the response, return it
      return fetch(event.request).then(response => {
        if (response.ok) {
          const toCache = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, toCache));
        }
        return response;
      }).catch(() => {
        // Both network and cache failed — nothing we can do for non-HTML assets
        return new Response("Offline", { status: 503, statusText: "Service Unavailable" });
      });
    })
  );
});
