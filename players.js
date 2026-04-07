import { auth, db } from './firebase-setup.js';
import { collection, getDocs, addDoc, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

window.sendConnectionRequest = async function(targetUserId) {
    if (!auth.currentUser) return alert("You must be logged in to connect with players.");
    const currentUserId = auth.currentUser.uid;
    if (currentUserId === targetUserId) return alert("You cannot connect with yourself!");

    try {
        const connectionsRef = collection(db, "connections");
        const q1 = query(connectionsRef, where("requesterId", "==", currentUserId), where("receiverId", "==", targetUserId));
        const q2 = query(connectionsRef, where("requesterId", "==", targetUserId), where("receiverId", "==", currentUserId));
        const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);

        if (!snap1.empty || !snap2.empty) return alert("A connection or pending request already exists with this player.");

        await addDoc(connectionsRef, {
            requesterId: currentUserId,
            receiverId: targetUserId,
            status: "pending",
            createdAt: serverTimestamp()
        });
        alert("Connection request sent successfully!");
        if (window.refreshPlayersList) window.refreshPlayersList();
    } catch (error) {
        alert("Failed to send request.");
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('players-container');
    const topPlayersContainer = document.getElementById('top-players-container');
    const searchInput = document.getElementById('player-search-input');
    const positionFilter = document.getElementById('player-position-filter');

    let allPlayers = [];
    let userConnectionsMap = {};

    function getFallbackAvatar(name) {
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'P')}&background=20262f&color=ff8f6f`;
    }

    function escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    async function loadUserConnections(userId) {
        userConnectionsMap = {};
        try {
            const connRef = collection(db, "connections");
            const [snapReq, snapRec] = await Promise.all([
                getDocs(query(connRef, where("requesterId", "==", userId))),
                getDocs(query(connRef, where("receiverId", "==", userId)))
            ]);
            snapReq.forEach(doc => { userConnectionsMap[doc.data().receiverId] = doc.data().status; });
            snapRec.forEach(doc => { userConnectionsMap[doc.data().requesterId] = doc.data().status === 'pending' ? 'received_pending' : 'accepted'; });
        } catch (error) {}
    }

    async function loadPlayers() {
        try {
            const currentUserUid = auth.currentUser ? auth.currentUser.uid : null;
            if (currentUserUid) await loadUserConnections(currentUserUid);

            const querySnapshot = await getDocs(collection(db, "users"));
            allPlayers = [];
            querySnapshot.forEach((doc) => allPlayers.push({ id: doc.id, ...doc.data() }));

            renderTopPlayers([...allPlayers].slice(0, 10));
            renderPlayers(allPlayers);
        } catch (error) {
            container.innerHTML = `<p class="text-error p-8 text-center">Failed to load players.</p>`;
        }
    }
    window.refreshPlayersList = loadPlayers;

    function getActionButtonHTML(player, currentUserUid, isSelf) {
        if (!currentUserUid) return `<button onclick="window.location.href='index.html'; event.stopPropagation();" class="w-full bg-surface-container hover:bg-surface-container-highest text-on-surface font-bold py-2 px-4 rounded-xl text-sm">Log in to connect</button>`;
        if (isSelf) return `<button onclick="window.location.href='profile.html'; event.stopPropagation();" class="w-full bg-surface-container-highest text-on-surface-variant font-bold py-2 px-4 rounded-xl text-sm">My Profile</button>`;

        const status = userConnectionsMap[player.id];
        if (status === 'accepted') return `<button disabled class="w-full bg-surface-container-highest text-primary font-bold py-2 px-4 rounded-xl text-sm opacity-80 cursor-default">Connected</button>`;
        if (status === 'pending') return `<button disabled class="w-full bg-surface-container-highest text-on-surface-variant font-bold py-2 px-4 rounded-xl text-sm cursor-default">Request Sent</button>`;
        if (status === 'received_pending') return `<button onclick="window.location.href='notifications.html'; event.stopPropagation();" class="w-full bg-secondary/10 text-secondary hover:bg-secondary/20 font-bold py-2 px-4 rounded-xl text-sm">Respond</button>`;
        
        return `<button onclick="window.sendConnectionRequest('${player.id}'); event.stopPropagation();" class="w-full bg-surface-container hover:bg-surface-container-highest text-on-surface font-bold py-2 px-4 rounded-xl text-sm">Connect</button>`;
    }

    function renderPlayers(players) {
        container.innerHTML = '';
        if (players.length === 0) return container.innerHTML = `<p class="text-on-surface-variant p-8 text-center col-span-full">No players found.</p>`;
        const currentUserUid = auth.currentUser ? auth.currentUser.uid : null;

        players.forEach(player => {
            const isSelf = currentUserUid === player.id;
            const actionButtonHtml = getActionButtonHTML(player, currentUserUid, isSelf);
            const safeName = escapeHTML(player.displayName || 'Unknown Player');
            const photo = escapeHTML(player.photoURL) || getFallbackAvatar(safeName);
            
            const card = document.createElement('div');
            card.className = 'bg-surface-container-high rounded-2xl p-6 flex flex-col gap-4 shadow-lg hover:shadow-xl transition-all border border-outline-variant/10 group cursor-pointer';
            card.onclick = () => window.location.href = `profile.html?id=${player.id}`;

            card.innerHTML = `
                <div class="flex items-start gap-4">
                    <div class="w-16 h-16 rounded-full overflow-hidden shrink-0 border-2 border-primary/20 group-hover:border-primary transition-colors bg-surface-container-highest">
                        <img src="${photo}" onerror="this.onerror=null; this.src='${getFallbackAvatar(safeName)}';" class="w-full h-full object-cover">
                    </div>
                    <div class="flex-1 min-w-0 pt-1">
                        <h3 class="font-headline font-black text-xl italic tracking-tight text-on-surface uppercase truncate">${safeName}</h3>
                        <span class="inline-flex items-center gap-1 px-2 py-0.5 mt-1 rounded-sm bg-primary/10 text-primary text-[10px] font-black uppercase tracking-wider">${escapeHTML(player.primaryPosition || 'Unassigned')}</span>
                    </div>
                </div>
                <p class="text-on-surface-variant text-sm line-clamp-2 mt-2 flex-1">${escapeHTML(player.bio || 'No bio available.')}</p>
                <div class="mt-2 pt-4 border-t border-outline-variant/10">${actionButtonHtml}</div>
            `;
            container.appendChild(card);
        });
    }

    function renderTopPlayers(topPlayers) {
        if (!topPlayersContainer) return;
        topPlayersContainer.innerHTML = '';
        const currentUserUid = auth.currentUser ? auth.currentUser.uid : null;

        topPlayers.forEach((player, index) => {
            const safeName = escapeHTML(player.displayName || 'Unknown Player');
            const photo = escapeHTML(player.photoURL) || getFallbackAvatar(safeName);
            
            const card = document.createElement('div');
            card.className = 'flex-none w-48 snap-start bg-surface-container-high rounded-xl p-4 border border-outline-variant/10 flex flex-col items-center text-center group hover:bg-surface-container-highest transition-colors cursor-pointer';
            card.onclick = () => window.location.href = `profile.html?id=${player.id}`;

            card.innerHTML = `
                <div class="relative mb-3">
                    <div class="w-20 h-20 rounded-full overflow-hidden border-2 border-primary/50 group-hover:border-primary transition-colors bg-surface-container-highest mx-auto">
                        <img src="${photo}" onerror="this.onerror=null; this.src='${getFallbackAvatar(safeName)}';" class="w-full h-full object-cover">
                    </div>
                    <div class="absolute -bottom-2 -right-2 bg-primary text-on-primary w-6 h-6 rounded-full flex items-center justify-center font-black text-xs shadow-md border-2 border-surface-container-high">${index + 1}</div>
                </div>
                <h4 class="font-headline font-black text-lg italic tracking-tight text-on-surface uppercase truncate w-full mb-1">${safeName}</h4>
                <span class="text-primary text-[10px] font-black uppercase tracking-wider mb-3">${escapeHTML(player.primaryPosition || 'Unassigned')}</span>
            `;
            topPlayersContainer.appendChild(card);
        });
    }

    function applyFilters() {
        const searchTerm = searchInput.value.toLowerCase().trim();
        const selectedPosition = positionFilter.value;
        const filtered = allPlayers.filter(player => (player.displayName || '').toLowerCase().includes(searchTerm) && (selectedPosition === '' || player.primaryPosition === selectedPosition));
        renderPlayers(filtered);
    }

    if (searchInput) searchInput.addEventListener('input', applyFilters);
    if (positionFilter) positionFilter.addEventListener('change', applyFilters);
    onAuthStateChanged(auth, () => loadPlayers());
});
