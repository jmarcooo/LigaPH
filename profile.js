import { auth, db, storage } from './firebase-setup.js';
import { doc, getDoc, setDoc, collection, query, where, getDocs, addDoc, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";

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
    if (!timeString) return '';
    try {
        let [hours, minutes] = timeString.split(':');
        let h = parseInt(hours, 10);
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12;
        h = h ? h : 12; 
        return `${h}:${minutes} ${ampm}`;
    } catch(e) { return timeString; }
}

function formatDateString(dateString) {
    try {
        const date = new Date(dateString);
        if (isNaN(date)) return dateString;
        return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    } catch(e) { return dateString; }
}

async function initProfilePage(currentUser) {
    const urlParams = new URLSearchParams(window.location.search);
    const targetId = urlParams.get('id');
    const isOwnProfile = !targetId || (currentUser && targetId === currentUser.uid);
    const finalUserId = targetId || (currentUser ? currentUser.uid : null);

    if (!finalUserId) return window.location.href = 'index.html';

    const manageBtn = document.getElementById('manage-profile-btn');
    const connectBtn = document.getElementById('connect-player-btn');

    if (isOwnProfile) {
        if (manageBtn) manageBtn.classList.remove('hidden');
    } else {
        if (connectBtn && currentUser) connectBtn.classList.remove('hidden');
    }

    try {
        const docRef = doc(db, "users", finalUserId);
        const docSnap = await getDoc(docRef);
        let profileData = {};

        if (docSnap.exists()) {
            profileData = docSnap.data();
        } else if (isOwnProfile && currentUser) {
            let fallbackName = currentUser.displayName;
            profileData = {
                displayName: fallbackName || "Unknown Player",
                primaryPosition: "UNASSIGNED",
                homeCourt: "Unknown Court",
                skillLevel: "Unranked",
                bio: "Ready to play.",
                photoURL: currentUser.photoURL || null,
                selfRatings: { shooting: 3, passing: 3, dribbling: 3, rebounding: 3, defense: 3 },
                gamesAttended: 0,
                gamesMissed: 0
            };
            await setDoc(docRef, profileData);
        } else {
            alert("Player not found.");
            return window.location.href = 'players.html';
        }

        let liveSquadAbbr = profileData.squadAbbr || null;
        let liveSquadId = profileData.squadId || null;
        
        try {
            const captQ = query(collection(db, "squads"), where("captainId", "==", finalUserId));
            const captSnap = await getDocs(captQ);
            
            const memQ = query(collection(db, "squads"), where("members", "array-contains", finalUserId));
            const memSnap = await getDocs(memQ);

            if (!captSnap.empty) {
                const sqDoc = captSnap.docs[0];
                liveSquadAbbr = sqDoc.data().abbreviation;
                liveSquadId = sqDoc.id;
            } else if (!memSnap.empty) {
                const sqDoc = memSnap.docs[0];
                liveSquadAbbr = sqDoc.data().abbreviation;
                liveSquadId = sqDoc.id;
            }
        } catch(e) {
            console.error("Failed to fetch live squad data", e);
        }

        const nameEl = document.getElementById('profile-name');
        let displayNameText = profileData.displayName || "Unknown Player";
        
        const squadTag = document.getElementById('profile-squad-tag');
        if (liveSquadAbbr && squadTag) {
            squadTag.innerHTML = `[${escapeHTML(liveSquadAbbr)}] <span class="material-symbols-outlined text-[14px] align-text-bottom">open_in_new</span>`;
            squadTag.classList.remove('hidden');
            squadTag.classList.add('cursor-pointer', 'hover:border-primary/50', 'hover:text-primary-container', 'transition-colors');
            if (liveSquadId) {
                squadTag.onclick = () => window.location.href = `squad-details.html?id=${liveSquadId}`;
            }
        } else if (squadTag) {
            squadTag.classList.add('hidden');
        }

        // --- BADGES CALCULATION ---
        try {
            const usersSnap = await getDocs(collection(db, "users"));
            let allPlayers = [];
            usersSnap.forEach(d => { allPlayers.push({ id: d.id, ...d.data() }); });
            
            allPlayers.forEach(p => {
                const attended = p.gamesAttended || 0;
                const missed = p.gamesMissed || 0;
                const totalGames = attended + missed;
                const reliability = totalGames === 0 ? 50 : Math.round((attended / totalGames) * 100);
                let statsAvg = 0;
                if (p.selfRatings) {
                    const sr = p.selfRatings;
                    const total = (sr.shooting || 0) + (sr.passing || 0) + (sr.dribbling || 0) + (sr.rebounding || 0) + (sr.defense || 0);
                    statsAvg = total / 5;
                }
                p.score = (reliability * 0.6) + ((statsAvg * 20) * 0.4);
            });

            allPlayers.sort((a, b) => b.score - a.score);
            const globalRank = allPlayers.findIndex(p => p.id === finalUserId) + 1;
            
            let cityRank = null;
            if (profileData.location) {
                const cityPlayers = allPlayers.filter(p => p.location === profileData.location);
                cityRank = cityPlayers.findIndex(p => p.id === finalUserId) + 1;
            }

            const badgesContainer = document.getElementById('profile-badges');
            if (badgesContainer) {
                badgesContainer.innerHTML = '';
                if (globalRank > 0 && globalRank <= 10) {
                    badgesContainer.innerHTML += `<span class="bg-primary/20 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest shadow-sm">Overall Rank #${globalRank}</span>`;
                }
                if (cityRank > 0 && cityRank <= 5 && profileData.location) {
                    badgesContainer.innerHTML += `<span class="bg-secondary/20 text-secondary border border-secondary/20 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest shadow-sm">${escapeHTML(profileData.location)} #${cityRank}</span>`;
                }
            }
        } catch(e) { console.error("Failed to load badges", e); }
        // --------------------------

        nameEl.textContent = displayNameText;
        nameEl.classList.remove('animate-pulse', 'bg-surface-container-highest', 'bg-surface-container-high', 'rounded-md', 'min-h-[3rem]', 'min-w-[200px]', 'inline-block');
        
        const bioEl = document.getElementById('profile-bio');
        bioEl.textContent = profileData.bio || "No bio available.";
        bioEl.classList.remove('animate-pulse', 'bg-surface-container-highest', 'bg-surface-container-high', 'rounded-md', 'min-h-[2rem]', 'min-h-[3rem]', 'min-h-[4rem]');
        
        const courtEl = document.getElementById('profile-home-court');
        if (courtEl) {
            courtEl.textContent = (profileData.homeCourt || "UNKNOWN COURT").toUpperCase();
            courtEl.classList.remove('animate-pulse', 'min-w-[80px]', 'min-w-[120px]', 'min-h-[24px]', 'min-h-[28px]');
        }

        const posMap = { 'PG':'POINT GUARD', 'SG':'SHOOTING GUARD', 'SF':'SMALL FORWARD', 'PF':'POWER FORWARD', 'C':'CENTER' };
        const posEl = document.getElementById('profile-position');
        if (posEl) {
            posEl.textContent = posMap[profileData.primaryPosition || "UNASSIGNED"] || (profileData.primaryPosition || "UNASSIGNED");
            posEl.classList.remove('animate-pulse', 'min-w-[80px]', 'min-w-[100px]', 'min-h-[24px]', 'min-h-[28px]');
        }

        const skillEl = document.getElementById('profile-skill');
        if (skillEl) {
            skillEl.textContent = (profileData.skillLevel || "UNRANKED").toUpperCase();
            skillEl.classList.remove('animate-pulse', 'min-w-[80px]', 'min-w-[100px]', 'min-h-[24px]', 'min-h-[28px]');
        }

        const avatarImg = document.getElementById('profile-avatar');
        if (avatarImg) {
            document.getElementById('profile-avatar-container').classList.remove('animate-pulse', 'bg-surface-container-highest');
            
            const photoUrl = profileData.photoURL || getFallbackAvatar(profileData.displayName);
            avatarImg.src = photoUrl;
            
            avatarImg.onerror = function() {
                this.onerror = null;
                this.src = getFallbackAvatar(profileData.displayName);
            };

            avatarImg.classList.remove('mix-blend-luminosity', 'opacity-80');
            avatarImg.style.filter = '';
            avatarImg.classList.remove('hidden');
        }

        loadPlayerStats(finalUserId, profileData);
        setupConnectionsModal(finalUserId);
        
        if (!isOwnProfile && currentUser) {
            setupConnectionAction(finalUserId, currentUser);
        }

        renderSkillBars('self-skill-breakdown', profileData.selfRatings || { shooting: 0, passing: 0, dribbling: 0, rebounding: 0, defense: 0 }, 1, ['shooting', 'passing', 'dribbling', 'rebounding', 'defense']);
        
        loadUserActiveGames(profileData.displayName);
        loadUserPosts(finalUserId);
        setupCharacterPropsModal(finalUserId);
        setupSkillRatings(finalUserId, currentUser, profileData.displayName);

    } catch (e) {
        console.error("Failed to load profile", e);
    }
}

