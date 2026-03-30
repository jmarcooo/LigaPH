// firebase-setup.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBt2fhVY8G0u0ET8ZpALcpMOcyPHlzAmFc",
  authDomain: "liga-ph.firebaseapp.com",
  projectId: "liga-ph",
  // Fixed the bucket name to match your console exactly:
  storageBucket: "liga-ph.firebasestorage.app", 
  messagingSenderId: "114554829752",
  appId: "1:114554829752:web:4e0cea9f1b67f23f77ed4d",
  measurementId: "G-76C27LPRZC"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

console.log("Firebase is locked and loaded!");
