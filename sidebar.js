import { auth, db } from './firebase-setup.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // 0. DYNAMIC LOGO REPLACEMENT
    // ==========================================
    // Automatically replaces the image logo with the styled text logo across all pages
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
    // We target the anchor tag that wraps the profile section
    const profileContainer = document.querySelector('a[href="profile.html"], a[href="index.html"]'); 
    const logoutBtnContainer = document.getElementById('sidebar-logout-btn')?.parentElement;
    const adminShortcut = document.getElementById('sidebar-admin-shortcut');
    
    let unsubscribeProfile = null;

    onAuthStateChanged(auth, (user) => {
        if (user) {
            // --- USER IS LOGGED IN ---
            
            // Show the logout button container
            if (logoutBtnContainer) logoutBtnContainer.classList.remove('hidden');
            
            // Ensure the link points to the profile page
            if (profileContainer) profileContainer.href = "profile.html";

            // Listen to real-time profile data
            unsubscribeProfile = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
                if (docSnap.exists() && profileContainer) {
                    const data = docSnap.data();
                    const avatarUrl = data.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.firstName || 'Player')}&background=20262f&color=ff8f6f`;
                    
                    // Inject the Logged-In User UI
                    profileContainer.innerHTML = `
                        <div class="relative mb-4">
                            <img alt="Profile" class="w-24 h-24 rounded-full object-cover object-top border-2 border-outline-variant/20 shadow-lg group-hover:border-primary transition-colors duration-300" src="${avatarUrl}"/>
                            <div class="absolute bottom-1 right-1 w-5 h-5 bg-primary rounded-full border-4 border-[#0a0e14]"></div>
                        </div>
                        <h2 class="font-headline font-black text-xl text-on-surface tracking-tight truncate w-full uppercase group-hover:text-primary transition-colors duration-300">
                            ${data.displayName || 'Player'}
                        </h2>
                        <p class="text-xs text-on-surface-variant font-medium truncate w-full mt-1 mb-2">
                            ${data.email}
                        </p>
                        <div class="flex items-center justify-center gap-2 mb-4 w-full px-4 relative z-20" onclick="event.preventDefault(); window.copyLigaId('${data.ligaID}')">
                            <p class="text-[10px] text-outline-variant font-bold tracking-widest uppercase truncate max-w-[140px]" title="Full ID">ID: ${data.ligaID || 'N/A'}</p>
                            <button aria-label="Copy Player ID" class="flex items-center justify-center text-outline-variant hover:text-primary transition-colors p-1.5 rounded-md bg-surface-container border border-outline-variant/10 hover:border-primary/30 active:scale-95 shadow-sm">
                                <span class="material-symbols-outlined text-[14px]">content_copy</span>
                            </button>
                        </div>
                        <span class="bg-primary/10 text-primary border border-primary/20 text-[10px] px-4 py-1.5 rounded-full font-black tracking-widest uppercase shadow-sm mt-1">
                            ${data.accountType || 'PLAYER'}
                        </span>
                    `;
                }
            });

        } else {
            // --- NO USER LOGGED IN (GUEST MODE) ---
            
            if (unsubscribeProfile) unsubscribeProfile();
            
            // Hide the logout button & admin shortcuts
            if (logoutBtnContainer) logoutBtnContainer.classList.add('hidden');
            if (adminShortcut) adminShortcut.classList.add('hidden');

            if (profileContainer) {
                // Change the link to redirect to the landing/login page
                profileContainer.href = "index.html"; 
                
                // Inject the Guest Call-To-Action UI
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
    
    // Global copy function for the dynamically injected ID button
    window.copyLigaId = function(id) {
        if (!id) return;
        navigator.clipboard.writeText(id).then(() => {
            // Simple visual feedback
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

    // Logout execution
    const logoutBtn = document.getElementById('sidebar-logout-btn');
    logoutBtn?.addEventListener('click', async () => {
        try {
            await signOut(auth);
            // Clear any local cache to prevent data leaking
            localStorage.removeItem('ligaPhProfile'); 
            window.location.replace('index.html');
        } catch (error) {
            console.error("Error logging out:", error);
        }
    });

});
