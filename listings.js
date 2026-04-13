import { auth } from './firebase-setup.js';
import { serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

// IMPORT YOUR CUSTOM GAME FUNCTIONS HERE!
import { fetchGames, postGame, uploadGameImage } from './games.js';

document.addEventListener('DOMContentLoaded', () => {
    const gamesContainer = document.getElementById('games-container');
    const loadingIndicator = document.getElementById('loading-indicator');
    const counterEl = document.getElementById('results-counter');
    
    // Filters
    const searchInput = document.getElementById('search-game-input');
    const cityFilter = document.getElementById('filter-city');
    const skillFilter = document.getElementById('filter-skill');
    const typeFilter = document.getElementById('filter-type');
    
    let allGames = [];
    let currentUser = null;

    onAuthStateChanged(auth, (user) => {
        currentUser = user;
    });

    async function loadGames() {
        try {
            // USING YOUR GAMES.JS FUNCTION
            allGames = await fetchGames();
            
            // Sort by date/time (upcoming first)
            allGames.sort((a, b) => {
                const dateA = new Date(`${a.date}T${a.time}`);
                const dateB = new Date(`${b.date}T${b.time}`);
                return dateA - dateB;
            });

            if (loadingIndicator) loadingIndicator.style.display = 'none';
            renderGames();
        } catch (error) {
            console.error("Error loading games:", error);
            if (loadingIndicator) loadingIndicator.style.display = 'none';
            gamesContainer.innerHTML = '<div class="col-span-full text-center text-error py-10">Failed to load games.</div>';
        }
    }

    function renderGames() {
        gamesContainer.innerHTML = ''; // Clear current grid
        
        const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const cityVal = cityFilter ? cityFilter.value : '';
        const skillVal = skillFilter ? skillFilter.value : '';
        const typeVal = typeFilter ? typeFilter.value : '';

        const filteredGames = allGames.filter(game => {
            const matchesSearch = !searchTerm || 
                (game.title || '').toLowerCase().includes(searchTerm) || 
                (game.location || '').toLowerCase().includes(searchTerm) ||
                (game.host || '').toLowerCase().includes(searchTerm);
                
            const matchesCity = !cityVal || (game.location || '').includes(cityVal); 
            const matchesSkill = !skillVal || game.skillLevel === skillVal;
            const matchesType = !typeVal || game.type === typeVal;

            return matchesSearch && matchesCity && matchesSkill && matchesType;
        });

        if (counterEl) {
            counterEl.textContent = `SHOWING ${filteredGames.length} GAMES`;
        }

        if (filteredGames.length === 0) {
            gamesContainer.innerHTML = `
                <div class="col-span-full flex flex-col items-center justify-center py-20 opacity-50">
                    <span class="material-symbols-outlined text-5xl mb-4 text-outline-variant drop-shadow-md">search_off</span>
                    <p class="text-sm font-bold uppercase tracking-widest text-outline">No games found</p>
                    <p class="text-[10px] text-on-surface-variant mt-2">Try adjusting your filters.</p>
                </div>
            `;
            return;
        }

        filteredGames.forEach(game => {
            const spotsTotal = parseInt(game.spotsTotal) || 10;
            const players = Array.isArray(game.players) ? game.players : [];
            const spotsFilled = players.length;
            const isFull = spotsFilled >= spotsTotal;

            let statusHtml = '';
            if (isFull) {
                statusHtml = `<span class="bg-[#14171d] text-outline px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-widest border border-outline-variant/20">FULL</span>`;
            } else {
                statusHtml = `<span class="bg-primary/20 text-primary px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-widest border border-primary/30 animate-pulse">${spotsTotal - spotsFilled} SPOTS LEFT</span>`;
            }

            const defaultImg = 'https://images.unsplash.com/photo-1546519638-68e109498ffc?q=80&w=600&auto=format&fit=crop';
            const imgUrl = game.imageUrl || defaultImg;

            const card = document.createElement('div');
            card.className = "bg-surface-container-low border border-outline-variant/10 rounded-3xl overflow-hidden shadow-sm hover:shadow-lg hover:border-primary/50 transition-all cursor-pointer group flex flex-col";
            card.onclick = () => window.location.href = `game-details.html?id=${game.id}`;

            card.innerHTML = `
                <div class="h-40 relative overflow-hidden bg-surface-container-highest shrink-0">
                    <img src="${imgUrl}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                    <div class="absolute inset-0 bg-gradient-to-t from-[#0a0e14] to-transparent opacity-80"></div>
                    <div class="absolute top-3 right-3 flex gap-2">
                        ${statusHtml}
                    </div>
                    <div class="absolute bottom-3 left-4 right-4">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="text-[9px] font-bold bg-surface-container-highest/80 backdrop-blur text-on-surface px-2 py-0.5 rounded uppercase tracking-widest border border-outline-variant/20">${game.type || '5v5'}</span>
                            <span class="text-[9px] font-bold bg-surface-container-highest/80 backdrop-blur text-outline-variant px-2 py-0.5 rounded uppercase tracking-widest border border-outline-variant/20">${game.skillLevel || 'Open'}</span>
                        </div>
                        <h3 class="font-headline text-lg font-black italic uppercase tracking-tighter text-white leading-tight truncate drop-shadow-md">${game.title || 'Untitled Game'}</h3>
                    </div>
                </div>
                <div class="p-4 flex-1 flex flex-col">
                    <div class="flex items-center gap-2 text-on-surface-variant text-xs font-bold uppercase tracking-widest mb-2 truncate">
                        <span class="material-symbols-outlined text-[14px] text-primary">location_on</span>
                        <span class="truncate">${game.location || 'Location TBD'}</span>
                    </div>
                    <div class="flex items-center gap-2 text-on-surface-variant text-xs font-bold uppercase tracking-widest mb-4">
                        <span class="material-symbols-outlined text-[14px] text-primary">calendar_month</span>
                        <span>${game.date} @ ${game.time}</span>
                    </div>
                    
                    <div class="mt-auto pt-4 border-t border-outline-variant/10 flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <div class="w-6 h-6 rounded-full bg-surface-container border border-outline-variant/30 flex items-center justify-center overflow-hidden shrink-0">
                                <span class="material-symbols-outlined text-[12px] text-outline-variant">person</span>
                            </div>
                            <span class="text-[10px] text-outline font-bold uppercase tracking-widest truncate max-w-[100px]">Host: ${game.host || 'Unknown'}</span>
                        </div>
                        <span class="text-primary text-[10px] font-black uppercase tracking-widest group-hover:pr-1 transition-all">View <span class="material-symbols-outlined text-[12px] align-middle">arrow_forward</span></span>
                    </div>
                </div>
            `;
            gamesContainer.appendChild(card);
        });
    }

    // Attach event listeners to all filters so the grid updates instantly
    [searchInput, cityFilter, skillFilter, typeFilter].forEach(el => {
        if (el) el.addEventListener('input', renderGames);
        if (el) el.addEventListener('change', renderGames);
    });

    // Handle "Host a Game" Form Submission
    const createForm = document.getElementById('create-game-form');
    if (createForm) {
        createForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (!currentUser) {
                alert("You must be logged in to host a game.");
                return;
            }

            const submitBtn = document.getElementById('submit-game-btn');
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<span class="material-symbols-outlined animate-spin">refresh</span> Publishing...`;

            try {
                let imageUrl = null;
                const fileInput = document.getElementById('game-image');
                
                if (fileInput.files.length > 0) {
                    // USING YOUR GAMES.JS FUNCTION
                    imageUrl = await uploadGameImage(fileInput.files[0]);
                }

                let hostName = currentUser.displayName || "Unknown Player";
                try {
                    const localProfile = JSON.parse(localStorage.getItem('ligaPhProfile') || '{}');
                    if (localProfile.displayName) hostName = localProfile.displayName;
                } catch(err) {}

                const newGame = {
                    title: document.getElementById('game-title').value,
                    date: document.getElementById('game-date').value,
                    time: document.getElementById('game-time').value,
                    location: document.getElementById('game-location').value,
                    type: document.getElementById('game-type').value,
                    skillLevel: document.getElementById('game-skill').value,
                    spotsTotal: parseInt(document.getElementById('game-spots').value),
                    joinPolicy: document.getElementById('game-policy').value,
                    imageUrl: imageUrl,
                    host: hostName,
                    hostId: currentUser.uid,
                    players: [hostName],
                    applicants: [],
                    status: 'upcoming',
                    createdAt: serverTimestamp()
                };

                // USING YOUR GAMES.JS FUNCTION
                const result = await postGame(newGame);
                
                if (result.success) {
                    document.getElementById('close-create-modal').click();
                    createForm.reset();
                    alert("Game created successfully!");
                    loadGames(); 
                } else {
                    throw new Error(result.error);
                }
                
            } catch (error) {
                console.error("Error creating game:", error);
                alert("Failed to create game. Check console for details.");
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<span class="material-symbols-outlined text-[20px]">public</span> Publish Game`;
            }
        });
    }

    // Run the initial load
    loadGames();
});
