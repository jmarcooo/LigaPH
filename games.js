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
async function postGame(gameData) {
    try {
        const docRef = await addDoc(collection(db, "games"), gameData);
        return { success: true, id: docRef.id };
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

export { fetchGames, postGame, updateGame, deleteGame };
