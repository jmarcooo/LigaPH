import { auth, db, storage } from './firebase-setup.js';
import { doc, getDoc, setDoc, collection, query, where, getDocs, addDoc, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";
import { metroManilaCities, verifiedCourtsByCity } from './locations.js';

// --- HELPER FUNCTIONS ---
function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function getFallbackAvatar(name) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'P')}&background=20262f&color=ff8f6f`;
}

function getSkillLabel(value) {
    if (value >= 4.5) return "Elite";
    if (value >= 3.5) return "Advanced";
    if (value >= 2.5) return "Intermediate";
    if (value > 0) return "Beginner";
    return "Unrated";
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

// Crops image to a 1:1 square (For Avatars)
function resizeAndCropImage(file, targetSize = 300) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = targetSize;
            canvas.height = targetSize;
            const size = Math.min(img.width, img.height);
            const startX = (img.width - size) / 2;
            const startY = (img.height - size) / 2;
            ctx.drawImage(img, startX, startY, size, size, 0, 0, targetSize, targetSize);
            canvas.toBlob((blob) => {
                if (blob) {
                    blob.name = file.name || 'avatar.jpg'; 
                    resolve(blob);
                } else reject(new Error("Canvas optimization failed"));
            }, file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85); 
        };
        img.onerror = () => reject(new Error("Failed to load image for resizing"));
        img.src = URL.createObjectURL(file);
    });
}

// Maintains aspect ratio, only scales down width (For Cover Photos)
function resizeMaintainAspect(file, maxWidth = 1200) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob((blob) => {
                if (blob) {
                    blob.name = file.name || 'cover.jpg';
                    resolve(blob);
                } else reject(new Error("Canvas optimization failed"));
            }, file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85);
        };
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = URL.createObjectURL(file);
    });
}

// Generic Upload Function
function uploadImageFile(file, uid, folder) {
    return new Promise((resolve, reject) => {
        const safeName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
        const storageRef = ref(storage, `${folder}/${uid}_${Date.now()}_${safeName}`);
        
        const uploadTask = uploadBytesResumable(storageRef, file);
        const submitBtn = document.querySelector('#edit-profile-form button[type="submit"]');

        const timer = setTimeout(() => {
            uploadTask.cancel();
            reject(new Error("Upload timed out. Check your internet connection."));
        }, 60000);

        uploadTask.on('state_changed',
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                if(submitBtn) submitBtn.textContent = `UPLOADING... ${Math.round(progress)}%`;
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

// --- MAIN PROFILE VIEW ---
async function initProfilePage(currentUser) {
    const urlParams = new URLSearchParams(window.location.search);
    const targetId = urlParams.get('id');
    const isOwnProfile = !targetId || (currentUser && targetId === currentUser.uid);
    const finalUserId = targetId || (currentUser ? currentUser.uid : null);

    if (!finalUserId) return window.location.href = 'index.html';

    const manageBtn = document.getElementById('manage-profile-btn');
    const connectBtn = document.getElementById('connect-player-btn');
    const commendBtn = document.getElementById('commend-player-btn'); 
    const rateBtn = document.getElementById('rate-skills-btn');

    if (isOwnProfile) {
        if (manageBtn) {
            manageBtn.classList.remove('hidden');
            manageBtn.classList.add('flex');
        }
    } else {
        if (connectBtn && currentUser) {
            connectBtn.classList.remove('hidden');
            connectBtn.classList.add('flex');
        }
        if (commendBtn && currentUser) {
            commendBtn.classList.remove('hidden');
            commendBtn.classList.add('flex');
        }
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
                accountType: "Player",
                photoURL: currentUser.photoURL || null,
                coverURL: null,
                selfRatings: { shooting: 3, passing: 3, dribbling: 3, rebounding: 3, defense: 3 },
                gamesAttended: 0,
                gamesMissed: 0
            };
            await setDoc(docRef, profileData);
        } else {
            alert("Player not found.");
            return window.location.href = 'listings.html';
        }

        const liveSquadAbbr = profileData.squadAbbr || profileData.squadName || null;
        const liveSquadId = profileData.squadId || null;

        const nameEl = document.getElementById('profile-name');
        let displayNameText = profileData.displayName || "Unknown Player";
        
        const squadTag = document.getElementById('profile-squad-tag');
        if (liveSquadAbbr && squadTag) {
            squadTag.innerHTML = `<span class="material-symbols-outlined text-[14px]">groups</span> [${escapeHTML(liveSquadAbbr)}] <span class="material-symbols-outlined text-[14px]">open_in_new</span>`;
            squadTag.classList.remove('hidden');
            squadTag.classList.add('flex', 'cursor-pointer', 'hover:border-[#ff751f]/50', 'hover:text-[#ff751f]', 'transition-colors');
            if (liveSquadId) {
                squadTag.onclick = () => window.location.href = `squad-details.html?id=${liveSquadId}`;
            }
        }

        try {
            const role = profileData.accountType || 'Player';
            const avatarIconEl = document.getElementById('profile-avatar-icon');
            if (avatarIconEl) {
                let mainIcon = 'sports_basketball'; 
                if (role === 'Administrator') mainIcon = 'admin_panel_settings';
                else if (role === 'Organizer') mainIcon = 'event';
                else if (role === 'Referee' || role === 'Official') mainIcon = 'sports';
                else if (role === 'Verified') mainIcon = 'verified';
                else if (role === 'Content Writer' || role === 'Editor') mainIcon = 'edit_document';
                
                avatarIconEl.textContent = mainIcon;
            }

            const badgesContainer = document.getElementById('profile-badges');
            if (badgesContainer) {
                badgesContainer.innerHTML = '';
                
                if (profileData.overallRank || profileData.isTopOverall) {
                    const rankText = profileData.overallRank ? `TOP ${profileData.overallRank} OVERALL` : `TOP PLAYER OVERALL`;
                    badgesContainer.innerHTML += `
                        <span class="bg-yellow-100 dark:bg-yellow-500/20 text-yellow-600 dark:text-yellow-500 border border-yellow-300 dark:border-yellow-500/30 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest shadow-sm flex items-center gap-1">
                            <span class="material-symbols-outlined text-[12px]">emoji_events</span> ${escapeHTML(rankText)}
                        </span>`;
                }

                if (profileData.cityRank || profileData.isTopCity) {
                    const city = profileData.location || 'CITY';
                    const rankText = profileData.cityRank ? `#${profileData.cityRank} IN ${city}` : `TOP IN ${city}`;
                    badgesContainer.innerHTML += `
                        <span class="bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-300 dark:border-purple-500/30 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest shadow-sm flex items-center gap-1">
                            <span class="material-symbols-outlined text-[12px]">local_fire_department</span> ${escapeHTML(rankText)}
                        </span>`;
                }

                if (role !== 'Player') {
                    let roleColor = 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-white/10';
                    let roleIcon = 'verified_user';
                    
                    if (role === 'Administrator') { roleColor = 'bg-red-50 dark:bg-red-500/20 text-red-600 dark:text-red-500 border-red-200 dark:border-red-500/30'; roleIcon = 'admin_panel_settings'; }
                    else if (role === 'Organizer') { roleColor = 'bg-[#ff751f]/10 text-[#ff751f] border-[#ff751f]/30'; roleIcon = 'event'; }
                    else if (role === 'Referee' || role === 'Official') { roleColor = 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-500 border-emerald-200 dark:border-emerald-500/30'; roleIcon = 'sports'; }
                    else if (role === 'Verified') { roleColor = 'bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/30'; roleIcon = 'verified'; }
                    else if (role === 'Content Writer' || role === 'Editor') { roleColor = 'bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/30'; roleIcon = 'edit_document'; }

                    badgesContainer.innerHTML += `
                        <span class="${roleColor} px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest shadow-sm flex items-center gap-1 border">
                            <span class="material-symbols-outlined text-[12px]">${roleIcon}</span> ${role}
                        </span>`;
                }
            }
        } catch(e) { console.error("Failed to load badges or avatar icon", e); }

        nameEl.textContent = displayNameText;
        nameEl.classList.remove('animate-pulse', 'bg-gray-200', 'dark:bg-white/5', 'rounded-md', 'min-h-[3rem]', 'min-w-[200px]', 'inline-block');
        
        const bioEl = document.getElementById('profile-bio');
        bioEl.textContent = profileData.bio || "No bio available.";
        bioEl.classList.remove('animate-pulse', 'bg-gray-200', 'dark:bg-white/5', 'rounded-md', 'min-h-[2rem]');
        
        const courtEl = document.getElementById('profile-home-court');
        if (courtEl) {
            courtEl.textContent = (profileData.homeCourt || "UNKNOWN COURT").toUpperCase();
            courtEl.classList.remove('animate-pulse', 'min-w-[80px]', 'min-w-[120px]', 'min-h-[24px]');
        }

        const posMap = { 'PG':'Point Guard', 'SG':'Shooting Guard', 'SF':'Small Forward', 'PF':'Power Forward', 'C':'Center' };
        const posEl = document.getElementById('profile-position');
        if (posEl) {
            posEl.textContent = posMap[profileData.primaryPosition] || profileData.primaryPosition || "UNASSIGNED";
            posEl.classList.remove('animate-pulse');
        }

        const skillEl = document.getElementById('profile-skill');
        if (skillEl) {
            skillEl.textContent = (profileData.skillLevel || "UNRANKED").toUpperCase();
            skillEl.classList.remove('animate-pulse');
        }

        // Apply Avatar
        const avatarImg = document.getElementById('profile-avatar');
        if (avatarImg) {
            document.getElementById('profile-avatar-container').classList.remove('animate-pulse');
            const photoUrl = profileData.photoURL || getFallbackAvatar(profileData.displayName);
            avatarImg.src = photoUrl;
            avatarImg.onerror = function() {
                this.onerror = null;
                this.src = getFallbackAvatar(profileData.displayName);
            };
            avatarImg.classList.remove('hidden');
        }

        // Apply Cover Image
        const coverImg = document.getElementById('profile-cover-image');
        if (coverImg && profileData.coverURL) {
            coverImg.src = profileData.coverURL;
        }

        loadPlayerStats(finalUserId, profileData);
        setupConnectionsModal(finalUserId);
        
        if (!isOwnProfile && currentUser) {
            setupConnectionAction(finalUserId, currentUser);
            
            const commendModal = document.getElementById('commend-modal');
            if (commendBtn && commendModal) {
                commendBtn.addEventListener('click', () => {
                    document.getElementById('commend-target-name').textContent = profileData.displayName;
                    document.getElementById('commend-target-id').value = finalUserId;
                    
                    commendModal.classList.remove('hidden');
                    commendModal.classList.add('flex');
                    setTimeout(() => {
                        commendModal.classList.remove('opacity-0');
                        commendModal.querySelector('div').classList.remove('scale-95');
                    }, 10);
                });
            }
        }

        document.getElementById('close-commend-modal')?.addEventListener('click', () => {
            const commendModal = document.getElementById('commend-modal');
            commendModal.classList.add('opacity-0');
            commendModal.querySelector('div').classList.add('scale-95');
            setTimeout(() => {
                commendModal.classList.add('hidden');
                commendModal.classList.remove('flex');
            }, 300);
        });

        const commendForm = document.getElementById('commend-form');
        if (commendForm && !isOwnProfile) {
            commendForm.onsubmit = async (e) => {
                e.preventDefault();
                const submitBtn = document.getElementById('submit-commend-btn');
                submitBtn.disabled = true;
                submitBtn.textContent = 'Submitting...';

                const targetUid = document.getElementById('commend-target-id').value;
                const tagEl = document.querySelector('input[name="commendation-tag"]:checked');
                
                if (!tagEl) {
                    alert("Please select a commendation tag.");
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Submit';
                    return;
                }

                try {
                    await addDoc(collection(db, "commendations"), {
                        targetUserId: targetUid,
                        raterId: currentUser.uid,
                        tag: tagEl.value,
                        createdAt: serverTimestamp()
                    });
                    alert("Commendation sent!");
                    document.getElementById('close-commend-modal').click();
                    loadPlayerStats(finalUserId, profileData);
                } catch(err) {
                    console.error("Commend error:", err);
                    alert("Error: " + err.message);
                } finally {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Submit';
                }
            };
        }

        // Pass 'false' for isCharacterTrait to use Blue colored bars
        renderSkillBars('self-skill-breakdown', profileData.selfRatings || { shooting: 0, passing: 0, dribbling: 0, rebounding: 0, defense: 0 }, 1, ['shooting', 'passing', 'dribbling', 'rebounding', 'defense'], false);
        
        loadUserActiveGames(profileData.displayName, finalUserId);
        loadUserPosts(finalUserId);
        
        setupCharacterPropsModal(finalUserId);
        setupSkillRatings(finalUserId, currentUser, profileData.displayName, profileData.selfRatings);

    } catch (e) {
        console.error("Failed to load profile", e);
    }
}

