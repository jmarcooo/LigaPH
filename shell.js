document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. DEFINE THE VIEWS ---
    const views = [
        {
            id: 'home', icon: 'home',
            html: `
                <div class="p-6 max-w-md mx-auto pt-10">
                    <h1 class="font-headline text-4xl font-black italic uppercase text-on-surface mb-2">Home</h1>
                    <p class="text-sm text-on-surface-variant mb-6">Drag your finger across the screen slowly to see the 1-to-1 tracking.</p>
                    <div class="bg-surface-container-high h-40 rounded-2xl border border-outline-variant/10 shadow-md"></div>
                </div>
            `
        },
        {
            id: 'feeds', icon: 'forum',
            html: `
                <div class="p-6 max-w-md mx-auto pt-10">
                    <h1 class="font-headline text-4xl font-black italic uppercase text-on-surface mb-2">The Feed</h1>
                    <div class="space-y-4">
                        <div class="bg-surface-container-low h-32 rounded-2xl border border-outline-variant/10"></div>
                        <div class="bg-surface-container-low h-32 rounded-2xl border border-outline-variant/10"></div>
                    </div>
                </div>
            `
        },
        {
            id: 'listings', icon: 'sports_basketball',
            html: `
                <div class="p-6 max-w-md mx-auto pt-10">
                    <h1 class="font-headline text-4xl font-black italic uppercase text-on-surface mb-2">Games</h1>
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
                    <h1 class="font-headline text-4xl font-black italic uppercase text-on-surface mb-2">Squads</h1>
                    <div class="bg-surface-container-high h-40 rounded-3xl border border-secondary/30 flex items-center justify-center">
                        <span class="material-symbols-outlined text-6xl text-secondary">verified_user</span>
                    </div>
                </div>
            `
        }
    ];

    // --- 2. STATE MANAGEMENT & SETUP ---
    let currentIndex = 0;
    const track = document.getElementById('app-track');
    const navContainer = document.getElementById('spa-nav');

    // Render all 4 views side-by-side into the track
    track.innerHTML = views.map(v => `
        <section class="w-screen h-full flex-shrink-0 overflow-y-auto overflow-x-hidden pb-6 custom-scrollbar">
            ${v.html}
        </section>
    `).join('');

    function renderNav() {
        navContainer.innerHTML = `
            <button onclick="window.switchTab(0)" class="flex flex-col items-center p-2 ${currentIndex === 0 ? 'text-primary' : 'text-outline-variant'} transition-colors">
                <span class="material-symbols-outlined text-[26px]" style="${currentIndex === 0 ? "font-variation-settings: 'FILL' 1" : ""}">${views[0].icon}</span>
            </button>
            <button onclick="window.switchTab(1)" class="flex flex-col items-center p-2 ${currentIndex === 1 ? 'text-primary' : 'text-outline-variant'} transition-colors">
                <span class="material-symbols-outlined text-[26px]" style="${currentIndex === 1 ? "font-variation-settings: 'FILL' 1" : ""}">${views[1].icon}</span>
            </button>

            <button id="trigger-search" class="flex flex-col items-center gap-1 p-3 -mt-5 bg-surface-container rounded-full border border-outline-variant/20 text-on-surface hover:text-primary transition-all shadow-lg active:scale-95 z-50">
                <span class="material-symbols-outlined text-[26px]">search</span>
            </button>

            <button onclick="window.switchTab(2)" class="flex flex-col items-center p-2 ${currentIndex === 2 ? 'text-primary' : 'text-outline-variant'} transition-colors">
                <span class="material-symbols-outlined text-[26px]" style="${currentIndex === 2 ? "font-variation-settings: 'FILL' 1" : ""}">${views[2].icon}</span>
            </button>
            <button onclick="window.switchTab(3)" class="flex flex-col items-center p-2 ${currentIndex === 3 ? 'text-primary' : 'text-outline-variant'} transition-colors">
                <span class="material-symbols-outlined text-[26px]" style="${currentIndex === 3 ? "font-variation-settings: 'FILL' 1" : ""}">${views[3].icon}</span>
            </button>
        `;
        document.getElementById('trigger-search').addEventListener('click', () => {
            document.getElementById('shell-search-overlay').classList.remove('hidden');
            setTimeout(() => document.getElementById('shell-search-overlay').classList.remove('opacity-0'), 10);
        });
    }

    function setTrackPosition(positionX) {
        track.style.transform = `translateX(${positionX}px)`;
    }

    // --- 3. THE 1-TO-1 DRAG ENGINE ---
    let startX = 0, startY = 0;
    let currentTranslate = 0, prevTranslate = 0;
    let isDragging = false, isVerticalScroll = false, directionDetermined = false;

    // Supports both Touch (Mobile) and Mouse (Desktop testing)
    function dragStart(clientX, clientY) {
        isDragging = true;
        directionDetermined = false;
        isVerticalScroll = false;
        startX = clientX;
        startY = clientY;
        
        // Remove animation class so it sticks exactly to the finger
        track.classList.remove('is-animating');
    }

    function dragMove(clientX, clientY, event) {
        if (!isDragging) return;
        
        const deltaX = clientX - startX;
        const deltaY = clientY - startY;

        // If we haven't figured out if the user is scrolling up/down or swiping left/right
        if (!directionDetermined) {
            if (Math.abs(deltaY) > Math.abs(deltaX)) {
                isVerticalScroll = true; // They are reading the feed, let them scroll
            }
            directionDetermined = true;
        }

        if (isVerticalScroll) return; // Do not drag the screen sideways if they are scrolling down

        // Prevent browser back/forward swipe hijack on mobile
        if(event.cancelable) event.preventDefault(); 
        
        // Add physical resistance if dragging past the first or last page
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
        
        // Snap logic: if they dragged more than 100px, change page
        if (deltaX < -100 && currentIndex < views.length - 1) currentIndex += 1;
        if (deltaX > 100 && currentIndex > 0) currentIndex -= 1;

        snapToCurrentIndex();
    }

    window.switchTab = function(index) {
        currentIndex = index;
        snapToCurrentIndex();
    };

    function snapToCurrentIndex() {
        track.classList.add('is-animating'); // Add smooth transition back
        prevTranslate = currentIndex * -window.innerWidth;
        setTrackPosition(prevTranslate);
        renderNav();
    }

    // --- EVENT LISTENERS ---
    // Touch Events
    track.addEventListener('touchstart', e => dragStart(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    track.addEventListener('touchmove', e => dragMove(e.touches[0].clientX, e.touches[0].clientY, e), { passive: false });
    track.addEventListener('touchend', e => dragEnd(e.changedTouches[0].clientX));

    // Mouse Events (For desktop browser testing)
    track.addEventListener('mousedown', e => dragStart(e.clientX, e.clientY));
    track.addEventListener('mousemove', e => dragMove(e.clientX, e.clientY, e));
    track.addEventListener('mouseup', e => dragEnd(e.clientX));
    track.addEventListener('mouseleave', () => { if(isDragging) snapToCurrentIndex(); isDragging = false; });

    // Handle Window Resize (re-calculate widths)
    window.addEventListener('resize', () => {
        track.classList.remove('is-animating');
        prevTranslate = currentIndex * -window.innerWidth;
        setTrackPosition(prevTranslate);
    });

    // Sidebar & Search Closers
    document.getElementById('close-sidebar-btn').addEventListener('click', () => {
        document.getElementById('shell-sidebar').classList.add('-translate-x-full');
        document.getElementById('shell-sidebar-overlay').classList.add('hidden');
    });
    document.getElementById('close-search-btn').addEventListener('click', () => {
        document.getElementById('shell-search-overlay').classList.add('hidden');
    });

    // Initialize
    renderNav();
});
