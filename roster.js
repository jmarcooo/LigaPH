import { auth, db, storage } from './firebase-setup.js';
import { collection, getDocs, query, addDoc, serverTimestamp, where, setDoc, doc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";

// --- UTILITY FUNCTIONS ---
function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function getFallbackLogo(name) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'S')}&background=20262f&color=ff8f6f`;
}

function getFallbackAvatar(name) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'P')}&background=20262f&color=ff8f6f`;
}

function calculateWinRate(squad) {
    const wins = squad.wins || 0;
    const losses = squad.losses || 0;
    const total = wins + losses;
    if (total === 0) return 0;
    return (wins / total);
}

function calculateSquadScore(squad) {
    const wins = squad.wins || 0;
    const losses = squad.losses || 0;
    let score = (wins * 50) - (losses * 15);
    return score < 0 ? 0 : score;
}

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

function resizeAndCropImage(file, targetSize = 300) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = targetSize;
            canvas.height = targetSize;
            const size = Math.min(img.width, img.height);
            const startX = (img.width - size) / 2;
            const startY = (img.height - size) / 2;
            ctx.drawImage(img, startX, startY, size, size, 0, 0, targetSize, targetSize);
            canvas.toBlob((blob) => {
                if (blob) {
                    blob.name = file.name || 'squad_logo.jpg'; 
                    resolve(blob);
                } else {
                    reject(new Error("Canvas optimization failed"));
                }
            }, file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.9); 
        };
        img.onerror = () => reject(new Error("Failed to load image for resizing"));
        img.src = URL.createObjectURL(file);
    });
}

function uploadSquadLogo(file, squadName) {
    return new Promise((resolve, reject) => {
        const safeName = squadName.replace(/[^a-zA-Z0-9.]/g, '_');
        const storageRef = ref(storage, `squads/${Date.now()}_${safeName}`);
        const uploadTask = uploadBytesResumable(storageRef, file);
        uploadTask.on('state_changed',
            (snapshot) => {}, 
            (error) => reject(error),
            async () => {
                try {
                    const url = await getDownloadURL(uploadTask.snapshot.ref);
                    resolve(url);
                } catch (e) { reject(e); }
            }
        );
    });
}

const citiesToLoad = window.metroManilaCities || [
    "Caloocan City", "Las Piñas City", "Makati City", "Malabon City", "Mandaluyong City", 
    "Manila City", "Marikina City", "Muntinlupa City", "Navotas City", "Parañaque City", 
    "Pasay City", "Pasig City", "Municipality of Pateros", "Quezon City", "San Juan City", "Taguig City", "Valenzuela City"
];

const posMap = {
    'PG': 'Point Guard',
    'SG': 'Shooting Guard',
    'SF': 'Small Forward',
    'PF': 'Power Forward',
    'C': 'Center'
};


