import { auth } from './firebase-setup.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

// --- NEW: FORCE WEB/APP TO ALWAYS CHECK FOR CACHE UPDATES ---
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (let registration of registrations) {
            registration.update(); // Silently forces the browser to check for sw.js changes
        }
    });
}
// ------------------------------------------------------------

onAuthStateChanged(auth, (user) => {
    const pathname = window.location.pathname;
    const isIndex = pathname.endsWith('index.html') || pathname === '/';

    // Define pages that require authentication
    const protectedRoutes = [
        'profile.html',
        'edit-profile.html',
        'settings.html',
        'notifications.html',
        'admin.html',
        'home.html',    // <-- Added home.html to protected routes
        'feeds.html'
    ];

    // Check if the current path matches any of our protected routes
    const isProtected = protectedRoutes.some(route => pathname.includes(route));

    if (user) {
        // If user is signed in and tries to access the login page, send them to home
        if (isIndex) {
            window.location.href = 'home.html';
        }
    } else {
        // If NO user is signed in and they try to access a protected page, kick them to login
        if (isProtected) {
            window.location.href = 'index.html';
        }
    }
});