// ... Connection, Stat Fetching ...
async function setupConnectionAction(targetUserId, currentUser) {
    const connectBtn = document.getElementById('connect-player-btn');
    if (!connectBtn || !currentUser || targetUserId === currentUser.uid) return;

    const btnText = document.getElementById('connect-btn-text');
    const btnIcon = document.getElementById('connect-btn-icon');

    try {
        const connRef = collection(db, "connections");
        const connSnap = await getDocs(query(connRef, where("requesterId", "==", currentUser.uid)));
        const connSnap2 = await getDocs(query(connRef, where("receiverId", "==", currentUser.uid)));
        
        let connDoc = null;
        let isRequester = false;
        
        connSnap.forEach(d => {
            if (d.data().receiverId === targetUserId) {
                connDoc = d;
                isRequester = true;
            }
        });
        if (!connDoc) {
            connSnap2.forEach(d => {
                if (d.data().requesterId === targetUserId) {
                    connDoc = d;
                    isRequester = false;
                }
            });
        }

        connectBtn.disabled = false;
        connectBtn.onclick = null;
        connectBtn.classList.remove('hidden'); 
        connectBtn.classList.add('flex');

        if (connDoc) {
            const data = connDoc.data();
            if (data.status === 'accepted') {
                connectBtn.classList.add('opacity-50', 'cursor-not-allowed');
                btnText.textContent = "Connected";
                btnText.className = "font-headline font-black italic uppercase text-[10px] md:text-sm text-blue-500";
                btnIcon.textContent = "handshake";
                btnIcon.className = "material-symbols-outlined text-[16px] md:text-[18px] text-blue-500";
                connectBtn.disabled = true;
            } else if (data.status === 'pending') {
                if (isRequester) {
                    connectBtn.classList.add('opacity-50', 'cursor-not-allowed');
                    btnText.textContent = "Pending";
                    btnIcon.textContent = "schedule";
                    btnText.className = "font-headline font-black italic uppercase text-[10px] md:text-sm text-gray-400 dark:text-gray-500";
                    btnIcon.className = "material-symbols-outlined text-[16px] md:text-[18px] text-gray-400 dark:text-gray-500";
                    connectBtn.disabled = true;
                } else {
                    btnText.textContent = "Accept Invite";
                    btnIcon.textContent = "check_circle";
                    btnText.className = "font-headline font-black italic uppercase text-[10px] md:text-sm text-[#ff751f]";
                    btnIcon.className = "material-symbols-outlined text-[16px] md:text-[18px] text-[#ff751f]";
                    
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
            btnText.className = "font-headline font-black italic uppercase text-[10px] md:text-sm text-gray-900 dark:text-white";
            btnIcon.className = "material-symbols-outlined text-[16px] md:text-[18px] text-gray-900 dark:text-white";
            
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
    } catch(e) { console.error("Connection setup error:", e); }
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
        if (reliabilityScore < 75) {
            relEl.classList.replace('text-[#ff751f]', 'text-red-500');
        }
    }

    try {
        const connRef = collection(db, "connections");
        const reqSnap = await getDocs(query(connRef, where("requesterId", "==", targetId)));
        const recSnap = await getDocs(query(connRef, where("receiverId", "==", targetId)));
        
        let acceptedCount = 0;
        reqSnap.forEach(d => { if(d.data().status === 'accepted') acceptedCount++; });
        recSnap.forEach(d => { if(d.data().status === 'accepted') acceptedCount++; });
        
        const connEl = document.getElementById('stat-connections');
        if (connEl) connEl.textContent = acceptedCount;
    } catch (e) {}

    try {
        const snapComm = await getDocs(query(collection(db, "commendations"), where("targetUserId", "==", targetId)));
        const commEl = document.getElementById('stat-commendations');
        if (commEl) commEl.textContent = snapComm.size;
    } catch (e) {
        console.error("Failed to load commendations:", e);
    }
}

async function fetchConnectionsDetails(targetId) {
    const connRef = collection(db, "connections");
    const reqSnap = await getDocs(query(connRef, where("requesterId", "==", targetId)));
    const recSnap = await getDocs(query(connRef, where("receiverId", "==", targetId)));

    const connectionUids = [];
    reqSnap.forEach(d => { if(d.data().status === 'accepted') connectionUids.push(d.data().receiverId); });
    recSnap.forEach(d => { if(d.data().status === 'accepted') connectionUids.push(d.data().requesterId); });

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
        modal.classList.add('flex');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            modal.querySelector('div').classList.remove('scale-95');
        }, 10);

        listContainer.innerHTML = `
            <div class="flex flex-col justify-center items-center py-8 opacity-50">
                <span class="material-symbols-outlined animate-spin text-4xl text-[#ff751f] mb-2">refresh</span>
                <p class="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Loading</p>
            </div>
        `;

        try {
            const connections = await fetchConnectionsDetails(targetId);
            listContainer.innerHTML = '';

            if (connections.length === 0) {
                listContainer.innerHTML = '<p class="text-center text-sm text-gray-500 dark:text-gray-400 py-8 italic">No connections found.</p>';
                return;
            }

            connections.forEach(user => {
                const safeName = escapeHTML(user.displayName || 'Unknown');
                const photoUrl = escapeHTML(user.photoURL) || getFallbackAvatar(safeName);
                
                listContainer.innerHTML += `
                    <div class="flex items-center gap-4 p-3 bg-gray-50 dark:bg-[#14171d] rounded-xl border border-gray-200 dark:border-white/10 cursor-pointer hover:border-[#ff751f]/50 transition-all shadow-sm" onclick="window.location.href='profile.html?id=${user.id}'">
                        <img src="${photoUrl}" onerror="this.onerror=null; this.src='${getFallbackAvatar(safeName)}';" class="w-12 h-12 rounded-full object-cover border border-gray-200 dark:border-white/20 shrink-0">
                        <div class="flex-1 min-w-0">
                            <p class="font-bold text-sm text-gray-900 dark:text-white truncate">${safeName}</p>
                            <p class="text-[10px] text-[#ff751f] uppercase font-black tracking-widest">${escapeHTML(user.primaryPosition || 'Unassigned')}</p>
                        </div>
                        <span class="material-symbols-outlined text-gray-400 dark:text-gray-500 text-sm">chevron_right</span>
                    </div>
                `;
            });
        } catch (e) {
            listContainer.innerHTML = '<p class="text-center text-red-500 text-sm py-4">Failed to load connections.</p>';
        }
    });

    closeBtn.addEventListener('click', () => {
        modal.classList.add('opacity-0');
        modal.querySelector('div').classList.add('scale-95');
        setTimeout(() => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }, 300);
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeBtn.click();
    });
}