document.addEventListener('DOMContentLoaded', () => {

    // --- TAB LOGIC ---
    const tabSquadsBtn = document.getElementById('tab-squads');
    const tabPlayersBtn = document.getElementById('tab-players');
    
    const squadsView = document.getElementById('squads-view');
    const playersView = document.getElementById('players-view');
    const createBtn = document.getElementById('create-squad-btn'); // Now inline in DOM
    
    let currentTab = 'squads'; 

    function switchTab(target) {
        currentTab = target;
        if (target === 'squads') {
            tabSquadsBtn.className = 'flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl bg-primary text-[#0a0e14] shadow-md transition-all active:scale-95';
            tabPlayersBtn.className = 'flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl text-outline-variant hover:text-white transition-all active:scale-95';
            
            playersView.classList.add('hidden', 'opacity-0');
            squadsView.classList.remove('hidden');
            setTimeout(() => squadsView.classList.remove('opacity-0'), 50);
            
            searchInput.placeholder = "Search by name, abbr, or location...";
            renderFilteredSquads();
            
        } else {
            tabPlayersBtn.className = 'flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl bg-primary text-[#0a0e14] shadow-md transition-all active:scale-95';
            tabSquadsBtn.className = 'flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl text-outline-variant hover:text-white transition-all active:scale-95';
            
            squadsView.classList.add('hidden', 'opacity-0');
            playersView.classList.remove('hidden');
            setTimeout(() => playersView.classList.remove('opacity-0'), 50);
            
            searchInput.placeholder = "Search players by name...";
            renderFilteredPlayers();
        }
    }

    tabSquadsBtn.addEventListener('click', () => switchTab('squads'));
    tabPlayersBtn.addEventListener('click', () => switchTab('players'));


    // --- SHARED ELEMENTS ---
    const locFilterSelect = document.getElementById('roster-location-filter');
    const searchInput = document.getElementById('roster-search-input');

    // --- SQUADS ELEMENTS ---
    const mySquadContainer = document.getElementById('my-squad-container');
    const topSquadContainer = document.getElementById('top-squad-container');
    const squadsGrid = document.getElementById('squads-grid');
    
    const createModal = document.getElementById('create-squad-modal');
    const closeModalBtn = document.getElementById('close-squad-modal');
    const createForm = document.getElementById('create-squad-form');
    const squadCityInput = document.getElementById('squad-city-input');
    const logoInput = document.getElementById('squad-logo-input');
    const logoPreview = document.getElementById('squad-logo-preview');
    const logoPlaceholder = document.getElementById('squad-logo-placeholder');
    let selectedLogoFile = null;

    // --- PLAYERS ELEMENTS ---
    const myProfileContainer = document.getElementById('my-profile-container');
    const topPlayersContainer = document.getElementById('top-players-container');
    const playersGrid = document.getElementById('players-grid');

    // --- STATE ---
    let allSquads = [];
    let userHasSquad = false;
    let mySquadData = null;
    
    let allPlayers = [];
    let currentUserData = null;

    // Populate City Dropdowns
    citiesToLoad.forEach(city => {
        if (locFilterSelect) {
            const opt = document.createElement('option');
            opt.value = city;
            opt.textContent = city;
            opt.className = 'bg-surface-container-high text-white';
            locFilterSelect.appendChild(opt);
        }
        if (squadCityInput) {
            const optForm = document.createElement('option');
            optForm.value = city;
            optForm.textContent = city;
            optForm.className = 'bg-[#0a0e14] text-white';
            squadCityInput.appendChild(optForm);
        }
    });

    // --- AUTH LISTENER ---
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUserData = user;
            await checkUserSquadStatus(user.uid);
            loadSquads();
            loadPlayers();
        } else {
            currentUserData = null;
            userHasSquad = false;
            mySquadData = null;
            if (createBtn) createBtn.style.display = 'none';
            renderUnauthRosters();
        }
    });

    function renderUnauthRosters() {
        const lockScreenHTML = `
            <div class="flex flex-col items-center justify-center py-24 opacity-90">
                <span class="material-symbols-outlined text-6xl mb-4 text-outline-variant drop-shadow-md">lock</span>
                <h2 class="text-2xl font-black uppercase tracking-widest text-white mb-2">Login Required</h2>
                <p class="text-sm text-on-surface-variant mb-6 text-center max-w-sm">Sign in to browse squads, view top players, and access detailed roster stats.</p>
                <button onclick="window.location.href='index.html'" class="bg-primary hover:brightness-110 text-[#0a0e14] px-8 py-3.5 rounded-xl font-headline font-black uppercase text-sm tracking-widest shadow-lg active:scale-95 transition-all">Login to View</button>
            </div>
        `;
        
        if (document.getElementById('squads-view')) document.getElementById('squads-view').innerHTML = lockScreenHTML;
        if (document.getElementById('players-view')) document.getElementById('players-view').innerHTML = lockScreenHTML;
        
        if (searchInput) searchInput.disabled = true;
        if (locFilterSelect) locFilterSelect.disabled = true;
    }

    // ==========================================
    // SQUADS LOGIC
    // ==========================================

    async function checkUserSquadStatus(uid) {
        try {
            const captQ = query(collection(db, "squads"), where("captainId", "==", uid));
            const captSnap = await getDocs(captQ);
            
            const memQ = query(collection(db, "squads"), where("members", "array-contains", uid));
            const memSnap = await getDocs(memQ);

            if (!captSnap.empty) {
                mySquadData = { id: captSnap.docs[0].id, ...captSnap.docs[0].data() };
                userHasSquad = true;
            } else if (!memSnap.empty) {
                mySquadData = { id: memSnap.docs[0].id, ...memSnap.docs[0].data() };
                userHasSquad = true;
            } else {
                mySquadData = null;
                userHasSquad = false;
            }
            renderMySquad();
            
            // Toggle Inline Create Squad Button
            if (createBtn) {
                if (userHasSquad) {
                    createBtn.style.display = 'none';
                } else {
                    createBtn.style.display = 'flex';
                }
            }
        } catch (e) {
            console.error("Error checking squad status", e);
        }
    }

    async function loadSquads() {
        try {
            const squadsRef = collection(db, "squads");
            const snap = await getDocs(squadsRef);
            
            allSquads = [];
            snap.forEach(doc => {
                allSquads.push({ id: doc.id, ...doc.data() });
            });

            allSquads.forEach(s => s.squadScore = calculateSquadScore(s));
            allSquads.sort((a, b) => b.squadScore - a.squadScore);
            allSquads.forEach((s, idx) => s.globalRank = idx + 1);

            const cityMap = {};
            allSquads.forEach(s => {
                const c = s.homeCity;
                if(c) {
                    if(!cityMap[c]) cityMap[c] = [];
                    cityMap[c].push(s);
                }
            });
            
            Object.keys(cityMap).forEach(city => {
                cityMap[city].sort((a, b) => b.squadScore - a.squadScore);
                cityMap[city].forEach((s, idx) => s.cityRank = idx + 1);
            });

            renderFilteredSquads();
        } catch (e) {
            console.error("Error loading squads:", e);
            if (topSquadContainer) topSquadContainer.innerHTML = '<p class="text-error text-center py-10">Failed to load squads.</p>';
            if (squadsGrid) squadsGrid.innerHTML = '';
        }
    }

    function renderFilteredSquads() {
        if (currentTab !== 'squads') return;

        const currentCity = locFilterSelect.value;
        const searchTerm = searchInput ? searchInput.value.toLowerCase() : "";
        let filteredSquads = [...allSquads];

        if (currentCity !== "Metro Manila") {
            filteredSquads = filteredSquads.filter(s => s.homeCity === currentCity || s.location === currentCity);
        }

        if (searchTerm) {
            filteredSquads = filteredSquads.filter(s => 
                (s.name && s.name.toLowerCase().includes(searchTerm)) || 
                (s.abbreviation && s.abbreviation.toLowerCase().includes(searchTerm))
            );
        }

        filteredSquads.sort((a, b) => b.squadScore - a.squadScore);

        renderTopSquads(filteredSquads.slice(0, 3), currentCity);
        renderSquadList(filteredSquads); 
    }

    function renderMySquad() {
        if (!mySquadContainer) return;

        if (!auth.currentUser) return; // Handled by renderUnauthRosters

        if (!userHasSquad || !mySquadData) {
            // Keep the elegant missing slot state mapped to the button
            mySquadContainer.innerHTML = `
                <div class="bg-gradient-to-r from-[#14171d] to-[#0a0e14] border border-outline-variant/20 border-dashed rounded-[24px] p-8 md:p-10 flex flex-col md:flex-row items-center justify-between gap-6 w-full group hover:border-primary/50 transition-colors">
                    <div class="flex items-center gap-6 w-full md:w-auto">
                        <div class="w-16 h-16 rounded-2xl bg-surface-container-highest/50 flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                            <span class="material-symbols-outlined text-3xl text-outline-variant group-hover:text-primary transition-colors">add_moderator</span>
                        </div>
                        <div>
                            <h3 class="font-headline text-xl font-black italic uppercase text-white mb-1 group-hover:text-primary transition-colors">No Active Squad</h3>
                            <p class="text-xs text-outline-variant font-medium">Join an existing team or build your own dynasty.</p>
                        </div>
                    </div>
                    <div class="flex gap-3 w-full md:w-auto shrink-0">
                        <button class="flex-1 md:flex-none bg-surface-container-highest hover:bg-surface-container-high text-white px-6 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors active:scale-95">Find Team</button>
                        <button onclick="document.getElementById('create-squad-btn').click()" class="flex-1 md:flex-none bg-primary text-[#0a0e14] px-6 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:brightness-110 transition-all active:scale-95">Create Squad</button>
                    </div>
                </div>
            `;
            return;
        }

        const safeName = escapeHTML(mySquadData.name);
        const safeAbbr = escapeHTML(mySquadData.abbreviation);
        const logoUrl = mySquadData.logoUrl ? escapeHTML(mySquadData.logoUrl) : getFallbackLogo(safeName);
        const wins = mySquadData.wins || 0;
        const losses = mySquadData.losses || 0;
        const winPct = (calculateWinRate(mySquadData) * 100).toFixed(0);
        
        const roleBadge = mySquadData.captainId === auth.currentUser.uid 
            ? '<span class="px-3 py-1 bg-primary/20 text-primary rounded-lg text-[9px] font-black uppercase tracking-widest border border-primary/20">Captain</span>'
            : '<span class="px-3 py-1 bg-secondary/20 text-secondary rounded-lg text-[9px] font-black uppercase tracking-widest border border-secondary/20">Member</span>';

        mySquadContainer.innerHTML = `
            <div class="bg-gradient-to-r from-[#14171d] to-[#0a0e14] rounded-[24px] p-6 border border-tertiary/40 shadow-[0_4px_30px_rgba(202,165,255,0.1)] hover:border-tertiary transition-colors cursor-pointer flex flex-col md:flex-row items-start md:items-center gap-6 group" onclick="window.location.href='squad-details.html?id=${mySquadData.id}'">
                <div class="flex items-center gap-5 w-full md:w-auto">
                    <div class="w-20 h-20 rounded-2xl border-2 border-tertiary/40 bg-surface-container shrink-0 flex items-center justify-center overflow-hidden shadow-lg group-hover:scale-105 transition-transform">
                        <img src="${logoUrl}" onerror="this.onerror=null; this.src='${getFallbackLogo(safeName)}';" class="w-full h-full object-cover">
                    </div>
                    <div class="flex-1 min-w-0">
                        <h4 class="font-headline font-black italic uppercase text-white truncate text-xl md:text-2xl mb-1.5 leading-tight">
                            <span class="text-tertiary">[${safeAbbr}]</span> ${safeName}
                        </h4>
                        <div class="flex flex-wrap items-center gap-3">
                            ${roleBadge}
                            <p class="text-[10px] text-outline font-bold uppercase tracking-widest flex items-center gap-1">
                                <span class="material-symbols-outlined text-[14px]">location_on</span> ${escapeHTML(mySquadData.homeCity || 'Anywhere')}
                            </p>
                        </div>
                    </div>
                </div>

                <div class="flex gap-4 w-full md:w-auto md:ml-auto border-t md:border-t-0 border-outline-variant/10 pt-4 md:pt-0 shrink-0">
                    <div class="text-center bg-surface-container-highest/50 px-4 py-3 rounded-xl border border-outline-variant/10 flex-1 md:flex-none">
                        <p class="font-black text-white text-lg leading-none mb-1">${wins}-${losses}</p>
                        <p class="text-[9px] text-outline font-bold uppercase tracking-widest">Record</p>
                    </div>
                    <div class="text-center bg-surface-container-highest/50 px-4 py-3 rounded-xl border border-outline-variant/10 flex-1 md:flex-none">
                        <p class="font-black text-primary text-lg leading-none mb-1">${winPct}%</p>
                        <p class="text-[9px] text-outline font-bold uppercase tracking-widest">Win Rate</p>
                    </div>
                </div>
            </div>
        `;
    }

    function renderTopSquads(topSquads, city) {
        if (!topSquadContainer) return;
        if (topSquads.length === 0) {
            topSquadContainer.innerHTML = `
                <div class="bg-[#14171d] rounded-3xl p-10 border border-outline-variant/10 shadow-lg flex flex-col items-center justify-center text-center">
                    <span class="material-symbols-outlined text-5xl text-outline-variant/50 mb-4">shield</span>
                    <h3 class="font-headline text-xl font-black text-on-surface uppercase tracking-widest">No Squads Found</h3>
                    <p class="text-outline-variant text-sm mt-2">Adjust your filters or create a squad in ${city}!</p>
                </div>
            `;
            return;
        }

        // Podium Logic Array Reordering (Visual: 2, 1, 3)
        let podiumArr = [];
        if (topSquads.length === 1) {
            podiumArr = [null, topSquads[0], null];
        } else if (topSquads.length === 2) {
            podiumArr = [topSquads[1], topSquads[0], null];
        } else {
            podiumArr = [topSquads[1], topSquads[0], topSquads[2]];
        }

        let html = '<div class="flex flex-col md:flex-row items-end justify-center gap-6 md:gap-4 lg:gap-6 mt-12 md:mt-20">';

        podiumArr.forEach((squad, i) => {
            if (!squad) {
                // Empty Podium slot placeholder to keep alignment
                html += `<div class="hidden md:flex w-1/3 opacity-0"></div>`;
                return;
            }

            // Real rank mapped from original array
            const rank = topSquads.findIndex(s => s.id === squad.id) + 1;
            const isFirstPlace = rank === 1; 
            
            const safeName = escapeHTML(squad.name);
            const safeAbbr = escapeHTML(squad.abbreviation);
            const logoUrl = squad.logoUrl ? escapeHTML(squad.logoUrl) : getFallbackLogo(safeName);
            const wins = squad.wins || 0;
            const losses = squad.losses || 0;

            const podiumClass = `podium-${rank}`;
            const orderClass = rank === 1 ? 'order-1 md:order-2 z-20 md:-translate-y-8 h-64' : (rank === 2 ? 'order-2 md:order-1 h-56' : 'order-3 md:order-3 h-52');
            const bgClass = rank === 1 ? 'bg-[#1a1d24] shadow-2xl' : 'bg-[#14171d] shadow-lg';
            const avatarSize = rank === 1 ? 'w-28 h-28 -top-14' : 'w-20 h-20 -top-10';
            
            let badgeHtml = '';
            if (rank === 1) badgeHtml = `<div class="absolute -top-16 bg-[#FFD700] text-[#0a0e14] px-3 py-1 rounded-full font-black flex items-center justify-center text-xs shadow-[0_0_20px_rgba(255,215,0,0.5)] tracking-widest border-2 border-white/20 z-20">👑 RANK 1</div>`;
            else if (rank === 2) badgeHtml = `<div class="absolute -top-12 -left-2 w-8 h-8 rounded-full bg-[#C0C0C0] text-[#0a0e14] font-black flex items-center justify-center text-sm shadow-lg z-20">2</div>`;
            else if (rank === 3) badgeHtml = `<div class="absolute -top-12 -right-2 w-8 h-8 rounded-full bg-[#CD7F32] text-white font-black flex items-center justify-center text-sm shadow-lg z-20">3</div>`;

            html += `
                <div class="w-full md:w-1/3 ${orderClass} rounded-[28px] ${bgClass} ${podiumClass} relative flex flex-col items-center p-6 cursor-pointer group hover:scale-[1.02] transition-transform" onclick="window.location.href='squad-details.html?id=${squad.id}'">
                    
                    ${badgeHtml}
                    <div class="absolute ${avatarSize} rounded-[24px] bg-surface-container border-4 border-[#0a0e14] overflow-hidden shadow-xl z-10 group-hover:border-primary/50 transition-colors">
                        <img src="${logoUrl}" onerror="this.onerror=null; this.src='${getFallbackLogo(safeName)}';" class="w-full h-full object-cover">
                    </div>

                    <div class="mt-12 md:mt-16 w-full text-center flex flex-col items-center">
                        <h3 class="font-headline font-black italic uppercase text-white leading-tight ${isFirstPlace ? 'text-xl md:text-2xl' : 'text-lg'} mb-1 group-hover:text-primary transition-colors">
                            <span class="text-outline-variant/70">[${safeAbbr}]</span> <br/>${safeName}
                        </h3>
                        <p class="text-[10px] text-outline-variant font-bold uppercase tracking-widest mb-4">${wins}W - ${losses}L</p>
                        
                        <div class="bg-[#0a0e14]/50 border border-outline-variant/10 rounded-xl px-4 py-2 w-full max-w-[140px]">
                            <p class="text-[8px] text-outline font-bold uppercase tracking-widest mb-0.5">Rating</p>
                            <p class="font-black text-primary text-sm">${squad.squadScore || 0} PTS</p>
                        </div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        topSquadContainer.innerHTML = html;
    }

    function renderSquadList(squads) {
        if (!squadsGrid) return;
        squadsGrid.innerHTML = '';
        
        if (squads.length === 0) {
            squadsGrid.innerHTML = '<div class="col-span-full text-center text-outline-variant py-8 text-sm">No other squads match your search.</div>';
            return;
        }

        // Render everything from Rank 4 downwards (since 1-3 are in the podium)
        const lowerSquads = squads.slice(3);

        lowerSquads.forEach((squad, index) => {
            const rank = index + 4; 
            const safeName = escapeHTML(squad.name);
            const safeAbbr = escapeHTML(squad.abbreviation);
            const logoUrl = squad.logoUrl ? escapeHTML(squad.logoUrl) : getFallbackLogo(safeName);
            const wins = squad.wins || 0;
            const losses = squad.losses || 0;
            const winPct = (calculateWinRate(squad) * 100).toFixed(0);

            squadsGrid.innerHTML += `
                <div class="bg-[#14171d] rounded-[24px] border border-outline-variant/10 hover:border-primary/40 transition-all cursor-pointer shadow-sm flex flex-col group overflow-hidden relative" onclick="window.location.href='squad-details.html?id=${squad.id}'">
                    
                    <div class="h-20 bg-surface-container-highest w-full relative">
                        <div class="absolute inset-0 bg-gradient-to-t from-[#14171d] to-transparent"></div>
                        <div class="absolute top-3 right-3 bg-[#0a0e14]/80 backdrop-blur px-2.5 py-1 rounded-lg border border-outline-variant/20">
                            <span class="text-[9px] font-black text-primary uppercase tracking-widest">#${rank} RANK</span>
                        </div>
                    </div>

                    <div class="px-6 pb-6 pt-0 flex flex-col items-center text-center -mt-10 relative z-10">
                        <div class="w-20 h-20 rounded-2xl border-4 border-[#14171d] bg-surface-container mb-3 shadow-lg overflow-hidden group-hover:scale-105 transition-transform">
                            <img src="${logoUrl}" onerror="this.onerror=null; this.src='${getFallbackLogo(safeName)}';" class="w-full h-full object-cover">
                        </div>
                        
                        <h4 class="font-headline font-black italic uppercase text-white truncate w-full text-lg mb-1 group-hover:text-primary transition-colors">
                            <span class="text-outline-variant/70">[${safeAbbr}]</span> ${safeName}
                        </h4>
                        <p class="text-[10px] text-outline font-bold uppercase tracking-widest flex items-center gap-1 justify-center mb-4">
                            <span class="material-symbols-outlined text-[12px]">location_on</span> ${escapeHTML(squad.homeCity || 'Manila')}
                        </p>

                        <div class="w-full grid grid-cols-2 gap-2 border-t border-outline-variant/10 pt-4">
                            <div class="bg-[#0a0e14]/50 rounded-xl py-2 flex flex-col items-center">
                                <span class="text-[8px] text-outline font-bold uppercase tracking-widest mb-0.5">W-L</span>
                                <span class="font-black text-white text-sm leading-none">${wins}-${losses}</span>
                            </div>
                            <div class="bg-[#0a0e14]/50 rounded-xl py-2 flex flex-col items-center">
                                <span class="text-[8px] text-outline font-bold uppercase tracking-widest mb-0.5">PTS</span>
                                <span class="font-black text-primary text-sm leading-none">${squad.squadScore || 0}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
    }


    // ==========================================
    // PLAYERS LOGIC
    // ==========================================

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

            renderMyProfile();
            renderFilteredPlayers();

        } catch (e) {
            console.error("Error loading players:", e);
            if (topPlayersContainer) topPlayersContainer.innerHTML = '<p class="text-error text-center py-10">Failed to load players.</p>';
            if (playersGrid) playersGrid.innerHTML = '';
        }
    }

    function renderFilteredPlayers() {
        if (currentTab !== 'players') return;

        const currentCity = locFilterSelect.value;
        const searchTerm = searchInput ? searchInput.value.toLowerCase() : "";
        
        let filteredPlayers = [...allPlayers];

        if (currentCity !== "Metro Manila") {
            filteredPlayers = filteredPlayers.filter(p => p.location === currentCity);
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

    function renderMyProfile() {
        if (!myProfileContainer) return;

        if (!currentUserData) return; // Handled in unauth

        const myData = allPlayers.find(p => p.id === currentUserData.uid);
        
        if (!myData) {
            myProfileContainer.innerHTML = `
                <div class="bg-gradient-to-r from-[#14171d] to-[#0a0e14] rounded-[24px] p-8 border border-outline-variant/20 border-dashed text-center flex flex-col items-center justify-center shadow-sm cursor-pointer hover:border-primary/50 transition-colors" onclick="window.location.href='edit-profile.html'">
                    <span class="material-symbols-outlined text-4xl text-primary mb-3">person_add</span>
                    <h3 class="font-headline text-lg font-black uppercase text-white mb-1">Setup Your Profile</h3>
                    <p class="text-xs text-outline-variant font-medium">Complete your player card to get ranked.</p>
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
            <div class="bg-gradient-to-r from-[#14171d] to-[#0a0e14] rounded-[24px] p-6 border border-tertiary/40 shadow-[0_4px_30px_rgba(202,165,255,0.1)] hover:brightness-110 transition-all cursor-pointer flex flex-col md:flex-row items-center justify-between gap-6 group" onclick="window.location.href='profile.html?id=${myData.id}'">
                
                <div class="flex items-center gap-5 w-full md:w-auto">
                    <div class="w-20 h-20 rounded-full border-2 border-tertiary/40 bg-surface-container shrink-0 flex items-center justify-center overflow-hidden shadow-lg group-hover:scale-105 transition-transform">
                        <img src="${photoUrl}" onerror="this.onerror=null; this.src='${getFallbackAvatar(safeName)}';" class="w-full h-full object-cover">
                    </div>
                    
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center mb-1">
                            <h4 class="font-headline font-black italic uppercase text-white truncate text-xl md:text-2xl group-hover:text-tertiary transition-colors">${safeName}</h4>
                            ${squadHtml}
                        </div>
                        <p class="text-[10px] text-outline font-bold uppercase tracking-widest flex items-center gap-1">
                            <span class="material-symbols-outlined text-[14px]">sports_basketball</span> ${escapeHTML(fullPos)}
                        </p>
                    </div>
                </div>

                <div class="flex gap-4 w-full md:w-auto md:ml-auto border-t md:border-t-0 border-outline-variant/10 pt-4 md:pt-0 shrink-0">
                    <div class="text-center bg-surface-container-highest/50 px-5 py-3 rounded-xl border border-outline-variant/10 flex-1 md:flex-none">
                        <p class="font-black text-tertiary text-xl leading-none mb-1">#${rank}</p>
                        <p class="text-[9px] text-outline font-bold uppercase tracking-widest">Global Rank</p>
                    </div>
                    <div class="text-center bg-surface-container-highest/50 px-5 py-3 rounded-xl border border-outline-variant/10 flex-1 md:flex-none">
                        <p class="font-black text-white text-xl leading-none mb-1">${myData.score}</p>
                        <p class="text-[9px] text-outline font-bold uppercase tracking-widest">Score</p>
                    </div>
                </div>
            </div>
        `;
    }

    function renderTopPlayers(topPlayers, city) {
        if (!topPlayersContainer) return;
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

        // Podium Mapping (2, 1, 3)
        let podiumArr = [];
        if (topPlayers.length === 1) podiumArr = [null, topPlayers[0], null];
        else if (topPlayers.length === 2) podiumArr = [topPlayers[1], topPlayers[0], null];
        else podiumArr = [topPlayers[1], topPlayers[0], topPlayers[2]];

        let html = '<div class="flex flex-col md:flex-row items-end justify-center gap-6 md:gap-4 lg:gap-6 mt-12 md:mt-20">';

        podiumArr.forEach((player, i) => {
            if (!player) {
                html += `<div class="hidden md:flex w-1/3 opacity-0"></div>`;
                return;
            }

            const rank = topPlayers.findIndex(p => p.id === player.id) + 1;
            const isFirstPlace = rank === 1; 
            
            const safeName = escapeHTML(player.displayName || 'Unknown');
            const photoUrl = player.photoURL ? escapeHTML(player.photoURL) : getFallbackAvatar(safeName);
            const rawPos = player.primaryPosition || 'Unassigned';
            const fullPos = posMap[rawPos] || rawPos;

            const podiumClass = `podium-${rank}`;
            const orderClass = rank === 1 ? 'order-1 md:order-2 z-20 md:-translate-y-8 h-64' : (rank === 2 ? 'order-2 md:order-1 h-56' : 'order-3 md:order-3 h-52');
            const bgClass = rank === 1 ? 'bg-[#1a1d24] shadow-2xl' : 'bg-[#14171d] shadow-lg';
            const avatarSize = rank === 1 ? 'w-28 h-28 -top-14' : 'w-20 h-20 -top-10';
            
            let badgeHtml = '';
            if (rank === 1) badgeHtml = `<div class="absolute -top-16 bg-[#FFD700] text-[#0a0e14] px-4 py-1.5 rounded-full font-black flex items-center justify-center text-xs shadow-[0_0_20px_rgba(255,215,0,0.5)] tracking-widest border-2 border-white/20 z-20">👑 MVP</div>`;
            else if (rank === 2) badgeHtml = `<div class="absolute -top-12 -left-2 w-8 h-8 rounded-full bg-[#C0C0C0] text-[#0a0e14] font-black flex items-center justify-center text-sm shadow-lg z-20">2</div>`;
            else if (rank === 3) badgeHtml = `<div class="absolute -top-12 -right-2 w-8 h-8 rounded-full bg-[#CD7F32] text-white font-black flex items-center justify-center text-sm shadow-lg z-20">3</div>`;

            html += `
                <div class="w-full md:w-1/3 ${orderClass} rounded-[28px] ${bgClass} ${podiumClass} relative flex flex-col items-center p-6 cursor-pointer group hover:scale-[1.02] transition-transform" onclick="window.location.href='profile.html?id=${player.id}'">
                    
                    ${badgeHtml}
                    <div class="absolute ${avatarSize} rounded-full bg-surface-container border-[4px] ${isFirstPlace ? 'border-primary' : 'border-[#0a0e14]'} overflow-hidden shadow-xl z-10 group-hover:border-primary/50 transition-colors">
                        <img src="${photoUrl}" onerror="this.onerror=null; this.src='${getFallbackAvatar(safeName)}';" class="w-full h-full object-cover">
                    </div>

                    <div class="mt-12 md:mt-16 w-full text-center flex flex-col items-center">
                        <div class="flex items-center justify-center gap-1.5 mb-1.5">
                            ${player.squadAbbr ? `<span class="bg-surface-container-highest px-2 py-0.5 rounded border border-outline-variant/10 text-[8px] font-black text-outline uppercase tracking-widest">[${escapeHTML(player.squadAbbr)}]</span>` : ''}
                        </div>
                        <h3 class="font-headline font-black italic uppercase text-white leading-tight ${isFirstPlace ? 'text-2xl md:text-3xl' : 'text-xl'} mb-1 group-hover:text-primary transition-colors">
                            ${safeName}
                        </h3>
                        <p class="text-[10px] text-outline-variant font-bold uppercase tracking-widest mb-4">${fullPos}</p>
                        
                        <div class="bg-[#0a0e14]/50 border border-outline-variant/10 rounded-xl px-4 py-2 w-full max-w-[140px]">
                            <p class="text-[8px] text-outline font-bold uppercase tracking-widest mb-0.5">Score</p>
                            <p class="font-black ${isFirstPlace ? 'text-primary' : 'text-white'} text-sm">${player.score} PTS</p>
                        </div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        topPlayersContainer.innerHTML = html;
    }

    function renderPlayerList(players) {
        if (!playersGrid) return;
        playersGrid.innerHTML = '';
        
        if (players.length === 0) {
            playersGrid.innerHTML = '<div class="col-span-full text-center text-outline-variant py-8 text-sm italic">No other players match your search.</div>';
            return;
        }

        const lowerPlayers = players.slice(3);

        lowerPlayers.forEach((player, index) => {
            const rank = index + 4;
            const safeName = escapeHTML(player.displayName || 'Unknown');
            const photoUrl = player.photoURL ? escapeHTML(player.photoURL) : getFallbackAvatar(safeName);
            const rawPos = player.primaryPosition || 'Unassigned';
            const fullPos = posMap[rawPos] || rawPos;

            playersGrid.innerHTML += `
                <div class="bg-[#14171d] rounded-[24px] border border-outline-variant/10 hover:border-primary/40 transition-all cursor-pointer shadow-sm flex flex-col group overflow-hidden relative" onclick="window.location.href='profile.html?id=${player.id}'">
                    
                    <div class="h-20 bg-surface-container-highest w-full relative">
                        <div class="absolute inset-0 bg-gradient-to-t from-[#14171d] to-transparent"></div>
                        <div class="absolute top-3 right-3 bg-[#0a0e14]/80 backdrop-blur px-2.5 py-1 rounded-lg border border-outline-variant/20">
                            <span class="text-[9px] font-black text-primary uppercase tracking-widest">#${rank} RANK</span>
                        </div>
                    </div>

                    <div class="px-6 pb-6 pt-0 flex flex-col items-center text-center -mt-10 relative z-10">
                        <div class="w-20 h-20 rounded-full border-4 border-[#14171d] bg-surface-container mb-3 shadow-lg overflow-hidden group-hover:scale-105 transition-transform">
                            <img src="${photoUrl}" onerror="this.onerror=null; this.src='${getFallbackAvatar(safeName)}';" class="w-full h-full object-cover">
                        </div>
                        
                        <div class="flex items-center justify-center gap-1.5 mb-1 h-5">
                            ${player.squadAbbr ? `<span class="bg-[#0a0e14]/50 px-2 py-0.5 rounded border border-outline-variant/10 text-[9px] font-black text-outline uppercase tracking-widest">[${escapeHTML(player.squadAbbr)}]</span>` : ''}
                        </div>
                        
                        <h4 class="font-headline font-black italic uppercase text-white truncate w-full text-lg mb-1 group-hover:text-primary transition-colors">
                            ${safeName}
                        </h4>
                        <p class="text-[10px] text-outline font-bold uppercase tracking-widest flex items-center gap-1 justify-center mb-4">
                            ${fullPos}
                        </p>

                        <div class="w-full grid grid-cols-2 gap-2 border-t border-outline-variant/10 pt-4">
                            <div class="bg-[#0a0e14]/50 rounded-xl py-2 flex flex-col items-center">
                                <span class="text-[8px] text-outline font-bold uppercase tracking-widest mb-0.5">RELIABILITY</span>
                                <span class="font-black text-white text-sm leading-none">${player.reliability}%</span>
                            </div>
                            <div class="bg-[#0a0e14]/50 rounded-xl py-2 flex flex-col items-center">
                                <span class="text-[8px] text-outline font-bold uppercase tracking-widest mb-0.5">PTS</span>
                                <span class="font-black text-primary text-sm leading-none">${player.score}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
    }

    // --- SHARED EVENT LISTENERS ---
    if (locFilterSelect) locFilterSelect.addEventListener('change', () => {
        if(currentTab === 'squads') renderFilteredSquads();
        else renderFilteredPlayers();
    });

    if (searchInput) searchInput.addEventListener('input', () => {
        if(currentTab === 'squads') renderFilteredSquads();
        else renderFilteredPlayers();
    });


    // --- MODAL LOGIC FOR SQUADS (Same function, removed floating trigger) ---
    const createModal = document.getElementById('create-squad-modal');
    const closeModalBtn = document.getElementById('close-squad-modal');
    const createForm = document.getElementById('create-squad-form');
    const logoInput = document.getElementById('squad-logo-input');
    const logoPreview = document.getElementById('squad-logo-preview');
    const logoPlaceholder = document.getElementById('squad-logo-placeholder');
    let selectedLogoFile = null;

    if (createBtn && createModal) {
        createBtn.addEventListener('click', () => {
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
        createModal.addEventListener('click', (e) => {
            if (e.target === createModal) closeModalBtn.click();
        });
    }

    if (logoInput) {
        logoInput.addEventListener('change', (e) => {
            if (e.target.files[0]) {
                selectedLogoFile = e.target.files[0];
                logoPreview.src = URL.createObjectURL(selectedLogoFile);
                logoPreview.classList.remove('hidden');
                logoPlaceholder.classList.add('hidden');
            } else {
                selectedLogoFile = null;
                logoPreview.src = '';
                logoPreview.classList.add('hidden');
                logoPlaceholder.classList.remove('hidden');
            }
        });
    }

    if (createForm) {
        createForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (!auth.currentUser) return alert("You must be logged in to create a squad.");
            
            if (userHasSquad) {
                alert("You are already in a squad! Please leave your current squad before creating a new one.");
                return;
            }

            const submitBtn = document.getElementById('submit-squad-btn');
            submitBtn.textContent = 'Checking Abbreviation...';
            submitBtn.disabled = true;

            const nameVal = document.getElementById('squad-name-input').value.trim();
            const abbrVal = document.getElementById('squad-abbr-input').value.trim().toUpperCase();
            const cityVal = document.getElementById('squad-city-input').value;
            const skillVal = document.getElementById('squad-skill-input').value; 
            const privacyVal = document.getElementById('squad-privacy-input').value;

            try {
                const abbrCheckQ = query(collection(db, "squads"), where("abbreviation", "==", abbrVal));
                const abbrCheckSnap = await getDocs(abbrCheckQ);
                
                if (!abbrCheckSnap.empty) {
                    alert(`The abbreviation [${abbrVal}] is already taken! Please choose another.`);
                    submitBtn.innerHTML = `<span>Create Team</span><span class="material-symbols-outlined text-[18px]">add_task</span>`;
                    submitBtn.disabled = false;
                    return; 
                }

                let finalLogoUrl = null;
                if (selectedLogoFile) {
                    submitBtn.textContent = 'Optimizing Logo...';
                    const optimizedBlob = await resizeAndCropImage(selectedLogoFile, 300);
                    submitBtn.textContent = 'Uploading...';
                    finalLogoUrl = await uploadSquadLogo(optimizedBlob, nameVal);
                }

                submitBtn.textContent = 'Saving Squad...';

                const docRef = await addDoc(collection(db, "squads"), {
                    name: nameVal,
                    abbreviation: abbrVal,
                    homeCity: cityVal,
                    skillLevel: skillVal, 
                    joinPrivacy: privacyVal, 
                    logoUrl: finalLogoUrl,
                    captainId: auth.currentUser.uid,
                    captainName: auth.currentUser.displayName || "Unknown Player",
                    wins: 0,
                    losses: 0,
                    members: [auth.currentUser.uid], 
                    createdAt: serverTimestamp()
                });

                await setDoc(doc(db, "users", auth.currentUser.uid), { squadId: docRef.id, squadAbbr: abbrVal }, { merge: true });
                
                let localProf = JSON.parse(localStorage.getItem('ligaPhProfile') || '{}');
                localProf.squadId = docRef.id;
                localProf.squadAbbr = abbrVal;
                localStorage.setItem('ligaPhProfile', JSON.stringify(localProf));

                window.location.href = `squad-details.html?id=${docRef.id}`;
            } catch (error) {
                console.error("Error creating squad:", error);
                alert("Failed to create squad.");
                submitBtn.innerHTML = `<span>Create Team</span><span class="material-symbols-outlined text-[18px]">add_task</span>`;
                submitBtn.disabled = false;
            }
        });
    }
});
