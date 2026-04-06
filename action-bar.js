import { navItems } from './nav-config.js';
import { auth, db } from './firebase-setup.js';
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

// action-bar.js

document.addEventListener("DOMContentLoaded", () => {

    const currentPath = window.location.pathname;
    const navElement = document.createElement('nav');

    // FIX: Unconditionally apply "md:hidden" so the bottom bar ALWAYS hides on PC/Desktop
    navElement.className = "md:hidden fixed bottom-0 left-0 w-full flex justify-between items-center px-2 pb-6 pt-3 bg-[#0a0e14]/60 backdrop-blur-xl dark:bg-[#0a0e14]/60 rounded-t-[2rem] z-50 border-t border-[#44484f]/20 shadow-[0_-8px_32px_rgba(31,40,130,0.1)]";

    navItems.forEach(item => {
        const isActive = item.activePaths.some(p => currentPath.endsWith(p)) ||
                         (currentPath.endsWith('/') && item.name === 'Home');

        const a = document.createElement('a');
        const baseClass = "flex-1 flex flex-col items-center justify-center h-12 transition-all";

        if (isActive) {
            a.className = `${baseClass} text-[#ff8f6f] group`;
            a.href = item.link;
            a.innerHTML = `
                <div class="bg-[#ff7851]/10 rounded-2xl px-4 min-w-[4rem] py-1 flex flex-col items-center justify-center">
                    <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">${item.icon}</span>
                    <span class="font-['Be_Vietnam_Pro'] text-[10px] font-medium leading-tight">${item.name}</span>
                </div>
            `;
        } else {
            a.className = `${baseClass} text-[#a8abb3] hover:text-[#ff8f6f] active:text-[#ff8f6f]/80`;
            a.href = item.link;

            // Allow Profile to require auth - override behavior so guest clicks it and redirects to login
            if (item.name === "Profile") {
                a.href = "#"; // Prevent default nav
                a.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (auth.currentUser) {
                        window.location.href = item.link;
                    } else {
                        window.location.href = 'index.html';
                    }
                });
            }

            a.innerHTML = `
                <div class="rounded-2xl px-4 min-w-[4rem] py-1 flex flex-col items-center justify-center transition-colors hover:bg-[#0f141a]">
                    <span class="material-symbols-outlined">${item.icon}</span>
                    <span class="font-['Be_Vietnam_Pro'] text-[10px] font-medium leading-tight">${item.name}</span>
                </div>
            `;
        }
        navElement.appendChild(a);
    });

    document.body.appendChild(navElement);

    // --- SWIPE GESTURE LOGIC REMOVED TO PREVENT MAP DRAG CONFLICTS ---

    // --- GLOBAL NOTIFICATION BELL LOGIC ---
    const notifBell = document.querySelector('a[href="notifications.html"]');
    if (notifBell) {
        // FORCIBLY fix clickability and bring the bell to the front layer
        notifBell.style.position = 'relative';
        notifBell.style.zIndex = '100';
        notifBell.style.pointerEvents = 'auto';

        // Select the absolute dot span specifically
        const redDot = notifBell.querySelector('span.absolute');
        if (redDot) {
            // Upgrade the tiny dot into a dynamic numbered badge
            redDot.style.backgroundColor = '#ef4444'; // Bright Red (Tailwind red-500)
            redDot.style.borderColor = '#0a0e14'; // Match the header background
            redDot.style.boxShadow = '0 0 6px rgba(239, 68, 68, 0.8)'; // Red glow
            redDot.style.color = '#ffffff'; // White text
            redDot.style.fontSize = '10px'; // Text size for the number
            redDot.style.fontWeight = '900'; // Extra bold text
            
            // Adjust sizing and alignment for the number
            redDot.style.width = 'auto'; // Allow it to stretch for "10+"
            redDot.style.height = '18px';
            redDot.style.minWidth = '18px';
            redDot.style.padding = '0 5px';
            redDot.style.borderRadius = '9999px';
            redDot.style.top = '2px'; // Adjust position slightly up and right
            redDot.style.right = '2px';
            redDot.style.display = 'none'; // Hide by default
            redDot.style.alignItems = 'center';
            redDot.style.justifyContent = 'center';

            let unsubscribeNotifs = null;

            onAuthStateChanged(auth, (user) => {
                // Cleanup previous listener if auth state changes
                if (unsubscribeNotifs) {
                    unsubscribeNotifs();
                    unsubscribeNotifs = null;
                }

                if (user) {
                    // Listen for UNREAD notifications targeted at the current user
                    const q = query(
                        collection(db, "notifications"),
                        where("recipientId", "==", user.uid),
                        where("read", "==", false)
                    );
                    
                    // onSnapshot triggers instantly whenever data changes
                    unsubscribeNotifs = onSnapshot(q, (snapshot) => {
                        if (!snapshot.empty) {
                            redDot.style.display = 'flex'; // Use flex to center the number
                            const count = snapshot.size;
                            redDot.textContent = count > 99 ? '99+' : count; // Cap at 99+
                        } else {
                            redDot.style.display = 'none';
                            redDot.textContent = '';
                        }
                    });
                } else {
                    redDot.style.display = 'none';
                    redDot.textContent = '';
                }
            });
        }
    }
});