function renderSkillBars(containerId, dataObject, countDivider, skillsArray, isCharacterTrait = false) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (countDivider === 0 || !dataObject) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-4 opacity-40 text-gray-500 dark:text-gray-400">
                <span class="text-[9px] font-bold uppercase tracking-widest">No ratings yet</span>
            </div>`;
        return;
    }

    container.innerHTML = '';
    const colorClass = isCharacterTrait ? 'bg-[#ff751f]' : 'bg-blue-500';
    const textClass = isCharacterTrait ? 'text-[#ff751f]' : 'text-blue-500';

    skillsArray.forEach(skill => {
        const avg = (dataObject[skill] || 0) / countDivider;
        const percentage = (avg / 5) * 100;
        
        if (isCharacterTrait) {
            container.innerHTML += `
                <div class="mb-3 last:mb-0 w-full">
                    <div class="flex justify-between items-end mb-1 w-full text-gray-900 dark:text-white">
                        <span class="text-[9px] font-black uppercase tracking-widest opacity-80">${skill}</span>
                    </div>
                    <div class="h-1 w-full bg-gray-200 dark:bg-[#0a0e14] rounded-full overflow-hidden shadow-inner border border-gray-200 dark:border-white/5">
                        <div class="h-full ${colorClass} rounded-full transition-all duration-1000 ease-out" style="width: ${percentage}%"></div>
                    </div>
                </div>`;
        } else {
            container.innerHTML += `
                <div class="mb-5 last:mb-0 w-full">
                    <div class="flex justify-between items-end mb-1.5 w-full">
                        <div class="flex items-center gap-2">
                            <span class="text-[10px] font-black uppercase tracking-widest text-gray-900 dark:text-white opacity-80">${skill}</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="font-black text-sm ${textClass}">${avg.toFixed(1)}</span>
                        </div>
                    </div>
                    <div class="h-2 w-full bg-gray-200 dark:bg-[#0a0e14] rounded-full overflow-hidden shadow-inner border border-gray-200 dark:border-white/5">
                        <div class="h-full ${colorClass} rounded-full transition-all duration-1000 ease-out" style="width: ${percentage}%"></div>
                    </div>
                </div>`;
        }
    });
}

async function setupCharacterPropsModal(targetUserId) {
    let totals = { sportsmanship: 0, attitude: 0, punctuality: 0 };
    let count = 0;
    let snapData = [];

    try {
        const snap = await getDocs(query(collection(db, "ratings"), where("targetUserId", "==", targetUserId)));
        snap.forEach(doc => {
            const data = doc.data();
            ['sportsmanship', 'attitude', 'punctuality'].forEach(s => totals[s] += (data[s] || 0));
            count++;
            snapData.push(data);
        });
    } catch (e) {
        console.warn("Firebase fetch error for ratings:", e.message);
    }

    if (count === 0) return;

    let sumAll = 0;
    ['sportsmanship', 'attitude', 'punctuality'].forEach(s => sumAll += totals[s]);
    const overallAvg = sumAll / (count * 3);

    const avgScoreEl = document.getElementById('summary-rating-score');
    if(avgScoreEl) avgScoreEl.textContent = overallAvg.toFixed(1);
    
    const labelEl = document.getElementById('character-label');
    if(labelEl) labelEl.textContent = `${count} Ratings`;

    const summaryRatingCountEl = document.getElementById('summary-rating-count');
    if(summaryRatingCountEl) summaryRatingCountEl.textContent = `${count} Ratings`;

    const charBar = document.getElementById('character-bar');
    if (charBar) {
        setTimeout(() => { charBar.style.width = `${(overallAvg / 5) * 100}%`; }, 100);
    }

    const starsContainer = document.getElementById('summary-rating-stars');
    if (starsContainer) {
        starsContainer.innerHTML = '';
        for (let i = 1; i <= 5; i++) {
            if (i <= Math.round(overallAvg)) {
                starsContainer.innerHTML += `<span class="material-symbols-outlined text-[10px] md:text-[14px]" style="font-variation-settings: 'FILL' 1;">star</span>`;
            } else {
                starsContainer.innerHTML += `<span class="material-symbols-outlined text-[10px] md:text-[14px]">star_outline</span>`;
            }
        }
    }

    const avgScoreInner = document.getElementById('character-average-score');
    if(avgScoreInner) avgScoreInner.textContent = overallAvg.toFixed(1);

    const starsContainerInner = document.getElementById('character-stars');
    if (starsContainerInner) {
        starsContainerInner.innerHTML = starsContainer.innerHTML;
    }

    // Pass 'true' for isCharacterTrait to use Orange colored bars
    renderSkillBars('inline-trait-breakdown', totals, count, ['sportsmanship', 'attitude', 'punctuality'], true);

    const recentList = document.getElementById('recent-ratings-list');
    const seeAllBtn = document.getElementById('see-all-ratings-btn');
    const allRatingsModal = document.getElementById('all-ratings-modal');
    const allRatingsList = document.getElementById('all-ratings-list');
    const closeAllModalBtn = document.getElementById('close-all-ratings-modal');

    if (recentList && count > 0) {
        recentList.innerHTML = '';
        
        const sortedDocs = snapData.sort((a, b) => (b.updatedAt?.toMillis() || 0) - (a.updatedAt?.toMillis() || 0));
        const recentDocs = sortedDocs.slice(0, 3); 
        
        for (let data of recentDocs) {
            const raterId = data.raterId; 
            if (!raterId) continue;
            
            const userAvgRating = ((data.sportsmanship || 0) + (data.attitude || 0) + (data.punctuality || 0)) / 3;

            try {
               const raterDoc = await getDoc(doc(db, "users", raterId));
               if(raterDoc.exists()){
                  const raterName = raterDoc.data().displayName || "Player";
                  const nameParts = raterName.trim().split(' ');
                  let shortName = raterName;
                  if (nameParts.length > 1) {
                      shortName = `${nameParts[0].charAt(0)}. ${nameParts[nameParts.length - 1]}`;
                  }
                  
                  const raterPhoto = raterDoc.data().photoURL || getFallbackAvatar(raterName);
                  recentList.innerHTML += `
                    <div class="flex items-center gap-2 bg-gray-100 dark:bg-[#14171d] rounded-xl pr-2 pl-1 py-1.5 border border-gray-200 dark:border-white/10 cursor-pointer hover:border-[#ff751f]/50 transition-colors shadow-sm" onclick="window.location.href='profile.html?id=${raterId}'">
                        <img src="${raterPhoto}" class="w-6 h-6 rounded-full object-cover">
                        <span class="text-[10px] font-bold text-gray-900 dark:text-white truncate flex-1">${escapeHTML(shortName)}</span>
                        <span class="text-[10px] font-black text-[#ff751f]">${userAvgRating.toFixed(1)}</span>
                        <span class="material-symbols-outlined text-[12px] text-[#ff751f]" style="font-variation-settings: 'FILL' 1;">star</span>
                    </div>
                  `;
               }
            } catch(e) { console.error("Could not fetch rater info", e); }
        }

        if (count > 3 && seeAllBtn && allRatingsModal && allRatingsList) {
            seeAllBtn.classList.remove('hidden');
            
            seeAllBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                allRatingsList.innerHTML = `
                    <div class="flex flex-col justify-center items-center py-8 opacity-50">
                        <span class="material-symbols-outlined animate-spin text-4xl text-[#ff751f] mb-2">refresh</span>
                    </div>`;
                
                allRatingsModal.classList.remove('hidden');
                allRatingsModal.classList.add('flex');
                setTimeout(() => {
                    allRatingsModal.classList.remove('opacity-0');
                    allRatingsModal.querySelector('div').classList.remove('scale-95');
                }, 10);

                let fullListHTML = '';
                for (let data of sortedDocs) {
                    const raterId = data.raterId; 
                    if (!raterId) continue;
                    const userAvgRating = ((data.sportsmanship || 0) + (data.attitude || 0) + (data.punctuality || 0)) / 3;
                    const timeStr = data.updatedAt ? formatDateString(data.updatedAt.toDate()) : 'Recently';

                    try {
                        const raterDoc = await getDoc(doc(db, "users", raterId));
                        if(raterDoc.exists()){
                            const raterName = raterDoc.data().displayName || "Player";
                            const raterPhoto = raterDoc.data().photoURL || getFallbackAvatar(raterName);
                            fullListHTML += `
                                <div class="flex items-center justify-between gap-3 bg-white dark:bg-[#14171d] p-3 rounded-xl border border-gray-200 dark:border-white/10 cursor-pointer hover:border-[#ff751f]/50 transition-colors w-full mb-2 shadow-sm" onclick="window.location.href='profile.html?id=${raterId}'">
                                    <div class="flex items-center gap-3 min-w-0">
                                        <img src="${raterPhoto}" class="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-white/20">
                                        <div class="flex flex-col">
                                            <p class="text-xs font-bold text-gray-900 dark:text-white truncate">${escapeHTML(raterName)}</p>
                                            <p class="text-[9px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest">${timeStr}</p>
                                        </div>
                                    </div>
                                    <div class="flex items-center gap-1 shrink-0 bg-[#ff751f]/10 px-2 py-1 rounded border border-[#ff751f]/20">
                                        <span class="text-[#ff751f] font-black text-[11px]">${userAvgRating.toFixed(1)}</span>
                                        <span class="material-symbols-outlined text-[12px] text-[#ff751f]" style="font-variation-settings: 'FILL' 1;">star</span>
                                    </div>
                                </div>
                            `;
                        }
                    } catch(e) {}
                }
                allRatingsList.innerHTML = fullListHTML;
            });
            
            closeAllModalBtn.addEventListener('click', () => {
                allRatingsModal.classList.add('opacity-0');
                allRatingsModal.querySelector('div').classList.add('scale-95');
                setTimeout(() => {
                    allRatingsModal.classList.add('hidden');
                    allRatingsModal.classList.remove('flex');
                }, 300);
            });

            allRatingsModal.addEventListener('click', (e) => {
                if (e.target === allRatingsModal) closeAllModalBtn.click();
            });
        }
    }
}

async function setupSkillRatings(targetUserId, currentUser, targetUserName, selfRatingsData) {
    const rateBtn = document.getElementById('rate-skills-btn');
    const rateBtnText = document.getElementById('rate-skills-btn-text');
    const modal = document.getElementById('skill-rating-modal');

    const toggleSelf = document.getElementById('toggle-skill-self');
    const toggleComm = document.getElementById('toggle-skill-comm');
    const boxSelf = document.getElementById('self-skill-breakdown');
    const boxComm = document.getElementById('community-skill-breakdown');

    if (toggleSelf && toggleComm && boxSelf && boxComm) {
        
        const activeClasses = ['bg-blue-500', 'text-white', 'shadow-sm'];
        const inactiveClasses = ['text-gray-600', 'dark:text-gray-400', 'hover:text-gray-900', 'dark:hover:text-white', 'bg-transparent'];

        toggleSelf.addEventListener('click', () => {
            toggleSelf.classList.add(...activeClasses);
            toggleSelf.classList.remove(...inactiveClasses);
            
            toggleComm.classList.remove(...activeClasses);
            toggleComm.classList.add(...inactiveClasses);

            boxSelf.classList.remove('hidden');
            boxComm.classList.add('hidden');
        });

        toggleComm.addEventListener('click', () => {
            toggleComm.classList.add(...activeClasses);
            toggleComm.classList.remove(...inactiveClasses);
            
            toggleSelf.classList.remove(...activeClasses);
            toggleSelf.classList.add(...inactiveClasses);

            boxComm.classList.remove('hidden');
            boxSelf.classList.add('hidden');
        });
    }

    let currentInputRatings = { shooting: 0, passing: 0, dribbling: 0, rebounding: 0, defense: 0 };
    let existingRatingId = null;
    let commTotals = { shooting: 0, passing: 0, dribbling: 0, rebounding: 0, defense: 0 };
    let commCount = 0;

    try {
        const snap = await getDocs(query(collection(db, "skill_ratings"), where("targetUserId", "==", targetUserId)));
        
        snap.forEach(docSnap => {
            const data = docSnap.data();
            ['shooting', 'passing', 'dribbling', 'rebounding', 'defense'].forEach(s => commTotals[s] += (data[s] || 0));
            commCount++;

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
        });
    } catch (e) {
        console.warn("Firebase rules/fetch error for skill_ratings:", e.message);
    }

    // Pass 'false' for isCharacterTrait to use Blue colored bars
    renderSkillBars('community-skill-breakdown', commTotals, commCount, ['shooting', 'passing', 'dribbling', 'rebounding', 'defense'], false);

    let overallCommAvg = 0;
    if (commCount > 0) {
        let sumAllSkills = 0;
        ['shooting', 'passing', 'dribbling', 'rebounding', 'defense'].forEach(s => sumAllSkills += commTotals[s]);
        overallCommAvg = sumAllSkills / (commCount * 5);
    }

    let sumSelf = 0;
    const safeSelfRatings = selfRatingsData || { shooting: 0, passing: 0, dribbling: 0, rebounding: 0, defense: 0 };
    ['shooting', 'passing', 'dribbling', 'rebounding', 'defense'].forEach(s => sumSelf += (safeSelfRatings[s] || 0));
    const avgSelf = sumSelf / 5;

    const displayScore = commCount > 0 ? overallCommAvg : avgSelf;

    const summaryScoreEl = document.getElementById('summary-skill-score');
    const summaryLabelEl = document.getElementById('summary-skill-label');
    const summarySkillCountEl = document.getElementById('summary-skill-count');

    if(summaryScoreEl) summaryScoreEl.textContent = displayScore.toFixed(1);
    if(summaryLabelEl) summaryLabelEl.textContent = getSkillLabel(displayScore);
    if(summarySkillCountEl) summarySkillCountEl.textContent = `${commCount} Ratings`;

    if (rateBtn && currentUser && targetUserId !== currentUser.uid) {
        rateBtn.classList.remove('hidden');
        rateBtn.classList.add('flex');
        
        if (rateBtnText) {
            rateBtnText.textContent = existingRatingId ? "Update Rating" : "Rate Skills";
        }

        rateBtn.addEventListener('click', () => {
            document.getElementById('skill-rating-target-name').textContent = targetUserName;
            document.getElementById('skill-rating-target-id').value = targetUserId;
            
            const starsContainer = document.getElementById('skill-rating-stars-container');
            starsContainer.innerHTML = '';
            
            ['shooting', 'passing', 'dribbling', 'rebounding', 'defense'].forEach(skill => {
                starsContainer.innerHTML += `
                    <div class="flex justify-between items-center w-full" data-skill="${skill}">
                        <span class="text-[10px] font-bold uppercase tracking-widest text-gray-900 dark:text-white">${skill}</span>
                        <div class="flex gap-1 skill-star-container cursor-pointer text-gray-300 dark:text-gray-600">
                            ${[1,2,3,4,5].map(i => `<span class="material-symbols-outlined text-2xl hover:text-[#ff751f] transition-colors" data-value="${i}">star</span>`).join('')}
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
                        s.classList.add('text-[#ff751f]');
                        s.classList.remove('text-gray-300', 'dark:text-gray-600');
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

            modal.classList.remove('hidden');
            modal.classList.add('flex');
            setTimeout(() => {
                modal.classList.remove('opacity-0');
                modal.querySelector('div').classList.remove('scale-95');
            }, 10);
        });
    }

    document.getElementById('close-skill-rating-modal')?.addEventListener('click', () => {
        modal.classList.add('opacity-0');
        modal.querySelector('div').classList.add('scale-95');
        setTimeout(() => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }, 300);
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
                setupSkillRatings(targetUserId, currentUser, targetUserName, selfRatingsData); 
            } catch (err) {
                console.error("Submit skill rating error:", err);
                alert("Failed to submit rating: " + err.message);
            } finally {
                submitBtn.textContent = 'Submit';
                submitBtn.disabled = false;
            }
        };
    }
}

