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
        const isNews = path.includes('news.html');
        const isGames = path.includes('listings.html') || path.includes('game-details.html');
        const isRoster = path.includes('roster.html') || path.includes('squad-details.html');
        const isProfile = path.includes('profile.html') || path.includes('edit-profile.html');

        container.innerHTML = `
            <div class="fixed bottom-0 w-full bg-white/95 dark:bg-[#0a0e14]/95 backdrop-blur-md border-t border-gray-200 dark:border-white/10 z-40 pb-safe md:hidden shadow-[0_-5px_20px_rgba(0,0,0,0.1)] dark:shadow-[0_-5px_20px_rgba(0,0,0,0.5)] transition-colors duration-300">
                <div class="flex justify-around items-center h-16 px-2">
                    <a href="home.html" class="flex flex-col items-center gap-1 p-2 ${isHome ? 'text-[#ff751f]' : 'text-gray-400 hover:text-gray-900 dark:text-gray-500 dark:hover:text-white'} transition-colors">
                        <span class="material-symbols-outlined text-[28px]" style="${isHome ? "font-variation-settings: 'FILL' 1" : ""}">home</span>
                    </a>
                    
                    <a href="news.html" class="flex flex-col items-center gap-1 p-2 ${isNews ? 'text-[#ff751f]' : 'text-gray-400 hover:text-gray-900 dark:text-gray-500 dark:hover:text-white'} transition-colors">
                        <span class="material-symbols-outlined text-[28px]" style="${isNews ? "font-variation-settings: 'FILL' 1" : ""}">newspaper</span>
                    </a>
                    
                    <a href="listings.html" class="flex flex-col items-center gap-1 p-3.5 -mt-6 rounded-full border transition-all shadow-lg active:scale-95 ${isGames ? 'bg-[#ff751f] text-[#0a0e14] border-[#ff751f]/50' : 'bg-white dark:bg-[#0a0e14] text-gray-900 dark:text-white border-gray-200 dark:border-white/10 hover:text-[#ff751f] hover:border-[#ff751f]/50 dark:hover:border-[#ff751f]/50 dark:hover:text-[#ff751f]'}">
                        <span class="material-symbols-outlined text-[32px]" style="${isGames ? "font-variation-settings: 'FILL' 1" : ""}">sports_basketball</span>
                    </a>
                    
                    <a href="roster.html" class="flex flex-col items-center gap-1 p-2 ${isRoster ? 'text-[#ff751f]' : 'text-gray-400 hover:text-gray-900 dark:text-gray-500 dark:hover:text-white'} transition-colors">
                        <span class="material-symbols-outlined text-[28px]" style="${isRoster ? "font-variation-settings: 'FILL' 1" : ""}">groups</span>
                    </a>
                    
                    <a href="profile.html" class="flex flex-col items-center justify-center p-2 transition-colors group">
                        <span id="actionbar-default-icon" class="material-symbols-outlined text-[28px] ${isProfile ? 'text-[#ff751f]' : 'text-gray-400 hover:text-gray-900 dark:text-gray-500 dark:hover:text-white'}" style="${isProfile ? "font-variation-settings: 'FILL' 1" : ""}">account_circle</span>
                        
                        <div id="actionbar-avatar-skeleton" class="hidden w-8 h-8 rounded-full bg-gray-200 dark:bg-white/10 animate-pulse border-2 ${isProfile ? 'border-[#ff751f]' : 'border-transparent'}"></div>
                        
                        <div id="actionbar-avatar-wrapper" class="hidden w-8 h-8 rounded-full overflow-hidden border-2 transition-colors ${isProfile ? 'border-[#ff751f]' : 'border-transparent group-hover:border-gray-300 dark:group-hover:border-white/30'}">
                            <img id="actionbar-avatar" src="" class="w-full h-full object-cover object-top" alt="Profile">
                        </div>
                    </a>
                </div>
            </div>
        `;
    }

    // ==========================================
    // 2. GLOBAL SEARCH MODAL INJECTION
    // ==========================================
    const searchModalHtml = `
        <div id="global-search-overlay" class="fixed inset-0 bg-white/95 dark:bg-[#0a0e14]/95 backdrop-blur-xl z-[100] hidden flex-col opacity-0 transition-opacity duration-200">
            <div class="p-4 md:p-6 border-b border-gray-200 dark:border-white/10 flex gap-3 items-center bg-white dark:bg-[#0a0e14] transition-colors duration-300">
                <span class="material-symbols-outlined text-[#ff751f] text-[28px]">search</span>
                <input type="text" id="global-search-input" class="flex-1 bg-transparent border-none text-gray-900 dark:text-white text-lg md:text-2xl font-black italic tracking-tighter focus:ring-0 placeholder:text-gray-400 dark:placeholder:text-gray-500 placeholder:font-medium" placeholder="Find players, squads, or games..." autocomplete="off">
                <div class="hidden md:flex items-center gap-1 mr-2 px-2 py-1 bg-gray-100 dark:bg-white/5 rounded border border-gray-200 dark:border-white/10">
                    <span class="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">ESC to close</span>
                </div>
                <button id="close-search-btn" class="text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors p-2 bg-gray-100 dark:bg-white/5 rounded-full active:scale-95">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            <div class="px-4 md:px-6 py-4 flex gap-2 overflow-x-auto hide-scrollbar bg-gradient-to-b from-white dark:from-[#0a0e14] to-transparent shrink-0 transition-colors duration-300">
                <button class="search-filter-btn active bg-[#ff751f] text-[#0a0e14] px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest shadow-md transition-all active:scale-95 border border-transparent" data-filter="all">All Results</button>
                <button class="search-filter-btn bg-gray-50 dark:bg-white/5 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/30 transition-all active:scale-95" data-filter="players">Players</button>
                <button class="search-filter-btn bg-gray-50 dark:bg-white/5 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/30 transition-all active:scale-95" data-filter="squads">Squads</button>
                <button class="search-filter-btn bg-gray-50 dark:bg-white/5 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/30 transition-all active:scale-95" data-filter="games">Games</button>
            </div>
            <div id="global-search-results" class="flex-1 overflow-y-auto p-4 md:p-6 space-y-2 max-w-4xl mx-auto w-full pb-20">
                <div class="flex flex-col items-center justify-center py-20 opacity-50">
                    <span class="material-symbols-outlined text-5xl mb-4 text-gray-400 dark:text-gray-500 drop-shadow-md">manage_search</span>
                    <p class="text-sm font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Ready to Search</p>
                    <p class="text-[10px] text-gray-400 dark:text-gray-500 mt-2 text-center max-w-xs">Type a name, location, or abbreviation to instantly scan the database.</p>
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
    const headerSearchBtn = document.getElementById('header-search-btn'); 

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

    function getFallbackAvatar(name) { return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'P')}&background=161618&color=ff751f`; }
    function getFallbackLogo(name) { return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'S')}&background=161618&color=ff751f`; }

    async function loadSearchDatabase() {
        if (isDataLoaded || isFetching) return;
        isFetching = true;
        
        resultsContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 opacity-80">
                <span class="material-symbols-outlined animate-spin text-4xl text-[#ff751f] mb-3">sync</span>
                <p class="text-[10px] font-black uppercase tracking-widest text-[#ff751f] animate-pulse">Accessing Database...</p>
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
            resultsContainer.innerHTML = '<p class="text-center text-red-500 text-sm py-10 font-bold">Failed to connect to search engine.</p>';
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
                if (currentFilter === 'all') resultsHtml += `<h3 class="text-[10px] font-black uppercase tracking-widest text-[#ff751f] mb-2 mt-4 flex items-center gap-2"><span class="material-symbols-outlined text-[14px]">person</span> Players</h3>`;
                
                matchedPlayers.forEach(p => {
                    const safeName = escapeHTML(p.displayName);
                    const photo = p.photoURL ? escapeHTML(p.photoURL) : getFallbackAvatar(safeName);
                    const squadTag = p.squadAbbr ? `<span class="bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border border-gray-200 dark:border-white/10">[${escapeHTML(p.squadAbbr)}]</span>` : '';
                    
                    resultsHtml += `
                        <div onclick="window.location.href='profile.html?id=${p.id}'" class="flex items-center gap-4 p-3 bg-white dark:bg-[#14171d] hover:bg-gray-50 dark:hover:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10 cursor-pointer transition-colors group mb-2">
                            <img src="${photo}" class="w-10 h-10 rounded-full object-cover object-top border border-gray-200 dark:border-white/20 bg-gray-100 dark:bg-[#0a0e14] shrink-0">
                            <div class="flex-1 min-w-0">
                                <p class="font-bold text-sm text-gray-900 dark:text-white truncate group-hover:text-[#ff751f] transition-colors">${safeName} ${squadTag}</p>
                                <p class="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold tracking-widest mt-0.5">${escapeHTML(p.primaryPosition || 'Player')} • ${escapeHTML(p.location || 'Unknown')}</p>
                            </div>
                            <span class="material-symbols-outlined text-gray-400 dark:text-gray-500 group-hover:text-[#ff751f] shrink-0">chevron_right</span>
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
                if (currentFilter === 'all') resultsHtml += `<h3 class="text-[10px] font-black uppercase tracking-widest text-blue-500 mb-2 mt-6 flex items-center gap-2"><span class="material-symbols-outlined text-[14px]">shield</span> Squads</h3>`;
                
                matchedSquads.forEach(s => {
                    const safeName = escapeHTML(s.name);
                    const safeAbbr = escapeHTML(s.abbreviation);
                    const logo = s.logoUrl ? escapeHTML(s.logoUrl) : getFallbackLogo(safeName);
                    
                    resultsHtml += `
                        <div onclick="window.location.href='squad-details.html?id=${s.id}'" class="flex items-center gap-4 p-3 bg-white dark:bg-[#14171d] hover:bg-gray-50 dark:hover:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10 cursor-pointer transition-colors group mb-2">
                            <img src="${logo}" class="w-12 h-12 rounded-xl object-cover border border-gray-200 dark:border-white/20 bg-gray-100 dark:bg-[#0a0e14] shrink-0">
                            <div class="flex-1 min-w-0">
                                <p class="font-headline font-black italic text-sm text-gray-900 dark:text-white truncate group-hover:text-blue-500 transition-colors"><span class="text-gray-500 dark:text-gray-400">[${safeAbbr}]</span> ${safeName}</p>
                                <p class="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold tracking-widest mt-0.5">W-L: <span class="text-gray-900 dark:text-white">${s.wins || 0}-${s.losses || 0}</span> • ${escapeHTML(s.homeCity || 'Anywhere')}</p>
                            </div>
                            <span class="material-symbols-outlined text-gray-400 dark:text-gray-500 group-hover:text-blue-500 shrink-0">chevron_right</span>
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
                if (currentFilter === 'all') resultsHtml += `<h3 class="text-[10px] font-black uppercase tracking-widest text-green-500 mb-2 mt-6 flex items-center gap-2"><span class="material-symbols-outlined text-[14px]">sports_basketball</span> Games</h3>`;
                
                matchedGames.forEach(g => {
                    resultsHtml += `
                        <div onclick="window.location.href='game-details.html?id=${g.id}'" class="flex flex-col p-4 bg-white dark:bg-[#14171d] hover:bg-gray-50 dark:hover:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10 cursor-pointer transition-colors group mb-2">
                            <h4 class="font-headline font-black italic uppercase text-sm text-gray-900 dark:text-white truncate group-hover:text-green-500 transition-colors mb-2">${escapeHTML(g.title)}</h4>
                            <div class="flex items-center justify-between mt-auto">
                                <div class="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest">
                                    <span class="material-symbols-outlined text-[13px]">calendar_today</span> ${escapeHTML(g.date)}
                                </div>
                                <div class="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest max-w-[50%] truncate">
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
                    <span class="material-symbols-outlined text-5xl mb-4 text-gray-400 dark:text-gray-500 drop-shadow-md">search_off</span>
                    <p class="text-sm font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">No matches found</p>
                    <p class="text-[10px] text-gray-400 dark:text-gray-500 mt-2 text-center">Try adjusting your search term.</p>
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

    if (headerSearchBtn) headerSearchBtn.addEventListener('click', openSearch);
    document.getElementById('close-search-btn')?.addEventListener('click', closeSearch);
    input.addEventListener('input', executeSearch);

    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterBtns.forEach(b => {
                b.classList.remove('bg-[#ff751f]', 'text-[#0a0e14]', 'active', 'border-transparent');
                b.classList.add('bg-gray-50', 'dark:bg-white/5', 'text-gray-500', 'dark:text-gray-400', 'border', 'border-gray-200', 'dark:border-white/10');
            });
            e.target.classList.add('bg-[#ff751f]', 'text-[#0a0e14]', 'active', 'border-transparent');
            e.target.classList.remove('bg-gray-50', 'dark:bg-white/5', 'text-gray-500', 'dark:text-gray-400', 'border-gray-200', 'dark:border-white/10');
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
    
    // Create a variable to hold the listener
    let unsubscribeNotifs = null;

    onAuthStateChanged(auth, async (user) => {
        const headerAvatar = document.getElementById('global-header-avatar');
        
        // Mobile Action Bar Elements
        const actionbarAvatar = document.getElementById('actionbar-avatar'); 
        const actionbarSkeleton = document.getElementById('actionbar-avatar-skeleton');
        const actionbarWrapper = document.getElementById('actionbar-avatar-wrapper');
        const actionbarDefaultIcon = document.getElementById('actionbar-default-icon');
        
        if (user) {
            // Profile Avatar Sync
            try {
                const docSnap = await getDoc(doc(db, "users", user.uid));
                let photoUrl = getFallbackAvatar(user.displayName);
                
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    photoUrl = data.photoURL || getFallbackAvatar(data.displayName);
                } else {
                    photoUrl = user.photoURL || getFallbackAvatar(user.displayName);
                }
                
                if (headerAvatar) headerAvatar.src = photoUrl;
                
                // Swap Action Bar Default SVG for Real Image
                if (actionbarAvatar) {
                    actionbarAvatar.src = photoUrl;
                    if (actionbarDefaultIcon && actionbarWrapper) {
                        actionbarDefaultIcon.classList.add('hidden');
                        if (actionbarSkeleton) actionbarSkeleton.classList.add('hidden');
                        actionbarWrapper.classList.remove('hidden');
                    }
                }
            } catch(e) {}

            // Real-Time Unread Notification Badge Sync
            const notifQ = query(
                collection(db, "notifications"),
                where("recipientId", "==", user.uid),
                where("read", "==", false)
            );

            // SAVE the listener to the variable
            unsubscribeNotifs = onSnapshot(notifQ, (snapshot) => {
                const badges = document.querySelectorAll('a[href="notifications.html"] .bg-red-500');
                if (!snapshot.empty) {
                    badges.forEach(badge => badge.classList.remove('hidden'));
                } else {
                    badges.forEach(badge => badge.classList.add('hidden'));
                }
            });

        } else {
            // 🚨 CLEANUP FIX: Destroy the ghost listener when user logs out!
            if (unsubscribeNotifs) {
                unsubscribeNotifs();
                unsubscribeNotifs = null;
            }

            // NOT LOGGED IN: Show Default SVG
            if (actionbarDefaultIcon && actionbarWrapper) {
                actionbarDefaultIcon.classList.remove('hidden');
                actionbarWrapper.classList.add('hidden');
                if (actionbarSkeleton) actionbarSkeleton.classList.add('hidden');
            }

            const badges = document.querySelectorAll('a[href="notifications.html"] .bg-red-500');
            badges.forEach(badge => badge.classList.add('hidden'));
        }
    });

});
