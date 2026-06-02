import { auth, db } from './firebase-setup.js';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, collection, query, where, getDocs, limit, addDoc, serverTimestamp, deleteDoc, increment } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

document.addEventListener('DOMContentLoaded', async () => {
    const mainContainer = document.getElementById('game-details-main');
    let joinBtn = null; 

    // Modal DOM Elements
    const manageModal = document.getElementById('manage-game-modal');
    const closeManageModalBtn = document.getElementById('close-manage-game-modal');
    const manageForm = document.getElementById('manage-game-form');

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
        mainContainer.innerHTML = '<div class="text-center text-red-500 py-20 lg:col-span-12"><p class="text-2xl font-bold">Game Not Found</p><p class="mt-2 text-gray-500">Invalid game ID.</p></div>';
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
                    
                    if (isHost) {
                        let rosterNeedsUpdate = false;
                        
                        const nameIndex = currentGameData.players.indexOf(currentUser.displayName);
                        if (nameIndex > -1) {
                            currentGameData.players.splice(nameIndex, 1);
                            rosterNeedsUpdate = true;
                        }

                        const fallbackNameIndex = currentGameData.players.indexOf(currentGameData.host);
                        if (fallbackNameIndex > -1) {
                            currentGameData.players.splice(fallbackNameIndex, 1);
                            rosterNeedsUpdate = true;
                        }

                        if (!currentGameData.players.includes(currentUser.uid)) {
                            currentGameData.players.unshift(currentUser.uid);
                            rosterNeedsUpdate = true;
                        }

                        if (rosterNeedsUpdate) {
                            try { await updateDoc(docRef, { players: currentGameData.players }); } catch(e) {}
                        }
                        
                        if (!currentGameData.hostId) {
                            currentGameData.hostId = currentUser.uid;
                            try { await updateDoc(docRef, { hostId: currentUser.uid }); } catch(e) {}
                        }
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
                                    message: `Your game "${currentGameData.title}" has ended! Please verify attendance on the roster.`,
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
                mainContainer.innerHTML = '<div class="text-center text-red-500 py-20 lg:col-span-12"><p class="text-2xl font-bold">Game Not Found</p><p class="mt-2 text-gray-500">This game may have been deleted.</p></div>';
            }
        } catch (error) {
            console.error("Error fetching game details:", error);
            mainContainer.innerHTML = `<div class="text-center text-red-500 py-20 lg:col-span-12"><p class="text-2xl font-bold">Error Loading Game</p><p class="mt-2 text-gray-500 break-words">${error.message}</p></div>`;
        }
    }

    async function fetchUsersByUids(uidArray) {
        if (!uidArray || !Array.isArray(uidArray) || uidArray.length === 0) return [];
        const userPromises = uidArray.map(async (uid) => {
            try {
                if (typeof uid === 'string') {
                    if (uid.startsWith('RESERVED')) {
                        return { isReserved: true, rawId: uid };
                    } else {
                        const userSnap = await getDoc(doc(db, "users", uid));
                        if (userSnap.exists()) return { uid, ...userSnap.data() };
                        else return { displayName: uid }; 
                    }
                } else {
                    return { displayName: uid }; 
                }
            } catch (e) {
                return { displayName: "Unknown Player" };
            }
        });
        return Promise.all(userPromises);
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
            const isSquadMatchValid = isSquadMatch && squad1Data && squad2Data;

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

            let mapHtml = '';
            if (game.mapLink) {
                mapHtml = `<a href="${escapeHTML(game.mapLink)}" target="_blank" class="w-full sm:w-auto text-[10px] font-bold tracking-widest uppercase text-[#ff751f] hover:brightness-110 hover:underline transition-colors flex items-center gap-1 border border-[#ff751f]/20 bg-[#ff751f]/10 px-3 py-2 rounded-lg"><span class="material-symbols-outlined text-[14px]">map</span> View Map</a>`;
            }

            const manageGameHtml = (isHost || isAdmin) ? `
                <button onclick="window.openManageGameModal()" class="absolute top-16 right-4 md:top-20 md:right-6 z-20 text-white hover:text-[#ff751f] p-2 transition-colors flex items-center justify-center cursor-pointer group">
                    <span class="material-symbols-outlined text-[32px] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] group-hover:scale-110 transition-transform" title="Manage Game">settings</span>
                </button>
            ` : '';

            const hostProfileExists = !!playerProfiles[game.hostId] || !!playerProfiles[game.host];
            let claimHtml = '';
            if (!hostProfileExists && currentUser && !isHost && !isSquadMatch) {
                claimHtml = `
                    <div class="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 p-5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 shadow-md transition-colors duration-300">
                        <div class="flex-1">
                            <h3 class="font-headline text-blue-600 dark:text-blue-400 font-black italic uppercase tracking-tighter text-lg flex items-center gap-2 mb-1">
                                <span class="material-symbols-outlined text-[20px]">warning</span> Orphaned Game
                            </h3>
                            <p class="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">The organizer profile for this game cannot be found. If you created this game before changing your profile, claim it to restore full admin controls.</p>
                        </div>
                        <button onclick="window.claimOrphanedGame('${game.host}')" class="shrink-0 w-full sm:w-auto bg-blue-500 text-white px-6 py-3 rounded-xl font-black uppercase text-[11px] tracking-widest shadow-md hover:brightness-110 active:scale-95 transition-all">Claim Game</button>
                    </div>
                `;
            }

            let adminOverrideHtml = '';
            if (isAdmin && !isHost) {
                adminOverrideHtml = `
                    <div class="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 p-5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 shadow-md transition-colors duration-300">
                        <div class="flex-1">
                            <h3 class="font-headline text-red-600 dark:text-red-500 font-black italic uppercase tracking-tighter text-lg flex items-center gap-2 mb-1">
                                <span class="material-symbols-outlined text-[20px]">gavel</span> Admin Override
                            </h3>
                            <p class="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">Force cancel and delete this game from the database.</p>
                        </div>
                        <button onclick="window.adminForceCancelGame('${gameId}')" class="shrink-0 w-full sm:w-auto bg-red-500 hover:brightness-110 text-white px-6 py-3 rounded-xl font-black uppercase text-[11px] tracking-widest shadow-md active:scale-95 transition-all">Force Cancel</button>
                    </div>
                `;
            }

            const dynamicJoinBtnHtml = `
                <div class="mt-2 mb-6">
                    <button id="join-game-btn" disabled class="w-full bg-gray-200 dark:bg-white/10 text-gray-500 dark:text-gray-400 px-6 py-4 rounded-xl font-headline font-black uppercase tracking-tighter transition-all shadow-sm active:scale-95 text-sm md:text-base flex items-center justify-center gap-2">
                        <span class="material-symbols-outlined animate-spin">refresh</span> LOADING...
                    </button>
                </div>
            `;

            let myCommendedUserIds = [];
            let myRatedUserIds = [];

            if (currentUser) {
                try {
                    const commQ = query(collection(db, "commendations"), where("gameId", "==", gameId));
                    const rateQ = query(collection(db, "ratings"), where("gameId", "==", gameId));
                    
                    const [commSnap, rateSnap] = await Promise.all([getDocs(commQ), getDocs(rateQ)]);
                    
                    myCommendedUserIds = commSnap.docs
                        .map(d => d.data())
                        .filter(data => data.senderId === currentUser.uid)
                        .map(data => data.targetUserId);
                        
                    myRatedUserIds = rateSnap.docs
                        .map(d => d.data())
                        .filter(data => data.raterId === currentUser.uid)
                        .map(data => data.targetUserId);
                } catch(e) {}
            }

            const validPlayers = players.filter(p => p && typeof p === 'string' && !p.toLowerCase().includes('reserved'));
            
            let currentUserDidAttend = currentUser && Array.isArray(game.attendedPlayers) && (game.attendedPlayers.includes(currentUser.uid) || game.attendedPlayers.includes(currentUser.displayName));
            if (currentUser && (currentUser.uid === game.hostId || currentUser.displayName === game.host) && (game.status === 'completed' || gameStatus === 'Completed')) {
                currentUserDidAttend = true;
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
                        <div class="flex items-center justify-between bg-white dark:bg-white/5 p-3 rounded-xl border border-gray-200 dark:border-white/10 shadow-sm transition-colors duration-300">
                            <div class="flex items-center gap-3 cursor-pointer" onclick="window.location.href='profile.html?id=${appUid}'">
                                <img src="${finalPhotoUrl}" class="w-10 h-10 rounded-lg object-cover border border-gray-200 dark:border-white/20">
                                <span class="font-bold text-sm text-gray-900 dark:text-white hover:text-[#ff751f] transition-colors">${safeAppName}</span>
                            </div>
                            <div class="flex gap-2 shrink-0">
                                <button onclick="window.declineApplicant('${appUid}')" class="px-3 md:px-4 py-2 rounded-lg bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-500 border border-red-200 dark:border-red-500/30 hover:border-red-500 hover:text-white transition-colors text-[9px] md:text-[10px] font-black tracking-widest uppercase">Decline</button>
                                <button onclick="window.acceptApplicant('${appUid}')" class="px-3 md:px-4 py-2 rounded-lg bg-[#ff751f]/10 text-[#ff751f] border border-[#ff751f]/30 hover:bg-[#ff751f] hover:text-[#0a0e14] transition-colors text-[9px] md:text-[10px] font-black tracking-widest uppercase">Accept</button>
                            </div>
                        </div>
                        `;
                    }).join('');
                } else {
                    appList = `<p class="text-xs text-gray-500 dark:text-gray-400 italic text-center py-6">No pending join requests at this time.</p>`;
                }

                waitlistHtml = `
                    <div class="bg-gray-50 dark:bg-[#14171d] p-5 md:p-6 rounded-2xl border border-gray-200 dark:border-[#ff751f]/30 shadow-md mb-6 transition-colors duration-300">
                        <div class="flex justify-between items-center mb-4 border-b border-gray-200 dark:border-white/10 pb-3">
                            <h3 class="font-headline text-lg font-black uppercase tracking-widest text-gray-900 dark:text-white flex items-center gap-2">
                                <span class="material-symbols-outlined text-[#ff751f]">how_to_reg</span> Pending Joins
                            </h3>
                            <span class="bg-[#ff751f]/20 text-[#ff751f] text-[10px] font-black px-2 py-1 rounded tracking-widest">${applicants.length} PENDING</span>
                        </div>
                        <div class="space-y-3">
                            ${appList}
                        </div>
                    </div>
                `;
            }

            let rosterSectionHtml = '';

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
                    
                    const labelColorClass = labelColor === 'primary' ? 'text-[#ff751f]' : 'text-red-500';

                    let html = `
                        <div class="bg-white dark:bg-[#14171d] rounded-2xl p-4 md:p-5 border border-gray-200 dark:border-white/10 shadow-sm flex flex-col h-full transition-colors duration-300">
                            <div class="flex items-start gap-4 mb-4 border-b border-gray-200 dark:border-white/10 pb-4">
                                <div class="w-14 h-14 rounded-xl bg-gray-50 dark:bg-white/5 flex items-center justify-center overflow-hidden shrink-0 border border-gray-200 dark:border-white/20 shadow-inner">
                                    <img src="${squadLogoImg}" onerror="this.onerror=null; this.src='${getFallbackAvatar(squad.name)}';" class="w-full h-full object-cover">
                                </div>
                                <div class="min-w-0 flex-1">
                                    <p class="text-[9px] font-bold ${labelColorClass} uppercase tracking-widest flex items-center gap-1 mb-0.5"><span class="material-symbols-outlined text-[12px]">${label === 'Challenged' ? 'shield' : 'swords'}</span> ${label}</p>
                                    <p class="font-headline font-black italic uppercase text-lg text-gray-900 dark:text-white leading-tight break-words"><span class="text-gray-500 dark:text-gray-400">[${escapeHTML(squad.abbreviation)}]</span> ${escapeHTML(squad.name)}</p>
                                    <p class="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mt-1.5 flex items-center gap-1"><span class="material-symbols-outlined text-[13px]">location_on</span> ${escapeHTML(squad.homeCity || 'Location TBD')}</p>
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
                        
                        const pUid = u.uid || (isCaptain ? squad.captainId : null);
                        
                        const isParticipantInSquadMatch = currentUser && ((squad1Data.members || []).includes(currentUser.uid) || (squad2Data.members || []).includes(currentUser.uid));

                        let actionButtons = '';
                        if (gameStatus === 'Completed' && currentUser && pUid && pUid !== currentUser.uid && isParticipantInSquadMatch) {
                            const hasCommended = myCommendedUserIds.includes(pUid);
                            const hasRated = myRatedUserIds.includes(pUid);

                            const commendBtn = hasCommended 
                                ? `<button disabled class="flex-1 py-1.5 bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-white/10 rounded-md text-[9px] font-black uppercase tracking-widest opacity-50"><span class="material-symbols-outlined text-[10px]">thumb_up</span> Props</button>`
                                : `<button onclick="event.stopPropagation(); window.quickCommend('${pUid}')" class="flex-1 py-1.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 hover:bg-emerald-500/20 border border-emerald-200 dark:border-emerald-500/20 rounded-md text-[9px] font-black uppercase tracking-widest transition-colors"><span class="material-symbols-outlined text-[10px]">thumb_up</span> Props</button>`;
                                
                            const rateBtn = hasRated
                                ? `<button disabled class="flex-1 py-1.5 bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-white/10 rounded-md text-[9px] font-black uppercase tracking-widest opacity-50"><span class="material-symbols-outlined text-[10px]">star</span> Rated</button>`
                                : `<button onclick="event.stopPropagation(); window.quickRate('${pUid}', '${safeName}')" class="flex-1 py-1.5 bg-[#ff751f]/10 text-[#ff751f] hover:bg-[#ff751f]/20 border border-[#ff751f]/20 rounded-md text-[9px] font-black uppercase tracking-widest transition-colors"><span class="material-symbols-outlined text-[10px]">star</span> Rate</button>`;

                            actionButtons = `
                                <div class="flex gap-1 w-full mt-2">
                                    ${commendBtn}
                                    ${rateBtn}
                                </div>
                            `;
                        }

                        html += `
                            <div class="flex flex-col gap-1 p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 transition-colors cursor-pointer group border border-transparent hover:border-gray-200 dark:hover:border-white/10" onclick="window.location.href='profile.html?id=${pUid}'">
                                <div class="flex items-center gap-3">
                                    <img src="${photoUrl}" onerror="this.onerror=null; this.src='${getFallbackAvatar(safeName)}';" class="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-white/20 bg-gray-100 dark:bg-white/5 shrink-0">
                                    <div class="min-w-0 flex-1">
                                        <p class="font-bold text-sm text-gray-900 dark:text-white break-words group-hover:text-[#ff751f] transition-colors leading-tight">${safeName}</p>
                                        <div class="flex items-center gap-2 mt-1">
                                            ${isCaptain ? `<span class="bg-[#ff751f]/20 text-[#ff751f] px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest">CAPTAIN</span>` : ''}
                                            <span class="text-[9px] text-gray-500 dark:text-gray-400 font-medium truncate">${fullPos}</span>
                                        </div>
                                    </div>
                                </div>
                                ${actionButtons}
                            </div>
                        `;
                    });

                    const emptySlotsCount = Math.max(0, 5 - teamPlayers.length);
                    for (let i = 0; i < emptySlotsCount; i++) {
                        const hostStyles = canManage ? 'cursor-pointer hover:border-[#ff751f]/50 hover:bg-[#ff751f]/5 transition-all group' : 'opacity-50';
                        const hostOnClick = canManage ? `onclick="window.openSquadInviteModal('${squad.id}')"` : '';
                        const iconColor = canManage ? 'group-hover:text-[#ff751f] text-gray-400 dark:text-gray-500' : 'text-gray-400 dark:text-gray-500';

                        html += `
                            <div class="flex items-center gap-3 p-2.5 rounded-xl border border-gray-200 dark:border-white/10 border-dashed ${hostStyles}" ${hostOnClick}>
                                <div class="w-10 h-10 rounded-full border border-gray-200 dark:border-white/20 border-dashed flex items-center justify-center bg-gray-50 dark:bg-white/5 shrink-0 ${canManage ? 'group-hover:border-[#ff751f]/50 group-hover:bg-[#ff751f]/10 transition-colors' : ''}">
                                    <span class="material-symbols-outlined text-[18px] ${iconColor}">person_add</span>
                                </div>
                                <div class="min-w-0 flex-1">
                                    <p class="font-bold text-sm text-gray-500 dark:text-gray-400 truncate ${canManage ? 'group-hover:text-[#ff751f] transition-colors' : ''}">Open Slot</p>
                                    <div class="flex items-center gap-2 mt-0.5">
                                        <span class="text-[9px] text-gray-400 dark:text-gray-500 font-black uppercase tracking-widest truncate">Available</span>
                                    </div>
                                </div>
                                ${canManage ? '<span class="text-[8px] text-[#ff751f] font-bold opacity-0 group-hover:opacity-100 transition-opacity pr-2 tracking-widest">INVITE</span>' : ''}
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

                let squadScoreHtml = '';
                if (gameStatus === 'Completed') {
                    const hasResult = game.matchResult;
                    if (!hasResult && isHost) {
                        squadScoreHtml = `
                            <div class="bg-blue-50 dark:bg-blue-500/10 p-5 rounded-2xl border border-blue-200 dark:border-blue-500/30 mb-6 shadow-sm transition-colors duration-300">
                                <h3 class="font-headline text-lg font-black uppercase tracking-tighter text-blue-600 dark:text-blue-400 mb-3 flex items-center gap-2"><span class="material-symbols-outlined">emoji_events</span> Record Final Score</h3>
                                <div class="flex items-center justify-between gap-4 mb-4">
                                    <div class="flex-1 flex flex-col items-center">
                                        <span class="font-headline font-black uppercase text-xs mb-1 text-center truncate w-full text-gray-900 dark:text-white">${escapeHTML(squad1Data.name)}</span>
                                        <input type="number" id="squad1-score-input" min="0" class="w-16 text-center font-black text-xl bg-white dark:bg-[#0a0e14] border border-gray-300 dark:border-white/20 rounded-xl p-2 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500 transition-all shadow-inner" placeholder="0">
                                    </div>
                                    <span class="font-black text-gray-400 dark:text-gray-500">VS</span>
                                    <div class="flex-1 flex flex-col items-center">
                                        <span class="font-headline font-black uppercase text-xs mb-1 text-center truncate w-full text-gray-900 dark:text-white">${escapeHTML(squad2Data.name)}</span>
                                        <input type="number" id="squad2-score-input" min="0" class="w-16 text-center font-black text-xl bg-white dark:bg-[#0a0e14] border border-gray-300 dark:border-white/20 rounded-xl p-2 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500 transition-all shadow-inner" placeholder="0">
                                    </div>
                                </div>
                                <button onclick="window.submitSquadScore('${squad1Data.id}', '${squad2Data.id}')" class="w-full bg-blue-500 hover:brightness-110 text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-md active:scale-95">Submit Official Score</button>
                            </div>
                        `;
                    } else if (hasResult) {
                        const winnerId = hasResult.winnerSquadId;
                        const winner = winnerId === squad1Data.id ? squad1Data : squad2Data;
                        const s1Score = hasResult.scores ? hasResult.scores[squad1Data.id] : '-';
                        const s2Score = hasResult.scores ? hasResult.scores[squad2Data.id] : '-';

                        squadScoreHtml = `
                            <div class="bg-gray-50 dark:bg-white/5 p-5 rounded-2xl border border-gray-200 dark:border-[#ff751f]/40 shadow-sm mb-6 flex flex-col items-center justify-center text-center transition-colors duration-300">
                                <span class="material-symbols-outlined text-3xl text-[#ff751f] mb-1 drop-shadow-md">trophy</span>
                                <h3 class="font-headline text-xl font-black italic uppercase tracking-tighter text-gray-900 dark:text-white mb-2">${escapeHTML(winner.name)} WINS</h3>
                                <div class="flex items-center gap-4 bg-white dark:bg-[#0a0e14] px-4 py-2 rounded-xl border border-gray-200 dark:border-white/10 shadow-sm">
                                    <div class="text-center">
                                        <p class="text-[8px] uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-0.5">${escapeHTML(squad1Data.abbreviation)}</p>
                                        <p class="font-black text-lg ${winnerId === squad1Data.id ? 'text-[#ff751f]' : 'text-gray-900 dark:text-white'}">${s1Score}</p>
                                    </div>
                                    <span class="text-gray-300 dark:text-gray-600 font-bold">-</span>
                                    <div class="text-center">
                                        <p class="text-[8px] uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-0.5">${escapeHTML(squad2Data.abbreviation)}</p>
                                        <p class="font-black text-lg ${winnerId === squad2Data.id ? 'text-[#ff751f]' : 'text-gray-900 dark:text-white'}">${s2Score}</p>
                                    </div>
                                </div>
                            </div>
                        `;
                    }
                }

                rosterSectionHtml = `
                    <div class="bg-white dark:bg-[#0f141a] border border-gray-200 dark:border-white/5 rounded-3xl p-5 md:p-6 flex flex-col shadow-sm transition-colors duration-300">
                        <div class="flex justify-between items-end mb-6 border-b border-gray-200 dark:border-white/10 pb-4">
                            <h2 class="font-headline text-2xl font-black italic uppercase tracking-tighter text-gray-900 dark:text-white">SQUAD MATCHUP</h2>
                            <span class="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest bg-gray-100 dark:bg-white/5 px-3 py-1 rounded-full border border-gray-200 dark:border-white/5">5V5 THROWDOWN</span>
                        </div>
                        ${squadScoreHtml}
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                            ${sq1Html}
                            ${sq2Html}
                        </div>
                    </div>
                `;
            } else {
                const rosterPlayers = await fetchUsersByUids(players);
                let rosterGridHtml = '';
                
                let hostVerifyBanner = '';
                let hostSubmitBtn = '';

                const validPlayersCount = players.filter(p => p && typeof p === 'string' && !p.toLowerCase().includes('reserved')).length;
                const isAttendanceFullyReported = Array.isArray(game.attendanceReported) && game.attendanceReported.length >= validPlayersCount;

                if (gameStatus === 'Completed' && isHost && !isAttendanceFullyReported) {
                    hostVerifyBanner = `
                        <div class="col-span-full bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 p-3 rounded-xl mb-4 text-center shadow-sm transition-colors duration-300">
                            <p class="text-red-600 dark:text-red-500 font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-1"><span class="material-symbols-outlined text-[14px]">fact_check</span> Verify Roster Attendance</p>
                        </div>
                    `;
                    hostSubmitBtn = `
                        <div class="col-span-full mt-4">
                            <button onclick="window.reportAttendance()" class="w-full bg-red-500 hover:brightness-110 text-white px-6 py-3 rounded-xl font-black uppercase text-[11px] tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2">
                                <span class="material-symbols-outlined text-[16px]">checklist</span> Finalize Attendance Report
                            </button>
                        </div>
                    `;
                }

                for (let i = 0; i < spotsTotal; i++) {
                    const player = rosterPlayers[i];
                    if (player) {
                        if (player.isReserved) {
                            const resKey = player.rawId.split('_')[1];
                            const resName = game.reservations?.[resKey] || "Reserved Slot";
                            let removeBtn = '';
                            if (isHost && gameStatus === 'Upcoming') {
                                removeBtn = `<button onclick="window.removeReservation('${resKey}', '${player.rawId}')" class="absolute top-2 right-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 p-1.5 rounded-full transition-colors z-20" title="Remove Reservation"><span class="material-symbols-outlined text-[14px]">close</span></button>`;
                            }
                            rosterGridHtml += `
                                <div class="bg-gray-50 dark:bg-[#14171d] rounded-2xl p-4 flex flex-col items-center justify-center border border-gray-200 dark:border-white/10 text-center gap-2 shadow-sm relative opacity-70 border-dashed transition-colors duration-300">
                                    ${removeBtn}
                                    <div class="w-14 h-14 md:w-16 md:h-16 rounded-xl bg-gray-200 dark:bg-white/5 flex items-center justify-center border border-gray-300 dark:border-white/10 overflow-hidden transition-all">
                                        <span class="material-symbols-outlined text-gray-400 dark:text-gray-500">lock</span>
                                    </div>
                                    <div class="w-full">
                                        <p class="font-bold text-[13px] md:text-sm text-gray-900 dark:text-white uppercase truncate w-full" title="${escapeHTML(resName)}">${escapeHTML(resName)}</p>
                                        <p class="text-[8px] md:text-[9px] text-gray-400 dark:text-gray-500 uppercase font-black tracking-widest mt-0.5 truncate">Reserved</p>
                                    </div>
                                </div>
                            `;
                        } else {
                            let pUid = player.uid; 
                            const safeName = escapeHTML(player.displayName);
                            const photoUrl = escapeHTML(player.photoURL || '') || getFallbackAvatar(safeName);
                            const isGameHost = safeName === safeHost || pUid === game.hostId;
                            
                            if (isGameHost && !pUid) pUid = game.hostId;

                            let isAssessed = Array.isArray(game.attendanceReported) && (game.attendanceReported.includes(pUid) || game.attendanceReported.includes(safeName));
                            let pDidAttend = Array.isArray(game.attendedPlayers) && (game.attendedPlayers.includes(pUid) || game.attendedPlayers.includes(safeName));
                            
                            if (isGameHost && (game.status === 'completed' || gameStatus === 'Completed')) {
                                isAssessed = true;
                                pDidAttend = true;
                            }

                            const clickableStyle = pUid ? 'cursor-pointer hover:border-[#ff751f]/50 transition-colors group relative' : 'relative';
                            const onClick = pUid ? `onclick="window.location.href='profile.html?id=${pUid}'"` : '';

                            const kickBtnHtml = (isHost && !isGameHost && gameStatus === 'Upcoming') ? `
                                <button onclick="event.stopPropagation(); window.kickGamePlayer('${pUid || safeName}')" class="absolute top-2 right-2 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-500 hover:bg-red-500 hover:text-white p-1 rounded-full transition-colors z-20 shadow-sm border border-red-200 dark:border-red-500/20" title="Remove Player">
                                    <span class="material-symbols-outlined text-[14px]">person_remove</span>
                                </button>
                            ` : '';

                            let actionButtonsHtml = '';
                            if (gameStatus === 'Completed' && pUid) {
                                if (isHost && !isGameHost) {
                                    if (isAssessed) {
                                        const statusText = pDidAttend ? "Attended" : "No-Show";
                                        const statusColor = pDidAttend ? "text-[#ff751f] bg-[#ff751f]/10 border-[#ff751f]/20 border" : "text-red-600 dark:text-red-500 bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 border";
                                        actionButtonsHtml += `<div class="mt-2 w-full"><span class="${statusColor} text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded w-full block text-center">${statusText}</span></div>`;
                                    } else {
                                        actionButtonsHtml += `
                                            <div class="flex gap-1 w-full mt-2 z-20 relative">
                                                <button onclick="event.stopPropagation(); window.markPlayerAttendance('${pUid}', false)" class="flex-1 py-1.5 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-500 hover:bg-red-100 dark:hover:bg-red-500/20 border border-red-200 dark:border-red-500/20 rounded-md text-[9px] font-black uppercase tracking-widest transition-colors">No Show</button>
                                                <button onclick="event.stopPropagation(); window.markPlayerAttendance('${pUid}', true)" class="flex-1 py-1.5 bg-[#ff751f]/10 text-[#ff751f] hover:bg-[#ff751f]/20 border border-[#ff751f]/20 rounded-md text-[9px] font-black uppercase tracking-widest transition-colors">Attended</button>
                                            </div>
                                        `;
                                    }
                                }

                                const amIHost = currentUser && currentUser.uid === game.hostId;
                                if ((currentUserDidAttend || amIHost) && pUid !== currentUser?.uid && pUid !== currentUser?.displayName && pDidAttend && isAssessed) {
                                    const hasCommended = myCommendedUserIds.includes(pUid);
                                    const hasRated = myRatedUserIds.includes(pUid);
                                    
                                    const commendBtn = hasCommended 
                                        ? `<button disabled class="flex-1 py-1.5 bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-white/10 rounded-md text-[9px] font-black uppercase tracking-widest opacity-50"><span class="material-symbols-outlined text-[10px] align-text-bottom">thumb_up</span> Props</button>`
                                        : `<button onclick="event.stopPropagation(); window.quickCommend('${pUid}')" class="flex-1 py-1.5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 border border-blue-200 dark:border-blue-500/20 rounded-md text-[9px] font-black uppercase tracking-widest transition-colors shadow-sm"><span class="material-symbols-outlined text-[10px] align-text-bottom">thumb_up</span> Props</button>`;
                                        
                                    const rateBtn = hasRated
                                        ? `<button disabled class="flex-1 py-1.5 bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-white/10 rounded-md text-[9px] font-black uppercase tracking-widest opacity-50"><span class="material-symbols-outlined text-[10px] align-text-bottom">star</span> Rated</button>`
                                        : `<button onclick="event.stopPropagation(); window.quickRate('${pUid}', '${safeName}')" class="flex-1 py-1.5 bg-[#ff751f]/10 text-[#ff751f] hover:bg-[#ff751f]/20 border border-[#ff751f]/20 rounded-md text-[9px] font-black uppercase tracking-widest transition-colors shadow-sm"><span class="material-symbols-outlined text-[10px] align-text-bottom">star</span> Rate</button>`;
                                    
                                    actionButtonsHtml += `
                                        <div class="flex gap-1 w-full mt-2 z-20 relative">
                                            ${commendBtn}
                                            ${rateBtn}
                                        </div>
                                    `;
                                } else if (isAssessed && !pDidAttend && !isHost) {
                                    actionButtonsHtml += `<div class="mt-2 w-full"><span class="text-red-600 dark:text-red-500 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded w-full block text-center">No-Show</span></div>`;
                                }
                            }

                            rosterGridHtml += `
                                <div class="bg-white dark:bg-[#14171d] rounded-2xl p-3 md:p-4 flex flex-col items-center justify-center border border-gray-200 dark:border-white/10 text-center gap-1 shadow-sm ${clickableStyle}" ${onClick}>
                                    ${kickBtnHtml}
                                    <div class="w-12 h-12 md:w-16 md:h-16 rounded-xl flex items-center justify-center border border-gray-200 dark:border-white/20 overflow-hidden ${pUid ? 'group-hover:border-[#ff751f]/50 group-hover:scale-105' : ''} bg-gray-50 dark:bg-white/5 transition-all mb-1 shadow-inner">
                                        <img src="${photoUrl}" onerror="this.onerror=null; this.src='${getFallbackAvatar(safeName)}';" class="w-full h-full object-cover">
                                    </div>
                                    <div class="w-full">
                                        <p class="font-bold text-xs md:text-[13px] text-gray-900 dark:text-white break-words leading-tight w-full ${pUid ? 'group-hover:text-[#ff751f] transition-colors' : ''}">${safeName}</p>
                                        <p class="text-[8px] md:text-[9px] ${isGameHost ? 'text-[#ff751f]' : 'text-gray-500 dark:text-gray-400'} uppercase font-black tracking-widest mt-0.5 truncate">${isGameHost ? 'CAPTAIN' : 'PLAYER'}</p>
                                    </div>
                                    ${actionButtonsHtml}
                                </div>
                            `;
                        }
                    } else {
                        const canManageOpen = isHost && gameStatus === 'Upcoming';
                        const hostStyles = canManageOpen ? 'cursor-pointer hover:border-[#ff751f]/50 hover:bg-[#ff751f]/5 transition-all group relative' : 'relative';
                        const hostOnClick = canManageOpen ? `onclick="window.openManageSlotModal('open')"` : '';
                        const borderCurrent = canManageOpen ? 'border-current group-hover:scale-110 transition-transform' : 'border-gray-300 dark:border-white/10';
                        const iconColor = canManageOpen ? '' : 'text-gray-400 dark:text-gray-500';

                        rosterGridHtml += `
                            <div class="bg-gray-50/50 dark:bg-[#14171d]/40 rounded-2xl p-4 flex flex-col items-center justify-center border border-gray-300 dark:border-white/10 border-dashed text-center gap-2 opacity-60 ${hostStyles}" ${hostOnClick}>
                                <div class="w-14 h-14 md:w-16 md:h-16 rounded-xl border border-gray-300 dark:border-white/20 border-dashed flex items-center justify-center text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-[#0a0e14]/50 ${borderCurrent} transition-all">
                                    <span class="material-symbols-outlined text-[20px] ${iconColor}">person_add</span>
                                </div>
                                <div class="w-full">
                                    <p class="font-bold text-[13px] md:text-sm text-gray-500 dark:text-gray-400 uppercase truncate w-full">Open Slot</p>
                                    <div class="flex items-center gap-2 mt-0.5 justify-center">
                                        <span class="text-[9px] text-gray-400 dark:text-gray-500 font-black uppercase tracking-widest truncate">Available</span>
                                    </div>
                                </div>
                                ${canManageOpen ? '<span class="text-[8px] text-[#ff751f] font-bold mt-1 opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-2 tracking-widest">MANAGE</span>' : ''}
                            </div>
                        `;
                    }
                }

                rosterSectionHtml = `
                    <div class="bg-gray-50 dark:bg-[#0f141a] border border-gray-200 dark:border-white/5 rounded-3xl p-5 md:p-6 flex flex-col shadow-sm transition-colors duration-300">
                        <div class="flex justify-between items-end mb-4 border-b border-gray-200 dark:border-white/10 pb-4">
                            <h2 class="font-headline text-2xl font-black italic uppercase tracking-tighter text-gray-900 dark:text-white">THE ROSTER</h2>
                            <span class="text-[10px] text-gray-600 dark:text-gray-300 font-bold uppercase tracking-widest bg-white dark:bg-white/5 px-3 py-1 rounded-full border border-gray-200 dark:border-white/5 shadow-sm">${spotsFilled} / ${spotsTotal} PLAYERS</span>
                        </div>
                        ${hostVerifyBanner}
                        <div class="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 flex-1 content-start" id="roster-container">
                            ${rosterGridHtml}
                        </div>
                        ${hostSubmitBtn}
                    </div>
                `;
            }

            let mainContentLayoutHtml = '';
            if (isSquadMatchValid) {
                mainContentLayoutHtml = `
                    <div class="space-y-4 md:space-y-6">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-4 md:mb-6">
                            <div class="w-full h-48 bg-white dark:bg-[#14171d] rounded-2xl border border-gray-200 dark:border-white/10 relative overflow-hidden shadow-sm p-1">
                                <iframe class="w-full h-full rounded-xl pointer-events-none md:pointer-events-auto" style="border:0; filter: invert(90%) hue-rotate(180deg) brightness(85%) contrast(85%);" loading="lazy" allowfullscreen referrerpolicy="no-referrer-when-downgrade" src="${finalMapEmbedUrl}"></iframe>
                            </div>
                            <div class="bg-white dark:bg-[#14171d] p-5 md:p-6 rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm flex flex-col justify-center">
                                <h3 class="font-headline text-sm font-black uppercase tracking-widest text-gray-900 dark:text-white mb-3">Court Details</h3>
                                <p class="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">${safeDesc}</p>
                            </div>
                        </div>
                        ${dynamicJoinBtnHtml}
                        ${claimHtml}
                        ${adminOverrideHtml}
                        ${rosterSectionHtml}
                    </div>
                `;
            } else {
                mainContentLayoutHtml = `
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                        <div class="space-y-4 md:space-y-6 flex flex-col">
                            <div class="w-full h-48 md:h-56 bg-white dark:bg-[#14171d] rounded-2xl border border-gray-200 dark:border-white/10 relative overflow-hidden shadow-sm p-1">
                                <iframe class="w-full h-full rounded-xl pointer-events-none md:pointer-events-auto" style="border:0; filter: invert(90%) hue-rotate(180deg) brightness(85%) contrast(85%);" loading="lazy" allowfullscreen referrerpolicy="no-referrer-when-downgrade" src="${finalMapEmbedUrl}"></iframe>
                            </div>
                            <div class="bg-white dark:bg-[#14171d] p-5 md:p-6 rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm flex-1">
                                <h3 class="font-headline text-sm font-black uppercase tracking-widest text-gray-900 dark:text-white mb-3">Court Details</h3>
                                <p class="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">${safeDesc}</p>
                            </div>
                        </div>
                        <div class="space-y-6">
                            ${dynamicJoinBtnHtml}
                            ${claimHtml}
                            ${adminOverrideHtml}
                            ${waitlistHtml}
                            ${rosterSectionHtml}
                        </div>
                    </div>
                `;
            }

            mainContainer.classList.remove('animate-pulse');

            mainContainer.innerHTML = `
                <div class="lg:col-span-12 space-y-4 md:space-y-6">
                    <div class="relative w-full h-[400px] md:h-[500px] bg-gray-200 dark:bg-white/5 rounded-3xl overflow-hidden border border-gray-200 dark:border-white/10 shadow-lg group">
                        <img src="${displayImage}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 cursor-pointer" onclick="${game.imageUrl ? `window.openImageModal('${displayImage}')` : ''}">
                        <div class="absolute inset-0 bg-gradient-to-t from-gray-900/90 dark:from-[#0a0e14] via-gray-900/20 dark:via-[#0a0e14]/60 to-transparent pointer-events-none"></div>
                        
                        <button onclick="window.history.back()" class="absolute top-4 left-4 md:top-6 md:left-6 z-20 text-white hover:text-[#ff751f] p-2 transition-colors flex items-center justify-center cursor-pointer group bg-black/20 hover:bg-black/40 rounded-full backdrop-blur-sm">
                            <span class="material-symbols-outlined text-[24px] md:text-[32px] group-hover:-translate-x-1 transition-transform">arrow_back</span>
                        </button>
                        
                        <button onclick="window.shareGameNative()" class="absolute top-4 right-4 md:top-6 md:right-6 z-20 text-white hover:text-[#ff751f] p-2 transition-colors flex items-center justify-center cursor-pointer group bg-black/20 hover:bg-black/40 rounded-full backdrop-blur-sm">
                            <span class="material-symbols-outlined text-[24px] md:text-[32px] group-hover:scale-110 transition-transform">share</span>
                        </button>

                        ${manageGameHtml}

                        <div class="absolute bottom-6 left-6 md:bottom-10 md:left-10 z-10 pointer-events-none pr-6">
                            <div class="flex flex-wrap items-center gap-2 mb-3 md:mb-4">
                                <div class="inline-flex items-center gap-2 px-3 py-1.5 bg-[#ff751f]/20 border border-[#ff751f]/30 rounded-full shadow-sm backdrop-blur-sm">
                                    <span class="w-2 h-2 rounded-full bg-[#ff751f] ${gameStatus !== 'Completed' ? 'animate-pulse' : ''}"></span>
                                    <span class="text-[10px] font-black uppercase tracking-widest text-[#ff751f]">${safeCategory}</span>
                                </div>
                                <div class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/20 dark:bg-white/10 border border-white/30 rounded-full shadow-sm backdrop-blur-sm text-white">
                                    <span class="material-symbols-outlined text-[14px]">groups</span>
                                    <span class="text-[10px] font-black uppercase tracking-widest">${safeType}</span>
                                </div>
                                ${gameStatus === 'Completed' ? `<div class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-500/30 border border-gray-400/30 rounded-full shadow-sm backdrop-blur-sm text-gray-300"><span class="material-symbols-outlined text-[14px]">check_circle</span><span class="text-[10px] font-black uppercase tracking-widest">ENDED</span></div>` : ''}
                            </div>

                            <h1 class="font-headline text-4xl md:text-6xl font-black italic uppercase tracking-tighter text-white leading-[0.9] mb-3 drop-shadow-lg break-words">${safeTitle}</h1>
                            <div class="text-gray-300 text-xs md:text-sm font-medium tracking-wide flex items-center gap-2">
                                <span class="uppercase tracking-widest text-[10px] font-bold text-gray-400">ORGANIZER:</span>
                                <span class="text-[#ff751f] font-black text-sm md:text-base">${safeHost}</span>
                            </div>
                        </div>
                    </div>

                    <div class="flex flex-col md:flex-row gap-4 mt-6">
                        <div class="bg-white dark:bg-[#14171d] flex-1 rounded-2xl p-5 border border-gray-200 dark:border-white/10 flex items-center gap-4 shadow-sm hover:border-[#ff751f]/30 transition-colors">
                            <div class="w-12 h-12 rounded-xl bg-gray-100 dark:bg-white/5 flex flex-col items-center justify-center border border-gray-200 dark:border-white/10 shadow-inner">
                                <span class="text-[9px] text-[#ff751f] font-black uppercase tracking-widest leading-none mb-0.5">${new Date(gameStart).toLocaleString('default', { month: 'short' })}</span>
                                <span class="text-lg font-headline font-black text-gray-900 dark:text-white leading-none">${new Date(gameStart).getDate()}</span>
                            </div>
                            <div>
                                <p class="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold tracking-widest mb-1">Schedule</p>
                                <p class="font-bold text-sm text-gray-900 dark:text-white">${safeDate}</p>
                                <p class="text-xs text-gray-600 dark:text-gray-400 font-medium mt-0.5">${safeTime}</p>
                            </div>
                        </div>
                        
                        <div class="bg-white dark:bg-[#14171d] flex-1 rounded-2xl p-5 border border-gray-200 dark:border-white/10 flex items-center gap-4 shadow-sm hover:border-blue-500/30 transition-colors">
                            <div class="w-12 h-12 rounded-xl bg-gray-100 dark:bg-white/5 flex items-center justify-center border border-gray-200 dark:border-white/10 shadow-inner">
                                <span class="material-symbols-outlined text-blue-500 text-2xl">trending_up</span>
                            </div>
                            <div>
                                <p class="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold tracking-widest mb-1">Skill Level</p>
                                <p class="font-black text-sm text-gray-900 dark:text-white uppercase tracking-wider">${safeSkill}</p>
                            </div>
                        </div>
                    </div>

                    <div class="flex flex-col sm:flex-row items-center gap-4 mt-6 mb-6 justify-start bg-white dark:bg-white/5 p-4 rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm">
                        ${mapHtml}
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
                    <div class="text-center py-20 lg:col-span-12 bg-white dark:bg-[#14171d] rounded-3xl border border-red-500/30 mt-10 shadow-lg">
                        <span class="material-symbols-outlined text-6xl text-red-500 mb-4">error</span>
                        <h2 class="text-2xl font-black uppercase tracking-widest text-gray-900 dark:text-white">Data Sync Failed</h2>
                        <p class="mt-2 text-gray-600 dark:text-gray-400">There was an issue processing this game's data. Please check your connection or try again later.</p>
                    </div>
                `;
            }
        }
    }

    function updateJoinButtonState() {
        joinBtn = document.getElementById('join-game-btn');
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

            joinBtn.className = "w-full bg-gray-200 dark:bg-white/10 text-gray-500 dark:text-gray-400 px-6 py-4 rounded-xl font-headline font-black uppercase tracking-tighter transition-all shadow-md active:scale-95 text-sm md:text-base flex items-center justify-center gap-2";

            if (gameStatus === 'Completed') {
                joinBtn.innerHTML = `MATCH CONCLUDED <span class="material-symbols-outlined text-[18px]">verified</span>`;
                joinBtn.disabled = true;
                joinBtn.classList.add('border', 'border-gray-300', 'dark:border-white/20', 'opacity-50', 'cursor-not-allowed');
            } else if (gameStatus === 'Ongoing') {
                joinBtn.innerHTML = `MATCH IN PROGRESS <span class="material-symbols-outlined text-[18px] animate-pulse">sports_basketball</span>`;
                joinBtn.disabled = true;
                joinBtn.classList.add('bg-red-50', 'dark:bg-red-500/10', 'text-red-600', 'dark:text-red-500', 'border', 'border-red-200', 'dark:border-red-500/30', 'cursor-not-allowed');
            } else if (!currentUser) {
                joinBtn.innerHTML = `LOG IN TO VIEW <span class="material-symbols-outlined text-[18px]">login</span>`;
                joinBtn.disabled = false;
                joinBtn.addEventListener('click', () => window.location.href = 'index.html');
                joinBtn.classList.add('border', 'border-gray-300', 'dark:border-white/20', 'text-gray-900', 'dark:text-white', 'hover:bg-gray-300', 'dark:hover:bg-white/20', 'active:scale-95');
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
                joinBtn.classList.add('bg-red-50', 'dark:bg-red-500/10', 'text-red-600', 'dark:text-red-500', 'border', 'border-red-200', 'dark:border-red-500/30', 'hover:bg-red-100', 'dark:hover:bg-red-500/20', 'active:scale-95');
            } else if (isSquadMember) {
                joinBtn.innerHTML = `CHECKING INVITES <span class="material-symbols-outlined animate-spin text-[18px]">refresh</span>`;
                joinBtn.disabled = true;
                joinBtn.classList.add('border', 'border-gray-300', 'dark:border-white/20');

                (async () => {
                    try {
                        const inviteQ = query(collection(db, "notifications"), where("recipientId", "==", currentUser.uid), where("targetId", "==", gameId), where("type", "==", "game_invite"));
                        const inviteSnap = await getDocs(inviteQ);
                        if (!inviteSnap.empty) {
                            joinBtn.innerHTML = `ACCEPT INVITE <span class="material-symbols-outlined text-[18px]">check_circle</span>`;
                            joinBtn.disabled = false;
                            joinBtn.classList.remove('bg-gray-200', 'dark:bg-white/10', 'text-gray-500', 'dark:text-gray-400', 'border-gray-300', 'dark:border-white/20');
                            joinBtn.classList.add('bg-[#ff751f]', 'text-[#0a0e14]', 'hover:brightness-110', 'active:scale-95');
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
                joinBtn.addEventListener('click', window.shareGameNative);
                joinBtn.classList.add('border', 'border-gray-300', 'dark:border-white/20', 'text-gray-900', 'dark:text-white', 'hover:bg-gray-300', 'dark:hover:bg-white/20', 'active:scale-95');
            }
            return; 
        }

        const spotsTotal = parseInt(currentGameData.spotsTotal) || 10;
        const players = Array.isArray(currentGameData.players) ? currentGameData.players : [];
        const applicants = Array.isArray(currentGameData.applicants) ? currentGameData.applicants : [];
        const spotsFilled = players.length;

        const isHost = currentUser && (uid === currentGameData.hostId || profileName === currentGameData.host);
        const isJoined = isHost || players.includes(uid) || players.includes(profileName);
        
        const isApplicant = currentUser && applicants.includes(currentUser.uid);
        const isFull = spotsFilled >= spotsTotal;
        const needsApproval = currentGameData.joinPolicy === 'approval';

        joinBtn.className = "w-full bg-gray-200 dark:bg-white/10 text-gray-500 dark:text-gray-400 px-6 py-4 rounded-xl font-headline font-black uppercase tracking-tighter transition-all shadow-md active:scale-95 text-sm md:text-base flex items-center justify-center gap-2";

        if (gameStatus === 'Completed') {
            joinBtn.innerHTML = `GAME CONCLUDED <span class="material-symbols-outlined text-[18px]">verified</span>`;
            joinBtn.disabled = true;
            joinBtn.classList.add('border', 'border-gray-300', 'dark:border-white/20', 'opacity-50', 'cursor-not-allowed');
        } else if (gameStatus === 'Ongoing') {
            joinBtn.innerHTML = `GAME IN PROGRESS <span class="material-symbols-outlined text-[18px] animate-pulse">sports_basketball</span>`;
            joinBtn.disabled = true;
            joinBtn.classList.add('bg-red-50', 'dark:bg-red-500/10', 'border', 'border-red-200', 'dark:border-red-500/30', 'text-red-600', 'dark:text-red-500', 'cursor-not-allowed');
        } else if (!currentUser) {
            joinBtn.innerHTML = `LOG IN TO JOIN <span class="material-symbols-outlined text-[18px]">login</span>`;
            joinBtn.disabled = false;
            joinBtn.addEventListener('click', () => window.location.href = 'index.html');
            joinBtn.classList.add('border', 'border-gray-300', 'dark:border-white/20', 'text-gray-900', 'dark:text-white', 'hover:bg-gray-300', 'dark:hover:bg-white/20', 'active:scale-95');
        } else if (isJoined) {
            if (isHost) {
                joinBtn.innerHTML = `CANCEL & DELETE MATCH <span class="material-symbols-outlined text-[18px]">delete_forever</span>`;
                joinBtn.disabled = false; 
                joinBtn.addEventListener('click', window.deleteGame);
                joinBtn.classList.add('bg-red-50', 'dark:bg-red-500/10', 'hover:bg-red-100', 'dark:hover:bg-red-500/20', 'text-red-600', 'dark:text-red-500', 'border', 'border-red-200', 'dark:border-red-500/30', 'active:scale-95');
            } else {
                joinBtn.innerHTML = `LEAVE GAME <span class="material-symbols-outlined text-[18px]">logout</span>`;
                joinBtn.disabled = false; 
                joinBtn.addEventListener('click', handleNormalJoinLeave);
                joinBtn.classList.add('bg-red-50', 'dark:bg-red-500/10', 'hover:bg-red-100', 'dark:hover:bg-red-500/20', 'text-red-600', 'dark:text-red-500', 'border', 'border-red-200', 'dark:border-red-500/30', 'active:scale-95');
            }
        } else if (isApplicant) {
            joinBtn.innerHTML = `REQUEST PENDING <span class="material-symbols-outlined text-[18px]">schedule</span>`;
            joinBtn.disabled = true;
            joinBtn.classList.add('bg-blue-50', 'dark:bg-blue-500/10', 'border', 'border-blue-200', 'dark:border-blue-500/30', 'text-blue-600', 'dark:text-blue-500', 'cursor-not-allowed');
        } else if (isFull) {
            joinBtn.innerHTML = `GAME FULL <span class="material-symbols-outlined text-[18px]">block</span>`;
            joinBtn.disabled = true;
            joinBtn.classList.add('bg-gray-200', 'dark:bg-[#14171d]', 'border', 'border-gray-300', 'dark:border-white/20', 'opacity-50', 'cursor-not-allowed');
        } else if (needsApproval) {
            joinBtn.innerHTML = `REQUEST TO JOIN <span class="material-symbols-outlined text-[20px]">person_add</span>`;
            joinBtn.disabled = false;
            joinBtn.addEventListener('click', handleNormalJoinLeave);
            joinBtn.classList.add('bg-white', 'dark:bg-[#14171d]', 'text-[#ff751f]', 'border', 'border-[#ff751f]/30', 'hover:bg-[#ff751f]', 'hover:text-[#0a0e14]', 'active:scale-95');
        } else {
            joinBtn.innerHTML = `JOIN GAME <span class="material-symbols-outlined text-[20px]">chevron_right</span>`;
            joinBtn.disabled = false;
            joinBtn.addEventListener('click', handleNormalJoinLeave);
            joinBtn.classList.remove('bg-gray-200', 'dark:bg-white/10', 'text-gray-500', 'dark:text-gray-400');
            joinBtn.classList.add('bg-[#ff751f]', 'text-[#0a0e14]', 'shadow-[0_4px_20px_rgba(255,117,31,0.3)]', 'hover:brightness-110', 'active:scale-95', 'border', 'border-[#ff751f]');
        }
    }

    async function handleNormalJoinLeave() {
        if (!currentGameData || !currentUser) return;

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

            const uniqueId = Date.now().toString();
            const resId = `RESERVED_${uniqueId}`;
            
            try {
                await updateDoc(doc(db, "games", gameId), {
                    players: arrayUnion(resId),
                    [`reservations.${uniqueId}`]: name.trim(),
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

    window.removeReservation = async function(resKey, rawId) {
        if(!confirm("Remove this reserved slot?")) return;
        try {
            await updateDoc(doc(db, "games", gameId), {
                players: arrayRemove(rawId),
                [`reservations.${resKey}`]: null,
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
            inviteListContainer.innerHTML = '<div class="text-center py-8 opacity-50"><span class="material-symbols-outlined animate-spin text-4xl text-[#ff751f]">sync</span><p class="text-xs font-bold uppercase tracking-widest mt-2 text-gray-500">Loading Connections...</p></div>';
            
            inviteListModal.classList.remove('hidden');
            inviteListModal.classList.add('flex');
            setTimeout(() => {
                inviteListModal.classList.remove('opacity-0');
                inviteListModal.querySelector('div').classList.remove('scale-95');
            }, 10);

            try {
                const connRef = collection(db, "connections");
                
                const q1 = await getDocs(query(connRef, where("requesterId", "==", currentUser.uid)));
                const q2 = await getDocs(query(connRef, where("receiverId", "==", currentUser.uid)));
                
                const uids = [];
                q1.forEach(d => { if(d.data().status === 'accepted') uids.push(d.data().receiverId); });
                q2.forEach(d => { if(d.data().status === 'accepted') uids.push(d.data().requesterId); });

                if (uids.length === 0) {
                    inviteListContainer.innerHTML = '<p class="text-sm text-center text-gray-500 dark:text-gray-400 py-6">You have no connections to invite.</p>';
                    return;
                }

                const users = await fetchUsersByUids([...new Set(uids)]);
                inviteListContainer.innerHTML = '';
                
                const posMap = { 'PG': 'Point Guard', 'SG': 'Shooting Guard', 'SF': 'Small Forward', 'PF': 'Power Forward', 'C': 'Center' };
                
                users.forEach(u => {
                    const isAlreadyIn = currentGameData.players.includes(u.uid);
                    
                    let btnHtml = isAlreadyIn 
                        ? `<button disabled class="px-4 py-2 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-400 dark:text-gray-500 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-not-allowed shadow-sm">In Game</button>`
                        : `<button onclick="window.sendInvite('${u.uid}', this)" class="px-4 py-2 bg-[#ff751f]/10 hover:bg-[#ff751f]/20 text-[#ff751f] border border-[#ff751f]/30 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm active:scale-95">Send Invite</button>`;
                    
                    inviteListContainer.innerHTML += `
                        <div class="flex items-center justify-between p-3 bg-white dark:bg-[#14171d] hover:bg-gray-50 dark:hover:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10 transition-colors shadow-sm">
                            <div class="flex items-center gap-3">
                                <img src="${u.photoURL || getFallbackAvatar(u.displayName)}" class="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-white/20">
                                <div>
                                    <p class="font-bold text-sm text-gray-900 dark:text-white">${escapeHTML(u.displayName)}</p>
                                    <p class="text-[9px] text-gray-500 dark:text-gray-400 uppercase font-black tracking-widest">${escapeHTML(posMap[u.primaryPosition] || u.primaryPosition || 'Player')}</p>
                                </div>
                            </div>
                            ${btnHtml}
                        </div>
                    `;
                });
            } catch(e) {
                console.error(e);
                inviteListContainer.innerHTML = '<p class="text-sm text-center text-red-500 py-6">Failed to load connections.</p>';
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

    window.sendInvite = async function(targetUid, btnElement) {
        if(btnElement) {
            btnElement.disabled = true;
            btnElement.innerText = "SENDING...";
        }
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

            if(btnElement) {
                btnElement.innerText = "SENT!";
                btnElement.classList.remove('bg-[#ff751f]/10', 'text-[#ff751f]', 'hover:bg-[#ff751f]/20', 'active:scale-95');
                btnElement.classList.add('bg-gray-100', 'dark:bg-white/5', 'text-gray-400', 'dark:text-gray-500', 'cursor-not-allowed', 'border-gray-200', 'dark:border-white/10');
            }
            
        } catch (err) {
            console.error(err);
            alert("Failed to send invite.");
            if(btnElement) {
                btnElement.disabled = false;
                btnElement.innerText = "SEND INVITE";
            }
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

        modal = document.createElement('div');
        modal.id = 'dynamic-image-modal';
        modal.className = 'fixed inset-0 z-[100] hidden items-center justify-center bg-black/90 backdrop-blur-sm transition-opacity duration-300 opacity-0 cursor-pointer';
        modal.onclick = (e) => { if(e.target === modal) window.closeImageModal() };
        modal.innerHTML = `
            <div class="relative max-w-5xl w-full mx-4 transition-transform duration-300 scale-95 flex flex-col items-center justify-center" onclick="event.stopPropagation()">
                <button onclick="window.closeImageModal()" class="absolute -top-14 right-0 bg-white/10 text-white hover:text-[#ff751f] p-2 rounded-full transition-colors shadow-lg border border-white/20 z-10 flex items-center justify-center cursor-pointer hover:bg-white/20">
                    <span class="material-symbols-outlined">close</span>
                </button>
                <img id="dynamic-image-modal-img" src="" class="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl border border-white/10">
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('dynamic-image-modal-img').src = imgSrc;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        void modal.offsetWidth; 
        modal.classList.remove('opacity-0');
        modal.querySelector('div').classList.remove('scale-95');
        modal.querySelector('div').classList.add('scale-100');
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
            }, 300);
        }
    };
    
    window.shareGameNative = async function() {
        const shareData = {
            title: currentGameData ? currentGameData.title : 'Liga PH Matchup',
            text: 'Check out this basketball game on Liga PH!',
            url: window.location.href,
        };
        
        if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
            try {
                await navigator.share(shareData);
            } catch (err) {
                console.log('Error opening native share:', err);
            }
        } else {
            navigator.clipboard.writeText(window.location.href)
                .then(() => alert("Game link copied to clipboard! Share it with friends."))
                .catch(() => alert("Your browser does not support native sharing or clipboard copies."));
        }
    };

    window.markPlayerAttendance = async function(uid, didAttend) {
        try {
            const userDoc = await getDoc(doc(db, "users", uid));
            if (userDoc.exists()) {
                if (didAttend) {
                    await updateDoc(doc(db, "users", uid), { gamesAttended: increment(1) });
                } else {
                    await updateDoc(doc(db, "users", uid), { gamesMissed: increment(1) });
                }
            }

            const updates = { attendanceReported: arrayUnion(uid) };
            if (didAttend) updates.attendedPlayers = arrayUnion(uid);
            else updates.noShowPlayers = arrayUnion(uid);

            await updateDoc(doc(db, "games", gameId), updates);

            const updatedGameSnap = await getDoc(doc(db, "games", gameId));
            const updatedGame = updatedGameSnap.data();
            const valPlayers = Array.isArray(updatedGame.players) ? updatedGame.players.filter(p => p && typeof p === 'string' && !p.toLowerCase().includes('reserved')) : [];
            
            if (Array.isArray(updatedGame.attendanceReported) && updatedGame.attendanceReported.length >= valPlayers.length && !updatedGame.organizerAttendedRecorded) {
                const hostDoc = await getDoc(doc(db, "users", updatedGame.hostId));
                if (hostDoc.exists()) {
                    await updateDoc(doc(db, "users", hostDoc.id), { gamesAttended: increment(1) });
                }
                await updateDoc(doc(db, "games", gameId), { organizerAttendedRecorded: true });

                for (let pUid of valPlayers) {
                    try {
                        if (pUid === updatedGame.hostId) continue;
                        const pDidAttend = Array.isArray(updatedGame.attendedPlayers) && updatedGame.attendedPlayers.includes(pUid);
                        let notifMessage = pDidAttend 
                            ? `You have been marked as present for "${updatedGame.title}". You can now commend or rate players you played with!` 
                            : `The host marked you as absent for "${updatedGame.title}". If this is an error, please contact customer service.`;

                        await addDoc(collection(db, "notifications"), {
                            recipientId: pUid,
                            actorId: 'system',
                            actorName: 'Liga PH',
                            actorPhoto: 'assets/logo-192.png',
                            type: 'system_alert',
                            message: notifMessage,
                            link: `game-details.html?id=${gameId}`,
                            read: false,
                            createdAt: serverTimestamp()
                        });
                    } catch(e) {}
                }
            }
            await loadGameDetails(); 
            alert(`Attendance recorded.`);
        } catch(e) {
            console.error(e);
            alert("Failed to report attendance.");
        }
    };

    window.reportAttendance = async function() {
        if (!confirm("Report attendance now? This will finalize the game and update reliability scores for all players.")) return;
        try {
            const playersToCredit = currentGameData.players.filter(p => !p.startsWith('RESERVED'));
            for (let uid of playersToCredit) {
                const pRef = doc(db, "users", uid);
                await updateDoc(pRef, { gamesAttended: increment(1) }).catch(e => console.warn(e));
            }

            const hostDataToUnion = [currentGameData.host, currentGameData.hostId].filter(Boolean);

            await updateDoc(doc(db, "games", gameId), {
                attendanceReported: arrayUnion(...hostDataToUnion),
                attendedPlayers: arrayUnion(...hostDataToUnion),
                status: 'completed'
            });
            alert("Attendance verified! Game is officially completed.");
            loadGameDetails();
        } catch (e) {
            console.error(e);
            alert("Failed to report attendance.");
        }
    };

    window.quickCommend = async function(targetUserId) {
        try {
            const commRef = collection(db, "commendations");
            const checkSnap = await getDocs(query(commRef, where("gameId", "==", gameId)));
            const alreadyCommended = checkSnap.docs.some(d => d.data().targetUserId === targetUserId && d.data().senderId === currentUser.uid);
            
            if (alreadyCommended) return alert(`You have already commended this player for this game!`);

            await addDoc(commRef, { targetUserId, senderId: currentUser.uid, gameId: gameId, createdAt: serverTimestamp() });
            
            await updateDoc(doc(db, "users", targetUserId), { commendations: increment(1) }).catch(e => console.warn(e));

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

            alert(`Props given!`);
            await loadGameDetails(); 
        } catch(e) { console.error(e); }
    };

    window.quickRate = async function(targetUserId, playerName) {
        try {
            const checkSnap = await getDocs(query(collection(db, "ratings"), where("gameId", "==", gameId)));
            const alreadyRated = checkSnap.docs.some(d => d.data().targetUserId === targetUserId && d.data().raterId === currentUser.uid);
            
            if (alreadyRated) return alert(`You have already rated ${playerName} for this game!`);

            document.getElementById('rating-target-name').textContent = playerName;
            document.getElementById('rating-target-id').value = targetUserId;

            const starsContainer = document.getElementById('rating-stars-container');
            starsContainer.innerHTML = '';
            ['sportsmanship', 'attitude', 'punctuality'].forEach(skill => {
                starsContainer.innerHTML += `
                    <div class="flex justify-between items-center" data-skill="${skill}">
                        <span class="text-[10px] font-bold uppercase tracking-widest text-gray-900 dark:text-white">${skill}</span>
                        <div class="flex gap-1 star-container cursor-pointer text-gray-300 dark:text-gray-600">
                            ${[1,2,3,4,5].map(i => `<span class="material-symbols-outlined text-2xl hover:text-[#ff751f] transition-colors" data-value="${i}">star</span>`).join('')}
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
                                s.classList.add('text-[#ff751f]');
                                s.classList.remove('text-gray-300', 'dark:text-gray-600');
                                s.style.fontVariationSettings = "'FILL' 1";
                            } else {
                                s.classList.remove('text-[#ff751f]');
                                s.classList.add('text-gray-300', 'dark:text-gray-600');
                                s.style.fontVariationSettings = "'FILL' 0";
                            }
                        });
                    });
                });
            });

            const modal = document.getElementById('rating-modal');
            modal.classList.remove('hidden');
            modal.classList.add('flex');
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
        setTimeout(() => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }, 300);
    });

    const ratingForm = document.getElementById('rating-form');
    if (ratingForm) {
        ratingForm.onsubmit = async (e) => {
            e.preventDefault();
            
            const targetUserId = document.getElementById('rating-target-id').value;
            const payload = {
                targetUserId: targetUserId,
                raterId: currentUser.uid,
                gameId: gameId,
                createdAt: serverTimestamp()
            };

            let valid = true;
            ['sportsmanship', 'attitude', 'punctuality'].forEach(skill => {
                const val = parseInt(document.getElementById(`rate-val-${skill}`).value);
                if (val === 0) valid = false;
                payload[skill] = val;
            });

            if (!valid) return alert("Please rate all 3 traits.");

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
});
