import { auth, db } from './firebase-setup.js';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, collection, query, where, getDocs, limit, addDoc, serverTimestamp, deleteDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

document.addEventListener('DOMContentLoaded', async () => {
    const mainContainer = document.getElementById('game-details-main');
    let joinBtn = document.getElementById('join-game-btn'); 
    const bottomBarWrapper = document.getElementById('bottom-bar-wrapper');

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

    function getGameStatus(dateStr, timeStr, endTimeStr) {
        if (!dateStr || !timeStr) return "Upcoming";
        const gameStart = new Date(`${dateStr}T${timeStr}`);
        if (isNaN(gameStart)) return "Upcoming";
        
        let gameEnd;
        if (endTimeStr) {
            gameEnd = new Date(`${dateStr}T${endTimeStr}`);
            if (gameEnd < gameStart) {
                gameEnd.setDate(gameEnd.getDate() + 1); 
            }
        } else {
            gameEnd = new Date(gameStart.getTime() + (2 * 60 * 60 * 1000));
        }

        const now = new Date();

        if (now > gameEnd) return "Completed";
        if (now >= gameStart && now <= gameEnd) return "Ongoing";
        return "Upcoming";
    }

    let currentGameData = null;
    let currentUser = null;
    let currentSlotTarget = null; 

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

                let currentLiveName = "Unknown Player";
                if (currentUser) {
                    try {
                        const localProfile = JSON.parse(localStorage.getItem('ligaPhProfile'));
                        currentLiveName = localProfile?.displayName || currentUser.displayName || "Unknown Player";
                    } catch(e) {
                        currentLiveName = currentUser.displayName || "Unknown Player";
                    }

                    if (currentGameData.hostId === currentUser.uid && currentGameData.host !== currentLiveName && currentLiveName !== "Unknown Player") {
                        const oldName = currentGameData.host;
                        const newName = currentLiveName;
                        
                        const newPlayers = (currentGameData.players || []).map(p => p === oldName ? newName : p);
                        const newApps = (currentGameData.applicants || []).map(p => p === oldName ? newName : p);
                        const newReported = (currentGameData.attendanceReported || []).map(p => p === oldName ? newName : p);
                        
                        await updateDoc(docRef, {
                            host: newName,
                            players: newPlayers,
                            applicants: newApps,
                            attendanceReported: newReported
                        });
                        
                        currentGameData.host = newName;
                        currentGameData.players = newPlayers;
                        currentGameData.applicants = newApps;
                        currentGameData.attendanceReported = newReported;
                    }
                }

                const status = getGameStatus(currentGameData.date, currentGameData.time, currentGameData.endTime);
                if (status === 'Completed' && !currentGameData.postGameNotifsSent) {
                    
                    currentGameData.postGameNotifsSent = true;
                    await updateDoc(docRef, { postGameNotifsSent: true });

                    if (currentGameData.hostId) {
                        await addDoc(collection(db, "notifications"), {
                            recipientId: currentGameData.hostId,
                            actorId: 'system',
                            actorName: 'Liga PH',
                            actorPhoto: 'assets/logo-192.png',
                            type: 'system_alert',
                            message: `Your game "${currentGameData.title}" has ended! Please mark the player attendance.`,
                            link: `game-details.html?id=${gameId}`,
                            read: false,
                            createdAt: serverTimestamp()
                        });
                    }

                    const validPlayers = (currentGameData.players || []).filter(p => !p.startsWith('Reserved Slot') && p !== currentGameData.host);
                    for (let pName of validPlayers) {
                        try {
                            const q = query(collection(db, "users"), where("displayName", "==", pName), limit(1));
                            const pSnap = await getDocs(q);
                            if (!pSnap.empty) {
                                await addDoc(collection(db, "notifications"), {
                                    recipientId: pSnap.docs[0].id,
                                    actorId: 'system',
                                    actorName: 'Liga PH',
                                    actorPhoto: 'assets/logo-192.png',
                                    type: 'system_alert',
                                    message: `"${currentGameData.title}" has ended. Rate your teammates and give props!`,
                                    link: `game-details.html?id=${gameId}`,
                                    read: false,
                                    createdAt: serverTimestamp()
                                });
                            }
                        } catch(e) { console.error("Error notifying player", e); }
                    }
                }

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
            } catch (e) {}
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
        
        let safeTime = formatTime12(game.time);
        if (game.endTime) safeTime += ` - ${formatTime12(game.endTime)}`;

        const safeCategory = escapeHTML(game.category || 'Matchup');
        const safeType = escapeHTML(game.type || '5v5');
        const safeSkill = escapeHTML(game.skillLevel || 'Competitive');

        const spotsTotal = parseInt(game.spotsTotal) || 10;
        const players = game.players || [safeHost];
        const applicants = game.applicants || [];
        const spotsFilled = players.length;

        const gameStatus = getGameStatus(game.date, game.time, game.endTime);

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
        
        const isHost = (currentUserDisplayName === game.host) || (currentUser && currentUser.uid === game.hostId) || (currentUser && players[0] === currentUserDisplayName);
        
        const defaultImage = 'https://images.unsplash.com/photo-1546519638-68e109498ffc?q=80&w=2090&auto=format&fit=crop';
        const displayImage = game.imageUrl ? escapeHTML(game.imageUrl) : defaultImage;

        const safeLocSearch = encodeURIComponent(game.location || 'Metro Manila, Philippines');
        const mapEmbedUrl = `https://maps.google.com/maps?q=${safeLocSearch}&t=m&z=15&output=embed&iwloc=near`;

        const manageGameHtml = isHost ? `
            <button onclick="window.openManageGameModal()" class="absolute top-4 right-4 md:top-6 md:right-6 z-20 bg-[#0a0e14]/80 backdrop-blur-md border border-outline-variant/30 text-on-surface hover:text-primary hover:border-primary/50 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg flex items-center gap-2 cursor-pointer">
                <span class="material-symbols-outlined text-[16px]">settings</span>
                Manage Game
            </button>
        ` : '';

        const playerProfiles = {};
        for (let name of players) {
            if (!name.startsWith("Reserved Slot")) {
                try {
                    const q = query(collection(db, "users"), where("displayName", "==", name), limit(1));
                    const snap = await getDocs(q);
                    if (!snap.empty) {
                        playerProfiles[name] = { uid: snap.docs[0].id, ...snap.docs[0].data() };
                    }
                } catch(e) { }
            }
        }

        let myCommendedUserIds = [];
        let myRatedUserIds = [];

        if (currentUser) {
            try {
                const [commSnap, rateSnap] = await Promise.all([
                    getDocs(query(collection(db, "commendations"), where("senderId", "==", currentUser.uid))),
                    getDocs(query(collection(db, "ratings"), where("raterId", "==", currentUser.uid)))
                ]);
                myCommendedUserIds = commSnap.docs.map(d => d.data().targetUserId);
                myRatedUserIds = rateSnap.docs.map(d => d.data().targetUserId);
            } catch(e) { console.error("Error fetching user commends/ratings", e); }
        }

        let waitlistHtml = '';
        if (isHost && !isSquadMatch && gameStatus === 'Upcoming') {
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

        let postGameDashboardHtml = '';
        if (gameStatus === 'Completed') {
            const isParticipant = currentUser && (players.includes(currentUserDisplayName) || players.includes(currentUser.uid));
            const validPlayers = players.filter(p => !p.startsWith('Reserved Slot') && p !== game.host);
            
            if (isHost) {
                let checkListHtml = validPlayers.map(p => {
                    const safeP = escapeHTML(p);
                    const isAssessed = game.attendanceReported && game.attendanceReported.includes(p);
                    const pUid = playerProfiles[p]?.uid;
                    const photoUrl = pUid ? escapeHTML(playerProfiles[p].photoURL || '') : '';
                    const finalPhotoUrl = photoUrl || getFallbackAvatar(safeP);
                    
                    if (isAssessed) {
                        return `
                            <div class="flex items-center justify-between p-3 bg-surface-container-highest rounded-xl border border-outline-variant/10 opacity-50">
                                <div class="flex items-center gap-3">
                                    <img src="${finalPhotoUrl}" class="w-10 h-10 rounded-full object-cover border border-outline-variant/30">
                                    <span class="font-bold text-sm text-on-surface">${safeP}</span>
                                </div>
                                <span class="text-[10px] font-black uppercase tracking-widest text-outline">Reported</span>
                            </div>
                        `;
                    }

                    return `
                        <div class="flex items-center justify-between p-3 bg-surface-container-highest rounded-xl border border-outline-variant/20 hover:border-primary/30 transition-colors">
                            <div class="flex items-center gap-3">
                                <img src="${finalPhotoUrl}" class="w-10 h-10 rounded-full object-cover border border-outline-variant/30">
                                <span class="font-bold text-sm text-on-surface">${safeP}</span>
                            </div>
                            <div class="flex gap-2">
                                <button onclick="window.markPlayerAttendance('${safeP}', false)" class="px-4 py-2 bg-error/10 text-error hover:bg-error/20 border border-error/20 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm">No Show</button>
                                <button onclick="window.markPlayerAttendance('${safeP}', true)" class="px-4 py-2 bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">check</span> Attended</button>
                            </div>
                        </div>
                    `;
                }).join('');

                if (validPlayers.length === 0 || (game.attendanceReported && game.attendanceReported.length >= validPlayers.length)) {
                    checkListHtml = `<div class="text-center py-6 text-outline"><span class="material-symbols-outlined text-4xl mb-2 text-primary">check_circle</span><p class="text-xs font-bold uppercase tracking-widest">All attendance reported</p></div>`;
                }

                postGameDashboardHtml += `
                    <div class="bg-gradient-to-b from-[#1a1714] to-[#14171d] p-5 md:p-6 rounded-3xl border border-primary/30 shadow-lg mb-6">
                        <div class="flex justify-between items-end mb-4 border-b border-outline-variant/10 pb-4">
                            <div>
                                <h3 class="font-headline text-xl font-black uppercase tracking-tighter text-primary flex items-center gap-2 mb-1">
                                    <span class="material-symbols-outlined">checklist</span> Post-Game Report
                                </h3>
                                <p class="text-xs text-on-surface-variant font-medium">As the organizer, please verify attendance. This updates player reliability scores.</p>
                            </div>
                        </div>
                        <div class="space-y-3">
                            ${checkListHtml}
                        </div>
                    </div>
                `;
            } 
            
            if (isParticipant || isHost) {
                const teammateList = players.filter(p => !p.startsWith('Reserved Slot') && p !== currentUserDisplayName);
                
                let rateListHtml = teammateList.map(p => {
                    const safeP = escapeHTML(p);
                    const pUid = playerProfiles[p]?.uid;
                    
                    const hasCommended = pUid && myCommendedUserIds.includes(pUid);
                    const hasRated = pUid && myRatedUserIds.includes(pUid);
                    
                    const photoUrl = pUid ? escapeHTML(playerProfiles[p].photoURL || '') : '';
                    const finalPhotoUrl = photoUrl || getFallbackAvatar(safeP);

                    const commendBtnHtml = hasCommended 
                        ? `<button disabled class="px-3 py-2 bg-surface-container text-outline border border-outline-variant/20 rounded-lg text-[10px] font-black uppercase tracking-widest cursor-not-allowed flex items-center gap-1 opacity-50"><span class="material-symbols-outlined text-[14px]">thumb_up</span> Props</button>`
                        : `<button onclick="window.quickCommend('${safeP}')" class="px-3 py-2 bg-secondary/10 text-secondary hover:bg-secondary/20 border border-secondary/20 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">thumb_up</span> Props</button>`;

                    const rateBtnHtml = hasRated
                        ? `<button disabled class="px-3 py-2 bg-surface-container text-outline border border-outline-variant/20 rounded-lg text-[10px] font-black uppercase tracking-widest cursor-not-allowed flex items-center gap-1 opacity-50"><span class="material-symbols-outlined text-[14px]">star</span> Rated</button>`
                        : `<button onclick="window.quickRate('${safeP}')" class="px-3 py-2 bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">star</span> Rate</button>`;

                    return `
                        <div class="flex items-center justify-between p-3 bg-surface-container-highest rounded-xl border border-outline-variant/20 hover:border-secondary/30 transition-colors">
                            <div class="flex items-center gap-3">
                                <img src="${finalPhotoUrl}" class="w-10 h-10 rounded-full object-cover border border-outline-variant/30">
                                <span class="font-bold text-sm text-on-surface">${safeP}</span>
                            </div>
                            <div class="flex gap-2">
                                ${commendBtnHtml}
                                ${rateBtnHtml}
                            </div>
                        </div>
                    `;
                }).join('');

                if (teammateList.length === 0) {
                    rateListHtml = `<p class="text-xs text-outline italic text-center py-4">No other players to rate.</p>`;
                }

                postGameDashboardHtml += `
                    <div class="bg-[#14171d] p-5 md:p-6 rounded-3xl border border-secondary/30 shadow-lg mb-6">
                        <div class="flex justify-between items-end mb-4 border-b border-outline-variant/10 pb-4">
                            <div>
                                <h3 class="font-headline text-xl font-black uppercase tracking-tighter text-secondary flex items-center gap-2 mb-1">
                                    <span class="material-symbols-outlined">star_rate</span> Rate Players
                                </h3>
                                <p class="text-xs text-on-surface-variant font-medium">Build the community. Give props to players who performed well!</p>
                            </div>
                        </div>
                        <div class="space-y-3">
                            ${rateListHtml}
                        </div>
                    </div>
                `;
            }
        }

        let rosterSectionHtml = '';
        const isSquadMatchValid = isSquadMatch && squad1Data && squad2Data;

        if (isSquadMatchValid) {
            const sq1Users = await fetchUsersByUids(squad1Data.members);
            const sq2Users = await fetchUsersByUids(squad2Data.members);
            const posMap = { 'PG': 'Point Guard', 'SG': 'Shooting Guard', 'SF': 'Small Forward', 'PF': 'Power Forward', 'C': 'Center' };

            const buildSquadRoster = (squad, users, label, labelColor) => {
                let teamPlayers = users.filter(u => game.players.includes(u.displayName) || game.players.includes(u.uid));
                
                if (!teamPlayers.find(u => u.uid === squad.captainId)) {
                    const capt = users.find(u => u.uid === squad.captainId);
                    if (capt) teamPlayers.unshift(capt);
                }

                const isThisSquadCaptain = currentUser && currentUser.uid === squad.captainId;
                const canManage = isThisSquadCaptain && gameStatus === 'Upcoming';

                let html = `
                    <div class="bg-[#14171d] rounded-2xl p-4 md:p-5 border border-outline-variant/10 shadow-sm flex flex-col h-full">
                        <div class="flex items-start gap-4 mb-4 border-b border-outline-variant/10 pb-4">
                            <div class="w-14 h-14 rounded-xl bg-surface-container flex items-center justify-center overflow-hidden shrink-0 border border-outline-variant/20 shadow-inner">
                                <img src="${escapeHTML(squad.logoUrl)}" onerror="this.onerror=null; this.src='${getFallbackAvatar(squad.name)}';" class="w-full h-full object-cover">
                            </div>
                            <div class="min-w-0 flex-1">
                                <p class="text-[9px] font-bold text-${labelColor} uppercase tracking-widest flex items-center gap-1 mb-0.5"><span class="material-symbols-outlined text-[12px]">${label === 'Challenged' ? 'shield' : 'swords'}</span> ${label}</p>
                                <p class="font-headline font-black italic uppercase text-lg text-on-surface leading-tight break-words"><span class="text-outline-variant">[${escapeHTML(squad.abbreviation)}]</span> ${escapeHTML(squad.name)}</p>
                                <p class="text-[10px] font-bold text-outline-variant uppercase tracking-widest mt-1.5 flex items-center gap-1"><span class="material-symbols-outlined text-[13px]">location_on</span> ${escapeHTML(squad.homeCity || 'Location TBD')}</p>
                            </div>
                        </div>
                        <div class="space-y-2 flex-1">
                `;

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
                                <p class="font-bold text-sm text-on-surface break-words group-hover:text-primary transition-colors leading-tight">${safeName}</p>
                                <div class="flex items-center gap-2 mt-1">
                                    ${isCaptain ? `<span class="bg-primary/20 text-primary px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest">CAPTAIN</span>` : ''}
                                    <span class="text-[9px] text-outline-variant font-medium truncate">${fullPos}</span>
                                </div>
                            </div>
                        </div>
                    `;
                });

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

        let mainContentLayoutHtml = '';
        if (isSquadMatchValid) {
            mainContentLayoutHtml = `
                <div class="space-y-4 md:space-y-6">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-4 md:mb-6">
                        <div class="w-full h-48 bg-[#14171d] rounded-2xl border border-outline-variant/10 relative overflow-hidden shadow-sm p-1">
                            <iframe class="w-full h-full rounded-xl pointer-events-none md:pointer-events-auto" style="border:0; filter: invert(90%) hue-rotate(180deg) brightness(85%) contrast(85%);" loading="lazy" allowfullscreen referrerpolicy="no-referrer-when-downgrade" src="${mapEmbedUrl}"></iframe>
                        </div>
                        <div class="bg-[#14171d] p-5 md:p-6 rounded-2xl border border-outline-variant/10 shadow-sm flex flex-col justify-center">
                            <h3 class="font-headline text-sm font-black uppercase tracking-widest text-on-surface mb-3">Court Details</h3>
                            <p class="text-on-surface-variant text-sm leading-relaxed">${safeDesc}</p>
                        </div>
                    </div>
                    ${postGameDashboardHtml}
                    ${rosterSectionHtml}
                </div>
            `;
        } else {
            mainContentLayoutHtml = `
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
                    <div class="space-y-6">
                        ${postGameDashboardHtml}
                        ${rosterSectionHtml}
                    </div>
                </div>
            `;
        }

        mainContainer.classList.remove('animate-pulse');
        mainContainer.innerHTML = `
            <div class="lg:col-span-8 space-y-4 md:space-y-6">
                <div class="relative w-full h-[300px] md:h-[420px] bg-surface-container-high rounded-3xl overflow-hidden border border-outline-variant/10 shadow-lg group">
                    <img src="${displayImage}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 cursor-pointer" onclick="${game.imageUrl ? `window.openImageModal('${displayImage}')` : ''}">
                    <div class="absolute inset-0 bg-gradient-to-t from-[#0a0e14] via-[#0a0e14]/60 to-transparent pointer-events-none"></div>
                    
                    ${manageGameHtml}

                    <div class="absolute bottom-6 left-6 md:bottom-10 md:left-10 z-10 pointer-events-none pr-6">
                        <div class="flex flex-wrap items-center gap-2 mb-3 md:mb-4">
                            <div class="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/20 border border-primary/30 rounded-full shadow-sm backdrop-blur-sm">
                                <span class="w-2 h-2 rounded-full bg-primary ${gameStatus !== 'Completed' ? 'animate-pulse' : ''}"></span>
                                <span class="text-[10px] font-black uppercase tracking-widest text-primary">${safeCategory}</span>
                            </div>
                            <div class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface-container-highest border border-outline-variant/30 rounded-full shadow-sm backdrop-blur-sm text-on-surface">
                                <span class="material-symbols-outlined text-[14px]">groups</span>
                                <span class="text-[10px] font-black uppercase tracking-widest">${safeType}</span>
                            </div>
                            ${gameStatus === 'Completed' ? `<div class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface-container-highest border border-outline-variant/30 rounded-full shadow-sm backdrop-blur-sm text-outline-variant"><span class="material-symbols-outlined text-[14px]">check_circle</span><span class="text-[10px] font-black uppercase tracking-widest">ENDED</span></div>` : ''}
                        </div>

                        <h1 class="font-headline text-4xl md:text-6xl font-black italic uppercase tracking-tighter text-on-surface leading-[0.9] mb-3 drop-shadow-lg break-words">${safeTitle}</h1>
                        <div class="text-on-surface-variant text-xs md:text-sm font-medium tracking-wide flex items-center gap-2">
                            <span class="uppercase tracking-widest text-[10px] font-bold text-outline">ORGANIZER:</span>
                            <span class="text-primary font-black text-sm md:text-base">${safeHost}</span>
                        </div>
                    </div>
                </div>

                ${mainContentLayoutHtml}
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
                    const pUid = playerProfiles[playerName]?.uid;
                    const photoUrl = pUid ? escapeHTML(playerProfiles[playerName].photoURL || '') : '';
                    const finalPhotoUrl = photoUrl || getFallbackAvatar(playerName);
                    
                    const clickableStyle = pUid ? 'cursor-pointer hover:border-primary/50 transition-colors group relative' : 'relative';
                    const onClick = pUid ? `onclick="window.location.href='profile.html?id=${pUid}'"` : '';

                    rosterContainer.innerHTML += `
                        <div class="bg-[#14171d] rounded-2xl p-4 flex flex-col items-center justify-center border border-outline-variant/10 text-center gap-2 shadow-sm ${clickableStyle}" ${onClick}>
                            <div class="w-14 h-14 md:w-16 md:h-16 rounded-xl flex items-center justify-center border border-outline-variant/20 overflow-hidden ${pUid ? 'group-hover:border-primary/50 group-hover:scale-105' : ''} bg-surface-container transition-all">
                                <img src="${finalPhotoUrl}" onerror="this.onerror=null; this.src='${getFallbackAvatar(playerName)}';" class="w-full h-full object-cover">
                            </div>
                            <div class="w-full">
                                <p class="font-bold text-[13px] md:text-sm text-on-surface break-words leading-tight w-full ${pUid ? 'group-hover:text-primary transition-colors' : ''}">${safeName}</p>
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

    window.markPlayerAttendance = async function(playerName, didAttend) {
        try {
            const q = query(collection(db, "users"), where("displayName", "==", playerName), limit(1));
            const snap = await getDocs(q);
            
            if (!snap.empty) {
                const userDoc = snap.docs[0];
                const userData = userDoc.data();
                
                if (didAttend) {
                    await updateDoc(doc(db, "users", userDoc.id), {
                        gamesAttended: (userData.gamesAttended || 0) + 1
                    });
                } else {
                    await updateDoc(doc(db, "users", userDoc.id), {
                        gamesMissed: (userData.gamesMissed || 0) + 1
                    });
                }
            }

            await updateDoc(doc(db, "games", gameId), {
                attendanceReported: arrayUnion(playerName)
            });

            const updatedGameSnap = await getDoc(doc(db, "games", gameId));
            const updatedGame = updatedGameSnap.data();
            const valPlayers = (updatedGame.players || []).filter(p => !p.startsWith('Reserved Slot') && p !== updatedGame.host);
            
            if (updatedGame.attendanceReported && updatedGame.attendanceReported.length >= valPlayers.length && !updatedGame.organizerAttendedRecorded) {
                const hostQ = query(collection(db, "users"), where("displayName", "==", updatedGame.host), limit(1));
                const hostSnap = await getDocs(hostQ);
                if (!hostSnap.empty) {
                    const hostDoc = hostSnap.docs[0];
                    await updateDoc(doc(db, "users", hostDoc.id), {
                        gamesAttended: (hostDoc.data().gamesAttended || 0) + 1
                    });
                }
                await updateDoc(doc(db, "games", gameId), { organizerAttendedRecorded: true });
            }

            await loadGameDetails(); 
            alert(`Attendance for ${playerName} recorded.`);
        } catch(e) {
            console.error(e);
            alert("Failed to report attendance.");
        }
    };

    window.quickCommend = async function(playerName) {
        try {
            const q = query(collection(db, "users"), where("displayName", "==", playerName), limit(1));
            const snap = await getDocs(q);
            if (snap.empty) return alert("User profile not found.");
            
            const targetUserId = snap.docs[0].id;
            
            const commRef = collection(db, "commendations");
            const checkSnap = await getDocs(query(commRef, where("targetUserId", "==", targetUserId), where("senderId", "==", currentUser.uid)));
            
            if (!checkSnap.empty) return alert(`You have already commended ${playerName}!`);

            await addDoc(commRef, { targetUserId, senderId: currentUser.uid, createdAt: serverTimestamp() });
            
            await addDoc(collection(db, "notifications"), {
                recipientId: targetUserId,
                actorId: currentUser.uid,
                actorName: currentUser.displayName || "A teammate",
                actorPhoto: currentUser.photoURL || null,
                type: 'post_like', 
                message: `gave you props for your recent game!`,
                link: `profile.html?id=${targetUserId}`,
                read: false,
                createdAt: serverTimestamp()
            });

            alert(`Props given to ${playerName}!`);
            await loadGameDetails(); 
        } catch(e) { console.error(e); }
    };

    window.quickRate = async function(playerName) {
        try {
            const q = query(collection(db, "users"), where("displayName", "==", playerName), limit(1));
            const snap = await getDocs(q);
            if (snap.empty) return alert("User profile not found.");
            
            const targetUserId = snap.docs[0].id;
            
            const checkSnap = await getDocs(query(collection(db, "ratings"), where("targetUserId", "==", targetUserId), where("raterId", "==", currentUser.uid)));
            if (!checkSnap.empty) return alert(`You have already rated ${playerName}!`);

            document.getElementById('rating-target-name').textContent = playerName;
            document.getElementById('rating-target-id').value = targetUserId;

            const starsContainer = document.getElementById('rating-stars-container');
            starsContainer.innerHTML = '';
            ['shooting', 'passing', 'dribbling', 'rebounding', 'defense'].forEach(skill => {
                starsContainer.innerHTML += `
                    <div class="flex justify-between items-center" data-skill="${skill}">
                        <span class="text-[10px] font-bold uppercase tracking-widest text-on-surface">${skill}</span>
                        <div class="flex gap-1 star-container cursor-pointer text-outline-variant">
                            ${[1,2,3,4,5].map(i => `<span class="material-symbols-outlined text-2xl hover:text-primary transition-colors" data-value="${i}">star</span>`).join('')}
                        </div>
                        <input type="hidden" id="rate-val-${skill}" value="0">
                    </div>
                `;
            });

            document.querySelectorAll('.star-container').forEach(container => {
                const skill = container.parentElement.dataset.skill;
                const stars = container.querySelectorAll('span');
                const hiddenInput = document.getElementById(`rate-val-${skill}`);

                stars.forEach(star => {
                    star.addEventListener('click', () => {
                        const val = parseInt(star.dataset.value);
                        hiddenInput.value = val;
                        stars.forEach(s => {
                            if (parseInt(s.dataset.value) <= val) {
                                s.classList.add('text-primary');
                                s.classList.remove('text-outline-variant');
                                s.style.fontVariationSettings = "'FILL' 1";
                            } else {
                                s.classList.remove('text-primary');
                                s.classList.add('text-outline-variant');
                                s.style.fontVariationSettings = "'FILL' 0";
                            }
                        });
                    });
                });
            });

            const modal = document.getElementById('rating-modal');
            modal.classList.remove('hidden');
            setTimeout(() => {
                modal.classList.remove('opacity-0');
                modal.querySelector('div').classList.remove('scale-95');
            }, 10);
            
        } catch(e) { console.error(e); }
    };

    document.getElementById('close-rating-modal')?.addEventListener('click', () => {
        const modal = document.getElementById('rating-modal');
        modal.classList.add('opacity-0');
        modal.querySelector('div').classList.add('scale-95');
        setTimeout(() => modal.classList.add('hidden'), 300);
    });

    const ratingForm = document.getElementById('rating-form');
    if (ratingForm) {
        ratingForm.onsubmit = async (e) => {
            e.preventDefault();
            
            const targetUserId = document.getElementById('rating-target-id').value;
            const payload = {
                targetUserId: targetUserId,
                raterId: currentUser.uid,
                createdAt: serverTimestamp()
            };

            let valid = true;
            ['shooting', 'passing', 'dribbling', 'rebounding', 'defense'].forEach(skill => {
                const val = parseInt(document.getElementById(`rate-val-${skill}`).value);
                if (val === 0) valid = false;
                payload[skill] = val;
            });

            if (!valid) return alert("Please rate all 5 skills.");

            const submitBtn = document.getElementById('submit-rating-btn');
            submitBtn.textContent = 'Submitting...';
            submitBtn.disabled = true;

            try {
                await addDoc(collection(db, "ratings"), payload);
                document.getElementById('close-rating-modal').click();
                alert("Rating submitted successfully!");
                await loadGameDetails(); 
            } catch (err) {
                console.error("Submit rating error:", err);
                alert("Failed to submit rating.");
            } finally {
                submitBtn.textContent = 'Submit';
                submitBtn.disabled = false;
            }
        };
    }

    function updateJoinButtonState() {
        if (!currentGameData || !joinBtn) return;

        const newJoinBtn = joinBtn.cloneNode(true);
        joinBtn.parentNode.replaceChild(newJoinBtn, joinBtn);
        joinBtn = newJoinBtn;

        const gameStatus = getGameStatus(currentGameData.date, currentGameData.time, currentGameData.endTime);

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

            if (gameStatus === 'Completed') {
                joinBtn.innerHTML = `MATCH CONCLUDED <span class="material-symbols-outlined text-[18px]">verified</span>`;
                joinBtn.disabled = true;
                joinBtn.classList.add('bg-surface-container-highest', 'border', 'border-outline-variant/30', 'text-outline', 'opacity-50', 'cursor-not-allowed');
                bottomBarWrapper.classList.remove('hidden'); 
            } else if (gameStatus === 'Ongoing') {
                joinBtn.innerHTML = `MATCH IN PROGRESS <span class="material-symbols-outlined text-[18px] animate-pulse">sports_basketball</span>`;
                joinBtn.disabled = true;
                joinBtn.classList.add('bg-error/10', 'text-error', 'border', 'border-error/30', 'cursor-not-allowed');
            } else if (!currentUser) {
                joinBtn.innerHTML = `LOG IN TO VIEW <span class="material-symbols-outlined text-[18px]">login</span>`;
                joinBtn.disabled = false;
                joinBtn.addEventListener('click', () => window.location.href = 'index.html');
                joinBtn.classList.add('bg-surface-container-highest', 'border', 'border-outline-variant/30', 'text-on-surface', 'hover:bg-surface-bright', 'active:scale-95');
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
            } else if (isSquadMember) {
                joinBtn.innerHTML = `CHECKING INVITES <span class="material-symbols-outlined animate-spin text-[18px]">refresh</span>`;
                joinBtn.disabled = true;
                joinBtn.classList.add('bg-surface-container-highest', 'text-outline', 'border', 'border-outline-variant/30');

                (async () => {
                    try {
                        const inviteQ = query(collection(db, "notifications"), where("recipientId", "==", currentUser.uid), where("targetId", "==", gameId), where("type", "==", "game_invite"));
                        const inviteSnap = await getDocs(inviteQ);
                        if (!inviteSnap.empty) {
                            joinBtn.innerHTML = `ACCEPT INVITE <span class="material-symbols-outlined text-[18px]">check_circle</span>`;
                            joinBtn.disabled = false;
                            joinBtn.classList.remove('bg-surface-container-highest', 'text-outline', 'border-outline-variant/30');
                            joinBtn.classList.add('bg-primary', 'text-on-primary-container', 'hover:brightness-110', 'active:scale-95');
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
            }
            return; 
        }

        const spotsTotal = parseInt(currentGameData.spotsTotal) || 10;
        const players = currentGameData.players || [];
        const applicants = currentGameData.applicants || [];
        const spotsFilled = players.length;

        const isJoined = currentUser && (players.includes(userName) || players.includes(currentUser.uid));
        const isApplicant = currentUser && applicants.includes(userName);
        const isFull = spotsFilled >= spotsTotal;
        const needsApproval = currentGameData.joinPolicy === 'approval';

        joinBtn.className = "flex-1 px-6 h-14 rounded-xl font-headline font-black uppercase tracking-widest transition-all text-sm md:text-base flex items-center justify-center gap-2";

        if (gameStatus === 'Completed') {
            joinBtn.innerHTML = `GAME CONCLUDED <span class="material-symbols-outlined text-[18px]">verified</span>`;
            joinBtn.disabled = true;
            joinBtn.classList.add('bg-surface-container-highest', 'border', 'border-outline-variant/30', 'text-outline', 'opacity-50', 'cursor-not-allowed');
        } else if (gameStatus === 'Ongoing') {
            joinBtn.innerHTML = `GAME IN PROGRESS <span class="material-symbols-outlined text-[18px] animate-pulse">sports_basketball</span>`;
            joinBtn.disabled = true;
            joinBtn.classList.add('bg-error/10', 'border', 'border-error/30', 'text-error', 'cursor-not-allowed');
        } else if (!currentUser) {
            joinBtn.innerHTML = `LOG IN TO JOIN <span class="material-symbols-outlined text-[18px]">login</span>`;
            joinBtn.disabled = false;
            joinBtn.addEventListener('click', () => window.location.href = 'index.html');
            joinBtn.classList.add('bg-surface-container-highest', 'border', 'border-outline-variant/30', 'text-on-surface', 'hover:bg-surface-bright', 'active:scale-95');
        } else if (isJoined) {
            joinBtn.innerHTML = `LEAVE GAME <span class="material-symbols-outlined text-[18px]">logout</span>`;
            joinBtn.disabled = false; 
            joinBtn.addEventListener('click', handleNormalJoinLeave);
            joinBtn.classList.add('bg-error/10', 'hover:bg-error/20', 'text-error', 'active:scale-95');
        } else if (isApplicant) {
            joinBtn.innerHTML = `REQUEST PENDING <span class="material-symbols-outlined text-[18px]">schedule</span>`;
            joinBtn.disabled = true;
            joinBtn.classList.add('bg-secondary/10', 'border', 'border-secondary/30', 'text-secondary', 'cursor-not-allowed');
        } else if (isFull) {
            joinBtn.innerHTML = `GAME FULL <span class="material-symbols-outlined text-[18px]">block</span>`;
            joinBtn.disabled = true;
            joinBtn.classList.add('bg-[#14171d]', 'border', 'border-outline-variant/20', 'text-outline', 'opacity-50', 'cursor-not-allowed');
        } else if (needsApproval) {
            joinBtn.innerHTML = `REQUEST TO JOIN <span class="material-symbols-outlined text-[20px]">person_add</span>`;
            joinBtn.disabled = false;
            joinBtn.addEventListener('click', handleNormalJoinLeave);
            joinBtn.classList.add('bg-[#14171d]', 'text-primary', 'border', 'border-primary/30', 'hover:bg-primary', 'hover:text-on-primary-container', 'active:scale-95');
        } else {
            joinBtn.innerHTML = `JOIN GAME <span class="material-symbols-outlined text-[20px]">chevron_right</span>`;
            joinBtn.disabled = false;
            joinBtn.addEventListener('click', handleNormalJoinLeave);
            joinBtn.classList.add('bg-primary', 'text-on-primary-container', 'shadow-[0_0_30px_rgba(255,143,111,0.25)]', 'hover:brightness-110', 'active:scale-95');
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
        const gameStatus = getGameStatus(currentGameData.date, currentGameData.time, currentGameData.endTime);

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
        modal.classList.add('flex');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            modal.querySelector('div').classList.remove('scale-95');
            modal.querySelector('div').classList.add('scale-100');
        }, 10);
    }

    window.openSquadInviteModal = async function(squadId) {
        const inviteModal = document.getElementById('invite-list-modal');
        const listContainer = document.getElementById('invite-list-container');
        const titleEl = inviteModal.querySelector('h2');
        
        if(!inviteModal || !listContainer) return;
        if (titleEl) titleEl.innerHTML = `<span class="material-symbols-outlined text-[24px]">group_add</span> Invite Squad Member`;
        
        inviteModal.classList.remove('hidden');
        inviteModal.classList.add('flex');
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
                            <p class="text-[10px] text-primary uppercase font-black tracking-widest mt-0.5">${escapeHTML(user.primaryPosition || 'Unassigned')}</p>
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

    document.getElementById('close-invite-list-modal')?.addEventListener('click', () => {
        const modal = document.getElementById('invite-list-modal');
        modal.classList.add('opacity-0');
        modal.querySelector('div').classList.remove('scale-100');
        modal.querySelector('div').classList.add('scale-95');
        setTimeout(() => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }, 300);
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

    window.openManageGameModal = function() {
        if (!currentGameData) return;
        
        document.getElementById('manage-game-title').value = currentGameData.title || '';
        document.getElementById('manage-game-date').value = currentGameData.date || '';
        document.getElementById('manage-game-time').value = currentGameData.time || '';
        document.getElementById('manage-game-location').value = currentGameData.location || '';
        document.getElementById('manage-game-desc').value = currentGameData.description || '';

        if (isSquadMatch) {
            const t = document.getElementById('manage-game-title');
            t.disabled = true;
            t.classList.add('opacity-50', 'cursor-not-allowed');
        }

        const modal = document.getElementById('manage-game-modal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            modal.querySelector('div').classList.remove('scale-95');
        }, 10);
    };

    document.getElementById('close-manage-game-modal')?.addEventListener('click', () => {
        const modal = document.getElementById('manage-game-modal');
        modal.classList.add('opacity-0');
        modal.querySelector('div').classList.add('scale-95');
        setTimeout(() => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }, 300);
    });

    const manageForm = document.getElementById('manage-game-form');
    if (manageForm) {
        manageForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('submit-manage-game-btn');
            btn.disabled = true;
            btn.innerHTML = `<span class="material-symbols-outlined animate-spin">refresh</span> SAVING...`;

            try {
                const payload = {
                    date: document.getElementById('manage-game-date').value,
                    time: document.getElementById('manage-game-time').value,
                    location: document.getElementById('manage-game-location').value,
                    description: document.getElementById('manage-game-desc').value
                };

                if (!isSquadMatch) {
                    payload.title = document.getElementById('manage-game-title').value;
                }

                await updateDoc(doc(db, "games", gameId), payload);
                document.getElementById('close-manage-game-modal').click();
                await loadGameDetails();
            } catch(e) {
                console.error(e);
                alert("Failed to update game details.");
            } finally {
                btn.disabled = false;
                btn.innerHTML = `<span class="material-symbols-outlined">save</span> Save Changes`;
            }
        });
    }

    window.deleteGame = async function() {
        if (!confirm("DANGER: Are you sure you want to permanently delete this game? This cannot be undone.")) return;
        
        try {
            await deleteDoc(doc(db, "games", gameId));
            window.location.href = "home.html";
        } catch(e) {
            console.error(e);
            alert("Failed to delete game.");
        }
    };
});