async function setupConnectionAction(targetUserId, currentUser) {
    const connectBtn = document.getElementById('connect-player-btn');
    if (!connectBtn || !currentUser || targetUserId === currentUser.uid) return;

    const btnText = document.getElementById('connect-btn-text');
    const btnIcon = document.getElementById('connect-btn-icon');

    try {
        const connRef = collection(db, "connections");
        const q1 = query(connRef, where("requesterId", "==", currentUser.uid), where("receiverId", "==", targetUserId));
        const q2 = query(connRef, where("requesterId", "==", targetUserId), where("receiverId", "==", currentUser.uid));
        
        const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
        
        let connDoc = null;
        let isRequester = false;
        
        if (!snap1.empty) {
            connDoc = snap1.docs[0];
            isRequester = true;
        } else if (!snap2.empty) {
            connDoc = snap2.docs[0];
            isRequester = false;
        }

        connectBtn.className = "hidden w-full sm:w-auto bg-[#14171d] border border-outline-variant/30 hover:border-primary/50 px-6 py-3 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm active:scale-95";
        connectBtn.disabled = false;
        connectBtn.onclick = null;
        connectBtn.classList.remove('hidden'); 

        if (connDoc) {
            const data = connDoc.data();
            if (data.status === 'accepted') {
                connectBtn.classList.add('opacity-50', 'cursor-not-allowed');
                btnText.textContent = "Connected";
                btnText.className = "font-headline font-black italic uppercase text-sm text-primary";
                btnIcon.textContent = "handshake";
                btnIcon.className = "material-symbols-outlined text-sm text-primary";
                connectBtn.disabled = true;
            } else if (data.status === 'pending') {
                if (isRequester) {
                    connectBtn.classList.add('opacity-50', 'cursor-not-allowed');
                    btnText.textContent = "Pending";
                    btnIcon.textContent = "schedule";
                    btnText.className = "font-headline font-black italic uppercase text-sm text-outline";
                    btnIcon.className = "material-symbols-outlined text-sm text-outline";
                    connectBtn.disabled = true;
                } else {
                    btnText.textContent = "Accept Invite";
                    btnIcon.textContent = "check_circle";
                    btnText.className = "font-headline font-black italic uppercase text-sm text-primary";
                    btnIcon.className = "material-symbols-outlined text-sm text-primary";
                    
                    connectBtn.onclick = async () => {
                        connectBtn.disabled = true;
                        btnText.textContent = "Accepting...";
                        await updateDoc(doc(db, "connections", connDoc.id), { status: 'accepted', updatedAt: serverTimestamp() });
                        
                        await addDoc(collection(db, "notifications"), {
                            recipientId: targetUserId,
                            actorId: currentUser.uid,
                            actorName: currentUser.displayName || "Someone",
                            actorPhoto: currentUser.photoURL || null,
                            type: 'connection_accepted',
                            message: "accepted your connection request.",
                            link: `profile.html?id=${currentUser.uid}`,
                            read: false,
                            createdAt: serverTimestamp()
                        });
                        
                        setupConnectionAction(targetUserId, currentUser);
                    };
                }
            }
        } else {
            btnText.textContent = "Connect";
            btnIcon.textContent = "person_add";
            btnText.className = "font-headline font-black italic uppercase text-sm text-on-surface";
            btnIcon.className = "material-symbols-outlined text-sm text-on-surface-variant";
            
            connectBtn.onclick = async () => {
                connectBtn.disabled = true;
                btnText.textContent = "Sending...";
                
                await addDoc(collection(db, "connections"), {
                    requesterId: currentUser.uid,
                    receiverId: targetUserId,
                    status: 'pending',
                    createdAt: serverTimestamp()
                });

                await addDoc(collection(db, "notifications"), {
                    recipientId: targetUserId,
                    actorId: currentUser.uid,
                    actorName: currentUser.displayName || "Someone",
                    actorPhoto: currentUser.photoURL || null,
                    type: 'connection_request',
                    message: "sent you a connection request.",
                    link: `profile.html?id=${currentUser.uid}`,
                    read: false,
                    createdAt: serverTimestamp()
                });

                setupConnectionAction(targetUserId, currentUser);
            };
        }
    } catch(e) {
        console.error("Connection setup error:", e);
    }
}

