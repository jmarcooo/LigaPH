import { db } from './firebase-setup.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { addDoc, doc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

async function fetchGames() {    const games = [];
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
import { generate12DigitId } from './utils.js';

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


import { storage } from './firebase-setup.js';
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";

async function uploadGameImage(file) {
    if (!file) return null;
    try {
        const timestamp = Date.now();
        const safeName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
        const storageRef = ref(storage, `game_images/${timestamp}_${safeName}`);

        const snapshot = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);
        return downloadURL;
    } catch (error) {
        console.error("Error uploading image:", error);
        throw error;
    }
}

export { fetchGames, postGame, updateGame, deleteGame, uploadGameImage };
