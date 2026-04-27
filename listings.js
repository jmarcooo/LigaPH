import { auth, db } from './firebase-setup.js';
import { serverTimestamp, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { fetchGames, postGame, uploadGameImage } from './games.js';

// --- Formatter Helpers ---
function formatTime12(timeStr) {
    if (!timeStr) return '';
    let [h, m] = timeStr.split(':');
    h = parseInt(h, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
}

function formatDateShort(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if(isNaN(d)) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getFallbackAvatar(name) { 
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'P')}&background=20262f&color=ff8f6f`; 
}

// --- Dynamic Host Cache ---
const userCache = {};
async function getHostDetails(hostId) {
    if (!hostId) return null;
    if (userCache[hostId]) return userCache[hostId];
    try {
        const userDoc = await getDoc(doc(db, "users", hostId));
        if (userDoc.exists()) {
            userCache[hostId] = userDoc.data();
            return userCache[hostId];
        }
    } catch (e) { console.error("Error fetching host details:", e); }
    return null;
}

document.addEventListener('DOMContentLoaded', () => {
    const gamesContainer = document.getElementById('games-container');
    const loadingIndicator = document.getElementById('loading-indicator');
    const counterEl = document.getElementById('results-counter');
    const loadMoreBtn = document.getElementById('load-more-btn');
    
    // Filters
    const searchInput = document.getElementById('search-game-input');
    const statusFilter = document.getElementById('filter-status');
    const dateFilter = document.getElementById('filter-date');
    const sortFilter = document.getElementById('filter-sort');
    const cityFilter = document.getElementById('filter-city');
    const skillFilter = document.getElementById('filter-skill');
    const typeFilter = document.getElementById('filter-type');
    
    const filterBtn = document.getElementById('toggle-filters-btn');
    const filterContainer = document.getElementById('expandable-filters');
    const resetBtn = document.getElementById('reset-filters-btn');
    
    const viewGridBtn = document.getElementById('view-grid-btn');
    const viewListBtn = document.getElementById('view-list-btn');
    
    let currentViewMode = localStorage.getItem('ligaPhGameView') || 'grid';
    let allGames = [];
    let filteredGamesArray = [];
    let currentUser = null;
    
    // Pagination State
    let currentPage = 1;
    const ITEMS_PER_PAGE = 12;

    onAuthStateChanged(auth, (user) => { 
        currentUser = user; 
        if (user) {
            loadGames();
        } else {
            renderUnauthListings();
        }
    });

    function renderUnauthListings() {
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        if (counterEl) counterEl.textContent = "LOGIN REQUIRED";
        if (loadMoreBtn) loadMoreBtn.classList.add('hidden');
        
        gamesContainer.className = "grid grid-cols-1";
        gamesContainer.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center py-20 opacity-90 mt-10">
                <span class="material-symbols-outlined text-6xl mb-4 text-outline-variant drop-shadow-md">lock</span>
                <h2 class="text-2xl font-black uppercase tracking-widest text-on-surface mb-2">Login Required</h2>
                <p class="text-sm text-on-surface-variant mb-6 text-center max-w-sm">You need to be logged in to view open games, join runs, and see court details.</p>
                <button onclick="window.location.href='index.html'" class="bg-primary hover:brightness-110 text-on-primary-container px-8 py-3 rounded-xl font-headline font-black uppercase text-sm tracking-widest shadow-lg active:scale-95 transition-all">Login or Sign Up</button>
            </div>
        `;

        [searchInput, statusFilter, dateFilter, sortFilter, cityFilter, skillFilter, typeFilter].forEach(el => {
            if (el) el.disabled = true;
        });
    }

    // --- UI TOGGLE LOGIC ---
    if (filterBtn) {
        filterBtn.addEventListener('click', () => {
            const isOpen = filterContainer.classList.contains('open');
            if (isOpen) {
                filterContainer.classList.remove('open');
                filterBtn.classList.remove('border-primary/50', 'text-primary');
                filterBtn.classList.add('border-outline-variant/20', 'text-on-surface');
            } else {
                filterContainer.classList.add('open');
                filterBtn.classList.remove('border-outline-variant/20', 'text-on-surface');
                filterBtn.classList.add('border-primary/50', 'text-primary');
            }
        });
    }

    function checkActiveFilters() {
        if (cityFilter.value || skillFilter.value || typeFilter.value || dateFilter.value || sortFilter.value !== 'date-desc' || statusFilter.value !== 'active') {
            resetBtn.classList.remove('hidden');
            resetBtn.classList.add('flex');
            const filterText = document.getElementById('filter-btn-text');
            if (filterText) filterText.textContent = "Filters Active";
        } else {
            resetBtn.classList.add('hidden');
            resetBtn.classList.remove('flex');
            const filterText = document.getElementById('filter-btn-text');
            if (filterText) filterText.textContent = "All Filters";
        }
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            statusFilter.value = 'active'; 
            dateFilter.value = '';
            cityFilter.value = '';
            skillFilter.value = '';
            typeFilter.value = '';
            sortFilter.value = 'date-desc';
            checkActiveFilters();
            currentPage = 1;
            renderGames();
        });
    }

    function updateViewButtons() {
        if (currentViewMode === 'grid') {
            viewGridBtn.className = "p-1.5 rounded-lg bg-primary text-on-primary-container transition-colors shadow-sm";
            viewListBtn.className = "p-1.5 rounded-lg text-outline-variant hover:text-on-surface transition-colors";
        } else {
            viewListBtn.className = "p-1.5 rounded-lg bg-primary text-on-primary-container transition-colors shadow-sm";
            viewGridBtn.className = "p-1.5 rounded-lg text-outline-variant hover:text-on-surface transition-colors";
        }
    }

    if (viewGridBtn) viewGridBtn.addEventListener('click', () => { currentViewMode = 'grid'; localStorage.setItem('ligaPhGameView', 'grid'); currentPage = 1; updateViewButtons(); renderGames(); });
    if (viewListBtn) viewListBtn.addEventListener('click', () => { currentViewMode = 'list'; localStorage.setItem('ligaPhGameView', 'list'); currentPage = 1; updateViewButtons(); renderGames(); });
    updateViewButtons();

    // --- DATA LOADING & RENDERING ---
    async function loadGames() {
        try {
            allGames = await fetchGames();
            if (loadingIndicator) loadingIndicator.style.display = 'none';
            currentPage = 1;
            renderGames();
        } catch (error) {
            console.error("Error loading games:", error);
            if (loadingIndicator) loadingIndicator.style.display = 'none';
            gamesContainer.innerHTML = '<div class="col-span-full text-center text-error py-10">Failed to load games.</div>';
        }
    }

    async function renderGames(isAppending = false) {
        if (!isAppending) {
            gamesContainer.innerHTML = ''; 
            
            const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
            const statusVal = statusFilter ? statusFilter.value : 'active';
            const sortVal = sortFilter ? sortFilter.value : 'date-desc';
            const dateVal = dateFilter ? dateFilter.value : '';
            const cityVal = cityFilter ? cityFilter.value : '';
            const skillVal = skillFilter ? skillFilter.value : '';
            const typeVal = typeFilter ? typeFilter.value : '';

            const now = new Date(); 

            filteredGamesArray = allGames.filter(game => {
                const matchesSearch = !searchTerm || 
                    (game.title || '').toLowerCase().includes(searchTerm) || 
                    (game.location || '').toLowerCase().includes(searchTerm) ||
                    (game.host || '').toLowerCase().includes(searchTerm);
                    
                const matchesCity = !cityVal || (game.location || '').includes(cityVal); 
                const matchesSkill = !skillVal || game.skillLevel === skillVal;
                const matchesType = !typeVal || game.type === typeVal;
                const matchesDate = !dateVal || game.date === dateVal;

                const gameEndString = `${game.date}T${game.endTime || game.time}`;
                const gameEndDate = new Date(gameEndString);
                const isConcluded = gameEndDate < now || game.status === 'concluded';
                
                let matchesStatus = true;
                if (statusVal === 'active') {
                    matchesStatus = !isConcluded;
                } else if (statusVal === 'concluded') {
                    matchesStatus = isConcluded;
                } 

                return matchesSearch && matchesCity && matchesSkill && matchesType && matchesDate && matchesStatus;
            });

            filteredGamesArray.sort((a, b) => {
                if (sortVal === 'date-desc' || sortVal === 'date-asc') {
                    const getTime = (g) => {
                        if (g.createdAt) {
                            if (typeof g.createdAt.toMillis === 'function') return g.createdAt.toMillis();
                            if (g.createdAt.seconds) return g.createdAt.seconds * 1000;
                        }
                        return new Date(`${g.date}T${g.time}`).getTime() || 0;
                    };
                    const timeA = getTime(a);
                    const timeB = getTime(b);
                    return sortVal === 'date-desc' ? timeB - timeA : timeA - timeB;
                }
                if (sortVal === 'slots-asc' || sortVal === 'slots-desc') {
                    const spotsA = parseInt(a.spotsTotal || 10) - (Array.isArray(a.players) ? a.players.length : 0);
                    const spotsB = parseInt(b.spotsTotal || 10) - (Array.isArray(b.players) ? b.players.length : 0);
                    return sortVal === 'slots-asc' ? spotsA - spotsB : spotsB - spotsA;
                }
                return 0;
            });

            if (counterEl) counterEl.textContent = `SHOWING ${filteredGamesArray.length} GAMES`;

            if (filteredGamesArray.length === 0) {
                gamesContainer.className = "grid grid-cols-1"; 
                gamesContainer.innerHTML = `
                    <div class="col-span-full flex flex-col items-center justify-center py-20 opacity-50">
                        <span class="material-symbols-outlined text-5xl mb-4 text-outline-variant drop-shadow-md">search_off</span>
                        <p class="text-sm font-bold uppercase tracking-widest text-outline">No games found</p>
                        <p class="text-[10px] text-on-surface-variant mt-2">Try adjusting your filters.</p>
                    </div>
                `;
                if(loadMoreBtn) loadMoreBtn.classList.add('hidden');
                return;
            }

            if (currentViewMode === 'grid') {
                gamesContainer.className = "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6";
            } else {
                gamesContainer.className = "flex flex-col gap-4 max-w-4xl";
            }
        }

        // Pagination specific logic
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        const gamesToShow = filteredGamesArray.slice(startIndex, endIndex);
        const now = new Date();

        for (const game of gamesToShow) {
            const spotsTotal = parseInt(game.spotsTotal) || 10;
            const players = Array.isArray(game.players) ? game.players : [];
            const spotsFilled = players.length;
            const isFull = spotsFilled >= spotsTotal;
            const spotsLeft = spotsTotal - spotsFilled;

            const gameEndString = `${game.date}T${game.endTime || game.time}`;
            const gameEndDate = new Date(gameEndString);
            const isConcluded = gameEndDate < now || game.status === 'concluded';

            // 1. URGENCY BADGE
            let statusHtml = '';
            if (isConcluded) {
                statusHtml = `<span class="bg-surface-container-highest text-outline-variant px-2.5 md:px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border border-outline-variant/20 shadow-sm">CONCLUDED</span>`;
            } else if (isFull) {
                statusHtml = `<span class="bg-[#14171d] text-outline px-2.5 md:px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border border-outline-variant/20 shadow-sm">FULL</span>`;
            } else {
                let spotsColor = 'bg-primary/20 text-primary border-primary/30'; 
                if (spotsLeft >= 5) spotsColor = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'; 
                if (spotsLeft === 1) spotsColor = 'bg-error/20 text-error border-error/30'; 
                
                let spotsText = spotsLeft === 1 ? '1 SPOT LEFT' : `${spotsLeft} SPOTS`;
                statusHtml = `<span class="${spotsColor} px-2.5 md:px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border shadow-sm whitespace-nowrap animate-pulse">${spotsText}</span>`;
            }

            // 2. DYNAMIC ACTION BUTTONS (MOBILE COMPATIBLE)
            let actionText = isConcluded ? 'View History' : (isFull ? 'View Details' : 'Join Game');
            let actionIcon = isConcluded ? 'history' : (isFull ? 'visibility' : 'sports_basketball');
            let shortText = actionText.split(' ')[0]; // "View" or "Join"
            
            let listActionBtn = '';
            if (isConcluded) {
                listActionBtn = `<button onclick="event.stopPropagation(); window.location.href='game-details.html?id=${game.id}'" class="flex w-full md:w-auto justify-center bg-surface-container-highest text-outline-variant hover:text-on-surface border border-outline-variant/20 px-3 md:px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors items-center gap-1.5 shadow-sm active:scale-95"><span class="material-symbols-outlined text-[14px]">${actionIcon}</span> <span class="hidden sm:inline">${actionText}</span><span class="sm:hidden">${shortText}</span></button>`;
            } else if (isFull) {
                listActionBtn = `<button onclick="event.stopPropagation(); window.location.href='game-details.html?id=${game.id}'" class="flex w-full md:w-auto justify-center bg-surface-container-highest text-on-surface hover:bg-surface-container-high border border-outline-variant/30 px-3 md:px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors items-center gap-1.5 shadow-sm active:scale-95"><span class="material-symbols-outlined text-[14px]">${actionIcon}</span> <span class="hidden sm:inline">${actionText}</span><span class="sm:hidden">${shortText}</span></button>`;
            } else {
                listActionBtn = `<button onclick="event.stopPropagation(); window.location.href='game-details.html?id=${game.id}'" class="flex w-full md:w-auto justify-center bg-primary hover:brightness-110 text-on-primary-container border border-primary/30 px-3 md:px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors items-center gap-1.5 shadow-[0_0_15px_rgba(255,143,111,0.2)] active:scale-95"><span class="material-symbols-outlined text-[14px]">${actionIcon}</span> <span class="hidden sm:inline">${actionText}</span><span class="sm:hidden">${shortText}</span></button>`;
            }

            const defaultImg = 'https://images.unsplash.com/photo-1546519638-68e109498ffc?q=80&w=600&auto=format&fit=crop';
            const imgUrl = game.imageUrl || defaultImg;

            let dynamicHostName = game.host || 'Unknown Player';
            let dynamicHostIcon = game.hostPhoto || getFallbackAvatar(dynamicHostName);
            let hostRating = "4.9"; 

            // Caching prevents spamming Firestore on every card load
            if (game.hostId) {
                const hostProfile = await getHostDetails(game.hostId);
                if (hostProfile) {
                    dynamicHostName = hostProfile.displayName || dynamicHostName;
                    dynamicHostIcon = hostProfile.photoURL || dynamicHostIcon;
                }
            }

            const card = document.createElement('div');
            card.onclick = () => window.location.href = `game-details.html?id=${game.id}`;

            const grayOutClasses = isConcluded ? "grayscale opacity-60 contrast-75 cursor-default" : "cursor-pointer hover:border-primary/40 hover:shadow-xl md:hover:-translate-y-1";

            if (currentViewMode === 'grid') {
                card.className = `bg-surface-container-low border border-outline-variant/10 rounded-[20px] md:rounded-[24px] overflow-hidden shadow-md transition-all duration-300 group flex flex-col ${grayOutClasses}`;
                card.innerHTML = `
                    <div class="h-40 md:h-48 relative overflow-hidden bg-surface-container-highest shrink-0">
                        <img src="${imgUrl}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700">
                        <div class="absolute inset-0 bg-gradient-to-t from-[#0a0e14] via-[#0a0e14]/40 to-transparent opacity-90"></div>
                        <div class="absolute top-3 md:top-4 right-3 md:right-4 flex gap-2">${statusHtml}</div>
                        <div class="absolute bottom-3 md:bottom-4 left-4 md:left-5 right-4 md:right-5">
                            <div class="flex items-center gap-2 mb-2">
                                <span class="text-[8px] md:text-[9px] font-black bg-surface-container-highest/80 backdrop-blur text-on-surface px-2 py-0.5 rounded uppercase tracking-widest border border-outline-variant/20">${game.type || '5v5'}</span>
                                <span class="text-[8px] md:text-[9px] font-black bg-surface-container-highest/80 backdrop-blur text-outline-variant px-2 py-0.5 rounded uppercase tracking-widest border border-outline-variant/20">${game.skillLevel || 'Open'}</span>
                            </div>
                        </div>
                    </div>
                    <div class="p-4 md:p-6 flex-1 flex flex-col">
                        <h3 class="font-headline text-lg md:text-xl font-black italic uppercase tracking-tighter text-on-surface leading-tight mb-3 md:mb-4 line-clamp-2 whitespace-normal group-hover:text-primary transition-colors">${game.title || 'Untitled Game'}</h3>
                        
                        <div class="flex items-center gap-2 md:gap-3 text-on-surface-variant text-xs font-medium mb-2.5 truncate">
                            <span class="material-symbols-outlined text-[14px] md:text-[16px] text-primary">location_on</span>
                            <span class="truncate">${game.location || 'Location TBD'}</span>
                        </div>
                        <div class="flex items-center gap-2 md:gap-3 text-on-surface-variant text-xs font-medium mb-5 md:mb-6">
                            <span class="material-symbols-outlined text-[14px] md:text-[16px] text-primary">schedule</span>
                            <span>${formatDateShort(game.date)} @ ${formatTime12(game.time)}</span>
                        </div>
                        
                        <div class="mt-auto pt-4 md:pt-5 border-t border-outline-variant/10 flex items-center justify-between">
                            <div class="flex items-center gap-2 md:gap-3 flex-1 min-w-0 pr-2">
                                <img src="${dynamicHostIcon}" class="w-7 h-7 md:w-9 md:h-9 rounded-full object-cover border border-outline-variant/30 shrink-0 bg-surface-container">
                                <div class="flex flex-col flex-1 min-w-0">
                                    <span class="text-[10px] md:text-[11px] text-on-surface font-bold uppercase tracking-widest truncate">${dynamicHostName}</span>
                                    <span class="text-[8px] md:text-[9px] text-primary flex items-center gap-0.5"><span class="material-symbols-outlined text-[10px]">star</span> ${hostRating}</span>
                                </div>
                            </div>
                            <div class="text-right flex flex-col items-end shrink-0">
                                <span class="text-[8px] md:text-[9px] text-outline-variant font-bold tracking-widest uppercase mb-1">${spotsFilled}/${spotsTotal} Joined</span>
                                <span class="text-primary text-[10px] font-black uppercase tracking-widest flex items-center gap-0.5 md:gap-1 group-hover:pr-1 transition-all"><span class="hidden sm:inline">${actionText}</span><span class="sm:hidden">${shortText}</span> <span class="material-symbols-outlined text-[12px] align-middle">arrow_forward</span></span>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                // LIST VIEW 
                card.className = `bg-surface-container-low border border-outline-variant/10 rounded-[16px] md:rounded-[20px] overflow-hidden shadow-sm transition-all duration-300 group flex items-center min-h-[130px] pr-3 md:pr-5 relative ${grayOutClasses}`;
                
                card.innerHTML = `
                    <div class="w-28 sm:w-36 h-full absolute md:relative inset-y-0 left-0 overflow-hidden bg-surface-container-highest shrink-0 md:mr-5">
                        <img src="${imgUrl}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700">
                        <div class="absolute inset-0 bg-gradient-to-r from-transparent to-[#0a0e14] md:to-transparent md:bg-[#0a0e14]/20 group-hover:bg-transparent transition-colors"></div>
                    </div>
                    
                    <div class="flex-1 min-w-0 flex flex-col justify-center py-3 md:py-4 pl-32 sm:pl-40 md:pl-0 z-10">
                        <div class="flex items-center gap-1.5 md:gap-2 mb-1.5">
                            <span class="text-[8px] md:text-[9px] font-black bg-surface-container text-on-surface px-1.5 md:px-2 py-0.5 rounded uppercase tracking-widest border border-outline-variant/20">${game.type || '5v5'}</span>
                            <span class="text-[8px] md:text-[9px] font-bold text-outline-variant uppercase tracking-widest truncate">${game.skillLevel || 'Open'}</span>
                        </div>
                        <h3 class="font-headline text-sm sm:text-base md:text-xl font-black italic uppercase tracking-tighter text-on-surface leading-tight mb-2 line-clamp-2 whitespace-normal group-hover:text-primary transition-colors">${game.title || 'Untitled Game'}</h3>
                        
                        <div class="flex flex-col gap-1.5 md:gap-2">
                            <p class="text-[9px] sm:text-[10px] md:text-[11px] text-on-surface-variant font-medium flex items-center gap-1 md:gap-1.5 truncate">
                                <span class="material-symbols-outlined text-[12px] md:text-[14px] text-outline">schedule</span> 
                                <span class="truncate">${formatDateShort(game.date)} @ ${formatTime12(game.time)} • ${game.location || 'TBD'}</span>
                            </p>
                            
                            <div class="flex items-center gap-1.5 md:gap-2 mt-0.5">
                                <img src="${dynamicHostIcon}" class="w-4 h-4 md:w-5 md:h-5 rounded-full object-cover border border-outline-variant/20 shadow-sm shrink-0">
                                <span class="text-[9px] md:text-[11px] font-bold text-on-surface truncate flex-1 min-w-0 tracking-wide">${dynamicHostName}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="shrink-0 flex flex-col items-end justify-between ml-1 md:ml-2 pl-2 md:pl-4 border-l border-outline-variant/10 h-full py-3 md:py-4 w-[75px] md:w-auto z-10">
                        <div class="flex flex-col items-end gap-1.5 w-full">
                            ${statusHtml}
                            <span class="text-[8px] md:text-[9px] text-outline-variant font-bold tracking-widest uppercase mt-0.5 hidden md:block">${spotsFilled}/${spotsTotal} Joined</span>
                        </div>
                        <div class="mt-auto pt-2 w-full">
                            ${listActionBtn}
                        </div>
                    </div>
                `;
            }

            gamesContainer.appendChild(card);
        }

        // Pagination Logic Display
        if (loadMoreBtn) {
            if (endIndex < filteredGamesArray.length) {
                loadMoreBtn.classList.remove('hidden');
            } else {
                loadMoreBtn.classList.add('hidden');
            }
        }
    }

    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            currentPage++;
            renderGames(true); // true means appending to existing container
        });
    }

    // Attach filters
    [searchInput, statusFilter, dateFilter, sortFilter, cityFilter, skillFilter, typeFilter].forEach(el => {
        if (el) el.addEventListener('input', () => { checkActiveFilters(); currentPage = 1; renderGames(); });
        if (el) el.addEventListener('change', () => { checkActiveFilters(); currentPage = 1; renderGames(); });
    });


    // --- 3-STEP MODAL & LEAFLET MAP LOGIC ---
    const createModal = document.getElementById('create-game-modal');
    const createModalInner = createModal?.querySelector('div');
    
    let currentStep = 1;
    let spotCount = 10;
    const formState = {
        category: 'Pickup',
        type: '5v5',
        skill: 'Open for all',
        duration: '2',
        policy: 'open'
    };

    const s1 = document.getElementById('step-1');
    const s2 = document.getElementById('step-2');
    const s3 = document.getElementById('step-3');
    const p1 = document.getElementById('prog-1');
    const p2 = document.getElementById('prog-2');
    const p3 = document.getElementById('prog-3');
    const btnPrev = document.getElementById('prev-step-btn');
    const btnNext = document.getElementById('next-step-btn');
    const btnSubmit = document.getElementById('submit-game-btn');

    function renderStep() {
        [s1, s2, s3].forEach(s => { 
            s.classList.add('hidden', 'opacity-0'); 
            s.classList.remove('flex'); 
        });
        
        const progActive = 'bg-primary shadow-[0_0_8px_rgba(255,143,111,0.5)] border-primary';
        const progInactive = 'bg-surface-container border-outline-variant/10 shadow-none';
        
        [p1, p2, p3].forEach(p => { 
            p.className = `h-1.5 flex-1 rounded-full transition-colors duration-300 ${progInactive}`; 
        });

        setTimeout(() => {
            if (currentStep === 1) {
                s1.classList.remove('hidden'); 
                s1.classList.add('flex');
                setTimeout(() => s1.classList.remove('opacity-0'), 10);
                p1.className = `h-1.5 flex-1 rounded-full transition-colors duration-300 ${progActive}`;
                
                btnPrev.classList.add('hidden');
                btnNext.classList.remove('hidden'); 
                btnNext.classList.add('w-full');
                btnSubmit.classList.add('hidden');
            } 
            else if (currentStep === 2) {
                s2.classList.remove('hidden'); 
                s2.classList.add('flex');
                setTimeout(() => s2.classList.remove('opacity-0'), 10);
                p1.className = p2.className = `h-1.5 flex-1 rounded-full transition-colors duration-300 ${progActive}`;
                
                btnPrev.classList.remove('hidden');
                btnNext.classList.remove('hidden'); 
                btnNext.classList.remove('w-full'); 
                btnNext.classList.add('w-2/3');
                btnSubmit.classList.add('hidden');
            } 
            else if (currentStep === 3) {
                s3.classList.remove('hidden'); 
                s3.classList.add('flex');
                setTimeout(() => s3.classList.remove('opacity-0'), 10);
                p1.className = p2.className = p3.className = `h-1.5 flex-1 rounded-full transition-colors duration-300 ${progActive}`;
                
                btnPrev.classList.remove('hidden');
                btnNext.classList.add('hidden');
                btnSubmit.classList.remove('hidden'); 
                btnSubmit.classList.add('flex');
            }
        }, 50);
    }

    btnNext?.addEventListener('click', () => {
        if (currentStep === 1) {
            const title = document.getElementById('game-title').value.trim();
            if (!title) return alert("Please enter a game title.");
        }
        else if (currentStep === 2) {
            const date = document.getElementById('game-date').value;
            const time = document.getElementById('game-time').value;
            const loc = document.getElementById('game-location').value.trim();
            if (!date) return alert("Please select a date.");
            if (!time) return alert("Please select a start time.");
            if (!loc) return alert("Please enter a location or court name.");
        }
        currentStep++;
        renderStep();
    });

    btnPrev?.addEventListener('click', () => {
        if (currentStep > 1) {
            currentStep--;
            renderStep();
        }
    });

    document.querySelectorAll('.game-chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
            const groupName = chip.dataset.group;
            const val = chip.dataset.value;
            formState[groupName] = val;
            
            document.querySelectorAll(`.game-chip[data-group="${groupName}"]`).forEach(c => {
                c.classList.remove('active');
            });
            chip.classList.add('active');
        });
    });

    const dispSpots = document.getElementById('spot-display');
    const inputSpots = document.getElementById('game-spots');
    
    document.getElementById('spot-minus')?.addEventListener('click', () => {
        if (spotCount > 2) { 
            spotCount--; 
            dispSpots.textContent = spotCount; 
            inputSpots.value = spotCount; 
        }
    });
    document.getElementById('spot-plus')?.addEventListener('click', () => {
        if (spotCount < 50) { 
            spotCount++; 
            dispSpots.textContent = spotCount; 
            inputSpots.value = spotCount; 
        }
    });

    window.openCreateGameModal = function() {
        if (!currentUser) return alert('Please log in to host a game.');
        
        currentStep = 1;
        spotCount = 10;
        dispSpots.textContent = spotCount;
        inputSpots.value = spotCount;
        renderStep();
        
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('game-date').value = today;

        createModal.classList.remove('hidden');
        createModal.classList.add('flex');
        createModal.classList.remove('pointer-events-none'); 

        setTimeout(() => {
            createModal.classList.remove('opacity-0');
            createModalInner.classList.remove('translate-y-full', 'scale-95');
            createModalInner.classList.add('translate-y-0', 'scale-100');
        }, 10);
    };

    document.getElementById('close-create-modal')?.addEventListener('click', () => {
        createModal.classList.add('opacity-0');
        createModalInner.classList.remove('translate-y-0', 'scale-100');
        createModalInner.classList.add('translate-y-full', 'scale-95');
        setTimeout(() => {
            createModal.classList.add('hidden');
            createModal.classList.remove('flex');
            createModal.classList.add('pointer-events-none'); 
        }, 300);
    });

    document.getElementById('game-image')?.addEventListener('change', function(e) {
        const previewContainer = document.getElementById('game-image-preview-container');
        const previewImage = document.getElementById('game-image-preview');
        if (this.files && this.files[0]) {
            const reader = new FileReader();
            reader.onload = function(evt) {
                previewImage.src = evt.target.result;
                previewContainer.classList.remove('hidden');
            }
            reader.readAsDataURL(this.files[0]);
        }
    });

    document.getElementById('remove-game-image-btn')?.addEventListener('click', function() {
        document.getElementById('game-image').value = '';
        document.getElementById('game-image-preview').src = '';
        document.getElementById('game-image-preview-container').classList.add('hidden');
    });

    // --- LEAFLET MAP INTEGRATION ---
    let map;
    let marker;
    const mapModal = document.getElementById('map-picker-modal');
    const openMapBtn = document.getElementById('open-map-picker-btn');
    const closeMapBtn = document.getElementById('close-map-picker-btn');
    const confirmMapBtn = document.getElementById('confirm-location-btn');
    const mapLinkInput = document.getElementById('game-map-link');

    openMapBtn?.addEventListener('click', () => {
        mapModal.classList.remove('hidden');
        mapModal.classList.remove('pointer-events-none'); 
        
        setTimeout(() => {
            mapModal.classList.remove('opacity-0');
            mapModal.querySelector('div').classList.remove('scale-95');
            
            if (!map) {
                map = L.map('leaflet-map').setView([14.5547, 121.0244], 12); 
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
                
                L.Control.geocoder({ defaultMarkGeocode: false })
                    .on('markgeocode', function(e) {
                        const bbox = e.geocode.bbox;
                        const poly = L.polygon([
                            bbox.getSouthEast(), bbox.getNorthEast(),
                            bbox.getNorthWest(), bbox.getSouthWest()
                        ]);
                        map.fitBounds(poly.getBounds());
                    })
                    .addTo(map);

                map.on('click', function(e) {
                    if (marker) map.removeLayer(marker);
                    marker = L.marker(e.latlng).addTo(map);
                });
            }
            setTimeout(() => map.invalidateSize(), 100);
        }, 10);
    });

    function closeMap() {
        mapModal.classList.add('opacity-0');
        mapModal.querySelector('div').classList.add('scale-95');
        setTimeout(() => {
            mapModal.classList.add('hidden');
            mapModal.classList.add('pointer-events-none');
        }, 300);
    }

    closeMapBtn?.addEventListener('click', closeMap);
    
    confirmMapBtn?.addEventListener('click', async () => {
        if (marker) {
            const lat = marker.getLatLng().lat;
            const lng = marker.getLatLng().lng;
            
            mapLinkInput.value = `https://maps.google.com/?q=${lat},${lng}`;
            const locationInput = document.getElementById('game-location');
            
            const originalBtnHtml = confirmMapBtn.innerHTML;
            confirmMapBtn.innerHTML = `<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> Locating...`;
            
            try {
                const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`);
                const data = await response.json();
                
                if (data && data.address) {
                    const place = data.address.amenity || data.address.leisure || data.address.building || data.address.road || "Pinned Location";
                    const city = data.address.city || data.address.town || data.address.suburb || data.address.village || "";
                    const readableAddress = city && place !== city ? `${place}, ${city}` : data.display_name.split(',')[0];
                    
                    if (!locationInput.value) { locationInput.value = readableAddress; }
                }
            } catch (err) { console.error("Failed to fetch address details:", err); }

            confirmMapBtn.innerHTML = originalBtnHtml;
            closeMap();
        } else { alert('Please tap on the map to place a pin.'); }
    });

    // --- FINAL FORM SUBMISSION ---
    btnSubmit?.addEventListener('click', async () => {
        if (!currentUser) return alert("You must be logged in to host a game.");

        btnSubmit.disabled = true;
        btnSubmit.innerHTML = `<span class="material-symbols-outlined animate-spin">refresh</span> Publishing...`;

        try {
            const dateVal = document.getElementById('game-date').value;
            const timeVal = document.getElementById('game-time').value;
            
            let endTimeStr = '';
            if (dateVal && timeVal) {
                const startObj = new Date(`${dateVal}T${timeVal}`);
                const durationHrs = parseFloat(formState.duration);
                const endObj = new Date(startObj.getTime() + durationHrs * 60 * 60 * 1000);
                endTimeStr = endObj.toTimeString().substring(0, 5);
            }

            let imageUrl = null;
            const fileInput = document.getElementById('game-image');
            if (fileInput.files.length > 0) {
                imageUrl = await uploadGameImage(fileInput.files[0]);
            }

            let hostName = currentUser.displayName || "Unknown Player";
            let hostPhoto = currentUser.photoURL || null;

            try {
                const localProfile = JSON.parse(localStorage.getItem('ligaPhProfile') || '{}');
                if (localProfile.displayName) hostName = localProfile.displayName;
                if (localProfile.photoURL) hostPhoto = localProfile.photoURL;
            } catch(err) {}

            const newGame = {
                title: document.getElementById('game-title').value,
                category: formState.category,
                type: formState.type,
                location: document.getElementById('game-location').value,
                mapLink: document.getElementById('game-map-link').value,
                date: dateVal,
                time: timeVal,
                endTime: endTimeStr,
                spotsTotal: parseInt(inputSpots.value),
                joinPolicy: formState.policy,
                skillLevel: formState.skill,
                description: document.getElementById('game-description').value,
                imageUrl: imageUrl,
                host: hostName,
                hostId: currentUser.uid,
                hostPhoto: hostPhoto,
                players: [currentUser.uid], 
                applicants: [],
                status: 'upcoming',
                createdAt: serverTimestamp()
            };

            const result = await postGame(newGame);
            
            if (result.success) {
                document.getElementById('close-create-modal').click();
                
                document.getElementById('game-title').value = '';
                document.getElementById('game-location').value = '';
                document.getElementById('game-description').value = '';
                document.getElementById('remove-game-image-btn').click();
                
                alert("Game created successfully!");
                currentPage = 1;
                loadGames(); 
            } else {
                throw new Error(result.error);
            }
            
        } catch (error) {
            console.error("Error creating game:", error);
            alert("Failed to create game. Check console for details.");
        } finally {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = `<span class="material-symbols-outlined text-[18px]">publish</span> Post Game`;
        }
    });
});
