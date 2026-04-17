import { auth, db } from './firebase-setup.js';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, collection, query, where, getDocs, limit, addDoc, serverTimestamp, deleteDoc, increment } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

document.addEventListener('DOMContentLoaded', async () => {
    const mainContainer = document.getElementById('game-details-main');
    let joinBtn = document.getElementById('join-game-btn'); 
    const bottomBarWrapper = document.getElementById('bottom-bar-wrapper');

    // Modal DOM Elements
    const manageModal = document.getElementById('manage-game-modal');
    const closeManageModalBtn = document.getElementById('close-manage-game-modal');
    const manageForm = document.getElementById('manage-game-form'); // Declared once here!

    const slotModal = document.getElementById('manage-slot-modal');
    const closeSlotModal = document.getElementById('close-slot-modal');
    const inviteBtn = document.getElementById('invite-connection-btn');
    const reserveBtn = document.getElementById('reserve-slot-btn');
    const removeReserveBtn = document.getElementById('remove-reserve-btn');

    const inviteListModal = document.getElementById('invite-list-modal');
    const closeInviteListBtn = document.getElementById('close-invite-list-modal');
    const inviteListContainer = document.getElementById('invite-list-container');

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
    let currentUserProfile = null;
    let currentSlotTarget = null; 

    let isSquadMatch = false;
    let squad1Data = null; 
    let squad2Data = null; 

    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        
        if (user) {
            try {
                const snap = await getDoc(doc(db, "users", user.uid));
                if (snap.exists()) currentUserProfile = snap.data();
            } catch(e) {}
        } else {
            currentUserProfile = null;
        }

        if (currentGameData) {
            await renderGameDetails(currentGameData);
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
                if (!Array.isArray(currentGameData.applicants)) currentGameData.applicants = []; 
                if (!Array.isArray(currentGameData.players)) currentGameData.players = [currentGameData.hostId || "Unknown"]; 

                if (currentUser) {
                    const isHost = currentUser.uid === currentGameData.hostId || currentUser.displayName === currentGameData.host;
                    if (isHost && !currentGameData.players.includes(currentUser.uid)) {
                        currentGameData.players.unshift(currentUser.uid);
                        try { await updateDoc(docRef, { players: currentGameData.players }); } catch(e) {}
                    }
                    if (isHost && !currentGameData.hostId) {
                        currentGameData.hostId = currentUser.uid;
                        try { await updateDoc(docRef, { hostId: currentUser.uid }); } catch(e) {}
                    }
                }

                const status = getGameStatus(currentGameData.date, currentGameData.time, currentGameData.endTime);
                
                if (status === 'Completed' && !currentGameData.postGameNotifsSent) {
                    if (currentUser && currentUser.uid === currentGameData.hostId) {
                        try {
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
                        } catch(notifError) {
                            console.warn("Silent fail on post-game notification trigger.", notifError);
                        }
                    }
                }

                const safeTitle = currentGameData.title || "";
                isSquadMatch = currentGameData.type === "5v5 Squad Match";
                
                if (isSquadMatch) {
                    try {
                        const abbrMatch = safeTitle.match(/\[(.*?)\]/g);
                        if (abbrMatch && abbrMatch.length >= 2) {
                            const abbr1 = abbrMatch[0].replace(/\[|\]/g, ''); 
                            const abbr2 = abbrMatch[1].replace(/\[|\]/g, ''); 

                            const q1 = query(collection(db, "squads"), where("abbreviation", "==", abbr1));
                            const snap1 = await getDocs(q1);
                            if (!snap1.empty) {
                                squad1Data = { id: snap1.docs[0].id, ...snap1.docs[0].data() };
                                if (!Array.isArray(squad1Data.members)) squad1Data.members = [];
                                if (squad1Data.captainId && !squad1Data.members.includes(squad1Data.captainId)) squad1Data.members.unshift(squad1Data.captainId);
                            }

                            const q2 = query(collection(db, "squads"), where("abbreviation", "==", abbr2));
                            const snap2 = await getDocs(q2);
                            if (!snap2.empty) {
                                squad2Data = { id: snap2.docs[0].id, ...snap2.docs[0].data() };
                                if (!Array.isArray(squad2Data.members)) squad2Data.members = [];
                                if (squad2Data.captainId && !squad2Data.members.includes(squad2Data.captainId)) squad2Data.members.unshift(squad2Data.captainId);
                            }
                        }
                    } catch (squadFetchErr) {
                        console.warn("Failed to load squad details", squadFetchErr);
                    }
                }

                await renderGameDetails(currentGameData);
                updateJoinButtonState();
            } else {
                mainContainer.innerHTML = '<div class="text-center text-error py-20 lg:col-span-12"><p class="text-2xl font-bold">Game Not Found</p><p class="mt-2 text-on-surface-variant">This game may have been deleted.</p></div>';
            }
        } catch (error) {
            console.error("Error fetching game details:", error);
            mainContainer.innerHTML = `<div class="text-center text-error py-20 lg:col-span-12"><p class="text-2xl font-bold">Error Loading Game</p><p class="mt-2 text-on-surface-variant break-words">${error.message}</p></div>`;
        }
    }

    async function fetchUsersByUids(uidArray) {
        if (!uidArray || !Array.isArray(uidArray) || uidArray.length === 0) return [];
        const users = [];
        for (const uid of uidArray) {
            try {
                if (typeof uid === 'string') {
                    if (uid.startsWith('RESERVED')) {
                        users.push({ isReserved: true, rawId: uid });
                    } else {
                        const userSnap = await getDoc(doc(db, "users", uid));
                        if (userSnap.exists()) users.push({ uid, ...userSnap.data() });
                        else users.push({ displayName: uid }); 
                    }
                } else {
                    users.push({ displayName: uid }); 
                }
            } catch (e) {
                users.push({ displayName: "Unknown Player" });
            }
        }
        return users;
    }

    window.acceptApplicant = async function(uid) {
        if(!confirm(`Accept this player into the game?`)) return;
        try {
            const gameRef = doc(db, "games", gameId);
            await updateDoc(gameRef, {
                applicants: arrayRemove(uid),
                players: arrayUnion(uid),
                spotsFilled: currentGameData.spotsFilled + 1
            });
            await loadGameDetails();
        } catch (e) { alert("Failed to accept applicant."); }
    }

    window.declineApplicant = async function(uid) {
        if(!confirm(`Decline this request?`)) return;
        try {
            const gameRef = doc(db, "games", gameId);
            await updateDoc(gameRef, { applicants: arrayRemove(uid) });
            await loadGameDetails();
        } catch (e) { alert("Failed to decline applicant."); }
    }

    window.kickGamePlayer = async function(uid) {
        if(!confirm(`Remove this player from the roster?`)) return;
        try {
            const gameRef = doc(db, "games", gameId);
            const gameSnap = await getDoc(gameRef);
            if (gameSnap.exists()) {
                const gData = gameSnap.data();
                await updateDoc(gameRef, {
                    players: arrayRemove(uid),
                    spotsFilled: Math.max(0, (gData.spotsFilled || 1) - 1)
                });
                await loadGameDetails();
                alert(`Player has been removed.`);
            }
        } catch(e) {
            alert("Failed to remove player.");
        }
    };

    window.submitSquadScore = async function(squad1Id, squad2Id) {
        const s1ScoreVal = document.getElementById('squad1-score-input').value;
        const s2ScoreVal = document.getElementById('squad2-score-input').value;

        if (s1ScoreVal === '' || s2ScoreVal === '') {
            alert("Please enter a valid score for both squads.");
            return;
        }

        const score1 = parseInt(s1ScoreVal, 10);
        const score2 = parseInt(s2ScoreVal, 10);

        if (score1 === score2) {
            alert("A basketball game cannot end in a tie! Please enter the final overtime score.");
            return;
        }

        if(!confirm(`Confirm Final Score:\n\nSquad 1: ${score1}\nSquad 2: ${score2}\n\nThis will permanently update global records. This cannot be undone.`)) return;

        try {
            const winnerId = score1 > score2 ? squad1Id : squad2Id;
            const loserId = score1 > score2 ? squad2Id : squad1Id;

            await updateDoc(doc(db, "games", gameId), {
                matchResult: {
                    winnerSquadId: winnerId,
                    loserSquadId: loserId,
                    scores: {
                        [squad1Id]: score1,
                        [squad2Id]: score2
                    },
                    reportedAt: serverTimestamp()
                }
            });

            const wSnap = await getDoc(doc(db, "squads", winnerId));
            if (wSnap.exists()) {
                await updateDoc(doc(db, "squads", winnerId), { wins: (wSnap.data().wins || 0) + 1 });
            }
            
            const lSnap = await getDoc(doc(db, "squads", loserId));
            if (lSnap.exists()) {
                await updateDoc(doc(db, "squads", loserId), { losses: (lSnap.data().losses || 0) + 1 });
            }
            
            alert("Final score recorded successfully!");
            window.location.reload();
        } catch(e) {
            console.error(e);
            alert("Failed to record score.");
        }
    }

    async function renderGameDetails(game) {
        try {
            const mainContainer = document.getElementById('game-details-main');
            if (!mainContainer) return; 

            const gameStart = new Date(`${game.date}T${game.time}`);

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
            const players = Array.isArray(game.players) ? game.players : [game.hostId || safeHost];
            const applicants = Array.isArray(game.applicants) ? game.applicants : [];
            const spotsFilled = players.length;

            const gameStatus = getGameStatus(game.date, game.time, game.endTime);

            const allIdsOrNames = [...new Set([game.hostId, ...players, ...applicants])].filter(n => n && typeof n === 'string' && !n.toLowerCase().includes("reserved"));
            const playerProfiles = {};
            
            const profilePromises = allIdsOrNames.map(async (idOrName) => {
                try {
                    const userSnap = await getDoc(doc(db, "users", idOrName));
                    if (userSnap.exists()) {
                        playerProfiles[idOrName] = { uid: userSnap.id, ...userSnap.data() };
                        return;
                    }
                    const q = query(collection(db, "users"), where("displayName", "==", idOrName), limit(1));
                    const snap = await getDocs(q);
                    if (!snap.empty) {
                        playerProfiles[idOrName] = { uid: snap.docs[0].id, ...snap.docs[0].data() };
                    }
                } catch(e) {}
            });
            await Promise.all(profilePromises);

            let isHost = false;
            let isAdmin = false;

            if (currentUser) {
                isHost = currentUser.uid === game.hostId || currentUser.displayName === game.host;
                if (currentUserProfile && currentUserProfile.accountType === 'Administrator') isAdmin = true;
            }
            
            if (isHost && !game.hostId && currentUser) {
                try { await updateDoc(doc(db, "games", gameId), { hostId: currentUser.uid }); } catch(e) {}
            }
            
            const defaultImage = 'https://images.unsplash.com/photo-1546519638-68e109498ffc?q=80&w=2090&auto=format&fit=crop';
            const displayImage = game.imageUrl ? escapeHTML(game.imageUrl) : defaultImage;

            const safeLocSearch = encodeURIComponent(game.location || 'Metro Manila, Philippines');
            const finalMapEmbedUrl = "https://maps.google.com/maps?q=" + safeLocSearch + "&t=&z=13&ie=UTF8&iwloc=&output=embed";
            const finalMapLinkUrl = game.mapLink ? escapeHTML(game.mapLink) : "https://maps.google.com/maps?q=" + safeLocSearch;

            let mapHtml = '';
            if (game.mapLink) {
                mapHtml = `<a href="${escapeHTML(game.mapLink)}" target="_blank" class="w-full sm:w-auto text-[10px] font-bold tracking-widest uppercase text-primary hover:text-primary-container hover:underline transition-colors flex items-center gap-1 border border-primary/20 bg-primary/5 px-3 py-2 rounded-lg"><span class="material-symbols-outlined text-[14px]">map</span> View Map</a>`;
            }

            let adminBtnHtml = '';
            if (isHost || isAdmin) {
                adminBtnHtml = `
                    <button onclick="window.openManageGameModal()" class="w-full md:w-auto bg-surface-container border border-outline-variant/30 hover:border-primary/50 hover:bg-surface-container-highest px-6 py-2 rounded-lg font-headline font-black text-xs uppercase tracking-widest transition-all active:scale-95 shadow-sm text-on-surface">Manage Game</button>
                `;
            }

            const manageGameHtml = isHost ? `
                <button onclick="window.openManageGameModal()" class="absolute top-4 right-4 md:top-6 md:right-6 z-20 bg-[#0a0e14]/80 backdrop-blur-md border border-outline-variant/30 text-on-surface hover:text-primary hover:border-primary/50 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg flex items-center gap-2 cursor-pointer">
                    <span class="material-symbols-outlined text-[16px]">settings</span>
                    Manage Game
                </button>
            ` : '';

            const hostProfileExists = !!playerProfiles[game.hostId] || !!playerProfiles[game.host];
            let claimHtml = '';
            if (!hostProfileExists && currentUser && !isHost && !isSquadMatch) {
                claimHtml = `
                    <div class="bg-tertiary/10 border border-tertiary/30 p-5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 shadow-md">
                        <div class="flex-1">
                            <h3 class="font-headline text-tertiary font-black italic uppercase tracking-tighter text-lg flex items-center gap-2 mb-1">
                                <span class="material-symbols-outlined text-[20px]">warning</span> Orphaned Game
                            </h3>
                            <p class="text-xs text-on-surface-variant leading-relaxed">The organizer profile for this game cannot be found. If you created this game before changing your profile, claim it to restore full admin controls.</p>
                        </div>
                        <button onclick="window.claimOrphanedGame('${game.host}')" class="shrink-0 w-full sm:w-auto bg-tertiary text-on-primary-container px-6 py-3 rounded-xl font-black uppercase text-[11px] tracking-widest shadow-lg hover:brightness-110 active:scale-95 transition-all">Claim Game</button>
                    </div>
                `;
            }

            let adminOverrideHtml = '';
            if (isAdmin && !isHost) {
                adminOverrideHtml = `
                    <div class="bg-error/10 border border-error/30 p-5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 shadow-md">
                        <div class="flex-1">
                            <h3 class="font-headline text-error font-black italic uppercase tracking-tighter text-lg flex items-center gap-2 mb-1">
                                <span class="material-symbols-outlined text-[20px]">gavel</span> Admin Override
                            </h3>
                            <p class="text-xs text-on-surface-variant leading-relaxed">Force cancel and delete this game from the database.</p>
                        </div>
                        <button onclick="window.adminForceCancelGame('${gameId}')" class="shrink-0 w-full sm:w-auto bg-error hover:brightness-110 text-white px-6 py-3 rounded-xl font-black uppercase text-[11px] tracking-widest shadow-lg active:scale-95 transition-all">Force Cancel</button>
                    </div>
                `;
            }

            let myCommendedUserIds = [];
            let myRatedUserIds = [];

            if (currentUser) {
                try {
                    const commQ = query(collection(db, "commendations"), where("senderId", "==", currentUser.uid));
                    const rateQ = query(collection(db, "ratings"), where("raterId", "==", currentUser.uid));
                    
                    const [commSnap, rateSnap] = await Promise.all([getDocs(commQ), getDocs(rateQ)]);
                    
                    myCommendedUserIds = commSnap.docs.filter(d => d.data().gameId === gameId).map(d => d.data().targetUserId);
                    myRatedUserIds = rateSnap.docs.filter(d => d.data().gameId === gameId).map(d => d.data().targetUserId);
                } catch(e) {}
            }

            let waitlistHtml = '';
            if (isHost && !isSquadMatch && gameStatus === 'Upcoming') {
                let appList = '';
                if (applicants.length > 0) {
                    appList = applicants.filter(n => n && typeof n === 'string').map(idOrName => {
                        const profile = playerProfiles[idOrName];
                        const appUid = profile ? profile.uid : idOrName;
                        const safeAppName = escapeHTML(profile ? profile.displayName : idOrName);
                        const photoUrl = profile ? escapeHTML(profile.photoURL || '') : '';
                        const finalPhotoUrl = photoUrl || getFallbackAvatar(safeAppName);

                        return `
                        <div class="flex items-center justify-between bg-surface-container-highest p-3 rounded-xl border border-outline-variant/10">
                            <div class="flex items-center gap-3 cursor-pointer" onclick="window.location.href='profile.html?id=${appUid}'">
                                <img src="${finalPhotoUrl}" class="w-10 h-10 rounded-lg object-cover border border-outline-variant/30">
                                <span class="font-bold text-sm text-on-surface hover:text-primary transition-colors">${safeAppName}</span>
                            </div>
                            <div class="flex gap-2 shrink-0">
                                <button onclick="window.declineApplicant('${appUid}')" class="px-3 md:px-4 py-2 rounded-lg bg-surface-container text-error border border-outline-variant/30 hover:border-error/50 transition-colors text-[9px] md:text-[10px] font-black tracking-widest uppercase">Decline</button>
                                <button onclick="window.acceptApplicant('${appUid}')" class="px-3 md:px-4 py-2 rounded-lg bg-primary/20 text-primary border border-primary/30 hover:bg-primary hover:text-on-primary-container transition-colors text-[9px] md:text-[10px] font-black tracking-widest uppercase">Accept</button>
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
                const isParticipant = currentUser && (players.includes(currentUser.uid) || players.includes(currentUser.displayName));
                const validPlayers = players.filter(p => p && typeof p === 'string' && !p.toLowerCase().includes('reserved'));
                
                if (isSquadMatch) {
                    const hasResult = game.matchResult;
                    if (!hasResult && isHost && squad1Data && squad2Data) {
                        postGameDashboardHtml += `
                            <div class="bg-gradient-to-b from-secondary/10 to-[#14171d] p-5 md:p-6 rounded-3xl border border-secondary/30 shadow-lg mb-6">
                                <h3 class="font-headline text-xl font-black uppercase tracking-tighter text-secondary mb-4 flex items-center gap-2"><span class="material-symbols-outlined">emoji_events</span> Record Final Score</h3>
                                <p class="text-xs text-on-surface-variant mb-6">Enter the final score for both squads. This permanently updates global rankings.</p>
                                
                                <div class="flex items-center justify-between gap-4 mb-6">
                                    <div class="flex-1 flex flex-col items-center">
                                        <span class="font-headline font-black uppercase text-sm mb-2 text-center break-words w-full truncate">${escapeHTML(squad1Data.name)}</span>
                                        <input type="number" id="squad1-score-input" min="0" class="w-20 text-center font-black text-2xl bg-[#0a0e14] border border-outline-variant/30 rounded-xl p-3 text-on-surface focus:ring-primary focus:border-primary transition-all" placeholder="0">
                                    </div>
                                    <span class="font-black text-outline-variant">VS</span>
                                    <div class="flex-1 flex flex-col items-center">
                                        <span class="font-headline font-black uppercase text-sm mb-2 text-center break-words w-full truncate">${escapeHTML(squad2Data.name)}</span>
                                        <input type="number" id="squad2-score-input" min="0" class="w-20 text-center font-black text-2xl bg-[#0a0e14] border border-outline-variant/30 rounded-xl p-3 text-on-surface focus:ring-primary focus:border-primary transition-all" placeholder="0">
                                    </div>
                                </div>

                                <button onclick="window.submitSquadScore('${squad1Data.id}', '${squad2Data.id}')" class="w-full bg-primary hover:brightness-110 text-on-primary-container py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-md active:scale-95">Submit Official Score</button>
                            </div>
                        `;
                    } else if (hasResult && squad1Data && squad2Data) {
                        const winnerId = hasResult.winnerSquadId;
                        const winner = winnerId === squad1Data.id ? squad1Data : squad2Data;
                        const s1Score = hasResult.scores ? hasResult.scores[squad1Data.id] : '-';
                        const s2Score = hasResult.scores ? hasResult.scores[squad2Data.id] : '-';

                        postGameDashboardHtml += `
                            <div class="bg-surface-container-highest p-6 md:p-8 rounded-3xl border border-primary/40 shadow-[0_0_30px_rgba(255,143,111,0.15)] mb-6 flex flex-col items-center justify-center text-center">
                                <span class="material-symbols-outlined text-6xl text-primary mb-3 drop-shadow-md">trophy</span>
                                <h3 class="font-headline text-3xl font-black italic uppercase tracking-tighter text-on-surface mb-2">${escapeHTML(winner.name)} WINS</h3>
                                
                                <div class="flex items-center gap-4 mt-2 bg-[#0a0e14] px-6 py-3 rounded-2xl border border-outline-variant/20">
                                    <div class="text-center">
                                        <p class="text-[9px] uppercase tracking-widest text-outline-variant mb-1">${escapeHTML(squad1Data.abbreviation)}</p>
                                        <p class="font-black text-2xl ${winnerId === squad1Data.id ? 'text-primary' : 'text-on-surface'}">${s1Score}</p>
                                    </div>
                                    <span class="text-outline-variant font-bold">-</span>
                                    <div class="text-center">
                                        <p class="text-[9px] uppercase tracking-widest text-outline-variant mb-1">${escapeHTML(squad2Data.abbreviation)}</p>
                                        <p class="font-black text-2xl ${winnerId === squad2Data.id ? 'text-primary' : 'text-on-surface'}">${s2Score}</p>
                                    </div>
                                </div>
                            </div>
                        `;
                    }
                } 
                else {
                    if (isHost) {
                        let checkListHtml = validPlayers.map(idOrName => {
                            const profile = playerProfiles[idOrName];
                            const pUid = profile ? profile.uid : idOrName;
                            const safeP = escapeHTML(profile ? profile.displayName : idOrName);
                            
                            const isAssessed = Array.isArray(game.attendanceReported) && (game.attendanceReported.includes(pUid) || game.attendanceReported.includes(safeP));
                            const photoUrl = profile ? escapeHTML(profile.photoURL || '') : '';
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
                                        <button onclick="window.markPlayerAttendance('${pUid}', false)" class="px-4 py-2 bg-error/10 text-error hover:bg-error/20 border border-error/20 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm">No Show</button>
                                        <button onclick="window.markPlayerAttendance('${pUid}', true)" class="px-4 py-2 bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">check</span> Attended</button>
                                    </div>
                                </div>
                            `;
                        }).join('');

                        if (validPlayers.length === 0 || (Array.isArray(game.attendanceReported) && game.attendanceReported.length >= validPlayers.length)) {
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
                        const currentUserAssessed = (Array.isArray(game.attendanceReported) && (game.attendanceReported.includes(currentUser.uid) || game.attendanceReported.includes(currentUser.displayName)));
                        const currentUserDidAttend = (Array.isArray(game.attendedPlayers) && (game.attendedPlayers.includes(currentUser.uid) || game.attendedPlayers.includes(currentUser.displayName)));
                        
                        let rateListHtml = '';

                        if (!currentUserAssessed && !isHost) {
                            rateListHtml = `
                                <div class="flex flex-col items-center justify-center py-6 text-outline-variant opacity-70">
                                    <span class="material-symbols-outlined text-4xl mb-2 animate-pulse">hourglass_empty</span>
                                    <p class="text-xs font-bold uppercase tracking-widest text-center">Pending Attendance</p>
                                    <p class="text-[10px] mt-1 text-center">The host is verifying attendance. Check back soon!</p>
                                </div>
                            `;
                        } else if (!currentUserDidAttend && !isHost) {
                            rateListHtml = `
                                <div class="flex flex-col items-center justify-center py-6 text-error opacity-80">
                                    <span class="material-symbols-outlined text-4xl mb-2">person_off</span>
                                    <p class="text-xs font-bold uppercase tracking-widest text-center">Marked as No-Show</p>
                                    <p class="text-[10px] mt-1 text-center max-w-xs mx-auto">You cannot rate players because you were marked absent. If this is an error, please contact support.</p>
                                </div>
                            `;
                        } else {
                            const rateableTeammates = players.filter(p => {
                                if (!p || typeof p !== 'string') return false;
                                if (p === currentUser.uid || p === currentUser.displayName) return false; 
                                if (p.toLowerCase().includes('reserved')) return false; 
                                return Array.isArray(game.attendedPlayers) && (game.attendedPlayers.includes(p) || game.attendedPlayers.includes(playerProfiles[p]?.uid)); 
                            });

                            if (rateableTeammates.length === 0) {
                                rateListHtml = `<p class="text-xs text-outline italic text-center py-4">No other players available to rate.</p>`;
                            } else {
                                rateListHtml = rateableTeammates.map(idOrName => {
                                    const profile = playerProfiles[idOrName];
                                    const pUid = profile ? profile.uid : null;
                                    const safeP = escapeHTML(profile ? profile.displayName : idOrName);
                                    
                                    const hasCommended = pUid && myCommendedUserIds.includes(pUid);
                                    const hasRated = pUid && myRatedUserIds.includes(pUid);
                                    
                                    const photoUrl = profile ? escapeHTML(profile.photoURL || '') : '';
                                    const finalPhotoUrl = photoUrl || getFallbackAvatar(safeP);

                                    if (!pUid) return ''; 

                                    const commendBtnHtml = hasCommended 
                                        ? `<button disabled class="px-3 py-2 bg-surface-container text-outline border border-outline-variant/20 rounded-lg text-[10px] font-black uppercase tracking-widest cursor-not-allowed flex items-center gap-1 opacity-50"><span class="material-symbols-outlined text-[14px]">thumb_up</span> Props</button>`
                                        : `<button onclick="window.quickCommend('${pUid}')" class="px-3 py-2 bg-secondary/10 text-secondary hover:bg-secondary/20 border border-secondary/20 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">thumb_up</span> Props</button>`;

                                    const rateBtnHtml = hasRated
                                        ? `<button disabled class="px-3 py-2 bg-surface-container text-outline border border-outline-variant/20 rounded-lg text-[10px] font-black uppercase tracking-widest cursor-not-allowed flex items-center gap-1 opacity-50"><span class="material-symbols-outlined text-[14px]">star</span> Rated</button>`
                                        : `<button onclick="window.quickRate('${pUid}', '${safeP}')" class="px-3 py-2 bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">star</span> Rate</button>`;

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
                            }
                        }

                        postGameDashboardHtml += `
                            <div class="bg-[#14171d] p-5 md:p-6 rounded-3xl border border-secondary/30 shadow-lg mb-6">
                                <div class="flex justify-between items-end mb-4 border-b border-outline-variant/10 pb-4">
                                    <div>
                                        <h3 class="font-headline text-xl font-black uppercase tracking-tighter text-secondary flex items-center gap-2 mb-1">
                                            <span class="material-symbols-outlined">star_rate</span> Rate Players
                                        </h3>
                                        <p class="text-xs text-on-surface-variant font-medium">Build the community. Give props to players who actually attended the game!</p>
                                    </div>
                                </div>
                                <div class="space-y-3">
                                    ${rateListHtml}
                                </div>
                            </div>
                        `;
                    }
                }
            }

            let rosterSectionHtml = '';
            
            const isSquadMatchValid = isSquadMatch && squad1Data && squad2Data;

            if (isSquadMatchValid) {
                const posMap = { 'PG': 'Point Guard', 'SG': 'Shooting Guard', 'SF': 'Small Forward', 'PF': 'Power Forward', 'C': 'Center' };

                const buildSquadRoster = (squad, users, label, labelColor) => {
                    let teamPlayers = users.filter(u => players.includes(u.uid) || players.includes(u.displayName));
                    
                    if (!teamPlayers.find(u => u.uid === squad.captainId)) {
                        const capt = users.find(u => u.uid === squad.captainId);
                        if (capt) teamPlayers.unshift(capt);
                    }

                    const isThisSquadCaptain = currentUser && currentUser.uid === squad.captainId;
                    const canManage = isThisSquadCaptain && gameStatus === 'Upcoming';
                    const squadLogoImg = squad.logoUrl ? escapeHTML(squad.logoUrl) : getFallbackAvatar(squad.name);

                    let html = `
                        <div class="bg-[#14171d] rounded-2xl p-4 md:p-5 border border-outline-variant/10 shadow-sm flex flex-col h-full">
                            <div class="flex items-start gap-4 mb-4 border-b border-outline-variant/10 pb-4">
                                <div class="w-14 h-14 rounded-xl bg-surface-container flex items-center justify-center overflow-hidden shrink-0 border border-outline-variant/20 shadow-inner">
                                    <img src="${squadLogoImg}" onerror="this.onerror=null; this.src='${getFallbackAvatar(squad.name)}';" class="w-full h-full object-cover">
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

                const sq1Users = await fetchUsersByUids(squad1Data.members);
                const sq2Users = await fetchUsersByUids(squad2Data.members);
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
                const rosterPlayers = await fetchUsersByUids(players);
                let rosterGridHtml = '';

                for (let i = 0; i < spotsTotal; i++) {
                    const player = rosterPlayers[i];
                    if (player) {
                        if (player.isReserved) {
                            const resName = game.reservations?.[i] || "Reserved Slot";
                            let removeBtn = '';
                            if (isHost && gameStatus === 'Upcoming') {
                                removeBtn = `<button onclick="window.removeReservation(${i})" class="absolute top-2 right-2 text-error hover:bg-error/10 p-1.5 rounded-full transition-colors z-20" title="Remove Reservation"><span class="material-symbols-outlined text-[14px]">close</span></button>`;
                            }
                            rosterGridHtml += `
                                <div class="bg-[#14171d] rounded-2xl p-4 flex flex-col items-center justify-center border border-outline-variant/10 text-center gap-2 shadow-sm relative opacity-70 border-dashed">
                                    ${removeBtn}
                                    <div class="w-14 h-14 md:w-16 md:h-16 rounded-xl bg-surface-variant flex items-center justify-center border border-outline-variant/20 overflow-hidden transition-all">
                                        <span class="material-symbols-outlined text-outline-variant">lock</span>
                                    </div>
                                    <div class="w-full">
                                        <p class="font-bold text-[13px] md:text-sm text-on-surface uppercase truncate w-full" title="${escapeHTML(resName)}">${escapeHTML(resName)}</p>
                                        <p class="text-[8px] md:text-[9px] text-outline-variant/50 uppercase font-black tracking-widest mt-0.5 truncate">Reserved</p>
                                    </div>
                                </div>
                            `;
                        } else {
                            const pUid = player.uid; 
                            const safeName = escapeHTML(player.displayName);
                            const photoUrl = escapeHTML(player.photoURL || '') || getFallbackAvatar(safeName);
                            const isGameHost = safeName === safeHost || pUid === game.hostId;
                            
                            const clickableStyle = pUid ? 'cursor-pointer hover:border-primary/50 transition-colors group relative' : 'relative';
                            const onClick = pUid ? `onclick="window.location.href='profile.html?id=${pUid}'"` : '';

                            const kickBtnHtml = (isHost && !isGameHost && gameStatus === 'Upcoming') ? `
                                <button onclick="event.stopPropagation(); window.kickGamePlayer('${pUid || safeName}')" class="absolute top-2 right-2 bg-error/10 text-error hover:bg-error hover:text-white p-1 rounded-full transition-colors z-20 shadow-sm border border-error/20" title="Remove Player">
                                    <span class="material-symbols-outlined text-[14px]">person_remove</span>
                                </button>
                            ` : '';

                            rosterGridHtml += `
                                <div class="bg-[#14171d] rounded-2xl p-4 flex flex-col items-center justify-center border border-outline-variant/10 text-center gap-2 shadow-sm ${clickableStyle}" ${onClick}>
                                    ${kickBtnHtml}
                                    <div class="w-14 h-14 md:w-16 md:h-16 rounded-xl flex items-center justify-center border border-outline-variant/20 overflow-hidden ${pUid ? 'group-hover:border-primary/50 group-hover:scale-105' : ''} bg-surface-container transition-all">
                                        <img src="${photoUrl}" onerror="this.onerror=null; this.src='${getFallbackAvatar(safeName)}';" class="w-full h-full object-cover">
                                    </div>
                                    <div class="w-full">
                                        <p class="font-bold text-[13px] md:text-sm text-on-surface break-words leading-tight w-full ${pUid ? 'group-hover:text-primary transition-colors' : ''}">${safeName}</p>
                                        <p class="text-[8px] md:text-[9px] ${isGameHost ? 'text-primary' : 'text-outline-variant'} uppercase font-black tracking-widest mt-0.5 truncate">${isGameHost ? 'CAPTAIN' : 'PLAYER'}</p>
                                    </div>
                                </div>
                            `;
                        }
                    } else {
                        const canManageOpen = isHost && gameStatus === 'Upcoming';
                        const hostStyles = canManageOpen ? 'cursor-pointer hover:border-primary/50 hover:text-primary transition-colors hover:opacity-100 group relative' : 'relative';
                        const hostOnClick = canManageOpen ? `onclick="window.openManageSlotModal('open')"` : '';
                        const borderCurrent = canManageOpen ? 'border-current group-hover:scale-110 transition-transform' : 'border-outline-variant';
                        const iconColor = canManageOpen ? '' : 'text-outline-variant';

                        rosterGridHtml += `
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

                rosterSectionHtml = `
                    <div class="bg-[#0f141a] border border-outline-variant/5 rounded-3xl p-5 md:p-6 flex flex-col">
                        <div class="flex justify-between items-end mb-6 border-b border-outline-variant/10 pb-4">
                            <h2 class="font-headline text-2xl font-black italic uppercase tracking-tighter text-on-surface">THE ROSTER</h2>
                            <span class="text-[10px] text-outline font-bold uppercase tracking-widest bg-surface-container-highest px-3 py-1 rounded-full">${spotsFilled} / ${spotsTotal} PLAYERS</span>
                        </div>
                        <div class="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 flex-1 content-start" id="roster-container">
                            ${rosterGridHtml}
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
                                <iframe class="w-full h-full rounded-xl pointer-events-none md:pointer-events-auto" style="border:0; filter: invert(90%) hue-rotate(180deg) brightness(85%) contrast(85%);" loading="lazy" allowfullscreen referrerpolicy="no-referrer-when-downgrade" src="${finalMapEmbedUrl}"></iframe>
                            </div>
                            <div class="bg-[#14171d] p-5 md:p-6 rounded-2xl border border-outline-variant/10 shadow-sm flex flex-col justify-center">
                                <h3 class="font-headline text-sm font-black uppercase tracking-widest text-on-surface mb-3">Court Details</h3>
                                <p class="text-on-surface-variant text-sm leading-relaxed">${safeDesc}</p>
                            </div>
                        </div>
                        ${claimHtml}
                        ${adminOverrideHtml}
                        ${postGameDashboardHtml}
                        ${rosterSectionHtml}
                    </div>
                `;
            } else {
                mainContentLayoutHtml = `
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                        <div class="space-y-4 md:space-y-6 flex flex-col">
                            <div class="w-full h-48 md:h-56 bg-[#14171d] rounded-2xl border border-outline-variant/10 relative overflow-hidden shadow-sm p-1">
                                <iframe class="w-full h-full rounded-xl pointer-events-none md:pointer-events-auto" style="border:0; filter: invert(90%) hue-rotate(180deg) brightness(85%) contrast(85%);" loading="lazy" allowfullscreen referrerpolicy="no-referrer-when-downgrade" src="${finalMapEmbedUrl}"></iframe>
                            </div>
                            <div class="bg-[#14171d] p-5 md:p-6 rounded-2xl border border-outline-variant/10 shadow-sm flex-1">
                                <h3 class="font-headline text-sm font-black uppercase tracking-widest text-on-surface mb-3">Court Details</h3>
                                <p class="text-on-surface-variant text-sm leading-relaxed">${safeDesc}</p>
                            </div>
                        </div>
                        <div class="space-y-6">
                            ${claimHtml}
                            ${adminOverrideHtml}
                            ${postGameDashboardHtml}
                            ${waitlistHtml}
                            ${rosterSectionHtml}
                        </div>
                    </div>
                `;
            }

            mainContainer.classList.remove('animate-pulse');

            mainContainer.innerHTML = `
                <div class="lg:col-span-12 space-y-4 md:space-y-6">
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

                    <div class="flex flex-col md:flex-row gap-4 mt-6">
                        <div class="bg-[#14171d] flex-1 rounded-2xl p-5 border border-outline-variant/10 flex items-center gap-4 shadow-sm hover:border-primary/30 transition-colors">
                            <div class="w-12 h-12 rounded-xl bg-surface-container-highest flex flex-col items-center justify-center border border-outline-variant/20 shadow-inner">
                                <span class="text-[9px] text-primary font-black uppercase tracking-widest leading-none mb-0.5">${new Date(gameStart).toLocaleString('default', { month: 'short' })}</span>
                                <span class="text-lg font-headline font-black text-on-surface leading-none">${new Date(gameStart).getDate()}</span>
                            </div>
                            <div>
                                <p class="text-[10px] text-outline uppercase font-bold tracking-widest mb-1">Schedule</p>
                                <p class="font-bold text-sm text-on-surface">${safeDate}</p>
                                <p class="text-xs text-on-surface-variant font-medium mt-0.5">${safeTime}</p>
                            </div>
                        </div>
                        
                        <div class="bg-[#14171d] flex-1 rounded-2xl p-5 border border-outline-variant/10 flex items-center gap-4 shadow-sm hover:border-secondary/30 transition-colors">
                            <div class="w-12 h-12 rounded-xl bg-surface-container-highest flex items-center justify-center border border-outline-variant/20 shadow-inner">
                                <span class="material-symbols-outlined text-secondary text-2xl">trending_up</span>
                            </div>
                            <div>
                                <p class="text-[10px] text-outline uppercase font-bold tracking-widest mb-1">Skill Level</p>
                                <p class="font-black text-sm text-on-surface uppercase tracking-wider">${safeSkill}</p>
                            </div>
                        </div>
                    </div>

                    <div class="flex flex-col sm:flex-row items-center gap-4 mt-6 mb-6 justify-between bg-surface-container-low p-4 rounded-2xl border border-outline-variant/10 shadow-sm">
                        ${mapHtml}
                        ${adminBtnHtml}
                    </div>

                    ${mainContentLayoutHtml}
                </div>
            `;

        } catch (error) {
            console.error("Rendering Error Details:", error);
            
            const mainContainer = document.getElementById('game-details-main');
            if (mainContainer) {
                mainContainer.classList.remove('animate-pulse');
                mainContainer.innerHTML = `
                    <div class="text-center py-20 lg:col-span-12 bg-surface-container-low rounded-3xl border border-error/30 mt-10 shadow-lg">
                        <span class="material-symbols-outlined text-6xl text-error mb-4">error</span>
                        <h2 class="text-2xl font-black uppercase tracking-widest text-on-surface">Data Sync Failed</h2>
                        <p class="mt-2 text-on-surface-variant">There was an issue processing this game's data. Please check your connection or try again later.</p>
                    </div>
                `;
            }
        }
    }

    function updateJoinButtonState() {
        if (!currentGameData || !joinBtn) return;

        const newJoinBtn = joinBtn.cloneNode(true);
        joinBtn.parentNode.replaceChild(newJoinBtn, joinBtn);
        joinBtn = newJoinBtn;

        const gameStatus = getGameStatus(currentGameData.date, currentGameData.time, currentGameData.endTime);
        const uid = currentUser ? currentUser.uid : null;
        const profileName = currentUserProfile ? currentUserProfile.displayName : null;

        if (isSquadMatch) {
            let isActuallyPlaying = false;
            let isSquadMember = false;

            const gamePlayers = currentGameData.players || [];
            if (currentUser) {
                isActuallyPlaying = Array.isArray(gamePlayers) && gamePlayers.includes(currentUser.uid);
                
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
                            players: arrayRemove(currentUser.uid)
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
                                    players: arrayUnion(currentUser.uid)
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
        const players = Array.isArray(currentGameData.players) ? currentGameData.players : [];
        const applicants = Array.isArray(currentGameData.applicants) ? currentGameData.applicants : [];
        const spotsFilled = players.length;

        const isHost = uid === currentGameData.hostId || profileName === currentGameData.host;
        const isJoined = isHost || players.includes(uid) || players.includes(profileName);
        
        const isApplicant = currentUser && applicants.includes(currentUser.uid);
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
            if (isHost) {
                joinBtn.innerHTML = `CANCEL & DELETE MATCH <span class="material-symbols-outlined text-[18px]">delete_forever</span>`;
                joinBtn.disabled = false; 
                joinBtn.addEventListener('click', window.deleteGame);
                joinBtn.classList.add('bg-error/10', 'hover:bg-error/20', 'text-error', 'border', 'border-error/30', 'active:scale-95');
            } else {
                joinBtn.innerHTML = `LEAVE GAME <span class="material-symbols-outlined text-[18px]">logout</span>`;
                joinBtn.disabled = false; 
                joinBtn.addEventListener('click', handleNormalJoinLeave);
                joinBtn.classList.add('bg-error/10', 'hover:bg-error/20', 'text-error', 'border', 'border-error/30', 'active:scale-95');
            }
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
        const players = Array.isArray(currentGameData.players) ? currentGameData.players : [];
        const spotsFilled = players.length;

        const isHost = currentUser.uid === currentGameData.hostId || currentUser.displayName === currentGameData.host;
        const isJoined = isHost || players.includes(currentUser.uid) || players.includes(currentUser.displayName);
        
        const isFull = spotsFilled >= spotsTotal;
        const gameStatus = getGameStatus(currentGameData.date, currentGameData.time, currentGameData.endTime);

        if (gameStatus !== 'Upcoming') {
            alert("This game is no longer active.");
            return;
        }

        if (isJoined) {
            if (isHost) return; 

            if(!confirm("Are you sure you want to give up your spot?")) return;
            try {
                joinBtn.innerHTML = `<span class="material-symbols-outlined animate-spin">refresh</span>`;
                joinBtn.disabled = true;

                const gameRef = doc(db, "games", gameId);
                await updateDoc(gameRef, {
                    players: arrayRemove(currentUser.uid),
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
                    applicants: arrayUnion(currentUser.uid)
                });
                
                try {
                    const hostDoc = await getDoc(doc(db, "users", currentGameData.hostId));
                    if (hostDoc.exists() && hostDoc.id !== currentUser.uid) {
                        await addDoc(collection(db, "notifications"), {
                            recipientId: hostDoc.id,
                            actorId: currentUser.uid,
                            actorName: currentUser.displayName,
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
                    players: arrayUnion(currentUser.uid),
                    spotsFilled: spotsFilled + 1,
                    applicants: arrayRemove(currentUser.uid) 
                });
                
                try {
                    const hostDoc = await getDoc(doc(db, "users", currentGameData.hostId));
                    if (hostDoc.exists() && hostDoc.id !== currentUser.uid) {
                        await addDoc(collection(db, "notifications"), {
                            recipientId: hostDoc.id,
                            actorId: currentUser.uid,
                            actorName: currentUser.displayName,
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

    if (closeSlotModal) {
        closeSlotModal.addEventListener('click', () => {
            slotModal.classList.add('opacity-0');
            slotModal.querySelector('div').classList.add('scale-95');
            setTimeout(() => {
                slotModal.classList.add('hidden');
                slotModal.classList.remove('flex');
            }, 300);
        });
    }

    if (reserveBtn) {
        reserveBtn.addEventListener('click', async () => {
            const name = prompt("Enter a name for this reserved slot:");
            if (!name || name.trim() === '') return;

            const resId = `RESERVED_${currentSlotIndex}`;
            try {
                await updateDoc(doc(db, "games", gameId), {
                    players: arrayUnion(resId),
                    [`reservations.${currentSlotIndex}`]: name.trim(),
                    spotsFilled: increment(1)
                });
                closeSlotModal.click();
                loadGameDetails();
            } catch(e) {
                console.error(e);
                alert("Failed to reserve slot.");
            }
        });
    }

    if (removeReserveBtn) {
        removeReserveBtn.addEventListener('click', async () => {
            const resId = `RESERVED_${currentSlotIndex}`;
            try {
                await updateDoc(doc(db, "games", gameId), {
                    players: arrayRemove(resId),
                    [`reservations.${currentSlotIndex}`]: null,
                    spotsFilled: increment(-1)
                });
                closeSlotModal.click();
                loadGameDetails();
            } catch(e) {
                console.error(e);
                alert("Failed to remove reservation.");
            }
        });
    }

    window.removeReservation = async function(index) {
        if(!confirm("Remove this reserved slot?")) return;
        const resId = `RESERVED_${index}`;
        try {
            await updateDoc(doc(db, "games", gameId), {
                players: arrayRemove(resId),
                [`reservations.${index}`]: null,
                spotsFilled: increment(-1)
            });
            loadGameDetails();
        } catch(e) {
            console.error(e);
            alert("Failed to remove reservation.");
        }
    };

    if (inviteBtn) {
        inviteBtn.addEventListener('click', async () => {
            closeSlotModal.click();
            inviteListContainer.innerHTML = '<div class="text-center py-8 opacity-50"><span class="material-symbols-outlined animate-spin text-4xl text-primary">sync</span><p class="text-xs font-bold uppercase tracking-widest mt-2">Loading Connections...</p></div>';
            
            inviteListModal.classList.remove('hidden');
            inviteListModal.classList.add('flex');
            setTimeout(() => {
                inviteListModal.classList.remove('opacity-0');
                inviteListModal.querySelector('div').classList.remove('scale-95');
            }, 10);

            try {
                const connRef = collection(db, "connections");
                const q1 = await getDocs(query(connRef, where("requesterId", "==", currentUser.uid), where("status", "==", "accepted")));
                const q2 = await getDocs(query(connRef, where("receiverId", "==", currentUser.uid), where("status", "==", "accepted")));
                
                const uids = [];
                q1.forEach(d => uids.push(d.data().receiverId));
                q2.forEach(d => uids.push(d.data().requesterId));

                if (uids.length === 0) {
                    inviteListContainer.innerHTML = '<p class="text-sm text-center text-outline-variant py-6">You have no connections to invite.</p>';
                    return;
                }

                const users = await fetchUsersByUids([...new Set(uids)]);
                inviteListContainer.innerHTML = '';
                
                users.forEach(u => {
                    const isAlreadyIn = currentGameData.players.includes(u.uid);
                    let btnHtml = isAlreadyIn 
                        ? `<button disabled class="px-4 py-2 bg-surface-container border border-outline-variant/20 text-outline-variant rounded-xl text-[10px] font-black uppercase tracking-widest cursor-not-allowed shadow-sm">In Game</button>`
                        : `<button onclick="window.sendInvite('${u.uid}')" class="px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm active:scale-95">Send Invite</button>`;
                    
                    inviteListContainer.innerHTML += `
                        <div class="flex items-center justify-between p-3 bg-surface-container-low hover:bg-surface-container-highest rounded-xl border border-outline-variant/10 transition-colors shadow-sm">
                            <div class="flex items-center gap-3">
                                <img src="${u.photoURL || getFallbackAvatar(u.displayName)}" class="w-10 h-10 rounded-full object-cover border border-outline-variant/30">
                                <div>
                                    <p class="font-bold text-sm text-on-surface">${escapeHTML(u.displayName)}</p>
                                    <p class="text-[9px] text-outline uppercase font-black tracking-widest">${escapeHTML(posMap[u.primaryPosition] || u.primaryPosition || 'Player')}</p>
                                </div>
                            </div>
                            ${btnHtml}
                        </div>
                    `;
                });
            } catch(e) {
                console.error(e);
                inviteListContainer.innerHTML = '<p class="text-sm text-center text-error py-6">Failed to load connections.</p>';
            }
        });
    }

    if (closeInviteListBtn) {
        closeInviteListBtn.addEventListener('click', () => {
            inviteListModal.classList.add('opacity-0');
            inviteListModal.querySelector('div').classList.add('scale-95');
            setTimeout(() => {
                inviteListModal.classList.add('hidden');
                inviteListModal.classList.remove('flex');
            }, 300);
        });
    }

    window.sendInvite = async function(targetUid) {
        try {
            await addDoc(collection(db, "notifications"), {
                recipientId: targetUid,
                actorId: currentUser.uid,
                actorName: currentUser.displayName || currentUserProfile?.displayName || "A connection",
                actorPhoto: currentUser.photoURL || currentUserProfile?.photoURL || null,
                type: 'game_invite',
                targetId: gameId,
                message: `invited you to play: "${currentGameData.title}"`,
                link: `game-details.html?id=${gameId}`,
                read: false,
                createdAt: serverTimestamp()
            });
            alert("Invite sent!");
            closeInviteListBtn.click();
        } catch (err) {
            console.error(err);
            alert("Failed to send invite.");
        }
    };

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

    window.adminForceCancelGame = async function(gid) {
        if (!confirm("ADMIN ACTION: Are you sure you want to force-cancel this game? This will delete it permanently.")) return;
        
        try {
            await deleteDoc(doc(db, "games", gid));
            alert("Game successfully removed by Admin.");
            window.location.replace("listings.html");
        } catch(e) {
            console.error(e);
            alert("Failed to delete game.");
        }
    };

    window.openImageModal = function(imgSrc) {
        let modal = document.getElementById('image-modal');
        if (modal) {
            const imgEl = modal.querySelector('img');
            if (imgEl) imgEl.src = imgSrc;
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            setTimeout(() => {
                modal.classList.remove('opacity-0');
                modal.querySelector('img').classList.remove('scale-95');
                modal.querySelector('img').classList.add('scale-100');
            }, 10);
            return;
        }

        modal = document.getElementById('dynamic-image-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'dynamic-image-modal';
            modal.className = 'fixed inset-0 z-[100] hidden items-center justify-center bg-background/90 backdrop-blur-sm transition-opacity duration-300 opacity-0';
            modal.innerHTML = `
                <div class="relative max-w-5xl w-full mx-4 transition-transform duration-300 scale-95 flex flex-col items-center justify-center">
                    <button onclick="window.closeImageModal()" class="absolute -top-14 right-0 bg-surface-container-highest text-on-surface hover:text-primary p-2 rounded-full transition-colors shadow-lg border border-outline-variant/30 z-10 flex items-center justify-center">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                    <img id="dynamic-image-modal-img" src="" class="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl border border-outline-variant/20">
                </div>
            `;
            document.body.appendChild(modal);
            modal.addEventListener('click', (e) => {
                if (e.target === modal) window.closeImageModal();
            });
        }

        document.getElementById('dynamic-image-modal-img').src = imgSrc;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        void modal.offsetWidth; 
        modal.classList.remove('opacity-0');
        modal.querySelector('div').classList.remove('scale-95');
        modal.querySelector('div').classList.add('scale-100');
        document.body.style.overflow = 'hidden';
    };

    window.closeImageModal = function() {
        let modal = document.getElementById('image-modal');
        if (modal) {
            modal.classList.add('opacity-0');
            const imgEl = modal.querySelector('img');
            if (imgEl) {
                imgEl.classList.remove('scale-100');
                imgEl.classList.add('scale-95');
            }
            setTimeout(() => {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
                document.body.style.overflow = '';
            }, 300);
            return;
        }

        modal = document.getElementById('dynamic-image-modal');
        if (modal) {
            modal.classList.add('opacity-0');
            modal.querySelector('div').classList.remove('scale-100');
            modal.querySelector('div').classList.add('scale-95');
            setTimeout(() => {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
                document.body.style.overflow = '';
            }, 300);
        }
    };
});
