import { auth, db, storage } from './firebase-setup.js';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";

const DEFAULT_PROFILE = {
    displayName: "Unknown Player",
    primaryPosition: "PG",
    homeCourt: "Local Court",
    bio: "Ready to play.",
    reliability: "100%",
    joinedDate: "Sat, Oct 12 • 09:00",
    hostedDate: "Tomorrow • 18:00"
};

async function getProfileData() {
    return new Promise((resolve) => {
        const fallback = () => {
            const data = localStorage.getItem('ligaPhProfile');
            if (data) {
                resolve(JSON.parse(data));
            } else {
                resolve(DEFAULT_PROFILE);
            }
        };

        const user = auth.currentUser;
        if (user) {
            fetchFromFirestore(user).then(resolve).catch(() => fallback());
        } else {
            const unsubscribe = onAuthStateChanged(auth, (u) => {
                unsubscribe();
                if (u) {
                    fetchFromFirestore(u).then(resolve).catch(() => fallback());
                } else {
                    fallback();
                }
            });
            setTimeout(() => fallback(), 3000);
        }
    });
}

async function fetchFromFirestore(user) {
    try {
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            saveProfileData(data);
            return data;
        } else {
            // FIX: If the user doc is missing (old account), auto-generate it!
            let fallbackName = user.displayName;
            if (!fallbackName && user.email) {
                const emailPrefix = user.email.split('@')[0];
                fallbackName = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
            }

            const newProfile = {
                displayName: fallbackName || "Unknown Player",
                primaryPosition: "UNASSIGNED",
                homeCourt: "Unknown Court",
                bio: "New player to Liga PH.",
                photoURL: user.photoURL || null
            };

            // Save the auto-generated profile to Firestore immediately
            await setDoc(docRef, newProfile);
            saveProfileData(newProfile);
            return newProfile;
        }
    } catch (e) {
        console.warn("Firestore fetch failed, falling back to local storage.", e);
        throw e;
    }
}

function saveProfileData(data) {
    localStorage.setItem('ligaPhProfile', JSON.stringify(data));
}

async function initProfilePage() {
    const profile = await getProfileData();

    const nameEl = document.getElementById('profile-name');
    const positionEl = document.getElementById('profile-position');
    const homeCourtEl = document.getElementById('profile-home-court');
    const bioEl = document.getElementById('profile-bio');
    const reliabilityEl = document.getElementById('profile-reliability');
    const avatarContainerEl = document.getElementById('profile-avatar-container');
    const avatarImgEl = document.getElementById('profile-avatar');

    if (nameEl) {
        nameEl.classList.remove('animate-pulse', 'bg-surface-container-high', 'min-h-[3rem]', 'md:min-h-[4rem]', 'min-w-[200px]');
        nameEl.textContent = profile.displayName || "Unknown Player";
    }

    if (positionEl) {
        positionEl.classList.remove('animate-pulse', 'min-w-[100px]', 'min-h-[24px]');
        let positionText = profile.primaryPosition || "UNASSIGNED";
        if (profile.primaryPosition === 'PG') positionText = 'POINT GUARD';
        if (profile.primaryPosition === 'SG') positionText = 'SHOOTING GUARD';
        if (profile.primaryPosition === 'SF') positionText = 'SMALL FORWARD';
        if (profile.primaryPosition === 'PF') positionText = 'POWER FORWARD';
        if (profile.primaryPosition === 'C') positionText = 'CENTER';
        positionEl.textContent = positionText;
    }

    if (homeCourtEl) {
        homeCourtEl.classList.remove('animate-pulse', 'min-w-[120px]', 'min-h-[24px]');
        homeCourtEl.textContent = (profile.homeCourt || "UNKNOWN COURT").toUpperCase();
    }
    if (bioEl) {
        bioEl.classList.remove('animate-pulse', 'bg-surface-container-high', 'min-h-[4rem]');
        bioEl.textContent = profile.bio || "No bio available.";
    }
    if (reliabilityEl) {
        reliabilityEl.classList.remove('animate-pulse', 'min-w-[120px]', 'min-h-[24px]');
        reliabilityEl.textContent = (profile.reliability || "100%") + " RELIABILITY";
    }

    if (avatarContainerEl && avatarImgEl) {
        avatarContainerEl.classList.remove('animate-pulse', 'bg-surface-container-highest');
        if (profile.photoURL) {
            avatarImgEl.src = profile.photoURL;
            avatarImgEl.classList.remove('mix-blend-luminosity', 'opacity-80');
            avatarImgEl.style.filter = '';
        } else {
            avatarImgEl.src = "assets/default-avatar.jpg";
            avatarImgEl.classList.add('mix-blend-luminosity', 'opacity-80');
            avatarImgEl.style.filter = 'sepia(1) hue-rotate(-50deg) saturate(3)';
        }
        avatarImgEl.classList.remove('hidden');
    }

    await loadUserActiveGames(profile.displayName);

    if (auth.currentUser) {
        await loadUserPosts(auth.currentUser.uid);
    } else {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                await loadUserPosts(user.uid);
            } else {
                const postsContainer = document.getElementById('profile-posts-container');
                if (postsContainer) postsContainer.innerHTML = '<span class="block text-on-surface-variant p-8">No posts to display.</span>';
            }
            unsubscribe();
        });
    }

    initTabs();
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

