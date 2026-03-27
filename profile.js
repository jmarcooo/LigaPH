// profile.js

const DEFAULT_PROFILE = {
    displayName: "MARCUS R.",
    primaryPosition: "PG",
    homeCourt: "DOWNTOWN COURT",
    bio: "Point guard focused on high-intensity street play. Always looking for competitive full-court runs and tactical league matchups in the downtown area."
};

function getProfileData() {
    const data = localStorage.getItem('ligaPhProfile');
    if (data) {
        return JSON.parse(data);
    }
    return DEFAULT_PROFILE;
}

function saveProfileData(data) {
    localStorage.setItem('ligaPhProfile', JSON.stringify(data));
}

function initProfilePage() {
    const profile = getProfileData();

    // Elements to update
    const nameEl = document.getElementById('profile-name');
    const positionEl = document.getElementById('profile-position');
    const homeCourtEl = document.getElementById('profile-home-court');
    const bioEl = document.getElementById('profile-bio');

    if (nameEl) nameEl.textContent = profile.displayName;

    // Map position code to friendly name or just code
    if (positionEl) {
        let positionText = profile.primaryPosition;
        if (profile.primaryPosition === 'PG') positionText = 'POINT GUARD';
        if (profile.primaryPosition === 'SG') positionText = 'SHOOTING GUARD';
        if (profile.primaryPosition === 'SF') positionText = 'SMALL FORWARD';
        if (profile.primaryPosition === 'PF') positionText = 'POWER FORWARD';
        if (profile.primaryPosition === 'C') positionText = 'CENTER';
        positionEl.textContent = positionText;
    }

    if (homeCourtEl) homeCourtEl.textContent = profile.homeCourt.toUpperCase();
    if (bioEl) bioEl.textContent = profile.bio;
}

function initEditProfilePage() {
    const profile = getProfileData();

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
