import { auth, db, storage } from './firebase-setup.js';
import { doc, getDoc, setDoc, collection, query, where, getDocs, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";

// Utility formatting functions
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
// MAIN PROFILE PAGE LOGIC (View & Rate)
// -----------------------------------------------------
async function initProfilePage(currentUser) {
    const urlParams = new URLSearchParams(window.location.search);
    const targetId = urlParams.get('id');
    
    // Determine whose profile we are looking at
    const isOwnProfile = !targetId || (currentUser && targetId === currentUser.uid);
    const finalUserId = targetId || (currentUser ? currentUser.uid : null);

    if (!finalUserId) {
        // Guest trying to view own profile -> Send to login
        window.location.href = 'index.html';
        return;
    }

    // Toggle Action Buttons
    const manageBtn = document.getElementById('manage-profile-btn');
    const rateBtn = document.getElementById('rate-player-btn');
    if (manageBtn && rateBtn) {
        if (isOwnProfile) {
            manageBtn.classList.remove('hidden');
        } else {
            rateBtn.classList.remove('hidden');
        }
    }

    // 1. Fetch User Data
    try {
        const docRef = doc(db, "users", finalUserId);
        const docSnap = await getDoc(docRef);
        
        let profileData;
        if (docSnap.exists()) {
            profileData = docSnap.data();
        } else if (isOwnProfile && currentUser) {
            // Auto-generate profile if it's the current user and it's missing
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
                photoURL: currentUser.photoURL || null
            };
            await setDoc(docRef, profileData);
        } else {
            alert("Player not found.");
            window.location.href = 'players.html';
            return;
        }

        // 2. Populate UI
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

        const avatarContainer = document.getElementById('profile-avatar-container');
        const avatarImg = document.getElementById('profile-avatar');
        if (avatarContainer && avatarImg) {
            avatarContainer.classList.remove('animate-pulse', 'bg-surface-container-highest');
            if (profileData.photoURL) {
                avatarImg.src = profileData.photoURL;
                avatarImg.classList.remove('mix-blend-luminosity', 'opacity-80');
                avatarImg.style.filter = '';
            } else {
                avatarImg.src = "assets/default-avatar.jpg";
                avatarImg.classList.add('mix-blend-luminosity', 'opacity-80');
                avatarImg.style.filter = 'sepia(1) hue-rotate(-50deg) saturate(3)';
            }
            avatarImg.classList.remove('hidden');
        }

        // 3. Load Games, Posts, and Ratings
        loadUserActiveGames(profileData.displayName);
        loadUserPosts(finalUserId);
        setupRatings(finalUserId, currentUser);

    } catch (e) {
        console.error("Failed to load profile", e);
    }
}