function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

async function loadUserActiveGames(displayName) {
    const container = document.getElementById('profile-games-container');
    if (!container || !displayName) return;

    try {
        const querySnapshot = await getDocs(collection(db, "games"));
        const games = [];
        querySnapshot.forEach((doc) => {
            games.push({ id: doc.id, ...doc.data() });
        });

        const activeGames = games.filter(game => {
            const isHost = game.host === displayName;
            const isPlayer = game.players && Array.isArray(game.players) && game.players.includes(displayName);
            return isHost || isPlayer;
        });

        container.innerHTML = '';

        if (activeGames.length === 0) {
            container.innerHTML = '<span class="block text-on-surface-variant p-8">No active games.</span>';
            return;
        }

        activeGames.forEach(game => {
            let icon = 'sports_basketball';
            if (game.type === 'league') icon = 'emoji_events';
            else if (game.type === 'training') icon = 'fitness_center';

            const remaining = game.spotsTotal - game.spotsFilled;
            const formattedDateTime = formatDateString(game.date, game.time);

            const safeTitle = escapeHTML(game.title);
            const safeLocation = escapeHTML(game.location);
            const safeType = escapeHTML(game.type);

            const hasImage = !!game.imageUrl;
            let imageSection = '';

            if (hasImage) {
                imageSection = `
                <div class="w-24 h-24 md:w-32 md:h-32 rounded-lg overflow-hidden shrink-0">
                    <img src="${game.imageUrl}" alt="${safeTitle}" class="w-full h-full object-cover">
                </div>`;
            } else {
                imageSection = `
                <div class="w-24 h-24 md:w-32 md:h-32 rounded-lg overflow-hidden shrink-0 bg-surface-container flex items-center justify-center">
                    <span class="material-symbols-outlined text-4xl text-tertiary/50">${icon}</span>
                </div>`;
            }

            const cardHTML = `
                <div class="bg-surface-container-high rounded-lg p-4 flex gap-4 hover:bg-surface-bright transition-all cursor-pointer group shadow-sm hover:shadow-md text-left" onclick="window.location.href='game-details.html'">
                    ${imageSection}
                    <div class="flex flex-col justify-between flex-1 min-w-0">
                        <div>
                            <div class="flex justify-between items-start mb-1">
                                <span class="bg-tertiary/20 text-tertiary px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tighter shrink-0">${safeType}</span>
                                <span class="text-on-surface-variant font-bold text-[10px] md:text-xs uppercase whitespace-nowrap ml-2">${formattedDateTime}</span>
                            </div>
                            <h4 class="font-headline text-lg md:text-xl font-bold uppercase tracking-tight mb-1 truncate">${safeTitle}</h4>
                            <p class="text-on-surface-variant text-xs md:text-sm truncate"><span class="material-symbols-outlined text-[14px] align-middle mr-1">location_on</span>${safeLocation}</p>
                        </div>
                        <div class="mt-2 flex justify-between items-end">
                            <div class="flex-1 mr-4">
                                <div class="flex justify-between items-center mb-1">
                                    <span class="text-[10px] font-bold text-outline uppercase tracking-widest">${remaining} spots left</span>
                                    <span class="text-secondary font-black text-xs">${game.spotsFilled}/${game.spotsTotal}</span>
                                </div>
                                <div class="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden">
                                    <div class="h-full bg-secondary" style="width: ${(game.spotsFilled / game.spotsTotal) * 100}%"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', cardHTML);
        });

    } catch(e) {
        console.error("Error loading active games:", e);
        container.innerHTML = '<span class="block text-error p-8">Error loading games.</span>';
    }
}

async function loadUserPosts(userId) {
    const container = document.getElementById('profile-posts-container');
    if (!container || !userId) return;

    try {
        const postsRef = collection(db, "posts");
        const q = query(postsRef, where("authorId", "==", userId));
        const snapshot = await getDocs(q);

        const posts = [];
        snapshot.forEach(doc => {
            posts.push({ id: doc.id, ...doc.data() });
        });

        posts.sort((a, b) => {
            const timeA = a.createdAt ? a.createdAt.toMillis() : 0;
            const timeB = b.createdAt ? b.createdAt.toMillis() : 0;
            return timeB - timeA;
        });

        container.innerHTML = '';

        if (posts.length === 0) {
            container.innerHTML = '<span class="block text-on-surface-variant p-8">No posts yet.</span>';
            return;
        }

        posts.forEach(post => {
            const safeName = escapeHTML(post.authorName);
            const safeContent = escapeHTML(post.content);
            const safeLoc = escapeHTML(post.location);
            const photoUrl = post.authorPhoto || 'assets/default-avatar.jpg';

            let timeStr = "Recently";
            if (post.createdAt) {
                const diff = Date.now() - post.createdAt.toMillis();
                const hours = Math.floor(diff / (1000 * 60 * 60));
                if (hours < 1) timeStr = 'Just now';
                else if (hours < 24) timeStr = `${hours}h ago`;
                else timeStr = `${Math.floor(hours/24)}d ago`;
            }

            const card = document.createElement('article');
            card.className = 'bg-surface-container-high rounded-2xl p-5 border border-outline-variant/10 shadow-sm text-left w-full';

            let imageHtml = '';
            if (post.imageUrl) {
                imageHtml = `
                    <div class="w-full h-64 sm:h-80 rounded-xl overflow-hidden mt-4 mb-2 bg-surface-container-highest">
                        <img src="${post.imageUrl}" alt="Post image" class="w-full h-full object-cover">
                    </div>
                `;
            }

            let locHtml = '';
            if (post.location) {
                locHtml = `
                    <div class="flex items-center gap-1 text-[10px] font-bold text-primary uppercase tracking-widest mt-1">
                        <span class="material-symbols-outlined text-[12px]">location_on</span>
                        ${safeLoc}
                    </div>
                `;
            }

            card.innerHTML = `
                <div class="flex gap-3 items-start">
                    <div class="w-10 h-10 rounded-full overflow-hidden border border-outline-variant/30 shrink-0 bg-surface-container">
                        <img src="${photoUrl}" alt="${safeName}" onerror="this.src='assets/default-avatar.jpg'" class="w-full h-full object-cover">
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex justify-between items-baseline">
                            <h4 class="font-bold text-sm text-on-surface truncate">${safeName}</h4>
                            <span class="text-[10px] text-outline font-medium shrink-0 ml-2">${timeStr}</span>
                        </div>
                        ${locHtml}
                        <p class="text-sm text-on-surface-variant mt-2 whitespace-pre-wrap leading-relaxed">${safeContent}</p>
                        ${imageHtml}

                        <div class="flex gap-6 mt-4 pt-3 border-t border-outline-variant/10">
                            <button class="flex items-center gap-1.5 text-on-surface-variant hover:text-primary transition-colors text-xs font-bold">
                                <span class="material-symbols-outlined text-[18px]">favorite</span>
                                ${post.likes || 0}
                            </button>
                            <button class="flex items-center gap-1.5 text-on-surface-variant hover:text-secondary transition-colors text-xs font-bold">
                                <span class="material-symbols-outlined text-[18px]">chat_bubble</span>
                                ${post.commentsCount || 0}
                            </button>
                        </div>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });

    } catch (error) {
        console.error("Error loading posts:", error);
        container.innerHTML = '<span class="block text-error p-8">Error loading posts.</span>';
    }
}

