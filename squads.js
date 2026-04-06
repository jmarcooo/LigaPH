import { auth, db } from './firebase-setup.js';
import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function getFallbackLogo(name) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'S')}&background=20262f&color=ff8f6f`;
}

// Calculate Win Percentage logic (0.0 to 1.0)
function calculateWinRate(squad) {
    const wins = squad.wins || 0;
    const losses = squad.losses || 0;
    const total = wins + losses;
    if (total === 0) return 0;
    return (wins / total);
}

document.addEventListener('DOMContentLoaded', () => {
    const filterSelect = document.getElementById('squad-location-filter');
    const topSquadContainer = document.getElementById('top-squad-container');
    const squadsGrid = document.getElementById('squads-grid');
    const createBtn = document.getElementById('create-squad-btn');
    
    let allSquads = [];

    // Populate City Dropdown from locations.js
    if (filterSelect && window.metroManilaCities) {
        window.metroManilaCities.forEach(city => {
            const opt = document.createElement('option');
            opt.value = city;
            opt.textContent = city;
            opt.className = 'bg-surface-container-high text-on-surface';
            filterSelect.appendChild(opt);
        });
    }

    onAuthStateChanged(auth, (user) => {
        if (createBtn) {
            createBtn.style.display = user ? 'flex' : 'none';
            createBtn.addEventListener('click', () => {
                alert("Squad creation coming soon!");
            });
        }
        loadSquads();
    });

    async function loadSquads() {
        try {
            const squadsRef = collection(db, "squads");
            const q = query(squadsRef); // We pull all, and sort them locally for Win Rate %
            const snap = await getDocs(q);
            
            allSquads = [];
            snap.forEach(doc => {
                allSquads.push({ id: doc.id, ...doc.data() });
            });

            renderFilteredSquads();
        } catch (e) {
            console.error("Error loading squads:", e);
            topSquadContainer.innerHTML = '<p class="text-error text-center py-10">Failed to load squads.</p>';
            squadsGrid.innerHTML = '';
        }
    }

    function renderFilteredSquads() {
        const currentCity = filterSelect.value;
        let filteredSquads = [...allSquads];

        // Filter by City (unless "Metro Manila" is selected)
        if (currentCity !== "Metro Manila") {
            filteredSquads = filteredSquads.filter(s => s.homeCity === currentCity || s.location === currentCity);
        }

        // SMART RANKING: Sort by Win Percentage first, then Fallback to Total Wins if tied
        filteredSquads.sort((a, b) => {
            const wrA = calculateWinRate(a);
            const wrB = calculateWinRate(b);
            
            if (wrB !== wrA) return wrB - wrA; // Highest win rate first
            return (b.wins || 0) - (a.wins || 0); // Tie-breaker: most wins
        });

        renderTopSquad(filteredSquads[0], currentCity);
        renderSquadList(filteredSquads.slice(1));
    }

    function renderTopSquad(squad, city) {
        if (!squad) {
            topSquadContainer.innerHTML = `
                <div class="bg-[#14171d] rounded-3xl p-10 border border-outline-variant/10 shadow-lg flex flex-col items-center justify-center text-center">
                    <span class="material-symbols-outlined text-5xl text-outline-variant/50 mb-4">search_off</span>
                    <h3 class="font-headline text-xl font-black text-on-surface uppercase tracking-widest">No Squads Found</h3>
                    <p class="text-outline-variant text-sm mt-2">Be the first to create a squad in ${city}!</p>
                </div>
            `;
            return;
        }

        const safeName = escapeHTML(squad.name);
        const safeAbbr = escapeHTML(squad.abbreviation);
        const logoUrl = squad.logoUrl ? escapeHTML(squad.logoUrl) : getFallbackLogo(safeName);
        const wins = squad.wins || 0;
        const losses = squad.losses || 0;
        const memberCount = (squad.members || []).length + 1; // +1 for captain
        const winPct = (calculateWinRate(squad) * 100).toFixed(0);

        topSquadContainer.innerHTML = `
            <div class="bg-gradient-to-br from-[#14171d] to-[#0a0e14] rounded-3xl p-6 md:p-10 border border-primary/30 shadow-[0_10px_40px_rgba(255,143,111,0.1)] flex flex-col md:flex-row items-center md:items-start gap-6 md:gap-10 relative overflow-hidden group cursor-pointer transition-transform hover:scale-[1.01]" onclick="window.location.href='squad-details.html?id=${squad.id}'">
                
                <div class="absolute -right-20 -top-20 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none group-hover:bg-primary/20 transition-colors"></div>

                <div class="w-32 h-32 md:w-40 md:h-40 rounded-3xl border border-outline-variant/20 bg-surface-container shrink-0 flex items-center justify-center overflow-hidden z-10 shadow-xl">
                    <img src="${logoUrl}" onerror="this.onerror=null; this.src='${getFallbackLogo(safeName)}';" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                </div>

                <div class="flex-1 w-full text-center md:text-left z-10 flex flex-col justify-center">
                    <div class="flex flex-wrap items-center justify-center md:justify-start gap-3 mb-3">
                        <span class="bg-primary text-on-primary-container px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest shadow-sm">#1 ${city === 'Metro Manila' ? 'GLOBAL' : city.toUpperCase()}</span>
                        <span class="text-[10px] font-bold text-outline uppercase tracking-widest flex items-center gap-1">
                            <span class="material-symbols-outlined text-[14px]">person</span> Capt: ${escapeHTML(squad.captainName || 'Unknown')}
                        </span>
                    </div>

                    <h1 class="font-headline text-3xl md:text-5xl font-black italic tracking-tighter uppercase text-on-surface mb-6 drop-shadow-md">
                        <span class="text-primary">[${safeAbbr}]</span> ${safeName}
                    </h1>

                    <div class="flex flex-wrap justify-center md:justify-start gap-4">
                        <div class="bg-surface-container-highest border border-outline-variant/10 px-5 py-3 rounded-2xl flex flex-col items-center justify-center">
                            <span class="text-[9px] text-outline font-bold uppercase tracking-widest mb-1">Record</span>
                            <span class="font-headline font-black text-xl text-on-surface leading-none">${wins} - ${losses}</span>
                        </div>
                        <div class="bg-surface-container-highest border border-outline-variant/10 px-5 py-3 rounded-2xl flex flex-col items-center justify-center">
                            <span class="text-[9px] text-outline font-bold uppercase tracking-widest mb-1">Win Rate</span>
                            <span class="font-headline font-black text-xl text-primary leading-none">${winPct}%</span>
                        </div>
                        <div class="bg-surface-container-highest border border-outline-variant/10 px-5 py-3 rounded-2xl flex flex-col items-center justify-center">
                            <span class="text-[9px] text-outline font-bold uppercase tracking-widest mb-1">Members</span>
                            <span class="font-headline font-black text-xl text-secondary leading-none">${memberCount}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function renderSquadList(squads) {
        squadsGrid.innerHTML = '';
        
        if (squads.length === 0) {
            squadsGrid.innerHTML = '<div class="col-span-full text-center text-outline-variant py-8 text-sm">No other squads to display.</div>';
            return;
        }

        squads.forEach((squad, index) => {
            const safeName = escapeHTML(squad.name);
            const safeAbbr = escapeHTML(squad.abbreviation);
            const logoUrl = squad.logoUrl ? escapeHTML(squad.logoUrl) : getFallbackLogo(safeName);
            const wins = squad.wins || 0;
            const losses = squad.losses || 0;
            const winPct = (calculateWinRate(squad) * 100).toFixed(0);

            squadsGrid.innerHTML += `
                <div class="bg-[#14171d] rounded-2xl p-4 border border-outline-variant/10 hover:border-primary/30 hover:bg-surface-bright transition-all cursor-pointer shadow-sm flex items-center gap-4 group" onclick="window.location.href='squad-details.html?id=${squad.id}'">
                    <div class="font-headline font-black italic text-outline-variant/50 text-xl w-6 text-center group-hover:text-primary transition-colors">
                        #${index + 2}
                    </div>
                    
                    <div class="w-14 h-14 rounded-xl border border-outline-variant/20 bg-surface-container shrink-0 flex items-center justify-center overflow-hidden">
                        <img src="${logoUrl}" onerror="this.onerror=null; this.src='${getFallbackLogo(safeName)}';" class="w-full h-full object-cover">
                    </div>
                    
                    <div class="flex-1 min-w-0">
                        <h4 class="font-headline font-black italic uppercase text-on-surface truncate text-sm md:text-base mb-1">
                            <span class="text-outline-variant">[${safeAbbr}]</span> ${safeName}
                        </h4>
                        <div class="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-outline">
                            <span>W-L: <span class="text-on-surface">${wins}-${losses}</span></span>
                            <span class="text-primary">${winPct}% WIN</span>
                        </div>
                    </div>
                </div>
            `;
        });
    }

    // Attach Filter Event Listener
    if (filterSelect) {
        filterSelect.addEventListener('change', () => {
            renderFilteredSquads();
        });
    }
});