async function loadPlayerStats(targetId, profileData) {
    const attended = profileData.gamesAttended || 0;
    const missed = profileData.gamesMissed || 0;
    const totalGames = attended + missed;
    const reliabilityScore = totalGames === 0 ? 100 : Math.round((attended / totalGames) * 100);

    const gamesPlayedEl = document.getElementById('stat-games-played');
    if (gamesPlayedEl) gamesPlayedEl.textContent = totalGames;

    const relEl = document.getElementById('stat-reliability');
    if (relEl) {
        relEl.textContent = `${reliabilityScore}%`;
        if (reliabilityScore < 75) relEl.classList.replace('text-on-surface', 'text-error');
    }

    try {
        const connRef = collection(db, "connections");
        const [snap1, snap2] = await Promise.all([
            getDocs(query(connRef, where("requesterId", "==", targetId), where("status", "==", "accepted"))),
            getDocs(query(connRef, where("receiverId", "==", targetId), where("status", "==", "accepted")))
        ]);
        const connEl = document.getElementById('stat-connections');
        if (connEl) connEl.textContent = snap1.size + snap2.size;
    } catch (e) {}

    try {
        const snapComm = await getDocs(query(collection(db, "commendations"), where("targetUserId", "==", targetId)));
        const commEl = document.getElementById('stat-commendations');
        if (commEl) commEl.textContent = snapComm.size;
    } catch (e) {}
}

