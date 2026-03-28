import { fetchGames, postGame } from './games.js';

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

async function renderGames() {
    const container = document.getElementById('games-container');
    if (!container) return;

    // Fetch from firebase
    const games = await fetchGames();

    // Clear skeletons
    container.innerHTML = '';

    if (games.length === 0) {
        container.innerHTML = '<div class="col-span-12 text-center text-on-surface-variant p-8">No games found.</div>';
        return;
    }

    games.forEach(game => {
        const remaining = game.spotsTotal - game.spotsFilled;
        const icon = getIconForType(game.type);
        const formattedDateTime = formatDateString(game.date, game.time);

        const cardHTML = `
            <div class="md:col-span-4 bg-surface-container-high rounded-lg p-6 flex flex-col justify-between hover:bg-surface-bright transition-all cursor-pointer group" onclick="window.location.href='game-details.html'">
                <div>
                    <div class="flex justify-between items-start mb-6">
                        <div class="w-12 h-12 rounded-lg bg-tertiary/10 flex items-center justify-center">
                            <span class="material-symbols-outlined text-tertiary">${icon}</span>
                        </div>
                        <span class="text-on-surface-variant font-bold text-xs uppercase">${formattedDateTime}</span>
                    </div>
                    <h4 class="font-headline text-2xl font-bold uppercase tracking-tight mb-2">${game.title}</h4>
                    <p class="text-on-surface-variant text-sm mb-4">${game.location}</p>

                    <div class="flex items-center gap-2 mb-6">
                        <span class="bg-tertiary/20 text-tertiary px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-tighter">${game.type}</span>
                        <span class="text-on-surface-variant text-[10px] font-black uppercase">Host: ${game.host}</span>
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
                </div>
            </div>
        `;
        container.innerHTML += cardHTML;
    });
}

document.addEventListener('DOMContentLoaded', renderGames);


document.addEventListener('DOMContentLoaded', () => {
    const createForm = document.getElementById('create-game-form');
    if (createForm) {
        createForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitBtn = document.getElementById('submit-game-btn');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = 'POSTING...';
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

            const result = await postGame(gameData);

            if (result.success) {
                // Close modal
                const modal = document.getElementById('create-modal');
                const modalContent = modal.querySelector('div');
                modal.classList.add('opacity-0', 'pointer-events-none');
                modalContent.classList.remove('scale-100');
                modalContent.classList.add('scale-95');

                // Reset form
                createForm.reset();

                // Re-render games list to show the newly posted game
                await renderGames();
            } else {
                alert("Failed to post game: " + result.error);
            }

            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        });
    }
});