// -----------------------------------------------------
// RATING SYSTEM LOGIC
// -----------------------------------------------------
async function setupRatings(targetUserId, currentUser) {
    const breakdownContainer = document.getElementById('skill-breakdown-container');
    const countBadge = document.getElementById('total-ratings-count');

    if (!targetUserId) {
        if (breakdownContainer) breakdownContainer.innerHTML = '<p class="text-sm text-on-surface-variant italic text-center py-4">Unable to load ratings.</p>';
        return;
    }

    const skillsList = ['shooting', 'passing', 'dribbling', 'rebounding', 'defense'];
    let currentInputRatings = { shooting: 0, passing: 0, dribbling: 0, rebounding: 0, defense: 0 };
    let hasRated = false;

    try {
        // 1. Fetch Existing Ratings
        const ratingsRef = collection(db, "ratings");
        const q = query(ratingsRef, where("targetUserId", "==", targetUserId));
        const snap = await getDocs(q);

        let totals = { shooting: 0, passing: 0, dribbling: 0, rebounding: 0, defense: 0 };
        let count = 0;

        snap.forEach(doc => {
            const data = doc.data();
            if (currentUser && data.raterId === currentUser.uid) hasRated = true;
            skillsList.forEach(s => totals[s] += (data[s] || 0));
            count++;
        });

        // 2. Render Skill Breakdown (Averages)
        if (countBadge) countBadge.textContent = `${count} Ratings`;
        
        if (breakdownContainer) {
            breakdownContainer.innerHTML = ''; // This clears the skeletal loaders!
            
            if (count === 0) {
                breakdownContainer.innerHTML = '<p class="text-sm text-on-surface-variant italic text-center py-4">No ratings yet. Be the first to scout them!</p>';
            } else {
                const colorMap = { shooting: 'bg-primary', passing: 'bg-secondary', dribbling: 'bg-tertiary', rebounding: 'bg-primary', defense: 'bg-secondary' };
                const textMap = { shooting: 'text-primary', passing: 'text-secondary', dribbling: 'text-tertiary', rebounding: 'text-primary', defense: 'text-secondary' };

                skillsList.forEach(skill => {
                    const avg = totals[skill] / count;
                    const percentage = (avg / 5) * 100;
                    
                    breakdownContainer.innerHTML += `
                        <div>
                            <div class="flex justify-between items-center mb-2">
                                <span class="text-[10px] font-bold uppercase tracking-widest text-outline">${skill}</span>
                                <div class="flex items-center gap-1">
                                    <span class="${textMap[skill]} font-black text-xs">${avg.toFixed(1)}</span>
                                    <span class="material-symbols-outlined text-[10px] ${textMap[skill]}" style="font-variation-settings: 'FILL' 1;">star</span>
                                </div>
                            </div>
                            <div class="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden">
                                <div class="h-full ${colorMap[skill]}" style="width: ${percentage}%"></div>
                            </div>
                        </div>
                    `;
                });
            }
        }

        // 3. Setup Rating Modal UI
        const rateBtn = document.getElementById('rate-player-btn');
        const rateSubtitle = document.getElementById('rate-player-subtitle');
        const modal = document.getElementById('rating-modal');
        const closeBtn = document.getElementById('close-rating-modal');
        const starsContainer = document.getElementById('rating-stars-container');

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

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.classList.add('opacity-0');
                modal.querySelector('div').classList.add('scale-95');
                setTimeout(() => modal.classList.add('hidden'), 300);
            });
        }

        // Inject Stars into Modal
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

            // Handle Star Clicking
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

        // Handle Submit
        const form = document.getElementById('rating-form');
        if (form) {
            form.onsubmit = async (e) => {
                e.preventDefault();
                
                if (Object.values(currentInputRatings).some(v => v === 0)) {
                    return alert("Please provide a star rating for all 5 skills.");
                }

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
                    
                    alert("Scouting report submitted successfully!");
                    modal.classList.add('hidden');
                    
                    // Refresh data
                    setupRatings(targetUserId, currentUser);
                    
                } catch (err) {
                    console.error("Rating submission failed:", err);
                    alert("Failed to submit rating.");
                    submitBtn.textContent = 'Submit';
                    submitBtn.disabled = false;
                }
            };
        }

    } catch (e) {
        console.error("Error loading ratings", e);
        // Safety net: Clear the skeleton even if the database fails!
        if (breakdownContainer) {
            breakdownContainer.innerHTML = '<p class="text-sm text-error italic text-center py-4">Failed to load ratings. Please check database rules or connection.</p>';
        }
    }
}

