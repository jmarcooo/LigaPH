import { db } from './firebase-setup.js';
import { collection, doc, setDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

const dummyGames = [
    {
        title: "5v5 Full Court Pickup",
        location: "Rucker Park, Harlem",
        date: "2026-10-12",
        time: "19:30",
        spotsTotal: 10,
        spotsFilled: 7,
        type: "5v5",
        host: "Marcus R."
    },
    {
        title: "Morning Training Session",
        location: "The Hangar Indoor Court",
        date: "2026-10-13",
        time: "09:00",
        spotsTotal: 12,
        spotsFilled: 4,
        type: "Training",
        host: "Elena Rodriguez"
    },
    {
        title: "Competitive 3v3 Run",
        location: "Venice Beach Courts",
        date: "2026-10-14",
        time: "15:00",
        spotsTotal: 6,
        spotsFilled: 6,
        type: "3v3",
        host: "Sky Walker"
    }
];

export async function seedDatabaseIfEmpty() {
    try {
        const gamesRef = collection(db, "games");
        const snapshot = await getDocs(gamesRef);

        if (snapshot.empty) {
            console.log("Database is empty. Seeding games...");
            for (let i = 0; i < dummyGames.length; i++) {
                const gameDoc = doc(gamesRef); // Auto-generate ID
                await setDoc(gameDoc, dummyGames[i]);
            }
            console.log("Seeding complete.");
        } else {
            console.log("Database already has games, skipping seed.");
        }
    } catch (e) {
        console.error("Error seeding database:", e);
    }
}
