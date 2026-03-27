// auth.js
import { auth, db } from './firebase-setup.js';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import {
    doc,
    setDoc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

// Signup Function
export async function handleSignup(email, password, fullName) {
    try {
        // Create user in Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Define default profile structure
        const defaultProfile = {
            displayName: fullName || "PLAYER ONE",
            primaryPosition: "PG",
            homeCourt: "LOCAL COURT",
            bio: "Ready to play."
        };

        // Attempt to save profile to Firestore
        try {
            await setDoc(doc(db, "users", user.uid), defaultProfile);
            console.log("Profile successfully written to Firestore.");
        } catch (dbError) {
            console.warn("Could not save to Firestore (likely due to missing permissions or dummy API keys). Proceeding with local profile.", dbError);
        }

        // Save to localStorage for immediate UI update
        localStorage.setItem('ligaPhProfile', JSON.stringify(defaultProfile));
        localStorage.setItem('ligaPhUser', JSON.stringify({ uid: user.uid, email: user.email }));

        return { success: true, user };
    } catch (error) {
        console.error("Error during signup:", error);
        return { success: false, error: error.message };
    }
}

// Login Function
export async function handleLogin(email, password) {
    try {
        // Authenticate with Firebase Auth
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Default fallback if we can't fetch from Firestore
        let userProfile = {
            displayName: "PLAYER ONE",
            primaryPosition: "PG",
            homeCourt: "LOCAL COURT",
            bio: "Ready to play."
        };

        // Attempt to fetch profile from Firestore
        try {
            const docRef = doc(db, "users", user.uid);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                userProfile = docSnap.data();
                console.log("Profile retrieved from Firestore.");
            } else {
                console.log("No profile found in Firestore, using defaults.");
            }
        } catch (dbError) {
            console.warn("Could not fetch from Firestore (likely due to missing permissions or dummy API keys). Using defaults.", dbError);
        }

        // Update localStorage
        localStorage.setItem('ligaPhProfile', JSON.stringify(userProfile));
        localStorage.setItem('ligaPhUser', JSON.stringify({ uid: user.uid, email: user.email }));

        return { success: true, user };
    } catch (error) {
        console.error("Error during login:", error);
        return { success: false, error: error.message };
    }
}

// Logout Function
export async function handleLogout() {
    try {
        await signOut(auth);
        console.log("User signed out from Firebase.");
    } catch (error) {
        console.error("Error signing out from Firebase:", error);
    }

    // Clear local storage
    localStorage.removeItem('ligaPhProfile');
    localStorage.removeItem('ligaPhUser');

    // Redirect to landing page
    window.location.href = 'index.html';
}

// Attach to window so it can be called from inline scripts (like in sidebar.js)
window.firebaseAuthAPI = {
    signup: handleSignup,
    login: handleLogin,
    logout: handleLogout
};
