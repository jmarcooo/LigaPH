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
        // Redirect to index if trying to access any protected page
        if (!isPublicRoute) {
            window.location.href = 'index.html';
        }
    }
});
