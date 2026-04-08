import { fetchGames, updateGame, deleteGame } from './games.js';
import { auth, db, storage } from './firebase-setup.js';
import { collection, addDoc, serverTimestamp, getDocs, query, where, limit } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";

function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function getFallbackLogo(name) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'S')}&background=20262f&color=ff8f6f`;
}

function getIconForType(type) {
    switch(type) {
        case '5v5 Squad Match': return 'swords';
        case '5v5': return 'sports_basketball';
        case '4v4': return 'sports_basketball';
        case '3v3': return 'directions_run';
        case 'Training': return 'fitness_center';
        default: return 'sports_basketball';
    }
}

function formatTime12(timeString) {
    if (!timeString) return '';
    try {
        let [hours, minutes] = timeString.split(':');
        let h = parseInt(hours, 10);
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12;
        h = h ? h : 12; 
        return `${h}:${minutes} ${ampm}`;
    } catch(e) { return timeString; }
}

function formatDateString(dateString, timeStartString, timeEndString) {
    try {
        const date = new Date(`${dateString}T${timeStartString}`);
        if (isNaN(date)) return `${dateString || ''} • ${timeStartString || ''}`;
        
        let timeStr = formatTime12(timeStartString);
        if (timeEndString) {
            timeStr += ` - ${formatTime12(timeEndString)}`;
        }
        
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' • ' + timeStr;
    } catch(e) { return `${dateString || ''} • ${timeStartString || ''}`; }
}

function getGameStatus(dateStr, timeStr, endTimeStr) {
    if (!dateStr || !timeStr) return "Upcoming";
    const gameStart = new Date(`${dateStr}T${timeStr}`);
    if (isNaN(gameStart)) return "Upcoming";
    
    let gameEnd;
    if (endTimeStr) {
        gameEnd = new Date(`${dateStr}T${endTimeStr}`);
        if (gameEnd < gameStart) {
            gameEnd.setDate(gameEnd.getDate() + 1); 
        }
    } else {
        gameEnd = new Date(gameStart.getTime() + (2 * 60 * 60 * 1000)); 
    }

    const now = new Date();

    if (now > gameEnd) return "Completed";
    if (now >= gameStart && now <= gameEnd) return "Ongoing";
    return "Upcoming";
}

function getStatusBadge(status) {
    if (status === 'Ongoing') return `<span class="bg-error/10 text-error border border-error/20 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 w-max shadow-sm"><span class="w-1.5 h-1.5 rounded-full bg-error animate-pulse"></span>LIVE</span>`;
    if (status === 'Completed') return `<span class="bg-surface-container-highest text-outline px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border border-outline-variant/30 flex items-center gap-1 w-max"><span class="material-symbols-outlined text-[12px]">check_circle</span>ENDED</span>`;
    return `<span class="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 w-max"><span class="w-1.5 h-1.5 rounded-full bg-primary"></span>UPCOMING</span>`;
}

function resizeGameImage(file, maxWidth = 1200) {
    return new Promise((resolve) => {
        if (!file.type.match(/image.*/)) {
            resolve(file); 
            return;
        }

        const reader = new FileReader();
        reader.onload = (readerEvent) => {
            const img = new Image();
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    if (width > maxWidth) {
                        height = Math.round((maxWidth / width) * height);
                        width = maxWidth;
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    canvas.toBlob((blob) => {
                        if (blob) {
                            blob.name = file.name || 'cover.jpg';
                            resolve(blob);
                        } else {
                            resolve(file); 
                        }
                    }, 'image/jpeg', 0.85); 
                } catch (err) {
                    resolve(file); 
                }
            };
            img.onerror = () => { resolve(file); };
            img.src = readerEvent.target.result;
        };
        reader.onerror = () => { resolve(file); };
        reader.readAsDataURL(file);
    });
}

function uploadGameCoverImage(file, uid) {
    return new Promise((resolve, reject) => {
        const safeName = (file.name || 'cover.jpg').replace(/[^a-zA-Z0-9.]/g, '_');
        const storageRef = ref(storage, `games/${uid}_${Date.now()}_${safeName}`);
        
        const uploadTask = uploadBytesResumable(storageRef, file);
        const submitBtn = document.getElementById('submit-game-btn');

        const timer = setTimeout(() => {
            uploadTask.cancel();
            reject(new Error("Upload timed out"));
        }, 60000);

        uploadTask.on('state_changed',
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                if(submitBtn) submitBtn.textContent = `UPLOADING... ${Math.round(progress)}%`;
            },
            (error) => {
                clearTimeout(timer);
                reject(error);
            },
            async () => {
                clearTimeout(timer);
                try {
                    const url = await getDownloadURL(uploadTask.snapshot.ref);
                    resolve(url);
                } catch (e) {
                    reject(e);
                }
            }
        );
    });
}

let currentFilter = 'all'; 
let activeCategoryFilter = 'All'; 
let allFetchedGames = [];
const squadLogoCache = {}; 

let map;
let marker;
let selectedCoordinates = null;

window.deleteGameCard = async function(e, gameId) {
    e.stopPropagation();
    if(confirm('Are you sure you want to delete this game?')) {
        const result = await deleteGame(gameId);
        if (result.success) {
            allFetchedGames = allFetchedGames.filter(g => g.id !== gameId);
            renderGamesList();
        } else { alert('Failed to delete game: ' + result.error); }
    }
}

window.editGameCard = function(e, gameId) {
    e.stopPropagation();
    const game = allFetchedGames.find(g => g.id === gameId);
    if(game) {
        document.getElementById('edit-game-id').value = game.id;
        const modalTitle = document.getElementById('modal-title');
        if (modalTitle) modalTitle.textContent = 'Edit Game';
        
        document.getElementById('game-title').value = game.title || "";
        document.getElementById('game-location').value = game.location || "";
        document.getElementById('game-map-link').value = game.mapLink || "";
        document.getElementById('game-date').value = game.date || "";
        document.getElementById('game-time').value = game.time || "";
        document.getElementById('game-end-time').value = game.endTime || "";
        document.getElementById('game-type').value = game.type || "5v5";
        
        if(document.getElementById('game-category')) document.getElementById('game-category').value = game.category || "Pickup";
        if(document.getElementById('game-skill-level')) document.getElementById('game-skill-level').value = game.skillLevel || "Open for all";
        if(document.getElementById('game-join-policy')) document.getElementById('game-join-policy').value = game.joinPolicy || "open";
        
        document.getElementById('game-spots').value = game.spotsTotal || 10;
        document.getElementById('game-description').value = game.description || "";
        
        const reservedInput = document.getElementById('game-reserved-spots');
        if (reservedInput) {
            reservedInput.value = 0;
            reservedInput.disabled = true;
        }
        
        document.getElementById('submit-game-btn').textContent = 'Update Game';

        const modal = document.getElementById('create-modal');
        const modalContent = modal.querySelector('div');
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden'; // Lock scroll
        setTimeout(() => {
            modal.classList.remove('opacity-0', 'pointer-events-none');
            modalContent.classList.remove('scale-95');
            modalContent.classList.add('scale-100');
        }, 10);
    }
}

async function getSquadLogo(abbr) {
    if (!abbr) return getFallbackLogo('?');
    if (squadLogoCache[abbr]) return squadLogoCache[abbr];
    
    try {
        const q = query(collection(db, "squads"), where("abbreviation", "==", abbr), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
            const data = snap.docs[0].data();
            const logo = data.logoUrl || getFallbackLogo(data.name);
            squadLogoCache[abbr] = logo;
            return logo;
        }
    } catch (e) { console.error(e); }
    
    const fallback = getFallbackLogo(abbr);
    squadLogoCache[abbr] = fallback;
    return fallback;
}

async function renderGamesList() {
    const container = document.getElementById('games-container');
    if (!container) return;

    container.innerHTML = '<div class="col-span-12 text-center py-12 opacity-50"><span class="material-symbols-outlined animate-spin text-4xl text-primary mb-2">refresh</span><p class="text-xs font-bold uppercase tracking-widest text-outline">Loading Arena...</p></div>';

    let currentUserDisplayName = "Unknown Host";
    try {
        const profileStr = localStorage.getItem('ligaPhProfile');
        if (profileStr) {
            const profileObj = JSON.parse(profileStr);
            currentUserDisplayName = profileObj.displayName || "Unknown Host";
        }
    } catch (err) {}

    const locSearch = (document.getElementById('search-location')?.value || "").toLowerCase();
    const dateSearch = document.getElementById('search-date')?.value || "";
    const skillSearch = (document.getElementById('search-skill')?.value || "").toLowerCase();

    let filteredGames = [...allFetchedGames];
    
    if (currentFilter === 'mine') {
        filteredGames = filteredGames.filter(g => {
            const isHost = g.host === currentUserDisplayName;
            const isPlayer = g.players && Array.isArray(g.players) && g.players.includes(currentUserDisplayName);
            return isHost || isPlayer;
        });
    }

    if (activeCategoryFilter !== 'All') {
        filteredGames = filteredGames.filter(g => g.category === activeCategoryFilter);
    }

    if (locSearch) filteredGames = filteredGames.filter(g => (g.location || '').toLowerCase() === locSearch);
    if (dateSearch) filteredGames = filteredGames.filter(g => g.date === dateSearch);
    if (skillSearch) filteredGames = filteredGames.filter(g => (g.skillLevel || 'open for all').toLowerCase() === skillSearch);

    filteredGames.sort((a, b) => {
        const dateA = new Date(`${a.date || ''}T${a.time || ''}`).getTime();
        const dateB = new Date(`${b.date || ''}T${b.time || ''}`).getTime();
        const timeA = isNaN(dateA) ? 0 : dateA;
        const timeB = isNaN(dateB) ? 0 : dateB;
        return timeB - timeA;
    });

    if (filteredGames.length === 0) {
        container.innerHTML = '<div class="col-span-12 text-center text-on-surface-variant py-12"><span class="material-symbols-outlined text-5xl opacity-50 mb-4 block">search_off</span>No games match your filters.</div>';
        return;
    }

    for (let game of filteredGames) {
        if (game.type === "5v5 Squad Match") {
            const abbrMatch = (game.title || "").match(/\[(.*?)\]/g);
            if (abbrMatch && abbrMatch.length >= 2) {
                const abbr1 = abbrMatch[0].replace(/\[|\]/g, ''); 
                const abbr2 = abbrMatch[1].replace(/\[|\]/g, ''); 
                game.squad1Logo = await getSquadLogo(abbr1);
                game.squad2Logo = await getSquadLogo(abbr2);
            }
        }
    }

    container.innerHTML = '';

    filteredGames.forEach(game => {
        const isSquadMatch = game.type === "5v5 Squad Match";
        const remaining = game.spotsTotal - game.spotsFilled;
        const icon = getIconForType(game.type);
        const formattedDateTime = formatDateString(game.date, game.time, game.endTime);
        
        const gameStatus = getGameStatus(game.date, game.time, game.endTime);
        const statusBadge = getStatusBadge(gameStatus);

        const isMine = game.host === currentUserDisplayName;
        const myGameActions = isMine && currentFilter === 'mine' && !isSquadMatch ? `
            <div class="flex justify-end gap-2 mt-4">
                <button onclick="editGameCard(event, '${game.id}')" class="text-xs font-bold uppercase tracking-widest text-primary hover:text-primary-container px-3 py-1 bg-surface-container-highest rounded border border-outline-variant/20 transition-colors">Edit</button>
                <button onclick="deleteGameCard(event, '${game.id}')" class="text-xs font-bold uppercase tracking-widest text-error hover:text-red-400 px-3 py-1 bg-surface-container-highest rounded border border-outline-variant/20 transition-colors">Delete</button>
            </div>
        ` : '';

        const playersArray = game.players || [];
        const isJoined = playersArray.includes(currentUserDisplayName);
        const isFull = remaining <= 0;

        let buttonHTML = '';
        if (gameStatus === 'Completed') {
            buttonHTML = `<button class="w-full bg-surface-container-highest text-outline py-3 rounded-full font-bold uppercase text-sm tracking-widest cursor-default opacity-50">GAME CLOSED</button>`;
        } else if (gameStatus === 'Ongoing') {
            buttonHTML = `<button class="w-full bg-error/10 text-error border border-error/30 py-3 rounded-full font-bold uppercase text-sm tracking-widest cursor-default">IN PROGRESS</button>`;
        } else if (isJoined) {
            buttonHTML = `<button class="w-full bg-primary/20 text-primary border border-primary/30 py-3 rounded-full font-black uppercase text-sm tracking-widest cursor-default">JOINED</button>`;
        } else if (isSquadMatch) {
            buttonHTML = `<button class="w-full bg-surface-container-highest hover:bg-surface-bright border border-outline-variant/30 text-on-surface py-3 rounded-full font-bold uppercase text-sm tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"><span class="material-symbols-outlined text-[18px]">visibility</span> VIEW GAME</button>`;
        } else if (isFull) {
            buttonHTML = `<button class="w-full bg-surface-container-highest text-outline py-3 rounded-full font-bold uppercase text-sm tracking-widest cursor-default opacity-50">FULL</button>`;
        } else {
            if (game.joinPolicy === 'approval') {
                 buttonHTML = `<button class="w-full bg-[#14171d] text-primary border border-primary/30 group-hover:bg-primary group-hover:text-on-primary-container py-3 rounded-full font-bold uppercase text-sm tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98]"><span class="material-symbols-outlined text-[14px] align-text-bottom mr-1">lock</span> REQUEST TO JOIN</button>`;
            } else {
                 buttonHTML = `<button class="w-full bg-surface-container-highest group-hover:bg-primary group-hover:text-on-primary-container py-3 rounded-full font-bold uppercase text-sm tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98]">JOIN GAME</button>`;
            }
        }

        const safeTitle = escapeHTML(game.title);
        const safeLocation = escapeHTML(game.location);
        const safeCategory = escapeHTML(game.category || 'Pickup');
        const safeSkill = escapeHTML(game.skillLevel || 'Open for all');
        const safeDesc = escapeHTML(game.description || "");

        let imageSection = '';
        if (isSquadMatch && game.squad1Logo && game.squad2Logo) {
            imageSection = `
            <div class="w-full rounded-lg overflow-hidden mb-4 relative shrink-0 border border-outline-variant/10 bg-[#0a0e14] flex shadow-inner" style="height: 220px;">
                <div class="w-1/2 h-full relative flex items-center justify-center overflow-hidden bg-surface-container-low">
                    <div class="absolute inset-0 bg-cover bg-center blur-xl opacity-40 scale-125 transition-transform group-hover:scale-150 duration-700" style="background-image: url('${game.squad1Logo}')"></div>
                    <div class="absolute inset-0 bg-gradient-to-r from-[#0a0e14]/90 via-[#0a0e14]/50 to-transparent z-0"></div>
                    <img src="${game.squad1Logo}" class="w-20 h-20 md:w-24 md:h-24 object-cover rounded-2xl border border-outline-variant/20 shadow-[0_10px_30px_rgba(0,0,0,0.8)] z-10 transform -rotate-6 group-hover:rotate-0 transition-transform duration-500">
                </div>
                <div class="w-1/2 h-full relative flex items-center justify-center overflow-hidden bg-surface-container-highest">
                    <div class="absolute inset-0 bg-cover bg-center blur-xl opacity-40 scale-125 transition-transform group-hover:scale-150 duration-700" style="background-image: url('${game.squad2Logo}')"></div>
                    <div class="absolute inset-0 bg-gradient-to-l from-[#0a0e14]/90 via-[#0a0e14]/50 to-transparent z-0"></div>
                    <img src="${game.squad2Logo}" class="w-20 h-20 md:w-24 md:h-24 object-cover rounded-2xl border border-outline-variant/20 shadow-[0_10px_30px_rgba(0,0,0,0.8)] z-10 transform rotate-6 group-hover:rotate-0 transition-transform duration-500">
                </div>
                <div class="absolute inset-y-0 left-1/2 w-px bg-gradient-to-b from-transparent via-error/50 to-transparent -translate-x-1/2 shadow-[0_0_15px_rgba(239,68,68,0.5)] z-10"></div>
                <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 bg-[#0a0e14] border border-error/50 text-error font-black italic text-xl px-4 py-1.5 rounded-lg shadow-[0_0_20px_rgba(239,68,68,0.4)] transform skew-x-[-10deg] group-hover:scale-110 transition-transform duration-300">
                    <span class="block transform skew-x-[10deg]">VS</span>
                </div>
                <div class="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent pointer-events-none z-20"></div>
            </div>`;
        } else if (!!game.imageUrl) {
            imageSection = `
            <div class="w-full rounded-lg overflow-hidden mb-4 relative shrink-0 border border-outline-variant/10 bg-surface-container-highest" style="height: 220px;">
                <img src="${escapeHTML(game.imageUrl)}" alt="${safeTitle}" class="w-full h-full object-cover opacity-0 transition-opacity duration-500 group-hover:scale-105" onload="this.classList.remove('opacity-0')">
                <div class="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent pointer-events-none"></div>
            </div>`;
        } else {
            imageSection = `
            <div class="w-full rounded-lg overflow-hidden mb-4 relative shrink-0 border border-outline-variant/10 bg-surface-container-highest flex items-center justify-center group-hover:bg-surface-container-high transition-colors" style="height: 220px;">
                <span class="material-symbols-outlined text-6xl text-outline-variant/30 group-hover:scale-110 transition-transform duration-500">sports_basketball</span>
                <div class="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent pointer-events-none"></div>
            </div>`;
        }

        const fillPercentage = game.spotsTotal > 0 ? (game.spotsFilled / game.spotsTotal) * 100 : 0;

        const cardHTML = `
            <div class="md:col-span-4 bg-surface-container-high rounded-xl border border-outline-variant/10 p-6 flex flex-col justify-between hover:bg-surface-bright transition-all cursor-pointer group shadow-sm hover:shadow-lg" onclick="window.location.href='game-details.html?id=${game.id}'">
                <div>
                    ${imageSection}
                    <div class="flex justify-between items-start mb-2">
                        <div class="w-10 h-10 rounded-lg bg-tertiary/10 flex items-center justify-center">
                            <span class="material-symbols-outlined text-tertiary">${icon}</span>
                        </div>
                        <span class="text-on-surface-variant font-bold text-xs uppercase text-right leading-tight">${formattedDateTime}</span>
                    </div>
                    ${statusBadge}
                    
                    <h4 class="font-headline text-2xl font-black italic uppercase tracking-tighter mb-2 mt-4 truncate">${safeTitle}</h4>
                    <p class="text-on-surface-variant text-sm mb-2 truncate"><span class="material-symbols-outlined text-[14px] align-middle mr-1">location_on</span>${safeLocation}</p>
                    ${safeDesc ? `<p class="text-outline text-xs line-clamp-2 italic mb-4 leading-relaxed border-l-2 border-outline-variant/30 pl-3">${safeDesc}</p>` : ''}

                    <div class="flex items-center gap-2 mb-6 mt-4 flex-wrap">
                        <span class="bg-tertiary/20 text-tertiary px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-tighter shadow-inner">${safeCategory}</span>
                        <span class="bg-surface-container border border-outline-variant/30 text-on-surface px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-tighter">${safeSkill}</span>
                    </div>
                </div>
                <div class="mt-auto">
                    <div class="flex justify-between items-center mb-4 px-2">
                        <span class="text-xs font-bold ${isSquadMatch ? 'text-error' : 'text-outline'} uppercase tracking-widest flex items-center gap-1">${isSquadMatch ? '<span class="material-symbols-outlined text-[14px]">swords</span> SQUAD MATCH' : `${Math.max(0, remaining)} spots left`}</span>
                        <span class="text-secondary font-black text-sm">${isSquadMatch ? '-' : `${game.spotsFilled}/${game.spotsTotal}`}</span>
                    </div>
                    <div class="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden mb-4">
                        <div class="h-full ${isSquadMatch ? 'bg-error w-full' : 'bg-secondary'}" style="width: ${isSquadMatch ? '100' : fillPercentage}%"></div>
                    </div>
                    ${buttonHTML}
                    ${myGameActions}
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', cardHTML);
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    
    auth.onAuthStateChanged((user) => {
        const createBtn = document.getElementById('create-btn');
        if (createBtn) {
            createBtn.style.display = user ? 'flex' : 'none';
        }
    });

    allFetchedGames = await fetchGames();
    renderGamesList();

    const filterAllBtn = document.getElementById('filter-all-btn');
    const filterMineBtn = document.getElementById('filter-mine-btn');
    const activeOrangeClass = "bg-primary/10 text-primary border border-primary hover:bg-primary/20 transition-colors px-6 py-3.5 rounded-full flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(255,143,111,0.2)] active:scale-95";
    const unselectedBlueClass = "bg-[#101928] text-blue-400 border border-blue-500/40 hover:bg-[#172336] transition-colors px-6 py-3.5 rounded-full flex items-center justify-center gap-2 active:scale-95";

    if(filterAllBtn && filterMineBtn) {
        filterAllBtn.addEventListener('click', () => {
            currentFilter = 'all';
            filterAllBtn.className = activeOrangeClass;
            filterMineBtn.className = unselectedBlueClass;
            renderGamesList();
        });
        filterMineBtn.addEventListener('click', () => {
            currentFilter = 'mine';
            filterMineBtn.className = activeOrangeClass;
            filterAllBtn.className = unselectedBlueClass;
            renderGamesList();
        });
    }

    const executeSearchBtn = document.getElementById('execute-search-btn');
    if (executeSearchBtn) executeSearchBtn.addEventListener('click', () => renderGamesList());

    const categoryPills = document.querySelectorAll('.cat-pill');
    categoryPills.forEach(pill => {
        pill.addEventListener('click', (e) => {
            categoryPills.forEach(p => p.className = 'cat-pill px-6 py-2 bg-surface-container-high border border-outline-variant/20 hover:bg-surface-bright text-on-surface rounded-md font-bold whitespace-nowrap transition-all');
            const clicked = e.currentTarget;
            clicked.className = 'cat-pill px-6 py-2 bg-primary text-on-primary-container rounded-md font-bold whitespace-nowrap shadow-[0_0_15px_rgba(255,143,111,0.3)] hover:brightness-110 transition-all';
            activeCategoryFilter = clicked.dataset.cat;
            renderGamesList();
        });
    });

    function initMap() {
        if (!map) {
            map = L.map('leaflet-map').setView([14.5547, 121.0244], 12);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '© OpenStreetMap contributors © CARTO'
            }).addTo(map);

            marker = L.marker([14.5547, 121.0244], {draggable: true}).addTo(map);

            map.on('click', function(e) {
                marker.setLatLng(e.latlng);
                selectedCoordinates = e.latlng;
            });

            marker.on('dragend', function(e) {
                selectedCoordinates = marker.getLatLng();
            });

            const geocoder = L.Control.geocoder({
                defaultMarkGeocode: false,
                position: 'topleft',
                placeholder: 'Search for a court or city...',
                errorMessage: 'Location not found.'
            }).on('markgeocode', function(e) {
                const bbox = e.geocode.bbox;
                const poly = L.polygon([
                    bbox.getSouthEast(),
                    bbox.getNorthEast(),
                    bbox.getNorthWest(),
                    bbox.getSouthWest()
                ]);
                map.fitBounds(poly.getBounds());
                marker.setLatLng(e.geocode.center);
                selectedCoordinates = e.geocode.center;
            }).addTo(map);
        }
        
        setTimeout(() => map.invalidateSize(), 300);
    }

    const openMapBtn = document.getElementById('open-map-picker-btn');
    const mapInput = document.getElementById('game-map-link');
    const mapModal = document.getElementById('map-picker-modal');
    const closeMapBtn = document.getElementById('close-map-picker-btn');
    const confirmLocBtn = document.getElementById('confirm-location-btn');

    if (openMapBtn) {
        openMapBtn.addEventListener('click', () => {
            mapModal.classList.remove('hidden');
            setTimeout(() => {
                mapModal.classList.remove('opacity-0', 'pointer-events-none');
                mapModal.querySelector('div').classList.remove('scale-95');
                initMap();
            }, 10);
        });
    }

    function closeMapModal() {
        mapModal.classList.add('opacity-0', 'pointer-events-none');
        mapModal.querySelector('div').classList.add('scale-95');
        setTimeout(() => mapModal.classList.add('hidden'), 300);
    }

    if (closeMapBtn) closeMapBtn.addEventListener('click', closeMapModal);

    if (confirmLocBtn) {
        confirmLocBtn.addEventListener('click', () => {
            const loc = selectedCoordinates || marker.getLatLng();
            const mapLink = `https://maps.google.com/maps?q=$${loc.lat},${loc.lng}`;
            mapInput.value = mapLink;
            closeMapModal();
        });
    }

    const createForm = document.getElementById('create-game-form');
    if (createForm) {
        createForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitBtn = document.getElementById('submit-game-btn');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = 'SAVING...';
            submitBtn.disabled = true;

            const timeValue = document.getElementById('game-time').value;
            const endTimeValue = document.getElementById('game-end-time').value;
            const gameDateValue = document.getElementById('game-date').value;
            const gameId = document.getElementById('edit-game-id').value;

            if (!gameId && gameDateValue) {
                const selectedDate = new Date(`${gameDateValue}T00:00:00`);
                const today = new Date();
                today.setHours(0, 0, 0, 0); 

                if (selectedDate < today) {
                    alert("You cannot schedule a new game for a past date. Please choose today or a future date.");
                    submitBtn.textContent = originalText;
                    submitBtn.disabled = false;
                    return;
                }
            }

            let hostName = "Unknown Host";
            try {
                const profileStr = localStorage.getItem('ligaPhProfile');
                if (profileStr) {
                    const profileObj = JSON.parse(profileStr);
                    hostName = profileObj.displayName || "Unknown Host";
                }
            } catch (err) {}

            const totalSpots = parseInt(document.getElementById('game-spots').value, 10);
            let reservedSpotsField = document.getElementById('game-reserved-spots');
            let reservedSpots = reservedSpotsField && !reservedSpotsField.disabled ? parseInt(reservedSpotsField.value, 10) || 0 : 0;
            
            if (!gameId && reservedSpots >= totalSpots) {
                alert(`Reserved spots (${reservedSpots}) must be less than Total Spots (${totalSpots}).`);
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
                return;
            }

            const initialPlayers = [hostName];
            for(let i = 0; i < reservedSpots; i++) initialPlayers.push(`Reserved Slot ${i + 1}`);

            const joinPolicyValue = document.getElementById('game-join-policy') ? document.getElementById('game-join-policy').value : 'open';

            const gameData = {
                title: document.getElementById('game-title').value,
                location: document.getElementById('game-location').value,
                mapLink: document.getElementById('game-map-link').value,
                date: gameDateValue,
                time: timeValue,
                endTime: endTimeValue, 
                type: document.getElementById('game-type').value,
                category: document.getElementById('game-category') ? document.getElementById('game-category').value : 'Pickup',
                skillLevel: document.getElementById('game-skill-level') ? document.getElementById('game-skill-level').value : 'Open for all',
                joinPolicy: joinPolicyValue, 
                applicants: [], 
                spotsTotal: totalSpots,
                description: document.getElementById('game-description').value,
                spotsFilled: initialPlayers.length,
                host: hostName,
                players: initialPlayers 
            };

            const imageFile = document.getElementById('game-image') ? document.getElementById('game-image').files[0] : null;
            if (imageFile) {
                try {
                    submitBtn.textContent = 'OPTIMIZING...';
                    const optimizedBlob = await resizeGameImage(imageFile, 1200); 
                    
                    submitBtn.textContent = 'UPLOADING IMAGE...';
                    const imageUrl = await uploadGameCoverImage(optimizedBlob, auth.currentUser.uid);
                    gameData.imageUrl = imageUrl;
                } catch (error) { 
                    console.error("Upload error:", error);
                    alert("Failed to upload image. Posting game without it."); 
                }
                submitBtn.textContent = 'SAVING...';
            }

            let result;
            if(gameId) {
                const existingGame = allFetchedGames.find(g => g.id === gameId);
                if(existingGame) {
                   gameData.spotsFilled = existingGame.spotsFilled;
                   gameData.players = existingGame.players;
                   gameData.applicants = existingGame.applicants || []; 
                   if (!gameData.imageUrl && existingGame.imageUrl) gameData.imageUrl = existingGame.imageUrl;
                }
                result = await updateGame(gameId, gameData);
            } else {
                try {
                    const docRef = await addDoc(collection(db, "games"), gameData);
                    result = { success: true, id: docRef.id, gameId: docRef.id };
                } catch(e) {
                    result = { success: false, error: e.message };
                }
            }

            if (result.success) {
                if (!gameId) {
                    try {
                        let authorPhoto = null; let authorPosition = "PLAYER"; let authorSquad = null;
                        const profileStr = localStorage.getItem('ligaPhProfile');
                        if (profileStr) {
                            const parsed = JSON.parse(profileStr);
                            authorPhoto = parsed.photoURL || null; authorPosition = parsed.primaryPosition || "PLAYER"; authorSquad = parsed.squadAbbr || null;
                        }

                        const displayTime = formatTime12(gameData.time);
                        const postContent = `🏀 NEW GAME ALERT: ${gameData.title}!\n\n📍 ${gameData.location}\n📅 ${gameData.date} • ${displayTime}\n🏅 ${gameData.skillLevel}\n\nI just opened slots for a new game. Tap below to join the roster before it fills up!`;
                        const savedGameId = result.id || result.gameId || null;

                        await addDoc(collection(db, "posts"), {
                            content: postContent, location: gameData.location, imageUrl: gameData.imageUrl || null,
                            authorId: auth.currentUser ? auth.currentUser.uid : 'guest', authorName: hostName,
                            authorPhoto: authorPhoto, authorPosition: authorPosition, authorSquadAbbr: authorSquad,
                            createdAt: serverTimestamp(), likedBy: [], commentsCount: 0,
                            type: 'game_promo', gameId: savedGameId, visibility: 'Public'
                        });
                    } catch(err) { console.error("Auto-post to Feed failed:", err); }
                }

                const modal = document.getElementById('create-modal');
                modal.classList.add('opacity-0', 'pointer-events-none');
                modal.querySelector('div').classList.add('scale-95');
                
                // IMPORTANT FIX: Unlock body scroll so the page doesn't freeze
                document.body.style.overflow = '';
                
                setTimeout(() => { modal.classList.add('hidden'); }, 300);

                createForm.reset();
                document.getElementById('edit-game-id').value = '';
                document.getElementById('submit-game-btn').textContent = 'POST GAME';
                
                if (document.getElementById('game-image-preview-container')) {
                    document.getElementById('game-image-preview-container').classList.add('hidden');
                }

                allFetchedGames = await fetchGames();
                renderGamesList();
            } else { alert("Failed to save game: " + result.error); }

            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        });
    }
});