function initMobileDrawers() {
    const skillsCard = document.getElementById('mobile-skills-card');
    const ratingCard = document.getElementById('mobile-rating-card');
    const skillsContent = document.getElementById('mobile-skills-content');
    const ratingContent = document.getElementById('mobile-rating-content');
    
    const skillsTap = document.getElementById('skills-tap-indicator');
    const ratingTap = document.getElementById('rating-tap-indicator');

    if (skillsCard && ratingCard && skillsContent && ratingContent) {

        function openSkills() {
            skillsCard.classList.replace('col-span-1', 'col-span-2');
            skillsContent.classList.remove('hidden');
            skillsTap.classList.add('opacity-0');
            
            ratingCard.classList.replace('col-span-1', 'col-span-2');
            ratingContent.classList.add('hidden');
            ratingTap.classList.remove('opacity-0');
        }

        function openRating() {
            ratingCard.classList.replace('col-span-1', 'col-span-2');
            ratingContent.classList.remove('hidden');
            ratingTap.classList.add('opacity-0');
            
            skillsCard.classList.replace('col-span-1', 'col-span-2');
            skillsContent.classList.add('hidden');
            skillsTap.classList.remove('opacity-0');
        }

        function closeAll() {
            skillsCard.classList.replace('col-span-2', 'col-span-1');
            ratingCard.classList.replace('col-span-2', 'col-span-1');
            skillsContent.classList.add('hidden');
            ratingContent.classList.add('hidden');
            skillsTap.classList.remove('opacity-0');
            ratingTap.classList.remove('opacity-0');
        }

        skillsCard.addEventListener('click', (e) => {
            if (window.innerWidth >= 768) return;
            if (e.target.closest('button') || e.target.closest('a')) return;
            
            if (skillsContent.classList.contains('hidden')) {
                openSkills();
            } else {
                closeAll();
            }
        });

        ratingCard.addEventListener('click', (e) => {
            if (window.innerWidth >= 768) return;
            if (e.target.closest('button') || e.target.closest('a')) return;
            
            if (ratingContent.classList.contains('hidden')) {
                openRating();
            } else {
                closeAll();
            }
        });
    }
}

