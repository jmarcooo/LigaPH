import { auth, db } from './firebase-setup.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function getFallbackAvatar(name) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'P')}&background=20262f&color=ff8f6f`;
}

// Calculate an overall Player Score based on Reliability and Self Ratings
// In a real app, this would use Win/Loss records or community ratings.
function calculatePlayerScore(player) {
    const attended = player.gamesAttended || 0;
    const missed = player.gamesMissed || 0;
    const totalGames = attended + missed;
    
    const reliability = totalGames === 0 ? 50 : Math.round((attended / totalGames) * 100);
    
    let statsAvg = 0;
    if (player.selfRatings) {
        const sr = player.selfRatings;
        const total = (sr.shooting || 0) + (sr.passing || 0) + (sr.dribbling || 0) + (sr.rebounding || 0) + (sr.defense || 0);
        statsAvg = total / 5; // Out of 5
    }

    // Weight: 60% Reliability, 40% Stats
    const score = (reliability * 0.6) + ((statsAvg * 20) * 0.4); 
    return score;
}

const citiesToLoad = window.metroManilaCities || [
    "Caloocan", "Las Piñas", "Makati", "Malabon", "Mandaluyong", 
    "Manila", "Marikina", "Muntinlupa", "Navotas", "Parañaque", 
    "Pasay", "Pasig", "Pateros", "Quezon City", "San Juan", "Taguig", "Valenzuela"
];

const posMap = {
    'PG': 'Point Guard',
    'SG': 'Shooting Guard',
    'SF': 'Small Forward',
    'PF': 'Power Forward',
    'C': 'Center'
};

