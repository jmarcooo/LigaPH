import { auth, db } from './firebase-setup.js';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { generate12DigitId } from './utils.js';

// 1. Export Logout so sidebar.js and settings.html can use it
export async function handleLogout() {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Logout error:", error);
    }
    localStorage.removeItem('ligaPhProfile');
    localStorage.removeItem('ligaPhUser');
    window.location.replace('index.html');
}

// Dummy exports to prevent older scripts (like auth-ui.js) from crashing
export async function handleLoginFunc() {}
export async function handleSignupFunc() {}
export async function handleGoogleAuth() {}

// 2. Listen directly to the inline forms in index.html
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');

    // ==========================================
    // SIGN UP LOGIC
    // ==========================================
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault(); // Stop the page from reloading
            
            const nameInput = document.getElementById('signup-name');
            const emailInput = document.getElementById('signup-email');
            const passwordInput = document.getElementById('signup-password');
            const submitBtn = document.getElementById('signup-btn');

            // Grab the name, or fallback if the input is missing
            const name = nameInput && nameInput.value.trim() !== "" ? nameInput.value.trim() : "Unknown Player";
            const email = emailInput.value.trim();
            const password = passwordInput.value;

            if (submitBtn) {
                submitBtn.textContent = 'CREATING...';
                submitBtn.disabled = true;
            }

            try {
                // A. Create User in Firebase Auth
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;

                // B. CRITICAL FIX: Sync name to Firebase Auth profile
                await updateProfile(user, { displayName: name });

                // C. Create the Database Profile in Firestore
                const defaultProfile = {
                    displayName: name,
                    ligaId: generate12DigitId(),
                    primaryPosition: "UNASSIGNED",
                    homeCourt: "Unknown Court",
                    bio: "New player to Liga PH.",
                    selfRatings: { shooting: 3, passing: 3, dribbling: 3, rebounding: 3, defense: 3 },
                    createdAt: serverTimestamp()
                };

                await setDoc(doc(db, "users", user.uid), defaultProfile);

                // D. Save to local storage and redirect
                localStorage.setItem('ligaPhProfile', JSON.stringify(defaultProfile));
                localStorage.setItem('ligaPhUser', JSON.stringify({ uid: user.uid, email: user.email }));
                
                window.location.replace('feeds.html');

            } catch (error) {
                console.error("Signup error:", error);
                let errorMessage = "Failed to create account.";
                if (error.code === 'auth/email-already-in-use') errorMessage = "This email is already in use.";
                if (error.code === 'auth/weak-password') errorMessage = "Password should be at least 6 characters.";
                alert(errorMessage);
                
                if (submitBtn) {
                    submitBtn.textContent = 'Create Account';
                    submitBtn.disabled = false;
                }
            }
        });
    }

    // ==========================================
    // LOG IN LOGIC
    // ==========================================
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault(); // Stop the page from reloading
            
            const emailInput = document.getElementById('login-email');
            const passwordInput = document.getElementById('login-password');
            const submitBtn = document.getElementById('login-btn');

            const email = emailInput.value.trim();
            const password = passwordInput.value;

            if (submitBtn) {
                submitBtn.textContent = 'LOGGING IN...';
                submitBtn.disabled = true;
            }

            try {
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;

                // Fetch from Firestore
                let userProfile = {
                    displayName: user.displayName || "Unknown Player",
                    primaryPosition: "UNASSIGNED",
                    homeCourt: "Unknown Court",
                    bio: "Ready to play."
                };

                try {
                    const docSnap = await getDoc(doc(db, "users", user.uid));
                    if (docSnap.exists()) {
                        userProfile = docSnap.data();
                    }
                } catch (dbError) {
                    console.warn("Non-fatal database fetch error:", dbError);
                }

                localStorage.setItem('ligaPhProfile', JSON.stringify(userProfile));
                localStorage.setItem('ligaPhUser', JSON.stringify({ uid: user.uid, email: user.email }));

                window.location.replace('feeds.html');

            } catch (error) {
                console.error("Login error:", error);
                alert("Invalid email or password.");
                if (submitBtn) {
                    submitBtn.textContent = 'Log In';
                    submitBtn.disabled = false;
                }
            }
        });
    }
});
