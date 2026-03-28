import { auth, db } from './firebase-setup.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

document.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('players-container');
    const topPlayersContainer = document.getElementById('top-players-container');
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

            // Sort by reliability or joined date to simulate "Top 10"
            // Since we might not have a strong metric, let's just pick top 10
            const sortedForTop = [...allPlayers].slice(0, 10);
            renderTopPlayers(sortedForTop);

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

        const currentUserUid = auth.currentUser ? auth.currentUser.uid : null;

        players.forEach(player => {
            const name = player.displayName || 'Unknown Player';
            const position = player.primaryPosition || 'Unassigned';
            const bio = player.bio || 'No bio available.';
            const photoUrl = player.photoURL || 'assets/default-avatar.jpg';
            const isSelf = currentUserUid === player.id;

            const card = document.createElement('div');
            card.className = 'bg-surface-container-high rounded-2xl p-6 flex flex-col gap-4 shadow-lg hover:shadow-xl transition-all border border-outline-variant/10 group';

            let actionButtonHtml = '';
            if (isSelf) {
                actionButtonHtml = `
                    <button onclick="window.location.href='profile.html'" class="w-full flex items-center justify-center gap-2 bg-surface-container-highest text-on-surface-variant font-bold py-2 px-4 rounded-xl transition-colors text-sm hover:text-on-surface">
                        <span class="material-symbols-outlined text-lg">person</span>
                        My Profile
                    </button>
                `;
            } else {
                actionButtonHtml = `
                    <button class="w-full flex items-center justify-center gap-2 bg-surface-container hover:bg-surface-container-highest text-on-surface font-bold py-2 px-4 rounded-xl transition-colors text-sm">
                        <span class="material-symbols-outlined text-lg">person_add</span>
                        Connect
                    </button>
                `;
            }

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
                    ${actionButtonHtml}
                </div>
            `;

            container.appendChild(card);
        });
    }

    // Render Top 10 players
    function renderTopPlayers(topPlayers) {
        if (!topPlayersContainer) return;
        topPlayersContainer.innerHTML = '';

        if (topPlayers.length === 0) {
            topPlayersContainer.innerHTML = '<span class="text-on-surface-variant px-4">No top players found.</span>';
            return;
        }

        const currentUserUid = auth.currentUser ? auth.currentUser.uid : null;

        topPlayers.forEach((player, index) => {
            const name = player.displayName || 'Unknown Player';
            const position = player.primaryPosition || 'Unassigned';
            const photoUrl = player.photoURL || 'assets/default-avatar.jpg';
            const isSelf = currentUserUid === player.id;

            const card = document.createElement('div');
            card.className = 'flex-none w-48 snap-start bg-surface-container-high rounded-xl p-4 border border-outline-variant/10 flex flex-col items-center text-center group hover:bg-surface-container-highest transition-colors';

            card.innerHTML = `
                <div class="relative mb-3">
                    <div class="w-20 h-20 rounded-full overflow-hidden border-2 border-primary/50 group-hover:border-primary transition-colors bg-surface-container-highest mx-auto">
                        <img src="${photoUrl}" alt="${name}" class="w-full h-full object-cover" onerror="this.src='assets/default-avatar.jpg'">
                    </div>
                    <div class="absolute -bottom-2 -right-2 bg-primary text-on-primary w-6 h-6 rounded-full flex items-center justify-center font-black text-xs shadow-md border-2 border-surface-container-high">
                        ${index + 1}
                    </div>
                </div>
                <h4 class="font-headline font-black text-lg italic tracking-tight text-on-surface uppercase truncate w-full mb-1">${name}</h4>
                <span class="text-primary text-[10px] font-black uppercase tracking-wider mb-3">${position}</span>

                <button ${isSelf ? 'disabled' : ''} class="${isSelf ? 'opacity-50 cursor-not-allowed' : 'hover:bg-primary/20'} w-full flex items-center justify-center gap-1 bg-primary/10 text-primary font-bold py-1.5 px-3 rounded-lg transition-colors text-xs">
                    <span class="material-symbols-outlined text-[16px]">${isSelf ? 'person' : 'person_add'}</span>
                    ${isSelf ? 'You' : 'Connect'}
                </button>
            `;
            topPlayersContainer.appendChild(card);
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

    // Wrap the initial load in onAuthStateChanged so auth.currentUser is populated
    onAuthStateChanged(auth, () => {
        loadPlayers();
    });
});
