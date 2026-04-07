import { auth, db } from './firebase-setup.js';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, collection, query, where, getDocs, limit, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

document.addEventListener('DOMContentLoaded', async () => {
    const mainContainer = document.getElementById('game-details-main');
    let joinBtn = document.getElementById('join-game-btn'); // Will be cloned & replaced
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

    // NEW GLOBALS FOR SQUAD MATCHUPS
    let isSquadMatch = false;
    let squad1Data = null; 
    let squad2Data = null; 

    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        if (currentGameData) {
            updateJoinButtonState();
        } else {
            loadGameDetails(); 
        }
    });

    async function loadGameDetails() {
        try {
            const docRef = doc(db, "games", gameId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                currentGameData = { id: docSnap.id, ...docSnap.data() };
                if (!currentGameData.applicants) currentGameData.applicants = []; 

                // DETECT SQUAD MATCH & FETCH SQUADS
                const safeTitle = currentGameData.title || "";
                isSquadMatch = currentGameData.type === "5v5 Squad Match";
                
                if (isSquadMatch) {
                    const abbrMatch = safeTitle.match(/\[(.*?)\]/g);
                    if (abbrMatch && abbrMatch.length >= 2) {
                        const abbr1 = abbrMatch[0].replace(/\[|\]/g, ''); 
                        const abbr2 = abbrMatch[1].replace(/\[|\]/g, ''); 

                        const q1 = query(collection(db, "squads"), where("abbreviation", "==", abbr1));
                        const snap1 = await getDocs(q1);
                        if (!snap1.empty) {
                            squad1Data = { id: snap1.docs[0].id, ...snap1.docs[0].data() };
                            if (!squad1Data.members) squad1Data.members = [];
                            if (squad1Data.captainId && !squad1Data.members.includes(squad1Data.captainId)) squad1Data.members.unshift(squad1Data.captainId);
                        }

                        const q2 = query(collection(db, "squads"), where("abbreviation", "==", abbr2));
                        const snap2 = await getDocs(q2);
                        if (!snap2.empty) {
                            squad2Data = { id: snap2.docs[0].id, ...snap2.docs[0].data() };
                            if (!squad2Data.members) squad2Data.members = [];
                            if (squad2Data.captainId && !squad2Data.members.includes(squad2Data.captainId)) squad2Data.members.unshift(squad2Data.captainId);
                        }
                    }
                }

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

    async function fetchUsersByUids(uidArray) {
        if (!uidArray || uidArray.length === 0) return [];
        const users = [];
        for (const uid of uidArray) {
            try {
                const userSnap = await getDoc(doc(db, "users", uid));
                if (userSnap.exists()) users.push({ uid, ...userSnap.data() });
            } catch (e) { console.warn(`Could not fetch user ${uid}`); }
        }
        return users;
    }

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
            await updateDoc(gameRef, { applicants: arrayRemove(playerName) });
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
        const safeCategory = escapeHTML(game.category || 'Matchup');
        const safeType = escapeHTML(game.type || '5v5');
        const safeSkill = escapeHTML(game.skillLevel || 'Competitive');

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
        
        const isHost = !isSquadMatch && currentUserDisplayName === game.host;
        const defaultImage = 'https://images.unsplash.com/photo-1546519638-68e109498ffc?q=80&w=2090&auto=format&fit=crop';
        const displayImage = game.imageUrl ? escapeHTML(game.imageUrl) : defaultImage;

        const safeLocSearch = encodeURIComponent(game.location || 'Metro Manila, Philippines');
        const mapEmbedUrl = `https://maps.google.com/maps?q=${safeLocSearch}&t=m&z=15&output=embed&iwloc=near`;

        const manageGameHtml = isHost ? `
            <button onclick="alert('Game Management Dashboard coming soon!')" class="absolute top-4 right-4 md:top-6 md:right-6 z-20 bg-[#0a0e14]/80 backdrop-blur-md border border-outline-variant/30 text-on-surface hover:text-primary hover:border-primary/50 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg flex items-center gap-2 cursor-pointer">
                <span class="material-symbols-outlined text-[16px]">edit_square</span>
                Manage Game
            </button>
        ` : '';

        let waitlistHtml = '';
        if (isHost && !isSquadMatch) {
            let appList = '';
            if (applicants.length > 0) {
                appList = applicants.map(name => {
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
            } else {
                appList = `<p class="text-xs text-outline italic text-center py-6">No pending join requests at this time.</p>`;
            }

            waitlistHtml = `
                <div class="bg-[#14171d] p-5 md:p-6 rounded-2xl border border-primary/30 shadow-md">
                    <div class="flex justify-between items-center mb-4 border-b border-outline-variant/10 pb-3">
                        <h3 class="font-headline text-lg font-black uppercase tracking-widest text-on-surface flex items-center gap-2">
                            <span class="material-symbols-outlined text-primary">how_to_reg</span> Pending Joins
                        </h3>
                        <span class="bg-primary/20 text-primary text-[10px] font-black px-2 py-1 rounded tracking-widest">${applicants.length} PENDING</span>
                    </div>
                    <div class="space-y-3">
                        ${appList}
                    </div>
                </div>
            `;
        }

        // =========================================================
        // SQUAD ROSTER BUILDER: Handles the 5v5 explicit slots
        // =========================================================
        let rosterSectionHtml = '';
        const isSquadMatchValid = isSquadMatch && squad1Data && squad2Data;

        if (isSquadMatchValid) {
            const sq1Users = await fetchUsersByUids(squad1Data.members);
            const sq2Users = await fetchUsersByUids(squad2Data.members);
            const posMap = { 'PG': 'Point Guard', 'SG': 'Shooting Guard', 'SF': 'Small Forward', 'PF': 'Power Forward', 'C': 'Center' };

            const buildSquadRoster = (squad, users, label, labelColor) => {
                // Find users who are officially checked into this game
                const teamPlayers = users.filter(u => game.players.includes(u.displayName) || game.players.includes(u.uid));
                const isThisSquadCaptain = currentUser && currentUser.uid === squad.captainId;
                const canManage = isThisSquadCaptain && gameStatus === 'Upcoming';

                let html = `
                    <div class="bg-[#14171d] rounded-2xl p-4 md:p-5 border border-outline-variant/10 shadow-sm flex flex-col h-full">
                        <div class="flex items-center gap-4 mb-4 border-b border-outline-variant/10 pb-4">
                            <div class="w-14 h-14 rounded-xl bg-surface-container flex items-center justify-center overflow-hidden shrink-0 border border-outline-variant/20 shadow-inner">
                                <img src="${escapeHTML(squad.logoUrl)}" onerror="this.onerror=null; this.src='${getFallbackAvatar(squad.name)}';" class="w-full h-full object-cover">
                            </div>
                            <div class="min-w-0">
                                <p class="text-[9px] font-bold text-${labelColor} uppercase tracking-widest flex items-center gap-1 mb-0.5"><span class="material-symbols-outlined text-[12px]">${label === 'Challenged' ? 'shield' : 'swords'}</span> ${label}</p>
                                <p class="font-headline font-black italic uppercase text-lg text-on-surface truncate leading-tight"><span class="text-outline-variant">[${escapeHTML(squad.abbreviation)}]</span> ${escapeHTML(squad.name)}</p>
                            </div>
                        </div>
                        <div class="space-y-2 flex-1">
                `;

                // 1. Render all filled slots
                teamPlayers.forEach(u => {
                    const isCaptain = u.uid === squad.captainId;
                    const safeName = escapeHTML(u.displayName || 'Unknown');
                    const photoUrl = escapeHTML(u.photoURL) || getFallbackAvatar(safeName);
                    const rawPos = u.primaryPosition || 'Unassigned';
                    const fullPos = posMap[rawPos] || rawPos;

                    html += `
                        <div class="flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface-container-highest transition-colors cursor-pointer group border border-transparent hover:border-outline-variant/10" onclick="window.location.href='profile.html?id=${u.uid}'">
                            <img src="${photoUrl}" onerror="this.onerror=null; this.src='${getFallbackAvatar(safeName)}';" class="w-10 h-10 rounded-full object-cover border border-outline-variant/30 bg-surface-container shrink-0">
                            <div class="min-w-0 flex-1">
                                <p class="font-bold text-sm text-on-surface truncate group-hover:text-primary transition-colors">${safeName}</p>
                                <div class="flex items-center gap-2 mt-0.5">
                                    ${isCaptain ? `<span class="bg-primary/20 text-primary px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest">CAPTAIN</span>` : ''}
                                    <span class="text-[9px] text-outline-variant font-medium truncate">${fullPos}</span>
                                </div>
                            </div>
                        </div>
                    `;
                });

                // 2. Render remaining Empty Slots (Pad up to 5)
                const emptySlotsCount = Math.max(0, 5 - teamPlayers.length);
                for (let i = 0; i < emptySlotsCount; i++) {
                    const hostStyles = canManage ? 'cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all group' : 'opacity-50';
                    const hostOnClick = canManage ? `onclick="window.openSquadInviteModal('${squad.id}')"` : '';
                    const iconColor = canManage ? 'group-hover:text-primary text-outline-variant' : 'text-outline-variant';

                    html += `
                        <div class="flex items-center gap-3 p-2.5 rounded-xl border border-outline-variant/20 border-dashed ${hostStyles}" ${hostOnClick}>
                            <div class="w-10 h-10 rounded-full border border-outline-variant/30 border-dashed flex items-center justify-center bg-surface-container shrink-0 ${canManage ? 'group-hover:border-primary/50 group-hover:bg-primary/10 transition-colors' : ''}">
                                <span class="material-symbols-outlined text-[18px] ${iconColor}">person_add</span>
                            </div>
                            <div class="min-w-0 flex-1">
                                <p class="font-bold text-sm text-outline-variant truncate ${canManage ? 'group-hover:text-primary transition-colors' : ''}">Open Slot</p>
                                <div class="flex items-center gap-2 mt-0.5">
                                    <span class="text-[9px] text-outline-variant/50 font-black uppercase tracking-widest truncate">Available</span>
                                </div>
                            </div>
                            ${canManage ? '<span class="text-[8px] text-primary font-bold opacity-0 group-hover:opacity-100 transition-opacity pr-2 tracking-widest">INVITE</span>' : ''}
                        </div>
                    `;
                }

                html += `</div></div>`;
                return html;
            };

            const sq1Html = buildSquadRoster(squad1Data, sq1Users, 'Challenged', 'primary');
            const sq2Html = buildSquadRoster(squad2Data, sq2Users, 'Challenger', 'error');

            rosterSectionHtml = `
                <div class="bg-[#0f141a] border border-outline-variant/5 rounded-3xl p-5 md:p-6 flex flex-col">
                    <div class="flex justify-between items-end mb-6 border-b border-outline-variant/10 pb-4">
                        <h2 class="font-headline text-2xl font-black italic uppercase tracking-tighter text-on-surface">SQUAD MATCHUP</h2>
                        <span class="text-[10px] text-outline font-bold uppercase tracking-widest bg-surface-container-highest px-3 py-1 rounded-full">5V5 THROWDOWN</span>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                        ${sq1Html}
                        ${sq2Html}
                    </div>
                </div>
            `;
        } else {
            // Normal Pick-up Game Layout
            rosterSectionHtml = `
                <div class="bg-[#0f141a] border border-outline-variant/5 rounded-3xl p-5 md:p-6 flex flex-col">
                    <div class="flex justify-between items-end mb-6 border-b border-outline-variant/10 pb-4">
                        <h2 class="font-headline text-2xl font-black italic uppercase tracking-tighter text-on-surface">THE ROSTER</h2>
                        <span class="text-[10px] text-outline font-bold uppercase tracking-widest bg-surface-container-highest px-3 py-1 rounded-full">${spotsFilled} / ${spotsTotal} PLAYERS</span>
                    </div>
                    <div class="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 flex-1 content-start" id="roster-container">
                        </div>
                </div>
            `;
        }

        // =========================================================
        // INJECT FINAL HTML
        // =========================================================
        mainContainer.classList.remove('animate-pulse');
        mainContainer.innerHTML = `
            <div class="lg:col-span-8 space-y-4 md:space-y-6">
                <div class="relative w-full h-[300px] md:h-[420px] bg-surface-container-high rounded-3xl overflow-hidden border border-outline-variant/10 shadow-lg group">
                    <img src="${displayImage}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 cursor-pointer" onclick="${game.imageUrl ? `window.openImageModal('${displayImage}')` : ''}">
                    <div class="absolute inset-0 bg-gradient-to-t from-[#0a0e14] via-[#0a0e14]/60 to-transparent pointer-events-none"></div>
                    
                    ${manageGameHtml}

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

                    ${rosterSectionHtml}
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
                    <div class="bg-[#14171d] p-4 md:p-5 rounded-2xl border border-outline-variant/10 shadow-sm flex flex-col justify-center cursor-pointer hover:border-primary/50 transition-colors group" onclick="window.open('${game.mapLink || `https://maps.google.com/maps?q=${safeLocSearch}`}', '_blank')">
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

        if (!isSquadMatchValid) {
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
    }

    function updateJoinButtonState() {
        if (!currentGameData) return;

        // Strip old listeners to prevent bugs
        const newJoinBtn = joinBtn.cloneNode(true);
        joinBtn.parentNode.replaceChild(newJoinBtn, joinBtn);
        joinBtn = newJoinBtn;

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

        // --- SQUAD MATCH BUTTON LOGIC ---
        if (isSquadMatch) {
            let isActuallyPlaying = false;
            let isSquadMember = false;

            if (currentUser) {
                isActuallyPlaying = currentGameData.players.includes(userName) || currentGameData.players.includes(currentUser.uid);
                if (squad1Data && squad2Data) {
                    if ((squad1Data.members || []).includes(currentUser.uid) || (squad2Data.members || []).includes(currentUser.uid)) {
                        isSquadMember = true;
                    }
                }
            }

            joinBtn.className = "flex-1 px-6 h-14 rounded-xl font-headline font-black uppercase tracking-widest transition-all text-sm md:text-base flex items-center justify-center gap-2";

            if (gameStatus === 'Ongoing' || gameStatus === 'Completed') {
                joinBtn.innerHTML = `MATCH CLOSED <span class="material-symbols-outlined text-[18px]">lock</span>`;
                joinBtn.disabled = true;
                joinBtn.classList.add('bg-surface-container-highest', 'border', 'border-outline-variant/30', 'text-outline', 'opacity-50', 'cursor-not-allowed');
                statusText.textContent = gameStatus.toUpperCase();
                statusText.className = 'font-headline text-lg font-black text-outline';
            } else if (!currentUser) {
                joinBtn.innerHTML = `LOG IN TO VIEW <span class="material-symbols-outlined text-[18px]">login</span>`;
                joinBtn.disabled = false;
                joinBtn.addEventListener('click', () => window.location.href = 'index.html');
                joinBtn.classList.add('bg-surface-container-highest', 'border', 'border-outline-variant/30', 'text-on-surface', 'hover:bg-surface-bright', 'active:scale-95');
                statusText.textContent = "Squad Match";
                statusText.className = 'font-headline text-lg font-black text-outline';
            } else if (isActuallyPlaying) {
                joinBtn.innerHTML = `LEAVE MATCH <span class="material-symbols-outlined text-[18px]">logout</span>`;
                joinBtn.disabled = false;
                joinBtn.addEventListener('click', async () => {
                    if(!confirm("Are you sure you want to drop out of your squad's match lineup?")) return;
                    try {
                        joinBtn.innerHTML = `<span class="material-symbols-outlined animate-spin">refresh</span>`;
                        joinBtn.disabled = true;
                        await updateDoc(doc(db, "games", gameId), {
                            players: arrayRemove(userName, currentUser.uid)
                        });
                        await loadGameDetails();
                    } catch(e) { alert("Failed to leave."); updateJoinButtonState(); }
                });
                joinBtn.classList.add('bg-error/10', 'text-error', 'border', 'border-error/30', 'hover:bg-error/20', 'active:scale-95');
                statusText.textContent = "You're Playing!";
                statusText.className = 'font-headline text-lg font-black text-primary';
            } else if (isSquadMember) {
                // Determine if they are invited
                joinBtn.innerHTML = `CHECKING INVITES <span class="material-symbols-outlined animate-spin text-[18px]">refresh</span>`;
                joinBtn.disabled = true;
                joinBtn.classList.add('bg-surface-container-highest', 'text-outline', 'border', 'border-outline-variant/30');
                statusText.textContent = "Squad Member";
                statusText.className = 'font-headline text-lg font-black text-secondary';

                (async () => {
                    try {
                        const inviteQ = query(collection(db, "notifications"), where("recipientId", "==", currentUser.uid), where("targetId", "==", gameId), where("type", "==", "game_invite"));
                        const inviteSnap = await getDocs(inviteQ);
                        if (!inviteSnap.empty) {
                            joinBtn.innerHTML = `ACCEPT INVITE <span class="material-symbols-outlined text-[18px]">check_circle</span>`;
                            joinBtn.disabled = false;
                            joinBtn.classList.remove('bg-surface-container-highest', 'text-outline', 'border-outline-variant/30');
                            joinBtn.classList.add('bg-primary', 'text-on-primary-container', 'hover:brightness-110', 'active:scale-95');
                            statusText.textContent = "You're Invited!";
                            statusText.className = 'font-headline text-lg font-black text-primary';
                            joinBtn.addEventListener('click', async () => {
                                joinBtn.disabled = true;
                                joinBtn.innerHTML = `<span class="material-symbols-outlined animate-spin">refresh</span>`;
                                await updateDoc(doc(db, "games", gameId), {
                                    players: arrayUnion(userName, currentUser.uid)
                                });
                                inviteSnap.forEach(d => updateDoc(doc(db, "notifications", d.id), { read: true }));
                                await loadGameDetails();
                            });
                        } else {
                            joinBtn.innerHTML = `WAITING FOR CAPTAIN <span class="material-symbols-outlined text-[18px]">hourglass_empty</span>`;
                            joinBtn.disabled = true;
                            joinBtn.classList.add('cursor-not-allowed');
                        }
                    } catch (e) {
                        joinBtn.innerHTML = `ERROR <span class="material-symbols-outlined text-[18px]">error</span>`;
                    }
                })();
            } else {
                joinBtn.innerHTML = `SHARE MATCH <span class="material-symbols-outlined text-[18px]">share</span>`;
                joinBtn.disabled = false;
                joinBtn.addEventListener('click', () => {
                    navigator.clipboard.writeText(window.location.href);
                    alert("Match link copied to clipboard! Share it with friends.");
                });
                joinBtn.classList.add('bg-surface-container-highest', 'border', 'border-outline-variant/30', 'text-on-surface', 'hover:bg-surface-bright', 'active:scale-95');
                statusText.textContent = "Spectator";
                statusText.className = 'font-headline text-lg font-black text-outline';
            }
            return; 
        }

        // --- NORMAL GAME BUTTON LOGIC ---
        const spotsTotal = parseInt(currentGameData.spotsTotal) || 10;
        const players = currentGameData.players || [];
        const applicants = currentGameData.applicants || [];
        const spotsFilled = players.length;

        const isJoined = currentUser && (players.includes(userName) || players.includes(currentUser.uid));
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
            joinBtn.addEventListener('click', () => window.location.href = 'index.html');
            joinBtn.classList.add('bg-surface-container-highest', 'border', 'border-outline-variant/30', 'text-on-surface', 'hover:bg-surface-bright', 'active:scale-95');
            statusText.textContent = `${spotsFilled}/${spotsTotal} Filled`;
            statusText.className = 'font-headline text-lg font-black text-outline';
        } else if (isJoined) {
            joinBtn.innerHTML = `LEAVE GAME <span class="material-symbols-outlined text-[18px]">logout</span>`;
            joinBtn.disabled = false; 
            joinBtn.addEventListener('click', handleNormalJoinLeave);
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
            joinBtn.addEventListener('click', handleNormalJoinLeave);
            joinBtn.classList.add('bg-[#14171d]', 'text-primary', 'border', 'border-primary/30', 'hover:bg-primary', 'hover:text-on-primary-container', 'active:scale-95');
            statusText.textContent = `Approval Required`;
            statusText.className = 'font-headline text-lg font-black text-outline';
        } else {
            joinBtn.innerHTML = `JOIN GAME <span class="material-symbols-outlined text-[20px]">chevron_right</span>`;
            joinBtn.disabled = false;
            joinBtn.addEventListener('click', handleNormalJoinLeave);
            joinBtn.classList.add('bg-primary', 'text-on-primary-container', 'shadow-[0_0_30px_rgba(255,143,111,0.25)]', 'hover:brightness-110', 'active:scale-95');
            statusText.textContent = `${spotsTotal - spotsFilled} Spots Left`;
            statusText.className = 'font-headline text-lg font-black text-primary';
        }
    }

    async function handleNormalJoinLeave() {
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

        const isJoined = players.includes(userName) || players.includes(currentUser.uid);
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
                    players: arrayRemove(userName, currentUser.uid),
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
            let hasActiveInvite = false;
            const inviteQ = query(collection(db, "notifications"), where("recipientId", "==", currentUser.uid), where("targetId", "==", gameId), where("type", "==", "game_invite"));
            const inviteSnap = await getDocs(inviteQ);
            
            if (!inviteSnap.empty) {
                hasActiveInvite = true;
                inviteSnap.forEach(d => updateDoc(doc(db, "notifications", d.id), { read: true }));
            }

            if (currentGameData.joinPolicy === 'approval' && !hasActiveInvite) {
                await updateDoc(gameRef, {
                    applicants: arrayUnion(userName)
                });
                
                try {
                    const hostQ = query(collection(db, "users"), where("displayName", "==", currentGameData.host), limit(1));
                    const hostSnap = await getDocs(hostQ);
                    if (!hostSnap.empty && hostSnap.docs[0].id !== currentUser.uid) {
                        await addDoc(collection(db, "notifications"), {
                            recipientId: hostSnap.docs[0].id,
                            actorId: currentUser.uid,
                            actorName: userName,
                            actorPhoto: currentUser.photoURL || null,
                            type: 'game_request',
                            targetId: gameId,
                            message: `requested to join your game ${currentGameData.title}`,
                            link: `game-details.html?id=${gameId}`,
                            read: false,
                            createdAt: serverTimestamp()
                        });
                    }
                } catch(e){ console.error("Failed to send notification", e); }

                alert("Your join request has been sent to the organizer.");
            } else {
                await updateDoc(gameRef, {
                    players: arrayUnion(userName),
                    spotsFilled: spotsFilled + 1,
                    applicants: arrayRemove(userName) 
                });
                
                try {
                    const hostQ = query(collection(db, "users"), where("displayName", "==", currentGameData.host), limit(1));
                    const hostSnap = await getDocs(hostQ);
                    if (!hostSnap.empty && hostSnap.docs[0].id !== currentUser.uid) {
                        await addDoc(collection(db, "notifications"), {
                            recipientId: hostSnap.docs[0].id,
                            actorId: currentUser.uid,
                            actorName: userName,
                            actorPhoto: currentUser.photoURL || null,
                            type: 'game_join',
                            targetId: gameId,
                            message: `joined your game ${currentGameData.title}`,
                            link: `game-details.html?id=${gameId}`,
                            read: false,
                            createdAt: serverTimestamp()
                        });
                    }
                } catch(e){ console.error("Failed to send notification", e); }

                if (hasActiveInvite) {
                    alert("You had an active invite! You bypassed the queue and were automatically added to the game.");
                }
            }
            await loadGameDetails();

        } catch (error) {
            console.error("Error joining game:", error);
            alert("Action failed. Please try again.");
            updateJoinButtonState();
        }
    }


    window.openImageModal = function(url) {
        const modal = document.getElementById('image-modal');
        const img = document.getElementById('lightbox-image');
        if(!modal || !img) return;
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

    // --- NEW: SQUAD SPECIFIC INVITE MODAL ---
    window.openSquadInviteModal = async function(squadId) {
        const inviteModal = document.getElementById('invite-list-modal');
        const listContainer = document.getElementById('invite-list-container');
        const titleEl = inviteModal.querySelector('h2');
        
        if(!inviteModal || !listContainer) return;
        if (titleEl) titleEl.innerHTML = `<span class="material-symbols-outlined text-[24px]">group_add</span> Invite Squad Member`;
        
        inviteModal.classList.remove('hidden');
        setTimeout(() => {
            inviteModal.classList.remove('opacity-0');
            inviteModal.querySelector('div').classList.remove('scale-95');
            inviteModal.querySelector('div').classList.add('scale-100');
        }, 10);

        listContainer.innerHTML = '<div class="text-center py-8 opacity-50"><span class="material-symbols-outlined animate-spin text-4xl text-primary mb-2">refresh</span><p class="text-xs font-bold uppercase tracking-widest">Loading Roster...</p></div>';

        try {
            const squadSnap = await getDoc(doc(db, "squads", squadId));
            if (!squadSnap.exists()) throw new Error("Squad not found");
            const squadData = squadSnap.data();
            const memberUids = squadData.members || [];

            if (memberUids.length === 0) {
                listContainer.innerHTML = '<p class="text-center text-sm text-on-surface-variant py-8 italic">No members in squad.</p>';
                return;
            }

            const userPromises = memberUids.map(uid => getDoc(doc(db, "users", uid)));
            const userSnaps = await Promise.all(userPromises);
            const squadMembers = userSnaps.filter(s => s.exists()).map(s => ({ id: s.id, ...s.data() }));

            const inviteQ = query(collection(db, "notifications"), where("type", "==", "game_invite"), where("targetId", "==", gameId));
            const inviteSnaps = await getDocs(inviteQ);
            const invitedUserIds = inviteSnaps.docs.map(d => d.data().recipientId);

            listContainer.innerHTML = '';
            
            // Only show squad members who are NOT already in the game
            const eligibleMembers = squadMembers.filter(user => {
                const isPlayer = currentGameData.players.includes(user.displayName) || currentGameData.players.includes(user.id);
                return !isPlayer; 
            });

            if (eligibleMembers.length === 0) {
                listContainer.innerHTML = '<div class="flex flex-col items-center justify-center py-10 opacity-60"><span class="material-symbols-outlined text-4xl mb-2">check_circle</span><p class="text-sm font-bold uppercase tracking-widest">All squad members are in!</p></div>';
                return;
            }

            eligibleMembers.forEach(user => {
                const safeName = escapeHTML(user.displayName || 'Unknown');
                const photoUrl = escapeHTML(user.photoURL) || getFallbackAvatar(safeName);
                const isInvited = invitedUserIds.includes(user.id);
                
                let actionHtml = '';
                if (isInvited) {
                    actionHtml = `<span class="text-[10px] text-primary font-bold uppercase shrink-0 px-2 py-1 bg-primary/10 rounded border border-primary/20">Invited</span>`;
                } else {
                    actionHtml = `<button onclick="window.sendGameInvite('${user.id}', '${safeName}')" class="bg-primary hover:brightness-110 text-on-primary-container shadow-md px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shrink-0">Send Invite</button>`;
                }

                listContainer.innerHTML += `
                    <div class="flex items-center gap-4 p-3 bg-surface-container-highest rounded-xl border border-outline-variant/10">
                        <img src="${photoUrl}" onerror="this.onerror=null; this.src='${getFallbackAvatar(safeName)}';" class="w-12 h-12 rounded-full object-cover border border-outline-variant/30 shrink-0 bg-surface-container">
                        <div class="flex-1 min-w-0">
                            <p class="font-bold text-sm text-on-surface truncate">${safeName}</p>
                            <p class="text-[10px] text-outline uppercase font-black tracking-widest mt-0.5">${escapeHTML(user.primaryPosition || 'Unassigned')}</p>
                        </div>
                        ${actionHtml}
                    </div>
                `;
            });
        } catch (e) {
            console.error(e);
            listContainer.innerHTML = '<p class="text-center text-error text-sm py-4">Failed to load squad members.</p>';
        }
    };

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

    document.getElementById('invite-connection-btn')?.addEventListener('click', async () => {
        document.getElementById('close-slot-modal').click();
        
        const inviteModal = document.getElementById('invite-list-modal');
        const listContainer = document.getElementById('invite-list-container');
        if(!inviteModal || !listContainer) return;
        
        inviteModal.classList.remove('hidden');
        setTimeout(() => {
            inviteModal.classList.remove('opacity-0');
            inviteModal.querySelector('div').classList.remove('scale-95');
            inviteModal.querySelector('div').classList.add('scale-100');
        }, 10);

        listContainer.innerHTML = '<div class="text-center py-8 opacity-50"><span class="material-symbols-outlined animate-spin text-4xl text-primary mb-2">refresh</span><p class="text-xs font-bold uppercase tracking-widest">Loading...</p></div>';

        try {
            const connRef = collection(db, "connections");
            const [snap1, snap2] = await Promise.all([
                getDocs(query(connRef, where("requesterId", "==", currentUser.uid), where("status", "==", "accepted"))),
                getDocs(query(connRef, where("receiverId", "==", currentUser.uid), where("status", "==", "accepted")))
            ]);

            const connectionUids = [];
            snap1.forEach(d => connectionUids.push(d.data().receiverId));
            snap2.forEach(d => connectionUids.push(d.data().requesterId));

            const uniqueUids = [...new Set(connectionUids)];
            if (uniqueUids.length === 0) {
                listContainer.innerHTML = '<p class="text-center text-sm text-on-surface-variant py-8 italic">No connections found.</p>';
                return;
            }

            const userPromises = uniqueUids.map(uid => getDoc(doc(db, "users", uid)));
            const userSnaps = await Promise.all(userPromises);
            const connections = userSnaps.filter(s => s.exists()).map(s => ({ id: s.id, ...s.data() }));

            const inviteQ = query(collection(db, "notifications"), where("type", "==", "game_invite"), where("targetId", "==", gameId));
            const inviteSnaps = await getDocs(inviteQ);
            const invitedUserIds = inviteSnaps.docs.map(d => d.data().recipientId);

            listContainer.innerHTML = '';
            connections.forEach(user => {
                const safeName = escapeHTML(user.displayName || 'Unknown');
                const photoUrl = escapeHTML(user.photoURL) || getFallbackAvatar(safeName);
                
                const isPlayer = currentGameData.players.includes(user.displayName);
                const isApplicant = currentGameData.applicants && currentGameData.applicants.includes(user.displayName);
                const isInvited = invitedUserIds.includes(user.id);
                
                let actionHtml = '';
                if (isPlayer) {
                    actionHtml = `<span class="text-[10px] text-outline font-bold uppercase shrink-0 px-2 py-1">In Game</span>`;
                } else if (isApplicant) {
                    actionHtml = `<button onclick="window.sendGameInvite('${user.id}', '${safeName}')" class="bg-secondary/20 text-secondary border border-secondary/30 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-secondary hover:text-on-secondary transition-colors shrink-0">Accept Request</button>`;
                } else if (isInvited) {
                    actionHtml = `<span class="text-[10px] text-primary font-bold uppercase shrink-0 px-2 py-1">Invited</span>`;
                } else {
                    actionHtml = `<button onclick="window.sendGameInvite('${user.id}', '${safeName}')" class="bg-primary/20 text-primary border border-primary/30 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-primary hover:text-on-primary-container transition-colors shrink-0">Invite</button>`;
                }

                listContainer.innerHTML += `
                    <div class="flex items-center gap-4 p-3 bg-surface-container-highest rounded-xl border border-outline-variant/10">
                        <img src="${photoUrl}" onerror="this.onerror=null; this.src='${getFallbackAvatar(safeName)}';" class="w-12 h-12 rounded-full object-cover border border-outline-variant/30 shrink-0 bg-surface-container">
                        <div class="flex-1 min-w-0">
                            <p class="font-bold text-sm text-on-surface truncate">${safeName}</p>
                            <p class="text-[10px] text-primary uppercase font-black tracking-widest">${escapeHTML(user.primaryPosition || 'Unassigned')}</p>
                        </div>
                        ${actionHtml}
                    </div>
                `;
            });
        } catch (e) {
            console.error(e);
            listContainer.innerHTML = '<p class="text-center text-error text-sm py-4">Failed to load connections.</p>';
        }
    });

    document.getElementById('close-invite-list-modal')?.addEventListener('click', () => {
        const modal = document.getElementById('invite-list-modal');
        modal.classList.add('opacity-0');
        modal.querySelector('div').classList.remove('scale-100');
        modal.querySelector('div').classList.add('scale-95');
        setTimeout(() => modal.classList.add('hidden'), 300);
    });

    window.sendGameInvite = async function(targetUserId, targetUserName) {
        try {
            const gameRef = doc(db, "games", gameId);
            const gameSnap = await getDoc(gameRef);
            if (!gameSnap.exists()) return;
            const gameInfo = gameSnap.data();

            if (gameInfo.players.includes(targetUserName)) {
                alert("Player is already in the game.");
                return;
            }

            if (gameInfo.applicants && gameInfo.applicants.includes(targetUserName)) {
                if(!confirm(`Accept ${targetUserName}'s request to join?`)) return;
                if (gameInfo.spotsFilled >= gameInfo.spotsTotal) return alert("Game is full!");
                
                await updateDoc(gameRef, {
                    applicants: arrayRemove(targetUserName),
                    players: arrayUnion(targetUserName),
                    spotsFilled: gameInfo.spotsFilled + 1
                });
                
                await addDoc(collection(db, "notifications"), {
                    recipientId: targetUserId,
                    actorId: currentUser.uid,
                    actorName: currentUser.displayName || "Someone",
                    actorPhoto: currentUser.photoURL || null,
                    type: 'game_join', 
                    targetId: gameId,
                    message: `accepted your request to join ${gameInfo.title}`,
                    link: `game-details.html?id=${gameId}`,
                    read: false,
                    createdAt: serverTimestamp()
                });
                
                alert(`${targetUserName} was added to the game!`);
                document.getElementById('close-invite-list-modal').click();
                loadGameDetails();
                return;
            }

            if(!confirm(`Send game invite to ${targetUserName}?`)) return;
            
            const inviteQ = query(collection(db, "notifications"), where("type", "==", "game_invite"), where("targetId", "==", gameId), where("recipientId", "==", targetUserId));
            const existingInvites = await getDocs(inviteQ);
            if (!existingInvites.empty) {
                alert("An invite has already been sent to this player.");
                document.getElementById('close-invite-list-modal').click();
                return;
            }

            await addDoc(collection(db, "notifications"), {
                recipientId: targetUserId,
                actorId: currentUser.uid,
                actorName: currentUser.displayName || "Someone",
                actorPhoto: currentUser.photoURL || null,
                type: 'game_invite',
                targetId: gameId,
                message: `invited you to join the game: ${gameInfo.title}`,
                link: `game-details.html?id=${gameId}`,
                read: false,
                createdAt: serverTimestamp()
            });
            alert("Invite sent!");
            document.getElementById('close-invite-list-modal').click();
        } catch(e) {
            alert("Failed to send invite.");
        }
    }

});
