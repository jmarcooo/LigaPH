// profile.js
import { auth, db } from './firebase-setup.js';
import { doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

const DEFAULT_PROFILE = {
    displayName: "MARCUS R.",
    primaryPosition: "PG",
    homeCourt: "DOWNTOWN COURT",
    bio: "Point guard focused on high-intensity street play. Always looking for competitive full-court runs and tactical league matchups in the downtown area.",
    reliability: "100%",
    joinedDate: "Sat, Oct 12 • 09:00",
    hostedDate: "Tomorrow • 18:00"
};

async function getProfileData() {
    return new Promise((resolve) => {
        // Fallback to local storage
        const fallback = () => {
            const data = localStorage.getItem('ligaPhProfile');
            if (data) {
                resolve(JSON.parse(data));
            } else {
                resolve(DEFAULT_PROFILE);
            }
        };

        // If auth is already initialized and user is present
        const user = auth.currentUser;
        if (user) {
            fetchFromFirestore(user).then(resolve).catch(() => fallback());
        } else {
            // Listen for auth state change
            const unsubscribe = onAuthStateChanged(auth, (u) => {
                unsubscribe(); // Stop listening after first emission
                if (u) {
                    fetchFromFirestore(u).then(resolve).catch(() => fallback());
                } else {
                    fallback();
                }
            });
            // Timeout safety just in case auth hangs
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
            // Sync local storage with fetched data
            saveProfileData(data);
            return data;
        } else {
            throw new Error("No profile document found.");
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

    // Elements to update
    const nameEl = document.getElementById('profile-name');
    const positionEl = document.getElementById('profile-position');
    const homeCourtEl = document.getElementById('profile-home-court');
    const bioEl = document.getElementById('profile-bio');
    const reliabilityEl = document.getElementById('profile-reliability');
    const avatarContainerEl = document.getElementById('profile-avatar-container');
    const avatarImgEl = document.getElementById('profile-avatar');
    const joinedDateEl = document.getElementById('profile-joined-date');
    const hostedDateEl = document.getElementById('profile-hosted-date');

    if (nameEl) {
        nameEl.classList.remove('animate-pulse', 'bg-surface-container-high', 'min-h-[3rem]', 'md:min-h-[4rem]', 'min-w-[200px]');
        nameEl.textContent = profile.displayName || "Unknown Player";
    }

    // Map position code to friendly name or just code
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

    if (joinedDateEl) {
        joinedDateEl.classList.remove('animate-pulse', 'min-w-[120px]', 'min-h-[16px]', 'bg-surface-container-highest', 'rounded');
        joinedDateEl.textContent = profile.joinedDate || "Date Unavailable";
    }

    if (hostedDateEl) {
        hostedDateEl.classList.remove('animate-pulse', 'min-w-[120px]', 'min-h-[16px]', 'bg-surface-container-highest', 'rounded');
        hostedDateEl.textContent = profile.hostedDate || "Date Unavailable";
    }

    // Default fallback image if no photoURL is available yet
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

    // Load user's active games
    await loadUserActiveGames(profile.displayName);
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
        // Fetch all games because we want to check where players array contains the user OR user is host
        const querySnapshot = await getDocs(collection(db, "games"));
        const games = [];
        querySnapshot.forEach((doc) => {
            games.push({ id: doc.id, ...doc.data() });
        });

        // Filter games where user is host or in players list
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

async function initEditProfilePage() {
    const profile = await getProfileData();

    const nameInput = document.getElementById('displayName');
    const positionSelect = document.getElementById('primaryPosition');
    const homeCourtInput = document.getElementById('homeCourt');
    const bioTextarea = document.getElementById('bio');

    if (nameInput) nameInput.value = profile.displayName;
    if (positionSelect) positionSelect.value = profile.primaryPosition;
    if (homeCourtInput) homeCourtInput.value = profile.homeCourt;
    if (bioTextarea) bioTextarea.value = profile.bio;

    const form = document.getElementById('edit-profile-form');
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();

            const newData = {
                displayName: nameInput.value,
                primaryPosition: positionSelect.value,
                homeCourt: homeCourtInput.value,
                bio: bioTextarea.value
            };

            saveProfileData(newData);

            // Also try to save to Firebase if available
            if (window.firebaseAuthAPI && window.firebaseAuthAPI.updateProfile) {
                // Change submit button text to show loading
                const submitBtn = form.querySelector('button[type="submit"]');
                const originalText = submitBtn.textContent;
                submitBtn.textContent = 'Saving...';
                submitBtn.disabled = true;

                await window.firebaseAuthAPI.updateProfile(newData);

                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            }

            window.location.href = 'profile.html';
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Determine which page we are on
    const path = window.location.pathname;

    if (path.includes('edit-profile.html')) {
        initEditProfilePage();
    } else if (path.includes('profile.html')) {
        initProfilePage();
    }
});