async function fetchConnectionsDetails(targetId) {
    const connRef = collection(db, "connections");
    const [snap1, snap2] = await Promise.all([
        getDocs(query(connRef, where("requesterId", "==", targetId), where("status", "==", "accepted"))),
        getDocs(query(connRef, where("receiverId", "==", targetId), where("status", "==", "accepted")))
    ]);

    const connectionUids = [];
    snap1.forEach(doc => connectionUids.push(doc.data().receiverId));
    snap2.forEach(doc => connectionUids.push(doc.data().requesterId));

    const uniqueUids = [...new Set(connectionUids)];
    if (uniqueUids.length === 0) return [];

    const userPromises = uniqueUids.map(uid => getDoc(doc(db, "users", uid)));
    const userSnaps = await Promise.all(userPromises);
    return userSnaps.filter(snap => snap.exists()).map(snap => ({ id: snap.id, ...snap.data() }));
}

function setupConnectionsModal(targetId) {
    const statBox = document.getElementById('connections-stat-box');
    const modal = document.getElementById('connections-modal');
    const closeBtn = document.getElementById('close-connections-modal');
    const listContainer = document.getElementById('connections-list-container');

    if (!statBox || !modal) return;

    statBox.addEventListener('click', async () => {
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            modal.querySelector('div').classList.remove('scale-95');
        }, 10);

        listContainer.innerHTML = `
            <div class="flex flex-col justify-center items-center py-8 opacity-50">
                <span class="material-symbols-outlined animate-spin text-4xl text-primary mb-2">refresh</span>
                <p class="text-xs font-bold uppercase tracking-widest text-outline">Loading</p>
            </div>
        `;

        try {
            const connections = await fetchConnectionsDetails(targetId);
            listContainer.innerHTML = '';

            if (connections.length === 0) {
                listContainer.innerHTML = '<p class="text-center text-sm text-on-surface-variant py-8 italic">No connections found.</p>';
                return;
            }

            connections.forEach(user => {
                const safeName = escapeHTML(user.displayName || 'Unknown');
                const photoUrl = escapeHTML(user.photoURL) || getFallbackAvatar(safeName);
                
                listContainer.innerHTML += `
                    <div class="flex items-center gap-4 p-3 bg-surface-container-highest rounded-xl border border-outline-variant/10 cursor-pointer hover:border-primary/50 hover:bg-surface-bright transition-all" onclick="window.location.href='profile.html?id=${user.id}'">
                        <img src="${photoUrl}" onerror="this.onerror=null; this.src='${getFallbackAvatar(safeName)}';" class="w-12 h-12 rounded-full object-cover border border-outline-variant/30 shrink-0 bg-surface-container">
                        <div class="flex-1 min-w-0">
                            <p class="font-bold text-sm text-on-surface truncate">${safeName}</p>
                            <p class="text-[10px] text-primary uppercase font-black tracking-widest">${escapeHTML(user.primaryPosition || 'Unassigned')}</p>
                        </div>
                        <span class="material-symbols-outlined text-outline-variant text-sm">chevron_right</span>
                    </div>
                `;
            });
        } catch (e) {
            listContainer.innerHTML = '<p class="text-center text-error text-sm py-4">Failed to load connections.</p>';
        }
    });

    closeBtn.addEventListener('click', () => {
        modal.classList.add('opacity-0');
        modal.querySelector('div').classList.add('scale-95');
        setTimeout(() => modal.classList.add('hidden'), 300);
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeBtn.click();
    });
}

function renderSkillBars(containerId, dataObject, countDivider, skillsArray) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (countDivider === 0) {
        container.innerHTML = '<div class="flex-1 flex items-center justify-center min-h-[150px]"><p class="text-sm text-outline-variant font-bold uppercase tracking-widest">No ratings yet</p></div>';
        return;
    }

    container.innerHTML = '';
    
    skillsArray.forEach(skill => {
        const avg = (dataObject[skill] || 0) / countDivider;
        const percentage = (avg / 5) * 100;
        
        const isOrange = skill === 'shooting' || skill === 'dribbling' || skill === 'defense' || skill === 'sportsmanship';
        const colorClass = isOrange ? 'bg-primary' : 'bg-secondary';
        const textClass = isOrange ? 'text-primary' : 'text-secondary';
        
        container.innerHTML += `
            <div class="mb-4 last:mb-0">
                <div class="flex justify-between items-center mb-1.5">
                    <span class="text-[10px] font-bold uppercase tracking-widest text-on-surface">${skill}</span>
                    <span class="font-black text-sm ${textClass}">${avg.toFixed(1)}</span>
                </div>
                <div class="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden">
                    <div class="h-full ${colorClass} rounded-full" style="width: ${percentage}%"></div>
                </div>
            </div>
        `;
    });
}

