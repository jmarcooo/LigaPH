// profile.js
import { auth, db } from './firebase-setup.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

const DEFAULT_PROFILE = {
    displayName: "MARCUS R.",
    primaryPosition: "PG",
    homeCourt: "DOWNTOWN COURT",
    bio: "Point guard focused on high-intensity street play. Always looking for competitive full-court runs and tactical league matchups in the downtown area."
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