function initTabs() {
    const tabGames = document.getElementById('tab-games');
    const tabPosts = document.getElementById('tab-posts');
    const viewGamesWrapper = document.getElementById('view-games-wrapper');
    const viewPostsWrapper = document.getElementById('view-posts-wrapper');

    if (tabGames && tabPosts && viewGamesWrapper && viewPostsWrapper) {
        tabGames.addEventListener('click', () => {
            tabGames.classList.add('border-[#ff751f]', 'text-[#ff751f]');
            tabGames.classList.remove('border-transparent', 'text-gray-500', 'dark:text-gray-400');
            tabPosts.classList.remove('border-[#ff751f]', 'text-[#ff751f]');
            tabPosts.classList.add('border-transparent', 'text-gray-500', 'dark:text-gray-400');
            
            viewGamesWrapper.classList.remove('hidden');
            viewGamesWrapper.classList.add('block');
            viewPostsWrapper.classList.add('hidden');
            viewPostsWrapper.classList.remove('block');
        });

        tabPosts.addEventListener('click', () => {
            tabPosts.classList.add('border-[#ff751f]', 'text-[#ff751f]');
            tabPosts.classList.remove('border-transparent', 'text-gray-500', 'dark:text-gray-400');
            tabGames.classList.remove('border-[#ff751f]', 'text-[#ff751f]');
            tabGames.classList.add('border-transparent', 'text-gray-500', 'dark:text-gray-400');
            
            viewPostsWrapper.classList.remove('hidden');
            viewPostsWrapper.classList.add('block');
            viewGamesWrapper.classList.add('hidden');
            viewGamesWrapper.classList.remove('block');
        });
    }
}

