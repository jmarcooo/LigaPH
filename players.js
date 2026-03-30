import { auth, db } from './firebase-setup.js';
import { collection, getDocs, addDoc, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

// Expose function globally so inline HTML onclick handlers can trigger it
window.sendConnectionRequest = async function(targetUserId) {
    if (!auth.currentUser) {
        alert("You must be logged in to connect with players.");
        return;
    }

    const currentUserId = auth.currentUser.uid;

    if (currentUserId === targetUserId) {
        alert("You cannot connect with yourself!");
        return;
    }

    try {
        const connectionsRef = collection(db, "connections");

        // 1. Check if a connection already exists (pending or accepted)
        const q1 = query(connectionsRef, 
            where("requesterId", "==", currentUserId), 
            where("receiverId", "==", targetUserId)
        );
        const q2 = query(connectionsRef, 
            where("requesterId", "==", targetUserId), 
            where("receiverId", "==", currentUserId)
        );

        const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);

        if (!snap1.empty || !snap2.empty) {
            alert("A connection or pending request already exists with this player.");
            return;
        }

        // 2. Create the new pending request
        await addDoc(connectionsRef, {
            requesterId: currentUserId,
            receiverId: targetUserId,
            status: "pending",
            createdAt: serverTimestamp()
        });

        alert("Connection request sent successfully!");
        
    } catch (error) {
        console.error("Error sending connection request:", error);
        alert("Failed to send request.");
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('players-container');
    const topPlayersContainer = document.getElementById('top-players-container');
    const searchInput = document.getElementById('player-search-input');
    const positionFilter = document.getElementById('player-position-filter');

    let allPlayers = [];

    function escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Fetch players from Firestore
    async function loadPlayers() {
        try {
            const querySnapshot = await getDocs(collection(db, "users"));
            allPlayers = [];
            querySnapshot.forEach((doc) => {
                allPlayers.push({ id: doc.id, ...doc.data() });
            });

            // Sort by reliability or joined date to simulate "Top 10"
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
            const name = escapeHTML(player.displayName || 'Unknown Player');
            const position = escapeHTML(player.primaryPosition || 'Unassigned');
            const bio = escapeHTML(player.bio || 'No bio available.');
            const photoUrl = escapeHTML(player.photoURL || 'assets/default-avatar.jpg');
            const isSelf = currentUserUid === player.id;

            const card = document.createElement('div');
            card.className = 'bg-surface-container-high rounded-2xl p-6 flex flex-col gap-4 shadow-lg hover:shadow-xl transition-all border border-outline-variant/10 group';

            let actionButtonHtml = '';
            if (!currentUserUid) {
                actionButtonHtml = `
                    <button onclick="window.location.href='index.html'" class="w-full flex items-center justify-center gap-2 bg-surface-container hover:bg-surface-container-highest text-on-surface font-bold py-2 px-4 rounded-xl transition-colors text-sm">
                        <span class="material-symbols-outlined text-lg">login</span>
                        Log in to connect
                    </button>
                `;
            } else if (isSelf) {
                actionButtonHtml = `
                    <button onclick="window.location.href='profile.html'" class="w-full flex items-center justify-center gap-2 bg-surface-container-highest text-on-surface-variant font-bold py-2 px-4 rounded-xl transition-colors text-sm hover:text-on-surface">
                        <span class="material-symbols-outlined text-lg">person</span>
                        My Profile
                    </button>
                `;
            } else {
                actionButtonHtml = `
                    <button onclick="window.sendConnectionRequest('${player.id}')" class="w-full flex items-center justify-center gap-2 bg-surface-container hover:bg-surface-container-highest text-on-surface font-bold py-2 px-4 rounded-xl transition-colors text-sm">
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
            const name = escapeHTML(player.displayName || 'Unknown Player');
            const position = escapeHTML(player.primaryPosition || 'Unassigned');
            const photoUrl = escapeHTML(player.photoURL || 'assets/default-avatar.jpg');
            const isSelf = currentUserUid === player.id;

            let buttonAction = '';
            if (!currentUserUid) {
                buttonAction = 'onclick="window.location.href=\'index.html\'"';
            } else if (!isSelf) {
                buttonAction = `onclick="window.sendConnectionRequest('${player.id}')"`;
            }

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

                <button ${buttonAction} ${isSelf ? 'disabled' : ''} class="${isSelf ? 'opacity-50 cursor-not-allowed' : 'hover:bg-primary/20 cursor-pointer'} w-full flex items-center justify-center gap-1 bg-primary/10 text-primary font-bold py-1.5 px-3 rounded-lg transition-colors text-xs">
                    <span class="material-symbols-outlined text-[16px]">${!currentUserUid ? 'login' : isSelf ? 'person' : 'person_add'}</span>
                    ${!currentUserUid ? 'Log In' : isSelf ? 'You' : 'Connect'}
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
