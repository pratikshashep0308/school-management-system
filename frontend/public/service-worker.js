// Service worker for The Future Step School PWA
// Network-first strategy: always tries the live server first, so users
// get the latest deployed version. Falls back to cache only when offline.
/* eslint-disable no-restricted-globals */
const CACHE_NAME = 'fss-pwa-v1';

self.addEventListener('install', (event) => {
  // Activate this worker immediately, don't wait for old tabs to close
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET requests; let API POST/PUT/etc go straight to network
  if (req.method !== 'GET') return;

  // Never cache API calls — always go to network
  if (req.url.includes('/api/')) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        // Cache a copy of successful page/asset responses
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req)) // offline fallback
  );
});