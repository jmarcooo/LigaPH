import { auth, db } from './firebase-setup.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {

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
                    <h4 class="text-[10px] font-black uppercase tracking-widest text-red-500 mb-2 px-4">Management</h4>
                    <a href="admin.html" class="flex items-center gap-4 px-4 py-3.5 rounded-2xl bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors duration-200 group shadow-sm">
                        <span class="material-symbols-outlined group-hover:scale-110 transition-transform text-[20px]">admin_panel_settings</span>
                        <span class="font-headline font-black text-xs tracking-widest uppercase">Admin Dashboard</span>
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
                    <h4 class="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2 px-4">My Court</h4>
                    <div class="space-y-1">
                        <a href="${activeGamesLink}" class="flex items-center gap-4 px-4 py-3.5 rounded-2xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors duration-200 group">
                            <span class="material-symbols-outlined text-gray-400 dark:text-gray-500 group-hover:text-[#ff8f6f] transition-colors text-[22px]">event_available</span>
                            <span class="font-headline font-semibold text-sm tracking-wide">Active Games</span>
                        </a>
                        <a href="${squadLink}" class="flex items-center gap-4 px-4 py-3.5 rounded-2xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors duration-200 group">
                            <span class="material-symbols-outlined text-gray-400 dark:text-gray-500 group-hover:text-[#ff8f6f] transition-colors text-[22px]">shield</span>
                            <span class="font-headline font-semibold text-sm tracking-wide">My Squad</span>
                        </a>
                    </div>
                </div>

                <div class="mb-6">
                    <h4 class="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2 px-4">Account</h4>
                    <div class="space-y-1">
                        <a href="settings.html" class="flex items-center gap-4 px-4 py-3.5 rounded-2xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors duration-200 group">
                            <span class="material-symbols-outlined text-gray-400 dark:text-gray-500 group-hover:text-[#ff8f6f] transition-colors text-[22px]">settings</span>
                            <span class="font-headline font-semibold text-sm tracking-wide">Settings & Privacy</span>
                        </a>
                    </div>
                </div>
            `;
        }

        // RESOURCE CENTER (Always Visible)
        navHtml += `
            <div class="mb-2">
                <h4 class="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2 px-4">Resource Center</h4>
                <div class="space-y-1">
                    <a href="resource-center.html#rules" class="flex items-center gap-4 px-4 py-3.5 rounded-2xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors duration-200 group">
                        <span class="material-symbols-outlined text-gray-400 dark:text-gray-500 group-hover:text-[#ff8f6f] transition-colors text-[22px]">gavel</span>
                        <span class="font-headline font-semibold text-sm tracking-wide">Rules & Regulations</span>
                    </a>
                    <a href="resource-center.html#ratings" class="flex items-center gap-4 px-4 py-3.5 rounded-2xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors duration-200 group">
                        <span class="material-symbols-outlined text-gray-400 dark:text-gray-500 group-hover:text-[#ff8f6f] transition-colors text-[22px]">star_half</span>
                        <span class="font-headline font-semibold text-sm tracking-wide">How Ratings Work</span>
                    </a>
                    <a href="resource-center.html#faq" class="flex items-center gap-4 px-4 py-3.5 rounded-2xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors duration-200 group">
                        <span class="material-symbols-outlined text-gray-400 dark:text-gray-500 group-hover:text-[#ff8f6f] transition-colors text-[22px]">quiz</span>
                        <span class="font-headline font-semibold text-sm tracking-wide">Frequently Asked Questions</span>
                    </a>
                    <a href="resource-center.html#privacy" class="flex items-center gap-4 px-4 py-3.5 rounded-2xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors duration-200 group">
                        <span class="material-symbols-outlined text-gray-400 dark:text-gray-500 group-hover:text-[#ff8f6f] transition-colors text-[22px]">policy</span>
                        <span class="font-headline font-semibold text-sm tracking-wide">Privacy Policy</span>
                    </a>
                    <a href="resource-center.html#terms" class="flex items-center gap-4 px-4 py-3.5 rounded-2xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors duration-200 group">
                        <span class="material-symbols-outlined text-gray-400 dark:text-gray-500 group-hover:text-[#ff8f6f] transition-colors text-[22px]">description</span>
                        <span class="font-headline font-semibold text-sm tracking-wide">Terms of Play</span>
                    </a>
                </div>
            </div>
        `;

        navContainer.innerHTML = navHtml;
    }

    // ==========================================
    // 3. DYNAMIC PROFILE & AUTH STATE
    // ==========================================
    // Target the inner div wrapping the profile card inside the sidebar
    const profileContainer = document.querySelector('#global-sidebar > div:first-child > div'); 
    const logoutBtnContainer = document.getElementById('sidebar-logout-btn')?.parentElement;
    
    let unsubscribeProfile = null;

    onAuthStateChanged(auth, (user) => {
        if (user) {
            if (logoutBtnContainer) logoutBtnContainer.classList.remove('hidden');

            unsubscribeProfile = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
                let data = docSnap.exists() ? docSnap.data() : {};

                const displayName = data.displayName && data.displayName !== "Unknown Player" 
                                    ? data.displayName 
                                    : (user.displayName || (user.email ? user.email.split('@')[0] : 'Hooper'));
                
                const email = data.email || user.email || 'No email attached';
                const avatarUrl = data.photoURL || user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=161618&color=ff8f6f`;
                const accountType = data.accountType || 'PLAYER';
                const isAdmin = accountType === 'Administrator';
                const userSquadId = data.squadId || null;

                renderNavigation(true, isAdmin, userSquadId);

                if (profileContainer) {
                    profileContainer.innerHTML = `
                        <a href="profile.html" class="flex flex-col items-center cursor-pointer w-full hover:opacity-80 transition-opacity">
                            <div class="relative mb-3">
                                <img id="sidebar-avatar" alt="Profile" class="w-16 h-16 md:w-20 md:h-20 rounded-full object-cover object-top border-2 border-gray-200 dark:border-white/20 shadow-sm group-hover:border-[#ff8f6f] transition-colors duration-300" src="${avatarUrl}"/>
                                <div class="absolute bottom-0 right-0 w-5 h-5 bg-[#ff8f6f] rounded-full border-[3px] border-gray-50 dark:border-[#14171d] transition-colors duration-300"></div>
                            </div>
                            <h2 id="sidebar-name" class="font-headline font-black text-base md:text-lg text-gray-900 dark:text-white tracking-tight truncate w-full uppercase transition-colors duration-300">${displayName}</h2>
                            <p id="sidebar-email" class="text-[10px] md:text-xs text-gray-500 dark:text-gray-400 font-medium truncate w-full mt-0.5 mb-2 transition-colors duration-300">${email}</p>
                            <span id="sidebar-role" class="bg-[#ff8f6f]/10 text-[#ff8f6f] border border-[#ff8f6f]/20 text-[9px] md:text-[10px] px-4 py-1 rounded-full font-black tracking-widest uppercase shadow-sm mt-1">${accountType}</span>
                        </a>
                    `;
                }
            });

        } else {
            if (unsubscribeProfile) unsubscribeProfile();
            if (logoutBtnContainer) logoutBtnContainer.classList.add('hidden');
            
            renderNavigation(false, false, null);

            if (profileContainer) {
                profileContainer.innerHTML = `
                    <a href="index.html" class="flex flex-col items-center cursor-pointer w-full hover:opacity-80 transition-opacity">
                        <div class="relative mb-3">
                            <div class="w-16 h-16 md:w-20 md:h-20 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center border-2 border-gray-200 dark:border-white/20 shadow-lg group-hover:border-[#ff8f6f] transition-colors duration-300">
                                <span class="material-symbols-outlined text-[32px] text-gray-400 dark:text-gray-500 group-hover:text-[#ff8f6f] transition-colors">sports_basketball</span>
                            </div>
                        </div>
                        <h2 class="font-headline font-black text-base md:text-lg text-gray-900 dark:text-white tracking-tight truncate w-full uppercase mb-2">Guest Viewer</h2>
                        <p class="text-[10px] md:text-xs text-gray-500 dark:text-gray-400 font-medium text-center mb-4 px-2 leading-relaxed">Join the community to find games and build your squad.</p>
                        <button class="bg-[#ff8f6f] text-[#0a0e14] font-black uppercase tracking-widest text-[10px] px-5 py-2 rounded-full shadow-md transition-all active:scale-95 pointer-events-none">Sign In / Sign Up</button>
                    </a>
                `;
            }
        }
    });

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
