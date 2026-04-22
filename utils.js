import { messaging, db, auth } from './firebase-setup.js'; // <-- Added auth import
import { getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-messaging.js";
import { doc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js"; // <-- Added onAuthStateChanged

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
        // API Check: Prevent crash on unsupported browsers/iOS webviews
        if (!('Notification' in window)) {
            console.warn("This browser does not support desktop notifications.");
            return;
        }

        // 1. Request permission from the user
        const permission = await Notification.requestPermission();
        
        if (permission === 'granted') {
            // 2. Get the unique FCM token for this specific device
            const currentToken = await getToken(messaging, { 
                vapidKey: 'BAhXjm_5armWEFGxp0JTPxiUouaz7p5337AN5fVH-xqy7h0nlXNrqavEiY4txwXRIaQ1plZ1co-fhRV6awU_Gng'
            });

            if (currentToken) {
                // 3. Save the token to the user's profile in Firestore
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

// Ensure the foreground listener is strictly gated and only sets up once
let isMessageListenerSetup = false;

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, (user) => {
        // ONLY attach the listener if: logged in, messaging exists, API is supported, and it hasn't run yet
        if (user && messaging && 'Notification' in window && !isMessageListenerSetup) {
            try {
                onMessage(messaging, (payload) => {
                    console.log('Message received in foreground! ', payload);
                    
                    if (Notification.permission === 'granted') {
                        new Notification(payload.notification.title, {
                            body: payload.notification.body,
                            icon: '/assets/logo-192.png',
                            data: payload.data
                        });
                    }
                });
                isMessageListenerSetup = true; // Lock it so it doesn't trigger multiple times
            } catch (err) {
                console.warn("Foreground notification listener failed to initialize:", err);
            }
        }
    });
});
