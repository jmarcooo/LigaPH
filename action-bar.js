import { auth, db } from './firebase-setup.js';
import { collection, getDocs, doc, getDoc, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

document.addEventListener('DOMContentLoaded', () => {
    
    // ==========================================
    // 1. MOBILE ACTION BAR INJECTION
    // ==========================================
    const container = document.getElementById('action-bar-container');
    if (container) {
        const path = window.location.pathname;
        const isHome = path.includes('home.html') || path === '/' || path.endsWith('/');
        const isFeeds = path.includes('feeds.html');
        const isGames = path.includes('listings.html') || path.includes('game-details.html');
        const isRoster = path.includes('roster.html') || path.includes('squad-details.html');

        container.innerHTML = `
            <div class="fixed bottom-0 w-full bg-[#0a0e14]/95 backdrop-blur-md border-t border-outline-variant/10 z-40 pb-safe md:hidden shadow-[0_-5px_20px_rgba(0,0,0,0.5)]">
                <div class="flex justify-around items-center h-16 px-2">
                    <a href="home.html" class="flex flex-col items-center gap-1 p-2 ${isHome ? 'text-primary' : 'text-outline-variant hover:text-on-surface'} transition-colors">
                        <span class="material-symbols-outlined text-[24px]" style="${isHome ? "font-variation-settings: 'FILL' 1" : ""}">home</span>
                    </a>
                    
                    <a href="feeds.html" class="flex flex-col items-center gap-1 p-2 ${isFeeds ? 'text-primary' : 'text-outline-variant hover:text-on-surface'} transition-colors">
                        <span class="material-symbols-outlined text-[24px]" style="${isFeeds ? "font-variation-settings: 'FILL' 1" : ""}">forum</span>
                    </a>
                    
                    <button id="mobile-search-trigger" class="flex flex-col items-center gap-1 p-3 -mt-5 bg-surface-container rounded-full border border-outline-variant/20 text-on-surface hover:text-primary hover:border-primary/50 transition-all shadow-lg active:scale-95">
                        <span class="material-symbols-outlined text-[26px]">search</span>
                    </button>
                    
                    <a href="listings.html" class="flex flex-col items-center gap-1 p-2 ${isGames ? 'text-primary' : 'text-outline-variant hover:text-on-surface'} transition-colors">
                        <span class="material-symbols-outlined text-[24px]" style="${isGames ? "font-variation-settings: 'FILL' 1" : ""}">sports_basketball</span>
                    </a>
                    
                    <a href="roster.html" class="flex flex-col items-center gap-1 p-2 ${isRoster ? 'text-primary' : 'text-outline-variant hover:text-on-surface'} transition-colors">
                        <span class="material-symbols-outlined text-[24px]" style="${isRoster ? "font-variation-settings: 'FILL' 1" : ""}">groups</span>
                    </a>
                </div>
            </div>
        `;
    }

    // ==========================================
    // 2. GLOBAL SEARCH MODAL INJECTION
    // ==========================================
    const searchModalHtml = `
        <div id="global-search-overlay" class="fixed inset-0 bg-[#0a0e14]/95 backdrop-blur-xl z-[100] hidden flex-col opacity-0 transition-opacity duration-200">
            <div class="p-4 md:p-6 border-b border-outline-variant/10 flex gap-3 items-center bg-[#0a0e14]">
                <span class="material-symbols-outlined text-primary text-[28px]">search</span>
                <input type="text" id="global-search-input" class="flex-1 bg-transparent border-none text-on-surface text-lg md:text-2xl font-black italic tracking-tighter focus:ring-0 placeholder:text-outline-variant/50 placeholder:font-medium" placeholder="Find players, squads, or games..." autocomplete="off">
                <div class="hidden md:flex items-center gap-1 mr-2 px-2 py-1 bg-surface-container rounded border border-outline-variant/20">
                    <span class="text-[10px] font-bold text-outline uppercase tracking-widest">ESC to close</span>
                </div>
                <button id="close-search-btn" class="text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors p-2 bg-surface-container rounded-full active:scale-95">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            <div class="px-4 md:px-6 py-4 flex gap-2 overflow-x-auto hide-scrollbar bg-gradient-to-b from-[#0a0e14] to-transparent shrink-0">
                <button class="search-filter-btn active bg-primary text-on-primary-container px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest shadow-md transition-all active:scale-95" data-filter="all">All Results</button>
                <button class="search-filter-btn bg-surface-container text-outline hover:text-on-surface px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border border-outline-variant/20 hover:border-outline-variant/50 transition-all active:scale-95" data-filter="players">Players</button>
                <button class="search-filter-btn bg-surface-container text-outline hover:text-on-surface px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border border-outline-variant/20 hover:border-outline-variant/50 transition-all active:scale-95" data-filter="squads">Squads</button>
                <button class="search-filter-btn bg-surface-container text-outline hover:text-on-surface px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border border-outline-variant/20 hover:border-outline-variant/50 transition-all active:scale-95" data-filter="games">Games</button>
            </div>
            <div id="global-search-results" class="flex-1 overflow-y-auto p-4 md:p-6 space-y-2 max-w-4xl mx-auto w-full pb-20">
                <div class="flex flex-col items-center justify-center py-20 opacity-50">
                    <span class="material-symbols-outlined text-5xl mb-4 text-outline-variant drop-shadow-md">manage_search</span>
                    <p class="text-sm font-bold uppercase tracking-widest text-outline">Ready to Search</p>
                    <p class="text-[10px] text-on-surface-variant mt-2 text-center max-w-xs">Type a name, location, or abbreviation to instantly scan the database.</p>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', searchModalHtml);

    // ==========================================
    // 3. SEARCH LOGIC & SMART CACHE ENGINE
    // ==========================================
    const overlay = document.getElementById('global-search-overlay');
    const input = document.getElementById('global-search-input');
    const resultsContainer = document.getElementById('global-search-results');
    const filterBtns = document.querySelectorAll('.search-filter-btn');
    const mobileBtn = document.getElementById('mobile-search-trigger');
    const desktopBtn = document.getElementById('desktop-search-btn'); 

    let searchData = { players: [], squads: [], games: [] };
    let isDataLoaded = false;
    let isFetching = false;
    let currentFilter = 'all';
    
    const CACHE_KEY = 'ligaPhSearchCache';
    const CACHE_EXPIRY_MS = 60 * 60 * 1000; 

    function escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function getFallbackAvatar(name) { return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'P')}&background=20262f&color=ff8f6f`; }
    function getFallbackLogo(name) { return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'S')}&background=20262f&color=ff8f6f`; }

    async function loadSearchDatabase() {
        if (isDataLoaded || isFetching) return;
        isFetching = true;
        
        resultsContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 opacity-80">
                <span class="material-symbols-outlined animate-spin text-4xl text-primary mb-3">sync</span>
                <p class="text-[10px] font-black uppercase tracking-widest text-primary animate-pulse">Accessing Database...</p>
            </div>
        `;

        try {
            const cachedDataRaw = localStorage.getItem(CACHE_KEY);
            if (cachedDataRaw) {
                const cachedParsed = JSON.parse(cachedDataRaw);
                const isCacheValid = (Date.now() - cachedParsed.timestamp) < CACHE_EXPIRY_MS;
                
                if (isCacheValid && cachedParsed.data) {
                    searchData = cachedParsed.data;
                    isDataLoaded = true;
                    isFetching = false;
                    resultsContainer.innerHTML = '';
                    if (input.value.trim().length > 0) executeSearch();
                    return;
                }
            }

            const [usersSnap, squadsSnap, gamesSnap] = await Promise.all([
                getDocs(collection(db, 'users')),
                getDocs(collection(db, 'squads')),
                getDocs(collection(db, 'games'))
            ]);

            searchData.players = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            searchData.squads = squadsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            searchData.games = gamesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            
            localStorage.setItem(CACHE_KEY, JSON.stringify({
                timestamp: Date.now(),
                data: searchData
            }));
            
            isDataLoaded = true;
            resultsContainer.innerHTML = '';
            if (input.value.trim().length > 0) executeSearch();
            
        } catch (e) {
            console.error("Search sync failed", e);
            resultsContainer.innerHTML = '<p class="text-center text-error text-sm py-10 font-bold">Failed to connect to search engine.</p>';
        } finally {
            isFetching = false;
        }
    }

    function executeSearch() {
        if (!isDataLoaded) return;
        const term = input.value.toLowerCase().trim();
        
        if (term.length === 0) {
            resultsContainer.innerHTML = '';
            return;
        }

        let resultsHtml = '';
        let matchCount = 0;

        if (currentFilter === 'all' || currentFilter === 'players') {
            const matchedPlayers = searchData.players.filter(p => 
                (p.displayName || '').toLowerCase().includes(term) || 
                (p.squadAbbr || '').toLowerCase().includes(term)
            ).slice(0, 10); 

            if (matchedPlayers.length > 0) {
                if (currentFilter === 'all') resultsHtml += `<h3 class="text-[10px] font-black uppercase tracking-widest text-primary mb-2 mt-4 flex items-center gap-2"><span class="material-symbols-outlined text-[14px]">person</span> Players</h3>`;
                
                matchedPlayers.forEach(p => {
                    const safeName = escapeHTML(p.displayName);
                    const photo = p.photoURL ? escapeHTML(p.photoURL) : getFallbackAvatar(safeName);
                    const squadTag = p.squadAbbr ? `<span class="bg-surface-container text-outline px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border border-outline-variant/30">[${escapeHTML(p.squadAbbr)}]</span>` : '';
                    
                    resultsHtml += `
                        <div onclick="window.location.href='profile.html?id=${p.id}'" class="flex items-center gap-4 p-3 bg-surface-container-highest hover:bg-surface-bright rounded-xl border border-outline-variant/10 cursor-pointer transition-colors group mb-2">
                            <img src="${photo}" class="w-10 h-10 rounded-full object-cover border border-outline-variant/30 bg-surface-container shrink-0">
                            <div class="flex-1 min-w-0">
                                <p class="font-bold text-sm text-on-surface truncate group-hover:text-primary transition-colors">${safeName} ${squadTag}</p>
                                <p class="text-[10px] text-outline-variant uppercase font-bold tracking-widest mt-0.5">${escapeHTML(p.primaryPosition || 'Player')} • ${escapeHTML(p.location || 'Unknown')}</p>
                            </div>
                            <span class="material-symbols-outlined text-outline-variant group-hover:text-primary shrink-0">chevron_right</span>
                        </div>
                    `;
                    matchCount++;
                });
            }
        }

        if (currentFilter === 'all' || currentFilter === 'squads') {
            const matchedSquads = searchData.squads.filter(s => 
                (s.name || '').toLowerCase().includes(term) || 
                (s.abbreviation || '').toLowerCase().includes(term)
            ).slice(0, 10);

            if (matchedSquads.length > 0) {
                if (currentFilter === 'all') resultsHtml += `<h3 class="text-[10px] font-black uppercase tracking-widest text-secondary mb-2 mt-6 flex items-center gap-2"><span class="material-symbols-outlined text-[14px]">shield</span> Squads</h3>`;
                
                matchedSquads.forEach(s => {
                    const safeName = escapeHTML(s.name);
                    const safeAbbr = escapeHTML(s.abbreviation);
                    const logo = s.logoUrl ? escapeHTML(s.logoUrl) : getFallbackLogo(safeName);
                    
                    resultsHtml += `
                        <div onclick="window.location.href='squad-details.html?id=${s.id}'" class="flex items-center gap-4 p-3 bg-surface-container-highest hover:bg-surface-bright rounded-xl border border-outline-variant/10 cursor-pointer transition-colors group mb-2">
                            <img src="${logo}" class="w-12 h-12 rounded-xl object-cover border border-outline-variant/30 bg-surface-container shrink-0">
                            <div class="flex-1 min-w-0">
                                <p class="font-headline font-black italic text-sm text-on-surface truncate group-hover:text-secondary transition-colors"><span class="text-outline-variant">[${safeAbbr}]</span> ${safeName}</p>
                                <p class="text-[10px] text-outline-variant uppercase font-bold tracking-widest mt-0.5">W-L: <span class="text-on-surface">${s.wins || 0}-${s.losses || 0}</span> • ${escapeHTML(s.homeCity || 'Anywhere')}</p>
                            </div>
                            <span class="material-symbols-outlined text-outline-variant group-hover:text-secondary shrink-0">chevron_right</span>
                        </div>
                    `;
                    matchCount++;
                });
            }
        }

        if (currentFilter === 'all' || currentFilter === 'games') {
            const matchedGames = searchData.games.filter(g => 
                (g.title || '').toLowerCase().includes(term) || 
                (g.location || '').toLowerCase().includes(term)
            ).slice(0, 10);

            if (matchedGames.length > 0) {
                if (currentFilter === 'all') resultsHtml += `<h3 class="text-[10px] font-black uppercase tracking-widest text-tertiary mb-2 mt-6 flex items-center gap-2"><span class="material-symbols-outlined text-[14px]">sports_basketball</span> Games</h3>`;
                
                matchedGames.forEach(g => {
                    resultsHtml += `
                        <div onclick="window.location.href='game-details.html?id=${g.id}'" class="flex flex-col p-4 bg-surface-container-highest hover:bg-surface-bright rounded-xl border border-outline-variant/10 cursor-pointer transition-colors group mb-2">
                            <h4 class="font-headline font-black italic uppercase text-sm text-on-surface truncate group-hover:text-tertiary transition-colors mb-2">${escapeHTML(g.title)}</h4>
                            <div class="flex items-center justify-between mt-auto">
                                <div class="flex items-center gap-1.5 text-[10px] text-outline-variant font-bold uppercase tracking-widest">
                                    <span class="material-symbols-outlined text-[13px]">calendar_today</span> ${escapeHTML(g.date)}
                                </div>
                                <div class="flex items-center gap-1.5 text-[10px] text-outline-variant font-bold uppercase tracking-widest max-w-[50%] truncate">
                                    <span class="material-symbols-outlined text-[13px]">location_on</span> ${escapeHTML(g.location)}
                                </div>
                            </div>
                        </div>
                    `;
                    matchCount++;
                });
            }
        }

        if (matchCount === 0) {
            resultsContainer.innerHTML = `
                <div class="flex flex-col items-center justify-center py-20 opacity-50">
                    <span class="material-symbols-outlined text-5xl mb-4 text-outline-variant drop-shadow-md">search_off</span>
                    <p class="text-sm font-bold uppercase tracking-widest text-outline">No matches found</p>
                    <p class="text-[10px] text-on-surface-variant mt-2 text-center">Try adjusting your search term.</p>
                </div>
            `;
        } else {
            resultsContainer.innerHTML = resultsHtml;
        }
    }

    function openSearch() {
        overlay.classList.remove('hidden');
        setTimeout(() => overlay.classList.remove('opacity-0'), 10);
        input.focus();
        if (!isDataLoaded) loadSearchDatabase();
    }

    function closeSearch() {
        overlay.classList.add('opacity-0');
        setTimeout(() => overlay.classList.add('hidden'), 200);
        input.value = '';
        resultsContainer.innerHTML = '';
    }

    if (mobileBtn) mobileBtn.addEventListener('click', openSearch);
    if (desktopBtn) desktopBtn.addEventListener('click', openSearch);
    
    document.getElementById('close-search-btn')?.addEventListener('click', closeSearch);
    input.addEventListener('input', executeSearch);

    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterBtns.forEach(b => {
                b.classList.remove('bg-primary', 'text-on-primary-container', 'active');
                b.classList.add('bg-surface-container', 'text-outline', 'border', 'border-outline-variant/20');
            });
            e.target.classList.add('bg-primary', 'text-on-primary-container', 'active');
            e.target.classList.remove('bg-surface-container', 'text-outline', 'border', 'border-outline-variant/20');
            currentFilter = e.target.dataset.filter;
            executeSearch();
        });
    });

    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            if (overlay.classList.contains('hidden')) openSearch();
            else closeSearch();
        }
        if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closeSearch();
    });

    // ==========================================
    // 4. HEADER PROFILE AVATAR SYNC & NOTIFICATIONS
    // ==========================================
    onAuthStateChanged(auth, async (user) => {
        const headerAvatar = document.getElementById('global-header-avatar');
        
        if (user) {
            // Profile Avatar Sync
            if (headerAvatar) {
                try {
                    const docSnap = await getDoc(doc(db, "users", user.uid));
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        headerAvatar.src = data.photoURL || getFallbackAvatar(data.displayName);
                    } else {
                        headerAvatar.src = user.photoURL || getFallbackAvatar(user.displayName);
                    }
                } catch(e) {}
            }

            // Real-Time Unread Notification Badge Sync
            const notifQ = query(
                collection(db, "notifications"),
                where("recipientId", "==", user.uid),
                where("read", "==", false)
            );

            onSnapshot(notifQ, (snapshot) => {
                // Find the red dot span inside the notifications link across any page
                const badges = document.querySelectorAll('a[href="notifications.html"] .bg-error');
                if (!snapshot.empty) {
                    badges.forEach(badge => badge.classList.remove('hidden'));
                } else {
                    badges.forEach(badge => badge.classList.add('hidden'));
                }
            });

        } else {
            // If logged out, make sure the red dot is hidden
            const badges = document.querySelectorAll('a[href="notifications.html"] .bg-error');
            badges.forEach(badge => badge.classList.add('hidden'));
        }
    });

});
