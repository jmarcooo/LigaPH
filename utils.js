import { messaging, db } from './firebase-setup.js';
import { getToken } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-messaging.js";
import { doc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

export function generate12DigitId() {
    let id = '';
    for (let i = 0; i < 12; i++) {
        id += Math.floor(Math.random() * 10);
    }
    return id;
}

export async function requestAndSaveDeviceToken(user) {
    if (!user) return;
    
    try {
        // 1. Request permission from the user
        const permission = await Notification.requestPermission();
        
        if (permission === 'granted') {
            // 2. Get the unique FCM token for this specific device
            const currentToken = await getToken(messaging, { 
                vapidKey: 'BAhXjm_5armWEFGxp0JTPxiUouaz7p5337AN5fVH-xqy7h0nlXNrqavEiY4txwXRIaQ1plZ1co-fhRV6awU_Gng' // <--- PASTE YOUR VAPID KEY HERE
            });

            if (currentToken) {
                // 3. Save the token to the user's profile in Firestore
                // We use arrayUnion so if they log in on their phone AND laptop, we save both!
                await updateDoc(doc(db, "users", user.uid), {
                    fcmTokens: arrayUnion(currentToken)
                });
                console.log("Device token securely saved to database!");
            } else {
                console.log("No registration token available. Request permission to generate one.");
            }
        } else {
            console.log("Notification permission denied by user.");
        }
    } catch (error) {
        console.error("An error occurred while retrieving token: ", error);
    }
}
