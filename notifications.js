import { auth, db } from './firebase-setup.js';
import { collection, query, where, getDocs, orderBy, writeBatch, doc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('notifications-container');
    const markAllReadBtn = document.getElementById('mark-all-read-btn');

    let allNotifications = [];

    onAuthStateChanged(auth, (user) => {
        if (user) {
            loadNotifications(user.uid);
        } else {
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center py-12 text-center text-on-surface-variant bg-surface-container-low rounded-2xl border border-outline-variant/10">
                    <span class="material-symbols-outlined text-6xl mb-4 opacity-50">login</span>
                    <p class="text-lg">Please log in to view your notifications.</p>
                </div>
            `;
        }
    });

    async function loadNotifications(userId) {
        try {
            // Check if notifications subcollection or main collection
            // Let's assume a root "notifications" collection with "userId" field
            const notifRef = collection(db, "notifications");
            const q = query(notifRef, where("userId", "==", userId)); // We will ignore order by timestamp for now to avoid needing a composite index
            const snapshot = await getDocs(q);

            allNotifications = [];
            snapshot.forEach(doc => {
                allNotifications.push({ id: doc.id, ...doc.data() });
            });

            // Sort client-side
            allNotifications.sort((a, b) => {
                const timeA = a.createdAt ? a.createdAt.toMillis() : 0;
                const timeB = b.createdAt ? b.createdAt.toMillis() : 0;
                return timeB - timeA;
            });

            renderNotifications();
        } catch (error) {
            console.error("Error loading notifications:", error);
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center py-12 text-center text-error bg-surface-container-low rounded-2xl border border-outline-variant/10">
                    <span class="material-symbols-outlined text-6xl mb-4 opacity-50">error</span>
                    <p class="text-lg">Failed to load notifications.</p>
                </div>
            `;
        }
    }

    function renderNotifications() {
        container.innerHTML = '';

        // Let's add some dummy notifications if empty just so the page looks functional for the user presentation
        if (allNotifications.length === 0) {
            allNotifications = [
                { id: "dummy1", type: "game_invite", title: "Game Invite", message: "J. Reyes invited you to a pickup game at BGC Court.", isRead: false, time: "2 hours ago" },
                { id: "dummy2", type: "squad_invite", title: "Squad Invite", message: "Manila Mavericks sent you a squad invite.", isRead: true, time: "1 day ago" },
                { id: "dummy3", type: "alert", title: "Game Cancelled", message: "The game at Taft Ave has been cancelled due to rain.", isRead: true, time: "3 days ago" }
            ];
        }

        allNotifications.forEach(notif => {
            const isRead = notif.isRead;
            const bgClass = isRead ? 'bg-surface-container-low' : 'bg-surface-container-highest border-primary/30 shadow-md';
            const iconColor = isRead ? 'text-on-surface-variant' : 'text-primary';
            const titleClass = isRead ? 'text-on-surface-variant' : 'text-on-surface';

            let icon = 'notifications';
            if (notif.type === 'game_invite') icon = 'sports_basketball';
            if (notif.type === 'squad_invite') icon = 'group_add';
            if (notif.type === 'alert') icon = 'warning';

            const card = document.createElement('div');
            card.className = `${bgClass} rounded-2xl p-5 flex gap-4 transition-all border border-outline-variant/10 cursor-pointer hover:bg-surface-container-highest`;

            card.innerHTML = `
                <div class="w-12 h-12 rounded-full flex items-center justify-center shrink-0 bg-background/50 border border-outline-variant/10">
                    <span class="material-symbols-outlined ${iconColor}">${icon}</span>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-start mb-1">
                        <h4 class="font-bold text-sm uppercase tracking-wider ${titleClass}">${notif.title}</h4>
                        <span class="text-[10px] text-outline font-medium shrink-0 ml-2">${notif.time || 'Recently'}</span>
                    </div>
                    <p class="text-sm text-on-surface-variant leading-relaxed">${notif.message}</p>

                    ${!isRead && notif.type.includes('invite') ? `
                        <div class="mt-3 flex gap-2">
                            <button class="bg-primary hover:bg-primary-container text-on-primary font-bold py-1.5 px-4 rounded-lg text-xs transition-colors">Accept</button>
                            <button class="bg-surface-container hover:bg-surface-container-highest text-on-surface font-bold py-1.5 px-4 rounded-lg text-xs transition-colors">Decline</button>
                        </div>
                    ` : ''}
                </div>
            `;

            container.appendChild(card);
        });
    }

    if (markAllReadBtn) {
        markAllReadBtn.addEventListener('click', () => {
            // Update UI optimistically
            allNotifications.forEach(n => n.isRead = true);
            renderNotifications();
            // In a real app, perform batch update to Firestore here
        });
    }
});