async function initEditProfilePage() {
    const profile = await getProfileData();

    const nameInput = document.getElementById('displayName');
    const positionSelect = document.getElementById('primaryPosition');
    const homeCourtInput = document.getElementById('homeCourt');
    const bioTextarea = document.getElementById('bio');

    const avatarInput = document.getElementById('avatar-input');
    const avatarPreview = document.getElementById('edit-avatar-preview');
    let selectedAvatarFile = null;

    if (nameInput) nameInput.value = profile.displayName;
    if (positionSelect) positionSelect.value = profile.primaryPosition;
    if (homeCourtInput) homeCourtInput.value = profile.homeCourt;
    if (bioTextarea) bioTextarea.value = profile.bio;

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
            const originalText = submitBtn.textContent;
            submitBtn.textContent = 'Saving Profile...';
            submitBtn.disabled = true;

            let photoURL = profile.photoURL || null;

            // Upload image to Firebase Storage if a new one was selected
            if (selectedAvatarFile && auth.currentUser) {
                try {
                    const timestamp = Date.now();
                    const storageRef = ref(storage, `avatars/${auth.currentUser.uid}_${timestamp}`);
                    const snapshot = await uploadBytes(storageRef, selectedAvatarFile);
                    photoURL = await getDownloadURL(snapshot.ref);
                } catch (err) {
                    console.error("Avatar upload failed:", err);
                    alert("Failed to upload avatar.");
                    submitBtn.textContent = originalText;
                    submitBtn.disabled = false;
                    return; // Stop if upload fails
                }
            }

            const newData = {
                displayName: nameInput.value,
                primaryPosition: positionSelect.value,
                homeCourt: homeCourtInput.value,
                bio: bioTextarea.value,
                ...(photoURL && { photoURL: photoURL })
            };

            // FIX: Save directly to Firebase Database from this file
            if (auth.currentUser) {
                try {
                    // Update Auth Profile
                    await updateProfile(auth.currentUser, {
                        displayName: newData.displayName,
                        photoURL: photoURL
                    });
                    
                    // Update Database Document
                    await setDoc(doc(db, "users", auth.currentUser.uid), newData, { merge: true });
                    
                    // Update Local Storage
                    saveProfileData(newData);
                    
                    // Redirect back to profile page
                    window.location.href = 'profile.html';
                } catch (error) {
                    console.error("Error saving profile to Firebase:", error);
                    alert("Failed to save changes.");
                    submitBtn.textContent = originalText;
                    submitBtn.disabled = false;
                }
            }
        });
    }
}

// At the very bottom of profile.js
document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;

    // Check for "edit-profile" first because "profile" is a substring of it!
    if (path.includes('edit-profile')) {
        initEditProfilePage();
    } else if (path.includes('profile')) {
        initProfilePage();
    }
});
