import { auth } from './firebase-setup.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

onAuthStateChanged(auth, (user) => {
    let pathname = window.location.pathname;

    // Normalize the path by stripping the trailing slash and ".html" if they exist
    const normalizedPath = pathname.replace(/\.html$/, '').replace(/\/$/, '');

    // If normalizedPath is empty, they are on the root ("/") domain
    const isIndex = normalizedPath === '' || normalizedPath.endsWith('/index');

    // Define pages that require authentication (use base names without .html)
    const protectedRoutes = [
        '/profile',
        '/edit-profile',
        '/settings',
        '/notifications'
    ];

    const isProtected = protectedRoutes.some(route => normalizedPath.endsWith(route));

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