async function setupCharacterPropsModal(targetUserId) {
    const propsBox = document.getElementById('props-stat-box');
    const modal = document.getElementById('ratings-breakdown-modal');
    const closeBtn = document.getElementById('close-ratings-modal');
    const container = document.getElementById('ratings-breakdown-container');

    if (!propsBox || !modal) return;

    let totals = { sportsmanship: 0, attitude: 0, punctuality: 0 };
    let count = 0;

    try {
        const snap = await getDocs(query(collection(db, "ratings"), where("targetUserId", "==", targetUserId)));
        snap.forEach(doc => {
            const data = doc.data();
            ['sportsmanship', 'attitude', 'punctuality'].forEach(s => totals[s] += (data[s] || 0));
            count++;
        });
    } catch (e) {
        console.error("Ratings fetch error:", e);
    }

    propsBox.addEventListener('click', () => {
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            modal.querySelector('div').classList.remove('scale-95');
        }, 10);

        if (count === 0) {
            container.innerHTML = '<div class="flex flex-col items-center justify-center py-8 opacity-50"><span class="material-symbols-outlined text-4xl mb-2">star_half</span><p class="text-xs font-bold uppercase tracking-widest text-outline">No Ratings Yet</p></div>';
            return;
        }

        renderSkillBars('ratings-breakdown-container', totals, count, ['sportsmanship', 'attitude', 'punctuality']);
    });

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.classList.add('opacity-0');
            modal.querySelector('div').classList.add('scale-95');
            setTimeout(() => modal.classList.add('hidden'), 300);
        });
    }

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeBtn.click();
    });
}