async function loadUserActiveGames(displayName, userId) {
    const container = document.getElementById('profile-games-container');
    if (!container || (!displayName && !userId)) return;

    try {
        const querySnapshot = await getDocs(collection(db, "games"));
        const activeGames = [];
        const now = new Date();

        querySnapshot.forEach(doc => {
            const data = doc.data();
            
            let isParticipant = false;
            if (data.hostId === userId || data.host === displayName) {
                isParticipant = true;
            } else if (data.players) {
                if (Array.isArray(data.players)) {
                    isParticipant = data.players.some(p => 
                        p === userId || 
                        p === displayName || 
                        (p && typeof p === 'object' && (p.id === userId || p.name === displayName))
                    );
                } else if (typeof data.players === 'object') {
                    isParticipant = !!data.players[userId];
                }
            }
            
            if (isParticipant) {
                let isUpcoming = true;
                
                let gameStart;
                if (data.date && data.time) {
                    gameStart = new Date(`${data.date}T${data.time}`);
                } else if (data.date) {
                    gameStart = new Date(`${data.date}T00:00:00`);
                } else if (data.createdAt) {
                    gameStart = data.createdAt.toDate();
                }

                if (gameStart && !isNaN(gameStart)) {
                    let gameEnd = new Date(gameStart.getTime());
                    if (data.endTime) {
                        const [eH, eM] = data.endTime.split(':');
                        gameEnd.setHours(parseInt(eH), parseInt(eM), 0, 0);
                        if (gameEnd < gameStart) gameEnd.setDate(gameEnd.getDate() + 1);
                    } else {
                        gameEnd.setHours(gameEnd.getHours() + 2);
                    }

                    if (now > gameEnd) isUpcoming = false;
                }

                if (isUpcoming) {
                    activeGames.push({ id: doc.id, ...data });
                }
            }
        });

        activeGames.sort((a, b) => {
            const dateA = new Date(`${a.date || ''}T${a.time || ''}`).getTime();
            const dateB = new Date(`${b.date || ''}T${b.time || ''}`).getTime();
            return dateA - dateB;
        });

        if (activeGames.length === 0) {
            container.innerHTML = `
                <div class="col-span-full py-12 flex flex-col items-center justify-center bg-white dark:bg-[#14171d] rounded-3xl border border-dashed border-gray-200 dark:border-white/10 shadow-sm">
                    <p class="text-gray-500 dark:text-gray-400 text-sm font-bold italic mb-4">No upcoming games scheduled</p>
                    <button onclick="window.location.href='listings.html'" class="bg-[#ff751f] text-[#0a0e14] px-6 py-2 rounded-full font-black uppercase text-xs tracking-widest shadow-lg active:scale-95 transition-transform hover:brightness-110">
                        Find Games Near You
                    </button>
                </div>`;
            return;
        }

        container.innerHTML = '';
        activeGames.forEach(game => {
            let timeString = formatTime12(game.time);
            if (game.endTime) timeString += ` - ${formatTime12(game.endTime)}`;

            container.innerHTML += `
                <div class="bg-white dark:bg-[#14171d] p-5 rounded-3xl border border-gray-200 dark:border-white/10 hover:border-[#ff751f]/50 transition-all cursor-pointer shadow-sm group" onclick="window.location.href='game-details.html?id=${game.id}'">
                    <div class="flex justify-between items-start mb-3">
                        <h4 class="font-headline text-lg font-black italic uppercase truncate text-gray-900 dark:text-white group-hover:text-[#ff751f] transition-colors">${escapeHTML(game.title)}</h4>
                        <span class="bg-[#ff751f]/10 text-[#ff751f] px-2 py-1 rounded-full border border-[#ff751f]/20 text-[9px] font-black uppercase tracking-tighter shrink-0">
                            ${game.spotsFilled || 0} / ${game.spotsTotal || 10} PLYRS
                        </span>
                    </div>
                    
                    <div class="flex items-center gap-2 mb-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                        <span class="material-symbols-outlined text-[14px]">calendar_today</span>
                        <span>${formatDateString(game.date)} • ${timeString}</span>
                    </div>

                    <p class="text-[11px] text-gray-500 dark:text-gray-400 font-bold flex items-center gap-1.5 truncate">
                        <span class="material-symbols-outlined text-[#ff751f] text-[14px]">location_on</span> ${escapeHTML(game.location)}
                    </p>
                </div>`;
        });
    } catch(e) { container.innerHTML = '<span class="text-red-500 block py-4 text-center col-span-full">Failed to load games.</span>'; }
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
        if (posts.length === 0) return container.innerHTML = '<span class="block text-gray-500 dark:text-gray-400 py-8 text-center w-full text-sm italic">No posts yet.</span>';

        posts.forEach(post => {
            const timeStr = post.createdAt ? `${Math.floor((Date.now() - post.createdAt.toMillis()) / 3600000)}h ago` : 'Recently';
            container.innerHTML += `
                <article class="bg-white dark:bg-[#14171d] rounded-3xl p-5 border border-gray-200 dark:border-white/10 shadow-sm text-left hover:border-[#ff751f]/40 transition-colors cursor-pointer" onclick="window.location.href='feeds.html#post-${post.id}'">
                    <div class="flex justify-between items-baseline mb-2">
                        <h4 class="font-bold text-sm text-gray-900 dark:text-white truncate">${escapeHTML(post.authorName)}</h4>
                        <span class="text-[10px] text-gray-400 font-black uppercase tracking-widest ml-2">${timeStr}</span>
                    </div>
                    <p class="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">${escapeHTML(post.content)}</p>
                </article>`;
        });
    } catch (error) {}
}

