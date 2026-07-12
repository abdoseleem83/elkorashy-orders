const CACHE_NAME = 'qurashi-orders-v2';
const STATIC_FILES = ['./manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_FILES)).catch(()=>{})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Never cache API calls (orders / catalog data must always be fresh)
  if (url.includes('script.google.com')) return;

  // HTML shell (index.html / navigations): ALWAYS try the network first so
  // every device gets the latest update immediately. Only fall back to the
  // cache if there's no internet connection at all.
  const isHTMLRequest = event.request.mode === 'navigate' || url.endsWith('.html') || url.endsWith('/');
  if (isHTMLRequest) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Static assets (icons, manifest, CDN libs): cache-first for speed, refresh in background
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return res;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
