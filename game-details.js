import { auth, db } from './firebase-setup.js';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, collection, query, where, getDocs, limit } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
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

    function getFallbackAvatar(name) {
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'P')}&background=20262f&color=ff8f6f`;
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

    let currentGameData = null;
    let currentUser = null;
    let currentSlotTarget = null; // Tracks which slot we are currently managing

    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        updateJoinButtonState();
        if (currentGameData) {
            loadGameDetails(); // Re-render to unlock host features
        }
    });

    async function loadGameDetails() {
        try {
            const docRef = doc(db, "games", gameId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                currentGameData = { id: docSnap.id, ...docSnap.data() };
                await renderGameDetails(currentGameData);
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

    async function renderGameDetails(game) {
        const safeTitle = escapeHTML(game.title);
        const safeLocation = escapeHTML(game.location);
        const safeDesc = escapeHTML(game.description || "No description provided.");
        const safeHost = escapeHTML(game.host || "Unknown");
        const safeDate = escapeHTML(game.date);
        const safeTime = escapeHTML(game.time);
        const safeCategory = escapeHTML(game.category || 'Pickup');
        const safeSkill = escapeHTML(game.skillLevel || 'Open for all');

        const spotsTotal = parseInt(game.spotsTotal) || 10;
        const players = game.players || [safeHost];
        const spotsFilled = players.length;

        const gameStatus = getGameStatus(game.date, game.time);

        let currentUserDisplayName = "Unknown Player";
        if (currentUser) {
            const localProfile = localStorage.getItem('ligaPhProfile');
            if (localProfile) {
                try {
                    const parsed = JSON.parse(localProfile);
                    currentUserDisplayName = parsed.displayName || "Unknown Player";
                } catch(e) {}
            }
        }
        const isHost = currentUserDisplayName === game.host;

        let imageHtml = '';
        if (game.imageUrl) {
            imageHtml = `
                <div class="w-full h-64 md:h-80 rounded-3xl overflow-hidden mb-8 relative border border-outline-variant/20 shadow-xl group cursor-pointer" onclick="openImageModal('${escapeHTML(game.imageUrl)}')">
                    <img src="${escapeHTML(game.imageUrl)}" alt="${safeTitle}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700">
                    <div class="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent"></div>
                    <div class="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                        <span class="material-symbols-outlined text-white text-5xl opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg">zoom_in</span>
                    </div>
                </div>
            `;
        }
        
        let locationDisplayHtml = `<p class="font-black text-on-surface truncate w-full" title="${safeLocation}">${safeLocation}</p>`;
        if (game.mapLink) {
            locationDisplayHtml = `<a href="${escapeHTML(game.mapLink)}" target="_blank" class="font-black text-primary hover:underline truncate w-full flex items-center gap-1">${safeLocation} <span class="material-symbols-outlined text-[14px]">open_in_new</span></a>`;
        }

        const icon = getIconForType(game.type);

        let statusBadgeHtml = '';
        if (gameStatus === 'Ongoing') {
            statusBadgeHtml = `<div class="inline-flex items-center gap-2 px-3 py-1 bg-error/10 text-error border border-error/20 rounded-full text-xs font-black uppercase tracking-widest shadow-sm"><span class="w-2 h-2 rounded-full bg-error animate-pulse"></span> LIVE NOW</div>`;
        } else if (gameStatus === 'Completed') {
            statusBadgeHtml = `<div class="inline-flex items-center gap-2 px-3 py-1 bg-surface-container-highest text-outline border border-outline-variant/30 rounded-full text-xs font-black uppercase tracking-widest shadow-sm"><span class="material-symbols-outlined text-sm">check_circle</span> ENDED</div>`;
        } else {
            statusBadgeHtml = `<div class="inline-flex items-center gap-2 px-3 py-1 bg-primary/20 text-primary border border-primary/30 rounded-full text-xs font-black uppercase tracking-widest shadow-sm"><span class="w-2 h-2 rounded-full bg-primary"></span> UPCOMING</div>`;
        }

        mainContainer.classList.remove('animate-pulse');
        mainContainer.innerHTML = `
            ${imageHtml}

            <div class="mb-8 relative z-10 ${imageHtml ? '-mt-16' : 'mt-8'}">
                <div class="flex items-center flex-wrap gap-2 mb-4">
                    ${statusBadgeHtml}
                    <div class="inline-flex items-center gap-2 px-3 py-1 bg-surface-container-highest text-on-surface-variant rounded-full text-xs font-black uppercase tracking-widest border border-outline-variant/30 shadow-sm">
                        <span class="material-symbols-outlined text-sm">${icon}</span>
                        ${safeCategory} • ${escapeHTML(game.type)}
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
                        <span class="material-symbols-outlined text-secondary mb-2">military_tech</span>
                        <p class="text-[10px] text-outline uppercase font-bold tracking-widest">Skill Level</p>
                        <p class="font-black text-on-surface">${safeSkill}</p>
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

        // 1. Fetch user data for authentic Avatars
        const playerProfiles = {};
        for (let name of sortedPlayers) {
            if (!name.startsWith("Reserved Slot")) {
                try {
                    const q = query(collection(db, "users"), where("displayName", "==", name), limit(1));
                    const snap = await getDocs(q);
                    if (!snap.empty) {
                        playerProfiles[name] = { uid: snap.docs[0].id, ...snap.docs[0].data() };
                    }
                } catch(e) { console.error(e); }
            }
        }

        // 2. Render Roster Elements
        sortedPlayers.forEach((playerName) => {
            const isGameHost = playerName === game.host;
            const isReserved = playerName.startsWith("Reserved Slot");
            const safeName = escapeHTML(playerName);
            
            if (isReserved) {
                const canManage = isHost && gameStatus === 'Upcoming';
                const hostStyles = canManage ? 'cursor-pointer hover:border-primary/50 hover:text-primary transition-colors hover:shadow-md group' : 'opacity-70';
                const hostOnClick = canManage ? `onclick="window.openManageSlotModal('reserved', '${safeName}')"` : '';

                rosterContainer.innerHTML += `
                    <div class="bg-surface-container-highest p-4 rounded-xl relative border border-outline-variant/10 flex flex-col items-center text-center shadow-sm ${hostStyles}" ${hostOnClick}>
                        <div class="w-14 h-14 rounded-full bg-surface-variant flex items-center justify-center mb-3 border-2 border-outline-variant/30 overflow-hidden ${canManage ? 'group-hover:border-primary/50 group-hover:scale-105 transition-all' : ''}">
                            <span class="material-symbols-outlined text-outline-variant">lock</span>
                        </div>
                        <h5 class="font-bold text-sm text-on-surface truncate w-full">${safeName}</h5>
                        <p class="text-[10px] text-primary uppercase font-black mt-1">Reserved</p>
                        ${canManage ? '<span class="text-[8px] text-primary font-bold mt-1 opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-2">MANAGE</span>' : ''}
                    </div>
                `;
            } else {
                const profile = playerProfiles[playerName];
                const uid = profile?.uid;
                const photoUrl = escapeHTML(profile?.photoURL) || getFallbackAvatar(playerName);
                
                const clickableStyle = uid ? 'cursor-pointer hover:border-primary/50 transition-colors group' : '';
                const onClick = uid ? `onclick="window.location.href='profile.html?id=${uid}'"` : '';

                rosterContainer.innerHTML += `
                    <div class="bg-surface-container-highest p-4 rounded-xl relative border border-outline-variant/10 flex flex-col items-center text-center shadow-sm ${clickableStyle}" ${onClick}>
                        ${isGameHost ? '<div class="absolute top-2 right-2 bg-primary/20 text-primary border border-primary/30 text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-widest z-10">Host</div>' : ''}
                        <div class="w-14 h-14 rounded-full flex items-center justify-center mb-3 border-2 ${isGameHost ? 'border-primary' : 'border-outline-variant/30'} transition-all overflow-hidden ${uid ? 'group-hover:border-primary/50 group-hover:scale-105' : ''} bg-surface-container">
                            <img src="${photoUrl}" onerror="this.onerror=null; this.src='${getFallbackAvatar(playerName)}';" class="w-full h-full object-cover">
                        </div>
                        <h5 class="font-bold text-sm text-on-surface truncate w-full ${uid ? 'group-hover:text-primary transition-colors' : ''}">${safeName}</h5>
                        <p class="text-[10px] text-primary uppercase font-black mt-1">Player</p>
                    </div>
                `;
            }
        });

        // 3. Render Empty Slots
        const canManageOpen = isHost && gameStatus === 'Upcoming';
        const remainingSpots = spotsTotal - spotsFilled;
        
        for (let i = 0; i < remainingSpots; i++) {
            const hostStyles = canManageOpen ? 'cursor-pointer hover:border-primary/50 hover:text-primary transition-colors hover:opacity-100 group' : '';
            const hostOnClick = canManageOpen ? `onclick="window.openManageSlotModal('open')"` : '';
            const borderCurrent = canManageOpen ? 'border-current group-hover:scale-110 transition-transform' : 'border-outline-variant';
            const iconColor = canManageOpen ? '' : 'text-outline-variant';

            rosterContainer.innerHTML += `
                <div class="bg-surface-container-low p-4 rounded-xl border border-dashed border-outline-variant/30 flex flex-col items-center justify-center text-center opacity-50 h-full min-h-[140px] ${hostStyles}" ${hostOnClick}>
                    <div class="w-12 h-12 rounded-full border-2 border-dashed ${borderCurrent} flex items-center justify-center mb-2">
                        <span class="material-symbols-outlined ${iconColor}">add</span>
                    </div>
                    <span class="text-[10px] uppercase font-bold tracking-widest">Open Slot</span>
                    ${canManageOpen ? '<span class="text-[8px] text-primary font-bold mt-1 opacity-0 group-hover:opacity-100 transition-opacity">MANAGE</span>' : ''}
                </div>
            `;
        }
    }

    function updateJoinButtonState() {
        if (!currentGameData) return;

        const spotsTotal = parseInt(currentGameData.spotsTotal) || 10;
        const players = currentGameData.players || [];
        const spotsFilled = players.length;
        const gameStatus = getGameStatus(currentGameData.date, currentGameData.time);

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

        if (gameStatus === 'Ongoing' || gameStatus === 'Completed') {
            joinBtn.textContent = 'GAME CLOSED';
            joinBtn.disabled = true;
            joinBtn.className = 'bg-surface-container-highest border border-outline-variant/30 text-outline px-8 py-3 rounded-xl font-headline font-black uppercase tracking-widest opacity-50 cursor-not-allowed';
            statusText.textContent = gameStatus.toUpperCase();
            statusText.className = 'font-headline text-lg font-black text-outline';
        } else if (!currentUser) {
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
        const gameStatus = getGameStatus(currentGameData.date, currentGameData.time);

        if (gameStatus !== 'Upcoming') {
            alert("This game is no longer active.");
            return;
        }

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

    // --- GLOBAL MODAL FUNCTIONS ---
    window.openImageModal = function(url) {
        const modal = document.getElementById('image-modal');
        const img = document.getElementById('lightbox-image');
        img.src = url;
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            img.classList.remove('scale-95');
            img.classList.add('scale-100');
        }, 10);
    }

    document.getElementById('close-image-modal')?.addEventListener('click', () => {
        const modal = document.getElementById('image-modal');
        const img = document.getElementById('lightbox-image');
        modal.classList.add('opacity-0');
        img.classList.remove('scale-100');
        img.classList.add('scale-95');
        setTimeout(() => modal.classList.add('hidden'), 300);
    });

    // --- Slot Management Logic ---
    window.openManageSlotModal = function(type, slotName = null) {
        currentSlotTarget = slotName;
        const modal = document.getElementById('manage-slot-modal');
        const title = document.getElementById('manage-slot-title');
        const reserveBtn = document.getElementById('reserve-slot-btn');
        const removeBtn = document.getElementById('remove-reserve-btn');

        if (type === 'open') {
            title.textContent = 'Manage Open Slot';
            reserveBtn.classList.remove('hidden');
            removeBtn.classList.add('hidden');
        } else {
            title.textContent = 'Manage Reserved Slot';
            reserveBtn.classList.add('hidden');
            removeBtn.classList.remove('hidden');
        }

        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            modal.querySelector('div').classList.remove('scale-95');
            modal.querySelector('div').classList.add('scale-100');
        }, 10);
    }

    document.getElementById('close-slot-modal')?.addEventListener('click', () => {
        const modal = document.getElementById('manage-slot-modal');
        modal.classList.add('opacity-0');
        modal.querySelector('div').classList.remove('scale-100');
        modal.querySelector('div').classList.add('scale-95');
        setTimeout(() => modal.classList.add('hidden'), 300);
    });

    document.getElementById('reserve-slot-btn')?.addEventListener('click', async () => {
        if (!currentGameData) return;
        const btn = document.getElementById('reserve-slot-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span class="material-symbols-outlined animate-spin">refresh</span> RESERVING...';
        btn.disabled = true;

        try {
            const gameRef = doc(db, "games", gameId);
            const players = currentGameData.players || [];
            const spotsFilled = players.length;
            const spotsTotal = parseInt(currentGameData.spotsTotal) || 10;

            if (spotsFilled >= spotsTotal) {
                alert("Game is already full!");
                return;
            }

            let reservedCount = players.filter(p => p.startsWith('Reserved Slot')).length;
            let reservedName = `Reserved Slot ${reservedCount + 1}`;
            while(players.includes(reservedName)) {
                reservedCount++;
                reservedName = `Reserved Slot ${reservedCount + 1}`;
            }

            await updateDoc(gameRef, {
                players: arrayUnion(reservedName),
                spotsFilled: spotsFilled + 1
            });

            document.getElementById('close-slot-modal').click();
            await loadGameDetails(); 
        } catch (error) {
            console.error("Error reserving slot:", error);
            alert("Failed to reserve slot.");
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });

    document.getElementById('remove-reserve-btn')?.addEventListener('click', async () => {
        if (!currentGameData || !currentSlotTarget) return;
        const btn = document.getElementById('remove-reserve-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span class="material-symbols-outlined animate-spin">refresh</span> REMOVING...';
        btn.disabled = true;

        try {
            const gameRef = doc(db, "games", gameId);
            const players = currentGameData.players || [];
            
            if (players.includes(currentSlotTarget)) {
                await updateDoc(gameRef, {
                    players: arrayRemove(currentSlotTarget),
                    spotsFilled: players.length - 1
                });
            }

            document.getElementById('close-slot-modal').click();
            await loadGameDetails(); 
        } catch (error) {
            console.error("Error removing slot:", error);
            alert("Failed to remove reserved slot.");
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });

    document.getElementById('invite-connection-btn')?.addEventListener('click', () => {
        alert("Invite connections feature is coming soon! For now, you can manually reserve the slot.");
        document.getElementById('close-slot-modal').click();
    });

    loadGameDetails();
});
