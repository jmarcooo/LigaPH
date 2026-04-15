import { auth, db } from './firebase-setup.js';
import { collection, addDoc, getDocs, query, where, serverTimestamp, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";

const storage = getStorage();

function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function getFallbackAvatar(name) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'P')}&background=20262f&color=ff8f6f`;
}

function getFallbackLogo(name) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'SQ')}&background=14171d&color=ff8f6f`;
}

const posMap = {
    'PG': 'Point Guard',
    'SG': 'Shooting Guard',
    'SF': 'Small Forward',
    'PF': 'Power Forward',
    'C': 'Center'
};

// --- GLOBAL STATE & PAGINATION ---
let currentUserData = null;
let currentUserSquadId = null; // Storing this explicitly to fix "My Squad" bug
let allSquads = [];
let allPlayers = [];

// Pagination Config
const ITEMS_PER_PAGE = 12;
let currentSquadPage = 1;
let currentPlayerPage = 1;
let filteredSquadsCache = [];
let filteredPlayersCache = [];

document.addEventListener('DOMContentLoaded', () => {
    
    // --- TAB SWITCHING ---
    const tabSquads = document.getElementById('tab-squads');
    const tabPlayers = document.getElementById('tab-players');
    const viewSquads = document.getElementById('view-squads');
    const viewPlayers = document.getElementById('view-players');
    const fabButton = document.getElementById('create-squad-btn');

    function switchTab(tab) {
        if (tab === 'squads') {
            tabSquads.classList.replace('border-transparent', 'border-primary');
            tabSquads.classList.replace('text-on-surface-variant', 'text-primary');
            tabPlayers.classList.replace('border-primary', 'border-transparent');
            tabPlayers.classList.replace('text-primary', 'text-on-surface-variant');
            
            viewSquads.classList.remove('hidden');
            viewPlayers.classList.add('hidden');
            if (fabButton) { fabButton.classList.remove('hidden'); fabButton.classList.add('flex'); }
        } else {
            tabPlayers.classList.replace('border-transparent', 'border-primary');
            tabPlayers.classList.replace('text-on-surface-variant', 'text-primary');
            tabSquads.classList.replace('border-primary', 'border-transparent');
            tabSquads.classList.replace('text-primary', 'text-on-surface-variant');
            
            viewPlayers.classList.remove('hidden');
            viewSquads.classList.add('hidden');
            if (fabButton) { fabButton.classList.remove('flex'); fabButton.classList.add('hidden'); }
        }
    }
    if (tabSquads) tabSquads.addEventListener('click', () => switchTab('squads'));
    if (tabPlayers) tabPlayers.addEventListener('click', () => switchTab('players'));

    // --- FILTER UI LOGIC ---
    const filterBtn = document.getElementById('toggle-filters-btn');
    const filterContainer = document.getElementById('expandable-filters');
    const resetBtn = document.getElementById('reset-filters-btn');
    
    const searchInput = document.getElementById('explore-search-input');
    const sortFilter = document.getElementById('filter-sort');
    const cityFilter = document.getElementById('filter-city');
    const skillFilter = document.getElementById('filter-skill');

    if(filterBtn) {
        filterBtn.addEventListener('click', () => {
            const isOpen = filterContainer.classList.contains('open');
            if (isOpen) {
                filterContainer.classList.remove('open');
                filterBtn.classList.remove('border-primary/50', 'text-primary');
                filterBtn.classList.add('border-outline-variant/30', 'text-on-surface');
            } else {
                filterContainer.classList.add('open');
                filterBtn.classList.remove('border-outline-variant/30', 'text-on-surface');
                filterBtn.classList.add('border-primary/50', 'text-primary');
            }
        });
    }

    function checkActiveFilters() {
        if (cityFilter.value || skillFilter.value || sortFilter.value !== 'rank') {
            resetBtn.classList.remove('hidden');
            resetBtn.classList.add('flex');
            document.getElementById('filter-btn-text').textContent = "Filters (Active)";
        } else {
            resetBtn.classList.add('hidden');
            resetBtn.classList.remove('flex');
            document.getElementById('filter-btn-text').textContent = "Filters";
        }
    }

    if(resetBtn) {
        resetBtn.addEventListener('click', () => {
            cityFilter.value = '';
            skillFilter.value = '';
            sortFilter.value = 'rank';
            searchInput.value = '';
            checkActiveFilters();
            applyAllFiltersAndRender();
        });
    }

    [searchInput, sortFilter, cityFilter, skillFilter].forEach(el => {
        if (el) el.addEventListener('input', () => {
            checkActiveFilters();
            applyAllFiltersAndRender();
        });
    });

    // Populate City Dropdowns
    const citiesToLoad = window.metroManilaCities || [
        "Caloocan City", "Las Piñas City", "Makati City", "Malabon City", "Mandaluyong City", 
        "Manila City", "Marikina City", "Muntinlupa City", "Navotas City", "Parañaque City", 
        "Pasay City", "Pasig City", "Municipality of Pateros", "Quezon City", "San Juan City", "Taguig City", "Valenzuela City"
    ];
    
    const squadCityInput = document.getElementById('squad-city-input');
    citiesToLoad.forEach(city => {
        if(squadCityInput) squadCityInput.appendChild(new Option(city, city));
        if (cityFilter) {
            const opt = new Option(city, city);
            opt.className = 'bg-[#0a0e14] text-on-surface';
            cityFilter.appendChild(opt);
        }
    });

    // --- PAGINATION LOAD MORE LISTENERS ---
    const loadMoreSquadsBtn = document.getElementById('load-more-squads');
    const loadMorePlayersBtn = document.getElementById('load-more-players');

    if(loadMoreSquadsBtn) {
        loadMoreSquadsBtn.addEventListener('click', () => {
            currentSquadPage++;
            renderSquadGrid(true); // true = append
        });
    }

    if(loadMorePlayersBtn) {
        loadMorePlayersBtn.addEventListener('click', () => {
            currentPlayerPage++;
            renderPlayerGrid(true); // true = append
        });
    }

    // --- INIT AUTH & DATA ---
    onAuthStateChanged(auth, async (user) => {
        currentUserData = user;
        if (user) {
            // BULLETPROOF SQUAD FIX: Explicitly fetch the user doc to see if they are in a squad
            try {
                const userDocSnap = await getDoc(doc(db, "users", user.uid));
                if (userDocSnap.exists()) {
                    currentUserSquadId = userDocSnap.data().squadId || null;
                }
            } catch (e) {
                console.error("Error fetching user squad ID:", e);
            }
        }
        
        loadSquads();
        loadPlayers();
    });

    // --- CORE FILTERING ENGINE ---
    function applyAllFiltersAndRender() {
        const search = searchInput.value.toLowerCase().trim();
        const city = cityFilter.value;
        const skill = skillFilter.value;
        const sort = sortFilter.value;

        // FILTER SQUADS
        filteredSquadsCache = allSquads.filter(s => {
            const matchSearch = !search || (s.name || '').toLowerCase().includes(search) || (s.abbr || '').toLowerCase().includes(search);
            const matchCity = !city || s.city === city;
            const matchSkill = !skill || s.skillLevel === skill;
            return matchSearch && matchCity && matchSkill;
        });

        // SORT SQUADS
        filteredSquadsCache.sort((a, b) => {
            if (sort === 'rank') {
                const countA = a.members ? a.members.length : 0;
                const countB = b.members ? b.members.length : 0;
                return countB - countA; 
            } else if (sort === 'name-asc') {
                return (a.name || '').localeCompare(b.name || '');
            } else if (sort === 'name-desc') {
                return (b.name || '').localeCompare(a.name || '');
            }
        });

        // FILTER PLAYERS
        filteredPlayersCache = allPlayers.filter(p => {
            const matchSearch = !search || (p.displayName || '').toLowerCase().includes(search) || (p.squadAbbr || '').toLowerCase().includes(search);
            const matchCity = !city || (p.normalizedCity || '') === city;
            const matchSkill = !skill || (p.skillLevel || '') === skill; 
            return matchSearch && matchCity && matchSkill;
        });

        // SORT PLAYERS
        filteredPlayersCache.sort((a, b) => {
            if (sort === 'rank') {
                return (b.score || 0) - (a.score || 0); 
            } else if (sort === 'name-asc') {
                return (a.displayName || '').localeCompare(b.displayName || '');
            } else if (sort === 'name-desc') {
                return (b.displayName || '').localeCompare(a.displayName || '');
            }
        });

        currentSquadPage = 1;
        currentPlayerPage = 1;
        renderSquadGrid(false); 
        renderPlayerGrid(false);
    }

    // --- SQUADS RENDER ---
    async function loadSquads() {
        try {
            const querySnapshot = await getDocs(collection(db, "squads"));
            allSquads = [];
            querySnapshot.forEach((doc) => {
                allSquads.push({ id: doc.id, ...doc.data() });
            });

            // Calculate Top 3 overall (Unfiltered)
            const sortedByRank = [...allSquads].sort((a, b) => (b.members?.length || 0) - (a.members?.length || 0));
            renderTopSquads(sortedByRank.slice(0, 3));
            renderMySquad();

            applyAllFiltersAndRender();
        } catch (error) {
            console.error("Error loading squads:", error);
        }
    }

    function renderTopSquads(top3) {
        const topSquadsContainer = document.getElementById('top-squad-container');
        if(!topSquadsContainer) return;

        if (top3.length === 0) {
            topSquadsContainer.innerHTML = `<div class="bg-[#14171d] rounded-3xl p-10 border border-outline-variant/10 shadow-lg text-center text-outline-variant text-sm">No squads exist yet.</div>`;
            return;
        }

        let topHtml = '<div class="grid grid-cols-1 md:grid-cols-2 gap-6">';
        top3.forEach((squad, index) => {
            const rank = index + 1;
            const isFirst = rank === 1;
            const logoUrl = squad.logoUrl || getFallbackLogo(squad.name);
            const memCount = squad.members ? squad.members.length : 0;
            
            const gridClass = isFirst ? 'md:col-span-2' : 'col-span-1';
            const logoSize = isFirst ? 'w-24 h-24 md:w-36 md:h-36' : 'w-20 h-20 md:w-28 md:h-28';
            const textSize = isFirst ? 'text-3xl md:text-5xl' : 'text-2xl md:text-3xl';
            const badgeColor = isFirst ? 'bg-primary text-on-primary-container shadow-[0_0_15px_rgba(255,143,111,0.5)]' : 'bg-surface-container-highest text-on-surface';

            topHtml += `
                <div class="${gridClass} bg-gradient-to-br from-[#14171d] to-[#0a0e14] rounded-3xl p-6 md:p-8 border border-outline-variant/20 hover:border-primary/50 shadow-lg flex flex-col sm:flex-row items-center sm:items-center gap-5 md:gap-8 relative overflow-hidden group cursor-pointer transition-transform hover:scale-[1.01]" onclick="window.location.href='squad-details.html?id=${squad.id}'">
                    <div class="absolute -right-20 -top-20 w-64 h-64 ${isFirst ? 'bg-primary/10' : 'bg-surface-container-highest/50'} rounded-full blur-3xl pointer-events-none group-hover:opacity-100 opacity-50 transition-opacity"></div>
                    <div class="${logoSize} rounded-3xl border-2 ${isFirst ? 'border-primary/50' : 'border-outline-variant/30'} bg-surface-container shrink-0 flex items-center justify-center overflow-hidden z-10 shadow-xl relative group-hover:-rotate-3 transition-transform duration-500">
                        <img src="${logoUrl}" class="w-full h-full object-cover">
                    </div>
                    <div class="flex-1 w-full text-center sm:text-left z-10 flex flex-col justify-center">
                        <div class="flex flex-wrap items-center justify-center sm:justify-start gap-3 mb-3">
                            <span class="${badgeColor} px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest">#${rank} SQUAD</span>
                            ${squad.privacy === 'approval' ? `<span class="bg-[#0a0e14]/50 border border-outline-variant/10 px-3 py-1 rounded text-[10px] font-black text-outline uppercase tracking-widest flex items-center gap-1"><span class="material-symbols-outlined text-[12px]">lock</span> Private</span>` : ''}
                        </div>
                        <h1 class="font-headline ${textSize} font-black italic tracking-tighter uppercase text-on-surface mb-2 drop-shadow-md leading-[1.1] group-hover:text-primary transition-colors">${escapeHTML(squad.name)}</h1>
                        <p class="text-xs text-outline-variant font-bold uppercase tracking-widest mb-4 flex items-center justify-center sm:justify-start gap-2">
                            <span class="material-symbols-outlined text-[14px]">location_on</span> ${escapeHTML(squad.city)}
                        </p>
                        <div class="flex flex-wrap justify-center sm:justify-start gap-3 mt-2">
                            <div class="bg-surface-container-highest border border-outline-variant/10 px-4 py-2 rounded-xl flex flex-col items-center justify-center min-w-[70px]">
                                <span class="text-[8px] text-outline font-bold uppercase tracking-widest mb-1">ROSTER</span>
                                <span class="font-headline font-black text-lg text-on-surface leading-none">${memCount}</span>
                            </div>
                            <div class="bg-surface-container-highest border border-outline-variant/10 px-4 py-2 rounded-xl flex flex-col items-center justify-center min-w-[70px]">
                                <span class="text-[8px] text-outline font-bold uppercase tracking-widest mb-1">SKILL</span>
                                <span class="font-headline font-black text-sm text-secondary leading-[1.2rem]">${escapeHTML(squad.skillLevel)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        topHtml += '</div>';
        topSquadsContainer.innerHTML = topHtml;
    }

    function renderSquadGrid(append = false) {
        const squadsGrid = document.getElementById('squads-grid');
        if(!squadsGrid) return;

        if (!append) squadsGrid.innerHTML = '';

        if (filteredSquadsCache.length === 0) {
            squadsGrid.innerHTML = '<div class="col-span-full text-center text-outline-variant py-8 text-sm italic">No squads match your filters.</div>';
            if(loadMoreSquadsBtn) loadMoreSquadsBtn.classList.add('hidden');
            return;
        }

        const startIndex = append ? (currentSquadPage - 1) * ITEMS_PER_PAGE : 0;
        const endIndex = currentSquadPage * ITEMS_PER_PAGE;
        const squadsToRender = filteredSquadsCache.slice(startIndex, endIndex);

        squadsToRender.forEach(squad => {
            const logoUrl = squad.logoUrl || getFallbackLogo(squad.name);
            const memCount = squad.members ? squad.members.length : 0;
            
            squadsGrid.innerHTML += `
                <div class="bg-[#14171d] rounded-2xl p-5 border border-outline-variant/10 hover:border-primary/30 hover:bg-surface-bright transition-all cursor-pointer shadow-sm flex flex-col group" onclick="window.location.href='squad-details.html?id=${squad.id}'">
                    <div class="flex items-center gap-4 w-full">
                        <div class="w-14 h-14 rounded-2xl border border-outline-variant/20 bg-surface-container shrink-0 flex items-center justify-center overflow-hidden">
                            <img src="${logoUrl}" class="w-full h-full object-cover">
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 mb-1">
                                <span class="bg-surface-container border border-outline-variant/10 px-2 py-0.5 rounded text-[8px] font-black text-outline uppercase tracking-widest">${escapeHTML(squad.abbr || 'SQD')}</span>
                                ${squad.privacy === 'approval' ? `<span class="material-symbols-outlined text-[12px] text-outline-variant" title="Private">lock</span>` : ''}
                            </div>
                            <h4 class="font-headline font-black italic uppercase text-on-surface truncate text-sm md:text-base leading-none mb-1 group-hover:text-primary transition-colors">${escapeHTML(squad.name)}</h4>
                            <p class="text-[10px] font-bold text-outline-variant uppercase tracking-widest truncate flex items-center gap-1">
                                <span class="material-symbols-outlined text-[10px]">location_on</span> ${escapeHTML(squad.city)}
                            </p>
                        </div>
                    </div>
                    <div class="mt-5 pt-3 border-t border-outline-variant/10 grid grid-cols-3 gap-2">
                        <div class="flex flex-col items-center justify-center">
                            <span class="text-[8px] text-outline font-bold uppercase tracking-widest mb-0.5">ROSTER</span>
                            <span class="font-black text-on-surface text-xs">${memCount}</span>
                        </div>
                        <div class="flex flex-col items-center justify-center border-l border-outline-variant/10">
                            <span class="text-[8px] text-outline font-bold uppercase tracking-widest mb-0.5">RECORD</span>
                            <span class="font-black text-primary text-xs">0-0</span>
                        </div>
                        <div class="flex flex-col items-center justify-center border-l border-outline-variant/10">
                            <span class="text-[8px] text-outline font-bold uppercase tracking-widest mb-0.5">SKILL</span>
                            <span class="font-black text-secondary text-[9px] truncate w-full text-center px-1">${escapeHTML(squad.skillLevel)}</span>
                        </div>
                    </div>
                </div>
            `;
        });

        if(loadMoreSquadsBtn) {
            if (endIndex >= filteredSquadsCache.length) {
                loadMoreSquadsBtn.classList.add('hidden');
            } else {
                loadMoreSquadsBtn.classList.remove('hidden');
            }
        }
    }

    function renderMySquad() {
        const mySquadContainer = document.getElementById('my-squad-container');
        if (!mySquadContainer) return;

        if (!currentUserData) {
            mySquadContainer.innerHTML = `<div class="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/10 text-center shadow-sm"><p class="text-sm font-medium text-on-surface-variant">Log in to view your squad.</p></div>`;
            return;
        }

        // FIND SQUAD LOGIC FIX:
        // Prioritize checking if the user doc has a squadId.
        // If not, fallback to checking if their UID is in any squad's members array or captainId.
        let mySquad = null;
        if (currentUserSquadId) {
            mySquad = allSquads.find(s => s.id === currentUserSquadId);
        }
        
        if (!mySquad) {
            mySquad = allSquads.find(s => 
                (s.members && s.members.includes(currentUserData.uid)) || 
                (s.captainId === currentUserData.uid)
            );
        }

        if (!mySquad) {
            mySquadContainer.innerHTML = `<div class="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/10 text-center shadow-sm"><p class="text-sm font-medium text-on-surface-variant">You are a Free Agent. Join or create a squad!</p></div>`;
            return;
        }

        const logoUrl = mySquad.logoUrl || getFallbackLogo(mySquad.name);
        const memberCount = mySquad.members ? mySquad.members.length : 0;
        mySquadContainer.innerHTML = `
            <div class="bg-gradient-to-r from-[#14171d] to-surface-container-low rounded-2xl p-4 md:p-5 border border-tertiary/40 shadow-[0_4px_20px_rgba(202,165,255,0.1)] hover:brightness-110 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 group" onclick="window.location.href='squad-details.html?id=${mySquad.id}'">
                <div class="flex items-center gap-4 flex-1 min-w-0">
                    <div class="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-surface-container shrink-0 flex items-center justify-center overflow-hidden shadow-sm group-hover:scale-105 transition-transform"><img src="${logoUrl}" class="w-full h-full object-cover"></div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-1"><span class="bg-tertiary/20 text-tertiary border border-tertiary/20 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest shadow-sm">YOUR SQUAD</span></div>
                        <h4 class="font-headline font-black italic uppercase text-on-surface truncate text-lg md:text-xl group-hover:text-tertiary transition-colors">${escapeHTML(mySquad.name)}</h4>
                        <p class="text-[10px] text-outline font-bold uppercase tracking-widest flex items-center gap-1 mt-1 truncate"><span class="material-symbols-outlined text-[12px]">location_on</span> ${escapeHTML(mySquad.city)}</p>
                    </div>
                </div>
            </div>
        `;
    }

    // --- PLAYERS RENDER ---
    function calculatePlayerScore(player) {
        const attended = player.gamesAttended || 0;
        const missed = player.gamesMissed || 0;
        const totalGames = attended + missed;
        const reliabilityMultiplier = totalGames === 0 ? 1 : (attended / totalGames);
        
        let statsAvg = 0;
        if (player.selfRatings) {
            const sr = player.selfRatings;
            statsAvg = ((sr.shooting || 0) + (sr.passing || 0) + (sr.dribbling || 0) + (sr.rebounding || 0) + (sr.defense || 0)) / 5;
        }

        const props = player.commendations || 0;
        return Math.round((attended * 50) * reliabilityMultiplier + (props * 15) + (statsAvg * 5));
    }

    async function loadPlayers() {
        try {
            const [usersSnap, commSnap, connSnap] = await Promise.all([
                getDocs(collection(db, "users")),
                getDocs(collection(db, "commendations")),
                getDocs(query(collection(db, "connections"), where("status", "==", "accepted")))
            ]);
            
            const commendationCounts = {};
            commSnap.forEach(doc => {
                const targetId = doc.data().targetUserId;
                if(targetId) commendationCounts[targetId] = (commendationCounts[targetId] || 0) + 1;
            });

            const connectionCounts = {};
            connSnap.forEach(doc => {
                const d = doc.data();
                if(d.requesterId) connectionCounts[d.requesterId] = (connectionCounts[d.requesterId] || 0) + 1;
                if(d.receiverId) connectionCounts[d.receiverId] = (connectionCounts[d.receiverId] || 0) + 1;
            });

            allPlayers = [];
            usersSnap.forEach(doc => {
                const data = doc.data();
                const id = doc.id;
                const gamesPlayed = (data.gamesAttended || 0) + (data.gamesMissed || 0);
                const reliability = gamesPlayed === 0 ? 100 : Math.round(((data.gamesAttended || 0) / gamesPlayed) * 100);

                // Normalizing City data to catch both keys
                const normalizedCity = data.location || data.city || '';

                allPlayers.push({ 
                    id, 
                    ...data,
                    normalizedCity,
                    gamesPlayed,
                    reliability,
                    commendations: commendationCounts[id] || 0,
                    connections: connectionCounts[id] || 0
                });
            });

            allPlayers.forEach(p => p.score = calculatePlayerScore(p));
            allPlayers.sort((a, b) => b.score - a.score);
            allPlayers.forEach((p, idx) => p.globalRank = idx + 1);

            // FIX CITY RANKING: Group by normalizedCity
            const cityMap = {};
            allPlayers.forEach(p => {
                if(p.normalizedCity) {
                    if(!cityMap[p.normalizedCity]) cityMap[p.normalizedCity] = [];
                    cityMap[p.normalizedCity].push(p);
                }
            });
            
            Object.keys(cityMap).forEach(city => {
                cityMap[city].sort((a, b) => b.score - a.score);
                cityMap[city].forEach((p, idx) => p.cityRank = idx + 1);
            });

            applyAllFiltersAndRender();
        } catch (e) {
            console.error("Error loading players:", e);
        }
    }

    function renderPlayerGrid(append = false) {
        const playersGrid = document.getElementById('players-grid');
        if(!playersGrid) return;

        if (!append) playersGrid.innerHTML = '';
        
        if (filteredPlayersCache.length === 0) {
            playersGrid.innerHTML = '<div class="col-span-full text-center text-outline-variant py-8 text-sm italic">No players match your filters.</div>';
            if(loadMorePlayersBtn) loadMorePlayersBtn.classList.add('hidden');
            return;
        }

        const startIndex = append ? (currentPlayerPage - 1) * ITEMS_PER_PAGE : 0;
        const endIndex = currentPlayerPage * ITEMS_PER_PAGE;
        const playersToRender = filteredPlayersCache.slice(startIndex, endIndex);

        playersToRender.forEach((player) => {
            const safeName = escapeHTML(player.displayName || 'Unknown');
            const photoUrl = player.photoURL ? escapeHTML(player.photoURL) : getFallbackAvatar(safeName);
            const rawPos = player.primaryPosition || 'Unassigned';
            const fullPos = posMap[rawPos] || rawPos;

            let badges = [];
            if (player.globalRank && player.globalRank <= 10) badges.push(`<span class="bg-primary/20 text-primary border border-primary/20 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest shadow-sm">Rank #${player.globalRank}</span>`);
            
            // FIX CITY RANKING: Safely use the normalizedCity property and cityRank
            if (player.cityRank && player.cityRank <= 5 && player.normalizedCity) {
                badges.push(`<span class="bg-secondary/20 text-secondary border border-secondary/20 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest shadow-sm">${escapeHTML(player.normalizedCity)} #${player.cityRank}</span>`);
            }
            
            if (player.squadAbbr) badges.push(`<span class="bg-surface-container text-outline border border-outline-variant/30 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest shadow-sm flex items-center"><span class="material-symbols-outlined text-[10px] mr-0.5">shield</span> [${escapeHTML(player.squadAbbr)}]</span>`);

            const badgesHtml = badges.length > 0 ? `<div class="flex flex-wrap justify-center gap-1.5 mb-2 mt-0.5 w-full">${badges.join('')}</div>` : '';

            playersGrid.innerHTML += `
                <div class="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/10 shadow-sm flex flex-col items-center text-center group hover:border-primary/50 transition-colors cursor-pointer" onclick="window.location.href='profile.html?id=${player.id}'">
                    <img src="${photoUrl}" onerror="this.onerror=null; this.src='${getFallbackAvatar(safeName)}';" class="w-20 h-20 rounded-full mb-4 border-2 border-outline-variant/20 group-hover:border-primary transition-colors object-cover">
                    ${badgesHtml}
                    <h3 class="font-headline font-black italic text-lg uppercase tracking-tight text-on-surface group-hover:text-primary transition-colors leading-tight">${safeName}</h3>
                    <p class="text-[10px] font-bold text-outline-variant uppercase tracking-widest mb-4 flex items-center justify-center gap-1 mt-1"><span class="material-symbols-outlined text-[12px]">sports_basketball</span> ${fullPos} <span class="text-primary font-black ml-1 border-l border-outline-variant/20 pl-2">${player.score} PTS</span></p>
                    
                    <div class="w-full grid grid-cols-3 gap-2 pt-4 border-t border-outline-variant/10">
                        <div class="flex flex-col items-center">
                            <span class="font-black text-on-surface text-sm">${player.gamesPlayed}</span>
                            <span class="text-[8px] text-outline font-bold uppercase tracking-widest">GAMES</span>
                        </div>
                        <div class="flex flex-col items-center border-l border-outline-variant/10">
                            <span class="font-black text-secondary text-sm">${player.reliability}%</span>
                            <span class="text-[8px] text-outline font-bold uppercase tracking-widest">RELIABLE</span>
                        </div>
                        <div class="flex flex-col items-center border-l border-outline-variant/10">
                            <span class="font-black text-on-surface text-sm">${player.commendations}</span>
                            <span class="text-[8px] text-outline font-bold uppercase tracking-widest">PROPS</span>
                        </div>
                    </div>
                </div>
            `;
        });

        if(loadMorePlayersBtn) {
            if (endIndex >= filteredPlayersCache.length) {
                loadMorePlayersBtn.classList.add('hidden');
            } else {
                loadMorePlayersBtn.classList.remove('hidden');
            }
        }
    }

    // --- CREATE SQUAD FORM ---
    const createSquadBtn = document.getElementById('create-squad-btn');
    const createModal = document.getElementById('create-squad-modal');
    const closeModalBtn = document.getElementById('close-squad-modal');
    const createForm = document.getElementById('create-squad-form');
    
    if (createSquadBtn && createModal) {
        createSquadBtn.addEventListener('click', () => {
            if (!currentUserData) return alert("Please log in to create a squad.");
            createModal.classList.remove('hidden');
            createModal.classList.add('flex');
            setTimeout(() => { createModal.classList.remove('opacity-0'); createModal.querySelector('div').classList.remove('scale-95'); }, 10);
        });
    }

    if (closeModalBtn && createModal) {
        closeModalBtn.addEventListener('click', () => {
            createModal.classList.add('opacity-0');
            createModal.querySelector('div').classList.add('scale-95');
            setTimeout(() => { createModal.classList.add('hidden'); createModal.classList.remove('flex'); }, 300);
        });
    }

    if (createForm) {
        createForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentUserData) return;

            const submitBtn = document.getElementById('submit-squad-btn');
            const originalBtnText = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<span class="material-symbols-outlined animate-spin">refresh</span> Creating...`;

            try {
                // Confirm user isn't in squad
                const userDocRef = doc(db, "users", currentUserData.uid);
                const userSnap = await getDoc(userDocRef);
                if(userSnap.exists() && userSnap.data().squadId) {
                    alert("You are already in a squad.");
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnText;
                    return;
                }

                // Handle Logo Input
                let logoUrl = null;
                const logoInput = document.getElementById('squad-logo-input');
                if (logoInput && logoInput.files.length > 0) {
                    const file = logoInput.files[0];
                    const storageRef = ref(storage, `squad_logos/${Date.now()}_${file.name}`);
                    const snapshot = await uploadBytes(storageRef, file);
                    logoUrl = await getDownloadURL(snapshot.ref);
                }

                const newSquad = {
                    name: document.getElementById('squad-name-input').value,
                    abbr: document.getElementById('squad-abbr-input').value.toUpperCase(),
                    skillLevel: document.getElementById('squad-skill-input').value,
                    city: document.getElementById('squad-city-input').value,
                    privacy: document.getElementById('squad-privacy-input').value,
                    logoUrl: logoUrl,
                    captainId: currentUserData.uid,
                    members: [currentUserData.uid],
                    pendingRequests: [],
                    createdAt: serverTimestamp(),
                    record: { wins: 0, losses: 0 }
                };

                const docRef = await addDoc(collection(db, "squads"), newSquad);
                
                await updateDoc(userDocRef, { squadId: docRef.id, squadName: newSquad.name, squadAbbr: newSquad.abbr });
                currentUserSquadId = docRef.id; // Update state explicitly so UI catches it right away!
                
                alert("Squad created!");
                if(closeModalBtn) closeModalBtn.click();
                createForm.reset();
                loadSquads();
                loadPlayers(); // Reload players so your own badge updates
            } catch (error) {
                console.error(error);
                alert("Failed to create squad.");
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }
        });
    }
});