// --- EDIT PROFILE VIEW ---
async function initEditProfilePage(userData, user) {
    
    // Clear out the HTML Skeleton Loading state
    document.querySelectorAll('#edit-profile-form input, #edit-profile-form select, #edit-profile-form textarea').forEach(el => {
        el.classList.remove('animate-pulse', 'bg-surface-container-highest', 'text-transparent');
    });

    const nameInput = document.getElementById('displayName');
    const locationSelect = document.getElementById('edit-location');
    const skillSelect = document.getElementById('edit-skill');
    const positionSelect = document.getElementById('primaryPosition');
    const homeCourtInput = document.getElementById('homeCourt');
    const bioTextarea = document.getElementById('bio');
    
    const avatarInput = document.getElementById('avatar-input');
    const avatarPreview = document.getElementById('edit-avatar-preview');
    let selectedAvatarFile = null;

    const coverInput = document.getElementById('cover-input');
    const coverPreview = document.getElementById('edit-cover-preview');
    let selectedCoverFile = null;

    const datalist = document.getElementById('verified-courts-list');

    const ligaIdInput = document.getElementById('ligaID');
    const firstNameInput = document.getElementById('firstName');
    const lastNameInput = document.getElementById('lastName');

    if (ligaIdInput) ligaIdInput.value = userData.ligaID || user.uid; 
    if (firstNameInput) firstNameInput.value = userData.firstName || '';
    if (lastNameInput) lastNameInput.value = userData.lastName || '';

    if (locationSelect) {
        locationSelect.innerHTML = '<option value="" disabled selected>Select your city...</option>';
        metroManilaCities.forEach(city => {
            const opt = document.createElement('option');
            opt.value = city;
            opt.textContent = city;
            locationSelect.appendChild(opt);
        });
    }

    if (nameInput) nameInput.value = userData.displayName || user.displayName || '';
    if (positionSelect) positionSelect.value = userData.primaryPosition || 'PG';
    if (skillSelect) skillSelect.value = userData.skillLevel || 'Intermediate';
    if (bioTextarea) bioTextarea.value = userData.bio || '';
    
    setTimeout(() => {
        if (locationSelect && userData.location) {
            locationSelect.value = userData.location;
            locationSelect.dispatchEvent(new Event('change'));
        }
        setTimeout(() => {
            if (homeCourtInput && userData.homeCourt) {
                homeCourtInput.value = userData.homeCourt;
            }
        }, 100);
    }, 100);

    async function updateCourtsList(city) {
        if (!datalist) return;
        datalist.innerHTML = ''; 
        
        let allCourts = [];

        if (city && verifiedCourtsByCity[city]) {
            allCourts = [...verifiedCourtsByCity[city]];
        }

        if (city) {
            try {
                const q = query(collection(db, "courts"), where("city", "==", city));
                const snap = await getDocs(q);
                snap.forEach(doc => {
                    if (doc.data().status === "approved") {
                        const courtName = doc.data().name;
                        if (!allCourts.includes(courtName)) allCourts.push(courtName);
                    }
                });
            } catch(e) { console.error("Failed to fetch custom courts", e); }
        }

        allCourts.sort().forEach(court => {
            const option = document.createElement('option');
            option.value = court;
            datalist.appendChild(option);
        });
    }

    if (locationSelect) {
        locationSelect.addEventListener('change', (e) => {
            const newCity = e.target.value;
            updateCourtsList(newCity);
            if (homeCourtInput) homeCourtInput.value = ''; 
        });
    }

    // Avatar Setup
    if (avatarInput && avatarPreview) {
        const safeName = userData.displayName || user.displayName || 'Unknown Player';
        avatarPreview.src = userData.photoURL || user.photoURL || getFallbackAvatar(safeName);
        avatarPreview.onerror = function() {
            this.onerror = null;
            this.src = getFallbackAvatar(safeName);
        };
        
        avatarInput.addEventListener('change', (e) => {
            if (e.target.files[0]) {
                selectedAvatarFile = e.target.files[0];
                avatarPreview.src = URL.createObjectURL(selectedAvatarFile);
            }
        });
    }

    // Cover Photo Setup
    if (coverInput && coverPreview) {
        if (userData.coverURL) {
            coverPreview.src = userData.coverURL;
        }
        coverInput.addEventListener('change', (e) => {
            if (e.target.files[0]) {
                selectedCoverFile = e.target.files[0];
                coverPreview.src = URL.createObjectURL(selectedCoverFile);
            }
        });
    }

    // Self Ratings Setup
    const skillsList = ['shooting', 'passing', 'dribbling', 'rebounding', 'defense'];
    let currentSelfRatings = userData.selfRatings || { shooting: 3, passing: 3, dribbling: 3, rebounding: 3, defense: 3 };
    
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

    const form = document.getElementById('edit-profile-form');
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.innerHTML = '<span class="material-symbols-outlined text-[20px] animate-spin">sync</span> SAVING...';
            submitBtn.disabled = true;

            let finalPhotoURL = userData.photoURL || user.photoURL || null;
            let finalCoverURL = userData.coverURL || null;

            // Upload Avatar if changed
            if (selectedAvatarFile) {
                try {
                    submitBtn.innerHTML = '<span class="material-symbols-outlined text-[20px] animate-spin">sync</span> OPTIMIZING AVATAR...';
                    const optimizedBlob = await resizeAndCropImage(selectedAvatarFile, 300);
                    finalPhotoURL = await uploadImageFile(optimizedBlob, auth.currentUser.uid, 'avatars');
                } catch (err) {
                    alert("Failed to upload avatar: " + err.message);
                    submitBtn.innerHTML = '<span class="material-symbols-outlined text-[20px]">save</span> Save Changes';
                    submitBtn.disabled = false;
                    return;
                }
            }

            // Upload Cover if changed
            if (selectedCoverFile) {
                try {
                    submitBtn.innerHTML = '<span class="material-symbols-outlined text-[20px] animate-spin">sync</span> OPTIMIZING COVER...';
                    const optimizedCoverBlob = await resizeMaintainAspect(selectedCoverFile, 1200);
                    finalCoverURL = await uploadImageFile(optimizedCoverBlob, auth.currentUser.uid, 'covers');
                } catch (err) {
                    alert("Failed to upload cover photo: " + err.message);
                    submitBtn.innerHTML = '<span class="material-symbols-outlined text-[20px]">save</span> Save Changes';
                    submitBtn.disabled = false;
                    return;
                }
            }

            submitBtn.innerHTML = '<span class="material-symbols-outlined text-[20px] animate-spin">sync</span> SAVING DETAILS...';

            const newData = {
                displayName: nameInput.value || "",
                location: locationSelect.value || "",
                skillLevel: skillSelect.value || "",
                primaryPosition: positionSelect.value || "",
                homeCourt: homeCourtInput.value || "",
                bio: bioTextarea.value || "",
                selfRatings: currentSelfRatings,
            };
            
            if (finalPhotoURL) newData.photoURL = finalPhotoURL;
            if (finalCoverURL) newData.coverURL = finalCoverURL;

            try {
                const profileUpdates = { displayName: newData.displayName };
                if (finalPhotoURL) profileUpdates.photoURL = finalPhotoURL;
                await updateProfile(auth.currentUser, profileUpdates);
                
                await setDoc(doc(db, "users", auth.currentUser.uid), newData, { merge: true });
                
                const localProfile = JSON.parse(localStorage.getItem('ligaPhProfile') || '{}');
                const updatedLocalProfile = { ...localProfile, ...newData };
                localStorage.setItem('ligaPhProfile', JSON.stringify(updatedLocalProfile));

                submitBtn.innerHTML = '<span class="material-symbols-outlined text-[20px] animate-spin">sync</span> SYNCING RECORDS...';
                
                // Cross-sync displayName & avatar updates across collections
                const oldName = userData.displayName || user.displayName;
                const newName = newData.displayName;

                if ((oldName && oldName !== newName) || finalPhotoURL) {
                    try {
                        const syncPromises = [];

                        const gHostQ = query(collection(db, "games"), where("hostId", "==", auth.currentUser.uid));
                        const gHostSnap = await getDocs(gHostQ);
                        gHostSnap.forEach(g => {
                            syncPromises.push(updateDoc(doc(db, "games", g.id), { 
                                host: newName, 
                                hostPhoto: finalPhotoURL || null 
                            }).catch(e=>console.warn(e)));
                        });

                        const gPlayQ = query(collection(db, "games"), where("players", "array-contains", oldName));
                        const gPlaySnap = await getDocs(gPlayQ);
                        gPlaySnap.forEach(g => {
                            const pList = g.data().players.map(p => p === oldName ? newName : p);
                            syncPromises.push(updateDoc(doc(db, "games", g.id), { players: pList }).catch(e=>console.warn(e)));
                        });

                        const gAppQ = query(collection(db, "games"), where("applicants", "array-contains", oldName));
                        const gAppSnap = await getDocs(gAppQ);
                        gAppSnap.forEach(g => {
                            const aList = g.data().applicants.map(a => a === oldName ? newName : a);
                            syncPromises.push(updateDoc(doc(db, "games", g.id), { applicants: aList }).catch(e=>console.warn(e)));
                        });

                        const postsQ = query(collection(db, "posts"), where("authorId", "==", auth.currentUser.uid));
                        const postsSnap = await getDocs(postsQ);
                        postsSnap.forEach(p => {
                            syncPromises.push(updateDoc(doc(db, "posts", p.id), { 
                                authorName: newName, 
                                authorPhoto: finalPhotoURL || null,
                                authorPosition: newData.primaryPosition 
                            }).catch(e=>console.warn(e)));
                        });
                        
                        const squadQ = query(collection(db, "squads"), where("captainId", "==", auth.currentUser.uid));
                        const squadSnap = await getDocs(squadQ);
                        squadSnap.forEach(s => {
                            syncPromises.push(updateDoc(doc(db, "squads", s.id), { captainName: newName }).catch(e=>console.warn(e)));
                        });

                        await Promise.all(syncPromises);
                    } catch(e) { 
                        console.warn("Failed syncing records", e); 
                    }
                }

                window.location.href = 'profile.html';
            } catch (error) {
                console.error("Profile Save Error:", error);
                alert("Failed to save changes: " + error.message);
                submitBtn.innerHTML = '<span class="material-symbols-outlined text-[20px]">save</span> Save Changes';
                submitBtn.disabled = false;
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    
    if (path.includes('edit-profile')) {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    const docRef = doc(db, "users", user.uid);
                    const docSnap = await getDoc(docRef);
                    const userData = docSnap.exists() ? docSnap.data() : {};
                    initEditProfilePage(userData, user);
                } catch(e) {
                    console.error("Error fetching user data:", e);
                }
            } else {
                window.location.href = 'index.html';
            }
        });
    } else if (path.includes('profile')) {
        onAuthStateChanged(auth, (user) => { 
            initProfilePage(user); 
        });
        initTabs();
        initMobileDrawers();
    }
});