document.addEventListener('DOMContentLoaded', () => {
    const locFilterSelect = document.getElementById('player-location-filter');
    const posFilterSelect = document.getElementById('player-position-filter');
    const searchInput = document.getElementById('player-search-input');
    
    const myProfileContainer = document.getElementById('my-profile-container');
    const topPlayersContainer = document.getElementById('top-players-container');
    const playersGrid = document.getElementById('players-grid');

    let allPlayers = [];
    let currentUserData = null;

    citiesToLoad.forEach(city => {
        if (locFilterSelect) {
            const opt = document.createElement('option');
            opt.value = city;
            opt.textContent = city;
            opt.className = 'bg-[#0a0e14] text-on-surface';
            locFilterSelect.appendChild(opt);
        }
    });

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUserData = user;
        } else {
            currentUserData = null;
        }
        loadPlayers();
    });

    async function loadPlayers() {
        try {
            const usersRef = collection(db, "users");
            const snap = await getDocs(usersRef);
            
            allPlayers = [];
            snap.forEach(doc => {
                allPlayers.push({ id: doc.id, ...doc.data() });
            });

            // Calculate score & sort globally
            allPlayers.forEach(p => p.score = calculatePlayerScore(p));
            allPlayers.sort((a, b) => b.score - a.score);
            allPlayers.forEach((p, idx) => p.globalRank = idx + 1);

            // Sort locally per city
            const cityMap = {};
            allPlayers.forEach(p => {
                const c = p.location;
                if(c) {
                    if(!cityMap[c]) cityMap[c] = [];
                    cityMap[c].push(p);
                }
            });
            
            Object.keys(cityMap).forEach(city => {
                cityMap[city].sort((a, b) => b.score - a.score);
                cityMap[city].forEach((p, idx) => p.cityRank = idx + 1);
            });

            renderMyProfile();
            renderFilteredPlayers();

        } catch (e) {
            console.error("Error loading players:", e);
            topPlayersContainer.innerHTML = '<p class="text-error text-center py-10">Failed to load players.</p>';
            playersGrid.innerHTML = '';
        }
    }

    function renderMyProfile() {
        if (!myProfileContainer) return;

        if (!currentUserData) {
            myProfileContainer.innerHTML = `
                <div class="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/10 text-center flex flex-col items-center justify-center shadow-sm">
                    <span class="material-symbols-outlined text-3xl text-outline-variant mb-2">login</span>
                    <p class="text-sm font-medium text-on-surface-variant">Log in to view your player card.</p>
                </div>
            `;
            return;
        }

        const myData = allPlayers.find(p => p.id === currentUserData.uid);
        
        if (!myData) {
            myProfileContainer.innerHTML = `
                <div class="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/10 text-center flex flex-col items-center justify-center shadow-sm cursor-pointer" onclick="window.location.href='edit-profile.html'">
                    <span class="material-symbols-outlined text-3xl text-primary mb-2">edit_document</span>
                    <p class="text-sm font-bold text-on-surface">Setup Your Profile</p>
                </div>
            `;
            return;
        }

        const safeName = escapeHTML(myData.displayName || 'Unknown');
        const photoUrl = myData.photoURL ? escapeHTML(myData.photoURL) : getFallbackAvatar(safeName);
        const rank = myData.globalRank || '?';
        const rawPos = myData.primaryPosition || 'Unassigned';
        const fullPos = posMap[rawPos] || rawPos;
        const squadHtml = myData.squadAbbr ? `<span class="bg-primary/20 text-primary border border-primary/20 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest shadow-sm ml-2">[${escapeHTML(myData.squadAbbr)}]</span>` : '';

        myProfileContainer.innerHTML = `
            <div class="bg-gradient-to-r from-[#14171d] to-surface-container-low rounded-2xl p-4 md:p-5 border border-tertiary/40 shadow-[0_4px_20px_rgba(202,165,255,0.1)] hover:brightness-110 transition-all cursor-pointer flex items-center gap-4 group" onclick="window.location.href='profile.html?id=${myData.id}'">
                <div class="w-16 h-16 md:w-20 md:h-20 rounded-full border-2 border-tertiary/40 bg-surface-container shrink-0 flex items-center justify-center overflow-hidden shadow-sm group-hover:scale-105 transition-transform">
                    <img src="${photoUrl}" onerror="this.onerror=null; this.src='${getFallbackAvatar(safeName)}';" class="w-full h-full object-cover">
                </div>
                
                <div class="flex-1 min-w-0">
                    <div class="flex items-center mb-1">
                        <h4 class="font-headline font-black italic uppercase text-on-surface truncate text-lg md:text-xl group-hover:text-tertiary transition-colors">${safeName}</h4>
                        ${squadHtml}
                    </div>
                    <div class="flex items-center gap-3">
                        <p class="text-[10px] text-outline font-bold uppercase tracking-widest flex items-center gap-1">
                            <span class="material-symbols-outlined text-[12px]">sports_basketball</span> ${escapeHTML(fullPos)}
                        </p>
                    </div>
                </div>

                <div class="hidden sm:flex gap-6 shrink-0 mr-4">
                    <div class="text-center bg-surface-container-highest px-4 py-2 rounded-lg border border-outline-variant/10">
                        <p class="font-black text-tertiary text-lg leading-none">#${rank}</p>
                        <p class="text-[8px] text-outline font-bold uppercase tracking-widest mt-1">Global</p>
                    </div>
                </div>
                <span class="material-symbols-outlined text-outline-variant group-hover:text-tertiary transition-colors sm:hidden">chevron_right</span>
            </div>
        `;
    }

    function renderFilteredPlayers() {
        const currentCity = locFilterSelect.value;
        const currentPos = posFilterSelect.value;
        const searchTerm = searchInput ? searchInput.value.toLowerCase() : "";
        
        let filteredPlayers = [...allPlayers];

        if (currentCity !== "Metro Manila") {
            filteredPlayers = filteredPlayers.filter(p => p.location === currentCity);
        }

        if (currentPos !== "") {
            filteredPlayers = filteredPlayers.filter(p => p.primaryPosition === currentPos);
        }

        if (searchTerm) {
            filteredPlayers = filteredPlayers.filter(p => 
                (p.displayName && p.displayName.toLowerCase().includes(searchTerm)) || 
                (p.squadAbbr && p.squadAbbr.toLowerCase().includes(searchTerm))
            );
        }

        renderTopPlayers(filteredPlayers.slice(0, 3), currentCity);
        renderPlayerList(filteredPlayers); 
    }

    function renderTopPlayers(topPlayers, city) {
        if (topPlayers.length === 0) {
            topPlayersContainer.innerHTML = `
                <div class="bg-[#14171d] rounded-3xl p-10 border border-outline-variant/10 shadow-lg flex flex-col items-center justify-center text-center">
                    <span class="material-symbols-outlined text-5xl text-outline-variant/50 mb-4">search_off</span>
                    <h3 class="font-headline text-xl font-black text-on-surface uppercase tracking-widest">No Players Found</h3>
                    <p class="text-outline-variant text-sm mt-2">Adjust your filters to discover talent in ${city}!</p>
                </div>
            `;
            return;
        }

        let html = '<div class="grid grid-cols-1 md:grid-cols-2 gap-6">';

        topPlayers.forEach((player, index) => {
            const rank = index + 1;
            const isFirstPlace = rank === 1; 
            
            const safeName = escapeHTML(player.displayName || 'Unknown');
            const photoUrl = player.photoURL ? escapeHTML(player.photoURL) : getFallbackAvatar(safeName);
            
            const rawPos = player.primaryPosition || 'Unassigned';
            const fullPos = posMap[rawPos] || rawPos;
            
            const ppg = player.selfRatings ? (player.selfRatings.shooting * 4.2).toFixed(1) : '0.0';
            const ast = player.selfRatings ? (player.selfRatings.passing * 1.8).toFixed(1) : '0.0';

            const gridClass = isFirstPlace ? 'md:col-span-2' : 'col-span-1';
            const textSize = isFirstPlace ? 'text-3xl md:text-5xl' : 'text-2xl xl:text-3xl';
            const logoSize = isFirstPlace ? 'w-24 h-24 md:w-32 md:h-32' : 'w-20 h-20 lg:w-28 lg:h-28';
            const badgeColor = isFirstPlace ? 'bg-primary text-on-primary-container shadow-[0_0_15px_rgba(255,143,111,0.5)]' : 'bg-secondary text-on-primary-container';
            const badgeLabel = `#${rank} RANK`;

            html += `
                <div class="${gridClass} bg-gradient-to-br from-[#14171d] to-[#0a0e14] rounded-3xl p-6 border border-outline-variant/20 hover:border-primary/50 shadow-lg flex flex-col sm:flex-row items-center sm:items-center gap-5 md:gap-8 relative overflow-hidden group cursor-pointer transition-transform hover:scale-[1.01]" onclick="window.location.href='profile.html?id=${player.id}'">
                    
                    <div class="absolute -right-20 -top-20 w-64 h-64 ${isFirstPlace ? 'bg-primary/10' : 'bg-secondary/10'} rounded-full blur-3xl pointer-events-none group-hover:opacity-100 opacity-50 transition-opacity"></div>

                    <div class="${logoSize} rounded-full border-[3px] ${isFirstPlace ? 'border-primary/50' : 'border-outline-variant/30'} bg-surface-container shrink-0 flex items-center justify-center overflow-hidden z-10 shadow-xl relative">
                        <img src="${photoUrl}" onerror="this.onerror=null; this.src='${getFallbackAvatar(safeName)}';" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                    </div>

                    <div class="flex-1 w-full text-center sm:text-left z-10 flex flex-col justify-center">
                        <div class="flex flex-wrap items-center justify-center sm:justify-start gap-3 mb-3">
                            <span class="${badgeColor} px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest shadow-sm">${badgeLabel}</span>
                            ${player.squadAbbr ? `<span class="bg-surface-container-highest px-3 py-1 rounded border border-outline-variant/10 shadow-sm text-[10px] font-black text-outline uppercase tracking-widest flex items-center gap-1"><span class="material-symbols-outlined text-[12px]">shield</span> [${escapeHTML(player.squadAbbr)}]</span>` : ''}
                        </div>

                        <h1 class="font-headline ${textSize} font-black italic tracking-tighter uppercase text-on-surface mb-2 drop-shadow-md leading-[1.1] group-hover:text-primary transition-colors">
                            ${safeName}
                        </h1>
                        <p class="text-xs text-outline-variant font-bold uppercase tracking-widest mb-4">${fullPos}</p>

                        <div class="flex flex-wrap justify-center sm:justify-start gap-3">
                            <div class="bg-surface-container-highest border border-outline-variant/10 px-4 py-2 rounded-xl flex flex-col items-center justify-center min-w-[70px]">
                                <span class="text-[8px] text-outline font-bold uppercase tracking-widest mb-1">SCORE</span>
                                <span class="font-headline font-black text-lg text-on-surface leading-none">${player.score.toFixed(0)}</span>
                            </div>
                            <div class="bg-surface-container-highest border border-outline-variant/10 px-4 py-2 rounded-xl flex flex-col items-center justify-center min-w-[70px]">
                                <span class="text-[8px] text-outline font-bold uppercase tracking-widest mb-1">PPG</span>
                                <span class="font-headline font-black text-lg text-primary leading-none">${ppg}</span>
                            </div>
                            <div class="bg-surface-container-highest border border-outline-variant/10 px-4 py-2 rounded-xl flex flex-col items-center justify-center min-w-[70px] hidden sm:flex">
                                <span class="text-[8px] text-outline font-bold uppercase tracking-widest mb-1">AST</span>
                                <span class="font-headline font-black text-lg text-on-surface leading-none">${ast}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        topPlayersContainer.innerHTML = html;
    }

    function renderPlayerList(players) {
        playersGrid.innerHTML = '';
        
        if (players.length === 0) {
            playersGrid.innerHTML = '<div class="col-span-full text-center text-outline-variant py-8 text-sm italic">No other players match your search.</div>';
            return;
        }

        players.forEach((player, index) => {
            const rankInCurrentView = index + 1; 
            const safeName = escapeHTML(player.displayName || 'Unknown');
            const photoUrl = player.photoURL ? escapeHTML(player.photoURL) : getFallbackAvatar(safeName);
            const rawPos = player.primaryPosition || 'Unassigned';
            
            const score = player.score.toFixed(0);

            let badges = [];
            if (player.globalRank && player.globalRank <= 10) {
                badges.push(`<span class="bg-primary/20 text-primary border border-primary/20 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest shadow-sm">Rank #${player.globalRank}</span>`);
            }
            if (player.cityRank && player.cityRank <= 5 && player.location) {
                badges.push(`<span class="bg-secondary/20 text-secondary border border-secondary/20 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest shadow-sm">${escapeHTML(player.location)} #${player.cityRank}</span>`);
            }
            if (player.squadAbbr) {
                badges.push(`<span class="bg-surface-container text-outline border border-outline-variant/30 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest shadow-sm flex items-center"><span class="material-symbols-outlined text-[10px] mr-0.5">shield</span> [${escapeHTML(player.squadAbbr)}]</span>`);
            }

            const badgesHtml = badges.length > 0 ? `<div class="flex flex-wrap items-center gap-1.5 mb-2 mt-0.5">${badges.join('')}</div>` : '';

            playersGrid.innerHTML += `
                <div class="bg-[#14171d] rounded-2xl p-5 border border-outline-variant/10 hover:border-primary/30 hover:bg-surface-bright transition-all cursor-pointer shadow-sm flex flex-col group" onclick="window.location.href='profile.html?id=${player.id}'">
                    
                    <div class="flex items-center gap-4 w-full">
                        <div class="font-headline font-black italic text-outline-variant/50 text-xl w-6 text-center group-hover:text-primary transition-colors shrink-0">
                            #${rankInCurrentView}
                        </div>
                        
                        <div class="w-14 h-14 rounded-full border border-outline-variant/20 bg-surface-container shrink-0 flex items-center justify-center overflow-hidden">
                            <img src="${photoUrl}" onerror="this.onerror=null; this.src='${getFallbackAvatar(safeName)}';" class="w-full h-full object-cover">
                        </div>
                        
                        <div class="flex-1 min-w-0">
                            ${badgesHtml}
                            <h4 class="font-headline font-black italic uppercase text-on-surface truncate text-sm md:text-base leading-none mb-1 group-hover:text-primary transition-colors">
                                ${safeName}
                            </h4>
                            <p class="text-[10px] font-bold text-outline-variant uppercase tracking-widest">${rawPos}</p>
                        </div>
                    </div>

                    <div class="mt-4 pt-3 border-t border-outline-variant/10 flex items-center justify-between">
                        <span class="text-[10px] font-medium text-outline flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">location_on</span> ${escapeHTML(player.location || 'Unknown')}</span>
                        <div class="flex items-center gap-1">
                            <span class="text-[9px] text-outline font-black uppercase tracking-widest">Score</span>
                            <span class="font-black text-on-surface text-sm">${score}</span>
                        </div>
                    </div>

                </div>
            `;
        });
    }

    if (locFilterSelect) locFilterSelect.addEventListener('change', renderFilteredPlayers);
    if (posFilterSelect) posFilterSelect.addEventListener('change', renderFilteredPlayers);
    if (searchInput) searchInput.addEventListener('input', renderFilteredPlayers);
});
