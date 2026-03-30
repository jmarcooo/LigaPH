import { auth, db } from './firebase-setup.js';
import { doc, getDoc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

document.addEventListener('DOMContentLoaded', async () => {
    const mainContainer = document.getElementById('game-details-main');
    const joinBtn = document.getElementById('join-game-btn');
    const statusText = document.getElementById('game-status-text');

    const urlParams = new URLSearchParams(window.location.search);
    const gameId = urlParams.get('id');

    if (!gameId) {
        mainContainer.innerHTML = '<div class="text-center text-error py-20"><p class="text-2xl font-bold">Game Not Found</p><p class="mt-2 text-on-surface-variant">Invalid game ID.</p></div>';
        return;
    }

    function escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    let currentGameData = null;
    let currentUser = null;

    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        updateJoinButtonState();
    });

    async function loadGameDetails() {
        try {
            const docRef = doc(db, "games", gameId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                currentGameData = { id: docSnap.id, ...docSnap.data() };
                renderGameDetails(currentGameData);
                updateJoinButtonState();
            } else {
                mainContainer.innerHTML = '<div class="text-center text-error py-20"><p class="text-2xl font-bold">Game Not Found</p><p class="mt-2 text-on-surface-variant">This game may have been deleted.</p></div>';
            }
        } catch (error) {
            console.error("Error fetching game details:", error);
            mainContainer.innerHTML = '<div class="text-center text-error py-20"><p class="text-2xl font-bold">Error Loading Game</p><p class="mt-2 text-on-surface-variant">Please try again later.</p></div>';
        }
    }

    function getIconForType(type) {
        switch(type) {
            case '5v5': return 'sports_basketball';
            case '3v3': return 'directions_run';
            case 'Training': return 'fitness_center';
            default: return 'sports_basketball';
        }
    }

    function renderGameDetails(game) {
        const safeTitle = escapeHTML(game.title);
        const safeLocation = escapeHTML(game.location);
        const safeDesc = escapeHTML(game.description || "No description provided.");
        const safeHost = escapeHTML(game.host || "Unknown");
        const safeDate = escapeHTML(game.date);
        const safeTime = escapeHTML(game.time);
        const safeCategory = escapeHTML(game.category || 'Pickup');

        const spotsTotal = parseInt(game.spotsTotal) || 10;
        const players = game.players || [safeHost];
        const spotsFilled = players.length;

        let imageHtml = '';
        if (game.imageUrl) {
            imageHtml = `
                <div class="w-full h-64 md:h-80 rounded-3xl overflow-hidden mb-8 relative border border-outline-variant/20 shadow-xl group">
                    <img src="${escapeHTML(game.imageUrl)}" alt="${safeTitle}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700">
                    <div class="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent"></div>
                </div>
            `;
        }
        
        let locationDisplayHtml = `<p class="font-black text-on-surface truncate w-full" title="${safeLocation}">${safeLocation}</p>`;
        if (game.mapLink) {
            locationDisplayHtml = `<a href="${escapeHTML(game.mapLink)}" target="_blank" class="font-black text-primary hover:underline truncate w-full flex items-center gap-1">${safeLocation} <span class="material-symbols-outlined text-[14px]">open_in_new</span></a>`;
        }

        const icon = getIconForType(game.type);

        mainContainer.classList.remove('animate-pulse');
        mainContainer.innerHTML = `
            ${imageHtml}

            <div class="mb-8 relative z-10 ${imageHtml ? '-mt-16' : 'mt-8'}">
                <div class="flex items-center flex-wrap gap-2 mb-4">
                    <div class="inline-flex items-center gap-2 px-3 py-1 bg-primary/20 text-primary rounded-full text-xs font-black uppercase tracking-widest backdrop-blur-md border border-primary/30 shadow-sm">
                        <span class="material-symbols-outlined text-sm">${icon}</span>
                        ${safeCategory} • ${escapeHTML(game.type)}
                    </div>
                    <div class="inline-flex items-center gap-2 px-3 py-1 bg-surface-container-high text-on-surface-variant rounded-full text-xs font-black uppercase tracking-widest backdrop-blur-md border border-outline-variant/30 shadow-sm">
                        <span class="material-symbols-outlined text-sm">tag</span>
                        ID: ${escapeHTML(game.id)}
                    </div>
                </div>
                <h1 class="text-4xl md:text-5xl lg:text-6xl font-black italic tracking-tighter text-on-surface uppercase mb-4 leading-none text-shadow-sm">${safeTitle}</h1>
                <p class="text-lg text-on-surface-variant flex items-center gap-2 mb-6">
                    <span class="material-symbols-outlined text-secondary">person</span>
                    Hosted by <span class="font-bold text-on-surface">${safeHost}</span>
                </p>

                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <div class="bg-surface-container-high p-4 rounded-xl border border-outline-variant/10 flex flex-col justify-center items-start shadow-sm hover:shadow-md hover:bg-surface-bright transition-all">
                        <span class="material-symbols-outlined text-secondary mb-2">calendar_month</span>
                        <p class="text-[10px] text-outline uppercase font-bold tracking-widest">Date</p>
                        <p class="font-black text-on-surface">${safeDate}</p>
                    </div>
                    <div class="bg-surface-container-high p-4 rounded-xl border border-outline-variant/10 flex flex-col justify-center items-start shadow-sm hover:shadow-md hover:bg-surface-bright transition-all">
                        <span class="material-symbols-outlined text-secondary mb-2">schedule</span>
                        <p class="text-[10px] text-outline uppercase font-bold tracking-widest">Time</p>
                        <p class="font-black text-on-surface">${safeTime}</p>
                    </div>
                    <div class="bg-surface-container-high p-4 rounded-xl border border-outline-variant/10 flex flex-col justify-center items-start shadow-sm hover:shadow-md hover:bg-surface-bright transition-all">
                        <span class="material-symbols-outlined text-secondary mb-2">location_on</span>
                        <p class="text-[10px] text-outline uppercase font-bold tracking-widest">Location</p>
                        ${locationDisplayHtml}
                    </div>
                    <div class="bg-surface-container-high p-4 rounded-xl border border-outline-variant/10 flex flex-col justify-center items-start shadow-sm hover:shadow-md hover:bg-surface-bright transition-all">
                        <span class="material-symbols-outlined text-secondary mb-2">groups</span>
                        <p class="text-[10px] text-outline uppercase font-bold tracking-widest">Roster</p>
                        <p class="font-black ${spotsFilled >= spotsTotal ? 'text-error' : 'text-primary'}">${spotsFilled} / ${spotsTotal} Filled</p>
                    </div>
                </div>

                <div class="bg-surface-container-low p-6 rounded-2xl border-l-4 border-primary mb-10 shadow-sm">
                    <h3 class="font-headline text-lg font-black uppercase tracking-tight mb-3 flex items-center gap-2">
                        <span class="material-symbols-outlined text-primary">info</span>
                        Details
                    </h3>
                    <p class="text-on-surface-variant leading-relaxed whitespace-pre-wrap">${safeDesc}</p>
                </div>

                <h3 class="font-headline text-2xl font-black uppercase tracking-tighter mb-6 flex items-center justify-between border-b border-outline-variant/10 pb-4">
                    <span>The Roster <span class="text-outline font-normal ml-2 text-lg">${spotsFilled}/${spotsTotal}</span></span>
                </h3>

                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4" id="roster-container">
                    </div>
            </div>
        `;

        const rosterContainer = document.getElementById('roster-container');

        const sortedPlayers = [...players].sort((a, b) => {
            if (a === game.host) return -1;
            if (b === game.host) return 1;
            return 0;
        });

        sortedPlayers.forEach((playerName) => {
            const isHost = playerName === game.host;
            const safeName = escapeHTML(playerName);
            rosterContainer.innerHTML += `
                <div class="bg-surface-container-highest p-4 rounded-xl relative group border border-outline-variant/10 hover:border-primary/30 transition-all flex flex-col items-center text-center shadow-sm">
                    ${isHost ? '<div class="absolute top-2 right-2 bg-primary/20 text-primary border border-primary/30 text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-widest">Host</div>' : ''}
                    <div class="w-14 h-14 rounded-full bg-surface-variant flex items-center justify-center mb-3 border-2 ${isHost ? 'border-primary' : 'border-outline-variant/30 group-hover:border-primary/50'} transition-colors overflow-hidden">
                        <span class="material-symbols-outlined text-outline-variant">person</span>
                    </div>
                    <h5 class="font-bold text-sm text-on-surface truncate w-full">${safeName}</h5>
                    <p class="text-[10px] text-primary uppercase font-black mt-1">Player</p>
                </div>
            `;
        });

        const remainingSpots = spotsTotal - spotsFilled;
        for (let i = 0; i < remainingSpots; i++) {
            rosterContainer.innerHTML += `
                <div class="bg-surface-container-low p-4 rounded-xl border border-dashed border-outline-variant/30 flex flex-col items-center justify-center text-center opacity-50 h-full min-h-[140px]">
                    <div class="w-12 h-12 rounded-full border-2 border-dashed border-outline-variant flex items-center justify-center mb-2">
                        <span class="material-symbols-outlined text-outline-variant">add</span>
                    </div>
                    <span class="text-[10px] text-outline uppercase font-bold tracking-widest">Open Slot</span>
                </div>
            `;
        }
    }

    function updateJoinButtonState() {
        if (!currentGameData) return;

        const spotsTotal = parseInt(currentGameData.spotsTotal) || 10;
        const players = currentGameData.players || [];
        const spotsFilled = players.length;

        let userName = "Unknown Player";
        if (currentUser) {
             const localProfile = localStorage.getItem('ligaPhProfile');
             if (localProfile) {
                 try {
                     const parsed = JSON.parse(localProfile);
                     userName = parsed.displayName || "Unknown Player";
                 } catch(e) {}
             }
        }

        const isJoined = currentUser && players.includes(userName);
        const isFull = spotsFilled >= spotsTotal;

        if (!currentUser) {
            joinBtn.textContent = 'LOG IN TO JOIN';
            joinBtn.disabled = false;
            joinBtn.className = 'bg-surface-variant hover:bg-surface-bright text-on-surface px-8 py-3 rounded-xl font-headline font-black uppercase tracking-widest transition-all';
            statusText.textContent = `${spotsFilled}/${spotsTotal} Filled`;
            statusText.className = 'font-headline text-lg font-black text-outline';
        } else if (isJoined) {
            joinBtn.textContent = 'LEAVE GAME';
            joinBtn.disabled = false; 
            joinBtn.className = 'bg-error/10 hover:bg-error/20 text-error px-8 py-3 rounded-xl font-headline font-black uppercase tracking-widest transition-all';
            statusText.textContent = "You're In!";
            statusText.className = 'font-headline text-lg font-black text-primary';
        } else if (isFull) {
            joinBtn.textContent = 'GAME FULL';
            joinBtn.disabled = true;
            joinBtn.className = 'bg-surface-variant text-outline px-8 py-3 rounded-xl font-headline font-black uppercase tracking-widest opacity-50 cursor-not-allowed';
            statusText.textContent = "Waitlist only";
            statusText.className = 'font-headline text-lg font-black text-error';
        } else {
            joinBtn.textContent = 'JOIN GAME';
            joinBtn.disabled = false;
            joinBtn.className = 'bg-primary hover:brightness-110 active:scale-95 text-on-primary px-8 py-3 rounded-xl font-headline font-black uppercase tracking-widest shadow-lg shadow-primary/20 transition-all';
            statusText.textContent = `${spotsTotal - spotsFilled} Spots Left`;
            statusText.className = 'font-headline text-lg font-black text-primary';
        }
    }

    joinBtn.addEventListener('click', async () => {
        if (!currentUser) {
            window.location.href = 'index.html';
            return;
        }

        if (!currentGameData) return;

        const spotsTotal = parseInt(currentGameData.spotsTotal) || 10;
        const players = currentGameData.players || [];
        const spotsFilled = players.length;

        let userName = "Unknown Player";
        const localProfile = localStorage.getItem('ligaPhProfile');
        if (localProfile) {
            try {
                const parsed = JSON.parse(localProfile);
                userName = parsed.displayName || "Unknown Player";
            } catch(e) {}
        }

        const isJoined = players.includes(userName);
        const isFull = spotsFilled >= spotsTotal;

        if (isJoined) {
            alert("Leave game functionality is coming soon.");
            return;
        }

        if (isFull) {
            alert("This game is already full.");
            return;
        }

        try {
            joinBtn.textContent = 'JOINING...';
            joinBtn.disabled = true;

            const gameRef = doc(db, "games", gameId);

            await updateDoc(gameRef, {
                players: arrayUnion(userName),
                spotsFilled: spotsFilled + 1
            });

            await loadGameDetails();

        } catch (error) {
            console.error("Error joining game:", error);
            alert("Failed to join the game. Please try again.");
            updateJoinButtonState();
        }
    });

    loadGameDetails();
});
