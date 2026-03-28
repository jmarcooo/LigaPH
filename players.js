import { db } from './firebase-setup.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('players-container');
    const searchInput = document.getElementById('player-search-input');
    const positionFilter = document.getElementById('player-position-filter');

    let allPlayers = [];

    // Fetch players from Firestore
    async function loadPlayers() {
        try {
            const querySnapshot = await getDocs(collection(db, "users"));
            allPlayers = [];
            querySnapshot.forEach((doc) => {
                allPlayers.push({ id: doc.id, ...doc.data() });
            });
            renderPlayers(allPlayers);
        } catch (error) {
            console.error("Error loading players:", error);
            container.innerHTML = `
                <div class="col-span-full flex flex-col items-center justify-center py-12 text-center text-error">
                    <span class="material-symbols-outlined text-6xl mb-4 opacity-50">error</span>
                    <p class="text-lg">Failed to load players.</p>
                </div>
            `;
        }
    }

    // Render players to DOM
    function renderPlayers(players) {
        container.innerHTML = '';

        if (players.length === 0) {
            container.innerHTML = `
                <div class="col-span-full flex flex-col items-center justify-center py-12 text-center text-on-surface-variant">
                    <span class="material-symbols-outlined text-6xl mb-4 opacity-50">person_off</span>
                    <p class="text-lg">No players found matching your criteria.</p>
                </div>
            `;
            return;
        }

        players.forEach(player => {
            const name = player.displayName || 'Unknown Player';
            const position = player.primaryPosition || 'Unassigned';
            const bio = player.bio || 'No bio available.';
            const photoUrl = player.photoURL || 'assets/default-avatar.jpg';

            const card = document.createElement('div');
            card.className = 'bg-surface-container-high rounded-2xl p-6 flex flex-col gap-4 shadow-lg hover:shadow-xl transition-all border border-outline-variant/10 group';

            card.innerHTML = `
                <div class="flex items-start gap-4">
                    <div class="w-16 h-16 rounded-full overflow-hidden shrink-0 border-2 border-primary/20 group-hover:border-primary transition-colors bg-surface-container-highest">
                        <img src="${photoUrl}" alt="${name}" class="w-full h-full object-cover" onerror="this.src='assets/default-avatar.jpg'">
                    </div>
                    <div class="flex-1 min-w-0 pt-1">
                        <h3 class="font-headline font-black text-xl italic tracking-tight text-on-surface uppercase truncate">${name}</h3>
                        <span class="inline-flex items-center gap-1 px-2 py-0.5 mt-1 rounded-sm bg-primary/10 text-primary text-[10px] font-black uppercase tracking-wider">
                            <span class="material-symbols-outlined text-[12px]">sports_basketball</span>
                            ${position}
                        </span>
                    </div>
                </div>

                <p class="text-on-surface-variant text-sm line-clamp-2 mt-2 flex-1">${bio}</p>

                <div class="mt-2 pt-4 border-t border-outline-variant/10">
                    <button class="w-full flex items-center justify-center gap-2 bg-surface-container hover:bg-surface-container-highest text-on-surface font-bold py-2 px-4 rounded-xl transition-colors text-sm">
                        <span class="material-symbols-outlined text-lg">person_add</span>
                        Connect
                    </button>
                </div>
            `;

            container.appendChild(card);
        });
    }

    // Filter logic
    function applyFilters() {
        const searchTerm = searchInput.value.toLowerCase().trim();
        const selectedPosition = positionFilter.value;

        const filtered = allPlayers.filter(player => {
            const nameMatch = (player.displayName || '').toLowerCase().includes(searchTerm);
            const posMatch = selectedPosition === '' || player.primaryPosition === selectedPosition;
            return nameMatch && posMatch;
        });

        renderPlayers(filtered);
    }

    // Event listeners for filters
    if (searchInput) {
        searchInput.addEventListener('input', applyFilters);
    }

    if (positionFilter) {
        positionFilter.addEventListener('change', applyFilters);
    }

    // Initial load
    loadPlayers();
});
