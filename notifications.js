import { auth, db } from './firebase-setup.js';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, writeBatch, getDocs, deleteDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('notifications-container');
    const markAllBtn = document.getElementById('mark-all-read-btn');
    const clearAllBtn = document.getElementById('clear-all-btn');
    
    let unsubscribe = null;
    let currentNotifications = [];

    function escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function getFallbackAvatar(name) {
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'L')}&background=20262f&color=ff8f6f`;
    }

    onAuthStateChanged(auth, (user) => {
        if (user) {
            setupNotificationsListener(user.uid);
        } else {
            if (unsubscribe) unsubscribe();
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center py-20 opacity-70">
                    <span class="material-symbols-outlined text-5xl mb-4 text-outline-variant">login</span>
                    <p class="text-sm font-bold uppercase tracking-widest text-outline">Please Log In</p>
                    <p class="text-xs text-on-surface-variant mt-2">Log in to view your notifications.</p>
                </div>
            `;
            markAllBtn.classList.add('hidden');
            clearAllBtn.classList.add('hidden');
        }
    });

    function setupNotificationsListener(uid) {
        const q = query(collection(db, "notifications"), where("recipientId", "==", uid), orderBy("createdAt", "desc"));
        
        unsubscribe = onSnapshot(q, (snapshot) => {
            currentNotifications = [];
            snapshot.forEach(doc => {
                currentNotifications.push({ id: doc.id, ...doc.data() });
            });
            renderNotifications();
        }, (error) => {
            console.error("Error fetching notifications:", error);
            container.innerHTML = '<p class="text-center text-error text-sm py-10">Failed to load notifications.</p>';
        });
    }

    function renderNotifications() {
        if (currentNotifications.length === 0) {
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center py-20 opacity-50">
                    <span class="material-symbols-outlined text-6xl mb-4 text-primary drop-shadow-md">notifications_off</span>
                    <p class="text-sm font-bold uppercase tracking-widest text-outline">Inbox Zero</p>
                    <p class="text-[10px] text-on-surface-variant mt-2">You have no new notifications.</p>
                </div>
            `;
            markAllBtn.classList.add('hidden');
            clearAllBtn.classList.add('hidden');
            return;
        }

        const unreadCount = currentNotifications.filter(n => !n.read).length;
        
        if (unreadCount > 0) markAllBtn.classList.remove('hidden');
        else markAllBtn.classList.add('hidden');

        if (currentNotifications.length > 0) clearAllBtn.classList.remove('hidden');
        else clearAllBtn.classList.add('hidden');

        container.innerHTML = '';

        currentNotifications.forEach(notif => {
            const isRead = notif.read;
            const bgClass = isRead ? 'bg-surface-container-low border-outline-variant/10 opacity-70' : 'bg-surface-container-highest border-primary/30 shadow-md';
            const iconColor = isRead ? 'text-outline-variant' : 'text-primary';
            const dotHtml = isRead ? '' : '<span class="absolute top-3 right-3 w-2.5 h-2.5 bg-error rounded-full border-2 border-[#14171d] shadow-sm"></span>';

            let timeStr = "Recently";
            if (notif.createdAt) {
                const diff = Date.now() - notif.createdAt.toMillis();
                const minutes = Math.floor(diff / 60000);
                const hours = Math.floor(diff / 3600000);
                const days = Math.floor(diff / 86400000);

                if (minutes < 1) timeStr = 'Just now';
                else if (minutes < 60) timeStr = `${minutes}m ago`;
                else if (hours < 24) timeStr = `${hours}h ago`;
                else timeStr = `${days}d ago`;
            }

            let notifIcon = 'notifications';
            if (notif.type === 'game_invite') notifIcon = 'person_add';
            else if (notif.type === 'game_join') notifIcon = 'how_to_reg';
            else if (notif.type === 'squad_challenge') notifIcon = 'swords';
            else if (notif.type === 'post_like' || notif.type === 'commendation') notifIcon = 'thumb_up';
            else if (notif.type === 'post_comment') notifIcon = 'chat_bubble';
            else if (notif.type === 'system_alert') notifIcon = 'campaign';

            const photoUrl = notif.actorPhoto ? escapeHTML(notif.actorPhoto) : getFallbackAvatar(notif.actorName);

            container.innerHTML += `
                <div class="relative flex items-center gap-4 p-4 rounded-2xl border transition-all cursor-pointer hover:border-primary/50 group ${bgClass}" onclick="window.handleNotificationClick('${notif.id}', '${notif.link || ''}')">
                    ${dotHtml}
                    <div class="relative shrink-0">
                        <img src="${photoUrl}" onerror="this.onerror=null; this.src='${getFallbackAvatar(notif.actorName)}';" class="w-12 h-12 rounded-full object-cover border border-outline-variant/30 bg-surface-container">
                        <div class="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-surface-container-high border border-[#14171d] flex items-center justify-center shadow-sm">
                            <span class="material-symbols-outlined text-[12px] ${iconColor}">${notifIcon}</span>
                        </div>
                    </div>
                    <div class="flex-1 min-w-0 pr-4">
                        <p class="text-sm text-on-surface leading-snug">
                            <span class="font-bold uppercase tracking-wide text-[13px] mr-1">${escapeHTML(notif.actorName)}</span> 
                            <span class="text-on-surface-variant font-medium">${escapeHTML(notif.message)}</span>
                        </p>
                        <p class="text-[10px] font-black uppercase tracking-widest text-outline mt-1.5">${timeStr}</p>
                    </div>
                    <button onclick="event.stopPropagation(); window.deleteNotification('${notif.id}')" class="p-2 rounded-full text-outline-variant hover:text-error hover:bg-error/10 transition-colors opacity-0 group-hover:opacity-100 absolute right-2 top-1/2 -translate-y-1/2">
                        <span class="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                </div>
            `;
        });
    }

    // --- BULK ACTIONS ---

    if (markAllBtn) {
        markAllBtn.addEventListener('click', async () => {
            if (!auth.currentUser || currentNotifications.length === 0) return;
            
            markAllBtn.innerHTML = `<span class="material-symbols-outlined animate-spin text-[14px]">refresh</span> Processing`;
            markAllBtn.disabled = true;

            try {
                const batch = writeBatch(db);
                let updateCount = 0;

                currentNotifications.forEach(notif => {
                    if (!notif.read) {
                        const notifRef = doc(db, "notifications", notif.id);
                        batch.update(notifRef, { read: true });
                        updateCount++;
                    }
                });

                if (updateCount > 0) {
                    await batch.commit();
                }
            } catch (error) {
                console.error("Error marking all as read:", error);
                alert("Failed to update notifications.");
            } finally {
                markAllBtn.innerHTML = `<span class="material-symbols-outlined text-[14px]">done_all</span> Read All`;
                markAllBtn.disabled = false;
            }
        });
    }

    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', async () => {
            if (!auth.currentUser || currentNotifications.length === 0) return;
            if (!confirm("Are you sure you want to permanently delete all notifications?")) return;

            clearAllBtn.innerHTML = `<span class="material-symbols-outlined animate-spin text-[14px]">refresh</span> Deleting`;
            clearAllBtn.disabled = true;

            try {
                const batch = writeBatch(db);
                currentNotifications.forEach(notif => {
                    const notifRef = doc(db, "notifications", notif.id);
                    batch.delete(notifRef);
                });

                await batch.commit();
            } catch (error) {
                console.error("Error clearing notifications:", error);
                alert("Failed to clear notifications.");
            } finally {
                clearAllBtn.innerHTML = `<span class="material-symbols-outlined text-[14px]">delete_sweep</span> Clear All`;
                clearAllBtn.disabled = false;
            }
        });
    }

    // --- INDIVIDUAL ACTIONS ---

    window.handleNotificationClick = async function(notifId, link) {
        try {
            const notifRef = doc(db, "notifications", notifId);
            await updateDoc(notifRef, { read: true });
            
            if (link) {
                window.location.href = link;
            }
        } catch (error) {
            console.error("Error updating notification status:", error);
            if (link) window.location.href = link; // Fallback navigation even if read status fails
        }
    };

    window.deleteNotification = async function(notifId) {
        try {
            const notifRef = doc(db, "notifications", notifId);
            await deleteDoc(notifRef);
        } catch (error) {
            console.error("Error deleting notification:", error);
            alert("Failed to delete notification.");
        }
    };
});
