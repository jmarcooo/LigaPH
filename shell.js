document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. DEFINE THE VIEWS ---
    const views = [
        {
            id: 'home', icon: 'home',
            html: `
                <div class="p-6 max-w-md mx-auto pt-10">
                    <h1 class="font-headline text-4xl font-black italic uppercase tracking-tighter text-on-surface mb-2">Welcome Home</h1>
                    <p class="text-sm text-on-surface-variant mb-6">Test the hamburger menu in the top left, or the elevated search button at the bottom!</p>
                    <div class="bg-surface-container-high h-40 rounded-2xl border border-outline-variant/10 shadow-md"></div>
                </div>
            `
        },
        {
            id: 'feeds', icon: 'forum',
            html: `
                <div class="p-6 max-w-md mx-auto pt-10">
                    <h1 class="font-headline text-4xl font-black italic uppercase tracking-tighter text-on-surface mb-2">The Feed</h1>
                    <p class="text-sm text-on-surface-variant mb-6">Swipe left or right anywhere on the screen.</p>
                    <div class="bg-surface-container-low h-32 rounded-2xl border border-outline-variant/10 mb-4"></div>
                    <div class="bg-surface-container-low h-32 rounded-2xl border border-outline-variant/10"></div>
                </div>
            `
        },
        {
            id: 'listings', icon: 'sports_basketball',
            html: `
                <div class="p-6 max-w-md mx-auto pt-10">
                    <h1 class="font-headline text-4xl font-black italic uppercase tracking-tighter text-on-surface mb-2">Open Games</h1>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="bg-surface-container-high h-32 rounded-2xl border border-outline-variant/10"></div>
                        <div class="bg-surface-container-high h-32 rounded-2xl border border-outline-variant/10"></div>
                    </div>
                </div>
            `
        },
        {
            id: 'squads', icon: 'shield',
            html: `
                <div class="p-6 max-w-md mx-auto pt-10">
                    <h1 class="font-headline text-4xl font-black italic uppercase tracking-tighter text-on-surface mb-2">Squads</h1>
                    <div class="bg-[#14171d] p-6 rounded-3xl border border-secondary/30 flex items-center justify-center text-secondary h-40">
                        <span class="material-symbols-outlined text-6xl">verified_user</span>
                    </div>
                </div>
            `
        }
    ];

    // --- 2. STATE MANAGEMENT ---
    let currentIndex = 0;
    const contentContainer = document.getElementById('app-content');
    const navContainer = document.getElementById('spa-nav');

    // --- 3. RENDER UI ---
    function renderNav() {
        // We manually construct the 5-button layout to keep Search in the middle
        navContainer.innerHTML = `
            <button onclick="window.switchTab(0)" class="flex flex-col items-center gap-1 p-2 ${currentIndex === 0 ? 'text-primary' : 'text-outline-variant'} transition-colors relative">
                <span class="material-symbols-outlined text-[26px]" style="${currentIndex === 0 ? "font-variation-settings: 'FILL' 1" : ""}">${views[0].icon}</span>
            </button>
            <button onclick="window.switchTab(1)" class="flex flex-col items-center gap-1 p-2 ${currentIndex === 1 ? 'text-primary' : 'text-outline-variant'} transition-colors relative">
                <span class="material-symbols-outlined text-[26px]" style="${currentIndex === 1 ? "font-variation-settings: 'FILL' 1" : ""}">${views[1].icon}</span>
            </button>

            <button id="trigger-search" class="flex flex-col items-center gap-1 p-3 -mt-5 bg-surface-container rounded-full border border-outline-variant/20 text-on-surface hover:text-primary hover:border-primary/50 transition-all shadow-lg active:scale-95">
                <span class="material-symbols-outlined text-[26px]">search</span>
            </button>

            <button onclick="window.switchTab(2)" class="flex flex-col items-center gap-1 p-2 ${currentIndex === 2 ? 'text-primary' : 'text-outline-variant'} transition-colors relative">
                <span class="material-symbols-outlined text-[26px]" style="${currentIndex === 2 ? "font-variation-settings: 'FILL' 1" : ""}">${views[2].icon}</span>
            </button>
            <button onclick="window.switchTab(3)" class="flex flex-col items-center gap-1 p-2 ${currentIndex === 3 ? 'text-primary' : 'text-outline-variant'} transition-colors relative">
                <span class="material-symbols-outlined text-[26px]" style="${currentIndex === 3 ? "font-variation-settings: 'FILL' 1" : ""}">${views[3].icon}</span>
            </button>
        `;

        // Attach listener to the newly rendered search button
        document.getElementById('trigger-search').addEventListener('click', window.openSearch);
    }

    window.switchTab = function(newIndex) {
        if (newIndex === currentIndex) return;
        const direction = newIndex > currentIndex ? 'forward' : 'backward';
        currentIndex = newIndex;

        if (document.startViewTransition) {
            document.documentElement.setAttribute('data-swipe', direction);
            document.startViewTransition(() => {
                contentContainer.innerHTML = views[currentIndex].html;
                renderNav();
                contentContainer.scrollTop = 0;
            });
        } else {
            contentContainer.innerHTML = views[currentIndex].html;
            renderNav();
            contentContainer.scrollTop = 0;
        }
    };

    // --- 4. GLOBAL SIDEBAR LOGIC ---
    const sidebar = document.getElementById('shell-sidebar');
    const sidebarOverlay = document.getElementById('shell-sidebar-overlay');
    const menuBtn = document.getElementById('menu-btn');
    const closeSidebarBtn = document.getElementById('close-sidebar-btn');

    window.openSidebar = function() {
        sidebarOverlay.classList.remove('hidden');
        setTimeout(() => sidebarOverlay.classList.remove('opacity-0'), 10);
        sidebar.classList.remove('-translate-x-full');
    };

    window.closeSidebar = function() {
        sidebar.classList.add('-translate-x-full');
        sidebarOverlay.classList.add('opacity-0');
        setTimeout(() => sidebarOverlay.classList.add('hidden'), 300);
    };

    menuBtn.addEventListener('click', window.openSidebar);
    closeSidebarBtn.addEventListener('click', window.closeSidebar);
    sidebarOverlay.addEventListener('click', window.closeSidebar);

    // --- 5. GLOBAL SEARCH LOGIC ---
    const searchOverlay = document.getElementById('shell-search-overlay');
    const closeSearchBtn = document.getElementById('close-search-btn');
    const searchInput = document.getElementById('shell-search-input');

    window.openSearch = function() {
        searchOverlay.classList.remove('hidden');
        setTimeout(() => searchOverlay.classList.remove('opacity-0'), 10);
        searchInput.focus();
    };

    window.closeSearch = function() {
        searchOverlay.classList.add('opacity-0');
        setTimeout(() => searchOverlay.classList.add('hidden'), 200);
        searchInput.value = '';
    };

    closeSearchBtn.addEventListener('click', window.closeSearch);

    // --- 6. SWIPE GESTURE ENGINE ---
    let startX = 0, startY = 0, isSwiping = false;

    contentContainer.addEventListener('touchstart', e => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    }, { passive: true });

    contentContainer.addEventListener('touchend', e => {
        handleGesture(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    }, { passive: true });

    contentContainer.addEventListener('mousedown', e => {
        isSwiping = true;
        startX = e.clientX;
        startY = e.clientY;
    });

    contentContainer.addEventListener('mouseup', e => {
        if (!isSwiping) return;
        isSwiping = false;
        handleGesture(e.clientX, e.clientY);
    });

    function handleGesture(endX, endY) {
        const diffX = endX - startX;
        const diffY = Math.abs(endY - startY);

        if (Math.abs(diffX) > 80 && diffY < 50) {
            if (diffX < 0 && currentIndex < views.length - 1) {
                window.switchTab(currentIndex + 1); // Swipe Left
            } else if (diffX > 0 && currentIndex > 0) {
                window.switchTab(currentIndex - 1); // Swipe Right
            }
        }
    }

    // Initialize the app shell
    contentContainer.innerHTML = views[currentIndex].html;
    renderNav();
});
