import { navItems } from './nav-config.js';
import { handleLogout } from './auth.js';

// sidebar.js

document.addEventListener("DOMContentLoaded", () => {
    // 1. Define Navigation Items
    const currentPath = window.location.pathname;


    // 2. Create Sidebar Overlay
    const overlay = document.createElement('div');
    overlay.className = "fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] opacity-0 pointer-events-none transition-opacity duration-300";
    overlay.id = "sidebar-overlay";
    document.body.appendChild(overlay);

    // 3. Create Sidebar Panel
    const sidebar = document.createElement('aside');
    sidebar.className = "fixed top-0 left-0 w-72 h-full bg-surface-container-high border-r border-outline-variant/20 z-[70] transform -translate-x-full transition-transform duration-300 shadow-2xl flex flex-col";
    sidebar.id = "sidebar-panel";

    // Sidebar Header
    const sidebarHeader = document.createElement('div');
    sidebarHeader.className = "p-6 flex items-center justify-between border-b border-outline-variant/10";
    sidebarHeader.innerHTML = `
        <a href="feeds.html" class="font-['Lexend'] font-black tracking-tighter uppercase text-2xl italic text-primary hover:text-primary-container transition-colors">Liga PH</a>
        <button id="close-sidebar-btn" class="text-on-surface-variant hover:text-primary transition-colors p-2 rounded-full active:scale-95">
            <span class="material-symbols-outlined">close</span>
        </button>
    `;
    sidebar.appendChild(sidebarHeader);

    // Sidebar Content (Links)
    const sidebarNav = document.createElement('nav');
    sidebarNav.className = "p-4 flex-1 overflow-y-auto space-y-2";

    navItems.forEach(item => {
        const isActive = item.activePaths.some(p => currentPath.endsWith(p)) ||
                         (currentPath.endsWith('/') && item.name === 'Home');

        const a = document.createElement('a');
        a.href = item.link;
        a.className = `flex items-center gap-4 px-4 py-3 rounded-lg font-bold transition-all ${
            isActive
                ? "bg-primary/10 text-primary"
                : "text-on-surface-variant hover:bg-surface-bright hover:text-on-surface"
        }`;
        a.innerHTML = `
            <span class="material-symbols-outlined" style="${isActive ? "font-variation-settings: 'FILL' 1;" : ""}">${item.icon}</span>
            <span>${item.name}</span>
        `;
        sidebarNav.appendChild(a);
    });

    sidebar.appendChild(sidebarNav);

    // Sidebar Footer (Logout)
    const sidebarFooter = document.createElement('div');
    sidebarFooter.className = "p-4 border-t border-outline-variant/10";
    const logoutBtn = document.createElement('button');
    logoutBtn.id = "logout-btn";
    logoutBtn.className = "flex w-full items-center gap-4 px-4 py-3 rounded-lg font-bold transition-all text-error hover:bg-error/10 active:scale-95";
    logoutBtn.innerHTML = `
        <span class="material-symbols-outlined">logout</span>
        <span>Logout</span>
    `;
    logoutBtn.addEventListener('click', handleLogout);
    sidebarFooter.appendChild(logoutBtn);
    sidebar.appendChild(sidebarFooter);

    // MAKE SURE TO APPEND THE SIDEBAR TO THE DOCUMENT BODY!
    document.body.appendChild(sidebar);

    // 4. Handle Opening and Closing
    const openBtn = document.getElementById('menu-btn');
    const closeBtn = document.getElementById('close-sidebar-btn');

    function openSidebar() {
        overlay.classList.remove('opacity-0', 'pointer-events-none');
        overlay.classList.add('opacity-100');
        sidebar.classList.remove('-translate-x-full');
        sidebar.classList.add('translate-x-0');
        // Prevent background scrolling
        document.body.style.overflow = 'hidden';
    }

    function closeSidebar() {
        overlay.classList.remove('opacity-100');
        overlay.classList.add('opacity-0', 'pointer-events-none');
        sidebar.classList.remove('translate-x-0');
        sidebar.classList.add('-translate-x-full');
        // Restore background scrolling
        document.body.style.overflow = '';
    }

    if (openBtn) {
        openBtn.addEventListener('click', openSidebar);
    }
    if (closeBtn) {
        closeBtn.addEventListener('click', closeSidebar);
    }
    overlay.addEventListener('click', closeSidebar);
});
