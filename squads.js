import { auth, db } from './firebase-setup.js';
import { collection, getDocs, query, orderBy, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
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

function calculateWinRate(squad) {
    const wins = squad.wins || 0;
    const losses = squad.losses || 0;
    const total = wins + losses;
    if (total === 0) return 0;
    return (wins / total);
}

// Hardcoded to guarantee the form never breaks due to a missing locations.js file
const metroManilaCities = [
    "Caloocan", "Las Piñas", "Makati", "Malabon", "Mandaluyong", 
    "Manila", "Marikina", "Muntinlupa", "Navotas", "Parañaque", 
    "Pasay", "Pasig", "Pateros", "Quezon City", "San Juan", "Taguig", "Valenzuela"
];

document.addEventListener('DOMContentLoaded', () => {
    const filterSelect = document.getElementById('squad-location-filter');
    const topSquadContainer = document.getElementById('top-squad-container');
    const squadsGrid = document.getElementById('squads-grid');
    const createBtn = document.getElementById('create-squad-btn');
    
    // Modal Elements
    const createModal = document.getElementById('create-squad-modal');
    const closeModalBtn = document.getElementById('close-squad-modal');
    const createForm = document.getElementById('create-squad-form');
    const squadCityInput = document.getElementById('squad-city-input');
    
    let allSquads = [];

    // 1. Populate Dropdowns safely
    metroManilaCities.forEach(city => {
        if (filterSelect) {
            const opt = document.createElement('option');
            opt.value = city;
            opt.textContent = city;
            opt.className = 'bg-surface-container-high text-on-surface';
            filterSelect.appendChild(opt);
        }
        if (squadCityInput) {
            const optForm = document.createElement('option');
            optForm.value = city;
            optForm.textContent = city;
            optForm.className = 'bg-[#0a0e14] text-on-surface';
            squadCityInput.appendChild(optForm);
        }
    });

    // 2. Setup Modal Open/Close Listeners safely (Outside Auth State)
    if (createBtn && createModal) {
        createBtn.addEventListener('click', () => {
            createModal.classList.remove('hidden');
            createModal.classList.add('flex'); // Fix Tailwind conflict
            setTimeout(() => {
                createModal.classList.remove('opacity-0');
                createModal.querySelector('div').classList.remove('scale-95');
            }, 10);
        });
    }

    if (closeModalBtn && createModal) {
        closeModalBtn.addEventListener('click', () => {
            createModal.classList.add('opacity-0');
            createModal.querySelector('div').classList.add('scale-95');
            setTimeout(() => {
                createModal.classList.add('hidden');
                createModal.classList.remove('flex');
            }, 300);
        });

        createModal.addEventListener('click', (e) => {
            if (e.target === createModal) closeModalBtn.click();
        });
    }

    // 3. Handle Form Submission
    if (createForm) {
        createForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (!auth.currentUser) return alert("You must be logged in to create a squad.");

            const submitBtn = document.getElementById('submit-squad-btn');
            submitBtn.textContent = 'Creating...';
            submitBtn.disabled = true;

            const nameVal = document.getElementById('squad-name-input').value.trim();
            const abbrVal = document.getElementById('squad-abbr-input').value.trim().toUpperCase();
            const cityVal = document.getElementById('squad-city-input').value;
            const logoVal = document.getElementById('squad-logo-input').value.trim();

            try {
                await addDoc(collection(db, "squads"), {
                    name: nameVal,
                    abbreviation: abbrVal,
                    homeCity: cityVal,
                    logoUrl: logoVal || null,
                    captainId: auth.currentUser.uid,
                    captainName: auth.currentUser.displayName || "Unknown Player",
                    wins: 0,
                    losses: 0,
                    members: [], // Array of member UIDs
                    createdAt: serverTimestamp()
                });

                createForm.reset();
                closeModalBtn.click();
                
                submitBtn.innerHTML = `<span>Create Squad</span><span class="material-symbols-outlined text-lg">shield</span>`;
                submitBtn.disabled = false;
                
                loadSquads(); // Refresh the grid!
                
            } catch (error) {
                console.error("Error creating squad:", error);
                alert("Failed to create squad.");
                submitBtn.innerHTML = `<span>Create Squad</span><span class="material-symbols-outlined text-lg">shield</span>`;
                submitBtn.disabled = false;
            }
        });
    }

    // 4. Auth State (Show/Hide FAB)
    onAuthStateChanged(auth, (user) => {
        if (createBtn) {
            if (user) {
                createBtn.classList.remove('hidden');
                createBtn.classList.add('flex');
            } else {
                createBtn.classList.add('hidden');
                createBtn.classList.remove('flex');
            }
        }
        loadSquads();
    });

    async function loadSquads() {
        try {
            const squadsRef = collection(db, "squads");
            const q = query(squadsRef);
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

        if (currentCity !== "Metro Manila") {
            filteredSquads = filteredSquads.filter(s => s.homeCity === currentCity || s.location === currentCity);
        }

        filteredSquads.sort((a, b) => {
            const wrA = calculateWinRate(a);
            const wrB = calculateWinRate(b);
            if (wrB !== wrA) return wrB - wrA; 
            return (b.wins || 0) - (a.wins || 0); 
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
        const memberCount = (squad.members || []).length + 1; 
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
                        
                        <div class="bg-surface-container-highest px-3 py-1 rounded flex items-center gap-1.5 border border-outline-variant/10 shadow-sm">
                            <span class="material-symbols-outlined text-[14px] text-primary">person</span>
                            <span class="text-[10px] font-bold text-on-surface uppercase tracking-widest">Capt: ${escapeHTML(squad.captainName || 'Unknown Player')}</span>
                        </div>
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
                <div class="bg-[#14171d] rounded-2xl p-5 border border-outline-variant/10 hover:border-primary/30 hover:bg-surface-bright transition-all cursor-pointer shadow-sm flex flex-col group" onclick="window.location.href='squad-details.html?id=${squad.id}'">
                    
                    <div class="flex items-center gap-4 w-full">
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

                    <div class="mt-4 pt-3 border-t border-outline-variant/10 flex items-center gap-2">
                        <div class="w-5 h-5 rounded-full bg-surface-container-high flex items-center justify-center text-outline shadow-sm">
                            <span class="material-symbols-outlined text-[12px]">person</span>
                        </div>
                        <span class="text-[10px] font-medium text-outline-variant">CAPTAIN: <span class="text-on-surface font-bold uppercase tracking-widest">${escapeHTML(squad.captainName || 'Unknown Player')}</span></span>
                    </div>

                </div>
            `;
        });
    }

    if (filterSelect) {
        filterSelect.addEventListener('change', () => {
            renderFilteredSquads();
        });
    }
});
