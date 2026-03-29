// auth.js
import { auth, db } from './firebase-setup.js';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    GoogleAuthProvider,
    signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import {
    doc,
    setDoc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { generate12DigitId } from './utils.js';

// Signup Function
export async function handleSignup(email, password, fullName) {
    try {
        // 1. Create user in Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 2. Define default profile structure
        const ligaId = generate12DigitId();
        const defaultProfile = {
            displayName: fullName || "PLAYER ONE",
            ligaId: ligaId,
            primaryPosition: "PG",
            homeCourt: "LOCAL COURT",
            bio: "Ready to play."
        };

        // 3. Save profile to Firestore (Removed the nested try/catch!)
        await setDoc(doc(db, "users", user.uid), defaultProfile);
        console.log("Profile successfully written to Firestore.");

        // 4. Save to localStorage ONLY IF Firestore was successful
        localStorage.setItem('ligaPhProfile', JSON.stringify(defaultProfile));
        localStorage.setItem('ligaPhUser', JSON.stringify({ uid: user.uid, email: user.email }));

        return { success: true, user };
    } catch (error) {
        // If Auth OR Firestore fails, it will drop down here and show the error!
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

// Google Auth Function
export async function handleGoogleAuth() {
    try {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        const user = result.user;

        let userProfile = {
            displayName: user.displayName || "PLAYER ONE",
            primaryPosition: "PG",
            homeCourt: "LOCAL COURT",
            bio: "Ready to play."
        };

        // Check if user already has a profile in Firestore
        try {
            const docRef = doc(db, "users", user.uid);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                userProfile = docSnap.data();
                console.log("Profile retrieved from Firestore.");
            } else {
                // If not, create one with a new ligaId
                const ligaId = generate12DigitId();
                userProfile.ligaId = ligaId;
                await setDoc(docRef, userProfile);
                console.log("New Google user profile created in Firestore.");
            }
        } catch (dbError) {
            console.warn("Could not sync with Firestore. Using local profile.", dbError);
        }

        // Save to localStorage
        localStorage.setItem('ligaPhProfile', JSON.stringify(userProfile));
        localStorage.setItem('ligaPhUser', JSON.stringify({ uid: user.uid, email: user.email }));

        return { success: true, user };
    } catch (error) {
        console.error("Error during Google Auth:", error);
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

// Update Profile Function
export async function handleUpdateProfile(profileData) {
    try {
        const user = auth.currentUser;
        if (user) {
            await setDoc(doc(db, "users", user.uid), profileData, { merge: true });
            console.log("Profile updated in Firestore.");
            return { success: true };
        } else {
            console.warn("No authenticated user, profile saved locally only.");
            return { success: false, error: "Not logged in" };
        }
    } catch (error) {
        console.error("Error updating profile in Firestore:", error);
        return { success: false, error: error.message };
    }
}

// Attach to window so it can be called from inline scripts (like in sidebar.js or profile.js)
window.firebaseAuthAPI = {
    signup: handleSignup,
    login: handleLogin,
    logout: handleLogout,
    updateProfile: handleUpdateProfile,
    googleAuth: handleGoogleAuth
};
