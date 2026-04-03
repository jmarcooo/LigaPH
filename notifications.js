import { auth, db } from './firebase-setup.js';
import { collection, query, where, orderBy, getDocs, updateDoc, doc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('notifications-container');
    const markReadBtn = document.getElementById('mark-all-read-btn');

    let currentNotifications = [];

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            loadNotifications(user.uid);
        } else {
            window.location.href = 'index.html';
        }
    });

    async function loadNotifications(uid) {
        container.innerHTML = '<div class="text-center py-10 animate-pulse text-outline">Loading notifications...</div>';
        try {
            const q = query(collection(db, "notifications"), where("recipientId", "==", uid), orderBy("createdAt", "desc"));
            const snap = await getDocs(q);

            if (snap.empty) {
                container.innerHTML = `
                    <div class="flex flex-col items-center justify-center py-20 text-center text-outline-variant">
                        <div class="w-20 h-20 rounded-full bg-surface-container border border-outline-variant/10 flex items-center justify-center mb-6">
                            <span class="material-symbols-outlined text-4xl opacity-50">notifications_off</span>
                        </div>
                        <h3 class="font-headline text-xl font-black italic uppercase tracking-tighter text-on-surface mb-2">No Alerts Yet</h3>
                        <p class="text-sm">When players join your games or like your posts, you'll see it here.</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = '';
            currentNotifications = [];
            snap.forEach(docSnap => {
                const notif = { id: docSnap.id, ...docSnap.data() };
                currentNotifications.push(notif);
                renderNotification(notif);
            });

        } catch (e) {
            console.error("Error loading notifications:", e);
            container.innerHTML = '<div class="text-center py-10 text-error font-bold">Failed to load notifications. Please try again.</div>';
        }
    }

    function renderNotification(notif) {
        const photo = notif.actorPhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(notif.actorName || 'U')}&background=20262f&color=ff8f6f`;
        const isRead = notif.read;
        
        // Unread styling uses brand colors, read styling is muted
        const bgClass = isRead ? 'bg-surface-container-low border-outline-variant/10' : 'bg-primary/5 border-primary/30';
        const textClass = isRead ? 'text-on-surface-variant' : 'text-on-surface';
        
        let timeStr = "Recently";
        if (notif.createdAt) {
            const diff = Date.now() - notif.createdAt.toMillis();
            const minutes = Math.floor(diff / 60000);
            const hours = Math.floor(diff / 3600000);
            const days = Math.floor(hours / 24);
            if (minutes < 1) timeStr = 'Just now';
            else if (minutes < 60) timeStr = `${minutes}m`;
            else if (hours < 24) timeStr = `${hours}h`;
            else timeStr = `${days}d`;
        }

        let icon = 'notifications';
        let iconColor = 'text-primary';
        
        if (notif.type === 'game_join' || notif.type === 'game_request') {
            icon = 'person_add';
            iconColor = 'text-secondary';
        }
        if (notif.type === 'post_like') {
            icon = 'favorite';
            iconColor = 'text-error';
        }
        if (notif.type === 'post_comment') {
            icon = 'chat_bubble';
            iconColor = 'text-tertiary';
        }

        const notifHTML = `
            <div onclick="window.handleNotifClick('${notif.id}', '${notif.link}')" class="cursor-pointer p-4 rounded-2xl border flex gap-4 items-start shadow-sm transition-all hover:brightness-110 active:scale-95 ${bgClass}">
                <div class="relative shrink-0">
                    <img src="${photo}" class="w-12 h-12 rounded-full object-cover border border-outline-variant/30 bg-surface-container">
                    <div class="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-surface-container-highest border-2 border-[#0a0e14] flex items-center justify-center">
                        <span class="material-symbols-outlined text-[12px] ${iconColor}" style="${notif.type === 'post_like' ? 'font-variation-settings: \'FILL\' 1;' : ''}">${icon}</span>
                    </div>
                </div>
                <div class="flex-1 min-w-0 flex flex-col justify-center">
                    <p class="text-sm ${textClass} leading-snug mb-1.5">
                        <span class="font-bold text-on-surface">${escapeHTML(notif.actorName)}</span> ${escapeHTML(notif.message)}
                    </p>
                    <span class="text-[10px] font-black uppercase tracking-widest ${isRead ? 'text-outline-variant' : 'text-primary'}">${timeStr}</span>
                </div>
                ${!isRead ? '<div class="w-2 h-2 rounded-full bg-primary shrink-0 mt-2 shadow-[0_0_8px_rgba(255,143,111,0.8)]"></div>' : ''}
            </div>
        `;
        container.insertAdjacentHTML('beforeend', notifHTML);
    }

    // Expose click handler globally
    window.handleNotifClick = async function(notifId, link) {
        try {
            await updateDoc(doc(db, "notifications", notifId), { read: true });
        } catch(e) {}
        window.location.href = link;
    }

    if (markReadBtn) {
        markReadBtn.addEventListener('click', async () => {
            const unread = currentNotifications.filter(n => !n.read);
            if (unread.length === 0) return;

            markReadBtn.textContent = 'MARKING...';
            try {
                await Promise.all(unread.map(n => updateDoc(doc(db, "notifications", n.id), { read: true })));
                loadNotifications(auth.currentUser.uid);
            } catch(e) {}
            markReadBtn.textContent = 'MARK ALL READ';
        });
    }

    function escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
});
