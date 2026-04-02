const CACHE_NAME = 'ligaph-cache-v1';

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
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Intercept network requests and serve from cache if available
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return the cached version if found, otherwise fetch from the internet
        return response || fetch(event.request);
      })
  );
});

// Clean up old caches when you update the app
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
