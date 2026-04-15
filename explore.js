import { auth, db } from './firebase-setup.js';
import { collection, addDoc, getDocs, query, where, serverTimestamp, doc, getDoc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";

// --- UTILS ---
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

// --- GLOBAL STATE ---
let currentUserData = null;
let allSquads = [];
let allPlayers = [];

// --- TAB SWITCHING LOGIC ---
document.addEventListener('DOMContentLoaded', () => {
    const tabSquads = document.getElementById('tab-squads');
    const tabPlayers = document.getElementById('tab-players');
    const viewSquads = document.getElementById('view-squads');
    const viewPlayers = document.getElementById('view-players');
    const fabButton = document.getElementById('create-squad-btn');

    function switchTab(tab) {
        if (tab === 'squads') {
            if(tabSquads) {
                tabSquads.classList.replace('border-transparent', 'border-primary');
                tabSquads.classList.replace('text-on-surface-variant', 'text-primary');
            }
            if(tabPlayers) {
                tabPlayers.classList.replace('border-primary', 'border-transparent');
                tabPlayers.classList.replace('text-primary', 'text-on-surface-variant');
            }
            if(viewSquads) viewSquads.classList.remove('hidden');
            if(viewPlayers) viewPlayers.classList.add('hidden');
            
            if (fabButton) {
                fabButton.classList.remove('hidden');
                fabButton.classList.add('flex');
            }
        } else {
            if(tabPlayers) {
                tabPlayers.classList.replace('border-transparent', 'border-primary');
                tabPlayers.classList.replace('text-on-surface-variant', 'text-primary');
            }
            if(tabSquads) {
                tabSquads.classList.replace('border-primary', 'border-transparent');
                tabSquads.classList.replace('text-primary', 'text-on-surface-variant');
            }
            if(viewPlayers) viewPlayers.classList.remove('hidden');
            if(viewSquads) viewSquads.classList.add('hidden');
            
            if (fabButton) {
                fabButton.classList.remove('flex');
                fabButton.classList.add('hidden');
            }
        }
    }

    if (tabSquads) tabSquads.addEventListener('click', () => switchTab('squads'));
    if (tabPlayers) tabPlayers.addEventListener('click', () => switchTab('players'));

    // Populate City Dropdowns dynamically
    const citiesToLoad = window.metroManilaCities || [
        "Caloocan City", "Las Piñas City", "Makati City", "Malabon City", "Mandaluyong City", 
        "Manila City", "Marikina City", "Muntinlupa City", "Navotas City", "Parañaque City", 
        "Pasay City", "Pasig City", "Municipality of Pateros", "Quezon City", "San Juan City", "Taguig City", "Valenzuela City"
    ];

    const squadCityInput = document.getElementById('squad-city-input');
    const squadLocFilter = document.getElementById('squad-location-filter');
    const playerLocFilter = document.getElementById('player-location-filter'); // Assuming you add this to explore.html

    citiesToLoad.forEach(city => {
        if(squadCityInput) squadCityInput.appendChild(new Option(city, city));
        
        if (squadLocFilter) {
            const opt = new Option(city, city);
            opt.className = 'bg-[#0a0e14] text-on-surface';
            squadLocFilter.appendChild(opt);
        }

        if (playerLocFilter) {
            const opt = new Option(city, city);
            opt.className = 'bg-[#0a0e14] text-on-surface';
            playerLocFilter.appendChild(opt);
        }
    });

    // INIT AUTH & DATA
    onAuthStateChanged(auth, (user) => {
        currentUserData = user;
        loadSquads();
        loadPlayers();
    });

    // --- EXPLORE SQUADS LOGIC ---
    
    // Squad Search & Filter Listeners
    const squadSearch = document.getElementById('explore-search-input'); // Re-using top search
    if (squadSearch) squadSearch.addEventListener('input', renderFilteredSquads);
    if (squadLocFilter) squadLocFilter.addEventListener('change', renderFilteredSquads);

    async function loadSquads() {
        try {
            const querySnapshot = await getDocs(collection(db, "squads"));
            allSquads = [];
            querySnapshot.forEach((doc) => {
                allSquads.push({ id: doc.id, ...doc.data() });
            });

            renderMySquad();
            renderFilteredSquads();
        } catch (error) {
            console.error("Error loading squads:", error);
        }
    }

    function renderMySquad() {
        const mySquadContainer = document.getElementById('my-squad-container');
        if (!mySquadContainer) return;

        if (!currentUserData) {
            mySquadContainer.innerHTML = `
                <div class="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/10 text-center flex flex-col items-center justify-center shadow-sm">
                    <span class="material-symbols-outlined text-3xl text-outline-variant mb-2">login</span>
                    <p class="text-sm font-medium text-on-surface-variant">Log in to view your squad.</p>
                </div>
            `;
            return;
        }

        const mySquad = allSquads.find(s => s.members && s.members.includes(currentUserData.uid));

        if (!mySquad) {
            mySquadContainer.innerHTML = `
                <div class="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/10 text-center flex flex-col items-center justify-center shadow-sm">
                    <span class="material-symbols-outlined text-3xl text-outline-variant mb-2">group_off</span>
                    <p class="text-sm font-medium text-on-surface-variant">You are a Free Agent. Join or create a squad!</p>
                </div>
            `;
            return;
        }

        const logoUrl = mySquad.logoUrl || getFallbackLogo(mySquad.name);
        const memberCount = mySquad.members ? mySquad.members.length : 0;
        
        mySquadContainer.innerHTML = `
            <div class="bg-gradient-to-r from-[#14171d] to-surface-container-low rounded-2xl p-4 md:p-5 border border-tertiary/40 shadow-[0_4px_20px_rgba(202,165,255,0.1)] hover:brightness-110 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 group" onclick="window.location.href='squad-details.html?id=${mySquad.id}'">
                <div class="flex items-center gap-4 flex-1 min-w-0">
                    <div class="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-surface-container shrink-0 flex items-center justify-center overflow-hidden shadow-sm group-hover:scale-105 transition-transform">
                        <img src="${logoUrl}" class="w-full h-full object-cover">
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="bg-tertiary/20 text-tertiary border border-tertiary/20 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest shadow-sm">YOUR SQUAD</span>
                            ${mySquad.privacy === 'approval' ? `<span class="bg-surface-container-highest px-2 py-0.5 rounded border border-outline-variant/10 text-[9px] font-black text-outline uppercase tracking-widest"><span class="material-symbols-outlined text-[10px] align-middle">lock</span> Private</span>` : ''}
                        </div>
                        <h4 class="font-headline font-black italic uppercase text-on-surface truncate text-lg md:text-xl group-hover:text-tertiary transition-colors">${escapeHTML(mySquad.name)}</h4>
                        <p class="text-[10px] text-outline font-bold uppercase tracking-widest flex items-center gap-1 mt-1 truncate">
                            <span class="material-symbols-outlined text-[12px]">location_on</span> ${escapeHTML(mySquad.city)} • ${escapeHTML(mySquad.skillLevel)}
                        </p>
                    </div>
                </div>
                <div class="flex items-center gap-4 shrink-0 sm:border-l sm:border-outline-variant/10 sm:pl-4 pt-3 sm:pt-0 border-t border-outline-variant/10 sm:border-t-0 mt-3 sm:mt-0">
                    <div class="text-center">
                        <p class="font-black text-on-surface text-lg leading-none">${memberCount}</p>
                        <p class="text-[8px] text-outline font-bold uppercase tracking-widest mt-1">Roster</p>
                    </div>
                    <div class="text-center">
                        <p class="font-black text-primary text-lg leading-none">0-0</p>
                        <p class="text-[8px] text-outline font-bold uppercase tracking-widest mt-1">Record</p>
                    </div>
                </div>
            </div>
        `;
    }

    function renderFilteredSquads() {
        const topSquadsContainer = document.getElementById('top-squad-container');
        const squadsGrid = document.getElementById('squads-grid');
        if(!topSquadsContainer || !squadsGrid) return;

        const currentCity = squadLocFilter ? squadLocFilter.value : "Metro Manila";
        const searchTerm = squadSearch ? squadSearch.value.toLowerCase() : "";

        let filtered = [...allSquads];

        if (currentCity !== "Metro Manila") {
            filtered = filtered.filter(s => s.city === currentCity);
        }

        if (searchTerm) {
            filtered = filtered.filter(s => 
                (s.name && s.name.toLowerCase().includes(searchTerm)) || 
                (s.abbr && s.abbr.toLowerCase().includes(searchTerm))
            );
        }

        // Top 3 Squads (For now, sort by member count as proxy for activity)
        filtered.sort((a, b) => {
            const aCount = a.members ? a.members.length : 0;
            const bCount = b.members ? b.members.length : 0;
            return bCount - aCount;
        });

        const top3 = filtered.slice(0, 3);
        const rest = filtered.slice(3);

        // RENDER TOP 3
        if (top3.length === 0) {
            topSquadsContainer.innerHTML = `
                <div class="bg-[#14171d] rounded-3xl p-10 border border-outline-variant/10 shadow-lg flex flex-col items-center justify-center text-center">
                    <span class="material-symbols-outlined text-5xl text-outline-variant/50 mb-4">search_off</span>
                    <h3 class="font-headline text-xl font-black text-on-surface uppercase tracking-widest">No Squads Found</h3>
                    <p class="text-outline-variant text-sm mt-2">Be the first to create a squad in ${currentCity}!</p>
                </div>
            `;
        } else {
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

        // RENDER REST (GRID)
        squadsGrid.innerHTML = '';
        if (rest.length === 0 && top3.length > 0) {
            squadsGrid.innerHTML = '<div class="col-span-full text-center text-outline-variant py-8 text-sm italic">No other squads found.</div>';
            return;
        }

        rest.forEach(squad => {
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
    }

    // CREATE SQUAD MODAL LOGIC
    const createSquadBtn = document.getElementById('create-squad-btn');
    const createModal = document.getElementById('create-squad-modal');
    const closeModalBtn = document.getElementById('close-squad-modal');
    const createForm = document.getElementById('create-squad-form');
    
    if (createSquadBtn && createModal) {
        createSquadBtn.addEventListener('click', () => {
            if (!currentUserData) return alert("Please log in to create a squad.");
            createModal.classList.remove('hidden');
            createModal.classList.add('flex');
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
    }

    // Logo preview logic
    const logoInput = document.getElementById('squad-logo-input');
    const logoPreview = document.getElementById('squad-logo-preview');
    const logoPlaceholder = document.getElementById('squad-logo-placeholder');

    if (logoInput) {
        logoInput.addEventListener('change', function() {
            if (this.files && this.files[0]) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    if(logoPreview) {
                        logoPreview.src = e.target.result;
                        logoPreview.classList.remove('hidden');
                    }
                    if(logoPlaceholder) logoPlaceholder.classList.add('hidden');
                }
                reader.readAsDataURL(this.files[0]);
            }
        });
    }

    if (createForm) {
        createForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentUserData) return alert("Must be logged in.");

            const submitBtn = document.getElementById('submit-squad-btn');
            const originalBtnText = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<span class="material-symbols-outlined animate-spin">refresh</span> Creating...`;

            try {
                let logoUrl = null;
                if (logoInput && logoInput.files.length > 0) {
                    const file = logoInput.files[0];
                    const storageRef = ref(storage, `squad_logos/${Date.now()}_${file.name}`);
                    const snapshot = await uploadBytes(storageRef, file);
                    logoUrl = await getDownloadURL(snapshot.ref);
                }

                const userDocRef = doc(db, "users", currentUserData.uid);
                const userSnap = await getDoc(userDocRef);
                let currentSquad = null;
                if(userSnap.exists()) {
                    currentSquad = userSnap.data().squadId;
                }

                if(currentSquad) {
                    alert("You are already in a squad. Leave your current squad first.");
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnText;
                    return;
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
                
                await updateDoc(userDocRef, {
                    squadId: docRef.id,
                    squadName: newSquad.name,
                    squadAbbr: newSquad.abbr
                });

                alert("Squad created!");
                if(closeModalBtn) closeModalBtn.click();
                createForm.reset();
                if(logoPreview) {
                    logoPreview.src = '';
                    logoPreview.classList.add('hidden');
                }
                if(logoPlaceholder) logoPlaceholder.classList.remove('hidden');
                
                loadSquads();
            } catch (error) {
                console.error("Error creating squad: ", error);
                alert("Failed to create squad.");
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }
        });
    }

    // --- EXPLORE PLAYERS LOGIC ---

    function calculatePlayerScore(player) {
        const attended = player.gamesAttended || 0;
        const missed = player.gamesMissed || 0;
        const totalGames = attended + missed;
        const reliabilityMultiplier = totalGames === 0 ? 1 : (attended / totalGames);
        
        let statsAvg = 0;
        if (player.selfRatings) {
            const sr = player.selfRatings;
            const total = (sr.shooting || 0) + (sr.passing || 0) + (sr.dribbling || 0) + (sr.rebounding || 0) + (sr.defense || 0);
            statsAvg = total / 5;
        }

        const props = player.commendations || 0;
        const activityScore = (attended * 50) * reliabilityMultiplier; 
        const propsScore = props * 15;
        const skillScore = statsAvg * 5;

        return Math.round(activityScore + propsScore + skillScore);
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

                allPlayers.push({ 
                    id, 
                    ...data,
                    gamesPlayed,
                    reliability,
                    commendations: commendationCounts[id] || 0,
                    connections: connectionCounts[id] || 0
                });
            });

            allPlayers.forEach(p => p.score = calculatePlayerScore(p));
            allPlayers.sort((a, b) => b.score - a.score);
            allPlayers.forEach((p, idx) => p.globalRank = idx + 1);

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

            renderFilteredPlayers();

        } catch (e) {
            console.error("Error loading players:", e);
        }
    }

    function renderFilteredPlayers() {
        const playersGrid = document.getElementById('players-grid');
        if(!playersGrid) return;

        // Note: For now we just dump them in the grid, but you could add filters 
        // to explore.html later and plug them in here exactly like squads!
        const searchTerm = squadSearch ? squadSearch.value.toLowerCase() : "";

        let filteredPlayers = [...allPlayers];

        if (searchTerm) {
            filteredPlayers = filteredPlayers.filter(p => 
                (p.displayName && p.displayName.toLowerCase().includes(searchTerm)) || 
                (p.squadAbbr && p.squadAbbr.toLowerCase().includes(searchTerm))
            );
        }

        playersGrid.innerHTML = '';
        
        if (filteredPlayers.length === 0) {
            playersGrid.innerHTML = '<div class="col-span-full text-center text-outline-variant py-8 text-sm italic">No players found.</div>';
            return;
        }

        filteredPlayers.forEach((player) => {
            const safeName = escapeHTML(player.displayName || 'Unknown');
            const photoUrl = player.photoURL ? escapeHTML(player.photoURL) : getFallbackAvatar(safeName);
            const rawPos = player.primaryPosition || 'Unassigned';
            const fullPos = posMap[rawPos] || rawPos;

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
    }
});
