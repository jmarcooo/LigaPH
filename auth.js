import { auth, db } from './firebase-setup.js';
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged, 
    updateProfile 
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const logoutBtn = document.getElementById('logout-btn');

    // ==========================================
    // SIGN UP LOGIC (With Instant Profile Creation)
    // ==========================================
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // Grab inputs
            const nameInput = document.getElementById('signup-name');
            const emailInput = document.getElementById('signup-email');
            const passwordInput = document.getElementById('signup-password');
            const submitBtn = document.getElementById('signup-btn');

            const name = nameInput ? nameInput.value.trim() : "Unknown Player";
            const email = emailInput.value.trim();
            const password = passwordInput.value;

            if (submitBtn) {
                submitBtn.textContent = 'CREATING...';
                submitBtn.disabled = true;
            }

            try {
                // 1. Create the user in Firebase Auth
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;

                // 2. Immediately update their Auth Profile with the Display Name
                await updateProfile(user, {
                    displayName: name
                });

                // 3. Immediately create their permanent profile document in Firestore
                await setDoc(doc(db, "users", user.uid), {
                    displayName: name,
                    email: email,
                    primaryPosition: "UNASSIGNED",
                    homeCourt: "Unknown",
                    bio: "New player to Liga PH.",
                    photoURL: null,
                    createdAt: serverTimestamp()
                });

                // 4. Redirect them to the feeds!
                window.location.href = 'feeds.html';
            } catch (error) {
                console.error("Sign up error:", error);
                
                // Clean up Firebase error messages for the user
                let errorMessage = "Failed to create account.";
                if (error.code === 'auth/email-already-in-use') {
                    errorMessage = "This email is already in use.";
                } else if (error.code === 'auth/weak-password') {
                    errorMessage = "Password should be at least 6 characters.";
                }
                
                alert(errorMessage);
                if (submitBtn) {
                    submitBtn.textContent = 'CREATE ACCOUNT';
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
            e.preventDefault();
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
                await signInWithEmailAndPassword(auth, email, password);
                window.location.href = 'feeds.html';
            } catch (error) {
                console.error("Login error:", error);
                alert("Invalid email or password.");
                if (submitBtn) {
                    submitBtn.textContent = 'LOG IN';
                    submitBtn.disabled = false;
                }
            }
        });
    }

    // ==========================================
    // LOG OUT LOGIC
    // ==========================================
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                await signOut(auth);
                // Clear local storage profile on logout
                localStorage.removeItem('ligaPhProfile');
                window.location.href = 'index.html';
            } catch (error) {
                console.error("Logout error:", error);
            }
        });
    }

    // Global Auth State Observer
    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log("Active Session:", user.email);
        } else {
            console.log("No active user session.");
        }
    });
});

// ==========================================
// GLOBAL AUTH API (Used by profile.js for updates)
// ==========================================
window.firebaseAuthAPI = {
    updateProfile: async (data) => {
        if (auth.currentUser) {
            try {
                // 1. Update Authentication object
                await updateProfile(auth.currentUser, {
                    displayName: data.displayName,
                    photoURL: data.photoURL
                });

                // 2. Sync to Firestore Database
                await setDoc(doc(db, "users", auth.currentUser.uid), data, { merge: true });
                
                console.log("Profile successfully updated across Firebase!");
            } catch (error) {
                console.error("Error updating profile globally:", error);
            }
        }
    }
};
