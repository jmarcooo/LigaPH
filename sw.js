// BUMPED TO V2: This forces the browser to delete the old, stuck v1 cache!
const CACHE_NAME = 'ligaph-cache-v2';

// List the files you want to save to the phone for instant loading
const urlsToCache = [
  '/',
  '/index.html',
  '/feeds.html',
  '/listings.html',
  '/profile.html',
  '/global.css',
  '/tailwind-theme.js',
  '/assets/logo-192.png',
  '/assets/logo-512.png'
];

// Install the Service Worker and save the files
self.addEventListener('install', event => {
  // Skip waiting forces the waiting service worker to become the active service worker
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Intercept network requests
self.addEventListener('fetch', event => {
  
  // Strategy 1: HTML Pages -> NETWORK FIRST, fallback to Cache
  // This ensures the user ALWAYS sees your newest code and layouts when online.
  if (event.request.headers.get('accept').includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          // It worked! Clone the fresh response and update the cache in the background
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
          return networkResponse;
        })
        .catch(() => {
          // The network failed (user is offline). Fall back to the cached HTML.
          return caches.match(event.request);
        })
    );
    return; // Stop here so it doesn't run Strategy 2
  }

  // Strategy 2: Everything Else (Images, CSS, JS) -> CACHE FIRST, fallback to Network
  // This keeps the app loading lightning fast.
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        return cachedResponse || fetch(event.request);
      })
  );
});

// Clean up old caches when you update the app
self.addEventListener('activate', event => {
  // Take control of all pages immediately without requiring a reload
  event.waitUntil(clients.claim());

  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName); // Deletes 'ligaph-cache-v1'
          }
        })
      );
    })
  );
});
