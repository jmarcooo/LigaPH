import { auth, db } from './firebase-setup.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // 0. DYNAMIC LOGO REPLACEMENT
    // ==========================================
    const sidebarLogoImg = document.querySelector('#global-sidebar img[alt="Liga PH Logo"]');
    if (sidebarLogoImg) {
        const textLogo = document.createElement('a');
        textLogo.href = "home.html";
        textLogo.className = "text-2xl font-black italic tracking-tighter text-primary uppercase font-headline hover:text-primary-container transition-colors";
        textLogo.textContent = "Liga PH";
        sidebarLogoImg.replaceWith(textLogo);
    }

    // ==========================================
    // 1. SIDEBAR TOGGLE LOGIC
    // ==========================================
    const menuBtn = document.getElementById('menu-btn');
    const closeBtn = document.getElementById('close-sidebar-btn');
    const sidebar = document.getElementById('global-sidebar');
    const overlay = document.getElementById('global-sidebar-overlay');

    function openSidebar() {
        if (sidebar) sidebar.classList.remove('-translate-x-full');
        if (overlay) {
            overlay.classList.remove('hidden');
            setTimeout(() => overlay.classList.remove('opacity-0'), 10);
        }
        document.body.style.overflow = 'hidden';
    }

    function closeSidebar() {
        if (sidebar) sidebar.classList.add('-translate-x-full');
        if (overlay) {
            overlay.classList.add('opacity-0');
            setTimeout(() => overlay.classList.add('hidden'), 300);
        }
        document.body.style.overflow = '';
    }

    menuBtn?.addEventListener('click', openSidebar);
    closeBtn?.addEventListener('click', closeSidebar);
    overlay?.addEventListener('click', closeSidebar);


    // ==========================================
    // 2. DYNAMIC AUTHENTICATION STATE
    // ==========================================
    const profileContainer = document.querySelector('a[href="profile.html"], a[href="index.html"]'); 
    const logoutBtnContainer = document.getElementById('sidebar-logout-btn')?.parentElement;
    const adminShortcut = document.getElementById('sidebar-admin-shortcut');
    
    let unsubscribeProfile = null;

    onAuthStateChanged(auth, (user) => {
        if (user) {
            // --- USER IS LOGGED IN ---
            if (logoutBtnContainer) logoutBtnContainer.classList.remove('hidden');
            if (profileContainer) profileContainer.href = "profile.html";

            // Listen to real-time profile data
            unsubscribeProfile = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
                
                // 1. Initialize an empty data object in case the document doesn't exist yet
                let data = {};
                if (docSnap.exists()) {
                    data = docSnap.data();
                }

                // 2. SMART FALLBACKS: If DB data is missing, fallback to Auth data or defaults
                const displayName = data.displayName && data.displayName !== "Unknown Player" 
                                    ? data.displayName 
                                    : (user.displayName || (user.email ? user.email.split('@')[0] : 'Hooper'));
                
                const email = data.email || user.email || 'No email attached';
                
                // If they don't have a LigaID (legacy user), slice their Firebase UID to make one
                const displayId = data.ligaID || (user.uid ? user.uid.substring(0, 12).toUpperCase() : 'N/A');
                
                const avatarUrl = data.photoURL || user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=20262f&color=ff8f6f`;
                
                const accountType = data.accountType || 'PLAYER';

                // 3. Inject the UI
                if (profileContainer) {
                    profileContainer.innerHTML = `
                        <div class="relative mb-4">
                            <img alt="Profile" class="w-24 h-24 rounded-full object-cover object-top border-2 border-outline-variant/20 shadow-lg group-hover:border-primary transition-colors duration-300" src="${avatarUrl}"/>
                            <div class="absolute bottom-1 right-1 w-5 h-5 bg-primary rounded-full border-4 border-[#0a0e14]"></div>
                        </div>
                        <h2 class="font-headline font-black text-xl text-on-surface tracking-tight truncate w-full uppercase group-hover:text-primary transition-colors duration-300">
                            ${displayName}
                        </h2>
                        <p class="text-xs text-on-surface-variant font-medium truncate w-full mt-1 mb-2">
                            ${email}
                        </p>
                        <div class="flex items-center justify-center gap-2 mb-4 w-full px-4 relative z-20" onclick="event.preventDefault(); window.copyLigaId('${displayId}')">
                            <p class="text-[10px] text-outline-variant font-bold tracking-widest uppercase truncate max-w-[140px]" title="Full ID">ID: ${displayId}</p>
                            <button aria-label="Copy Player ID" class="flex items-center justify-center text-outline-variant hover:text-primary transition-colors p-1.5 rounded-md bg-surface-container border border-outline-variant/10 hover:border-primary/30 active:scale-95 shadow-sm">
                                <span class="material-symbols-outlined text-[14px]">content_copy</span>
                            </button>
                        </div>
                        <span class="bg-primary/10 text-primary border border-primary/20 text-[10px] px-4 py-1.5 rounded-full font-black tracking-widest uppercase shadow-sm mt-1">
                            ${accountType}
                        </span>
                    `;
                }
            });

        } else {
            // --- NO USER LOGGED IN (GUEST MODE) ---
            if (unsubscribeProfile) unsubscribeProfile();
            
            if (logoutBtnContainer) logoutBtnContainer.classList.add('hidden');
            if (adminShortcut) adminShortcut.classList.add('hidden');

            if (profileContainer) {
                profileContainer.href = "index.html"; 
                profileContainer.innerHTML = `
                    <div class="relative mb-4 mt-2">
                        <div class="w-24 h-24 rounded-full bg-surface-container-highest flex items-center justify-center border-2 border-outline-variant/20 shadow-lg group-hover:border-primary transition-colors duration-300">
                            <span class="material-symbols-outlined text-[40px] text-outline-variant group-hover:text-primary transition-colors">sports_basketball</span>
                        </div>
                    </div>
                    <h2 class="font-headline font-black text-xl text-on-surface tracking-tight truncate w-full uppercase mb-2">
                        Guest Viewer
                    </h2>
                    <p class="text-xs text-on-surface-variant font-medium text-center mb-6 px-4 leading-relaxed">
                        Join the community to find games, track stats, and build your squad.
                    </p>
                    <button class="bg-primary hover:bg-primary-container text-on-primary-container font-black uppercase tracking-widest text-xs px-6 py-3 rounded-full shadow-lg transition-all active:scale-95 pointer-events-none">
                        Sign In / Sign Up
                    </button>
                `;
            }
        }
    });

    // ==========================================
    // 3. UTILITY & ACTION LOGIC
    // ==========================================
    window.copyLigaId = function(id) {
        if (!id) return;
        navigator.clipboard.writeText(id).then(() => {
            const btn = document.querySelector('button[aria-label="Copy Player ID"] span');
            if (btn) {
                const originalText = btn.textContent;
                btn.textContent = 'check';
                btn.classList.add('text-primary');
                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.classList.remove('text-primary');
                }, 2000);
            }
        }).catch(err => console.error("Copy failed", err));
    };

    const logoutBtn = document.getElementById('sidebar-logout-btn');
    logoutBtn?.addEventListener('click', async () => {
        try {
            await signOut(auth);
            localStorage.removeItem('ligaPhProfile'); 
            window.location.replace('index.html');
        } catch (error) {
            console.error("Error logging out:", error);
        }
    });
});