async function setupSkillRatings(targetUserId, currentUser, targetUserName) {
    const countBadge = document.getElementById('total-skill-ratings-count');
    const rateBtn = document.getElementById('rate-skills-btn');
    const rateBtnText = document.getElementById('rate-skills-btn-text');
    const modal = document.getElementById('skill-rating-modal');

    let currentInputRatings = { shooting: 0, passing: 0, dribbling: 0, rebounding: 0, defense: 0 };
    let existingRatingId = null;

    try {
        const snap = await getDocs(query(collection(db, "skill_ratings"), where("targetUserId", "==", targetUserId)));
        let totals = { shooting: 0, passing: 0, dribbling: 0, rebounding: 0, defense: 0 };
        let count = 0;

        snap.forEach(docSnap => {
            const data = docSnap.data();
            if (currentUser && data.raterId === currentUser.uid) {
                existingRatingId = docSnap.id;
                currentInputRatings = {
                    shooting: data.shooting || 0,
                    passing: data.passing || 0,
                    dribbling: data.dribbling || 0,
                    rebounding: data.rebounding || 0,
                    defense: data.defense || 0
                };
            }
            ['shooting', 'passing', 'dribbling', 'rebounding', 'defense'].forEach(s => totals[s] += (data[s] || 0));
            count++;
        });

        if (countBadge) countBadge.textContent = `${count} Ratings`;
        renderSkillBars('community-skill-breakdown', totals, count, ['shooting', 'passing', 'dribbling', 'rebounding', 'defense']);

        if (rateBtn && currentUser && targetUserId !== currentUser.uid) {
            rateBtn.classList.remove('hidden');
            if (existingRatingId) {
                rateBtnText.textContent = "Update Rating";
            } else {
                rateBtnText.textContent = "Rate Skills";
            }

            rateBtn.addEventListener('click', () => {
                document.getElementById('skill-rating-target-name').textContent = targetUserName;
                document.getElementById('skill-rating-target-id').value = targetUserId;
                
                const starsContainer = document.getElementById('skill-rating-stars-container');
                starsContainer.innerHTML = '';
                
                ['shooting', 'passing', 'dribbling', 'rebounding', 'defense'].forEach(skill => {
                    starsContainer.innerHTML += `
                        <div class="flex justify-between items-center" data-skill="${skill}">
                            <span class="text-[10px] font-bold uppercase tracking-widest text-on-surface">${skill}</span>
                            <div class="flex gap-1 skill-star-container cursor-pointer text-outline-variant">
                                ${[1,2,3,4,5].map(i => `<span class="material-symbols-outlined text-2xl hover:text-primary transition-colors" data-value="${i}">star</span>`).join('')}
                            </div>
                            <input type="hidden" id="skill-rate-val-${skill}" value="${currentInputRatings[skill]}">
                        </div>
                    `;
                });

                document.querySelectorAll('.skill-star-container').forEach(container => {
                    const skill = container.parentElement.dataset.skill;
                    const stars = container.querySelectorAll('span');
                    const hiddenInput = document.getElementById(`skill-rate-val-${skill}`);

                    const initialVal = currentInputRatings[skill];
                    stars.forEach(s => {
                        if (parseInt(s.dataset.value) <= initialVal) {
                            s.classList.add('text-primary');
                            s.classList.remove('text-outline-variant');
                            s.style.fontVariationSettings = "'FILL' 1";
                        }
                    });

                    stars.forEach(star => {
                        star.addEventListener('click', () => {
                            const val = parseInt(star.dataset.value);
                            hiddenInput.value = val;
                            currentInputRatings[skill] = val;
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

                modal.classList.remove('hidden');
                setTimeout(() => {
                    modal.classList.remove('opacity-0');
                    modal.querySelector('div').classList.remove('scale-95');
                }, 10);
            });
        }

        document.getElementById('close-skill-rating-modal')?.addEventListener('click', () => {
            modal.classList.add('opacity-0');
            modal.querySelector('div').classList.add('scale-95');
            setTimeout(() => modal.classList.add('hidden'), 300);
        });

        const form = document.getElementById('skill-rating-form');
        if (form) {
            form.onsubmit = async (e) => {
                e.preventDefault();
                
                const targetUid = document.getElementById('skill-rating-target-id').value;
                const payload = {
                    targetUserId: targetUid,
                    raterId: currentUser.uid,
                    updatedAt: serverTimestamp()
                };

                let valid = true;
                ['shooting', 'passing', 'dribbling', 'rebounding', 'defense'].forEach(skill => {
                    const val = parseInt(document.getElementById(`skill-rate-val-${skill}`).value);
                    if (val === 0) valid = false;
                    payload[skill] = val;
                });

                if (!valid) return alert("Please rate all 5 skills.");

                const submitBtn = document.getElementById('submit-skill-rating-btn');
                submitBtn.textContent = 'Submitting...';
                submitBtn.disabled = true;

                try {
                    if (existingRatingId) {
                        await updateDoc(doc(db, "skill_ratings", existingRatingId), payload);
                        alert("Skill rating updated successfully!");
                    } else {
                        payload.createdAt = serverTimestamp();
                        await addDoc(collection(db, "skill_ratings"), payload);
                        alert("Skill rating submitted successfully!");
                    }
                    
                    document.getElementById('close-skill-rating-modal').click();
                    setupSkillRatings(targetUserId, currentUser, targetUserName); 
                } catch (err) {
                    console.error("Submit skill rating error:", err);
                    alert("Failed to submit rating.");
                } finally {
                    submitBtn.textContent = 'Submit';
                    submitBtn.disabled = false;
                }
            };
        }
    } catch (e) {
        console.error("Skill Ratings fetch error:", e);
        document.getElementById('community-skill-breakdown').innerHTML = '<p class="text-xs text-error">Failed to load ratings.</p>';
    }
}

function initTabs() {
    const tabGames = document.getElementById('tab-games');
    const tabPosts = document.getElementById('tab-posts');
    const viewGames = document.getElementById('view-games');
    const viewPosts = document.getElementById('view-posts');

    if (tabGames && tabPosts && viewGames && viewPosts) {
        tabGames.addEventListener('click', () => {
            tabGames.classList.add('border-primary', 'text-primary');
            tabGames.classList.remove('border-transparent', 'text-on-surface-variant');
            tabPosts.classList.remove('border-primary', 'text-primary');
            tabPosts.classList.add('border-transparent', 'text-on-surface-variant');
            viewGames.classList.remove('hidden');
            viewPosts.classList.add('hidden');
        });

        tabPosts.addEventListener('click', () => {
            tabPosts.classList.add('border-primary', 'text-primary');
            tabPosts.classList.remove('border-transparent', 'text-on-surface-variant');
            tabGames.classList.remove('border-primary', 'text-primary');
            tabGames.classList.add('border-transparent', 'text-on-surface-variant');
            viewPosts.classList.remove('hidden');
            viewGames.classList.add('hidden');
        });
    }
}

async function loadUserActiveGames(displayName) {
    const container = document.getElementById('profile-games-container');
    if (!container || !displayName) return;

    try {
        const querySnapshot = await getDocs(collection(db, "games"));
        const activeGames = [];
        const now = new Date();

        querySnapshot.forEach(doc => {
            const data = doc.data();
            const isParticipant = data.host === displayName || (data.players && Array.isArray(data.players) && data.players.includes(displayName));
            
            let isUpcoming = true;
            if (data.date && data.time) {
                const gameStart = new Date(`${data.date}T${data.time}`);
                if (!isNaN(gameStart)) {
                    let gameEnd;
                    if (data.endTime) {
                        gameEnd = new Date(`${data.date}T${data.endTime}`);
                        if (gameEnd < gameStart) gameEnd.setDate(gameEnd.getDate() + 1);
                    } else {
                        gameEnd = new Date(gameStart.getTime() + (2 * 60 * 60 * 1000));
                    }
                    if (now > gameEnd) isUpcoming = false;
                }
            }

            if (isParticipant && isUpcoming) {
                activeGames.push({ id: doc.id, ...data });
            }
        });

        activeGames.sort((a, b) => {
            const dateA = new Date(`${a.date || ''}T${a.time || ''}`).getTime();
            const dateB = new Date(`${b.date || ''}T${b.time || ''}`).getTime();
            return dateA - dateB;
        });

        container.innerHTML = '';
        if (activeGames.length === 0) return container.innerHTML = '<span class="block text-on-surface-variant py-8 text-center w-full text-sm italic">No upcoming games scheduled.</span>';

        activeGames.forEach(game => {
            const formattedDate = formatDateString(game.date);
            
            let timeString = formatTime12(game.time);
            if (game.endTime) {
                timeString += ` - ${formatTime12(game.endTime)}`;
            }

            container.innerHTML += `
                <div class="bg-surface-container-low p-5 rounded-xl border border-outline-variant/10 hover:border-primary/30 transition-colors cursor-pointer shadow-sm group" onclick="window.location.href='game-details.html?id=${game.id}'">
                    <h4 class="font-headline text-lg font-black italic uppercase mb-2 truncate text-on-surface group-hover:text-primary transition-colors">${escapeHTML(game.title)}</h4>
                    
                    <div class="flex items-center gap-2 mb-3 text-xs font-bold text-primary uppercase tracking-widest">
                        <span class="material-symbols-outlined text-[14px]">calendar_today</span>
                        <span>${formattedDate} • ${timeString}</span>
                    </div>

                    <div class="flex items-center gap-2 mb-4">
                        <span class="bg-surface-container-highest text-on-surface px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest border border-outline-variant/10">${escapeHTML(game.type)}</span>
                        <span class="bg-surface-container-highest text-on-surface px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest border border-outline-variant/10">${escapeHTML(game.skillLevel || 'Open')}</span>
                    </div>
                    
                    <p class="text-[11px] text-on-surface-variant flex items-center gap-1.5 truncate">
                        <span class="material-symbols-outlined text-[13px]">location_on</span> ${escapeHTML(game.location)}
                    </p>
                </div>`;
        });
    } catch(e) { container.innerHTML = '<span class="text-error block py-4 text-center">Failed to load games.</span>'; }
}

async function loadUserPosts(userId) {
    const container = document.getElementById('profile-posts-container');
    if (!container || !userId) return;

    try {
        const snap = await getDocs(query(collection(db, "posts"), where("authorId", "==", userId)));
        const posts = [];
        snap.forEach(doc => posts.push(doc.data()));
        posts.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));

        container.innerHTML = '';
        if (posts.length === 0) return container.innerHTML = '<span class="block text-on-surface-variant py-8 text-center w-full text-sm italic">No posts yet.</span>';

        posts.forEach(post => {
            const timeStr = post.createdAt ? `${Math.floor((Date.now() - post.createdAt.toMillis()) / 3600000)}h ago` : 'Recently';
            container.innerHTML += `
                <article class="bg-surface-container-low rounded-xl p-5 border border-outline-variant/10 shadow-sm text-left hover:bg-surface-bright transition-colors cursor-pointer">
                    <div class="flex justify-between items-baseline mb-2">
                        <h4 class="font-bold text-sm text-on-surface truncate">${escapeHTML(post.authorName)}</h4>
                        <span class="text-[10px] text-outline font-black uppercase tracking-widest ml-2">${timeStr}</span>
                    </div>
                    <p class="text-sm text-on-surface-variant whitespace-pre-wrap">${escapeHTML(post.content)}</p>
                </article>`;
        });
    } catch (error) {}
}

function uploadAvatarImage(file, uid) {
    return new Promise((resolve, reject) => {
        const safeName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
        const storageRef = ref(storage, `avatars/${uid}_${Date.now()}_${safeName}`);
        
        const uploadTask = uploadBytesResumable(storageRef, file);
        const submitBtn = document.querySelector('#edit-profile-form button[type="submit"]');

        const timer = setTimeout(() => {
            uploadTask.cancel();
            reject(new Error("Upload timed out. Check your internet connection."));
        }, 60000);

        uploadTask.on('state_changed',
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                if(submitBtn) submitBtn.textContent = `UPLOADING AVATAR... ${Math.round(progress)}%`;
            },
            (error) => {
                clearTimeout(timer);
                reject(error);
            },
            async () => {
                clearTimeout(timer);
                try {
                    const url = await getDownloadURL(uploadTask.snapshot.ref);
                    resolve(url);
                } catch (e) {
                    reject(e);
                }
            }
        );
    });
}

async function initEditProfilePage() {
    const docRef = doc(db, "users", auth.currentUser.uid);
    const docSnap = await getDoc(docRef);
    const profile = docSnap.exists() ? docSnap.data() : {};

    const nameInput = document.getElementById('displayName');
    const locationSelect = document.getElementById('edit-location');
    const skillSelect = document.getElementById('edit-skill');
    const positionSelect = document.getElementById('primaryPosition');
    const homeCourtInput = document.getElementById('homeCourt');
    const bioTextarea = document.getElementById('bio');
    const avatarInput = document.getElementById('avatar-input');
    const avatarPreview = document.getElementById('edit-avatar-preview');
    let selectedAvatarFile = null;

    if (nameInput) nameInput.value = profile.displayName || '';
    if (locationSelect) locationSelect.value = profile.location || '';
    if (skillSelect) skillSelect.value = profile.skillLevel || 'Intermediate';
    if (positionSelect) positionSelect.value = profile.primaryPosition || 'UNASSIGNED';
    if (homeCourtInput) homeCourtInput.value = profile.homeCourt || '';
    if (bioTextarea) bioTextarea.value = profile.bio || '';

    const skillsList = ['shooting', 'passing', 'dribbling', 'rebounding', 'defense'];
    let currentSelfRatings = profile.selfRatings || { shooting: 3, passing: 3, dribbling: 3, rebounding: 3, defense: 3 };
    
    skillsList.forEach(skill => {
        const input = document.getElementById(`self-${skill}`);
        const display = document.getElementById(`val-${skill}`);
        if (input && display) {
            input.value = currentSelfRatings[skill];
            display.textContent = currentSelfRatings[skill];
            input.addEventListener('input', (e) => {
                display.textContent = e.target.value;
                currentSelfRatings[skill] = parseInt(e.target.value);
            });
        }
    });

    if (avatarInput && avatarPreview) {
        const safeName = profile.displayName || 'Unknown Player';
        avatarPreview.src = profile.photoURL || getFallbackAvatar(safeName);
        
        avatarPreview.onerror = function() {
            this.onerror = null;
            this.src = getFallbackAvatar(safeName);
        };

        avatarPreview.classList.remove('mix-blend-luminosity', 'opacity-80');
        avatarPreview.style.filter = '';
        
        avatarInput.addEventListener('change', (e) => {
            if (e.target.files[0]) {
                selectedAvatarFile = e.target.files[0];
                avatarPreview.src = URL.createObjectURL(selectedAvatarFile);
            }
        });
    }

    const form = document.getElementById('edit-profile-form');
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.textContent = 'SAVING...';
            submitBtn.disabled = true;

            let photoURL = profile.photoURL || null;

            if (selectedAvatarFile) {
                try {
                    submitBtn.textContent = 'OPTIMIZING IMAGE...';
                    const optimizedBlob = await resizeAndCropImage(selectedAvatarFile, 300);
                    photoURL = await uploadAvatarImage(optimizedBlob, auth.currentUser.uid);
                    submitBtn.textContent = 'SAVING DETAILS...';
                } catch (err) {
                    alert("Failed to upload avatar: " + err.message);
                    submitBtn.textContent = 'Save Changes';
                    submitBtn.disabled = false;
                    return;
                }
            }

            const newData = {
                displayName: nameInput.value,
                location: locationSelect.value,
                skillLevel: skillSelect.value,
                primaryPosition: positionSelect.value,
                homeCourt: homeCourtInput.value,
                bio: bioTextarea.value,
                selfRatings: currentSelfRatings,
                ...(photoURL && { photoURL: photoURL })
            };

            try {
                await updateProfile(auth.currentUser, { displayName: newData.displayName, photoURL: photoURL });
                await setDoc(doc(db, "users", auth.currentUser.uid), newData, { merge: true });
                
                submitBtn.textContent = 'SYNCING RECORDS...';
                const oldName = profile.displayName;
                const newName = newData.displayName;
                const newPhoto = photoURL || profile.photoURL;

                if (oldName && oldName !== newName) {
                    const gHostQ = query(collection(db, "games"), where("host", "==", oldName));
                    const gHostSnap = await getDocs(gHostQ);
                    for (const g of gHostSnap.docs) {
                        await updateDoc(doc(db, "games", g.id), { host: newName });
                    }

                    const gPlayQ = query(collection(db, "games"), where("players", "array-contains", oldName));
                    const gPlaySnap = await getDocs(gPlayQ);
                    for (const g of gPlaySnap.docs) {
                        const pList = g.data().players.map(p => p === oldName ? newName : p);
                        await updateDoc(doc(db, "games", g.id), { players: pList });
                    }

                    const gAppQ = query(collection(db, "games"), where("applicants", "array-contains", oldName));
                    const gAppSnap = await getDocs(gAppQ);
                    for (const g of gAppSnap.docs) {
                        const aList = g.data().applicants.map(a => a === oldName ? newName : a);
                        await updateDoc(doc(db, "games", g.id), { applicants: aList });
                    }
                    
                    const gAttQ = query(collection(db, "games"), where("attendanceReported", "array-contains", oldName));
                    const gAttSnap = await getDocs(gAttQ);
                    for (const g of gAttSnap.docs) {
                        const attList = g.data().attendanceReported.map(a => a === oldName ? newName : a);
                        await updateDoc(doc(db, "games", g.id), { attendanceReported: attList });
                    }
                }

                const postsQ = query(collection(db, "posts"), where("authorId", "==", auth.currentUser.uid));
                const postsSnap = await getDocs(postsQ);
                for (const p of postsSnap.docs) {
                    await updateDoc(doc(db, "posts", p.id), { 
                        authorName: newName, 
                        authorPhoto: newPhoto,
                        authorPosition: newData.primaryPosition 
                    });
                }
                
                const squadQ = query(collection(db, "squads"), where("captainId", "==", auth.currentUser.uid));
                const squadSnap = await getDocs(squadQ);
                for (const s of squadSnap.docs) {
                    await updateDoc(doc(db, "squads", s.id), { captainName: newName });
                }

                const localProfile = JSON.parse(localStorage.getItem('ligaPhProfile') || '{}');
                const updatedLocalProfile = { ...localProfile, ...newData };
                localStorage.setItem('ligaPhProfile', JSON.stringify(updatedLocalProfile));

                window.location.href = 'profile.html';
            } catch (error) {
                alert("Failed to save changes.");
                submitBtn.textContent = 'Save Changes';
                submitBtn.disabled = false;
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    if (path.includes('edit-profile')) {
        onAuthStateChanged(auth, (user) => {
            if (user) initEditProfilePage();
            else window.location.href = 'index.html';
        });
    } else if (path.includes('profile')) {
        onAuthStateChanged(auth, (user) => { initProfilePage(user); });
        initTabs();
    }
});
