import { fetchGames, postGame, updateGame, deleteGame, uploadGameImage } from './games.js';

function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function getIconForType(type) {
    switch(type) {
        case '5v5': return 'sports_basketball';
        case '3v3': return 'directions_run';
        case 'Training': return 'fitness_center';
        default: return 'sports_basketball';
    }
}

function formatDateString(dateString, timeString) {
    try {
        const date = new Date(`${dateString}T${timeString}`);
        if (isNaN(date)) return `${dateString || ''} • ${timeString || ''}`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' • ' + timeString;
    } catch(e) {
        return `${dateString || ''} • ${timeString || ''}`;
    }
}

function getGameStatus(dateStr, timeStr) {
    if (!dateStr || !timeStr) return "Upcoming";
    
    const gameStart = new Date(`${dateStr}T${timeStr}`);
    if (isNaN(gameStart)) return "Upcoming";
    
    const gameEnd = new Date(gameStart.getTime() + (2 * 60 * 60 * 1000));
    const now = new Date();

    if (now > gameEnd) return "Completed";
    if (now >= gameStart && now <= gameEnd) return "Ongoing";
    return "Upcoming";
}

function getStatusBadge(status) {
    if (status === 'Ongoing') {
        return `<span class="bg-error/10 text-error border border-error/20 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 w-max shadow-sm"><span class="w-1.5 h-1.5 rounded-full bg-error animate-pulse"></span>LIVE</span>`;
    }
    if (status === 'Completed') {
        return `<span class="bg-surface-container-highest text-outline px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border border-outline-variant/30 flex items-center gap-1 w-max"><span class="material-symbols-outlined text-[12px]">check_circle</span>ENDED</span>`;
    }
    return `<span class="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 w-max"><span class="w-1.5 h-1.5 rounded-full bg-primary"></span>UPCOMING</span>`;
}

function resizeGameImage(file, maxWidth = 1200) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
                height = (maxWidth / width) * height;
                width = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob((blob) => {
                if (blob) {
                    blob.name = file.name || 'game_cover.jpg';
                    resolve(blob);
                } else reject(new Error("Image optimization failed"));
            }, file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85);
        };
        img.onerror = () => reject(new Error("Failed to load image for resizing"));
        img.src = URL.createObjectURL(file);
    });
}

let currentFilter = 'all'; 
let activeCategoryFilter = 'All'; 
let allFetchedGames = [];

window.deleteGameCard = async function(e, gameId) {
    e.stopPropagation();
    if(confirm('Are you sure you want to delete this game?')) {
        const result = await deleteGame(gameId);
        if (result.success) {
            allFetchedGames = allFetchedGames.filter(g => g.id !== gameId);
            renderGamesList();
        } else {
            alert('Failed to delete game: ' + result.error);
        }
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
        if(document.getElementById('game-map-link')) document.getElementById('game-map-link').value = game.mapLink || "";
        document.getElementById('game-date').value = game.date || "";
        document.getElementById('game-time').value = game.time || "";
        document.getElementById('game-type').value = game.type || "5v5";
        if(document.getElementById('game-category')) document.getElementById('game-category').value = game.category || "Pickup";
        if(document.getElementById('game-skill-level')) document.getElementById('game-skill-level').value = game.skillLevel || "Open for all";
        document.getElementById('game-spots').value = game.spotsTotal || 10;
        document.getElementById('game-description').value = game.description || "";
        
        const reservedInput = document.getElementById('game-reserved-spots');
        if (reservedInput) {
            reservedInput.value = 0;
            reservedInput.disabled = true;
            reservedInput.title = "Cannot change reserved spots while editing";
        }
        
        document.getElementById('submit-game-btn').textContent = 'Update Game';

        const modal = document.getElementById('create-modal');
        const modalContent = modal.querySelector('div');
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0', 'pointer-events-none');
            modalContent.classList.remove('scale-95');
            modalContent.classList.add('scale-100');
        }, 10);
    }
}

