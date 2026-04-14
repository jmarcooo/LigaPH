document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. DEFINE THE VIEWS ---
    // In a real app, these would be fetched from the server or Firebase. 
    // For the shell demo, we hardcode the HTML layout of the 4 tabs.
    const views = [
        {
            id: 'home',
            icon: 'home',
            html: `
                <div class="p-6 max-w-md mx-auto pt-10">
                    <h1 class="font-headline text-4xl font-black italic uppercase tracking-tighter text-on-surface mb-2">Welcome Home</h1>
                    <p class="text-sm text-on-surface-variant mb-6">Notice how the header and footer didn't blink when you loaded this? That's an App Shell.</p>
                    <div class="bg-surface-container-high h-40 rounded-2xl border border-outline-variant/10 flex items-center justify-center shadow-md">
                        <span class="material-symbols-outlined text-6xl text-primary animate-pulse">sports_basketball</span>
                    </div>
                </div>
            `
        },
        {
            id: 'feeds',
            icon: 'forum',
            html: `
                <div class="p-6 max-w-md mx-auto pt-10">
                    <h1 class="font-headline text-4xl font-black italic uppercase tracking-tighter text-on-surface mb-2">The Feed</h1>
                    <p class="text-sm text-on-surface-variant mb-6">Swipe left or right anywhere on the screen to change tabs smoothly.</p>
                    <div class="space-y-4">
                        <div class="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/10">
                            <div class="flex items-center gap-3 mb-2">
                                <div class="w-8 h-8 rounded-full bg-primary/20"></div>
                                <div class="h-4 w-24 bg-surface-container-highest rounded"></div>
                            </div>
                            <div class="h-10 w-full bg-surface-container-highest rounded mt-3"></div>
                        </div>
                    </div>
                </div>
            `
        },
        {
            id: 'listings',
            icon: 'sports_basketball',
            html: `
                <div class="p-6 max-w-md mx-auto pt-10">
                    <h1 class="font-headline text-4xl font-black italic uppercase tracking-tighter text-on-surface mb-2">Open Games</h1>
                    <p class="text-sm text-on-surface-variant mb-6">This is where the game cards would be injected.</p>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="bg-surface-container-high h-32 rounded-2xl border border-outline-variant/10"></div>
                        <div class="bg-surface-container-high h-32 rounded-2xl border border-outline-variant/10"></div>
                        <div class="bg-surface-container-high h-32 rounded-2xl border border-outline-variant/10"></div>
                        <div class="bg-surface-container-high h-32 rounded-2xl border border-outline-variant/10"></div>
                    </div>
                </div>
            `
        },
        {
            id: 'squads',
            icon: 'shield',
            html: `
                <div class="p-6 max-w-md mx-auto pt-10">
                    <h1 class="font-headline text-4xl font-black italic uppercase tracking-tighter text-on-surface mb-2">Squads</h1>
                    <p class="text-sm text-on-surface-variant mb-6">End of the line. Swipe right to go back to games.</p>
                    <div class="bg-[#14171d] p-6 rounded-3xl border border-secondary/30 flex items-center justify-center text-secondary">
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
        navContainer.innerHTML = views.map((view, index) => {
            const isActive = index === currentIndex;
            const color = isActive ? 'text-primary' : 'text-outline-variant hover:text-on-surface';
            const fill = isActive ? "font-variation-settings: 'FILL' 1" : "";
            
            return `
                <button onclick="window.switchTab(${index})" class="flex flex-col items-center gap-1 p-2 ${color} transition-colors relative">
                    <span class="material-symbols-outlined text-[26px] transition-transform ${isActive ? 'scale-110' : ''}" style="${fill}">${view.icon}</span>
                    ${isActive ? '<span class="absolute -bottom-1 w-1 h-1 bg-primary rounded-full"></span>' : ''}
                </button>
            `;
        }).join('');
    }

    window.switchTab = function(newIndex) {
        if (newIndex === currentIndex) return;
        
        // Determine if we are sliding forward (left) or backward (right)
        const direction = newIndex > currentIndex ? 'forward' : 'backward';
        currentIndex = newIndex;

        // Use modern View Transitions API to slide the DOM content
        if (document.startViewTransition) {
            document.documentElement.setAttribute('data-swipe', direction);
            document.startViewTransition(() => {
                contentContainer.innerHTML = views[currentIndex].html;
                renderNav();
                contentContainer.scrollTop = 0; // Reset scroll position
            });
        } else {
            // Fallback for older browsers
            contentContainer.innerHTML = views[currentIndex].html;
            renderNav();
            contentContainer.scrollTop = 0;
        }
    };

    // --- 4. SWIPE GESTURE ENGINE ---
    let startX = 0, startY = 0, isSwiping = false;

    // Mobile Touch
    contentContainer.addEventListener('touchstart', e => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    }, { passive: true });

    contentContainer.addEventListener('touchend', e => {
        handleGesture(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    }, { passive: true });

    // Desktop Mouse Testing
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

        // Must be a clear horizontal swipe (not scrolling up/down)
        if (Math.abs(diffX) > 80 && diffY < 50) {
            if (diffX < 0 && currentIndex < views.length - 1) {
                // Swiped Left -> Next Tab
                window.switchTab(currentIndex + 1);
            } else if (diffX > 0 && currentIndex > 0) {
                // Swiped Right -> Previous Tab
                window.switchTab(currentIndex - 1);
            }
        }
    }

    // Initialize the app
    contentContainer.innerHTML = views[currentIndex].html;
    renderNav();
});
