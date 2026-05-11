document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. DEFINE THE 5 CORE VIEWS ---
    const views = [
        {
            id: 'home', icon: 'home',
            html: `
                <div class="p-6 max-w-md mx-auto pt-10 h-full">
                    <h1 class="font-headline text-4xl font-black italic uppercase text-on-surface mb-2">Home</h1>
                    <p class="text-sm text-on-surface-variant mb-6">Swipe left and right to navigate between tabs.</p>
                    <div class="bg-surface-container-high h-40 rounded-3xl border border-outline-variant/10 shadow-md"></div>
                </div>
            `
        },
        {
            id: 'feeds', icon: 'forum',
            html: `
                <div class="p-6 max-w-md mx-auto pt-10 h-full">
                    <h1 class="font-headline text-4xl font-black italic uppercase text-on-surface mb-2">The Feed</h1>
                    <div class="space-y-4">
                        <div class="bg-surface-container-low h-32 rounded-3xl border border-outline-variant/10"></div>
                        <div class="bg-surface-container-low h-32 rounded-3xl border border-outline-variant/10"></div>
                    </div>
                </div>
            `
        },
        {
            id: 'listings', icon: 'sports_basketball',
            html: `
                <div class="p-6 max-w-md mx-auto pt-10 h-full">
                    <h1 class="font-headline text-4xl font-black italic uppercase text-on-surface mb-2">Games</h1>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="bg-surface-container-high h-40 rounded-3xl border border-outline-variant/10"></div>
                        <div class="bg-surface-container-high h-40 rounded-3xl border border-outline-variant/10"></div>
                    </div>
                </div>
            `
        },
        {
            id: 'roster', icon: 'groups',
            html: `
                <div class="p-6 max-w-md mx-auto pt-10 h-full">
                    <h1 class="font-headline text-4xl font-black italic uppercase text-on-surface mb-2">Roster</h1>
                    <div class="bg-surface-container-high h-40 rounded-3xl border border-outline-variant/10 flex items-center justify-center">
                        <span class="material-symbols-outlined text-6xl text-secondary opacity-50">shield</span>
                    </div>
                </div>
            `
        },
        {
            id: 'profile', icon: 'account_circle',
            html: `
                <div class="p-6 max-w-md mx-auto pt-10 h-full">
                    <h1 class="font-headline text-4xl font-black italic uppercase text-on-surface mb-2 text-primary">Profile</h1>
                    <div class="w-24 h-24 rounded-full bg-surface-container-highest border-4 border-[#0a0e14] shadow-xl mx-auto mt-6 flex items-center justify-center">
                        <span class="material-symbols-outlined text-4xl text-outline-variant">person</span>
                    </div>
                </div>
            `
        }
    ];

    // --- 2. STATE MANAGEMENT & SETUP ---
    let currentIndex = 0;
    const track = document.getElementById('app-track');
    const viewport = document.getElementById('app-viewport'); 
    
    // Fallback to spa-nav if action-bar-container doesn't exist
    const navContainer = document.getElementById('action-bar-container') || document.getElementById('spa-nav');

    track.innerHTML = views.map(v => `
        <section class="w-screen h-full flex-shrink-0 overflow-y-auto overflow-x-hidden pb-6 custom-scrollbar">
            ${v.html}
        </section>
    `).join('');

    function renderNav() {
        if (!navContainer) return;
        
        // Exact mirror of live action-bar.js HTML structure, but using window.switchTab()
        navContainer.innerHTML = `
            <div class="fixed bottom-0 w-full bg-[#0a0e14]/95 backdrop-blur-md border-t border-outline-variant/10 z-40 pb-safe md:hidden shadow-[0_-5px_20px_rgba(0,0,0,0.5)]">
                <div class="flex justify-around items-center h-16 px-2">
                    <button onclick="window.switchTab(0)" class="flex flex-col items-center gap-1 p-2 ${currentIndex === 0 ? 'text-primary' : 'text-outline-variant hover:text-on-surface'} transition-colors">
                        <span class="material-symbols-outlined text-[28px]" style="${currentIndex === 0 ? "font-variation-settings: 'FILL' 1" : ""}">home</span>
                    </button>
                    
                    <button onclick="window.switchTab(1)" class="flex flex-col items-center gap-1 p-2 ${currentIndex === 1 ? 'text-primary' : 'text-outline-variant hover:text-on-surface'} transition-colors">
                        <span class="material-symbols-outlined text-[28px]" style="${currentIndex === 1 ? "font-variation-settings: 'FILL' 1" : ""}">forum</span>
                    </button>
                    
                    <button onclick="window.switchTab(2)" class="flex flex-col items-center gap-1 p-3.5 -mt-6 rounded-full border transition-all shadow-lg active:scale-95 ${currentIndex === 2 ? 'bg-primary text-on-primary-container border-primary/50' : 'bg-surface-container text-on-surface border-outline-variant/20 hover:text-primary hover:border-primary/50'}">
                        <span class="material-symbols-outlined text-[32px]" style="${currentIndex === 2 ? "font-variation-settings: 'FILL' 1" : ""}">sports_basketball</span>
                    </button>
                    
                    <button onclick="window.switchTab(3)" class="flex flex-col items-center gap-1 p-2 ${currentIndex === 3 ? 'text-primary' : 'text-outline-variant hover:text-on-surface'} transition-colors">
                        <span class="material-symbols-outlined text-[28px]" style="${currentIndex === 3 ? "font-variation-settings: 'FILL' 1" : ""}">groups</span>
                    </button>
                    
                    <button onclick="window.switchTab(4)" class="flex flex-col items-center justify-center p-2 transition-colors group">
                        <span class="material-symbols-outlined text-[28px] ${currentIndex === 4 ? 'text-primary' : 'text-outline-variant hover:text-on-surface'}" style="${currentIndex === 4 ? "font-variation-settings: 'FILL' 1" : ""}">account_circle</span>
                    </button>
                </div>
            </div>
        `;
    }

    function setTrackPosition(positionX) {
        track.style.transform = `translateX(${positionX}px)`;
    }

    // --- 3. THE 1-TO-1 DRAG ENGINE ---
    let startX = 0, startY = 0;
    let currentTranslate = 0, prevTranslate = 0;
    let isDragging = false, isVerticalScroll = false, directionDetermined = false;

    function dragStart(clientX, clientY) {
        isDragging = true;
        directionDetermined = false;
        isVerticalScroll = false;
        startX = clientX;
        startY = clientY;
        track.classList.remove('is-animating');
    }

    function dragMove(clientX, clientY, event) {
        if (!isDragging) return;
        
        const deltaX = clientX - startX;
        const deltaY = clientY - startY;

        if (!directionDetermined) {
            if (Math.abs(deltaY) > Math.abs(deltaX)) isVerticalScroll = true;
            directionDetermined = true;
        }

        if (isVerticalScroll) return; 

        if(event.cancelable) event.preventDefault(); 
        
        let targetTranslate = prevTranslate + deltaX;
        if (targetTranslate > 0) targetTranslate = targetTranslate * 0.2; 
        if (targetTranslate < -(views.length - 1) * window.innerWidth) {
            targetTranslate = prevTranslate + (deltaX * 0.2);
        }

        setTrackPosition(targetTranslate);
    }

    function dragEnd(clientX) {
        if (!isDragging || isVerticalScroll) {
            isDragging = false;
            return;
        }
        isDragging = false;
        
        const deltaX = clientX - startX;
        
        if (deltaX < -80 && currentIndex < views.length - 1) currentIndex += 1;
        if (deltaX > 80 && currentIndex > 0) currentIndex -= 1;

        snapToCurrentIndex();
    }

    window.switchTab = function(index) {
        currentIndex = index;
        snapToCurrentIndex();
    };

    function snapToCurrentIndex() {
        track.classList.add('is-animating'); 
        prevTranslate = currentIndex * -window.innerWidth;
        setTrackPosition(prevTranslate);
        renderNav(); // Update active states on the action bar
    }

    // --- 4. EVENT LISTENERS ---
    viewport.addEventListener('touchstart', e => dragStart(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    viewport.addEventListener('touchmove', e => dragMove(e.touches[0].clientX, e.touches[0].clientY, e), { passive: false });
    viewport.addEventListener('touchend', e => dragEnd(e.changedTouches[0].clientX));

    viewport.addEventListener('mousedown', e => dragStart(e.clientX, e.clientY));
    viewport.addEventListener('mousemove', e => dragMove(e.clientX, e.clientY, e));
    viewport.addEventListener('mouseup', e => dragEnd(e.clientX));
    viewport.addEventListener('mouseleave', () => { if(isDragging) snapToCurrentIndex(); isDragging = false; });

    window.addEventListener('resize', () => {
        track.classList.remove('is-animating');
        prevTranslate = currentIndex * -window.innerWidth;
        setTrackPosition(prevTranslate);
    });

    document.getElementById('menu-btn')?.addEventListener('click', () => {
        document.getElementById('global-sidebar-overlay')?.classList.remove('hidden');
        setTimeout(() => document.getElementById('global-sidebar-overlay')?.classList.remove('opacity-0'), 10);
        document.getElementById('global-sidebar')?.classList.remove('-translate-x-full');
    });

    document.getElementById('header-search-btn')?.addEventListener('click', () => {
        document.getElementById('shell-search-overlay')?.classList.remove('hidden');
        setTimeout(() => document.getElementById('shell-search-overlay')?.classList.remove('opacity-0'), 10);
    });

    document.getElementById('close-search-btn')?.addEventListener('click', () => {
        document.getElementById('shell-search-overlay')?.classList.add('opacity-0');
        setTimeout(() => document.getElementById('shell-search-overlay')?.classList.add('hidden'), 200);
    });

    // Initialize
    renderNav();
});
