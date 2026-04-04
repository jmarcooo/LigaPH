import { auth, db } from './firebase-setup.js';
import { collection, query, where, getDocs, updateDoc, doc, getDoc, addDoc, serverTimestamp, arrayUnion } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
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
            const q = query(collection(db, "notifications"), where("recipientId", "==", uid));
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
                currentNotifications.push({ id: docSnap.id, ...docSnap.data() });
            });

            currentNotifications.sort((a, b) => {
                const timeA = a.createdAt ? a.createdAt.toMillis() : 0;
                const timeB = b.createdAt ? b.createdAt.toMillis() : 0;
                return timeB - timeA; // Descending (Newest first)
            });

            currentNotifications.forEach(notif => {
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
        if (notif.type === 'game_invite') {
            icon = 'local_play';
            iconColor = 'text-primary';
        }
        if (notif.type === 'post_like') {
            icon = 'favorite';
            iconColor = 'text-error';
        }
        if (notif.type === 'post_comment') {
            icon = 'chat_bubble';
            iconColor = 'text-tertiary';
        }

        // --- NEW: Inline Buttons for Game Invites ---
        let actionButtons = '';
        if (notif.type === 'game_invite' && !isRead) {
            actionButtons = `
                <div class="flex gap-2 shrink-0 mt-3 w-full">
                    <button onclick="event.stopPropagation(); window.declineGameInvite('${notif.id}', '${notif.actorId}')" class="flex-1 px-3 py-2.5 rounded-lg bg-surface-container text-error border border-outline-variant/30 hover:border-error/50 transition-colors text-[10px] font-black tracking-widest uppercase">Decline</button>
                    <button onclick="event.stopPropagation(); window.acceptGameInvite('${notif.id}', '${notif.targetId}', '${notif.actorId}')" class="flex-1 px-3 py-2.5 rounded-lg bg-primary/20 text-primary border border-primary/30 hover:bg-primary hover:text-on-primary-container transition-colors text-[10px] font-black tracking-widest uppercase shadow-sm">Accept</button>
                </div>
            `;
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
                    ${actionButtons}
                </div>
                ${!isRead && notif.type !== 'game_invite' ? '<div class="w-2 h-2 rounded-full bg-primary shrink-0 mt-2 shadow-[0_0_8px_rgba(255,143,111,0.8)]"></div>' : ''}
            </div>
        `;
        container.insertAdjacentHTML('beforeend', notifHTML);
    }

    window.handleNotifClick = async function(notifId, link) {
        try {
            await updateDoc(doc(db, "notifications", notifId), { read: true });
        } catch(e) {}
        window.location.href = link;
    }

    // --- NEW: Handle Accept Game Invite ---
    window.acceptGameInvite = async function(notifId, gameId, senderId) {
        if (!confirm("Accept this game invite?")) return;
        try {
            const gameRef = doc(db, "games", gameId);
            const gameSnap = await getDoc(gameRef);
            
            if (!gameSnap.exists()) {
                alert("This game no longer exists.");
                await updateDoc(doc(db, "notifications", notifId), { read: true, message: "invited you to a game (Deleted)" });
                loadNotifications(auth.currentUser.uid);
                return;
            }
            
            const gameInfo = gameSnap.data();
            if (gameInfo.spotsFilled >= gameInfo.spotsTotal) {
                alert("Sorry, this game is already full!");
                await updateDoc(doc(db, "notifications", notifId), { read: true });
                loadNotifications(auth.currentUser.uid);
                return;
            }

            let myName = auth.currentUser.displayName || "Unknown Player";
            try {
                const p = JSON.parse(localStorage.getItem('ligaPhProfile'));
                if (p && p.displayName) myName = p.displayName;
            } catch(e){}

            if (gameInfo.players.includes(myName)) {
                alert("You are already in this game.");
                await updateDoc(doc(db, "notifications", notifId), { read: true });
                loadNotifications(auth.currentUser.uid);
                return;
            }

            // 1. Add user to game roster
            await updateDoc(gameRef, {
                players: arrayUnion(myName),
                spotsFilled: gameInfo.spotsFilled + 1
            });
            
            // 2. Mark notification as read (removes buttons)
            await updateDoc(doc(db, "notifications", notifId), { read: true });

            // 3. Send Notification to the Host
            await addDoc(collection(db, "notifications"), {
                recipientId: senderId,
                actorId: auth.currentUser.uid,
                actorName: myName,
                actorPhoto: auth.currentUser.photoURL || null,
                type: 'game_join',
                targetId: gameId,
                message: `accepted your invite and joined ${gameInfo.title}`,
                link: `game-details.html?id=${gameId}`,
                read: false,
                createdAt: serverTimestamp()
            });

            alert("Invite accepted! You are now in the game.");
            loadNotifications(auth.currentUser.uid);
        } catch(e) {
            console.error(e);
            alert("Failed to accept invite.");
        }
    }

    // --- NEW: Handle Decline Game Invite ---
    window.declineGameInvite = async function(notifId, senderId) {
        if (!confirm("Decline this game invite?")) return;
        try {
            await updateDoc(doc(db, "notifications", notifId), { read: true });
            
            let myName = auth.currentUser.displayName || "Unknown Player";
            try {
                const p = JSON.parse(localStorage.getItem('ligaPhProfile'));
                if (p && p.displayName) myName = p.displayName;
            } catch(e){}

            // Send Notification to the Host
            await addDoc(collection(db, "notifications"), {
                recipientId: senderId,
                actorId: auth.currentUser.uid,
                actorName: myName,
                actorPhoto: auth.currentUser.photoURL || null,
                type: 'game_request', 
                message: `declined your game invite.`,
                link: `profile.html?id=${auth.currentUser.uid}`,
                read: false,
                createdAt: serverTimestamp()
            });

            loadNotifications(auth.currentUser.uid);
        } catch(e) {
            console.error(e);
            alert("Failed to decline invite.");
        }
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
