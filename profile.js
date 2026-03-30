import { auth, db, storage } from './firebase-setup.js';
import { doc, getDoc, setDoc, collection, query, where, getDocs, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";

function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatDateString(dateStr, timeStr) {
    if (!dateStr || !timeStr) return 'TBA';
    try {
        const d = new Date(`${dateStr}T${timeStr}`);
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const isToday = d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
        const isTomorrow = d.getDate() === tomorrow.getDate() && d.getMonth() === tomorrow.getMonth() && d.getFullYear() === tomorrow.getFullYear();

        let dayStr = "";
        if (isToday) dayStr = "Today";
        else if (isTomorrow) dayStr = "Tomorrow";
        else {
            const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
            const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            dayStr = `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
        }

        let hours = d.getHours();
        let minutes = d.getMinutes();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        minutes = minutes < 10 ? '0' + minutes : minutes;

        return `${dayStr} • ${hours}:${minutes} ${ampm}`;
    } catch(e) {
        return `${dateStr} • ${timeStr}`;
    }
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
    if (manageBtn && rateBtn) {
        if (isOwnProfile) manageBtn.classList.remove('hidden');
        else rateBtn.classList.remove('hidden');
    }

    try {
        const docRef = doc(db, "users", finalUserId);
        const docSnap = await getDoc(docRef);
        let profileData = {};

        if (docSnap.exists()) {
            profileData = docSnap.data();
        } else if (isOwnProfile && currentUser) {
            let fallbackName = currentUser.displayName;
            if (!fallbackName && currentUser.email) {
                const emailPrefix = currentUser.email.split('@')[0];
                fallbackName = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
            }
            profileData = {
                displayName: fallbackName || "Unknown Player",
                primaryPosition: "UNASSIGNED",
                homeCourt: "Unknown Court",
                bio: "New player to Liga PH.",
                photoURL: currentUser.photoURL || null,
                selfRatings: { shooting: 3, passing: 3, dribbling: 3, rebounding: 3, defense: 3 }
            };
            await setDoc(docRef, profileData);
        } else {
            alert("Player not found.");
            return window.location.href = 'players.html';
        }

        // Populate Text UI
        document.getElementById('profile-name').textContent = profileData.displayName || "Unknown Player";
        document.getElementById('profile-name').classList.remove('animate-pulse', 'bg-surface-container-high', 'min-h-[3rem]', 'md:min-h-[4rem]', 'min-w-[200px]');
        document.getElementById('profile-bio').textContent = profileData.bio || "No bio available.";
        document.getElementById('profile-bio').classList.remove('animate-pulse', 'bg-surface-container-high', 'min-h-[4rem]');
        document.getElementById('profile-home-court').textContent = (profileData.homeCourt || "UNKNOWN COURT").toUpperCase();
        document.getElementById('profile-home-court').classList.remove('animate-pulse', 'min-w-[120px]', 'min-h-[24px]');

        let posText = profileData.primaryPosition || "UNASSIGNED";
        const posMap = { 'PG':'POINT GUARD', 'SG':'SHOOTING GUARD', 'SF':'SMALL FORWARD', 'PF':'POWER FORWARD', 'C':'CENTER' };
        document.getElementById('profile-position').textContent = posMap[posText] || posText;
        document.getElementById('profile-position').classList.remove('animate-pulse', 'min-w-[100px]', 'min-h-[24px]');

        const avatarImg = document.getElementById('profile-avatar');
        if (avatarImg) {
            document.getElementById('profile-avatar-container').classList.remove('animate-pulse', 'bg-surface-container-highest');
            if (profileData.photoURL) {
                avatarImg.src = profileData.photoURL;
                avatarImg.classList.remove('mix-blend-luminosity', 'opacity-80');
                avatarImg.style.filter = '';
            } else {
                avatarImg.src = "assets/default-avatar.jpg";
            }
            avatarImg.classList.remove('hidden');
        }

        // RENDER SELF RATINGS
        renderSkillBars('self-skill-breakdown', profileData.selfRatings || { shooting: 0, passing: 0, dribbling: 0, rebounding: 0, defense: 0 }, 1, true);

        loadUserActiveGames(profileData.displayName);
        loadUserPosts(finalUserId);
        setupRatings(finalUserId, currentUser);

    } catch (e) {
        console.error("Failed to load profile", e);
    }
}

// Helper to draw the skill bars
function renderSkillBars(containerId, dataObject, countDivider, isSelf) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (countDivider === 0) {
        container.innerHTML = '<p class="text-[10px] text-on-surface-variant italic text-center py-2 uppercase tracking-widest">No ratings yet</p>';
        return;
    }

    container.innerHTML = '';
    const skillsList = ['shooting', 'passing', 'dribbling', 'rebounding', 'defense'];
    const colorMap = { shooting: 'bg-primary', passing: 'bg-secondary', dribbling: 'bg-tertiary', rebounding: 'bg-primary', defense: 'bg-secondary' };
    const textMap = { shooting: 'text-primary', passing: 'text-secondary', dribbling: 'text-tertiary', rebounding: 'text-primary', defense: 'text-secondary' };

    skillsList.forEach(skill => {
        const avg = (dataObject[skill] || 0) / countDivider;
        const percentage = (avg / 5) * 100;
        
        container.innerHTML += `
            <div>
                <div class="flex justify-between items-center mb-1">
                    <span class="text-[10px] font-bold uppercase tracking-widest text-outline">${skill}</span>
                    <div class="flex items-center gap-1">
                        <span class="${textMap[skill]} font-black text-xs">${avg.toFixed(1)}</span>
                        ${isSelf ? '' : `<span class="material-symbols-outlined text-[10px] ${textMap[skill]}" style="font-variation-settings: 'FILL' 1;">star</span>`}
                    </div>
                </div>
                <div class="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden">
                    <div class="h-full ${colorMap[skill]}" style="width: ${percentage}%"></div>
                </div>
            </div>
        `;
    });
}

// -----------------------------------------------------
// COMMUNITY RATING LOGIC
// -----------------------------------------------------
async function setupRatings(targetUserId, currentUser) {
    const countBadge = document.getElementById('total-ratings-count');
    const skillsList = ['shooting', 'passing', 'dribbling', 'rebounding', 'defense'];
    let currentInputRatings = { shooting: 0, passing: 0, dribbling: 0, rebounding: 0, defense: 0 };
    let hasRated = false;

    try {
        const snap = await getDocs(query(collection(db, "ratings"), where("targetUserId", "==", targetUserId)));
        let totals = { shooting: 0, passing: 0, dribbling: 0, rebounding: 0, defense: 0 };
        let count = 0;

        snap.forEach(doc => {
            const data = doc.data();
            if (currentUser && data.raterId === currentUser.uid) hasRated = true;
            skillsList.forEach(s => totals[s] += (data[s] || 0));
            count++;
        });

        if (countBadge) countBadge.textContent = `${count} Ratings`;
        renderSkillBars('community-skill-breakdown', totals, count, false);

        // Setup Modal UI
        const rateBtn = document.getElementById('rate-player-btn');
        const rateSubtitle = document.getElementById('rate-player-subtitle');
        const modal = document.getElementById('rating-modal');

        if (hasRated && rateSubtitle && rateBtn) {
            rateSubtitle.textContent = "You've already rated this player";
            rateBtn.classList.add('opacity-50', 'cursor-not-allowed');
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

        // Inject Stars
        const starsContainer = document.getElementById('rating-stars-container');
        if (starsContainer) {
            starsContainer.innerHTML = '';
            skillsList.forEach(skill => {
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
                    setupRatings(targetUserId, currentUser); // Refresh community stats
                } catch (err) {
                    alert("Failed to submit rating.");
                    submitBtn.textContent = 'Submit';
                    submitBtn.disabled = false;
                }
            };
        }

    } catch (e) {
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
                activeGames.push(data);
            }
        });

        container.innerHTML = '';
        if (activeGames.length === 0) return container.innerHTML = '<span class="block text-on-surface-variant py-8">No active games.</span>';

        activeGames.forEach(game => {
            const img = game.imageUrl 
                ? `<div class="w-24 h-24 rounded-lg overflow-hidden shrink-0"><img src="${game.imageUrl}" class="w-full h-full object-cover"></div>`
                : `<div class="w-24 h-24 rounded-lg bg-surface-container flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-4xl text-tertiary/50">sports_basketball</span></div>`;

            container.innerHTML += `
                <div class="bg-surface-container-high rounded-lg p-4 flex gap-4 shadow-sm text-left">
                    ${img}
                    <div class="flex flex-col justify-between flex-1 min-w-0">
                        <span class="bg-tertiary/20 text-tertiary px-2 py-0.5 rounded text-[10px] font-black uppercase inline-block w-fit mb-1">${escapeHTML(game.type)}</span>
                        <h4 class="font-headline text-lg font-bold uppercase truncate">${escapeHTML(game.title)}</h4>
                        <p class="text-on-surface-variant text-xs truncate"><span class="material-symbols-outlined text-[14px] align-middle">location_on</span> ${escapeHTML(game.location)}</p>
                    </div>
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
        if (posts.length === 0) return container.innerHTML = '<span class="block text-on-surface-variant py-8">No posts yet.</span>';

        posts.forEach(post => {
            const timeStr = post.createdAt ? `${Math.floor((Date.now() - post.createdAt.toMillis()) / 3600000)}h ago` : 'Recently';
            container.innerHTML += `
                <article class="bg-surface-container-high rounded-2xl p-5 border border-outline-variant/10 shadow-sm text-left">
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
async function initEditProfilePage() {
    const docRef = doc(db, "users", auth.currentUser.uid);
    const docSnap = await getDoc(docRef);
    const profile = docSnap.exists() ? docSnap.data() : {};

    const nameInput = document.getElementById('displayName');
    const positionSelect = document.getElementById('primaryPosition');
    const homeCourtInput = document.getElementById('homeCourt');
    const bioTextarea = document.getElementById('bio');
    const avatarInput = document.getElementById('avatar-input');
    const avatarPreview = document.getElementById('edit-avatar-preview');
    let selectedAvatarFile = null;

    if (nameInput) nameInput.value = profile.displayName || '';
    if (positionSelect) positionSelect.value = profile.primaryPosition || 'UNASSIGNED';
    if (homeCourtInput) homeCourtInput.value = profile.homeCourt || '';
    if (bioTextarea) bioTextarea.value = profile.bio || '';

    // Init Self Rating Sliders
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
        if (profile.photoURL) {
            avatarPreview.src = profile.photoURL;
            avatarPreview.classList.remove('mix-blend-luminosity', 'opacity-80');
            avatarPreview.style.filter = '';
        }
        avatarInput.addEventListener('change', (e) => {
            if (e.target.files[0]) {
                selectedAvatarFile = e.target.files[0];
                avatarPreview.src = URL.createObjectURL(selectedAvatarFile);
                avatarPreview.classList.remove('mix-blend-luminosity', 'opacity-80');
                avatarPreview.style.filter = '';
            }
        });
    }

    const form = document.getElementById('edit-profile-form');
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.textContent = 'Saving...';
            submitBtn.disabled = true;

            let photoURL = profile.photoURL || null;

            if (selectedAvatarFile) {
                try {
                    const storageRef = ref(storage, `avatars/${auth.currentUser.uid}_${Date.now()}`);
                    const snapshot = await uploadBytes(storageRef, selectedAvatarFile);
                    photoURL = await getDownloadURL(snapshot.ref);
                } catch (err) {
                    alert("Failed to upload avatar.");
                    submitBtn.textContent = 'Save Changes';
                    submitBtn.disabled = false;
                    return;
                }
            }

            const newData = {
                displayName: nameInput.value,
                primaryPosition: positionSelect.value,
                homeCourt: homeCourtInput.value,
                bio: bioTextarea.value,
                selfRatings: currentSelfRatings, // Save the new self ratings!
                ...(photoURL && { photoURL: photoURL })
            };

            try {
                await updateProfile(auth.currentUser, { displayName: newData.displayName, photoURL: photoURL });
                await setDoc(doc(db, "users", auth.currentUser.uid), newData, { merge: true });
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
