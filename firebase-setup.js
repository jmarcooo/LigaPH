import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";
// 1. ADD THIS IMPORT:
import { getMessaging } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-messaging.js";

const firebaseConfig = {
  apiKey: "AIzaSyBt2fhVY8G0u0ET8ZpALcpMOcyPHlzAmFc",
  authDomain: "liga-ph.firebaseapp.com",
  projectId: "liga-ph",
  // RESTORED: Pointing exactly to your unique console URL
  storageBucket: "liga-ph.firebasestorage.app", 
  messagingSenderId: "114554829752",
  appId: "1:114554829752:web:4e0cea9f1b67f23f77ed4d",
  measurementId: "G-76C27LPRZC"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
// 2. INITIALIZE MESSAGING:
const messaging = getMessaging(app);

// 3. EXPORT IT:
export { auth, db, storage, messaging };
