import { auth, db } from './firebase-setup.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // 1. INJECT SIDEBAR HTML GLOBALLY
    // ==========================================
    const sidebarHtml = `
        <div id="global-sidebar-overlay" class="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] hidden opacity-0 transition-opacity duration-300"></div>
        <aside id="global-sidebar" class="fixed top-0 left-0 h-full w-[80%] max-w-[320px] bg-[#0a0e14] border-r border-outline-variant/10 z-[70] transform -translate-x-full transition-transform duration-300 flex flex-col shadow-[20px_0_60px_rgba(0,0,0,0.6)]">
            
            <div class="px-6 py-6 flex items-center justify-between border-b border-outline-variant/10">
                <img src="assets/logo.png" alt="Liga PH Logo" class="h-8 object-contain drop-shadow-md" onerror="this.style.display='none'">
                <h1 class="font-headline text-xl font-black italic tracking-tighter text-primary uppercase" style="display: none;" id="sidebar-fallback-logo">Liga PH</h1>
                <button id="close-sidebar-btn" class="text-on-surface-variant hover:text-primary transition-colors p-2 -mr-2 rounded-full active:scale-95">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>

            <a href="profile.html" class="px-6 py-10 flex flex-col items-center text-center group cursor-pointer hover:bg-surface-container-low/50 transition-colors">
                <div class="relative mb-4">
                    <img id="sidebar-avatar" alt="Profile" class="w-24 h-24 rounded-full object-cover object-top border-2 border-outline-variant/20 shadow-lg group-hover:border-primary transition-colors duration-300" src="https://ui-avatars.com/api/?name=User&background=20262f&color=ff8f6f"/>
                    <div class="absolute bottom-1 right-1 w-5 h-5 bg-primary rounded-full border-4 border-[#0a0e14]"></div>
                </div>

                <h2 id="sidebar-name" class="font-headline font-black text-xl text-on-surface tracking-tight truncate w-full uppercase group-hover:text-primary transition-colors duration-300">Loading...</h2>
                <p id="sidebar-email" class="text-xs text-on-surface-variant font-medium truncate w-full mt-1 mb-2">...</p>
                
                <div class="flex items-center justify-center gap-2 mb-4 w-full px-4 relative z-20">
                    <p id="sidebar-player-id" class="text-[10px] text-outline-variant font-bold tracking-widest uppercase truncate max-w-[140px]" title="Full ID">ID: ...</p>
                    <button id="copy-id-btn" class="flex items-center justify-center text-outline-variant hover:text-primary transition-colors p-1.5 rounded-md bg-surface-container border border-outline-variant/10 hover:border-primary/30 active:scale-95 shadow-sm" title="Copy Full ID">
                        <span class="material-symbols-outlined text-[14px]">content_copy</span>
                    </button>
                </div>

                <span id="sidebar-role" class="bg-primary/10 text-primary border border-primary/20 text-[10px] px-4 py-1.5 rounded-full font-black tracking-widest uppercase shadow-sm mt-1">PLAYER</span>
            </a>

            <div class="px-6"><div class="h-[1px] bg-outline-variant/10"></div></div>

            <nav class="flex-1 px-4 py-6 space-y-2 overflow-y-auto custom-scrollbar">
                <a href="admin.html" id="sidebar-admin-shortcut" class="hidden items-center gap-4 px-4 py-3.5 rounded-2xl bg-error/10 text-error hover:bg-error/20 border border-error/20 transition-colors duration-200 group shadow-sm mb-4">
                    <span class="material-symbols-outlined group-hover:scale-110 transition-transform text-[20px]">admin_panel_settings</span>
                    <span class="font-headline font-black text-sm tracking-widest uppercase">Admin Dashboard</span>
                </a>

                <a href="#" class="flex items-center gap-4 px-4 py-3.5 rounded-2xl text-on-surface hover:bg-surface-container-highest transition-colors duration-200 group">
                    <span class="material-symbols-outlined text-outline-variant group-hover:text-primary transition-colors">settings</span>
                    <span class="font-headline font-semibold text-sm tracking-wide">Settings and Privacy</span>
                </a>
                <a href="#" class="flex items-center gap-4 px-4 py-3.5 rounded-2xl text-on-surface hover:bg-surface-container-highest transition-colors duration-200 group">
                    <span class="material-symbols-outlined text-outline-variant group-hover:text-primary transition-colors">help</span>
                    <span class="font-headline font-semibold text-sm tracking-wide">Help and Support</span>
                </a>
            </nav>

            <div class="px-6"><div class="h-[1px] bg-outline-variant/10"></div></div>

            <div class="p-6 mb-2">
                <button id="sidebar-logout-btn" class="w-full flex items-center justify-center gap-3 px-4 py-4 rounded-xl text-error hover:bg-error/10 border border-transparent hover:border-error/20 transition-all duration-200 group active:scale-95">
                    <span class="material-symbols-outlined text-xl group-hover:-translate-x-1 transition-transform">logout</span>
                    <span class="font-headline font-bold text-sm uppercase tracking-widest">Logout</span>
                </button>
            </div>
        </aside>
    `;

    // Inject right after the <body> tag opens
    document.body.insertAdjacentHTML('afterbegin', sidebarHtml);

    // If logo fails to load, show text fallback
    const logoImg = document.querySelector('#global-sidebar img[alt="Liga PH Logo"]');
    const logoText = document.getElementById('sidebar-fallback-logo');
    if (logoImg) {
        logoImg.onerror = () => {
            logoImg.style.display = 'none';
            if (logoText) logoText.style.display = 'block';
        };
    }

    // ==========================================
    // 2. DOM ELEMENTS & EVENT LISTENERS
    // ==========================================
    const sidebar = document.getElementById('global-sidebar');
    const overlay = document.getElementById('global-sidebar-overlay');
    const closeBtn = document.getElementById('close-sidebar-btn');
    const menuBtn = document.getElementById('menu-btn'); // Exists in headers
    const copyIdBtn = document.getElementById('copy-id-btn');
    const logoutBtn = document.getElementById('sidebar-logout-btn');
    
    // UI Elements for Data Sync
    const sidebarAvatar = document.getElementById('sidebar-avatar');
    const sidebarName = document.getElementById('sidebar-name');
    const sidebarEmail = document.getElementById('sidebar-email');
    const sidebarPlayerId = document.getElementById('sidebar-player-id');
    const sidebarRole = document.getElementById('sidebar-role');
    const adminShortcut = document.getElementById('sidebar-admin-shortcut');

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

    // Copy ID functionality
    if (copyIdBtn) {
        copyIdBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (currentUid) {
                navigator.clipboard.writeText(currentUid).then(() => {
                    const icon = copyIdBtn.querySelector('span');
                    icon.textContent = 'check';
                    icon.classList.add('text-primary');
                    setTimeout(() => {
                        icon.textContent = 'content_copy';
                        icon.classList.remove('text-primary');
                    }, 2000);
                });
            }
        });
    }

    // Logout Functionality
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await signOut(auth);
                localStorage.removeItem('ligaPhProfile');
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
            
            // Set Quick Fallbacks First
            sidebarName.textContent = user.displayName || "Unknown Player";
            sidebarEmail.textContent = user.email || "No Email";
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
                    sidebarRole.textContent = role;
                    
                    if (role === 'Administrator') {
                        sidebarRole.className = "bg-error/10 text-error border border-error/20 text-[10px] px-4 py-1.5 rounded-full font-black tracking-widest uppercase shadow-sm mt-1";
                        if (adminShortcut) {
                            adminShortcut.classList.remove('hidden');
                            adminShortcut.classList.add('flex');
                        }
                    } else if (role === 'Verified') {
                        sidebarRole.className = "bg-secondary/10 text-secondary border border-secondary/20 text-[10px] px-4 py-1.5 rounded-full font-black tracking-widest uppercase shadow-sm mt-1";
                    }
                }
            } catch(e) {
                console.error("Error fetching user data for sidebar:", e);
            }
        } else {
            // User not logged in, reset UI
            sidebarName.textContent = "Guest";
            sidebarEmail.textContent = "";
            sidebarRole.textContent = "GUEST";
            if (adminShortcut) {
                adminShortcut.classList.add('hidden');
                adminShortcut.classList.remove('flex');
            }
        }
    });

});