// -----------------------------------------------------
// TABS & DATA LOADING (Games & Posts)
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
        const games = [];
        querySnapshot.forEach((doc) => games.push({ id: doc.id, ...doc.data() }));

        const activeGames = games.filter(game => {
            return game.host === displayName || (game.players && Array.isArray(game.players) && game.players.includes(displayName));
        });

        container.innerHTML = '';
        if (activeGames.length === 0) {
            container.innerHTML = '<span class="block text-on-surface-variant py-8">No active games.</span>';
            return;
        }

        activeGames.forEach(game => {
            const formattedDateTime = formatDateString(game.date, game.time);
            const imageSection = game.imageUrl 
                ? `<div class="w-24 h-24 md:w-32 md:h-32 rounded-lg overflow-hidden shrink-0"><img src="${game.imageUrl}" class="w-full h-full object-cover"></div>`
                : `<div class="w-24 h-24 md:w-32 md:h-32 rounded-lg bg-surface-container flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-4xl text-tertiary/50">sports_basketball</span></div>`;

            container.innerHTML += `
                <div class="bg-surface-container-high rounded-lg p-4 flex gap-4 hover:bg-surface-bright transition-all cursor-pointer shadow-sm text-left" onclick="window.location.href='game-details.html'">
                    ${imageSection}
                    <div class="flex flex-col justify-between flex-1 min-w-0">
                        <div>
                            <div class="flex justify-between items-start mb-1">
                                <span class="bg-tertiary/20 text-tertiary px-2 py-0.5 rounded text-[10px] font-black uppercase">${escapeHTML(game.type)}</span>
                                <span class="text-on-surface-variant font-bold text-[10px] md:text-xs uppercase ml-2">${formattedDateTime}</span>
                            </div>
                            <h4 class="font-headline text-lg md:text-xl font-bold uppercase truncate">${escapeHTML(game.title)}</h4>
                            <p class="text-on-surface-variant text-xs md:text-sm truncate"><span class="material-symbols-outlined text-[14px] align-middle">location_on</span> ${escapeHTML(game.location)}</p>
                        </div>
                    </div>
                </div>
            `;
        });
    } catch(e) {
        container.innerHTML = '<span class="block text-error py-8">Error loading games.</span>';
    }
}

async function loadUserPosts(userId) {
    const container = document.getElementById('profile-posts-container');
    if (!container || !userId) return;

    try {
        const postsRef = collection(db, "posts");
        const snap = await getDocs(query(postsRef, where("authorId", "==", userId)));
        const posts = [];
        snap.forEach(doc => posts.push({ id: doc.id, ...doc.data() }));

        posts.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));

        container.innerHTML = '';
        if (posts.length === 0) {
            container.innerHTML = '<span class="block text-on-surface-variant py-8">No posts yet.</span>';
            return;
        }

        posts.forEach(post => {
            const timeStr = post.createdAt ? `${Math.floor((Date.now() - post.createdAt.toMillis()) / (1000 * 60 * 60))}h ago` : 'Recently';
            container.innerHTML += `
                <article class="bg-surface-container-high rounded-2xl p-5 border border-outline-variant/10 shadow-sm text-left w-full">
                    <div class="flex justify-between items-baseline mb-2">
                        <h4 class="font-bold text-sm text-on-surface truncate">${escapeHTML(post.authorName)}</h4>
                        <span class="text-[10px] text-outline font-medium shrink-0 ml-2">${timeStr}</span>
                    </div>
                    <p class="text-sm text-on-surface-variant whitespace-pre-wrap">${escapeHTML(post.content)}</p>
                </article>
            `;
        });
    } catch (error) {
        container.innerHTML = '<span class="block text-error py-8">Error loading posts.</span>';
    }
}

// -----------------------------------------------------
// EDIT PROFILE LOGIC
// -----------------------------------------------------
async function initEditProfilePage() {
    // Only fetch for current user when editing
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

            if (selectedAvatarFile && auth.currentUser) {
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

// -----------------------------------------------------
// INITIALIZATION ROUTER
// -----------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;

    if (path.includes('edit-profile')) {
        // Wait for auth to ensure we can edit
        onAuthStateChanged(auth, (user) => {
            if (user) initEditProfilePage();
            else window.location.href = 'index.html';
        });
    } else if (path.includes('profile')) {
        // Wait for auth to resolve guest vs logged-in state
        onAuthStateChanged(auth, (user) => {
            initProfilePage(user);
        });
    }
});
