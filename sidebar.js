import { auth, db } from './firebase-setup.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // 1. INJECT SIDEBAR HTML GLOBALLY
    // ==========================================
    const sidebarHtml = `
        <div id="global-sidebar-overlay" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] hidden opacity-0 transition-opacity duration-300"></div>
        <aside id="global-sidebar" class="fixed top-0 left-0 h-full w-[85%] max-w-[340px] bg-[#0a0e14] border-r border-outline-variant/10 z-[70] transform -translate-x-full transition-transform duration-300 flex flex-col shadow-[20px_0_60px_rgba(0,0,0,0.8)]">
            
            <div class="px-6 py-5 flex items-center justify-between border-b border-outline-variant/10 bg-[#0a0e14]">
                <img src="assets/logo.png" alt="Liga PH Logo" class="h-8 object-contain drop-shadow-[0_0_8px_rgba(255,143,111,0.5)]" onerror="this.style.display='none'">
                <h1 class="font-headline text-2xl font-black italic tracking-tighter text-primary uppercase drop-shadow-md" style="display: none;" id="sidebar-fallback-logo">Liga PH</h1>
                <button id="close-sidebar-btn" class="text-outline-variant hover:text-primary transition-colors p-2 -mr-2 rounded-full active:scale-95 bg-surface-container-low">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>

            <div class="px-6 py-8 flex flex-col items-center text-center group bg-gradient-to-b from-surface-container-low/30 to-transparent relative">
                
                <div class="relative mb-4 cursor-pointer hover:scale-105 transition-transform" onclick="window.location.href='profile.html'">
                    <div id="sidebar-avatar-skeleton" class="w-24 h-24 rounded-full bg-surface-container-highest animate-pulse border-4 border-[#0a0e14]"></div>
                    <img id="sidebar-avatar" alt="Profile" class="hidden w-24 h-24 rounded-full object-cover object-top border-4 border-[#0a0e14] ring-2 ring-outline-variant/30 shadow-[0_0_15px_rgba(0,0,0,0.5)] group-hover:ring-primary transition-all duration-300" src=""/>
                    <div class="absolute bottom-0 right-0 w-6 h-6 bg-primary rounded-full border-4 border-[#0a0e14] shadow-sm"></div>
                </div>

                <div id="sidebar-info-skeleton" class="w-full flex flex-col items-center animate-pulse">
                    <div class="h-6 w-3/4 bg-surface-container-highest rounded mb-2"></div>
                    <div class="h-3 w-1/2 bg-surface-container-highest rounded mb-4"></div>
                    <div class="h-6 w-2/3 bg-surface-container-highest rounded-md mb-2"></div>
                </div>

                <div id="sidebar-info-content" class="hidden w-full flex flex-col items-center">
                    <h2 id="sidebar-name" class="font-headline font-black text-2xl text-on-surface tracking-tight truncate w-full uppercase italic group-hover:text-primary transition-colors duration-300"></h2>
                    <p id="sidebar-email" class="text-xs text-outline-variant font-medium truncate w-full mt-1 mb-3"></p>
                    
                    <div class="flex items-center justify-center gap-2 mb-3 w-full px-4 relative z-20">
                        <p id="sidebar-player-id" class="text-[11px] text-outline-variant font-bold tracking-widest uppercase truncate max-w-[140px] bg-surface-container px-3 py-1 rounded-md border border-outline-variant/10" title="Full ID"></p>
                        <button id="copy-id-btn" class="flex items-center justify-center text-outline-variant hover:text-primary transition-all p-1.5 rounded-md bg-surface-container border border-outline-variant/20 hover:border-primary/50 active:scale-95 shadow-sm" title="Copy Full ID">
                            <span class="material-symbols-outlined text-[16px]">content_copy</span>
                        </button>
                    </div>

                    <span id="sidebar-role" class="bg-primary/10 text-primary border border-primary/30 text-[11px] px-5 py-1.5 rounded-none skew-x-[-10deg] font-black tracking-widest uppercase shadow-sm mt-1 inline-block">
                        <span class="skew-x-[10deg] inline-block">PLAYER</span>
                    </span>
                </div>
            </div>

            <div class="px-6"><div class="h-[1px] bg-gradient-to-r from-transparent via-outline-variant/20 to-transparent"></div></div>

            <nav class="flex-1 px-4 py-6 space-y-2 overflow-y-auto custom-scrollbar">
                
                <a href="admin.html" id="sidebar-admin-shortcut" class="hidden items-center gap-4 px-4 py-3.5 rounded-xl bg-error/10 text-error hover:bg-error/20 border border-error/20 hover:border-error/50 transition-all duration-200 group shadow-sm mb-4">
                    <span class="material-symbols-outlined group-hover:scale-110 transition-transform text-[22px]">admin_panel_settings</span>
                    <span class="font-headline font-black text-sm tracking-widest uppercase italic">Admin Console</span>
                </a>

                <div class="h-[1px] bg-outline-variant/10 my-4 mx-4 hidden" id="admin-divider"></div>

                <a href="settings.html" class="flex items-center gap-4 px-4 py-3.5 rounded-xl text-on-surface hover:bg-surface-container-highest border border-transparent hover:border-outline-variant/20 transition-all duration-200 group">
                    <span class="material-symbols-outlined text-outline-variant group-hover:text-primary transition-colors text-[22px] group-hover:rotate-45">settings</span>
                    <span class="font-headline font-semibold text-sm tracking-wide">Settings & Privacy</span>
                </a>
                
                <a href="help.html" class="flex items-center gap-4 px-4 py-3.5 rounded-xl text-on-surface hover:bg-surface-container-highest border border-transparent hover:border-outline-variant/20 transition-all duration-200 group">
                    <span class="material-symbols-outlined text-outline-variant group-hover:text-primary transition-colors text-[22px]">help</span>
                    <span class="font-headline font-semibold text-sm tracking-wide">Help & Support</span>
                </a>
            </nav>

            <div class="px-6"><div class="h-[1px] bg-outline-variant/10"></div></div>

            <div class="p-6 mb-2">
                <button id="sidebar-logout-btn" class="w-full flex items-center justify-center gap-3 px-4 py-4 rounded-xl text-error hover:bg-error/10 border border-transparent hover:border-error/30 transition-all duration-200 group active:scale-95 bg-surface-container-low shadow-sm">
                    <span class="material-symbols-outlined text-[22px] group-hover:-translate-x-1 transition-transform">logout</span>
                    <span class="font-headline font-black text-sm uppercase tracking-widest italic">Sign Out</span>
                </button>
            </div>
        </aside>
    `;

    document.body.insertAdjacentHTML('afterbegin', sidebarHtml);

    // ==========================================
    // 2. DOM ELEMENTS & EVENT LISTENERS
    // ==========================================
    const sidebar = document.getElementById('global-sidebar');
    const overlay = document.getElementById('global-sidebar-overlay');
    const closeBtn = document.getElementById('close-sidebar-btn');
    const menuBtn = document.getElementById('menu-btn');
    const copyIdBtn = document.getElementById('copy-id-btn');
    const logoutBtn = document.getElementById('sidebar-logout-btn');
    
    // UI Elements
    const sidebarAvatar = document.getElementById('sidebar-avatar');
    const sidebarAvatarSkeleton = document.getElementById('sidebar-avatar-skeleton');
    const sidebarInfoSkeleton = document.getElementById('sidebar-info-skeleton');
    const sidebarInfoContent = document.getElementById('sidebar-info-content');
    
    const sidebarName = document.getElementById('sidebar-name');
    const sidebarEmail = document.getElementById('sidebar-email');
    const sidebarPlayerId = document.getElementById('sidebar-player-id');
    const sidebarRole = document.getElementById('sidebar-role');
    const adminShortcut = document.getElementById('sidebar-admin-shortcut');
    const adminDivider = document.getElementById('admin-divider');

    let currentUid = '';

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

    if (menuBtn) menuBtn.addEventListener('click', openSidebar);
    if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
    if (overlay) overlay.addEventListener('click', closeSidebar);

    // Upgraded Copy ID functionality with visual feedback
    if (copyIdBtn) {
        copyIdBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (currentUid) {
                navigator.clipboard.writeText(currentUid).then(() => {
                    const icon = copyIdBtn.querySelector('span');
                    const originalClass = copyIdBtn.className;
                    
                    icon.textContent = 'check_circle';
                    copyIdBtn.className = "flex items-center justify-center p-1.5 rounded-md bg-secondary/20 border border-secondary text-secondary transition-all shadow-sm";
                    
                    setTimeout(() => {
                        icon.textContent = 'content_copy';
                        copyIdBtn.className = originalClass;
                    }, 2000);
                });
            }
        });
    }

    // Logout Functionality
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                // Optional: Add a spinner or loading state to the button here
                logoutBtn.innerHTML = `<span class="material-symbols-outlined animate-spin text-[22px]">refresh</span> <span class="font-headline font-black text-sm uppercase tracking-widest italic">Signing Out...</span>`;
                await signOut(auth);
                localStorage.clear(); // Clear all caches
                window.location.href = 'index.html';
            } catch (error) {
                console.error('Logout error:', error);
                alert('Failed to log out.');
            }
        });
    }

    // ==========================================
    // 3. AUTH SYNC & DATA POPULATION
    // ==========================================
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUid = user.uid;
            
            // Hide Skeletons, Show Content
            sidebarAvatarSkeleton.classList.add('hidden');
            sidebarAvatar.classList.remove('hidden');
            sidebarInfoSkeleton.classList.add('hidden');
            sidebarInfoContent.classList.remove('hidden');
            sidebarInfoContent.classList.add('flex');

            // Set Quick Fallbacks First
            sidebarName.textContent = user.displayName || "Unknown Player";
            sidebarEmail.textContent = user.email || "";
            sidebarPlayerId.textContent = `ID: ${user.uid.substring(0, 8)}...`;
            sidebarPlayerId.title = user.uid;
            sidebarAvatar.src = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'P')}&background=20262f&color=ff8f6f`;

            try {
                // Fetch Detailed Profile
                const userDoc = await getDoc(doc(db, "users", user.uid));
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    
                    sidebarName.textContent = userData.displayName || user.displayName;
                    sidebarAvatar.src = userData.photoURL || user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.displayName || 'P')}&background=20262f&color=ff8f6f`;
                    
                    const role = userData.accountType || 'PLAYER';
                    sidebarRole.innerHTML = `<span class="skew-x-[10deg] inline-block">${role}</span>`;
                    
                    if (role === 'Administrator') {
                        sidebarRole.className = "bg-error/10 text-error border border-error/30 text-[11px] px-5 py-1.5 rounded-none skew-x-[-10deg] font-black tracking-widest uppercase shadow-sm mt-1 inline-block";
                        if (adminShortcut) {
                            adminShortcut.classList.remove('hidden');
                            adminShortcut.classList.add('flex');
                            adminDivider.classList.remove('hidden');
                        }
                    } else if (role === 'Verified') {
                        sidebarRole.className = "bg-secondary/10 text-secondary border border-secondary/30 text-[11px] px-5 py-1.5 rounded-none skew-x-[-10deg] font-black tracking-widest uppercase shadow-sm mt-1 inline-block";
                    } else {
                         sidebarRole.className = "bg-primary/10 text-primary border border-primary/30 text-[11px] px-5 py-1.5 rounded-none skew-x-[-10deg] font-black tracking-widest uppercase shadow-sm mt-1 inline-block";
                    }
                }
            } catch(e) {
                console.error("Error fetching user data for sidebar:", e);
            }
        } else {
            // User not logged in, show Guest State
            sidebarAvatarSkeleton.classList.add('hidden');
            sidebarAvatar.classList.remove('hidden');
            sidebarInfoSkeleton.classList.add('hidden');
            sidebarInfoContent.classList.remove('hidden');
            sidebarInfoContent.classList.add('flex');

            sidebarName.textContent = "Guest Player";
            sidebarEmail.textContent = "Sign in to save progress";
            sidebarPlayerId.textContent = `ID: GUEST`;
            sidebarRole.innerHTML = `<span class="skew-x-[10deg] inline-block">GUEST</span>`;
            sidebarRole.className = "bg-outline-variant/10 text-outline-variant border border-outline-variant/30 text-[11px] px-5 py-1.5 rounded-none skew-x-[-10deg] font-black tracking-widest uppercase shadow-sm mt-1 inline-block";
            
            if (adminShortcut) {
                adminShortcut.classList.add('hidden');
                adminShortcut.classList.remove('flex');
                adminDivider.classList.add('hidden');
            }
        }
    });

});
