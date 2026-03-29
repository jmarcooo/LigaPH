import { auth } from './firebase-setup.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

onAuthStateChanged(auth, (user) => {
    const pathname = window.location.pathname;
    const isIndex = pathname.endsWith('index.html') || pathname.endsWith('/');

    // Define pages that require authentication
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
