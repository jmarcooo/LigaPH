import { auth } from './firebase-setup.js';
import { serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { fetchGames, postGame, uploadGameImage } from './games.js';

document.addEventListener('DOMContentLoaded', () => {
    const gamesContainer = document.getElementById('games-container');
    const loadingIndicator = document.getElementById('loading-indicator');
    const counterEl = document.getElementById('results-counter');
    
    // Filters & UI Controls
    const searchInput = document.getElementById('search-game-input');
    const sortFilter = document.getElementById('filter-sort');
    const cityFilter = document.getElementById('filter-city');
    const skillFilter = document.getElementById('filter-skill');
    const typeFilter = document.getElementById('filter-type');
    const filterBtn = document.getElementById('toggle-filters-btn');
    const filterContainer = document.getElementById('expandable-filters');
    const resetBtn = document.getElementById('reset-filters-btn');
    
    // View Toggles
    const viewGridBtn = document.getElementById('view-grid-btn');
    const viewListBtn = document.getElementById('view-list-btn');
    
    let currentViewMode = localStorage.getItem('ligaPhGameView') || 'grid';
    let allGames = [];
    let currentUser = null;

    onAuthStateChanged(auth, (user) => { currentUser = user; });

    // --- UI TOGGLE LOGIC ---

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

    function checkActiveFilters() {
        if (cityFilter.value || skillFilter.value || typeFilter.value || sortFilter.value !== 'date-desc') {
            resetBtn.classList.remove('hidden');
            resetBtn.classList.add('flex');
            document.getElementById('filter-btn-text').textContent = "Filters (Active)";
        } else {
            resetBtn.classList.add('hidden');
            resetBtn.classList.remove('flex');
            document.getElementById('filter-btn-text').textContent = "Filters";
        }
    }

    resetBtn.addEventListener('click', () => {
        cityFilter.value = '';
        skillFilter.value = '';
        typeFilter.value = '';
        sortFilter.value = 'date-desc';
        checkActiveFilters();
        renderGames();
    });

    function updateViewButtons() {
        if (currentViewMode === 'grid') {
            viewGridBtn.className = "p-2 rounded-xl bg-primary text-on-primary-container transition-colors shadow-sm";
            viewListBtn.className = "p-2 rounded-xl text-outline-variant hover:text-on-surface transition-colors";
        } else {
            viewListBtn.className = "p-2 rounded-xl bg-primary text-on-primary-container transition-colors shadow-sm";
            viewGridBtn.className = "p-2 rounded-xl text-outline-variant hover:text-on-surface transition-colors";
        }
    }

    viewGridBtn.addEventListener('click', () => { currentViewMode = 'grid'; localStorage.setItem('ligaPhGameView', 'grid'); updateViewButtons(); renderGames(); });
    viewListBtn.addEventListener('click', () => { currentViewMode = 'list'; localStorage.setItem('ligaPhGameView', 'list'); updateViewButtons(); renderGames(); });
    updateViewButtons();

    function getFallbackAvatar(name) { return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'P')}&background=20262f&color=ff8f6f`; }

    // --- DATA LOADING & RENDERING ---

    async function loadGames() {
        try {
            allGames = await fetchGames();
            if (loadingIndicator) loadingIndicator.style.display = 'none';
            renderGames();
        } catch (error) {
            console.error("Error loading games:", error);
            if (loadingIndicator) loadingIndicator.style.display = 'none';
            gamesContainer.innerHTML = '<div class="col-span-full text-center text-error py-10">Failed to load games.</div>';
        }
    }

    function renderGames() {
        gamesContainer.innerHTML = ''; 
        
        const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const sortVal = sortFilter ? sortFilter.value : 'date-desc';
        const cityVal = cityFilter ? cityFilter.value : '';
        const skillVal = skillFilter ? skillFilter.value : '';
        const typeVal = typeFilter ? typeFilter.value : '';

        // 1. FILTER THE GAMES
        let filteredGames = allGames.filter(game => {
            const matchesSearch = !searchTerm || 
                (game.title || '').toLowerCase().includes(searchTerm) || 
                (game.location || '').toLowerCase().includes(searchTerm) ||
                (game.host || '').toLowerCase().includes(searchTerm);
                
            const matchesCity = !cityVal || (game.location || '').includes(cityVal); 
            const matchesSkill = !skillVal || game.skillLevel === skillVal;
            const matchesType = !typeVal || game.type === typeVal;

            return matchesSearch && matchesCity && matchesSkill && matchesType;
        });

        // 2. SORT THE GAMES (Bulletproof Logic)
        filteredGames.sort((a, b) => {
            // Sort by Date Posted
            if (sortVal === 'date-desc' || sortVal === 'date-asc') {
                const getTime = (g) => {
                    if (g.createdAt) {
                        if (typeof g.createdAt.toMillis === 'function') return g.createdAt.toMillis();
                        if (g.createdAt.seconds) return g.createdAt.seconds * 1000;
                    }
                    // Safe fallback for old games without createdAt
                    return new Date(`${g.date}T${g.time}`).getTime() || 0;
                };

                const timeA = getTime(a);
                const timeB = getTime(b);
                return sortVal === 'date-desc' ? timeB - timeA : timeA - timeB;
            }
            
            // Sort by Slots Remaining
            if (sortVal === 'slots-asc' || sortVal === 'slots-desc') {
                const spotsA = parseInt(a.spotsTotal || 10) - (Array.isArray(a.players) ? a.players.length : 0);
                const spotsB = parseInt(b.spotsTotal || 10) - (Array.isArray(b.players) ? b.players.length : 0);
                return sortVal === 'slots-asc' ? spotsA - spotsB : spotsB - spotsA;
            }
            
            // Sort by Name (A-Z)
            if (sortVal === 'name-asc' || sortVal === 'name-desc') {
                const titleA = (a.title || '').toLowerCase();
                const titleB = (b.title || '').toLowerCase();
                if (titleA < titleB) return sortVal === 'name-asc' ? -1 : 1;
                if (titleA > titleB) return sortVal === 'name-asc' ? 1 : -1;
                return 0;
            }
            
            return 0;
        });

        if (counterEl) counterEl.textContent = `SHOWING ${filteredGames.length} GAMES`;

        if (filteredGames.length === 0) {
            gamesContainer.className = "grid grid-cols-1"; 
            gamesContainer.innerHTML = `
                <div class="col-span-full flex flex-col items-center justify-center py-20 opacity-50">
                    <span class="material-symbols-outlined text-5xl mb-4 text-outline-variant drop-shadow-md">search_off</span>
                    <p class="text-sm font-bold uppercase tracking-widest text-outline">No games found</p>
                    <p class="text-[10px] text-on-surface-variant mt-2">Try adjusting your filters.</p>
                </div>
            `;
            return;
        }

        if (currentViewMode === 'grid') {
            gamesContainer.className = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6";
        } else {
            gamesContainer.className = "flex flex-col gap-3 max-w-4xl";
        }

        // 3. RENDER THE CARDS
        filteredGames.forEach(game => {
            const spotsTotal = parseInt(game.spotsTotal) || 10;
            const players = Array.isArray(game.players) ? game.players : [];
            const spotsFilled = players.length;
            const isFull = spotsFilled >= spotsTotal;

            let statusHtml = isFull 
                ? `<span class="bg-[#14171d] text-outline px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-widest border border-outline-variant/20 shadow-sm">FULL</span>`
                : `<span class="bg-primary/20 text-primary px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-widest border border-primary/30 shadow-sm whitespace-nowrap animate-pulse">${spotsTotal - spotsFilled} SPOTS</span>`;

            const defaultImg = 'https://images.unsplash.com/photo-1546519638-68e109498ffc?q=80&w=600&auto=format&fit=crop';
            const imgUrl = game.imageUrl || defaultImg;
            const hostIcon = game.hostPhoto || getFallbackAvatar(game.host);

            const card = document.createElement('div');
            card.onclick = () => window.location.href = `game-details.html?id=${game.id}`;

            if (currentViewMode === 'grid') {
                card.className = "bg-surface-container-low border border-outline-variant/10 rounded-3xl overflow-hidden shadow-sm hover:shadow-lg hover:border-primary/50 transition-all cursor-pointer group flex flex-col";
                card.innerHTML = `
                    <div class="h-40 relative overflow-hidden bg-surface-container-highest shrink-0">
                        <img src="${imgUrl}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                        <div class="absolute inset-0 bg-gradient-to-t from-[#0a0e14] to-transparent opacity-80"></div>
                        <div class="absolute top-3 right-3 flex gap-2">${statusHtml}</div>
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
                                <img src="${hostIcon}" class="w-6 h-6 rounded-full object-cover border border-outline-variant/30 shrink-0 bg-surface-container">
                                <span class="text-[10px] text-outline font-bold uppercase tracking-widest truncate max-w-[120px]">${game.host || 'Unknown'}</span>
                            </div>
                            <span class="text-primary text-[10px] font-black uppercase tracking-widest group-hover:pr-1 transition-all">View <span class="material-symbols-outlined text-[12px] align-middle">arrow_forward</span></span>
                        </div>
                    </div>
                `;
            } else {
                card.className = "bg-surface-container-low border border-outline-variant/10 rounded-2xl overflow-hidden shadow-sm hover:shadow-md hover:border-primary/50 transition-all cursor-pointer group flex items-center h-auto md:h-28 pr-4 relative";
                let quickActionHtml = isFull 
                    ? `<span class="text-error font-bold text-[10px] uppercase tracking-widest hidden md:block">Game Full</span>`
                    : `<button onclick="event.stopPropagation(); window.location.href='game-details.html?id=${game.id}'" class="hidden md:flex bg-primary/10 hover:bg-primary text-primary hover:text-on-primary-container border border-primary/30 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors items-center gap-1.5 shadow-sm active:scale-95"><span class="material-symbols-outlined text-[14px]">sports_basketball</span> Quick View</button>`;

                card.innerHTML = `
                    <div class="w-24 h-24 md:w-32 md:h-full relative overflow-hidden bg-surface-container-highest shrink-0 mr-3 md:mr-4">
                        <img src="${imgUrl}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                        <div class="absolute inset-0 bg-[#0a0e14]/20 group-hover:bg-transparent transition-colors"></div>
                    </div>
                    
                    <div class="flex-1 min-w-0 flex flex-col justify-center py-3">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="text-[8px] md:text-[9px] font-bold bg-surface-container text-on-surface px-1.5 py-0.5 rounded uppercase tracking-widest border border-outline-variant/20">${game.type || '5v5'}</span>
                            <span class="text-[8px] md:text-[9px] font-bold text-outline-variant uppercase tracking-widest truncate">${game.skillLevel || 'Open'}</span>
                        </div>
                        <h3 class="font-headline text-sm md:text-lg font-black italic uppercase tracking-tighter text-on-surface truncate leading-tight mb-1 group-hover:text-primary transition-colors">${game.title || 'Untitled Game'}</h3>
                        <div class="flex items-center gap-3">
                            <p class="text-[9px] md:text-xs text-on-surface-variant font-medium truncate flex items-center gap-1"><span class="material-symbols-outlined text-[12px] text-outline">calendar_month</span> ${game.date} • ${game.location || 'TBD'}</p>
                            <div class="hidden md:flex items-center gap-1.5 pl-3 border-l border-outline-variant/10">
                                <img src="${hostIcon}" class="w-4 h-4 rounded-full object-cover">
                                <span class="text-[9px] font-bold text-outline-variant truncate">${game.host || 'Unknown'}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="shrink-0 flex flex-col items-end justify-center ml-2 border-l border-outline-variant/10 pl-3 md:pl-4 h-full py-3">
                        ${statusHtml}
                        <div class="mt-auto pt-2">${quickActionHtml}</div>
                    </div>
                `;
            }

            gamesContainer.appendChild(card);
        });
    }

    [searchInput, sortFilter, cityFilter, skillFilter, typeFilter].forEach(el => {
        if (el) el.addEventListener('input', () => { checkActiveFilters(); renderGames(); });
        if (el) el.addEventListener('change', () => { checkActiveFilters(); renderGames(); });
    });


    // --- MODAL & LEAFLET MAP LOGIC ---

    const createModal = document.getElementById('create-game-modal');
    const createModalInner = createModal?.querySelector('div');
    
    window.openCreateGameModal = function() {
        if (!currentUser) return alert('Please log in to host a game.');
        createModal.classList.remove('hidden');
        createModal.classList.add('flex');
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('game-date').value = today;
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

    // Leaflet Integration
    let map;
    let marker;
    const mapModal = document.getElementById('map-picker-modal');
    const openMapBtn = document.getElementById('open-map-picker-btn');
    const closeMapBtn = document.getElementById('close-map-picker-btn');
    const confirmMapBtn = document.getElementById('confirm-location-btn');
    const mapLinkInput = document.getElementById('game-map-link');

    openMapBtn?.addEventListener('click', () => {
        mapModal.classList.remove('hidden');
        setTimeout(() => {
            mapModal.classList.remove('opacity-0', 'pointer-events-none');
            mapModal.querySelector('div').classList.remove('scale-95');
            
            if (!map) {
                map = L.map('leaflet-map').setView([14.5547, 121.0244], 12); // Default to Makati/Manila
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
        mapModal.classList.add('opacity-0', 'pointer-events-none');
        mapModal.querySelector('div').classList.add('scale-95');
        setTimeout(() => mapModal.classList.add('hidden'), 300);
    }

    closeMapBtn?.addEventListener('click', closeMap);
    confirmMapBtn?.addEventListener('click', () => {
        if (marker) {
            const lat = marker.getLatLng().lat;
            const lng = marker.getLatLng().lng;
            mapLinkInput.value = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
            closeMap();
        } else {
            alert('Please tap on the map to place a pin.');
        }
    });

    // Handle Form Submission
    const createForm = document.getElementById('create-game-form');
    if (createForm) {
        createForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (!currentUser) return alert("You must be logged in to host a game.");

            const submitBtn = document.getElementById('submit-game-btn');
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<span class="material-symbols-outlined animate-spin">refresh</span> Publishing...`;

            try {
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
                    category: document.getElementById('game-category').value,
                    type: document.getElementById('game-type').value,
                    location: document.getElementById('game-location').value,
                    mapLink: document.getElementById('game-map-link').value,
                    date: document.getElementById('game-date').value,
                    time: document.getElementById('game-time').value,
                    endTime: document.getElementById('game-end-time').value,
                    spotsTotal: parseInt(document.getElementById('game-spots').value),
                    joinPolicy: document.getElementById('game-join-policy').value,
                    skillLevel: document.getElementById('game-skill-level').value,
                    description: document.getElementById('game-description').value,
                    imageUrl: imageUrl,
                    host: hostName,
                    hostId: currentUser.uid,
                    hostPhoto: hostPhoto, // Saves icon!
                    players: [hostName],
                    applicants: [],
                    status: 'upcoming',
                    createdAt: serverTimestamp()
                };

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
                submitBtn.innerHTML = `Post Game`;
            }
        });
    }

    loadGames();
});
