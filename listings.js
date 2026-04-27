import { auth, db } from './firebase-setup.js';
import { serverTimestamp, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { fetchGames, postGame, uploadGameImage } from './games.js';

// --- Helper for dynamic host details ---
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
    
    const searchInput = document.getElementById('search-game-input');
    const statusFilter = document.getElementById('filter-status');
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
    let currentUser = null;

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
        
        gamesContainer.className = "grid grid-cols-1";
        gamesContainer.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center py-20 opacity-90 mt-10">
                <span class="material-symbols-outlined text-6xl mb-4 text-outline-variant drop-shadow-md">lock</span>
                <h2 class="text-2xl font-black uppercase tracking-widest text-on-surface mb-2">Login Required</h2>
                <p class="text-sm text-on-surface-variant mb-6 text-center max-w-sm">You need to be logged in to view open games, join runs, and see court details.</p>
                <button onclick="window.location.href='index.html'" class="bg-primary hover:brightness-110 text-on-primary-container px-8 py-3 rounded-xl font-headline font-black uppercase text-sm tracking-widest shadow-lg active:scale-95 transition-all">Login or Sign Up</button>
            </div>
        `;

        if (searchInput) searchInput.disabled = true;
        if (statusFilter) statusFilter.disabled = true;
        if (sortFilter) sortFilter.disabled = true;
        if (cityFilter) cityFilter.disabled = true;
        if (skillFilter) skillFilter.disabled = true;
        if (typeFilter) typeFilter.disabled = true;
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
        if (cityFilter.value || skillFilter.value || typeFilter.value || sortFilter.value !== 'date-desc' || statusFilter.value !== 'active') {
            resetBtn.classList.remove('hidden');
            resetBtn.classList.add('flex');
            const filterText = document.getElementById('filter-btn-text');
            if (filterText) filterText.textContent = "Filters (Active)";
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
            cityFilter.value = '';
            skillFilter.value = '';
            typeFilter.value = '';
            sortFilter.value = 'date-desc';
            checkActiveFilters();
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

    if (viewGridBtn) viewGridBtn.addEventListener('click', () => { currentViewMode = 'grid'; localStorage.setItem('ligaPhGameView', 'grid'); updateViewButtons(); renderGames(); });
    if (viewListBtn) viewListBtn.addEventListener('click', () => { currentViewMode = 'list'; localStorage.setItem('ligaPhGameView', 'list'); updateViewButtons(); renderGames(); });
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

    async function renderGames() {
        gamesContainer.innerHTML = ''; 
        
        const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const statusVal = statusFilter ? statusFilter.value : 'active';
        const sortVal = sortFilter ? sortFilter.value : 'date-desc';
        const cityVal = cityFilter ? cityFilter.value : '';
        const skillVal = skillFilter ? skillFilter.value : '';
        const typeVal = typeFilter ? typeFilter.value : '';

        const now = new Date(); 

        let filteredGames = allGames.filter(game => {
            const matchesSearch = !searchTerm || 
                (game.title || '').toLowerCase().includes(searchTerm) || 
                (game.location || '').toLowerCase().includes(searchTerm) ||
                (game.host || '').toLowerCase().includes(searchTerm);
                
            const matchesCity = !cityVal || (game.location || '').includes(cityVal); 
            const matchesSkill = !skillVal || game.skillLevel === skillVal;
            const matchesType = !typeVal || game.type === typeVal;

            const gameEndString = `${game.date}T${game.endTime || game.time}`;
            const gameEndDate = new Date(gameEndString);
            const isConcluded = gameEndDate < now || game.status === 'concluded';
            
            let matchesStatus = true;
            if (statusVal === 'active') {
                matchesStatus = !isConcluded;
            } else if (statusVal === 'concluded') {
                matchesStatus = isConcluded;
            } 

            return matchesSearch && matchesCity && matchesSkill && matchesType && matchesStatus;
        });

        filteredGames.sort((a, b) => {
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
            gamesContainer.className = "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 md:gap-8";
        } else {
            gamesContainer.className = "flex flex-col gap-4 max-w-4xl";
        }

        for (const game of filteredGames) {
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
                statusHtml = `<span class="bg-surface-container-highest text-outline-variant px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border border-outline-variant/20 shadow-sm">CONCLUDED</span>`;
            } else if (isFull) {
                statusHtml = `<span class="bg-[#14171d] text-outline px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border border-outline-variant/20 shadow-sm">FULL</span>`;
            } else {
                let spotsColor = 'bg-primary/20 text-primary border-primary/30'; 
                if (spotsLeft >= 5) spotsColor = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'; 
                if (spotsLeft === 1) spotsColor = 'bg-error/20 text-error border-error/30'; 
                
                let spotsText = spotsLeft === 1 ? '1 SPOT LEFT' : `${spotsLeft} SPOTS`;
                statusHtml = `<span class="${spotsColor} px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border shadow-sm whitespace-nowrap animate-pulse">${spotsText}</span>`;
            }

            // 2. DYNAMIC ACTION BUTTONS
            let actionText = isConcluded ? 'View History' : (isFull ? 'View Details' : 'Join Game');
            let actionIcon = isConcluded ? 'history' : (isFull ? 'visibility' : 'sports_basketball');
            
            let listActionBtn = '';
            if (isConcluded) {
                listActionBtn = `<button onclick="event.stopPropagation(); window.location.href='game-details.html?id=${game.id}'" class="hidden md:flex bg-surface-container-highest text-outline-variant hover:text-on-surface border border-outline-variant/20 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors items-center gap-1.5 shadow-sm active:scale-95"><span class="material-symbols-outlined text-[14px]">${actionIcon}</span> ${actionText}</button>`;
            } else if (isFull) {
                listActionBtn = `<button onclick="event.stopPropagation(); window.location.href='game-details.html?id=${game.id}'" class="hidden md:flex bg-surface-container-highest text-on-surface hover:bg-surface-container-high border border-outline-variant/30 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors items-center gap-1.5 shadow-sm active:scale-95"><span class="material-symbols-outlined text-[14px]">${actionIcon}</span> ${actionText}</button>`;
            } else {
                listActionBtn = `<button onclick="event.stopPropagation(); window.location.href='game-details.html?id=${game.id}'" class="hidden md:flex bg-primary hover:brightness-110 text-on-primary-container border border-primary/30 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors items-center gap-1.5 shadow-[0_0_15px_rgba(255,143,111,0.2)] active:scale-95"><span class="material-symbols-outlined text-[14px]">${actionIcon}</span> ${actionText}</button>`;
            }

            const defaultImg = 'https://images.unsplash.com/photo-1546519638-68e109498ffc?q=80&w=600&auto=format&fit=crop';
            const imgUrl = game.imageUrl || defaultImg;

            let dynamicHostName = game.host || 'Unknown';
            let dynamicHostIcon = game.hostPhoto || getFallbackAvatar(dynamicHostName);
            let hostRating = "4.9"; 

            if (game.hostId) {
                const hostProfile = await getHostDetails(game.hostId);
                if (hostProfile) {
                    dynamicHostName = hostProfile.displayName || dynamicHostName;
                    dynamicHostIcon = hostProfile.photoURL || dynamicHostIcon;
                }
            }

            const card = document.createElement('div');
            card.onclick = () => window.location.href = `game-details.html?id=${game.id}`;

            const grayOutClasses = isConcluded ? "grayscale opacity-60 contrast-75 cursor-default" : "cursor-pointer hover:border-primary/40 hover:shadow-xl hover:-translate-y-1";

            if (currentViewMode === 'grid') {
                card.className = `bg-surface-container-low border border-outline-variant/10 rounded-[24px] overflow-hidden shadow-md transition-all duration-300 group flex flex-col ${grayOutClasses}`;
                card.innerHTML = `
                    <div class="h-48 relative overflow-hidden bg-surface-container-highest shrink-0">
                        <img src="${imgUrl}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700">
                        <div class="absolute inset-0 bg-gradient-to-t from-[#0a0e14] via-[#0a0e14]/40 to-transparent opacity-90"></div>
                        <div class="absolute top-4 right-4 flex gap-2">${statusHtml}</div>
                        <div class="absolute bottom-4 left-5 right-5">
                            <div class="flex items-center gap-2 mb-2">
                                <span class="text-[9px] font-black bg-surface-container-highest/80 backdrop-blur text-on-surface px-2 py-0.5 rounded uppercase tracking-widest border border-outline-variant/20">${game.type || '5v5'}</span>
                                <span class="text-[9px] font-black bg-surface-container-highest/80 backdrop-blur text-outline-variant px-2 py-0.5 rounded uppercase tracking-widest border border-outline-variant/20">${game.skillLevel || 'Open'}</span>
                            </div>
                        </div>
                    </div>
                    <div class="p-6 flex-1 flex flex-col">
                        <h3 class="font-headline text-xl font-black italic uppercase tracking-tighter text-on-surface leading-tight mb-4 group-hover:text-primary transition-colors">${game.title || 'Untitled Game'}</h3>
                        
                        <div class="flex items-center gap-3 text-on-surface-variant text-xs font-medium mb-2.5 truncate">
                            <span class="material-symbols-outlined text-[16px] text-primary">location_on</span>
                            <span class="truncate">${game.location || 'Location TBD'}</span>
                        </div>
                        <div class="flex items-center gap-3 text-on-surface-variant text-xs font-medium mb-6">
                            <span class="material-symbols-outlined text-[16px] text-primary">calendar_month</span>
                            <span>${game.date} @ ${game.time}</span>
                        </div>
                        
                        <div class="mt-auto pt-5 border-t border-outline-variant/10 flex items-center justify-between">
                            <div class="flex items-center gap-3">
                                <img src="${dynamicHostIcon}" class="w-9 h-9 rounded-full object-cover border border-outline-variant/30 shrink-0 bg-surface-container">
                                <div class="flex flex-col">
                                    <span class="text-[11px] text-on-surface font-bold uppercase tracking-widest truncate max-w-[120px]">${dynamicHostName}</span>
                                    <span class="text-[9px] text-primary flex items-center gap-0.5 mt-0.5"><span class="material-symbols-outlined text-[10px]">star</span> ${hostRating} Host</span>
                                </div>
                            </div>
                            <div class="text-right flex flex-col items-end">
                                <span class="text-primary text-[10px] font-black uppercase tracking-widest flex items-center gap-1 group-hover:pr-1 transition-all">${actionText} <span class="material-symbols-outlined text-[12px] align-middle">arrow_forward</span></span>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                // LIST VIEW - Host stacked below date/location (CLEANED UP)
                card.className = `bg-surface-container-low border border-outline-variant/10 rounded-[20px] overflow-hidden shadow-sm transition-all duration-300 group flex items-center h-auto pr-5 relative ${grayOutClasses}`;
                
                card.innerHTML = `
                    <div class="w-32 h-32 md:w-40 md:h-full relative overflow-hidden bg-surface-container-highest shrink-0 mr-4 md:mr-5">
                        <img src="${imgUrl}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700">
                        <div class="absolute inset-0 bg-[#0a0e14]/20 group-hover:bg-transparent transition-colors"></div>
                    </div>
                    
                    <div class="flex-1 min-w-0 flex flex-col justify-center py-5">
                        <div class="flex items-center gap-2 mb-1.5">
                            <span class="text-[8px] md:text-[9px] font-black bg-surface-container text-on-surface px-2 py-0.5 rounded uppercase tracking-widest border border-outline-variant/20">${game.type || '5v5'}</span>
                            <span class="text-[8px] md:text-[9px] font-bold text-outline-variant uppercase tracking-widest truncate">${game.skillLevel || 'Open'}</span>
                        </div>
                        <h3 class="font-headline text-base md:text-xl font-black italic uppercase tracking-tighter text-on-surface truncate leading-tight mb-3 group-hover:text-primary transition-colors">${game.title || 'Untitled Game'}</h3>
                        
                        <div class="flex flex-col gap-2.5">
                            <p class="text-[10px] md:text-xs text-on-surface-variant font-medium truncate flex items-center gap-1.5">
                                <span class="material-symbols-outlined text-[14px] text-outline">calendar_month</span> ${game.date} • ${game.location || 'TBD'}
                            </p>
                            
                            <div class="flex items-center gap-2 mt-1">
                                <img src="${dynamicHostIcon}" class="w-5 h-5 rounded-full object-cover border border-outline-variant/20 shadow-sm">
                                <span class="text-[11px] font-bold text-on-surface truncate max-w-[180px] tracking-wide">${dynamicHostName}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="shrink-0 flex flex-col items-end justify-center ml-2 pl-4 border-l border-outline-variant/10 h-full py-4">
                        <div class="flex items-center gap-3">
                            <span class="text-[10px] text-outline-variant font-medium tracking-widest uppercase hidden md:block">${spotsFilled}/${spotsTotal} Joined</span>
                            ${statusHtml}
                        </div>
                        <div class="mt-auto pt-4">
                            ${listActionBtn}
                        </div>
                    </div>
                `;
            }

            gamesContainer.appendChild(card);
        }
    }

    // Attach listeners including the new status filter
    [searchInput, statusFilter, sortFilter, cityFilter, skillFilter, typeFilter].forEach(el => {
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
        
        createModal.classList.remove('pointer-events-none'); 

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
    
    // Reverse Geocoding & Confirm Location
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
                    
                    if (!locationInput.value) {
                        locationInput.value = readableAddress;
                    }
                }
            } catch (err) {
                console.error("Failed to fetch address details:", err);
            }

            confirmMapBtn.innerHTML = originalBtnHtml;
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
                    hostPhoto: hostPhoto,
                    players: [currentUser.uid], 
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
});
