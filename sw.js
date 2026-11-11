// sw.js: the service worker. It lets the app install and work offline.
// Network-first: always try the live site first, so each merged change shows up.
// If the network fails (offline), use the copy saved in the cache.
// All paths are relative, because the site lives at /<repository>/, not at the root of a domain.

const CACHE = 'electromart-ccc-v1';

const FILES = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'ccc.js',
  'manifest.webmanifest',
  'data/electromart.csv',
  'data/assumptions.csv',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png'
];

// On install, save every file the app needs, so it works offline from the first visit.
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(FILES); })
      .then(function () { return self.skipWaiting(); })
  );
});

// On activate, delete caches from older versions of this file.
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

// Network first, cache as the offline fallback. Only this site's own files are handled.
self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then(function (res) {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      })
      .catch(function () {
        return caches.match(req, { ignoreSearch: true }).then(function (hit) {
          if (hit) return hit;
          if (req.mode === 'navigate') return caches.match('./');
          return Response.error();
        });
      })
  );
});
