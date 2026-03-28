
function escapeHTML(str) {
    if (!str) return '';
    return str.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

import { fetchGames, postGame, updateGame, deleteGame } from './games.js';

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
        document.getElementById('modal-title').textContent = 'Edit Game';
        document.getElementById('game-title').value = game.title;
        document.getElementById('game-location').value = game.location;
        document.getElementById('game-date').value = game.date;
        document.getElementById('game-time').value = game.time;
        document.getElementById('game-type').value = game.type;
        document.getElementById('game-spots').value = game.spotsTotal;
        document.getElementById('submit-game-btn').textContent = 'Update Game';

        // Open modal
        const modal = document.getElementById('create-modal');
        const modalContent = modal.querySelector('div');
        modal.classList.remove('opacity-0', 'pointer-events-none');
        modalContent.classList.remove('scale-95');
        modalContent.classList.add('scale-100');
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
        const safeHost = escapeHTML(game.host);

        const cardHTML = `
            <div class="md:col-span-4 bg-surface-container-high rounded-lg p-6 flex flex-col justify-between hover:bg-surface-bright transition-all cursor-pointer group" onclick="window.location.href='game-details.html'">
                <div>
                    <div class="flex justify-between items-start mb-6">
                        <div class="w-12 h-12 rounded-lg bg-tertiary/10 flex items-center justify-center">
                            <span class="material-symbols-outlined text-tertiary">${icon}</span>
                        </div>
                        <span class="text-on-surface-variant font-bold text-xs uppercase">${formattedDateTime}</span>
                    </div>
                    <h4 class="font-headline text-2xl font-bold uppercase tracking-tight mb-2">${safeTitle}</h4>
                    <p class="text-on-surface-variant text-sm mb-4">${safeLocation}</p>

                    <div class="flex items-center gap-2 mb-6">
                        <span class="bg-tertiary/20 text-tertiary px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-tighter">${safeType}</span>
                        <span class="text-on-surface-variant text-[10px] font-black uppercase">Host: ${safeHost}</span>
                    </div>
                </div>
                <div>
                    <div class="flex justify-between items-center mb-4">
                        <span class="text-sm font-medium text-on-surface-variant">${remaining} spots remaining</span>
                        <span class="text-secondary font-bold">${game.spotsFilled}/${game.spotsTotal}</span>
                    </div>
                    <button class="w-full bg-surface-container-highest group-hover:bg-primary group-hover:text-on-primary-container py-3 rounded-full font-bold uppercase text-sm tracking-widest transition-all">
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

    const filterAllBtn = document.getElementById('filter-all-btn');
    const filterMineBtn = document.getElementById('filter-mine-btn');

    if(filterAllBtn && filterMineBtn) {
        filterAllBtn.addEventListener('click', () => {
            currentFilter = 'all';
            filterAllBtn.classList.remove('bg-surface-container-highest', 'text-on-surface');
            filterAllBtn.classList.add('bg-primary', 'text-on-primary-container');
            filterMineBtn.classList.remove('bg-primary', 'text-on-primary-container');
            filterMineBtn.classList.add('bg-surface-container-highest', 'text-on-surface');
            renderGamesList();
        });
        filterMineBtn.addEventListener('click', () => {
            currentFilter = 'mine';
            filterMineBtn.classList.remove('bg-surface-container-highest', 'text-on-surface');
            filterMineBtn.classList.add('bg-primary', 'text-on-primary-container');
            filterAllBtn.classList.remove('bg-primary', 'text-on-primary-container');
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

            // Get host from local storage profile
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
                date: document.getElementById('game-date').value,
                time: document.getElementById('game-time').value,
                type: document.getElementById('game-type').value,
                spotsTotal: parseInt(document.getElementById('game-spots').value, 10),
                spotsFilled: 1, // Host takes one spot
                host: hostName
            };

            let result;
            if(gameId) {
                // Keep the original spotsFilled when editing
                const existingGame = allFetchedGames.find(g => g.id === gameId);
                if(existingGame) {
                   gameData.spotsFilled = existingGame.spotsFilled;
                }
                result = await updateGame(gameId, gameData);
            } else {
                result = await postGame(gameData);
            }

            if (result.success) {
                // Close modal
                const modal = document.getElementById('create-modal');
                const modalContent = modal.querySelector('div');
                modal.classList.add('opacity-0', 'pointer-events-none');
                modalContent.classList.remove('scale-100');
                modalContent.classList.add('scale-95');

                // Reset form
                createForm.reset();
                document.getElementById('edit-game-id').value = '';
                document.getElementById('modal-title').textContent = 'Create New';
                document.getElementById('submit-game-btn').textContent = 'Post Game';

                // Re-render games list to show the newly posted game
                await renderGames();
            } else {
                alert("Failed to save game: " + result.error);
            }

            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        });
    }
});
