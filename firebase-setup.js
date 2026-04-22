// We must use the 'compat' libraries for Service Workers
importScripts('https://www.gstatic.com/firebasejs/10.9.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.9.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker
// PASTE YOUR ACTUAL CONFIG VALUES HERE:
firebase.initializeApp({
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
});

const messaging = firebase.messaging();

// This runs when the app is completely closed or in the background
messaging.onBackgroundMessage(function(payload) {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    
    // Customize the notification banner
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/assets/logo-192.png',
        badge: '/assets/logo-192.png', // Small icon for Android status bar
        data: payload.data, // Contains the URL to open when tapped
        vibrate: [200, 100, 200]
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle user tapping on the background notification
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    const targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            for (let i = 0; i < windowClients.length; i++) {
                let client = windowClients[i];
                if (client.url.includes(self.registration.scope) && 'focus' in client) {
                    client.navigate(targetUrl);
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
