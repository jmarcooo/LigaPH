import { auth } from './firebase-setup.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

onAuthStateChanged(auth, (user) => {
    const isPublicRoute = window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('/');

    if (user) {
        // User is signed in
        if (isPublicRoute) {
            // Redirect to feeds if trying to access landing page
            window.location.href = 'feeds.html';
        }
    } else {
        // No user is signed in
        // Now other routes are accessible to guests, but we keep index.html for guest landing.
        // So we don't redirect guests away from non-public routes anymore.
    }
});