function renderGamesList() {
    const container = document.getElementById('games-container');
    if (!container) return;

    container.innerHTML = '';

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

    filteredGames.forEach(game => {
        const remaining = game.spotsTotal - game.spotsFilled;
        const icon = getIconForType(game.type);
        const formattedDateTime = formatDateString(game.date, game.time);
        
        const gameStatus = getGameStatus(game.date, game.time);
        const statusBadge = getStatusBadge(gameStatus);

        const isMine = game.host === currentUserDisplayName;
        const myGameActions = isMine && currentFilter === 'mine' ? `
            <div class="flex justify-end gap-2 mt-4">
                <button onclick="editGameCard(event, '${game.id}')" class="text-xs font-bold uppercase tracking-widest text-primary hover:text-primary-container px-3 py-1 bg-surface-container-highest rounded border border-outline-variant/20 transition-colors">Edit</button>
                <button onclick="deleteGameCard(event, '${game.id}')" class="text-xs font-bold uppercase tracking-widest text-error hover:text-red-400 px-3 py-1 bg-surface-container-highest rounded border border-outline-variant/20 transition-colors">Delete</button>
            </div>
        ` : '';

        const playersArray = game.players || [];
        const isJoined = playersArray.includes(currentUserDisplayName);
        const isFull = remaining <= 0;

        let buttonHTML = '';
        if (gameStatus === 'Completed' || gameStatus === 'Ongoing') {
            buttonHTML = `<button class="w-full bg-surface-container-highest text-outline py-3 rounded-full font-bold uppercase text-sm tracking-widest cursor-default opacity-50">GAME CLOSED</button>`;
        } else if (isJoined) {
            buttonHTML = `<button class="w-full bg-primary/20 text-primary border border-primary/30 py-3 rounded-full font-black uppercase text-sm tracking-widest cursor-default">JOINED</button>`;
        } else if (isFull) {
            buttonHTML = `<button class="w-full bg-surface-container-highest text-outline py-3 rounded-full font-bold uppercase text-sm tracking-widest cursor-default opacity-50">FULL</button>`;
        } else {
            buttonHTML = `<button class="w-full bg-surface-container-highest group-hover:bg-primary group-hover:text-on-primary-container py-3 rounded-full font-bold uppercase text-sm tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98]">JOIN GAME</button>`;
        }

        const safeTitle = escapeHTML(game.title);
        const safeLocation = escapeHTML(game.location);
        const safeCategory = escapeHTML(game.category || 'Pickup');
        const safeSkill = escapeHTML(game.skillLevel || 'Open for all');
        const safeDesc = escapeHTML(game.description || "");

        let imageSection = '';
        if (!!game.imageUrl) {
            imageSection = `
            <div class="w-full rounded-lg overflow-hidden mb-4 relative shrink-0 border border-outline-variant/10 bg-surface-container-highest" style="height: 220px;">
                <img src="${escapeHTML(game.imageUrl)}" alt="${safeTitle}" class="w-full h-full object-cover opacity-0 transition-opacity duration-500" onload="this.classList.remove('opacity-0')">
                <div class="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent pointer-events-none"></div>
                <div class="absolute bottom-3 left-4 flex items-center gap-2 pointer-events-none">
                    <span class="material-symbols-outlined text-primary">image</span>
                </div>
            </div>`;
        } else {
            imageSection = `
            <div class="w-full rounded-lg overflow-hidden mb-4 relative shrink-0 border border-outline-variant/10 bg-surface-container-highest flex items-center justify-center" style="height: 220px;">
                <span class="material-symbols-outlined text-6xl text-outline-variant/30">sports_basketball</span>
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
                        <span class="text-on-surface-variant font-bold text-xs uppercase">${formattedDateTime}</span>
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
                        <span class="text-xs font-bold text-outline uppercase tracking-widest">${Math.max(0, remaining)} spots left</span>
                        <span class="text-secondary font-black text-sm">${game.spotsFilled}/${game.spotsTotal}</span>
                    </div>
                    <div class="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden mb-4">
                        <div class="h-full bg-secondary" style="width: ${fillPercentage}%"></div>
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
    allFetchedGames = await fetchGames();
    renderGamesList();

    const createBtn = document.getElementById('create-btn');
    import('./firebase-setup.js').then(({ auth }) => {
        auth.onAuthStateChanged((user) => {
            if (!user && createBtn) createBtn.style.display = 'none';
        });
    });

    const filterAllBtn = document.getElementById('filter-all-btn');
    const filterMineBtn = document.getElementById('filter-mine-btn');

    const activeOrangeClass = "bg-primary/10 text-primary border border-primary hover:bg-primary/20 transition-colors px-6 py-3.5 rounded-full flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(255,143,111,0.2)] active:scale-95";
    const unselectedBlueClass = "bg-[#101928] text-blue-400 border border-blue-500/40 hover:bg-[#172336] transition-colors px-6 py-3.5 rounded-full flex items-center justify-center gap-2 active:scale-95";

    if(filterAllBtn && filterMineBtn) {
        filterAllBtn.addEventListener('click', () => {
            currentFilter = 'all';
            filterAllBtn.className = activeOrangeClass;
            filterAllBtn.id = 'filter-all-btn'; 
            
            filterMineBtn.className = unselectedBlueClass;
            filterMineBtn.id = 'filter-mine-btn';
            renderGamesList();
        });
        
        filterMineBtn.addEventListener('click', () => {
            currentFilter = 'mine';
            filterMineBtn.className = activeOrangeClass;
            filterMineBtn.id = 'filter-mine-btn';
            
            filterAllBtn.className = unselectedBlueClass;
            filterAllBtn.id = 'filter-all-btn';
            renderGamesList();
        });
    }

    const executeSearchBtn = document.getElementById('execute-search-btn');
    if (executeSearchBtn) {
        executeSearchBtn.addEventListener('click', () => renderGamesList());
    }

    const categoryPills = document.querySelectorAll('.cat-pill');
    categoryPills.forEach(pill => {
        pill.addEventListener('click', (e) => {
            categoryPills.forEach(p => {
                p.className = 'cat-pill px-6 py-2 bg-surface-container-high border border-outline-variant/20 hover:bg-surface-bright text-on-surface rounded-md font-bold whitespace-nowrap transition-all';
            });
            const clicked = e.currentTarget;
            clicked.className = 'cat-pill px-6 py-2 bg-primary text-on-primary-container rounded-md font-bold whitespace-nowrap shadow-[0_0_15px_rgba(255,143,111,0.3)] hover:brightness-110 transition-all';
            
            activeCategoryFilter = clicked.dataset.cat;
            renderGamesList();
        });
    });

    const createForm = document.getElementById('create-game-form');
    if (createForm) {
        createForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitBtn = document.getElementById('submit-game-btn');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = 'SAVING...';
            submitBtn.disabled = true;

            const timeValue = document.getElementById('game-time').value;
            if (timeValue) {
                const minutes = timeValue.split(':')[1];
                if (!['00', '15', '30', '45'].includes(minutes)) {
                    alert("Please select a valid time. Minutes must be exactly 00, 15, 30, or 45.");
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

            const gameId = document.getElementById('edit-game-id').value;
            const totalSpots = parseInt(document.getElementById('game-spots').value, 10);
            
            let reservedSpotsField = document.getElementById('game-reserved-spots');
            let reservedSpots = reservedSpotsField && !reservedSpotsField.disabled ? parseInt(reservedSpotsField.value, 10) || 0 : 0;
            
            if (!gameId && reservedSpots >= totalSpots) {
                alert(`Reserved spots (${reservedSpots}) must be less than Total Spots (${totalSpots}). You need space for yourself!`);
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
                return;
            }

            const initialPlayers = [hostName];
            for(let i = 0; i < reservedSpots; i++) {
                initialPlayers.push(`Reserved Slot ${i + 1}`);
            }

            const gameData = {
                title: document.getElementById('game-title').value,
                location: document.getElementById('game-location').value,
                mapLink: document.getElementById('game-map-link') ? document.getElementById('game-map-link').value : '',
                date: document.getElementById('game-date').value,
                time: timeValue,
                type: document.getElementById('game-type').value,
                category: document.getElementById('game-category') ? document.getElementById('game-category').value : 'Pickup',
                skillLevel: document.getElementById('game-skill-level') ? document.getElementById('game-skill-level').value : 'Open for all',
                spotsTotal: totalSpots,
                description: document.getElementById('game-description').value,
                spotsFilled: initialPlayers.length,
                host: hostName,
                players: initialPlayers 
            };

            const imageFile = document.getElementById('game-image') ? document.getElementById('game-image').files[0] : null;
            if (imageFile) {
                try {
                    submitBtn.textContent = 'OPTIMIZING IMAGE...';
                    const optimizedBlob = await resizeGameImage(imageFile, 1200); 
                    submitBtn.textContent = 'UPLOADING IMAGE...';
                    const imageUrl = await uploadGameImage(optimizedBlob);
                    gameData.imageUrl = imageUrl;
                } catch (error) {
                    console.error("Image upload failed:", error);
                    alert("Failed to upload image: " + error.message + ". Posting game without it.");
                }
                submitBtn.textContent = 'SAVING...';
            }

            let result;
            if(gameId) {
                const existingGame = allFetchedGames.find(g => g.id === gameId);
                if(existingGame) {
                   gameData.spotsFilled = existingGame.spotsFilled;
                   gameData.players = existingGame.players;
                   if (!gameData.imageUrl && existingGame.imageUrl) gameData.imageUrl = existingGame.imageUrl;
                }
                result = await updateGame(gameId, gameData);
            } else {
                result = await postGame(gameData);
            }

            if (result.success) {
                const modal = document.getElementById('create-modal');
                const modalContent = modal.querySelector('div');
                modal.classList.add('opacity-0', 'pointer-events-none');
                modalContent.classList.remove('scale-100');
                modalContent.classList.add('scale-95');
                setTimeout(() => {
                    modal.classList.add('hidden');
                }, 300);

                createForm.reset();
                document.getElementById('edit-game-id').value = '';
                const titleEl = document.getElementById('modal-title');
                if (titleEl) titleEl.textContent = 'CREATE GAME';
                document.getElementById('submit-game-btn').textContent = 'POST GAME';
                if(reservedSpotsField) reservedSpotsField.disabled = false;
                
                if (document.getElementById('game-image-preview-container')) {
                    document.getElementById('game-image-preview-container').classList.add('hidden');
                    document.getElementById('game-image-preview').src = '';
                }

                allFetchedGames = await fetchGames();
                renderGamesList();
            } else {
                alert("Failed to save game: " + result.error);
            }

            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        });
    }
});
