import { db, storage } from './firebase-setup.js';
import { collection, getDocs, addDoc, doc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";
import { generate12DigitId } from './utils.js';

async function fetchGames() {    
    const games = [];
    try {
        const querySnapshot = await getDocs(collection(db, "games"));
        querySnapshot.forEach((doc) => {
            games.push({ id: doc.id, ...doc.data() });
        });
    } catch(e) {
        console.error("Error fetching games: ", e);
    }
    return games;
}

async function postGame(gameData) {
    try {
        const customId = generate12DigitId();
        const docRef = doc(db, "games", customId);
        await setDoc(docRef, gameData);
        return { success: true, id: customId };
    } catch (e) {
        console.error("Error adding document: ", e);
        return { success: false, error: e.message };
    }
}

async function updateGame(gameId, gameData) {
    try {
        const gameRef = doc(db, "games", gameId);
        await setDoc(gameRef, gameData, { merge: true });
        return { success: true };
    } catch (e) {
        console.error("Error updating document: ", e);
        return { success: false, error: e.message };
    }
}

async function deleteGame(gameId) {
    try {
        const gameRef = doc(db, "games", gameId);
        await deleteDoc(gameRef);
        return { success: true };
    } catch (e) {
        console.error("Error deleting document: ", e);
        return { success: false, error: e.message };
    }
}

async function uploadGameImage(file) {
    if (!file) return null;
    
    return new Promise((resolve, reject) => {
        console.log("Starting Firebase game image upload...");
        const timestamp = Date.now();
        const safeName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
        const storageRef = ref(storage, `game_images/${timestamp}_${safeName}`);

        // Start the tracked upload
        const uploadTask = uploadBytesResumable(storageRef, file);

        // Fail-safe timer (60s)
        const timer = setTimeout(() => {
            uploadTask.cancel();
            reject(new Error("Upload timed out. Check your internet connection."));
        }, 60000);

        // Listen for progress updates
        uploadTask.on('state_changed',
            (snapshot) => {
                // Calculate percentage
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                
                // Update the submit button text live!
                const submitBtn = document.getElementById('submit-game-btn');
                if (submitBtn) {
                    submitBtn.textContent = `UPLOADING IMAGE... ${Math.round(progress)}%`;
                }
            },
            (error) => {
                clearTimeout(timer);
                console.error("Firebase Storage Upload Error:", error);
                reject(error);
            },
            async () => {
                // Upload completed successfully
                clearTimeout(timer);
                console.log("Upload successful! Grabbing download URL...");
                try {
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    resolve(downloadURL);
                } catch (err) {
                    reject(err);
                }
            }
        );
    });
}

export { fetchGames, postGame, updateGame, deleteGame, uploadGameImage };
