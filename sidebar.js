import { auth } from './firebase-setup.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

document.addEventListener("DOMContentLoaded", () => {
    // 1. Hook into the beautiful HTML we already built in home.html
    const sidebar = document.getElementById('global-sidebar');
    const overlay = document.getElementById('global-sidebar-overlay');
    const openBtn = document.getElementById('menu-btn');
    const closeBtn = document.getElementById('close-sidebar-btn');
    const logoutBtn = document.getElementById('sidebar-logout-btn');

    // Make sure the elements actually exist on the page before running logic
    if (!sidebar || !overlay) return;

    // --- 2. TOGGLE LOGIC ---
    function openSidebar() {
        overlay.classList.remove('hidden');
        setTimeout(() => overlay.classList.remove('opacity-0'), 10);
        sidebar.classList.remove('-translate-x-full');
        document.body.style.overflow = 'hidden'; // Stop background scrolling
    }

    function closeSidebar() {
        sidebar.classList.add('-translate-x-full');
        overlay.classList.add('opacity-0');
        setTimeout(() => overlay.classList.add('hidden'), 300);
        document.body.style.overflow = ''; // Restore background scrolling
    }

    if (openBtn) openBtn.addEventListener('click', openSidebar);
    if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
    overlay.addEventListener('click', closeSidebar);

    // --- 3. FIREBASE USER DATA INJECTION ---
    onAuthStateChanged(auth, (user) => {
        const nameEl = document.getElementById('sidebar-name');
        const emailEl = document.getElementById('sidebar-email');
        const avatarEl = document.getElementById('sidebar-avatar');

        if (user) {
            // Update the sidebar text with the logged-in player's actual data
            if (nameEl) nameEl.textContent = user.displayName || "Hooper";
            if (emailEl) emailEl.textContent = user.email || "";
            
            // If they uploaded a profile pic, show it! Otherwise keep the default avatar.
            if (avatarEl && user.photoURL) {
                avatarEl.src = user.photoURL;
            } else if (avatarEl && user.displayName) {
                // Generate a cool avatar based on their name if no photo exists
                const formattedName = user.displayName.split(' ').join('+');
                avatarEl.src = `https://ui-avatars.com/api/?name=${formattedName}&background=20262f&color=ff8f6f`;
            }
        }
    });

    // --- 4. SIGN OUT LOGIC ---
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await signOut(auth);
                // Clear out any cached swiping directions or local storage
                sessionStorage.clear(); 
                window.location.replace('index.html'); // Kick them back to login
            } catch (error) {
                console.error("Logout error:", error);
            }
        });
    }
});
