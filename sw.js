// BUMPED TO V3: Forces the browser to update the Service Worker to include Notification handlers!
const CACHE_NAME = 'ligaph-cache-v3';

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
  if (event.request.headers.get('accept').includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
    return;
  }

  // Strategy 2: Everything Else -> CACHE FIRST, fallback to Network
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        return cachedResponse || fetch(event.request);
      })
  );
});

// Clean up old caches when you update the app
self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());

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


// ==========================================
// PUSH NOTIFICATION HANDLERS
// ==========================================

// 1. Handle when the user taps the notification
self.addEventListener('notificationclick', function(event) {
    event.notification.close(); // Close the notification

    // Look for a URL passed in the notification payload, default to home page
    const targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            // Check if there is already a window/tab open with the app
            for (let i = 0; i < windowClients.length; i++) {
                let client = windowClients[i];
                // If the app is already open, just focus it and navigate to the link
                if (client.url.includes(self.registration.scope) && 'focus' in client) {
                    client.navigate(targetUrl);
                    return client.focus();
                }
            }
            // If the app is closed, open a new window/tab
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
