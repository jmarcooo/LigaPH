import { auth, db } from './firebase-setup.js';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { generate12DigitId, requestAndSaveDeviceToken } from './utils.js';

export async function handleLogout() {
    try { await signOut(auth); } catch (error) { console.error("Logout error:", error); }
    localStorage.removeItem('ligaPhProfile');
    localStorage.removeItem('ligaPhUser');
    window.location.replace('index.html');
}

export async function handleLoginFunc() {}
export async function handleSignupFunc() {}
export async function handleGoogleAuth() {}

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');

    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault(); 
            
            const firstNameInput = document.getElementById('signup-first-name');
            const lastNameInput = document.getElementById('signup-last-name');
            const locationInput = document.getElementById('signup-location');
            const homeCourtInput = document.getElementById('signup-home-court');
            const skillInput = document.getElementById('signup-skill');
            const positionInput = document.getElementById('signup-position');
            const emailInput = document.getElementById('signup-email');
            const passwordInput = document.getElementById('signup-password');
            const submitBtn = document.getElementById('signup-btn');

            const firstName = firstNameInput ? firstNameInput.value.trim() : "";
            const lastName = lastNameInput ? lastNameInput.value.trim() : "";
            const location = locationInput ? locationInput.value : "";
            const homeCourt = homeCourtInput ? homeCourtInput.value.trim() : "";
            const skillLevel = skillInput ? skillInput.value : "Beginner";
            const position = positionInput ? positionInput.value : "UNASSIGNED";
            const email = emailInput.value.trim();
            const password = passwordInput.value;

            let generatedName = "Unknown Player";
            if (firstName && lastName) {
                generatedName = `${firstName} ${lastName.charAt(0).toUpperCase()}.`;
            } else if (firstName) {
                generatedName = firstName;
            }

            if (submitBtn) { submitBtn.textContent = 'CREATING...'; submitBtn.disabled = true; }

            try {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;

                await updateProfile(user, { displayName: generatedName });

                // ENFORCED DEFAULT PROFILE SETTINGS
                const defaultProfile = {
                    // Core Identity
                    uid: user.uid,
                    email: email,
                    ligaID: generate12DigitId(),
                    firstName: firstName,
                    lastName: lastName,
                    displayName: generatedName,
                    photoURL: null,
                    accountType: "Player", 
                    
                    // Editable Defaults
                    primaryPosition: position,
                    skillLevel: skillLevel,
                    location: location,
                    homeCourt: homeCourt,
                    bio: "New player to Liga PH.",
                    
                    // Stats & Roster Baseline (Crucial to prevent NaN errors)
                    gamesAttended: 0,
                    gamesMissed: 0,
                    commendations: 0,
                    
                    // Centralized Squad Data
                    squadId: null,
                    squadName: null,
                    squadAbbr: null,
                    
                    selfRatings: { 
                        shooting: 3, 
                        passing: 3, 
                        dribbling: 3, 
                        rebounding: 3, 
                        defense: 3 
                    },
                    
                    createdAt: serverTimestamp()
                };

                await setDoc(doc(db, "users", user.uid), defaultProfile);

                localStorage.setItem('ligaPhProfile', JSON.stringify(defaultProfile));
                localStorage.setItem('ligaPhUser', JSON.stringify({ uid: user.uid, email: user.email }));
                
                // Request push notification permissions and save token
                await requestAndSaveDeviceToken(user);

                window.location.replace('feeds.html');

            } catch (error) {
                console.error("Signup error:", error);
                let errorMessage = "Failed to create account.";
                if (error.code === 'auth/email-already-in-use') errorMessage = "This email is already in use.";
                if (error.code === 'auth/weak-password') errorMessage = "Password should be at least 6 characters.";
                alert(errorMessage);
                if (submitBtn) { submitBtn.textContent = 'Create Account'; submitBtn.disabled = false; }
            }
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault(); 
            
            const emailInput = document.getElementById('login-email');
            const passwordInput = document.getElementById('login-password');
            const submitBtn = document.getElementById('login-btn');

            const email = emailInput.value.trim();
            const password = passwordInput.value;

            if (submitBtn) { submitBtn.textContent = 'LOGGING IN...'; submitBtn.disabled = true; }

            try {
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;

                let userProfile = {
                    displayName: user.displayName || "Unknown Player",
                    primaryPosition: "UNASSIGNED",
                    homeCourt: "Unknown Court",
                    bio: "Ready to play."
                };

                try {
                    const docSnap = await getDoc(doc(db, "users", user.uid));
                    if (docSnap.exists()) userProfile = docSnap.data();
                } catch (dbError) { console.warn(dbError); }

                localStorage.setItem('ligaPhProfile', JSON.stringify(userProfile));
                localStorage.setItem('ligaPhUser', JSON.stringify({ uid: user.uid, email: user.email }));

                // Request push notification permissions and save token
                await requestAndSaveDeviceToken(user);

                window.location.replace('feeds.html');

            } catch (error) {
                console.error("Login error:", error);
                alert("Invalid email or password.");
                if (submitBtn) { submitBtn.textContent = 'Log In'; submitBtn.disabled = false; }
            }
        });
    }
});
