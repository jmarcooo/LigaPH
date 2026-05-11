document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. DEFINE THE 5 CORE VIEWS (Exact Matches to Live HTML) ---
    const views = [
        {
            id: 'home', icon: 'home',
            html: `
                <div class="pt-24 px-4 md:px-6 pb-24 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div class="col-span-1 lg:col-span-8 space-y-6">
                        <div id="dynamic-slider-container" class="relative w-full rounded-2xl md:rounded-3xl overflow-hidden bg-surface-container-high border border-outline-variant/20 shadow-lg group h-[600px] md:h-[700px]">
                            <div id="slider-loader" class="absolute inset-0 z-50 bg-surface-container-high p-6 md:p-10 flex flex-col justify-end animate-pulse">
                                <div class="w-24 h-6 bg-surface-container-highest rounded-full mb-3 shadow-inner"></div>
                                <div class="w-3/4 max-w-lg h-10 md:h-14 bg-surface-container-highest rounded-xl mb-3 shadow-inner"></div>
                                <div class="w-1/2 max-w-md h-4 md:h-5 bg-surface-container-highest rounded-lg mb-6 shadow-inner"></div>
                                <div class="w-32 h-10 bg-surface-container-highest rounded-xl mt-4 shadow-inner"></div>
                            </div>
                            <div id="slider-track" class="flex w-full h-full overflow-x-auto snap-x snap-mandatory hide-scrollbar smooth-scroll relative z-10 opacity-0 transition-opacity duration-500"></div>
                        </div>

                        <div>
                            <div class="flex items-center gap-3 mb-6 px-2 mt-8">
                                <span class="material-symbols-outlined text-primary text-[28px]">verified</span>
                                <h2 class="font-headline text-2xl font-black italic uppercase tracking-tighter text-on-surface">LigaPH Official News</h2>
                            </div>
                            <div id="official-news-container" class="space-y-4">
                                <div class="animate-pulse space-y-4">
                                    <div class="bg-surface-container-low rounded-2xl p-5 md:p-6 border border-outline-variant/5">
                                        <div class="flex justify-between items-start mb-4">
                                            <div class="flex items-center gap-3">
                                                <div class="w-10 h-10 rounded-xl bg-surface-container-highest"></div>
                                                <div class="space-y-2">
                                                    <div class="h-3 w-24 bg-surface-container-highest rounded"></div>
                                                    <div class="h-2 w-16 bg-surface-container-highest rounded"></div>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="h-6 w-3/4 bg-surface-container-highest rounded mb-3"></div>
                                        <div class="aspect-square w-full bg-surface-container-highest rounded-xl mb-4"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="hidden lg:flex flex-col lg:col-span-4 space-y-6">
                        <div class="bg-surface-container-low p-6 rounded-2xl border border-outline-variant/10 shadow-sm">
                            <h3 class="font-headline font-black italic text-lg uppercase mb-4 text-on-surface">Resource Center</h3>
                            <div class="space-y-2">
                                <div class="flex items-center justify-between p-3 bg-surface-container-highest rounded-xl border border-outline-variant/10">
                                    <div class="flex items-center gap-3">
                                        <span class="material-symbols-outlined text-outline-variant">gavel</span>
                                        <span class="font-bold text-sm text-on-surface">Rules & Regulations</span>
                                    </div>
                                    <span class="material-symbols-outlined text-sm text-outline-variant">chevron_right</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `
        },
        {
            id: 'feeds', icon: 'forum',
            html: `
                <div class="pt-24 px-4 md:px-6 pb-24 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div class="col-span-1 lg:col-span-8 space-y-6">
                        <div class="bg-surface-container-low rounded-3xl p-5 md:p-6 border border-outline-variant/10 shadow-md">
                            <form id="create-post-form" class="space-y-4">
                                <div class="flex gap-4 items-start">
                                    <img src="https://ui-avatars.com/api/?name=User&background=20262f&color=ff8f6f" class="w-12 h-12 rounded-full object-cover border-2 border-outline-variant/30 shrink-0 bg-surface-container">
                                    <div class="flex-1 space-y-3 pt-2">
                                        <textarea rows="3" placeholder="What's happening on the court?" class="w-full bg-transparent border-none text-on-surface focus:ring-0 resize-none placeholder:text-outline-variant/50 text-lg md:text-xl px-0 py-0"></textarea>
                                    </div>
                                </div>
                                <div class="flex items-center justify-between pt-4 border-t border-outline-variant/10 gap-3">
                                    <div class="flex gap-2">
                                        <div class="text-primary hover:bg-primary/10 p-2.5 rounded-full flex items-center justify-center border border-transparent"><span class="material-symbols-outlined text-[20px]">image</span></div>
                                        <div class="text-secondary hover:bg-secondary/10 p-2.5 rounded-full flex items-center justify-center border border-transparent"><span class="material-symbols-outlined text-[20px]">location_on</span></div>
                                    </div>
                                    <button type="button" class="w-full sm:w-auto bg-primary text-on-primary-container px-8 py-3 rounded-full font-black uppercase text-xs tracking-widest opacity-50 shadow-md">Post</button>
                                </div>
                            </form>
                        </div>

                        <div id="feed-container" class="space-y-6">
                            <div class="animate-pulse space-y-6">
                                <div class="bg-surface-container-low rounded-3xl p-6 border border-outline-variant/5">
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
                        </div>
                    </div>
                </div>
            `
        },
        {
            id: 'listings', icon: 'sports_basketball',
            html: `
                <div class="pt-24 px-4 md:px-6 pb-24 max-w-7xl mx-auto w-full">
                    <div class="relative w-full rounded-[32px] bg-[#14171d] border border-outline-variant/10 overflow-hidden mb-8 shadow-lg">
                        <div class="px-6 py-8 md:p-10 text-center relative z-10">
                            <h1 class="font-headline text-4xl md:text-5xl font-black italic uppercase tracking-tighter text-white leading-none mb-3">Games & Leagues</h1>
                            <p class="text-xs md:text-sm text-outline-variant font-bold tracking-widest uppercase flex items-center justify-center gap-1.5"><span class="material-symbols-outlined text-[16px] text-primary">location_on</span> Find Action Near You</p>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div class="bg-surface-container-low rounded-3xl p-6 border border-outline-variant/10 shadow-sm animate-pulse h-40"></div>
                        <div class="bg-surface-container-low rounded-3xl p-6 border border-outline-variant/10 shadow-sm animate-pulse h-40"></div>
                        <div class="bg-surface-container-low rounded-3xl p-6 border border-outline-variant/10 shadow-sm animate-pulse h-40"></div>
                        <div class="bg-surface-container-low rounded-3xl p-6 border border-outline-variant/10 shadow-sm animate-pulse h-40"></div>
                    </div>
                </div>
            `
        },
        {
            id: 'roster', icon: 'groups',
            html: `
                <div class="pt-24 px-4 md:px-6 pb-24 max-w-7xl mx-auto w-full">
                    <div class="relative w-full rounded-[32px] bg-[#14171d] border border-outline-variant/10 overflow-hidden mb-8 shadow-lg">
                        <div class="px-6 py-8 md:p-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
                            <div>
                                <h1 class="font-headline text-4xl md:text-5xl font-black italic uppercase tracking-tighter text-white leading-none mb-3">The Roster</h1>
                                <p class="text-xs md:text-sm text-outline-variant font-bold tracking-widest uppercase flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px] text-primary">emoji_events</span> Discover Top Squads</p>
                            </div>
                            <div class="flex bg-[#0a0e14]/50 backdrop-blur-md p-1.5 rounded-2xl w-full sm:w-72 border border-white/5 shadow-inner">
                                <button class="flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl bg-primary text-[#0a0e14] shadow-md">Squads</button>
                                <button class="flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl text-outline-variant">Players</button>
                            </div>
                        </div>
                    </div>

                    <div class="mb-12">
                        <h2 class="font-headline text-sm font-black text-outline uppercase tracking-[0.2em] mb-4 pl-2">My Affiliation</h2>
                        <div class="bg-surface-container-low rounded-3xl p-6 border border-outline-variant/10 shadow-sm animate-pulse h-[120px]"></div>
                    </div>

                    <div>
                        <h2 class="font-headline text-sm font-black text-outline uppercase tracking-[0.2em] mb-6 pl-2">All Squads</h2>
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4 pb-12">
                            <div class="bg-surface-container-low rounded-[20px] border border-outline-variant/10 shadow-sm animate-pulse h-20"></div>
                            <div class="bg-surface-container-low rounded-[20px] border border-outline-variant/10 shadow-sm animate-pulse h-20"></div>
                            <div class="bg-surface-container-low rounded-[20px] border border-outline-variant/10 shadow-sm animate-pulse h-20"></div>
                        </div>
                    </div>
                </div>
            `
        },
        {
            id: 'profile', icon: 'account_circle',
            html: `
                <div class="pt-24 px-4 pb-24 max-w-4xl mx-auto w-full">
                    <div class="relative mb-12">
                        <div class="h-40 md:h-56 w-full rounded-3xl bg-surface-container-highest overflow-hidden relative shadow-lg">
                            <div class="absolute inset-0 bg-gradient-to-t from-[#0a0e14] via-transparent to-transparent z-10 opacity-90"></div>
                        </div>

                        <div class="relative z-20 -mt-16 md:-mt-20 px-4 flex flex-col items-center text-center">
                            <div id="profile-avatar-container" class="relative w-32 h-32 md:w-40 md:h-40 rounded-full bg-[#0a0e14] shrink-0 flex items-center justify-center p-1 border-4 border-[#0a0e14] shadow-2xl animate-pulse mb-3">
                                <div class="absolute bottom-1 right-1 bg-primary text-black w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center border-4 border-[#0a0e14] shadow-md">
                                    <span class="material-symbols-outlined text-[16px] md:text-[20px]">sports_basketball</span>
                                </div>
                            </div>
                            
                            <h1 id="profile-name" class="font-headline text-4xl md:text-5xl font-black italic tracking-tighter uppercase text-primary leading-[0.9] mb-3 animate-pulse bg-surface-container-highest rounded-md min-h-[3rem] min-w-[200px] inline-block"></h1>
                            
                            <div class="flex flex-wrap gap-2 justify-center items-center mb-4">
                                <span class="bg-primary/10 text-primary border border-primary/20 px-3 md:px-4 py-1.5 rounded-full text-[10px] md:text-xs font-black uppercase tracking-widest min-h-[24px]">PG</span>
                                <span class="bg-surface-container-highest border border-outline-variant/30 text-on-surface px-3 md:px-4 py-1.5 rounded-full text-[10px] md:text-xs font-black uppercase tracking-widest min-h-[24px]">Intermediate</span>
                            </div>

                            <p class="text-sm font-bold text-on-surface-variant flex items-center justify-center gap-1 mb-4">
                                <span class="material-symbols-outlined text-[18px]">location_on</span>
                                <span class="animate-pulse min-w-[120px] min-h-[20px] inline-block bg-surface-container-highest rounded-md"></span>
                            </p>
                            
                            <div class="flex flex-row justify-center gap-1.5 w-full md:w-auto px-2 md:px-0">
                                <button class="flex-1 md:flex-none bg-primary hover:brightness-110 text-black px-2 md:px-8 py-3 rounded-xl md:rounded-full font-headline font-black uppercase tracking-widest shadow-[0_0_20px_rgba(255,143,111,0.25)] text-[10px] md:text-sm items-center justify-center gap-1.5 flex">
                                    <span class="material-symbols-outlined text-[16px] md:text-[18px]">edit</span> Edit
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="grid grid-cols-4 gap-2 md:gap-4 mb-6 md:mb-10 px-1 md:px-0">
                        <div class="bg-surface-container-low border border-outline-variant/10 rounded-2xl md:rounded-3xl p-2 md:p-5 text-center flex flex-col justify-center items-center shadow-sm">
                            <span class="material-symbols-outlined text-[18px] md:text-[24px] text-outline-variant mb-1 md:mb-2 opacity-70">sports_basketball</span>
                            <p id="stat-games-played" class="font-headline font-black text-xl md:text-3xl text-on-surface mb-0.5 md:mb-1 leading-none">0</p>
                            <p class="text-[8px] md:text-[9px] font-bold uppercase tracking-widest text-outline">Games</p>
                        </div>
                        <div class="bg-surface-container-low border border-outline-variant/10 rounded-2xl md:rounded-3xl p-2 md:p-5 text-center flex flex-col justify-center items-center shadow-sm">
                            <span class="material-symbols-outlined text-[18px] md:text-[24px] text-primary mb-1 md:mb-2 opacity-90">verified</span>
                            <p id="stat-reliability" class="font-headline font-black text-xl md:text-3xl text-primary mb-0.5 md:mb-1 leading-none">0%</p>
                            <p class="text-[8px] md:text-[9px] font-bold uppercase tracking-widest text-outline">Reliable</p>
                        </div>
                        <div class="bg-surface-container-low border border-outline-variant/10 rounded-2xl md:rounded-3xl p-2 md:p-5 text-center flex flex-col justify-center items-center shadow-sm">
                            <span class="material-symbols-outlined text-[18px] md:text-[24px] text-secondary mb-1 md:mb-2 opacity-90">handshake</span>
                            <p id="stat-connections" class="font-headline font-black text-xl md:text-3xl text-on-surface mb-0.5 md:mb-1 leading-none">0</p>
                            <p class="text-[8px] md:text-[9px] font-bold uppercase tracking-widest text-outline">Conn</p>
                        </div>
                        <div class="bg-surface-container-low border border-outline-variant/10 rounded-2xl md:rounded-3xl p-2 md:p-5 text-center flex flex-col justify-center items-center shadow-sm">
                            <span class="material-symbols-outlined text-[18px] md:text-[24px] text-tertiary mb-1 md:mb-2 opacity-90">military_tech</span>
                            <p id="stat-commendations" class="font-headline font-black text-xl md:text-3xl text-on-surface mb-0.5 md:mb-1 leading-none">0</p>
                            <p class="text-[8px] md:text-[9px] font-bold uppercase tracking-widest text-outline">Commends</p>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-2 md:gap-6 mb-10 px-1 md:px-0 items-start">
                        <div class="bg-surface-container-low rounded-2xl md:rounded-3xl p-3 md:p-6 border border-outline-variant/10 shadow-sm flex flex-col items-center justify-center text-center pb-4">
                            <h3 class="font-headline text-[11px] md:text-lg font-black uppercase tracking-widest text-secondary flex items-center gap-2 mb-2"><span class="material-symbols-outlined text-[18px] md:text-[20px]">psychology</span> Skill</h3>
                            <span class="text-3xl md:text-5xl font-black text-secondary italic leading-none">0.0</span>
                            <span class="text-[9px] md:text-[11px] font-black uppercase tracking-widest text-secondary mt-1">Unrated</span>
                        </div>
                        <div class="bg-surface-container-low rounded-2xl md:rounded-3xl p-3 md:p-6 border border-outline-variant/10 shadow-sm flex flex-col items-center justify-center text-center pb-4">
                            <h3 class="font-headline text-[11px] md:text-lg font-black uppercase tracking-widest text-primary flex items-center gap-2 mb-2"><span class="material-symbols-outlined text-[18px] md:text-[20px]">star</span> Rating</h3>
                            <span class="text-3xl md:text-5xl font-black text-primary italic leading-none">0.0</span>
                            <div class="flex text-primary mt-1 gap-0.5">
                                <span class="material-symbols-outlined text-[10px] md:text-[14px]">star_outline</span>
                                <span class="material-symbols-outlined text-[10px] md:text-[14px]">star_outline</span>
                                <span class="material-symbols-outlined text-[10px] md:text-[14px]">star_outline</span>
                                <span class="material-symbols-outlined text-[10px] md:text-[14px]">star_outline</span>
                                <span class="material-symbols-outlined text-[10px] md:text-[14px]">star_outline</span>
                            </div>
                        </div>
                    </div>

                    <div class="border-b border-outline-variant/10 mb-6">
                        <div class="flex gap-8 px-2 md:px-0">
                            <button class="pb-4 font-headline font-black text-sm uppercase tracking-widest border-b-2 border-primary text-primary transition-colors">Upcoming</button>
                            <button class="pb-4 font-headline font-black text-sm uppercase tracking-widest border-b-2 border-transparent text-on-surface-variant">Posts</button>
                        </div>
                    </div>
                    <div class="flex flex-col items-center justify-center py-12 opacity-50">
                        <span class="material-symbols-outlined animate-spin text-4xl text-primary mb-2">refresh</span>
                        <p class="text-xs font-bold uppercase tracking-widest text-outline">Loading Schedule</p>
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
        <section class="w-screen h-full flex-shrink-0 overflow-y-auto overflow-x-hidden custom-scrollbar">
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
