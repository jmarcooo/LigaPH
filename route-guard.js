// --- NEW: FORCE .HTML EXTENSION ---
const currentPath = window.location.pathname;
if (!currentPath.endsWith('/') && !currentPath.endsWith('.html')) {
    window.location.replace(currentPath + '.html' + window.location.search + window.location.hash);
}
// ----------------------------------

// --- NEW: FORCE WEB/APP TO ALWAYS CHECK FOR CACHE UPDATES ---
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (let registration of registrations) {
            registration.update(); // Silently forces the browser to check for sw.js changes
        }
    });
}
// ------------------------------------------------------------

import { auth } from './firebase-setup.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

onAuthStateChanged(auth, (user) => {
    const pathname = window.location.pathname;
    const isIndex = pathname.endsWith('index.html') || pathname.endsWith('/');

    // Define pages that require authentication (STRICTLY .html)
    const protectedRoutes = [
        'profile.html',
        'edit-profile.html',
        'settings.html',
        'notifications.html'
    ];

    const isProtected = protectedRoutes.some(route => pathname.endsWith(route));

    if (user) {
        // User is signed in
        if (isIndex) {
            // Redirect to feeds if trying to access landing page
            window.location.href = 'feeds.html';
        }
    } else {
        // No user is signed in
        if (isProtected) {
            // Redirect to index if trying to access a protected page
            window.location.href = 'index.html';
        }
    }
});
