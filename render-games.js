import { fetchGames, postGame, updateGame, deleteGame, uploadGameImage } from './games.js';

function escapeHTML(str) {
    if (!str) return '';
    return str.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
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
        // Format: "Oct 12 • 19:30"
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' • ' + timeString;
    } catch(e) {
        return `${dateString} • ${timeString}`;
    }
}

let currentFilter = 'all';
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
        
        document.getElementById('game-title').value = game.title;
        document.getElementById('game-location').value = game.location;
        if(document.getElementById('game-map-link')) document.getElementById('game-map-link').value = game.mapLink || "";
        document.getElementById('game-date').value = game.date;
        document.getElementById('game-time').value = game.time;
        document.getElementById('game-type').value = game.type;
        if(document.getElementById('game-category')) document.getElementById('game-category').value = game.category || "Pickup";
        document.getElementById('game-spots').value = game.spotsTotal;
        if(document.getElementById('game-description')) document.getElementById('game-description').value = game.description || "";
        
        document.getElementById('submit-game-btn').textContent = 'Update Game';

        // Open modal
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

async function renderGames() {
    // Fetch from firebase
    allFetchedGames = await fetchGames();
    renderGamesList();
}

function renderGamesList() {
    const container = document.getElementById('games-container');
    if (!container) return;

    // Clear skeletons
    container.innerHTML = '';

    let hostName = "Unknown Host";
    try {
        const profileStr = localStorage.getItem('ligaPhProfile');
        if (profileStr) {
            const profileObj = JSON.parse(profileStr);
            hostName = profileObj.displayName || "Unknown Host";
        }
    } catch (err) {}

    let filteredGames = allFetchedGames;
    if (currentFilter === 'mine') {
        filteredGames = allFetchedGames.filter(g => g.host === hostName);
    }

    if (filteredGames.length === 0) {
        container.innerHTML = '<div class="col-span-12 text-center text-on-surface-variant p-8">No games found.</div>';
        return;
    }

    filteredGames.forEach(game => {
        const remaining = game.spotsTotal - game.spotsFilled;
        const icon = getIconForType(game.type);
        const formattedDateTime = formatDateString(game.date, game.time);

        const isMine = game.host === hostName;
        const myGameActions = isMine && currentFilter === 'mine' ? `
            <div class="flex justify-end gap-2 mt-4">
                <button onclick="editGameCard(event, '${game.id}')" class="text-xs font-bold uppercase tracking-widest text-primary hover:text-primary-container px-3 py-1 bg-surface-container-highest rounded border border-outline-variant/20 transition-colors">Edit</button>
                <button onclick="deleteGameCard(event, '${game.id}')" class="text-xs font-bold uppercase tracking-widest text-error hover:text-red-400 px-3 py-1 bg-surface-container-highest rounded border border-outline-variant/20 transition-colors">Delete</button>
            </div>
        ` : '';

        const safeTitle = escapeHTML(game.title);
        const safeLocation = escapeHTML(game.location);
        const safeType = escapeHTML(game.type);
        const safeCategory = escapeHTML(game.category || 'Pickup');
        const safeHost = escapeHTML(game.host);
        const safeDesc = escapeHTML(game.description || "");

        // Determine if we show a big image card or standard card
        const hasImage = !!game.imageUrl;
        let imageSection = '';

        if (hasImage) {
            imageSection = `
            <div class="w-full h-40 rounded-lg overflow-hidden mb-4 relative shrink-0">
                <img src="${game.imageUrl}" alt="${safeTitle}" class="w-full h-full object-cover">
                <div class="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent"></div>
                <div class="absolute bottom-3 left-4 flex items-center gap-2">
                    <span class="material-symbols-outlined text-primary">image</span>
                </div>
            </div>`;
        }

        const cardHTML = `
            <div class="md:col-span-4 bg-surface-container-high rounded-xl border border-outline-variant/10 p-6 flex flex-col justify-between hover:bg-surface-bright transition-all cursor-pointer group shadow-sm hover:shadow-lg" onclick="window.location.href='game-details.html?id=${game.id}'">
                <div>
                    ${imageSection}
                    <div class="flex justify-between items-start mb-4">
                        <div class="w-10 h-10 rounded-lg bg-tertiary/10 flex items-center justify-center">
                            <span class="material-symbols-outlined text-tertiary">${icon}</span>
                        </div>
                        <span class="text-on-surface-variant font-bold text-xs uppercase">${formattedDateTime}</span>
                    </div>
                    <h4 class="font-headline text-2xl font-black italic uppercase tracking-tighter mb-2 truncate">${safeTitle}</h4>
                    <p class="text-on-surface-variant text-sm mb-2 truncate"><span class="material-symbols-outlined text-[14px] align-middle mr-1">location_on</span>${safeLocation}</p>
                    ${safeDesc ? `<p class="text-outline text-xs line-clamp-2 italic mb-4 leading-relaxed border-l-2 border-outline-variant/30 pl-3">${safeDesc}</p>` : ''}

                    <div class="flex items-center gap-2 mb-6 mt-4 flex-wrap">
                        <span class="bg-tertiary/20 text-tertiary px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-tighter shadow-inner">${safeCategory}</span>
                        <span class="bg-surface-container-highest border border-outline-variant/10 text-on-surface px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-tighter">HOST: ${safeHost}</span>
                    </div>
                </div>
                <div class="mt-auto">
                    <div class="flex justify-between items-center mb-4 px-2">
                        <span class="text-xs font-bold text-outline uppercase tracking-widest">${remaining} spots left</span>
                        <span class="text-secondary font-black text-sm">${game.spotsFilled}/${game.spotsTotal}</span>
                    </div>
                    <div class="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden mb-4">
                        <div class="h-full bg-secondary" style="width: ${(game.spotsFilled / game.spotsTotal) * 100}%"></div>
                    </div>
                    <button class="w-full bg-surface-container-highest group-hover:bg-primary group-hover:text-on-primary-container py-3 rounded-full font-bold uppercase text-sm tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98]">
                        Join Game
                    </button>
                    ${myGameActions}
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', cardHTML);

    });
}

document.addEventListener('DOMContentLoaded', () => {
    renderGames();

    // Check auth state to hide "Create Game" FAB for guests
    const createBtn = document.getElementById('create-btn');
    import('./firebase-setup.js').then(({ auth }) => {
        auth.onAuthStateChanged((user) => {
            if (!user && createBtn) {
                createBtn.style.display = 'none';
            }
        });
    });

    const filterAllBtn = document.getElementById('filter-all-btn');
    const filterMineBtn = document.getElementById('filter-mine-btn');

    if(filterAllBtn && filterMineBtn) {
        filterAllBtn.addEventListener('click', () => {
            currentFilter = 'all';
            filterAllBtn.classList.remove('bg-surface-container-highest', 'text-on-surface', 'border-outline-variant/30', 'backdrop-blur-md');
            filterAllBtn.classList.add('bg-primary', 'text-on-primary-container', 'shadow-[0_0_20px_rgba(255,143,111,0.3)]');
            
            filterMineBtn.classList.remove('bg-primary', 'text-on-primary-container', 'shadow-[0_0_20px_rgba(255,143,111,0.3)]');
            filterMineBtn.classList.add('bg-surface-container-highest/80', 'text-on-surface', 'border-outline-variant/30', 'backdrop-blur-md');
            renderGamesList();
        });
        filterMineBtn.addEventListener('click', () => {
            currentFilter = 'mine';
            filterMineBtn.classList.remove('bg-surface-container-highest/80', 'text-on-surface', 'border-outline-variant/30', 'backdrop-blur-md');
            filterMineBtn.classList.add('bg-primary', 'text-on-primary-container', 'shadow-[0_0_20px_rgba(255,143,111,0.3)]');
            
            filterAllBtn.classList.remove('bg-primary', 'text-on-primary-container', 'shadow-[0_0_20px_rgba(255,143,111,0.3)]');
            filterAllBtn.classList.add('bg-surface-container-highest', 'text-on-surface');
            renderGamesList();
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

            let hostName = "Unknown Host";
            try {
                const profileStr = localStorage.getItem('ligaPhProfile');
                if (profileStr) {
                    const profileObj = JSON.parse(profileStr);
                    hostName = profileObj.displayName || "Unknown Host";
                }
            } catch (err) {}

            const gameId = document.getElementById('edit-game-id').value;

            const gameData = {
                title: document.getElementById('game-title').value,
                location: document.getElementById('game-location').value,
                mapLink: document.getElementById('game-map-link') ? document.getElementById('game-map-link').value : '',
                date: document.getElementById('game-date').value,
                time: document.getElementById('game-time').value,
                type: document.getElementById('game-type').value,
                category: document.getElementById('game-category') ? document.getElementById('game-category').value : 'Pickup',
                spotsTotal: parseInt(document.getElementById('game-spots').value, 10),
                description: document.getElementById('game-description').
