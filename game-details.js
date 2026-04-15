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
        const div = document.createElement('div'); div.textContent = str; return div.innerHTML;
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
            h = h % 12; h = h ? h : 12; 
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
            if (gameEnd < gameStart) gameEnd.setDate(gameEnd.getDate() + 1); 
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
                if (!Array.isArray(currentGameData.players)) currentGameData.players = [currentGameData.host || "Unknown"]; 

                let currentLiveName = "Unknown Player";
                if (currentUser) {
                    try {
                        const localProfile = JSON.parse(localStorage.getItem('ligaPhProfile') || '{}');
                        currentLiveName = localProfile.displayName || currentUser.displayName || "Unknown Player";
                    } catch(e) {
                        currentLiveName = currentUser.displayName || "Unknown Player";
                    }

                    if (currentGameData.hostId === currentUser.uid && currentGameData.host !== currentLiveName && currentLiveName !== "Unknown Player") {
                        try {
                            const oldName = currentGameData.host;
                            const newName = currentLiveName;
                            
                            const newPlayers = (currentGameData.players || []).map(p => p === oldName ? newName : p);
                            const newApps = (currentGameData.applicants || []).map(p => p === oldName ? newName : p);
                            const newReported = (currentGameData.attendanceReported || []).map(p => p === oldName ? newName : p);
                            const newAttended = (currentGameData.attendedPlayers || []).map(p => p === oldName ? newName : p);
                            const newNoShow = (currentGameData.noShowPlayers || []).map(p => p === oldName ? newName : p);
                            
                            await updateDoc(docRef, {
                                host: newName, players: newPlayers, applicants: newApps,
                                attendanceReported: newReported, attendedPlayers: newAttended, noShowPlayers: newNoShow
                            });
                            
                            currentGameData.host = newName; currentGameData.players = newPlayers; currentGameData.applicants = newApps;
                            currentGameData.attendanceReported = newReported; currentGameData.attendedPlayers = newAttended; currentGameData.noShowPlayers = newNoShow;
                        } catch (updateError) { console.warn("Silent fail on host name sync.", updateError); }
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
                                    recipientId: currentGameData.hostId, actorId: 'system', actorName: 'Liga PH', actorPhoto: 'assets/logo-192.png',
                                    type: 'system_alert', message: `Your game "${currentGameData.title}" has ended! Please mark the player attendance.`, link: `game-details.html?id=${gameId}`, read: false, createdAt: serverTimestamp()
                                });
                            }
                        } catch(notifError) {}
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
                    } catch (squadFetchErr) {}
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
                    const userSnap = await getDoc(doc(db, "users", uid));
                    if (userSnap.exists()) users.push({ uid, ...userSnap.data() });
                }
            } catch (e) {}
        }
        return users;
    }

    // --- BUTTON & UI STATE LOGIC (HOISTED) ---
    function updateJoinButtonState() {
        if (!currentGameData || !joinBtn) return;

        const newJoinBtn = joinBtn.cloneNode(true);
        joinBtn.parentNode.replaceChild(newJoinBtn, joinBtn);
        joinBtn = newJoinBtn;

        const gameStatus = getGameStatus(currentGameData.date, currentGameData.time, currentGameData.endTime);

        let userName = currentUser?.displayName;
        if (!userName) {
            try {
                const localProfile = JSON.parse(localStorage.getItem('ligaPhProfile') || '{}');
                userName = localProfile.displayName || "Unknown Player";
            } catch(e) { userName = "Unknown Player"; }
        }

        if (isSquadMatch) {
            let isActuallyPlaying = false;
            let isSquadMember = false;

            const gamePlayers = currentGameData.players || [];
            if (currentUser) {
                isActuallyPlaying = Array.isArray(gamePlayers) && gamePlayers.includes(userName);
                if (squad1Data && squad2Data) {
                    if ((squad1Data.members || []).includes(currentUser.uid) || (squad2Data.members || []).includes(currentUser.uid)) {
                        isSquadMember = true;
                    }
                }
            }

            joinBtn.className = "flex-1 px-6 h-14 rounded-xl font-headline font-black uppercase tracking-widest transition-all text-sm md:text-base flex items-center justify-center gap-2";

            if (gameStatus === 'Completed') {
                joinBtn.innerHTML = `MATCH CONCLUDED <span class="material-symbols-outlined text-[18px]">verified</span>`;
                joinBtn.disabled = true; joinBtn.classList.add('bg-surface-container-highest', 'border', 'border-outline-variant/30', 'text-outline', 'opacity-50', 'cursor-not-allowed');
                bottomBarWrapper.classList.remove('hidden'); 
            } else if (gameStatus === 'Ongoing') {
                joinBtn.innerHTML = `MATCH IN PROGRESS <span class="material-symbols-outlined text-[18px] animate-pulse">sports_basketball</span>`;
                joinBtn.disabled = true; joinBtn.classList.add('bg-error/10', 'text-error', 'border', 'border-error/30', 'cursor-not-allowed');
            } else if (!currentUser) {
                joinBtn.innerHTML = `LOG IN TO VIEW <span class="material-symbols-outlined text-[18px]">login</span>`;
                joinBtn.disabled = false; joinBtn.addEventListener('click', () => window.location.href = 'index.html');
                joinBtn.classList.add('bg-surface-container-highest', 'border', 'border-outline-variant/30', 'text-on-surface', 'hover:bg-surface-bright', 'active:scale-95');
            } else if (isActuallyPlaying) {
                joinBtn.innerHTML = `LEAVE MATCH <span class="material-symbols-outlined text-[18px]">logout</span>`;
                joinBtn.disabled = false; joinBtn.classList.add('bg-error/10', 'text-error', 'border', 'border-error/30', 'hover:bg-error/20', 'active:scale-95');
                joinBtn.addEventListener('click', async () => {
                    if(!confirm("Are you sure you want to drop out of your squad's match lineup?")) return;
                    try {
                        joinBtn.innerHTML = `<span class="material-symbols-outlined animate-spin">refresh</span>`; joinBtn.disabled = true;
                        await updateDoc(doc(db, "games", gameId), { players: arrayRemove(userName) });
                        await loadGameDetails();
                    } catch(e) { alert("Failed to leave."); updateJoinButtonState(); }
                });
            } else if (isSquadMember) {
                joinBtn.innerHTML = `CHECKING INVITES <span class="material-symbols-outlined animate-spin text-[18px]">refresh</span>`;
                joinBtn.disabled = true; joinBtn.classList.add('bg-surface-container-highest', 'text-outline', 'border', 'border-outline-variant/30');

                (async () => {
                    try {
                        const inviteQ = query(collection(db, "notifications"), where("recipientId", "==", currentUser.uid));
                        const inviteSnap = await getDocs(inviteQ);
                        let hasInvite = false;
                        inviteSnap.forEach(d => { if(d.data().targetId === gameId && d.data().type === "game_invite") hasInvite = true; });

                        if (hasInvite) {
                            joinBtn.innerHTML = `ACCEPT INVITE <span class="material-symbols-outlined text-[18px]">check_circle</span>`;
                            joinBtn.disabled = false; joinBtn.classList.remove('bg-surface-container-highest', 'text-outline', 'border-outline-variant/30');
                            joinBtn.classList.add('bg-primary', 'text-on-primary-container', 'hover:brightness-110', 'active:scale-95');
                            joinBtn.addEventListener('click', async () => {
                                joinBtn.disabled = true; joinBtn.innerHTML = `<span class="material-symbols-outlined animate-spin">refresh</span>`;
                                await updateDoc(doc(db, "games", gameId), { players: arrayUnion(userName) });
                                inviteSnap.forEach(d => { if(d.data().targetId === gameId) updateDoc(doc(db, "notifications", d.id), { read: true }); });
                                await loadGameDetails();
                            });
                        } else {
                            joinBtn.innerHTML = `WAITING FOR CAPTAIN <span class="material-symbols-outlined text-[18px]">hourglass_empty</span>`;
                            joinBtn.disabled = true; joinBtn.classList.add('cursor-not-allowed');
                        }
                    } catch (e) { joinBtn.innerHTML = `ERROR <span class="material-symbols-outlined text-[18px]">error</span>`; }
                })();
            } else {
                joinBtn.innerHTML = `SHARE MATCH <span class="material-symbols-outlined text-[18px]">share</span>`;
                joinBtn.disabled = false; joinBtn.classList.add('bg-surface-container-highest', 'border', 'border-outline-variant/30', 'text-on-surface', 'hover:bg-surface-bright', 'active:scale-95');
                joinBtn.addEventListener('click', () => { navigator.clipboard.writeText(window.location.href); alert("Match link copied to clipboard!"); });
            }
            return; 
        }

        const spotsTotal = parseInt(currentGameData.spotsTotal) || 10;
        const players = Array.isArray(currentGameData.players) ? currentGameData.players : [];
        const applicants = Array.isArray(currentGameData.applicants) ? currentGameData.applicants : [];
        const spotsFilled = players.length;

        const isJoined = currentUser && players.includes(userName);
        const isApplicant = currentUser && applicants.includes(userName);
        const isFull = spotsFilled >= spotsTotal;
        const needsApproval = currentGameData.joinPolicy === 'approval';

        joinBtn.className = "flex-1 px-6 h-14 rounded-xl font-headline font-black uppercase tracking-widest transition-all text-sm md:text-base flex items-center justify-center gap-2";

        if (gameStatus === 'Completed') {
            joinBtn.innerHTML = `GAME CONCLUDED <span class="material-symbols-outlined text-[18px]">verified</span>`;
            joinBtn.disabled = true; joinBtn.classList.add('bg-surface-container-highest', 'border', 'border-outline-variant/30', 'text-outline', 'opacity-50', 'cursor-not-allowed');
        } else if (gameStatus === 'Ongoing') {
            joinBtn.innerHTML = `GAME IN PROGRESS <span class="material-symbols-outlined text-[18px] animate-pulse">sports_basketball</span>`;
            joinBtn.disabled = true; joinBtn.classList.add('bg-error/10', 'border', 'border-error/30', 'text-error', 'cursor-not-allowed');
        } else if (!currentUser) {
            joinBtn.innerHTML = `LOG IN TO JOIN <span class="material-symbols-outlined text-[18px]">login</span>`;
            joinBtn.disabled = false; joinBtn.addEventListener('click', () => window.location.href = 'index.html');
            joinBtn.classList.add('bg-surface-container-highest', 'border', 'border-outline-variant/30', 'text-on-surface', 'hover:bg-surface-bright', 'active:scale-95');
        } else if (isJoined) {
            joinBtn.innerHTML = `LEAVE GAME <span class="material-symbols-outlined text-[18px]">logout</span>`;
            joinBtn.disabled = false; joinBtn.addEventListener('click', handleNormalJoinLeave);
            joinBtn.classList.add('bg-error/10', 'hover:bg-error/20', 'text-error', 'active:scale-95');
        } else if (isApplicant) {
            joinBtn.innerHTML = `REQUEST PENDING <span class="material-symbols-outlined text-[18px]">schedule</span>`;
            joinBtn.disabled = true; joinBtn.classList.add('bg-secondary/10', 'border', 'border-secondary/30', 'text-secondary', 'cursor-not-allowed');
        } else if (isFull) {
            joinBtn.innerHTML = `GAME FULL <span class="material-symbols-outlined text-[18px]">block</span>`;
            joinBtn.disabled = true; joinBtn.classList.add('bg-[#14171d]', 'border', 'border-outline-variant/20', 'text-outline', 'opacity-50', 'cursor-not-allowed');
        } else if (needsApproval) {
            joinBtn.innerHTML = `REQUEST TO JOIN <span class="material-symbols-outlined text-[20px]">person_add</span>`;
            joinBtn.disabled = false; joinBtn.addEventListener('click', handleNormalJoinLeave);
            joinBtn.classList.add('bg-[#14171d]', 'text-primary', 'border', 'border-primary/30', 'hover:bg-primary', 'hover:text-on-primary-container', 'active:scale-95');
        } else {
            joinBtn.innerHTML = `JOIN GAME <span class="material-symbols-outlined text-[20px]">chevron_right</span>`;
            joinBtn.disabled = false; joinBtn.addEventListener('click', handleNormalJoinLeave);
            joinBtn.classList.add('bg-primary', 'text-on-primary-container', 'shadow-[0_0_30px_rgba(255,143,111,0.25)]', 'hover:brightness-110', 'active:scale-95');
        }
    }

    async function handleNormalJoinLeave() {
        if (!currentGameData) return;

        const spotsTotal = parseInt(currentGameData.spotsTotal) || 10;
        const players = Array.isArray(currentGameData.players) ? currentGameData.players : [];
        const spotsFilled = players.length;

        let userName = currentUser.displayName;
        if (!userName) {
            try {
                const localProfile = JSON.parse(localStorage.getItem('ligaPhProfile') || '{}');
                userName = localProfile.displayName || "Unknown Player";
            } catch(e) { userName = "Unknown Player"; }
        }

        if (userName === "Unknown Player") {
            alert("Please set up your profile name before joining games.");
            window.location.href = "edit-profile.html";
            return;
        }

        const isJoined = players.includes(userName);
        const isFull = spotsFilled >= spotsTotal;
        const gameStatus = getGameStatus(currentGameData.date, currentGameData.time, currentGameData.endTime);

        if (gameStatus !== 'Upcoming') {
            alert("This game is no longer active.");
            return;
        }

        if (isJoined) {
            if(!confirm("Are you sure you want to give up your spot?")) return;
            try {
                joinBtn.innerHTML = `<span class="material-symbols-outlined animate-spin">refresh</span>`; joinBtn.disabled = true;
                await updateDoc(doc(db, "games", gameId), {
                    players: arrayRemove(userName),
                    spotsFilled: Math.max(0, spotsFilled - 1)
                });
                await loadGameDetails();
            } catch (error) { alert("Failed to leave game."); updateJoinButtonState(); }
            return;
        }

        if (isFull) return alert("This game is already full.");

        try {
            joinBtn.innerHTML = `<span class="material-symbols-outlined animate-spin">refresh</span>`; joinBtn.disabled = true;

            const gameRef = doc(db, "games", gameId);
            let hasActiveInvite = false;
            
            const inviteQ = query(collection(db, "notifications"), where("recipientId", "==", currentUser.uid));
            const inviteSnap = await getDocs(inviteQ);
            inviteSnap.forEach(d => {
                if (d.data().targetId === gameId && d.data().type === "game_invite") {
                    hasActiveInvite = true;
                    updateDoc(doc(db, "notifications", d.id), { read: true });
                }
            });

            if (currentGameData.joinPolicy === 'approval' && !hasActiveInvite) {
                await updateDoc(gameRef, { applicants: arrayUnion(userName) });
                try {
                    const hostQ = query(collection(db, "users"), where("displayName", "==", currentGameData.host), limit(1));
                    const hostSnap = await getDocs(hostQ);
                    if (!hostSnap.empty && hostSnap.docs[0].id !== currentUser.uid) {
                        await addDoc(collection(db, "notifications"), {
                            recipientId: hostSnap.docs[0].id, actorId: currentUser.uid, actorName: userName, actorPhoto: currentUser.photoURL || null,
                            type: 'game_request', targetId: gameId, message: `requested to join your game ${currentGameData.title}`, link: `game-details.html?id=${gameId}`, read: false, createdAt: serverTimestamp()
                        });
                    }
                } catch(e){}
                alert("Your join request has been sent to the organizer.");
            } else {
                await updateDoc(gameRef, {
                    players: arrayUnion(userName), spotsFilled: spotsFilled + 1, applicants: arrayRemove(userName) 
                });
                
                try {
                    const hostQ = query(collection(db, "users"), where("displayName", "==", currentGameData.host), limit(1));
                    const hostSnap = await getDocs(hostQ);
                    if (!hostSnap.empty && hostSnap.docs[0].id !== currentUser.uid) {
                        await addDoc(collection(db, "notifications"), {
                            recipientId: hostSnap.docs[0].id, actorId: currentUser.uid, actorName: userName, actorPhoto: currentUser.photoURL || null,
                            type: 'game_join', targetId: gameId, message: `joined your game ${currentGameData.title}`, link: `game-details.html?id=${gameId}`, read: false, createdAt: serverTimestamp()
                        });
                    }
                } catch(e){}

                if (hasActiveInvite) alert("You had an active invite! You bypassed the queue and were automatically added to the game.");
            }
            await loadGameDetails();
        } catch (error) {
            console.error("Error joining game:", error); alert("Action failed. Please try again."); updateJoinButtonState();
        }
    }

    async function renderGameDetails(game) {
        try {
            const mainContainer = document.getElementById('game-details-main');
            if (!mainContainer) return; 

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
            const players = Array.isArray(game.players) ? game.players : [safeHost];
            const applicants = Array.isArray(game.applicants) ? game.applicants : [];
            const spotsFilled = players.length;
            const gameStatus = getGameStatus(game.date, game.time, game.endTime);

            let currentUserDisplayName = "Unknown Player";
            if (currentUser) {
                const localProfile = localStorage.getItem('ligaPhProfile');
                if (localProfile) { try { currentUserDisplayName = JSON.parse(localProfile).displayName || "Unknown Player"; } catch(e) {} }
            }
            
            let isHost = false;
            if (currentUserDisplayName !== "Unknown Player" && currentUserDisplayName === game.host) isHost = true;
            if (currentUser && currentUser.uid === game.hostId) isHost = true;
            if (players.length > 0 && players[0] === currentUserDisplayName && currentUserDisplayName !== "Unknown Player") isHost = true;
            
            if (isHost && !game.hostId && currentUser) {
                try { await updateDoc(doc(db, "games", gameId), { hostId: currentUser.uid }); } catch(e) {}
            }
            
            const displayImage = game.imageUrl ? escapeHTML(game.imageUrl) : 'https://images.unsplash.com/photo-1546519638-68e109498ffc?q=80&w=2090&auto=format&fit=crop';
            const safeLocSearch = encodeURIComponent(game.location || 'Metro Manila, Philippines');
            
            // FIX FOR 404: Using properly formatted google maps query URL
            const finalMapEmbedUrl = "https://maps.google.com/maps?q=" + safeLocSearch + "&output=embed";
            const finalMapLinkUrl = game.mapLink ? escapeHTML(game.mapLink) : "https://www.google.com/maps/search/" + safeLocSearch;

            const manageGameHtml = isHost ? `
                <button onclick="window.openManageGameModal()" class="absolute top-4 right-4 md:top-6 md:right-6 z-20 bg-[#0a0e14]/80 backdrop-blur-md border border-outline-variant/30 text-on-surface hover:text-primary hover:border-primary/50 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg flex items-center gap-2 cursor-pointer">
                    <span class="material-symbols-outlined text-[16px]">settings</span> Manage Game
                </button>
            ` : '';

            const playerProfiles = {};
            const validProfileNames = players.filter(n => n && typeof n === 'string' && !n.startsWith("Reserved Slot"));
            const profilePromises = validProfileNames.map(async (name) => {
                try {
                    const q = query(collection(db, "users"), where("displayName", "==", name), limit(1));
                    const snap = await getDocs(q);
                    if (!snap.empty) playerProfiles[name] = { uid: snap.docs[0].id, ...snap.docs[0].data() };
                } catch(e) {}
            });
            await Promise.all(profilePromises);

            const hostProfileExists = playerProfiles[game.host] !== undefined;
            let claimHtml = '';
            if (!hostProfileExists && currentUser && !isHost && !isSquadMatch) {
                claimHtml = `
                    <div class="bg-tertiary/10 border border-tertiary/30 p-5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 shadow-md">
                        <div class="flex-1">
                            <h3 class="font-headline text-tertiary font-black italic uppercase tracking-tighter text-lg flex items-center gap-2 mb-1"><span class="material-symbols-outlined text-[20px]">warning</span> Orphaned Game</h3>
                            <p class="text-xs text-on-surface-variant leading-relaxed">The organizer profile for "<strong>${safeHost}</strong>" cannot be found. If you created this game before changing your profile name, claim it to restore full admin controls.</p>
                        </div>
                        <button onclick="window.claimOrphanedGame('${safeHost}')" class="shrink-0 w-full sm:w-auto bg-tertiary text-on-primary-container px-6 py-3 rounded-xl font-black uppercase text-[11px] tracking-widest shadow-lg hover:brightness-110 active:scale-95 transition-all">Claim Game</button>
                    </div>`;
            }

            let adminOverrideHtml = '';
            if (currentUserProfile && currentUserProfile.accountType === 'Administrator' && game.hostId !== currentUser?.uid) {
                adminOverrideHtml = `
                    <div class="bg-error/10 border border-error/30 p-5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 shadow-md">
                        <div class="flex-1">
                            <h3 class="font-headline text-error font-black italic uppercase tracking-tighter text-lg flex items-center gap-2 mb-1"><span class="material-symbols-outlined text-[20px]">gavel</span> Admin Override</h3>
                            <p class="text-xs text-on-surface-variant leading-relaxed">Force cancel and delete this game from the database.</p>
                        </div>
                        <button onclick="window.adminForceCancelGame('${gameId}')" class="shrink-0 w-full sm:w-auto bg-error hover:brightness-110 text-white px-6 py-3 rounded-xl font-black uppercase text-[11px] tracking-widest shadow-lg active:scale-95 transition-all">Force Cancel</button>
                    </div>`;
            }

            let myCommendedUserIds = []; let myRatedUserIds = [];
            if (currentUser) {
                try {
                    const [commSnap, rateSnap] = await Promise.all([
                        getDocs(query(collection(db, "commendations"), where("senderId", "==", currentUser.uid))),
                        getDocs(query(collection(db, "ratings"), where("raterId", "==", currentUser.uid)))
                    ]);
                    myCommendedUserIds = commSnap.docs.filter(d => d.data().gameId === gameId).map(d => d.data().targetUserId);
                    myRatedUserIds = rateSnap.docs.filter(d => d.data().gameId === gameId).map(d => d.data().targetUserId);
                } catch(e) {}
            }

            let waitlistHtml = '';
            if (isHost && !isSquadMatch && gameStatus === 'Upcoming') {
                let appList = `<p class="text-xs text-outline italic text-center py-6">No pending join requests.</p>`;
                if (applicants.length > 0) {
                    appList = applicants.filter(n => n && typeof n === 'string').map(name => {
                        const safeAppName = escapeHTML(name);
                        return `
                        <div class="flex items-center justify-between bg-surface-container-highest p-3 rounded-xl border border-outline-variant/10">
                            <div class="flex items-center gap-3">
                                <img src="${getFallbackAvatar(safeAppName)}" class="w-10 h-10 rounded-lg object-cover border border-outline-variant/30">
                                <span class="font-bold text-sm text-on-surface">${safeAppName}</span>
                            </div>
                            <div class="flex gap-2 shrink-0">
                                <button onclick="window.declineApplicant('${safeAppName}')" class="px-3 py-2 rounded-lg bg-surface-container text-error border border-outline-variant/30 hover:border-error/50 text-[9px] font-black tracking-widest uppercase">Decline</button>
                                <button onclick="window.acceptApplicant('${safeAppName}')" class="px-3 py-2 rounded-lg bg-primary/20 text-primary border border-primary/30 hover:bg-primary hover:text-on-primary-container text-[9px] font-black tracking-widest uppercase">Accept</button>
                            </div>
                        </div>`;
                    }).join('');
                }
                waitlistHtml = `
                    <div class="bg-[#14171d] p-5 md:p-6 rounded-2xl border border-primary/30 shadow-md">
                        <div class="flex justify-between items-center mb-4 border-b border-outline-variant/10 pb-3">
                            <h3 class="font-headline text-lg font-black uppercase tracking-widest text-on-surface flex items-center gap-2"><span class="material-symbols-outlined text-primary">how_to_reg</span> Pending Joins</h3>
                            <span class="bg-primary/20 text-primary text-[10px] font-black px-2 py-1 rounded tracking-widest">${applicants.length} PENDING</span>
                        </div>
                        <div class="space-y-3">${appList}</div>
                    </div>`;
            }

            let postGameDashboardHtml = '';
            if (gameStatus === 'Completed') {
                const isParticipant = currentUser && (players.includes(currentUserDisplayName) || players.includes(currentUser.uid));
                const validPlayers = players.filter(p => p && typeof p === 'string' && !p.startsWith('Reserved Slot'));
                
                if (isSquadMatch) {
                    const hasResult = game.matchResult;
                    if (!hasResult && isHost && squad1Data && squad2Data) {
                        postGameDashboardHtml += `
                            <div class="bg-gradient-to-b from-secondary/10 to-[#14171d] p-5 md:p-6 rounded-3xl border border-secondary/30 shadow-lg mb-6">
                                <h3 class="font-headline text-xl font-black uppercase tracking-tighter text-secondary mb-4 flex items-center gap-2"><span class="material-symbols-outlined">emoji_events</span> Record Final Score</h3>
                                <div class="flex items-center justify-between gap-4 mb-6">
                                    <div class="flex-1 flex flex-col items-center">
                                        <span class="font-headline font-black uppercase text-sm mb-2 text-center w-full truncate">${escapeHTML(squad1Data.name)}</span>
                                        <input type="number" id="squad1-score-input" min="0" class="w-20 text-center font-black text-2xl bg-[#0a0e14] border border-outline-variant/30 rounded-xl p-3 text-on-surface focus:ring-primary focus:border-primary transition-all" placeholder="0">
                                    </div>
                                    <span class="font-black text-outline-variant">VS</span>
                                    <div class="flex-1 flex flex-col items-center">
                                        <span class="font-headline font-black uppercase text-sm mb-2 text-center w-full truncate">${escapeHTML(squad2Data.name)}</span>
                                        <input type="number" id="squad2-score-input" min="0" class="w-20 text-center font-black text-2xl bg-[#0a0e14] border border-outline-variant/30 rounded-xl p-3 text-on-surface focus:ring-primary focus:border-primary transition-all" placeholder="0">
                                    </div>
                                </div>
                                <button onclick="window.submitSquadScore('${squad1Data.id}', '${squad2Data.id}')" class="w-full bg-primary hover:brightness-110 text-on-primary-container py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-md active:scale-95">Submit Official Score</button>
                            </div>`;
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
                                    <div class="text-center"><p class="text-[9px] uppercase tracking-widest text-outline-variant mb-1">${escapeHTML(squad1Data.abbreviation)}</p><p class="font-black text-2xl ${winnerId === squad1Data.id ? 'text-primary' : 'text-on-surface'}">${s1Score}</p></div>
                                    <span class="text-outline-variant font-bold">-</span>
                                    <div class="text-center"><p class="text-[9px] uppercase tracking-widest text-outline-variant mb-1">${escapeHTML(squad2Data.abbreviation)}</p><p class="font-black text-2xl ${winnerId === squad2Data.id ? 'text-primary' : 'text-on-surface'}">${s2Score}</p></div>
                                </div>
                            </div>`;
                    }
                } else {
                    if (isHost) {
                        let checkListHtml = validPlayers.map(p => {
                            const safeP = escapeHTML(p);
                            const isAssessed = Array.isArray(game.attendanceReported) && game.attendanceReported.includes(p);
                            const pUid = playerProfiles[p]?.uid;
                            const finalPhotoUrl = (pUid ? escapeHTML(playerProfiles[p].photoURL || '') : '') || getFallbackAvatar(safeP);
                            if (isAssessed) {
                                return `<div class="flex items-center justify-between p-3 bg-surface-container-highest rounded-xl border border-outline-variant/10 opacity-50"><div class="flex items-center gap-3"><img src="${finalPhotoUrl}" class="w-10 h-10 rounded-full object-cover border border-outline-variant/30"><span class="font-bold text-sm text-on-surface">${safeP}</span></div><span class="text-[10px] font-black uppercase tracking-widest text-outline">Reported</span></div>`;
                            }
                            return `<div class="flex items-center justify-between p-3 bg-surface-container-highest rounded-xl border border-outline-variant/20 hover:border-primary/30 transition-colors"><div class="flex items-center gap-3"><img src="${finalPhotoUrl}" class="w-10 h-10 rounded-full object-cover border border-outline-variant/30"><span class="font-bold text-sm text-on-surface">${safeP}</span></div><div class="flex gap-2"><button onclick="window.markPlayerAttendance('${safeP}', false)" class="px-4 py-2 bg-error/10 text-error hover:bg-error/20 border border-error/20 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm">No Show</button><button onclick="window.markPlayerAttendance('${safeP}', true)" class="px-4 py-2 bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">check</span> Attended</button></div></div>`;
                        }).join('');

                        if (validPlayers.length === 0 || (Array.isArray(game.attendanceReported) && game.attendanceReported.length >= validPlayers.length)) {
                            checkListHtml = `<div class="text-center py-6 text-outline"><span class="material-symbols-outlined text-4xl mb-2 text-primary">check_circle</span><p class="text-xs font-bold uppercase tracking-widest">All attendance reported</p></div>`;
                        }

                        postGameDashboardHtml += `
                            <div class="bg-gradient-to-b from-[#1a1714] to-[#14171d] p-5 md:p-6 rounded-3xl border border-primary/30 shadow-lg mb-6">
                                <div class="flex justify-between items-end mb-4 border-b border-outline-variant/10 pb-4">
                                    <div><h3 class="font-headline text-xl font-black uppercase tracking-tighter text-primary flex items-center gap-2 mb-1"><span class="material-symbols-outlined">checklist</span> Post-Game Report</h3><p class="text-xs text-on-surface-variant font-medium">Verify attendance.</p></div>
                                </div>
                                <div class="space-y-3">${checkListHtml}</div>
                            </div>`;
                    } 
                    
                    if (isParticipant || isHost) {
                        const currentUserAssessed = isHost ? (Array.isArray(game.attendanceReported) && game.attendanceReported.includes(currentUserDisplayName)) : (Array.isArray(game.attendanceReported) && game.attendanceReported.includes(currentUserDisplayName));
                        const currentUserDidAttend = isHost ? (Array.isArray(game.attendedPlayers) && game.attendedPlayers.includes(currentUserDisplayName)) : (Array.isArray(game.attendedPlayers) && game.attendedPlayers.includes(currentUserDisplayName));
                        let rateListHtml = '';

                        if (!currentUserAssessed && !isHost) {
                            rateListHtml = `<div class="flex flex-col items-center justify-center py-6 text-outline-variant opacity-70"><span class="material-symbols-outlined text-4xl mb-2 animate-pulse">hourglass_empty</span><p class="text-xs font-bold uppercase tracking-widest text-center">Pending Attendance</p></div>`;
                        } else if (!currentUserDidAttend && !isHost) {
                            rateListHtml = `<div class="flex flex-col items-center justify-center py-6 text-error opacity-80"><span class="material-symbols-outlined text-4xl mb-2">person_off</span><p class="text-xs font-bold uppercase tracking-widest text-center">Marked as No-Show</p></div>`;
                        } else {
                            const rateableTeammates = players.filter(p => {
                                if (!p || typeof p !== 'string' || p === currentUserDisplayName || p.startsWith('Reserved Slot')) return false; 
                                return Array.isArray(game.attendedPlayers) && game.attendedPlayers.includes(p); 
                            });

                            if (rateableTeammates.length === 0) {
                                rateListHtml = `<p class="text-xs text-outline italic text-center py-4">No other players available to rate.</p>`;
                            } else {
                                rateListHtml = rateableTeammates.map(p => {
                                    const safeP = escapeHTML(p);
                                    const pUid = playerProfiles[p]?.uid;
                                    const hasCommended = pUid && myCommendedUserIds.includes(pUid);
                                    const hasRated = pUid && myRatedUserIds.includes(pUid);
                                    const finalPhotoUrl = (pUid ? escapeHTML(playerProfiles[p].photoURL || '') : '') || getFallbackAvatar(safeP);

                                    const commendBtnHtml = hasCommended 
                                        ? `<button disabled class="px-3 py-2 bg-surface-container text-outline border border-outline-variant/20 rounded-lg text-[10px] font-black uppercase tracking-widest cursor-not-allowed flex items-center gap-1 opacity-50"><span class="material-symbols-outlined text-[14px]">thumb_up</span> Props</button>`
                                        : `<button onclick="window.quickCommend('${safeP}')" class="px-3 py-2 bg-secondary/10 text-secondary hover:bg-secondary/20 border border-secondary/20 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">thumb_up</span> Props</button>`;

                                    const rateBtnHtml = hasRated
                                        ? `<button disabled class="px-3 py-2 bg-surface-container text-outline border border-outline-variant/20 rounded-lg text-[10px] font-black uppercase tracking-widest cursor-not-allowed flex items-center gap-1 opacity-50"><span class="material-symbols-outlined text-[14px]">star</span> Rated</button>`
                                        : `<button onclick="window.quickRate('${safeP}')" class="px-3 py-2 bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">star</span> Rate</button>`;

                                    return `
                                        <div class="flex items-center justify-between p-3 bg-surface-container-highest rounded-xl border border-outline-variant/20 hover:border-secondary/30 transition-colors">
                                            <div class="flex items-center gap-3"><img src="${finalPhotoUrl}" class="w-10 h-10 rounded-full object-cover border border-outline-variant/30"><span class="font-bold text-sm text-on-surface">${safeP}</span></div>
                                            <div class="flex gap-2">${commendBtnHtml}${rateBtnHtml}</div>
                                        </div>`;
                                }).join('');
                            }
                        }

                        postGameDashboardHtml += `
                            <div class="bg-[#14171d] p-5 md:p-6 rounded-3xl border border-secondary/30 shadow-lg mb-6">
                                <div class="flex justify-between items-end mb-4 border-b border-outline-variant/10 pb-4">
                                    <div><h3 class="font-headline text-xl font-black uppercase tracking-tighter text-secondary flex items-center gap-2 mb-1"><span class="material-symbols-outlined">star_rate</span> Rate Players</h3></div>
                                </div>
                                <div class="space-y-3">${rateListHtml}</div>
                            </div>`;
                    }
                }
            }

            let rosterSectionHtml = '';
            if (isSquadMatch && squad1Data && squad2Data) {
                const sq1Users = await fetchUsersByUids(squad1Data.members);
                const sq2Users = await fetchUsersByUids(squad2Data.members);
                const posMap = { 'PG': 'Point Guard', 'SG': 'Shooting Guard', 'SF': 'Small Forward', 'PF': 'Power Forward', 'C': 'Center' };

                const buildSquadRoster = (squad, users, label, labelColor) => {
                    let teamPlayers = users.filter(u => players.includes(u.displayName) || players.includes(u.uid));
                    if (!teamPlayers.find(u => u.uid === squad.captainId)) {
                        const capt = users.find(u => u.uid === squad.captainId);
                        if (capt) teamPlayers.unshift(capt);
                    }

                    const canManage = (currentUser && currentUser.uid === squad.captainId) && gameStatus === 'Upcoming';
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
                                </div>
                            </div>
                            <div class="space-y-2 flex-1">
                    `;

                    teamPlayers.forEach(u => {
                        const safeName = escapeHTML(u.displayName || 'Unknown');
                        const photoUrl = escapeHTML(u.photoURL) || getFallbackAvatar(safeName);
                        html += `
                            <div class="flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface-container-highest transition-colors cursor-pointer group border border-transparent hover:border-outline-variant/10" onclick="window.location.href='profile.html?id=${u.uid}'">
                                <img src="${photoUrl}" onerror="this.onerror=null; this.src='${getFallbackAvatar(safeName)}';" class="w-10 h-10 rounded-full object-cover border border-outline-variant/30 bg-surface-container shrink-0">
                                <div class="min-w-0 flex-1">
                                    <p class="font-bold text-sm text-on-surface break-words group-hover:text-primary transition-colors leading-tight">${safeName}</p>
                                    <div class="flex items-center gap-2 mt-1">
                                        ${(u.uid === squad.captainId) ? `<span class="bg-primary/20 text-primary px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest">CAPTAIN</span>` : ''}
                                        <span class="text-[9px] text-outline-variant font-medium truncate">${posMap[u.primaryPosition || 'Unassigned'] || (u.primaryPosition || 'Unassigned')}</span>
                                    </div>
                                </div>
                            </div>`;
                    });

                    const emptySlotsCount = Math.max(0, 5 - teamPlayers.length);
                    for (let i = 0; i < emptySlotsCount; i++) {
                        const hostStyles = canManage ? 'cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all group' : 'opacity-50';
                        html += `
                            <div class="flex items-center gap-3 p-2.5 rounded-xl border border-outline-variant/20 border-dashed ${hostStyles}" ${canManage ? `onclick="window.openSquadInviteModal('${squad.id}')"` : ''}>
                                <div class="w-10 h-10 rounded-full border border-outline-variant/30 border-dashed flex items-center justify-center bg-surface-container shrink-0 ${canManage ? 'group-hover:border-primary/50 group-hover:bg-primary/10 transition-colors' : ''}">
                                    <span class="material-symbols-outlined text-[18px] ${canManage ? 'group-hover:text-primary text-outline-variant' : 'text-outline-variant'}">person_add</span>
                                </div>
                                <div class="min-w-0 flex-1">
                                    <p class="font-bold text-sm text-outline-variant truncate ${canManage ? 'group-hover:text-primary transition-colors' : ''}">Open Slot</p>
                                </div>
                            </div>`;
                    }
                    return html + `</div></div>`;
                };

                rosterSectionHtml = `
                    <div class="bg-[#0f141a] border border-outline-variant/5 rounded-3xl p-5 md:p-6 flex flex-col">
                        <div class="flex justify-between items-end mb-6 border-b border-outline-variant/10 pb-4">
                            <h2 class="font-headline text-2xl font-black italic uppercase tracking-tighter text-on-surface">SQUAD MATCHUP</h2>
                            <span class="text-[10px] text-outline font-bold uppercase tracking-widest bg-surface-container-highest px-3 py-1 rounded-full">5V5 THROWDOWN</span>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                            ${buildSquadRoster(squad1Data, sq1Users, 'Challenged', 'primary')}
                            ${buildSquadRoster(squad2Data, sq2Users, 'Challenger', 'error')}
                        </div>
                    </div>`;
            } else {
                rosterSectionHtml = `
                    <div class="bg-[#0f141a] border border-outline-variant/5 rounded-3xl p-5 md:p-6 flex flex-col">
                        <div class="flex justify-between items-end mb-6 border-b border-outline-variant/10 pb-4">
                            <h2 class="font-headline text-2xl font-black italic uppercase tracking-tighter text-on-surface">THE ROSTER</h2>
                            <span class="text-[10px] text-outline font-bold uppercase tracking-widest bg-surface-container-highest px-3 py-1 rounded-full">${spotsFilled} / ${spotsTotal} PLAYERS</span>
                        </div>
                        <div class="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 flex-1 content-start" id="roster-container"></div>
                    </div>`;
            }

            mainContainer.classList.remove('animate-pulse');

            mainContainer.innerHTML = `
                <div class="lg:col-span-8 space-y-4 md:space-y-6">
                    <div class="relative w-full h-[300px] md:h-[420px] bg-surface-container-high rounded-3xl overflow-hidden border border-outline-variant/10 shadow-lg group">
                        <img src="${displayImage}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 cursor-pointer" onclick="${game.imageUrl ? `window.openImageModal('${displayImage}')` : ''}">
                        <div class="absolute inset-0 bg-gradient-to-t from-[#0a0e14] via-[#0a0e14]/60 to-transparent pointer-events-none"></div>
                        ${manageGameHtml}
                        <div class="absolute bottom-6 left-6 md:bottom-10 md:left-10 z-10 pointer-events-none pr-6">
                            <h1 class="font-headline text-4xl md:text-6xl font-black italic uppercase tracking-tighter text-on-surface leading-[0.9] mb-3 drop-shadow-lg break-words">${safeTitle}</h1>
                            <div class="text-on-surface-variant text-xs md:text-sm font-medium tracking-wide flex items-center gap-2">
                                <span class="uppercase tracking-widest text-[10px] font-bold text-outline">ORGANIZER:</span>
                                <span class="text-primary font-black text-sm md:text-base">${safeHost}</span>
                            </div>
                        </div>
                    </div>

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
                        ${claimHtml} ${adminOverrideHtml} ${postGameDashboardHtml} ${rosterSectionHtml}
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
                        <div class="bg-[#14171d] p-4 md:p-5 rounded-2xl border border-outline-variant/10 shadow-sm flex flex-col justify-center cursor-pointer hover:border-primary/50 transition-colors group" onclick="window.open('${finalMapLinkUrl}', '_blank')">
                            <span class="material-symbols-outlined text-primary mb-2 md:mb-3 text-[22px] group-hover:scale-110 transition-transform">map_search</span>
                            <p class="text-[9px] md:text-[10px] text-outline font-bold uppercase tracking-widest mb-1">MAP LINK</p>
                            <p class="font-headline font-black text-primary text-sm md:text-base truncate">Open Map App</p>
                        </div>
                    </div>
                    <div class="bg-[#14171d] p-5 md:p-6 rounded-2xl border border-outline-variant/10 shadow-sm flex items-center gap-5">
                        <div class="w-12 h-12 bg-secondary/10 text-secondary rounded-xl flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-[24px]">trending_up</span></div>
                        <div><p class="text-[9px] md:text-[10px] text-outline font-bold uppercase tracking-widest mb-1">SKILL LEVEL</p><p class="font-headline font-black text-on-surface text-base md:text-lg truncate">${safeSkill}</p></div>
                    </div>
                    ${waitlistHtml}
                </div>
            `;

            if (!isSquadMatch && squad1Data === null && squad2Data === null) {
                const rosterContainer = document.getElementById('roster-container');
                const sortedPlayers = [...players].sort((a, b) => { if (a === game.host) return -1; if (b === game.host) return 1; return 0; });

                sortedPlayers.forEach((playerName) => {
                    if (!playerName || typeof playerName !== 'string') return;
                    const isGameHost = playerName === game.host;
                    const isReserved = playerName.startsWith("Reserved Slot");
                    const safeName = escapeHTML(playerName);
                    
                    if (isReserved) {
                        const canManage = isHost && gameStatus === 'Upcoming';
                        rosterContainer.innerHTML += `
                            <div class="bg-[#14171d] rounded-2xl p-4 flex flex-col items-center justify-center border border-outline-variant/10 text-center gap-2 shadow-sm ${canManage ? 'cursor-pointer hover:border-primary/50 hover:text-primary transition-colors group' : 'opacity-70'}" ${canManage ? `onclick="window.openManageSlotModal('reserved', '${safeName}')"` : ''}>
                                <div class="w-14 h-14 md:w-16 md:h-16 rounded-xl bg-surface-variant flex items-center justify-center border border-outline-variant/20 overflow-hidden"><span class="material-symbols-outlined text-outline-variant">lock</span></div>
                                <div class="w-full"><p class="font-bold text-[13px] md:text-sm text-on-surface uppercase truncate w-full" title="${safeName}">${safeName}</p></div>
                            </div>`;
                    } else {
                        const pUid = playerProfiles[playerName]?.uid;
                        const finalPhotoUrl = (pUid ? escapeHTML(playerProfiles[playerName].photoURL || '') : '') || getFallbackAvatar(playerName);
                        const kickBtnHtml = (isHost && !isGameHost && gameStatus === 'Upcoming') ? `<button onclick="event.stopPropagation(); window.kickGamePlayer('${safeName}')" class="absolute top-2 right-2 bg-error/10 text-error hover:bg-error hover:text-white p-1 rounded-full transition-colors z-20 shadow-sm border border-error/20" title="Remove Player"><span class="material-symbols-outlined text-[14px]">person_remove</span></button>` : '';

                        rosterContainer.innerHTML += `
                            <div class="bg-[#14171d] rounded-2xl p-4 flex flex-col items-center justify-center border border-outline-variant/10 text-center gap-2 shadow-sm relative ${pUid ? 'cursor-pointer hover:border-primary/50 transition-colors group' : ''}" ${pUid ? `onclick="window.location.href='profile.html?id=${pUid}'"` : ''}>
                                ${kickBtnHtml}
                                <div class="w-14 h-14 md:w-16 md:h-16 rounded-xl flex items-center justify-center border border-outline-variant/20 overflow-hidden bg-surface-container transition-all"><img src="${finalPhotoUrl}" onerror="this.onerror=null; this.src='${getFallbackAvatar(playerName)}';" class="w-full h-full object-cover"></div>
                                <div class="w-full"><p class="font-bold text-[13px] md:text-sm text-on-surface break-words leading-tight w-full">${safeName}</p><p class="text-[8px] md:text-[9px] ${isGameHost ? 'text-primary' : 'text-outline-variant'} uppercase font-black tracking-widest mt-0.5 truncate">${isGameHost ? 'CAPTAIN' : 'PLAYER'}</p></div>
                            </div>`;
                    }
                });

                const canManageOpen = isHost && gameStatus === 'Upcoming';
                const remainingSpots = spotsTotal - spotsFilled;
                
                for (let i = 0; i < remainingSpots; i++) {
                    rosterContainer.innerHTML += `
                        <div class="bg-[#14171d]/40 rounded-2xl p-4 flex flex-col items-center justify-center border border-outline-variant/10 border-dashed text-center gap-2 opacity-60 ${canManageOpen ? 'cursor-pointer hover:border-primary/50 hover:text-primary transition-colors group' : ''}" ${canManageOpen ? `onclick="window.openManageSlotModal('open')"` : ''}>
                            <div class="w-14 h-14 md:w-16 md:h-16 rounded-xl border border-outline-variant/20 border-dashed flex items-center justify-center text-outline-variant bg-[#0a0e14]/50 transition-all"><span class="material-symbols-outlined text-[20px] ${canManageOpen ? '' : 'text-outline-variant'}">person_add</span></div>
                            <div class="w-full"><p class="font-bold text-[13px] md:text-sm text-outline-variant uppercase truncate w-full">Open Slot</p></div>
                        </div>`;
                }
            }
        } catch (error) {
            console.error("Rendering Error Details:", error);
            const mainContainer = document.getElementById('game-details-main');
            if (mainContainer) {
                mainContainer.classList.remove('animate-pulse');
                mainContainer.innerHTML = `<div class="text-center py-20 lg:col-span-12 bg-surface-container-low rounded-3xl border border-error/30 mt-10 shadow-lg"><span class="material-symbols-outlined text-6xl text-error mb-4">error</span><h2 class="text-2xl font-black uppercase tracking-widest text-on-surface">Data Sync Failed</h2></div>`;
            }
        }
    }

    // Modal & Window functions
    window.openManageSlotModal = function(type, slotName = null) {
        currentSlotTarget = slotName;
        const modal = document.getElementById('manage-slot-modal');
        const title = document.getElementById('manage-slot-title');
        const reserveBtn = document.getElementById('reserve-slot-btn');
        const removeBtn = document.getElementById('remove-reserve-btn');

        if (type === 'open') {
            title.textContent = 'Manage Open Slot';
            reserveBtn.classList.remove('hidden'); removeBtn.classList.add('hidden');
        } else {
            title.textContent = 'Manage Reserved Slot';
            reserveBtn.classList.add('hidden'); removeBtn.classList.remove('hidden');
        }
        modal.classList.remove('hidden'); modal.classList.add('flex');
        setTimeout(() => { modal.classList.remove('opacity-0'); modal.querySelector('div').classList.remove('scale-95'); modal.querySelector('div').classList.add('scale-100'); }, 10);
    }

    window.openSquadInviteModal = async function(squadId) {
        const inviteModal = document.getElementById('invite-list-modal');
        const listContainer = document.getElementById('invite-list-container');
        if(!inviteModal || !listContainer) return;
        
        inviteModal.classList.remove('hidden'); inviteModal.classList.add('flex');
        setTimeout(() => { inviteModal.classList.remove('opacity-0'); inviteModal.querySelector('div').classList.remove('scale-95'); inviteModal.querySelector('div').classList.add('scale-100'); }, 10);
        listContainer.innerHTML = '<div class="text-center py-8 opacity-50"><span class="material-symbols-outlined animate-spin text-4xl text-primary mb-2">refresh</span><p class="text-xs font-bold uppercase tracking-widest">Loading Roster...</p></div>';

        try {
            const squadSnap = await getDoc(doc(db, "squads", squadId));
            if (!squadSnap.exists()) throw new Error("Squad not found");
            const memberUids = squadSnap.data().members || [];
            if (memberUids.length === 0) { listContainer.innerHTML = '<p class="text-center text-sm text-on-surface-variant py-8 italic">No members in squad.</p>'; return; }

            const userSnaps = await Promise.all(memberUids.map(uid => getDoc(doc(db, "users", uid))));
            const squadMembers = userSnaps.filter(s => s.exists()).map(s => ({ id: s.id, ...s.data() }));

            const inviteSnaps = await getDocs(query(collection(db, "notifications"), where("type", "==", "game_invite")));
            const invitedUserIds = [];
            inviteSnaps.forEach(d => { if (d.data().targetId === gameId) invitedUserIds.push(d.data().recipientId); });

            listContainer.innerHTML = '';
            const eligibleMembers = squadMembers.filter(user => {
                return !(Array.isArray(currentGameData.players) && (currentGameData.players.includes(user.displayName) || currentGameData.players.includes(user.id))); 
            });

            if (eligibleMembers.length === 0) {
                listContainer.innerHTML = '<div class="flex flex-col items-center justify-center py-10 opacity-60"><span class="material-symbols-outlined text-4xl mb-2">check_circle</span><p class="text-sm font-bold uppercase tracking-widest">All squad members are in!</p></div>';
                return;
            }

            eligibleMembers.forEach(user => {
                const safeName = escapeHTML(user.displayName || 'Unknown');
                const photoUrl = escapeHTML(user.photoURL) || getFallbackAvatar(safeName);
                const isInvited = invitedUserIds.includes(user.id);
                let actionHtml = isInvited ? `<span class="text-[10px] text-primary font-bold uppercase shrink-0 px-2 py-1 bg-primary/10 rounded border border-primary/20">Invited</span>` : `<button onclick="window.sendGameInvite('${user.id}', '${safeName}')" class="bg-primary hover:brightness-110 text-on-primary-container shadow-md px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shrink-0">Send Invite</button>`;

                listContainer.innerHTML += `
                    <div class="flex items-center gap-4 p-3 bg-surface-container-highest rounded-xl border border-outline-variant/10">
                        <img src="${photoUrl}" onerror="this.onerror=null; this.src='${getFallbackAvatar(safeName)}';" class="w-12 h-12 rounded-full object-cover border border-outline-variant/30 shrink-0 bg-surface-container">
                        <div class="flex-1 min-w-0"><p class="font-bold text-sm text-on-surface truncate">${safeName}</p><p class="text-[10px] text-primary uppercase font-black tracking-widest mt-0.5">${escapeHTML(user.primaryPosition || 'Unassigned')}</p></div>
                        ${actionHtml}
                    </div>`;
            });
        } catch (e) { listContainer.innerHTML = '<p class="text-center text-error text-sm py-4">Failed to load squad members.</p>'; }
    };

    document.getElementById('close-invite-list-modal')?.addEventListener('click', () => {
        const modal = document.getElementById('invite-list-modal');
        modal.classList.add('opacity-0'); modal.querySelector('div').classList.remove('scale-100'); modal.querySelector('div').classList.add('scale-95');
        setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('flex'); }, 300);
    });

    window.sendGameInvite = async function(targetUserId, targetUserName) {
        try {
            const gameRef = doc(db, "games", gameId);
            const gameSnap = await getDoc(gameRef);
            if (!gameSnap.exists()) return;
            const gameInfo = gameSnap.data();

            if (Array.isArray(gameInfo.players) && gameInfo.players.includes(targetUserName)) return alert("Player is already in the game.");

            if (Array.isArray(gameInfo.applicants) && gameInfo.applicants.includes(targetUserName)) {
                if(!confirm(`Accept ${targetUserName}'s request to join?`)) return;
                if (gameInfo.spotsFilled >= gameInfo.spotsTotal) return alert("Game is full!");
                
                await updateDoc(gameRef, { applicants: arrayRemove(targetUserName), players: arrayUnion(targetUserName), spotsFilled: gameInfo.spotsFilled + 1 });
                await addDoc(collection(db, "notifications"), {
                    recipientId: targetUserId, actorId: currentUser.uid, actorName: currentUser.displayName || "Someone", actorPhoto: currentUser.photoURL || null,
                    type: 'game_join', targetId: gameId, message: `accepted your request to join ${gameInfo.title}`, link: `game-details.html?id=${gameId}`, read: false, createdAt: serverTimestamp()
                });
                
                alert(`${targetUserName} was added to the game!`);
                document.getElementById('close-invite-list-modal').click();
                loadGameDetails();
                return;
            }

            if(!confirm(`Send game invite to ${targetUserName}?`)) return;
            
            const existingInvites = await getDocs(query(collection(db, "notifications"), where("recipientId", "==", targetUserId)));
            let alreadyInvited = false;
            existingInvites.forEach(d => { if (d.data().targetId === gameId && d.data().type === "game_invite") alreadyInvited = true; });
            
            if (alreadyInvited) {
                alert("An invite has already been sent to this player.");
                document.getElementById('close-invite-list-modal').click();
                return;
            }

            await addDoc(collection(db, "notifications"), {
                recipientId: targetUserId, actorId: currentUser.uid, actorName: currentUser.displayName || "Someone", actorPhoto: currentUser.photoURL || null,
                type: 'game_invite', targetId: gameId, message: `invited you to join the game: ${gameInfo.title}`, link: `game-details.html?id=${gameId}`, read: false, createdAt: serverTimestamp()
            });
            alert("Invite sent!");
            document.getElementById('close-invite-list-modal').click();
        } catch(e) { alert("Failed to send invite: " + e.message); }
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
            t.disabled = true; t.classList.add('opacity-50', 'cursor-not-allowed');
        }

        const modal = document.getElementById('manage-game-modal');
        modal.classList.remove('hidden'); modal.classList.add('flex');
        setTimeout(() => { modal.classList.remove('opacity-0'); modal.querySelector('div').classList.remove('scale-95'); }, 10);
    };

    document.getElementById('close-manage-game-modal')?.addEventListener('click', () => {
        const modal = document.getElementById('manage-game-modal');
        modal.classList.add('opacity-0'); modal.querySelector('div').classList.add('scale-95');
        setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('flex'); }, 300);
    });

    const manageForm = document.getElementById('manage-game-form');
    if (manageForm) {
        manageForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('submit-manage-game-btn');
            btn.disabled = true; btn.innerHTML = `<span class="material-symbols-outlined animate-spin">refresh</span> SAVING...`;

            try {
                const payload = {
                    date: document.getElementById('manage-game-date').value, time: document.getElementById('manage-game-time').value,
                    location: document.getElementById('manage-game-location').value, description: document.getElementById('manage-game-desc').value
                };
                if (!isSquadMatch) payload.title = document.getElementById('manage-game-title').value;

                await updateDoc(doc(db, "games", gameId), payload);
                document.getElementById('close-manage-game-modal').click();
                await loadGameDetails();
            } catch(e) { alert("Failed to update game details: " + e.message); } 
            finally { btn.disabled = false; btn.innerHTML = `<span class="material-symbols-outlined">save</span> Save Changes`; }
        });
    }

    window.deleteGame = async function() {
        if (!confirm("DANGER: Are you sure you want to permanently delete this game? This cannot be undone.")) return;
        try { await deleteDoc(doc(db, "games", gameId)); window.location.href = "home.html"; } catch(e) { alert("Failed to delete game: " + e.message); }
    };

    window.adminForceCancelGame = async function(gid) {
        if (!confirm("ADMIN ACTION: Are you sure you want to force-cancel this game? This will delete it permanently.")) return;
        try { await deleteDoc(doc(db, "games", gid)); alert("Game successfully removed by Admin."); window.location.replace("listings.html"); } catch(e) { alert("Failed to delete game: " + e.message); }
    };
});
