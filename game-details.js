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
        mainContainer.innerHTML = '<div class="text-center text-error py-20 lg:col-span-12"><p class="text-2xl font-bold">Game Not Found</p><p class="mt-2 text-on-surface-variant">Invalid game ID.</p></div>';
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

    function formatTime12(timeString) {
        if (!timeString) return '--:--';
        try {
            let [hours, minutes] = timeString.split(':');
            let h = parseInt(hours, 10);
            const ampm = h >= 12 ? 'PM' : 'AM';
            h = h % 12;
            h = h ? h : 12; 
            return `${h.toString().padStart(2, '0')}:${minutes} ${ampm}`;
        } catch(e) { return timeString; }
    }

    function formatDateFriendly(dateString) {
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        } catch(e) { return dateString; }
    }

    function generateAvatar(name, isReserved = false) {
        if (isReserved) return `https://ui-avatars.com/api/?name=R&background=14171d&color=44484f&size=150`;
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'P')}&background=20262f&color=ff8f6f&size=150`;
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
    let currentSlotTarget = null; 

    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        updateJoinButtonState();
        if (currentGameData) loadGameDetails(); 
    });

    async function loadGameDetails() {
        try {
            const docRef = doc(db, "games", gameId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                currentGameData = { id: docSnap.id, ...docSnap.data() };
                if (!currentGameData.applicants) currentGameData.applicants = []; // Safety Init
                await renderGameDetails(currentGameData);
                updateJoinButtonState();
            } else {
                mainContainer.innerHTML = '<div class="text-center text-error py-20 lg:col-span-12"><p class="text-2xl font-bold">Game Not Found</p><p class="mt-2 text-on-surface-variant">This game may have been deleted.</p></div>';
            }
        } catch (error) {
            console.error("Error fetching game details:", error);
            mainContainer.innerHTML = '<div class="text-center text-error py-20 lg:col-span-12"><p class="text-2xl font-bold">Error Loading Game</p><p class="mt-2 text-on-surface-variant">Please try again later.</p></div>';
        }
    }

    // --- Global Accept/Decline Functions ---
    window.acceptApplicant = async function(playerName) {
        if(!confirm(`Accept ${playerName} into the game?`)) return;
        try {
            const gameRef = doc(db, "games", gameId);
            await updateDoc(gameRef, {
                applicants: arrayRemove(playerName),
                players: arrayUnion(playerName),
                spotsFilled: currentGameData.spotsFilled + 1
            });
            await loadGameDetails();
        } catch (e) { alert("Failed to accept applicant."); }
    }

    window.declineApplicant = async function(playerName) {
        if(!confirm(`Decline ${playerName}'s request?`)) return;
        try {
            const gameRef = doc(db, "games", gameId);
            await updateDoc(gameRef, {
                applicants: arrayRemove(playerName)
            });
            await loadGameDetails();
        } catch (e) { alert("Failed to decline applicant."); }
    }

    async function renderGameDetails(game) {
        const safeTitle = escapeHTML(game.title);
        const safeLocation = escapeHTML(game.location);
        const safeDesc = escapeHTML(game.description || "No description provided.");
        const safeHost = escapeHTML(game.host || "Unknown");
        const safeDate = formatDateFriendly(game.date);
        const safeTime = formatTime12(game.time);
        const safeCategory = escapeHTML(game.category || 'Open Run');
        const safeType = escapeHTML(game.type || '5v5');
        const safeSkill = escapeHTML(game.skillLevel || 'Open for all');

        const spotsTotal = parseInt(game.spotsTotal) || 10;
        const players = game.players || [safeHost];
        const applicants = game.applicants || [];
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

        const defaultImage = 'https://images.unsplash.com/photo-1546519638-68e109498ffc?q=80&w=2090&auto=format&fit=crop';
        const displayImage = game.imageUrl ? escapeHTML(game.imageUrl) : defaultImage;

        // FIXED: Using encodeURIComponent and proper Google Maps embed URL
        const safeLocSearch = encodeURIComponent(game.location || 'Metro Manila, Philippines');
        const mapEmbedUrl = `https://maps.google.com/maps?q=${safeLocSearch}&t=m&z=15&output=embed&iwloc=near`;

        // Waitlist / Join Requests HTML
        let waitlistHtml = '';
        if (isHost && applicants.length > 0) {
            let appList = applicants.map(name => {
                const safeAppName = escapeHTML(name);
                return `
                <div class="flex items-center justify-between bg-surface-container-highest p-3 rounded-xl border border-outline-variant/10">
                    <div class="flex items-center gap-3">
                        <img src="${getFallbackAvatar(safeAppName)}" class="w-10 h-10 rounded-lg object-cover border border-outline-variant/30">
                        <span class="font-bold text-sm text-on-surface">${safeAppName}</span>
                    </div>
                    <div class="flex gap-2 shrink-0">
                        <button onclick="window.declineApplicant('${safeAppName}')" class="px-3 md:px-4 py-2 rounded-lg bg-surface-container text-error border border-outline-variant/30 hover:border-error/50 transition-colors text-[9px] md:text-[10px] font-black tracking-widest uppercase">Decline</button>
                        <button onclick="window.acceptApplicant('${safeAppName}')" class="px-3 md:px-4 py-2 rounded-lg bg-primary/20 text-primary border border-primary/30 hover:bg-primary hover:text-on-primary-container transition-colors text-[9px] md:text-[10px] font-black tracking-widest uppercase">Accept</button>
                    </div>
                </div>
                `;
            }).join('');

            waitlistHtml = `
                <div class="bg-[#14171d] p-5 md:p-6 rounded-2xl border border-primary/30 shadow-md">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="font-headline text-lg font-black uppercase tracking-widest text-on-surface flex items-center gap-2">
                            <span class="material-symbols-outlined text-primary">person_add</span> Join Requests
                        </h3>
                        <span class="bg-primary/20 text-primary text-[10px] font-black px-2 py-1 rounded tracking-widest">${applicants.length} PENDING</span>
                    </div>
                    <div class="space-y-3">
                        ${appList}
                    </div>
                </div>
            `;
        }

        mainContainer.classList.remove('animate-pulse');
        mainContainer.innerHTML = `
            <div class="lg:col-span-8 space-y-4 md:space-y-6">
                <div class="relative w-full h-[300px] md:h-[420px] bg-surface-container-high rounded-3xl overflow-hidden border border-outline-variant/10 shadow-lg group">
                    <img src="${displayImage}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 cursor-pointer" onclick="${game.imageUrl ? `openImageModal('${displayImage}')` : ''}">
                    <div class="absolute inset-0 bg-gradient-to-t from-[#0a0e14] via-[#0a0e14]/60 to-transparent pointer-events-none"></div>
                    <div class="absolute bottom-6 left-6 md:bottom-10 md:left-10 z-10 pointer-events-none">
                        
                        <div class="flex flex-wrap items-center gap-2 mb-3 md:mb-4">
                            <div class="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/20 border border-primary/30 rounded-full shadow-sm backdrop-blur-sm">
                                <span class="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                                <span class="text-[10px] font-black uppercase tracking-widest text-primary">${safeCategory}</span>
                            </div>
                            <div class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface-container-highest border border-outline-variant/30 rounded-full shadow-sm backdrop-blur-sm text-on-surface">
                                <span class="material-symbols-outlined text-[14px]">groups</span>
                                <span class="text-[10px] font-black uppercase tracking-widest">${safeType}</span>
                            </div>
                        </div>

                        <h1 class="font-headline text-4xl md:text-6xl font-black italic uppercase tracking-tighter text-on-surface leading-[0.9] mb-3 drop-shadow-lg">${safeTitle}</h1>
                        <div class="text-on-surface-variant text-xs md:text-sm font-medium tracking-wide flex items-center gap-2">
                            <span class="uppercase tracking-widest text-[10px] font-bold text-outline">ORGANIZER:</span>
                            <span class="text-primary font-black text-sm md:text-base">${safeHost}</span>
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                    <div class="space-y-4 md:space-y-6 flex flex-col">
                        <div class="w-full h-48 md:h-56 bg-[#14171d] rounded-2xl border border-outline-variant/10 relative overflow-hidden shadow-sm p-1">
                            <iframe class="w-full h-full rounded-xl pointer-events-none md:pointer-events-auto" style="border:0; filter: invert(90%) hue-rotate(180deg) brightness(85%) contrast(85%);" loading="lazy" allowfullscreen referrerpolicy="no-referrer-when-downgrade" src="${mapEmbedUrl}"></iframe>
                        </div>
                        
                        <div class="bg-[#14171d] p-5 md:p-6 rounded-2xl border border-outline-variant/10 shadow-sm flex-1">
                            <h3 class="font-headline text-sm font-black uppercase tracking-widest text-on-surface mb-3">Court Details</h3>
                            <p class="text-on-surface-variant text-sm leading-relaxed">${safeDesc}</p>
                        </div>
                    </div>

                    <div class="bg-[#0f141a] border border-outline-variant/5 rounded-3xl p-5 md:p-6 flex flex-col">
                        <div class="flex justify-between items-end mb-6 border-b border-outline-variant/10 pb-4">
                            <h2 class="font-headline text-2xl font-black italic uppercase tracking-tighter text-on-surface">THE ROSTER</h2>
                            <span class="text-[10px] text-outline font-bold uppercase tracking-widest bg-surface-container-highest px-3 py-1 rounded-full">${spotsFilled} / ${spotsTotal} PLAYERS</span>
                        </div>
                        <div class="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 flex-1 content-start" id="roster-container">
                            </div>
                    </div>
                </div>
            </div>

            <div class="lg:col-span-4 flex flex-col gap-4 md:gap-6 mt-4 lg:mt-0">
                <div class="grid grid-cols-2 gap-4">
                    <div class="bg-[#14171d] p-4 md:p-5 rounded-2xl border border-outline-variant/10 shadow-sm flex flex-col justify-center">
                        <span class="material-symbols-outlined text-primary mb-2 md:mb-3 text-[22px]">calendar_today</span>
                        <p class="text-[9px] md:text-[10px] text-outline font-bold uppercase tracking-widest mb-1">DATE</p>
                        <p class="font-headline font-black text-on-surface text-sm md:text-base truncate">${safeDate}</p>
                    </div>
                    <div class="bg-[#14171d] p-4 md:p-5 rounded-2xl border border-outline-variant/10 shadow-sm flex flex-col justify-center">
                        <span class="material-symbols-outlined text-primary mb-2 md:mb-3 text-[22px]">schedule</span>
                        <p class="text-[9px] md:text-[10px] text-outline font-bold uppercase tracking-widest mb-1">TIME</p>
                        <p class="font-headline font-black text-on-surface text-sm md:text-base truncate">${safeTime}</p>
                    </div>
                    <div class="bg-[#14171d] p-4 md:p-5 rounded-2xl border border-outline-variant/10 shadow-sm flex flex-col justify-center">
                        <span class="material-symbols-outlined text-primary mb-2 md:mb-3 text-[22px]">location_on</span>
                        <p class="text-[9px] md:text-[10px] text-outline font-bold uppercase tracking-widest mb-1">LOCATION</p>
                        <p class="font-headline font-black text-on-surface text-sm md:text-base truncate" title="${safeLocation}">${safeLocation}</p>
                    </div>
                    <div class="bg-[#14171d] p-4 md:p-5 rounded-2xl border border-outline-variant/10 shadow-sm flex flex-col justify-center cursor-pointer hover:border-primary/50 transition-colors group" onclick="window.open('${game.mapLink || `https://maps.google.com/?q=${safeLocSearch}`}', '_blank')">
                        <span class="material-symbols-outlined text-primary mb-2 md:mb-3 text-[22px] group-hover:scale-110 transition-transform">map_search</span>
                        <p class="text-[9px] md:text-[10px] text-outline font-bold uppercase tracking-widest mb-1">MAP LINK</p>
                        <p class="font-headline font-black text-primary text-sm md:text-base truncate">Open Map App</p>
                    </div>
                </div>

                <div class="bg-[#14171d] p-5 md:p-6 rounded-2xl border border-outline-variant/10 shadow-sm flex items-center gap-5">
                    <div class="w-12 h-12 bg-secondary/10 text-secondary rounded-xl flex items-center justify-center shrink-0">
                        <span class="material-symbols-outlined text-[24px]">trending_up</span>
                    </div>
                    <div>
                        <p class="text-[9px] md:text-[10px] text-outline font-bold uppercase tracking-widest mb-1">SKILL LEVEL</p>
                        <p class="font-headline font-black text-on-surface text-base md:text-lg truncate">${safeSkill}</p>
                    </div>
                </div>

                ${waitlistHtml}
            </div>
        `;

        const rosterContainer = document.getElementById('roster-container');

        const sortedPlayers = [...players].sort((a, b) => {
            if (a === game.host) return -1;
            if (b === game.host) return 1;
            return 0;
        });

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

        sortedPlayers.forEach((playerName) => {
            const isGameHost = playerName === game.host;
            const isReserved = playerName.startsWith("Reserved Slot");
            const safeName = escapeHTML(playerName);
            
            if (isReserved) {
                const canManage = isHost && gameStatus === 'Upcoming';
                const hostStyles = canManage ? 'cursor-pointer hover:border-primary/50 hover:text-primary transition-colors hover:shadow-md group relative' : 'opacity-70 relative';
                const hostOnClick = canManage ? `onclick="window.openManageSlotModal('reserved', '${safeName}')"` : '';

                rosterContainer.innerHTML += `
                    <div class="bg-[#14171d] rounded-2xl p-4 flex flex-col items-center justify-center border border-outline-variant/10 text-center gap-2 shadow-sm ${hostStyles}" ${hostOnClick}>
                        <div class="w-14 h-14 md:w-16 md:h-16 rounded-xl bg-surface-variant flex items-center justify-center border border-outline-variant/20 overflow-hidden ${canManage ? 'group-hover:border-primary/50 group-hover:scale-105 transition-all' : ''}">
                            <span class="material-symbols-outlined text-outline-variant">lock</span>
                        </div>
                        <div class="w-full">
                            <p class="font-bold text-[13px] md:text-sm text-on-surface uppercase truncate w-full" title="${safeName}">${safeName}</p>
                            <p class="text-[8px] md:text-[9px] text-outline-variant/50 uppercase font-black tracking-widest mt-0.5 truncate">Reserved</p>
                        </div>
                        ${canManage ? '<span class="text-[8px] text-primary font-bold mt-1 opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-2">MANAGE</span>' : ''}
                    </div>
                `;
            } else {
                const profile = playerProfiles[playerName];
                const uid = profile?.uid;
                const photoUrl = escapeHTML(profile?.photoURL) || getFallbackAvatar(playerName);
                
                const clickableStyle = uid ? 'cursor-pointer hover:border-primary/50 transition-colors group relative' : 'relative';
                const onClick = uid ? `onclick="window.location.href='profile.html?id=${uid}'"` : '';

                rosterContainer.innerHTML += `
                    <div class="bg-[#14171d] rounded-2xl p-4 flex flex-col items-center justify-center border border-outline-variant/10 text-center gap-2 shadow-sm ${clickableStyle}" ${onClick}>
                        <div class="w-14 h-14 md:w-16 md:h-16 rounded-xl flex items-center justify-center border border-outline-variant/20 overflow-hidden ${uid ? 'group-hover:border-primary/50 group-hover:scale-105' : ''} bg-surface-container transition-all">
                            <img src="${photoUrl}" onerror="this.onerror=null; this.src='${getFallbackAvatar(playerName)}';" class="w-full h-full object-cover">
                        </div>
                        <div class="w-full">
                            <p class="font-bold text-[13px] md:text-sm text-on-surface uppercase truncate w-full ${uid ? 'group-hover:text-primary transition-colors' : ''}" title="${safeName}">${safeName}</p>
                            <p class="text-[8px] md:text-[9px] ${isGameHost ? 'text-primary' : 'text-outline-variant'} uppercase font-black tracking-widest mt-0.5 truncate">${isGameHost ? 'CAPTAIN' : 'PLAYER'}</p>
                        </div>
                    </div>
                `;
            }
        });

        const canManageOpen = isHost && gameStatus === 'Upcoming';
        const remainingSpots = spotsTotal - spotsFilled;
        
        for (let i = 0; i < remainingSpots; i++) {
            const hostStyles = canManageOpen ? 'cursor-pointer hover:border-primary/50 hover:text-primary transition-colors hover:opacity-100 group relative' : 'relative';
            const hostOnClick = canManageOpen ? `onclick="window.openManageSlotModal('open')"` : '';
            const borderCurrent = canManageOpen ? 'border-current group-hover:scale-110 transition-transform' : 'border-outline-variant';
            const iconColor = canManageOpen ? '' : 'text-outline-variant';

            rosterContainer.innerHTML += `
                <div class="bg-[#14171d]/40 rounded-2xl p-4 flex flex-col items-center justify-center border border-outline-variant/10 border-dashed text-center gap-2 opacity-60 ${hostStyles}" ${hostOnClick}>
                    <div class="w-14 h-14 md:w-16 md:h-16 rounded-xl border border-outline-variant/20 border-dashed flex items-center justify-center text-outline-variant bg-[#0a0e14]/50 ${borderCurrent} transition-all">
                        <span class="material-symbols-outlined text-[20px] ${iconColor}">person_add</span>
                    </div>
                    <div class="w-full">
                        <p class="font-bold text-[13px] md:text-sm text-outline-variant uppercase truncate w-full">Open Slot</p>
                        <p class="text-[8px] md:text-[9px] text-outline-variant/50 uppercase font-black tracking-widest mt-0.5 truncate">Available</p>
                    </div>
                    ${canManageOpen ? '<span class="text-[8px] text-primary font-bold mt-1 opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-2">MANAGE</span>' : ''}
                </div>
            `;
        }
    }

    function updateJoinButtonState() {
        if (!currentGameData) return;

        const spotsTotal = parseInt(currentGameData.spotsTotal) || 10;
        const players = currentGameData.players || [];
        const applicants = currentGameData.applicants || [];
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
        const isApplicant = currentUser && applicants.includes(userName);
        const isFull = spotsFilled >= spotsTotal;
        const needsApproval = currentGameData.joinPolicy === 'approval';

        joinBtn.className = "flex-1 px-6 h-14 rounded-xl font-headline font-black uppercase tracking-widest transition-all text-sm md:text-base flex items-center justify-center gap-2";

        if (gameStatus === 'Ongoing' || gameStatus === 'Completed') {
            joinBtn.innerHTML = `GAME CLOSED <span class="material-symbols-outlined text-[18px]">lock</span>`;
            joinBtn.disabled = true;
            joinBtn.classList.add('bg-surface-container-highest', 'border', 'border-outline-variant/30', 'text-outline', 'opacity-50', 'cursor-not-allowed');
            statusText.textContent = gameStatus.toUpperCase();
            statusText.className = 'font-headline text-lg font-black text-outline';
        } else if (!currentUser) {
            joinBtn.innerHTML = `LOG IN TO JOIN <span class="material-symbols-outlined text-[18px]">login</span>`;
            joinBtn.disabled = false;
            joinBtn.classList.add('bg-surface-container-highest', 'border', 'border-outline-variant/30', 'text-on-surface', 'hover:bg-surface-bright', 'active:scale-95');
            statusText.textContent = `${spotsFilled}/${spotsTotal} Filled`;
            statusText.className = 'font-headline text-lg font-black text-outline';
        } else if (isJoined) {
            joinBtn.innerHTML = `LEAVE GAME <span class="material-symbols-outlined text-[18px]">logout</span>`;
            joinBtn.disabled = false; 
            joinBtn.classList.add('bg-error/10', 'hover:bg-error/20', 'text-error', 'active:scale-95');
            statusText.textContent = "You're In!";
            statusText.className = 'font-headline text-lg font-black text-primary';
        } else if (isApplicant) {
            joinBtn.innerHTML = `REQUEST PENDING <span class="material-symbols-outlined text-[18px]">schedule</span>`;
            joinBtn.disabled = true;
            joinBtn.classList.add('bg-secondary/10', 'border', 'border-secondary/30', 'text-secondary', 'cursor-not-allowed');
            statusText.textContent = "Awaiting Host";
            statusText.className = 'font-headline text-lg font-black text-secondary';
        } else if (isFull) {
            joinBtn.innerHTML = `GAME FULL <span class="material-symbols-outlined text-[18px]">block</span>`;
            joinBtn.disabled = true;
            joinBtn.classList.add('bg-[#14171d]', 'border', 'border-outline-variant/20', 'text-outline', 'opacity-50', 'cursor-not-allowed');
            statusText.textContent = "Waitlist only";
            statusText.className = 'font-headline text-lg font-black text-error';
        } else if (needsApproval) {
            joinBtn.innerHTML = `REQUEST TO JOIN <span class="material-symbols-outlined text-[20px]">person_add</span>`;
            joinBtn.disabled = false;
            joinBtn.classList.add('bg-[#14171d]', 'text-primary', 'border', 'border-primary/30', 'hover:bg-primary', 'hover:text-on-primary-container', 'active:scale-95');
            statusText.textContent = `Approval Required`;
            statusText.className = 'font-headline text-lg font-black text-outline';
        } else {
            joinBtn.innerHTML = `JOIN GAME <span class="material-symbols-outlined text-[20px]">chevron_right</span>`;
            joinBtn.disabled = false;
            joinBtn.classList.add('bg-primary', 'text-on-primary-container', 'shadow-[0_0_30px_rgba(255,143,111,0.25)]', 'hover:brightness-110', 'active:scale-95');
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
            if(!confirm("Are you sure you want to give up your spot?")) return;
            try {
                joinBtn.innerHTML = `<span class="material-symbols-outlined animate-spin">refresh</span>`;
                joinBtn.disabled = true;

                const gameRef = doc(db, "games", gameId);
                await updateDoc(gameRef, {
                    players: arrayRemove(userName),
                    spotsFilled: Math.max(0, spotsFilled - 1)
                });
                await loadGameDetails();
            } catch (error) {
                alert("Failed to leave game.");
                updateJoinButtonState();
            }
            return;
        }

        if (isFull) {
            alert("This game is already full.");
            return;
        }

        try {
            joinBtn.innerHTML = `<span class="material-symbols-outlined animate-spin">refresh</span>`;
            joinBtn.disabled = true;

            const gameRef = doc(db, "games", gameId);

            if (currentGameData.joinPolicy === 'approval') {
                await updateDoc(gameRef, {
                    applicants: arrayUnion(userName)
                });
                alert("Your join request has been sent to the organizer.");
            } else {
                await updateDoc(gameRef, {
                    players: arrayUnion(userName),
                    spotsFilled: spotsFilled + 1
                });
            }
            await loadGameDetails();

        } catch (error) {
            console.error("Error joining game:", error);
            alert("Action failed. Please try again.");
            updateJoinButtonState();
        }
    });

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
});
