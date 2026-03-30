import { auth, db } from './firebase-setup.js';
import { doc, getDoc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

document.addEventListener('DOMContentLoaded', async () => {
    const mainContainer = document.getElementById('league-details-main');
    const joinBtn = document.getElementById('join-league-btn');
    const statusText = document.getElementById('league-status-text');

    const urlParams = new URLSearchParams(window.location.search);
    const leagueId = urlParams.get('id');

    if (!leagueId) {
        mainContainer.innerHTML = '<div class="text-center text-error py-20"><p class="text-2xl font-bold">League Not Found</p><p class="mt-2 text-on-surface-variant">Invalid league ID.</p></div>';
        return;
    }

    function escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    let currentLeagueData = null;
    let currentUser = null;

    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        updateJoinButtonState();
    });

    async function loadLeagueDetails() {
        try {
            const docRef = doc(db, "leagues", leagueId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                currentLeagueData = { id: docSnap.id, ...docSnap.data() };
                renderLeagueDetails(currentLeagueData);
                updateJoinButtonState();
            } else {
                mainContainer.innerHTML = '<div class="text-center text-error py-20"><p class="text-2xl font-bold">League Not Found</p><p class="mt-2 text-on-surface-variant">This league may have been deleted.</p></div>';
            }
        } catch (error) {
            console.error("Error fetching league details:", error);
            mainContainer.innerHTML = '<div class="text-center text-error py-20"><p class="text-2xl font-bold">Error Loading League</p><p class="mt-2 text-on-surface-variant">Please try again later.</p></div>';
        }
    }

    function renderLeagueDetails(league) {
        const safeTitle = escapeHTML(league.name);
        const safeLocation = escapeHTML(league.location || league.court || "Anywhere");
        const safeDesc = escapeHTML(league.description || "No description provided.");
        const safeCreator = escapeHTML(league.creator || league.captain || league.founderName || "Unknown Admin");
        const members = league.members || [league.creatorId || league.founderId];
        const membersCount = members.length;

        mainContainer.classList.remove('animate-pulse');
        mainContainer.innerHTML = `
            <div class="mb-8 relative z-10 mt-8">
                <div class="flex items-center flex-wrap gap-2 mb-4">
                    <div class="inline-flex items-center gap-2 px-3 py-1 bg-primary/20 text-primary rounded-full text-xs font-black uppercase tracking-widest backdrop-blur-md border border-primary/30 shadow-sm">
                        <span class="material-symbols-outlined text-sm">emoji_events</span>
                        Official League
                    </div>
                    <div class="inline-flex items-center gap-2 px-3 py-1 bg-surface-container-high text-on-surface-variant rounded-full text-xs font-black uppercase tracking-widest backdrop-blur-md border border-outline-variant/30 shadow-sm">
                        <span class="material-symbols-outlined text-sm">tag</span>
                        ID: ${escapeHTML(league.id)}
                    </div>
                </div>
                <h1 class="text-4xl md:text-5xl lg:text-6xl font-black italic tracking-tighter text-on-surface uppercase mb-4 leading-none text-shadow-sm">${safeTitle}</h1>
                <p class="text-lg text-on-surface-variant flex items-center gap-2 mb-6">
                    <span class="material-symbols-outlined text-secondary">admin_panel_settings</span>
                    Admin: <span class="font-bold text-on-surface">${safeCreator}</span>
                </p>

                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <div class="bg-surface-container-high p-4 rounded-xl border border-outline-variant/10 flex flex-col justify-center items-start shadow-sm hover:shadow-md hover:bg-surface-bright transition-all">
                        <span class="material-symbols-outlined text-secondary mb-2">location_on</span>
                        <p class="text-[10px] text-outline uppercase font-bold tracking-widest">Region</p>
                        <p class="font-black text-on-surface truncate w-full" title="${safeLocation}">${safeLocation}</p>
                    </div>
                    <div class="bg-surface-container-high p-4 rounded-xl border border-outline-variant/10 flex flex-col justify-center items-start shadow-sm hover:shadow-md hover:bg-surface-bright transition-all">
                        <span class="material-symbols-outlined text-secondary mb-2">groups</span>
                        <p class="text-[10px] text-outline uppercase font-bold tracking-widest">Teams/Members</p>
                        <p class="font-black text-on-surface">${membersCount}</p>
                    </div>
                     <div class="bg-surface-container-high p-4 rounded-xl border border-outline-variant/10 flex flex-col justify-center items-start shadow-sm hover:shadow-md hover:bg-surface-bright transition-all">
                        <span class="material-symbols-outlined text-secondary mb-2">trophy</span>
                        <p class="text-[10px] text-outline uppercase font-bold tracking-widest">Record</p>
                        <p class="font-black text-secondary">${league.wins || 0} - ${league.losses || 0}</p>
                    </div>
                </div>

                <div class="bg-surface-container-low p-6 rounded-2xl border-l-4 border-primary mb-10 shadow-sm">
                    <h3 class="font-headline text-lg font-black uppercase tracking-tight mb-3 flex items-center gap-2">
                        <span class="material-symbols-outlined text-primary">menu_book</span>
                        League Rules & Details
                    </h3>
                    <p class="text-on-surface-variant leading-relaxed whitespace-pre-wrap">${safeDesc}</p>
                </div>
            </div>
        `;
    }

    function updateJoinButtonState() {
        if (!currentLeagueData) return;

        const members = currentLeagueData.members || [];
        const isJoined = currentUser && members.includes(currentUser.uid);

        if (!currentUser) {
            joinBtn.textContent = 'LOG IN TO JOIN';
            joinBtn.disabled = false;
            joinBtn.className = 'bg-surface-variant hover:bg-surface-bright text-on-surface px-8 py-3 rounded-xl font-headline font-black uppercase tracking-widest transition-all';
        } else if (isJoined) {
            joinBtn.textContent = 'LEAVE LEAGUE';
            joinBtn.disabled = true; // implement leave later
            joinBtn.className = 'bg-error/10 hover:bg-error/20 text-error px-8 py-3 rounded-xl font-headline font-black uppercase tracking-widest transition-all opacity-50 cursor-not-allowed';
            statusText.textContent = "You are a member";
            statusText.className = 'font-headline text-lg font-black text-primary';
        } else {
            joinBtn.textContent = 'JOIN LEAGUE';
            joinBtn.disabled = false;
            joinBtn.className = 'bg-primary hover:brightness-110 active:scale-95 text-on-primary px-8 py-3 rounded-xl font-headline font-black uppercase tracking-widest shadow-lg shadow-primary/20 transition-all';
        }
    }

    joinBtn.addEventListener('click', async () => {
        if (!currentUser) {
            window.location.href = 'index.html';
            return;
        }

        if (!currentLeagueData) return;

        try {
            joinBtn.textContent = 'JOINING...';
            joinBtn.disabled = true;

            const leagueRef = doc(db, "leagues", leagueId);

            await updateDoc(leagueRef, {
                members: arrayUnion(currentUser.uid)
            });

            await loadLeagueDetails();

        } catch (error) {
            console.error("Error joining league:", error);
            alert("Failed to join the league. Please try again.");
            updateJoinButtonState();
        }
    });

    loadLeagueDetails();
});
