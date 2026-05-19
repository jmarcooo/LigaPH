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
    // 2. DYNAMIC NAVIGATION INJECTION (GROUPINGS)
    // ==========================================
    const navContainer = document.querySelector('#global-sidebar nav');

    function renderNavigation(isLoggedIn, isAdmin, squadId = null) {
        if (!navContainer) return;

        let navHtml = ``;

        if (isAdmin) {
            navHtml += `
                <div class="mb-6">
                    <h4 class="text-[10px] font-black uppercase tracking-widest text-error mb-2 px-4">Management</h4>
                    <a href="admin.html" class="flex items-center gap-4 px-4 py-3.5 rounded-2xl bg-error/10 text-error hover:bg-error/20 border border-error/20 transition-colors duration-200 group shadow-sm">
                        <span class="material-symbols-outlined group-hover:scale-110 transition-transform">admin_panel_settings</span>
                        <span class="font-headline font-black text-sm tracking-widest uppercase">Admin Dashboard</span>
                    </a>
                </div>
            `;
        }

        if (isLoggedIn) {
            const isValidSquad = squadId && String(squadId).trim() !== '' && String(squadId) !== 'null';
            
            const activeGamesLink = 'listings.html?filter=my-games';
            const squadLink = isValidSquad ? `squad-details.html?id=${squadId}` : 'roster.html';

            navHtml += `
                <div class="mb-6">
                    <h4 class="text-[10px] font-black uppercase tracking-widest text-outline-variant mb-2 px-4">My Court</h4>
                    <div class="space-y-1">
                        <a href="${activeGamesLink}" class="flex items-center gap-4 px-4 py-3 rounded-2xl text-on-surface hover:bg-surface-container-highest transition-colors group">
                            <span class="material-symbols-outlined text-outline-variant group-hover:text-primary transition-colors">event_available</span>
                            <span class="font-headline font-semibold text-sm tracking-wide">Active Games</span>
                        </a>
                        <a href="${squadLink}" class="flex items-center gap-4 px-4 py-3 rounded-2xl text-on-surface hover:bg-surface-container-highest transition-colors group">
                            <span class="material-symbols-outlined text-outline-variant group-hover:text-primary transition-colors">shield</span>
                            <span class="font-headline font-semibold text-sm tracking-wide">My Squad</span>
                        </a>
                    </div>
                </div>

                <div class="mb-6">
                    <h4 class="text-[10px] font-black uppercase tracking-widest text-outline-variant mb-2 px-4">Account</h4>
                    <div class="space-y-1">
                        <a href="settings.html" class="flex items-center gap-4 px-4 py-3 rounded-2xl text-on-surface hover:bg-surface-container-highest transition-colors group">
                            <span class="material-symbols-outlined text-outline-variant group-hover:text-primary transition-colors">settings</span>
                            <span class="font-headline font-semibold text-sm tracking-wide">Settings & Privacy</span>
                        </a>
                    </div>
                </div>
            `;
        }

        // RESOURCE CENTER (Always Visible)
        navHtml += `
            <div class="mb-2">
                <h4 class="text-[10px] font-black uppercase tracking-widest text-outline-variant mb-2 px-4">Resource Center</h4>
                <div class="space-y-1">
                    <a href="resource-center.html#rules" class="flex items-center justify-between px-4 py-2.5 rounded-2xl text-on-surface hover:bg-surface-container-highest transition-colors group">
                        <div class="flex items-center gap-3">
                            <span class="material-symbols-outlined text-[18px] text-outline-variant group-hover:text-primary transition-colors">gavel</span>
                            <span class="font-headline font-medium text-[13px] tracking-wide">Rules & Regulations</span>
                        </div>
                    </a>
                    <a href="resource-center.html#ratings" class="flex items-center justify-between px-4 py-2.5 rounded-2xl text-on-surface hover:bg-surface-container-highest transition-colors group">
                        <div class="flex items-center gap-3">
                            <span class="material-symbols-outlined text-[18px] text-outline-variant group-hover:text-primary transition-colors">star_half</span>
                            <span class="font-headline font-medium text-[13px] tracking-wide">How Ratings Work</span>
                        </div>
                    </a>
                    <a href="resource-center.html#privacy" class="flex items-center justify-between px-4 py-2.5 rounded-2xl text-on-surface hover:bg-surface-container-highest transition-colors group">
                        <div class="flex items-center gap-3">
                            <span class="material-symbols-outlined text-[18px] text-outline-variant group-hover:text-primary transition-colors">policy</span>
                            <span class="font-headline font-medium text-[13px] tracking-wide">Privacy Policy</span>
                        </div>
                    </a>
                    <a href="resource-center.html#terms" class="flex items-center justify-between px-4 py-2.5 rounded-2xl text-on-surface hover:bg-surface-container-highest transition-colors group">
                        <div class="flex items-center gap-3">
                            <span class="material-symbols-outlined text-[18px] text-outline-variant group-hover:text-primary transition-colors">description</span>
                            <span class="font-headline font-medium text-[13px] tracking-wide">Terms of Play</span>
                        </div>
                    </a>
                </div>
            </div>
        `;

        navContainer.innerHTML = navHtml;
    }


    // ==========================================
    // 3. DYNAMIC PROFILE & AUTH STATE
    // ==========================================
    const profileContainer = document.querySelector('a[href="profile.html"], a[href="index.html"]'); 
    const logoutBtnContainer = document.getElementById('sidebar-logout-btn')?.parentElement;
    
    let unsubscribeProfile = null;

    onAuthStateChanged(auth, (user) => {
        if (user) {
            if (logoutBtnContainer) logoutBtnContainer.classList.remove('hidden');
            if (profileContainer) profileContainer.href = "profile.html";

            unsubscribeProfile = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
                let data = docSnap.exists() ? docSnap.data() : {};

                const displayName = data.displayName && data.displayName !== "Unknown Player" 
                                    ? data.displayName 
                                    : (user.displayName || (user.email ? user.email.split('@')[0] : 'Hooper'));
                
                const email = data.email || user.email || 'No email attached';
                
                // Get EXACT ID for copying, but create a SHORTENED ID for visual display
                const displayId = data.ligaID || user.uid || 'N/A';
                const shortId = displayId.length > 8 ? `${displayId.substring(0, 8)}...` : displayId;
                
                const avatarUrl = data.photoURL || user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=20262f&color=ff8f6f`;
                const accountType = data.accountType || 'PLAYER';
                const isAdmin = accountType === 'Administrator';
                const userSquadId = data.squadId || null;

                renderNavigation(true, isAdmin, userSquadId);

                if (profileContainer) {
                    profileContainer.innerHTML = `
                        <div class="relative mb-4 mt-2">
                            <img alt="Profile" class="w-24 h-24 rounded-full object-cover object-top border-2 border-outline-variant/20 shadow-lg group-hover:border-primary transition-colors duration-300" src="${avatarUrl}"/>
                            <div class="absolute bottom-1 right-1 w-5 h-5 bg-primary rounded-full border-4 border-[#0a0e14]"></div>
                        </div>
                        
                        <h2 class="font-headline font-black text-xl text-on-surface tracking-tight truncate w-full uppercase group-hover:text-primary transition-colors duration-300 px-4">
                            ${displayName}
                        </h2>
                        <p class="text-xs text-on-surface-variant font-medium truncate w-full mt-1 mb-4 px-4">
                            ${email}
                        </p>
                        
                        <div class="w-full px-4 mb-6 text-center">
                            <span class="bg-primary/10 text-primary border border-primary/20 text-[10px] px-4 py-1.5 rounded-full font-black tracking-widest uppercase shadow-sm inline-block">
                                ${accountType}
                            </span>
                        </div>

                        <div class="w-full px-2 relative z-20">
                            <div role="button" aria-label="Copy Player ID" onclick="event.preventDefault(); window.copyLigaId('${displayId}')" class="flex items-center justify-between w-full px-4 py-3 rounded-2xl text-on-surface hover:bg-surface-container-highest transition-colors group cursor-pointer">
                                <div class="flex items-center gap-4">
                                    <span class="material-symbols-outlined text-outline-variant group-hover:text-primary transition-colors">badge</span>
                                    <span class="font-headline font-semibold text-sm tracking-wide text-left">Liga ID <span class="text-primary font-bold ml-1 tracking-widest">${shortId}</span></span>
                                </div>
                                <span class="material-symbols-outlined text-[18px] text-outline-variant group-hover:text-primary transition-colors id-copy-icon">content_copy</span>
                            </div>
                        </div>
                    `;
                }
            });

        } else {
            if (unsubscribeProfile) unsubscribeProfile();
            if (logoutBtnContainer) logoutBtnContainer.classList.add('hidden');
            
            renderNavigation(false, false, null);

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
    // 4. UTILITY & ACTION LOGIC
    // ==========================================
    window.copyLigaId = function(id) {
        if (!id) return;
        navigator.clipboard.writeText(id).then(() => {
            const icon = document.querySelector('.id-copy-icon');
            if (icon) {
                icon.textContent = 'check_circle';
                icon.classList.remove('text-outline-variant');
                icon.classList.add('text-primary');
                setTimeout(() => {
                    icon.textContent = 'content_copy';
                    icon.classList.add('text-outline-variant');
                    icon.classList.remove('text-primary');
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
