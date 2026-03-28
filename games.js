import { db } from './firebase-setup.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { seedDatabaseIfEmpty } from './seed_games.js';
import { addDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

async function fetchGames() {
    await seedDatabaseIfEmpty();
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
        const docRef = await addDoc(collection(db, "games"), gameData);
        return { success: true, id: docRef.id };
    } catch (e) {
        console.error("Error adding document: ", e);
        return { success: false, error: e.message };
    }
}
export { fetchGames, postGame };
