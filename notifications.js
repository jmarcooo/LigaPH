import { auth, db } from './firebase-setup.js';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

// Global functions for inline HTML onClick handlers
window.acceptConnection = async function(connectionId, cardId) {
    try {
        const connectionRef = doc(db, "connections", connectionId);
        await updateDoc(connectionRef, {
            status: "accepted"
        });
        
        // Remove the card from the UI with a neat transition
        const card = document.getElementById(cardId);
        if (card) {
            card.innerHTML = `<p class="text-primary font-bold text-center py-4">Request Accepted!</p>`;
            setTimeout(() => card.remove(), 2000);
        }
    } catch (error) {
        console.error("Error accepting request:", error);
        alert("Failed to accept request.");
    }
};

window.declineConnection = async function(connectionId, cardId) {
    try {
        // We delete declined requests to keep the database clean
        await deleteDoc(doc(db, "connections", connectionId));
        
        const card = document.getElementById(cardId);
        if (card) {
            card.innerHTML = `<p class="text-error font-bold text-center py-4">Request Declined</p>`;
            setTimeout(() => card.remove(), 2000);
        }
    } catch (error) {
        console.error("Error declining request:", error);
        alert("Failed to decline request.");
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('notifications-container');

    function escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    async function loadNotifications(user) {
        if (!container) return;

        try {
            // Fetch pending requests where the current user is the receiver
            const connectionsRef = collection(db, "connections");
            const q = query(connectionsRef, 
                where("receiverId", "==", user.uid),
                where("status", "==", "pending")
            );
            
            const snapshot = await getDocs(q);
            container.innerHTML = ''; // Clear loading state

            if (snapshot.empty) {
                container.innerHTML = `
                    <div class="flex flex-col items-center justify-center py-12 text-center text-on-surface-variant bg-surface-container-low rounded-2xl border border-outline-variant/10">
                        <span class="material-symbols-outlined text-6xl mb-4 opacity-50">notifications_off</span>
                        <p class="text-lg">You're all caught up!</p>
                        <p class="text-sm mt-2">No new connection requests.</p>
                    </div>
                `;
                return;
            }

            // Loop through each request
            for (const connectionDoc of snapshot.docs) {
                const connectionData = connectionDoc.data();
                const connectionId = connectionDoc.id;
                const requesterId = connectionData.requesterId;
                const cardId = `notification-${connectionId}`;

                // Fetch the requester's profile to get their name and photo
                let requesterName = "Unknown Player";
                let requesterPhoto = "assets/default-avatar.jpg";
                
                try {
                    const userRef = doc(db, "users", requesterId);
                    const userSnap = await getDoc(userRef);
                    if (userSnap.exists()) {
                        const userData = userSnap.data();
                        requesterName = escapeHTML(userData.displayName || requesterName);
                        requesterPhoto = escapeHTML(userData.photoURL || requesterPhoto);
                    }
                } catch(err) {
                    console.error("Could not fetch requester info", err);
                }

                // Build the notification card
                const card = document.createElement('div');
                card.id = cardId;
                card.className = 'bg-surface-container-high rounded-2xl p-4 border border-outline-variant/10 shadow-sm flex flex-col sm:flex-row gap-4 items-start sm:items-center transition-all';
                
                card.innerHTML = `
                    <div class="flex items-center gap-4 flex-1 w-full">
                        <div class="w-12 h-12 rounded-full overflow-hidden shrink-0 border border-outline-variant/30 bg-surface-container">
                            <img src="${requesterPhoto}" alt="${requesterName}" onerror="this.src='assets/default-avatar.jpg'" class="w-full h-full object-cover">
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="text-sm text-on-surface">
                                <span class="font-bold text-primary uppercase tracking-tight">${requesterName}</span> wants to connect with you.
                            </p>
                            <span class="text-[10px] text-outline font-medium">Connection Request</span>
                        </div>
                    </div>
                    
                    <div class="flex gap-2 w-full sm:w-auto shrink-0 mt-2 sm:mt-0">
                        <button onclick="window.declineConnection('${connectionId}', '${cardId}')" class="flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest text-on-surface-variant bg-surface-container hover:bg-error/20 hover:text-error transition-colors">
                            Decline
                        </button>
                        <button onclick="window.acceptConnection('${connectionId}', '${cardId}')" class="flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-on-primary bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all active:scale-95">
                            Accept
                        </button>
                    </div>
                `;
                
                container.appendChild(card);
            }

        } catch (error) {
            console.error("Error loading notifications:", error);
            container.innerHTML = `
                <div class="p-8 text-center text-error bg-error/10 rounded-2xl border border-error/20">
                    <p class="font-bold">Failed to load alerts.</p>
                </div>
            `;
        }
    }

    onAuthStateChanged(auth, (user) => {
        if (user) {
            loadNotifications(user);
        } else {
            // Redirect to login if a guest tries to access notifications
            window.location.href = 'index.html';
        }
    });
});
