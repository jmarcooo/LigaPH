import { auth, db } from './firebase-setup.js';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    GoogleAuthProvider,
    signInWithPopup,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { generate12DigitId } from './utils.js';

// Signup Function
export async function handleSignup(email, password, fullName) {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        const finalName = fullName ? fullName.trim() : "Unknown Player";

        // Force update the Auth profile immediately
        try {
            await updateProfile(user, { displayName: finalName });
        } catch (profileErr) {
            console.warn("Non-fatal error updating auth profile:", profileErr);
        }

        const defaultProfile = {
            displayName: finalName,
            ligaId: generate12DigitId(),
            primaryPosition: "UNASSIGNED",
            homeCourt: "Unknown Court",
            bio: "New player to Liga PH.",
            selfRatings: { shooting: 3, passing: 3, dribbling: 3, rebounding: 3, defense: 3 }
        };

        await setDoc(doc(db, "users", user.uid), defaultProfile);
        
        localStorage.setItem('ligaPhProfile', JSON.stringify(defaultProfile));
        localStorage.setItem('ligaPhUser', JSON.stringify({ uid: user.uid, email: user.email }));

        return { success: true, user };
    } catch (error) {
        console.error("Signup error:", error);
        let errorMessage = "Failed to create account.";
        if (error.code === 'auth/email-already-in-use') errorMessage = "This email is already in use.";
        if (error.code === 'auth/weak-password') errorMessage = "Password should be at least 6 characters.";
        return { success: false, error: errorMessage };
    }
}

// Login Function
export async function handleLogin(email, password) {
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
            if (docSnap.exists()) {
                userProfile = docSnap.data();
            }
        } catch (dbError) {
            console.warn("Non-fatal database fetch error:", dbError);
        }

        localStorage.setItem('ligaPhProfile', JSON.stringify(userProfile));
        localStorage.setItem('ligaPhUser', JSON.stringify({ uid: user.uid, email: user.email }));

        return { success: true, user };
    } catch (error) {
        console.error("Login error:", error);
        return { success: false, error: "Invalid email or password." };
    }
}

// Google Auth Function
export async function handleGoogleAuth() {
    try {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        const user = result.user;

        let userProfile = {
            displayName: user.displayName || "Unknown Player",
            primaryPosition: "UNASSIGNED",
            homeCourt: "Unknown Court",
            bio: "Ready to play."
        };

        try {
            const docRef = doc(db, "users", user.uid);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                userProfile = docSnap.data();
            } else {
                userProfile.ligaId = generate12DigitId();
                userProfile.selfRatings = { shooting: 3, passing: 3, dribbling: 3, rebounding: 3, defense: 3 };
                await setDoc(docRef, userProfile);
            }
        } catch (dbError) {
            console.warn("Non-fatal sync error.", dbError);
        }

        localStorage.setItem('ligaPhProfile', JSON.stringify(userProfile));
        localStorage.setItem('ligaPhUser', JSON.stringify({ uid: user.uid, email: user.email }));

        return { success: true, user };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Logout Function
export async function handleLogout() {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Error signing out from Firebase:", error);
    }
    localStorage.removeItem('ligaPhProfile');
    localStorage.removeItem('ligaPhUser');
    window.location.replace('index.html');
}

// Global API
window.firebaseAuthAPI = {
    signup: handleSignup,
    login: handleLogin,
    logout: handleLogout,
    googleAuth: handleGoogleAuth
};
