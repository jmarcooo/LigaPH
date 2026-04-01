import { auth, db, storage } from './firebase-setup.js';
import { doc, getDoc, setDoc, collection, query, where, getDocs, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";

function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Generate the dynamic initials avatar
function getFallbackAvatar(name) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'P')}&background=20262f&color=ff8f6f`;
}

// -----------------------------------------------------
// MAIN PROFILE PAGE LOGIC
// -----------------------------------------------------
async function initProfilePage(currentUser) {
    const urlParams = new URLSearchParams(window.location.search);
    const targetId = urlParams.get('id');
    const isOwnProfile = !targetId || (currentUser && targetId === currentUser.uid);
    const finalUserId = targetId || (currentUser ? currentUser.uid : null);

    if (!finalUserId) return window.location.href = 'index.html';

    const manageBtn = document.getElementById('manage-profile-btn');
    const rateBtn = document.getElementById('rate-player-btn');
    const commendBtn = document.getElementById('commend-player-btn');

    if (manageBtn && rateBtn && commendBtn) {
        if (isOwnProfile) manageBtn.classList.remove('hidden');
        else { rateBtn.classList.remove('hidden'); commendBtn.classList.remove('hidden'); }
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

        const nameEl = document.getElementById('profile-name');
        let displayNameText = profileData.displayName || "Unknown Player";
        const squadTag = document.getElementById('profile-squad-tag');
        
        if (profileData.squadAbbr && squadTag) {
            squadTag.innerHTML = `<span class="material-symbols-outlined text-[16px] text-primary mr-1">shield</span> ${escapeHTML(profileData.squadAbbr)}`;
            squadTag.classList.remove('hidden');
            squadTag.classList.add('inline-flex');
        } else if (squadTag) {
            squadTag.classList.add('hidden');
        }

        nameEl.textContent = displayNameText;
        nameEl.classList.remove('animate-pulse', 'bg-surface-container-highest', 'bg-surface-container-high', 'rounded-md', 'min-h-[3rem]', 'md:min-h-[4rem]', 'min-w-[200px]', 'inline-block');
        
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

        // Apply Dynamic Initials Avatar
        const avatarImg = document.getElementById('profile-avatar');
        if (avatarImg) {
            document.getElementById('profile-avatar-container').classList.remove('animate-pulse', 'bg-surface-container-highest');
            
            const photoUrl = profileData.photoURL || getFallbackAvatar(profileData.displayName);
            avatarImg.src = photoUrl;
            
            // Failsafe in case broken image URL was saved
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
        if (!isOwnProfile && currentUser) setupCommendation(finalUserId, currentUser);

        renderSkillBars('self-skill-breakdown', profileData.selfRatings || { shooting: 0, passing: 0, dribbling: 0, rebounding: 0, defense: 0 }, 1);
        loadUserActiveGames(profileData.displayName);
        loadUserPosts(finalUserId);
        setupRatings(finalUserId, currentUser);

    } catch (e) {
        console.error("Failed to load profile", e);
    }
}

// -----------------------------------------------------
// STATS & CONNECTIONS MODAL LOGIC
// -----------------------------------------------------
async function loadPlayerStats(targetId, profileData) {
    const attended = profileData.gamesAttended || 0;
    const missed = profileData.gamesMissed || 0;
    const totalGames = attended + missed;
    const reliabilityScore = totalGames === 0 ? 100 : Math.round((attended / totalGames) * 100);

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

async function setupCommendation(targetUserId, currentUser) {
    const commendBtn = document.getElementById('commend-player-btn');
    if (!commendBtn || !currentUser) return;

    try {
        const commRef = collection(db, "commendations");
        const snap = await getDocs(query(commRef, where("targetUserId", "==", targetUserId), where("senderId", "==", currentUser.uid)));

        // BUG FIX: Safely update button text without relying on deleted ID
        if (!snap.empty) {
            commendBtn.classList.add('opacity-50', 'cursor-not-allowed');
            const spanText = commendBtn.querySelector('span.text-sm');
            if (spanText) spanText.textContent = "Props Given";
        } else {
            commendBtn.addEventListener('click', async () => {
                commendBtn.disabled = true;
                try {
                    await addDoc(commRef, { targetUserId, senderId: currentUser.uid, createdAt: serverTimestamp() });
                    commendBtn.classList.add('opacity-50', 'cursor-not-allowed');
                    const spanText = commendBtn.querySelector('span.text-sm');
                    if (spanText) spanText.textContent = "Props Given";
                    
                    const commEl = document.getElementById('stat-commendations');
                    if (commEl && !isNaN(parseInt(commEl.textContent))) {
                        commEl.textContent = parseInt(commEl.textContent) + 1;
                    }
                } catch (e) {
                    console.error("Commendation error:", e);
                    alert("Failed to commend player.");
                    commendBtn.disabled = false;
                }
            });
        }
    } catch(e) {
        console.error("Setup commendation error:", e);
    }
}

// -----------------------------------------------------
// SKILL BARS & RATINGS LOGIC
// -----------------------------------------------------
function renderSkillBars(containerId, dataObject, countDivider) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (countDivider === 0) {
        container.innerHTML = '<div class="flex-1 flex items-center justify-center min-h-[150px]"><p class="text-sm text-outline-variant font-bold uppercase tracking-widest">No ratings yet</p></div>';
        return;
    }

    container.innerHTML = '';
    const skillsList = ['shooting', 'passing', 'dribbling', 'rebounding', 'defense'];

    skillsList.forEach(skill => {
        const avg = (dataObject[skill] || 0) / countDivider;
        const percentage = (avg / 5) * 100;
        
        const isOrange = skill === 'shooting' || skill === 'dribbling' || skill === 'defense';
        const colorClass = isOrange ? 'bg-primary' : 'bg-secondary';
        const textClass = isOrange ? 'text-primary' : 'text-secondary';
        
        container.innerHTML += `
            <div>
                <div class="flex justify-between items-center mb-1.5">
                    <span class="text-xs font-bold uppercase tracking-widest text-on-surface">${skill}</span>
                    <span class="font-bold text-sm ${textClass}">${avg.toFixed(1)}</span>
                </div>
                <div class="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden">
                    <div class="h-full ${colorClass} rounded-full" style="width: ${percentage}%"></div>
                </div>
            </div>
        `;
    });
}

async function setupRatings(targetUserId, currentUser) {
    const countBadge = document.getElementById('total-ratings-count');
    let currentInputRatings = { shooting: 0, passing: 0, dribbling: 0, rebounding: 0, defense: 0 };
    let hasRated = false;

    try {
        const snap = await getDocs(query(collection(db, "ratings"), where("targetUserId", "==", targetUserId)));
        let totals = { shooting: 0, passing: 0, dribbling: 0, rebounding: 0, defense: 0 };
        let count = 0;

        snap.forEach(doc => {
            const data = doc.data();
            if (currentUser && data.raterId === currentUser.uid) hasRated = true;
            ['shooting', 'passing', 'dribbling', 'rebounding', 'defense'].forEach(s => totals[s] += (data[s] || 0));
            count++;
        });

        if (countBadge) countBadge.textContent = `${count} Ratings`;
        renderSkillBars('community-skill-breakdown', totals, count);

        const rateBtn = document.getElementById('rate-player-btn');
        const modal = document.getElementById('rating-modal');

        // BUG FIX: Safely update button text without relying on deleted ID
        if (hasRated && rateBtn) {
            rateBtn.classList.add('opacity-50', 'cursor-not-allowed');
            const spanText = rateBtn.querySelector('span.text-sm');
            if (spanText) spanText.textContent = "Scouted";
        }

        if (rateBtn && !hasRated) {
            rateBtn.addEventListener('click', () => {
                if (!currentUser) return alert("Please log in to rate players.");
                modal.classList.remove('hidden');
                setTimeout(() => {
                    modal.classList.remove('opacity-0');
                    modal.querySelector('div').classList.remove('scale-95');
                }, 10);
            });
        }

        document.getElementById('close-rating-modal')?.addEventListener('click', () => {
            modal.classList.add('opacity-0');
            modal.querySelector('div').classList.add('scale-95');
            setTimeout(() => modal.classList.add('hidden'), 300);
        });

        const starsContainer = document.getElementById('rating-stars-container');
        if (starsContainer) {
            starsContainer.innerHTML = '';
            ['shooting', 'passing', 'dribbling', 'rebounding', 'defense'].forEach(skill => {
                starsContainer.innerHTML += `
                    <div class="flex justify-between items-center" data-skill="${skill}">
                        <span class="text-sm font-bold uppercase tracking-widest text-on-surface">${skill}</span>
                        <div class="flex gap-1 star-container cursor-pointer text-outline-variant">
                            ${[1,2,3,4,5].map(i => `<span class="material-symbols-outlined text-2xl hover:text-primary transition-colors" data-value="${i}">star</span>`).join('')}
                        </div>
                    </div>
                `;
            });

            document.querySelectorAll('.star-container').forEach(container => {
                const skill = container.parentElement.dataset.skill;
                const stars = container.querySelectorAll('span');
                stars.forEach(star => {
                    star.addEventListener('click', () => {
                        const val = parseInt(star.dataset.value);
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
        }

        const form = document.getElementById('rating-form');
        if (form) {
            form.onsubmit = async (e) => {
                e.preventDefault();
                if (Object.values(currentInputRatings).some(v => v === 0)) return alert("Please rate all 5 skills.");

                const submitBtn = document.getElementById('submit-rating-btn');
                submitBtn.textContent = 'Submitting...';
                submitBtn.disabled = true;

                try {
                    await addDoc(collection(db, "ratings"), {
                        targetUserId: targetUserId,
                        raterId: currentUser.uid,
                        ...currentInputRatings,
                        createdAt: serverTimestamp()
                    });
                    modal.classList.add('hidden');
                    setupRatings(targetUserId, currentUser);
                } catch (err) {
                    console.error("Submit rating error:", err);
                    alert("Failed to submit rating.");
                    submitBtn.textContent = 'Submit';
                    submitBtn.disabled = false;
                }
            };
        }

    } catch (e) {
        console.error("Ratings fetch error:", e);
        document.getElementById('community-skill-breakdown').innerHTML = '<p class="text-xs text-error">Failed to load ratings.</p>';
    }
}

// -----------------------------------------------------
// TABS & DATA LOADING
// -----------------------------------------------------
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
        querySnapshot.forEach(doc => {
            const data = doc.data();
            if (data.host === displayName || (data.players && Array.isArray(data.players) && data.players.includes(displayName))) {
                activeGames.push({ id: doc.id, ...data });
            }
        });

        container.innerHTML = '';
        if (activeGames.length === 0) return container.innerHTML = '<span class="block text-on-surface-variant py-8 text-center w-full">No active games.</span>';

        activeGames.forEach(game => {
            container.innerHTML += `
                <div class="bg-[#14171d] p-5 rounded-xl border border-outline-variant/10 hover:border-primary/30 transition-colors cursor-pointer shadow-sm" onclick="window.location.href='game-details.html?id=${game.id}'">
                    <h4 class="font-headline text-lg font-black italic uppercase mb-3 truncate text-on-surface">${escapeHTML(game.title)}</h4>
                    <div class="flex items-center gap-3 mb-4">
                        <span class="bg-surface-container-highest text-on-surface px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest border border-outline-variant/10">${escapeHTML(game.type)}</span>
                        <div class="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary shrink-0">
                            <span class="material-symbols-outlined text-sm">sports_basketball</span>
                        </div>
                    </div>
                    <p class="text-xs text-on-surface-variant flex items-center gap-1 truncate">
                        <span class="material-symbols-outlined text-[14px]">location_on</span> ${escapeHTML(game.location)}
                    </p>
                </div>`;
        });
    } catch(e) { container.innerHTML = '<span class="text-error">Error</span>'; }
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
        if (posts.length === 0) return container.innerHTML = '<span class="block text-on-surface-variant py-8 text-center w-full">No posts yet.</span>';

        posts.forEach(post => {
            const timeStr = post.createdAt ? `${Math.floor((Date.now() - post.createdAt.toMillis()) / 3600000)}h ago` : 'Recently';
            container.innerHTML += `
                <article class="bg-[#14171d] rounded-xl p-5 border border-outline-variant/10 shadow-sm text-left">
                    <div class="flex justify-between items-baseline mb-2">
                        <h4 class="font-bold text-sm text-on-surface truncate">${escapeHTML(post.authorName)}</h4>
                        <span class="text-[10px] text-outline ml-2">${timeStr}</span>
                    </div>
                    <p class="text-sm text-on-surface-variant whitespace-pre-wrap">${escapeHTML(post.content)}</p>
                </article>`;
        });
    } catch (error) {}
}

// -----------------------------------------------------
// EDIT PROFILE LOGIC 
// -----------------------------------------------------
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
                    photoURL = await uploadAvatarImage(selectedAvatarFile, auth.currentUser.uid);
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
