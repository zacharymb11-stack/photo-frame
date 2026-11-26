// Keeps a copy of the photo frame's own files on the iPad so it opens without internet.
// (Your photos are not here - they live in the on-device database.)
// Change the version number when you upload new versions of the files.
const CACHE = 'photoframe-v3';
const FILES = ['./', './index.html', './app.js', './scenes.js', './clock.js', './style.css', './manifest.webmanifest', './icon-180.png', './icon-512.png',
  './scenes/village.jpg', './scenes/road.jpg', './scenes/mountains.jpg', './scenes/city.jpg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Serve from the saved copy straight away; quietly refresh it from the internet when online.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req, { ignoreSearch: true }).then((hit) => {
        const fromNetwork = fetch(req).then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(() => hit);
        return hit || fromNetwork;
      })
    )
  );
});
