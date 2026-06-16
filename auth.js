import { auth, db } from './firebase-setup.js';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    updateProfile,
    GoogleAuthProvider,
    signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { doc, setDoc, getDoc, serverTimestamp, onSnapshot } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { generate12DigitId, requestAndSaveDeviceToken } from './utils.js';

// --- REAL-TIME STATE MANAGER ---
// Import this into your other files (like sidebar.js) to keep the UI perfectly synced
export function subscribeToUserProfile(uid, callback) {
    if (!uid) return null;
    const userDocRef = doc(db, "users", uid);
    
    // onSnapshot listens for real-time changes to the document
    return onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
            callback(docSnap.data());
        } else {
            callback(null);
        }
    }, (error) => {
        console.error("Error listening to profile updates:", error);
    });
}

export async function handleLogout() {
    try { 
        await signOut(auth); 
    } catch (error) { 
        console.error("Logout error:", error); 
    }
    // Clean up legacy cache to prevent bugs during the transition
    localStorage.removeItem('ligaPhProfile');
    localStorage.removeItem('ligaPhUser');
    window.location.replace('index.html');
}

export async function handleGoogleAuth() {
    const provider = new GoogleAuthProvider();
    
    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;

        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (!userDocSnap.exists()) {
            // --- NEW USER FLOW ---
            const nameParts = user.displayName ? user.displayName.split(" ") : ["Unknown"];
            const firstName = nameParts[0];
            const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : "";

            const userProfile = {
                uid: user.uid,
                email: user.email,
                ligaID: generate12DigitId(),
                firstName: firstName,
                lastName: lastName,
                displayName: user.displayName || "Unknown Player",
                photoURL: user.photoURL, 
                accountType: "Player", 
                primaryPosition: "UNASSIGNED",
                skillLevel: "Beginner",
                location: "",
                homeCourt: "",
                bio: "New player to Liga PH.",
                gamesAttended: 0,
                gamesMissed: 0,
                commendations: 0,
                squadId: null,
                squadName: null,
                squadAbbr: null,
                selfRatings: { shooting: 3, passing: 3, dribbling: 3, rebounding: 3, defense: 3 },
                createdAt: serverTimestamp()
            };
            
            await setDoc(userDocRef, userProfile);
        }

        // Handle Push Notifications and Redirect
        await requestAndSaveDeviceToken(user);
        window.location.replace('home.html'); // Updated redirect

    } catch (error) {
        console.error("Google Auth Error:", error);
        if (error.code !== 'auth/popup-closed-by-user') {
            // Replaced native alert with console/custom handling recommendation
            console.warn("Google Sign-In failed. Please try again.");
        }
    }
}

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

                const defaultProfile = {
                    uid: user.uid,
                    email: email,
                    ligaID: generate12DigitId(),
                    firstName: firstName,
                    lastName: lastName,
                    displayName: generatedName,
                    photoURL: null,
                    accountType: "Player", 
                    primaryPosition: position,
                    skillLevel: skillLevel,
                    location: location,
                    homeCourt: homeCourt,
                    bio: "New player to Liga PH.",
                    gamesAttended: 0,
                    gamesMissed: 0,
                    commendations: 0,
                    squadId: null,
                    squadName: null,
                    squadAbbr: null,
                    selfRatings: { shooting: 3, passing: 3, dribbling: 3, rebounding: 3, defense: 3 },
                    createdAt: serverTimestamp()
                };

                await setDoc(doc(db, "users", user.uid), defaultProfile);
                
                await requestAndSaveDeviceToken(user);
                window.location.replace('home.html'); // Updated redirect

            } catch (error) {
                console.error("Signup error:", error);
                // Replaced blocking alert with inline UI feedback target
                if (submitBtn) { 
                    submitBtn.textContent = 'Create Account'; 
                    submitBtn.disabled = false; 
                    submitBtn.insertAdjacentHTML('beforebegin', `<p class="text-error text-xs text-center mb-2">Failed to create account. Check your details.</p>`);
                }
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
                
                await requestAndSaveDeviceToken(userCredential.user);
                window.location.replace('home.html'); // Updated redirect

            } catch (error) {
                console.error("Login error:", error);
                if (submitBtn) { 
                    submitBtn.textContent = 'Log In'; 
                    submitBtn.disabled = false; 
                    // Render inline error instead of native alert
                    let errorMsg = submitBtn.previousElementSibling;
                    if(errorMsg && errorMsg.classList.contains('text-error')) {
                        errorMsg.remove();
                    }
                    submitBtn.insertAdjacentHTML('beforebegin', `<p class="text-error text-xs text-center mb-2">Invalid email or password.</p>`);
                }
            }
        });
    }
});
