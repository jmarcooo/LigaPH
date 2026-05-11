document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. DEFINE THE 5 CORE VIEWS (Matching Live UI) ---
    const views = [
        {
            id: 'home', icon: 'home',
            html: `
                <div class="pt-6 px-4 pb-24 max-w-md mx-auto w-full space-y-6">
                    <div class="relative w-full rounded-2xl overflow-hidden bg-surface-container-high border border-outline-variant/20 shadow-lg h-[450px]">
                         <div class="absolute inset-0 bg-surface-container-high p-6 flex flex-col justify-end animate-pulse">
                            <div class="w-24 h-6 bg-surface-container-highest rounded-full mb-3 shadow-inner"></div>
                            <div class="w-3/4 h-10 bg-surface-container-highest rounded-xl mb-3 shadow-inner"></div>
                            <div class="w-1/2 h-4 bg-surface-container-highest rounded-lg mb-6 shadow-inner"></div>
                            <div class="w-32 h-10 bg-surface-container-highest rounded-xl mt-4 shadow-inner"></div>
                        </div>
                    </div>

                    <div>
                        <div class="flex items-center gap-3 mb-4 px-2 mt-8">
                            <span class="material-symbols-outlined text-primary text-[28px]">verified</span>
                            <h2 class="font-headline text-2xl font-black italic uppercase tracking-tighter text-on-surface">Official News</h2>
                        </div>
                        <div class="bg-surface-container-low rounded-2xl p-5 border border-outline-variant/5 animate-pulse">
                            <div class="flex items-center gap-3 mb-4">
                                <div class="w-10 h-10 rounded-xl bg-surface-container-highest"></div>
                                <div class="space-y-2 flex-1">
                                    <div class="h-3 w-24 bg-surface-container-highest rounded"></div>
                                    <div class="h-2 w-16 bg-surface-container-highest rounded"></div>
                                </div>
                            </div>
                            <div class="h-6 w-3/4 bg-surface-container-highest rounded mb-3"></div>
                            <div class="aspect-square w-full bg-surface-container-highest rounded-xl mb-4"></div>
                        </div>
                    </div>
                </div>
            `
        },
        {
            id: 'feeds', icon: 'forum',
            html: `
                <div class="pt-6 px-4 pb-24 max-w-md mx-auto w-full space-y-6">
                    <div class="bg-surface-container-low rounded-3xl p-5 border border-outline-variant/10 shadow-md">
                        <div class="flex gap-4 items-start mb-4">
                            <div class="w-12 h-12 rounded-full bg-surface-container-highest shrink-0 border-2 border-outline-variant/30"></div>
                            <div class="flex-1 pt-2">
                                <div class="w-3/4 h-6 bg-surface-container-highest rounded mb-2"></div>
                                <div class="w-1/2 h-4 bg-surface-container-highest rounded"></div>
                            </div>
                        </div>
                        <div class="flex items-center justify-between pt-4 border-t border-outline-variant/10">
                            <div class="flex gap-2">
                                <span class="material-symbols-outlined text-[20px] text-outline p-2">image</span>
                                <span class="material-symbols-outlined text-[20px] text-outline p-2">location_on</span>
                            </div>
                            <div class="bg-primary text-on-primary-container px-6 py-2 rounded-full font-black uppercase text-xs tracking-widest opacity-50">Post</div>
                        </div>
                    </div>

                    <div class="bg-surface-container-low rounded-3xl p-6 border border-outline-variant/5 animate-pulse">
                        <div class="flex gap-4 mb-4">
                            <div class="w-12 h-12 rounded-full bg-surface-container-highest shrink-0"></div>
                            <div class="flex-1 space-y-2 py-1">
                                <div class="h-4 bg-surface-container-highest rounded w-1/3"></div>
                                <div class="h-3 bg-surface-container-highest rounded w-1/4"></div>
                            </div>
                        </div>
                        <div class="space-y-2 mb-4">
                            <div class="h-3 bg-surface-container-highest rounded w-full"></div>
                            <div class="h-3 bg-surface-container-highest rounded w-5/6"></div>
                        </div>
                        <div class="aspect-square w-full bg-surface-container-highest rounded-2xl"></div>
                    </div>
                </div>
            `
        },
        {
            id: 'listings', icon: 'sports_basketball',
            html: `
                <div class="pt-6 px-4 pb-24 max-w-md mx-auto w-full">
                    <div class="relative w-full rounded-3xl bg-[#14171d] border border-outline-variant/10 overflow-hidden mb-6 p-6 shadow-lg text-center">
                        <h1 class="font-headline text-3xl font-black italic uppercase tracking-tighter text-white leading-none mb-2">Find Games</h1>
                        <p class="text-xs text-outline-variant font-bold tracking-widest uppercase flex items-center justify-center gap-1.5"><span class="material-symbols-outlined text-[14px] text-primary">location_on</span> Near Taguig</p>
                    </div>

                    <div class="space-y-4">
                        <div class="bg-surface-container-low rounded-3xl p-5 border border-outline-variant/10 shadow-sm animate-pulse h-40"></div>
                        <div class="bg-surface-container-low rounded-3xl p-5 border border-outline-variant/10 shadow-sm animate-pulse h-40"></div>
                        <div class="bg-surface-container-low rounded-3xl p-5 border border-outline-variant/10 shadow-sm animate-pulse h-40"></div>
                    </div>
                </div>
            `
        },
        {
            id: 'roster', icon: 'groups',
            html: `
                <div class="pt-6 px-4 pb-24 max-w-md mx-auto w-full">
                    <div class="relative w-full rounded-[32px] bg-[#14171d] border border-outline-variant/10 overflow-hidden mb-6 p-6 shadow-lg">
                        <h1 class="font-headline text-3xl font-black italic uppercase tracking-tighter text-white leading-none mb-3">The Roster</h1>
                        <div class="flex bg-[#0a0e14]/50 backdrop-blur-md p-1 rounded-xl w-full border border-white/5 shadow-inner">
                            <button class="flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-lg bg-primary text-[#0a0e14]">Squads</button>
                            <button class="flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-lg text-outline-variant">Players</button>
                        </div>
                    </div>

                    <div class="mb-8">
                        <h2 class="font-headline text-sm font-black text-outline uppercase tracking-[0.2em] mb-4 pl-2">My Affiliation</h2>
                        <div class="bg-surface-container-low rounded-3xl p-6 border border-outline-variant/10 shadow-sm animate-pulse h-[120px]"></div>
                    </div>

                    <div class="grid grid-cols-1 gap-3">
                        <div class="bg-surface-container-low rounded-[20px] border border-outline-variant/10 shadow-sm animate-pulse h-20"></div>
                        <div class="bg-surface-container-low rounded-[20px] border border-outline-variant/10 shadow-sm animate-pulse h-20"></div>
                        <div class="bg-surface-container-low rounded-[20px] border border-outline-variant/10 shadow-sm animate-pulse h-20"></div>
                    </div>
                </div>
            `
        },
        {
            id: 'profile', icon: 'account_circle',
            html: `
                <div class="pt-6 px-4 pb-24 max-w-md mx-auto w-full">
                    <div class="relative mb-12">
                        <div class="h-40 w-full rounded-3xl bg-surface-container-highest overflow-hidden relative shadow-lg"></div>
                        <div class="relative z-20 -mt-16 px-4 flex flex-col items-center text-center">
                            
                            <div class="relative w-32 h-32 rounded-full bg-[#0a0e14] flex items-center justify-center p-1 border-4 border-[#0a0e14] shadow-2xl mb-3">
                                <img src="https://ui-avatars.com/api/?name=Jon+Marco&background=20262f&color=ff8f6f" class="w-full h-full object-cover rounded-full border border-outline-variant/20">
                                <div class="absolute bottom-1 right-1 bg-primary text-black w-8 h-8 rounded-full flex items-center justify-center border-4 border-[#0a0e14]">
                                    <span class="material-symbols-outlined text-[16px]">sports_basketball</span>
                                </div>
                            </div>
                            
                            <h1 class="font-headline text-4xl font-black italic tracking-tighter uppercase text-primary leading-none mb-3">JON MARCO</h1>
                            
                            <div class="flex flex-wrap gap-2 justify-center items-center mb-4">
                                <span class="bg-primary/10 text-primary border border-primary/20 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest">PG</span>
                                <span class="bg-surface-container-highest border border-outline-variant/30 text-on-surface px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest">Intermediate</span>
                            </div>

                            <p class="text-sm font-bold text-on-surface-variant flex items-center justify-center gap-1 mb-6">
                                <span class="material-symbols-outlined text-[18px]">location_on</span> Taguig, Metro Manila
                            </p>
                            
                            <button class="bg-primary hover:brightness-110 text-black px-8 py-3 rounded-xl font-headline font-black uppercase tracking-widest shadow-[0_0_20px_rgba(255,143,111,0.25)] text-xs items-center justify-center gap-1.5 flex w-full">
                                <span class="material-symbols-outlined text-[18px]">edit</span> Edit Profile
                            </button>
                        </div>
                    </div>

                    <div class="grid grid-cols-4 gap-2 mb-8">
                        <div class="bg-surface-container-low border border-outline-variant/10 rounded-2xl p-2 text-center flex flex-col justify-center items-center shadow-sm">
                            <span class="material-symbols-outlined text-[18px] text-outline-variant mb-1">sports_basketball</span>
                            <p class="font-headline font-black text-xl text-on-surface mb-0.5 leading-none">0</p>
                            <p class="text-[8px] font-bold uppercase tracking-widest text-outline">Games</p>
                        </div>
                        <div class="bg-surface-container-low border border-outline-variant/10 rounded-2xl p-2 text-center flex flex-col justify-center items-center shadow-sm">
                            <span class="material-symbols-outlined text-[18px] text-primary mb-1">verified</span>
                            <p class="font-headline font-black text-xl text-primary mb-0.5 leading-none">0%</p>
                            <p class="text-[8px] font-bold uppercase tracking-widest text-outline">Reliable</p>
                        </div>
                        <div class="bg-surface-container-low border border-outline-variant/10 rounded-2xl p-2 text-center flex flex-col justify-center items-center shadow-sm">
                            <span class="material-symbols-outlined text-[18px] text-secondary mb-1">handshake</span>
                            <p class="font-headline font-black text-xl text-on-surface mb-0.5 leading-none">0</p>
                            <p class="text-[8px] font-bold uppercase tracking-widest text-outline">Conn</p>
                        </div>
                        <div class="bg-surface-container-low border border-outline-variant/10 rounded-2xl p-2 text-center flex flex-col justify-center items-center shadow-sm">
                            <span class="material-symbols-outlined text-[18px] text-tertiary mb-1">military_tech</span>
                            <p class="font-headline font-black text-xl text-on-surface mb-0.5 leading-none">0</p>
                            <p class="text-[8px] font-bold uppercase tracking-widest text-outline">Commends</p>
                        </div>
                    </div>
                </div>
            `
        }
    ];

    // --- 2. STATE MANAGEMENT & SETUP ---
    let currentIndex = 0;
    const track = document.getElementById('app-track');
    const viewport = document.getElementById('app-viewport'); 
    const navContainer = document.getElementById('action-bar-container') || document.getElementById('spa-nav');

    track.innerHTML = views.map(v => `
        <section class="w-screen h-full flex-shrink-0 overflow-y-auto overflow-x-hidden pb-6 custom-scrollbar">
            ${v.html}
        </section>
    `).join('');

    function renderNav() {
        if (!navContainer) return;
        
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
                        <div class="w-8 h-8 rounded-full overflow-hidden border-2 transition-colors ${currentIndex === 4 ? 'border-primary' : 'border-transparent'}">
                            <img src="https://ui-avatars.com/api/?name=Jon+Marco&background=20262f&color=ff8f6f" class="w-full h-full object-cover">
                        </div>
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
        renderNav(); 
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
