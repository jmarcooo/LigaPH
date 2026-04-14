import { auth, db } from './firebase-setup.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
    const sidebar = document.getElementById('global-sidebar');
    const overlay = document.getElementById('global-sidebar-overlay');
    const openBtn = document.getElementById('menu-btn');
    const closeBtn = document.getElementById('close-sidebar-btn');
    const logoutBtn = document.getElementById('sidebar-logout-btn');
    const copyIdBtn = document.getElementById('copy-id-btn'); // NEW: Copy Button

    if (!sidebar || !overlay) return;

    // --- TOGGLE LOGIC ---
    function openSidebar() {
        overlay.classList.remove('hidden');
        setTimeout(() => overlay.classList.remove('opacity-0'), 10);
        sidebar.classList.remove('-translate-x-full');
        document.body.style.overflow = 'hidden'; 
    }

    function closeSidebar() {
        sidebar.classList.add('-translate-x-full');
        overlay.classList.add('opacity-0');
        setTimeout(() => overlay.classList.add('hidden'), 300);
        document.body.style.overflow = ''; 
    }

    if (openBtn) openBtn.addEventListener('click', openSidebar);
    if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
    overlay.addEventListener('click', closeSidebar);

    // --- COPY ID LOGIC ---
    if (copyIdBtn) {
        copyIdBtn.addEventListener('click', (e) => {
            e.preventDefault(); 
            e.stopPropagation(); // Stops the click from triggering the Profile link!
            
            const idElement = document.getElementById('sidebar-player-id');
            if (idElement) {
                const idText = idElement.textContent.replace('ID: ', '');
                if (idText && idText !== '...') {
                    navigator.clipboard.writeText(idText).then(() => {
                        const icon = copyIdBtn.querySelector('.material-symbols-outlined');
                        icon.textContent = 'check'; // Change icon to checkmark
                        icon.classList.add('text-primary');
                        
                        // Revert back after 1.5 seconds
                        setTimeout(() => {
                            icon.textContent = 'content_copy';
                            icon.classList.remove('text-primary');
                        }, 1500);
                    });
                }
            }
        });
    }

    // --- REAL-TIME DATA INJECTION ---
    let unsubSnapshot = null; 

    onAuthStateChanged(auth, (user) => {
        const nameEl = document.getElementById('sidebar-name');
        const emailEl = document.getElementById('sidebar-email');
        const avatarEl = document.getElementById('sidebar-avatar');
        const roleEl = document.getElementById('sidebar-role');
        const playerIdEl = document.getElementById('sidebar-player-id');

        if (user) {
            // 1. Set Auth Data
            if (nameEl) nameEl.textContent = user.displayName || "Hooper";
            if (emailEl) emailEl.textContent = user.email || "";
            
            if (avatarEl && user.photoURL) {
                avatarEl.src = user.photoURL;
            } else if (avatarEl && user.displayName) {
                const formattedName = user.displayName.split(' ').join('+');
                avatarEl.src = `https://ui-avatars.com/api/?name=${formattedName}&background=20262f&color=ff8f6f`;
            }

            // 2. Real-Time Firestore Listener
            const userDocRef = doc(db, 'users', user.uid);
            
            unsubSnapshot = onSnapshot(userDocRef, (docSnap) => {
                if (docSnap.exists()) {
                    const userData = docSnap.data();

                    // Update Player ID (Now uses FULL ID, no substring)
                    if (playerIdEl) {
                        const pId = userData.playerId || userData.playerCode || user.uid;
                        playerIdEl.textContent = `ID: ${pId}`;
                    }

                    // Update Role dynamically
                    if (roleEl) {
                        const role = (userData.accountType || userData.role || "PLAYER").toUpperCase();
                        roleEl.textContent = role;
                        
                        if (role === "ADMIN" || role === "ADMINISTRATOR") {
                            roleEl.className = "bg-error/10 text-error border border-error/20 text-[10px] px-4 py-1.5 rounded-full font-black tracking-widest uppercase shadow-sm mt-1";
                        } else if (role === "VERIFIED PLAYER") {
                            roleEl.className = "bg-secondary/10 text-secondary border border-secondary/20 text-[10px] px-4 py-1.5 rounded-full font-black tracking-widest uppercase shadow-sm mt-1";
                        } else {
                            roleEl.className = "bg-primary/10 text-primary border border-primary/20 text-[10px] px-4 py-1.5 rounded-full font-black tracking-widest uppercase shadow-sm mt-1";
                        }
                    }
                }
            });

        } else {
            if (unsubSnapshot) unsubSnapshot();
        }
    });

    // --- SIGN OUT LOGIC ---
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                if (unsubSnapshot) unsubSnapshot();
                await signOut(auth);
                sessionStorage.clear(); 
                window.location.replace('index.html'); 
            } catch (error) {
                console.error("Logout error:", error);
            }
        });
    }
});
