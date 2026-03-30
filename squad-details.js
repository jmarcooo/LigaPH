import { auth, db } from './firebase-setup.js';
import { doc, getDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

document.addEventListener('DOMContentLoaded', async () => {
    const mainContainer = document.getElementById('squad-details-main');
    const actionsContainer = document.getElementById('squad-actions-container');
    const statusText = document.getElementById('squad-status-text');

    // Modals
    const editModal = document.getElementById('edit-squad-modal');
    const closeEditModalBtn = document.getElementById('close-edit-modal');
    const editForm = document.getElementById('edit-squad-form');

    const urlParams = new URLSearchParams(window.location.search);
    const squadId = urlParams.get('id');

    if (!squadId) {
        mainContainer.innerHTML = '<div class="text-center text-error py-20"><p class="text-2xl font-bold">Squad Not Found</p></div>';
        return;
    }

    let currentSquadData = null;
    let currentUser = null;

    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        loadSquadDetails();
    });

    function escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    async function fetchUsersByUids(uidArray) {
        if (!uidArray || uidArray.length === 0) return [];
        const users = [];
        for (const uid of uidArray) {
            try {
                const userSnap = await getDoc(doc(db, "users", uid));
                if (userSnap.exists()) users.push({ uid, ...userSnap.data() });
            } catch (e) {
                console.warn(`Could not fetch user ${uid}`);
            }
        }
        return users;
    }

    async function loadSquadDetails() {
        try {
            const squadSnap = await getDoc(doc(db, "squads", squadId));
            if (!squadSnap.exists()) {
                mainContainer.innerHTML = '<div class="text-center text-error py-20"><p class="text-2xl font-bold">Squad Deleted</p></div>';
                return;
            }
            
            currentSquadData = { id: squadSnap.id, ...squadSnap.data() };
            
            // Ensure arrays exist
            if (!currentSquadData.members) currentSquadData.members = [];
            if (!currentSquadData.applicants) currentSquadData.applicants = [];

            // Fetch actual user profiles for members and applicants
            const memberProfiles = await fetchUsersByUids(currentSquadData.members);
            const applicantProfiles = await fetchUsersByUids(currentSquadData.applicants);

            renderSquadUI(memberProfiles, applicantProfiles);
            updateBottomBar();

        } catch (error) {
            console.error(error);
            mainContainer.innerHTML = '<div class="text-center text-error py-20"><p class="text-2xl font-bold">Error Loading Squad</p></div>';
        }
    }

    function renderSquadUI(members, applicants) {
        const safeTitle = escapeHTML(currentSquadData.name);
        const safeLocation = escapeHTML(currentSquadData.court || "Anywhere");
        const safeDesc = escapeHTML(currentSquadData.description || "No description provided.");
        const safeCaptain = escapeHTML(currentSquadData.captain);
        
        const isCaptain = currentUser && currentUser.uid === currentSquadData.captainId;

        // Build Member Roster HTML
        let rosterHtml = '';
        members.forEach(member => {
            const isMemberCaptain = member.uid === currentSquadData.captainId;
            const photo = escapeHTML(member.photoURL || 'assets/default-avatar.jpg');
            const name = escapeHTML(member.displayName || 'Unknown');
            
            let kickBtn = '';
            if (isCaptain && !isMemberCaptain) {
                kickBtn = `<button onclick="window.kickPlayer('${member.uid}')" class="absolute -top-2 -right-2 bg-error text-white rounded-full p-1 shadow-md hover:scale-110 transition-transform"><span class="material-symbols-outlined text-[12px]">person_remove</span></button>`;
            }

            rosterHtml += `
                <div class="bg-surface-container-highest p-4 rounded-xl relative group border border-outline-variant/10 hover:border-primary/30 transition-all flex flex-col items-center text-center shadow-sm cursor-pointer" onclick="window.location.href='profile.html?id=${member.uid}'">
                    ${kickBtn}
                    ${isMemberCaptain ? '<div class="absolute top-2 left-2 text-primary"><span class="material-symbols-outlined text-[16px]">stars</span></div>' : ''}
                    <div class="w-14 h-14 rounded-full bg-surface-variant flex items-center justify-center mb-3 overflow-hidden border-2 ${isMemberCaptain ? 'border-primary' : 'border-outline-variant/30 group-hover:border-primary/50'}">
                        <img src="${photo}" class="w-full h-full object-cover">
                    </div>
                    <h5 class="font-bold text-sm text-on-surface truncate w-full">${name}</h5>
                    <p class="text-[10px] text-primary uppercase font-black mt-1">${escapeHTML(member.primaryPosition || 'PLAYER')}</p>
                </div>
            `;
        });

        // Build Applicant List HTML (Only for Captain)
        let applicationsHtml = '';
        if (isCaptain) {
            let applicantList = '<p class="text-sm text-on-surface-variant mb-4">No pending applications.</p>';
            if (applicants.length > 0) {
                applicantList = applicants.map(app => `
                    <div class="flex items-center justify-between bg-surface-container-highest p-3 rounded-lg border border-outline-variant/10">
                        <div class="flex items-center gap-3 cursor-pointer hover:opacity-80" onclick="window.location.href='profile.html?id=${app.uid}'">
                            <img src="${escapeHTML(app.photoURL || 'assets/default-avatar.jpg')}" class="w-10 h-10 rounded-full object-cover border border-outline-variant/30">
                            <div>
                                <p class="font-bold text-sm text-on-surface">${escapeHTML(app.displayName || 'Unknown')}</p>
                                <p class="text-[10px] text-outline uppercase tracking-widest">${escapeHTML(app.primaryPosition || 'Player')}</p>
                            </div>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="window.resolveApplication('${app.uid}', false)" class="p-2 rounded-lg bg-error/10 text-error hover:bg-error/20 transition-colors"><span class="material-symbols-outlined text-[18px]">close</span></button>
                            <button onclick="window.resolveApplication('${app.uid}', true)" class="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"><span class="material-symbols-outlined text-[18px]">check</span></button>
                        </div>
                    </div>
                `).join('');
            }

            applicationsHtml = `
                <div class="bg-surface-container-low p-6 rounded-2xl border border-secondary/20 mb-10 shadow-sm">
                    <h3 class="font-headline text-lg font-black uppercase tracking-tight mb-4 flex items-center gap-2 text-secondary">
                        <span class="material-symbols-outlined">assignment_ind</span> Pending Applications
                    </h3>
                    <div class="space-y-3">${applicantList}</div>
                </div>
            `;
        }

        // Render the main page
        mainContainer.classList.remove('animate-pulse');
        mainContainer.innerHTML = `
            <div class="mb-8 relative z-10 mt-8">
                <div class="flex items-center flex-wrap gap-2 mb-4">
                    <div class="inline-flex items-center gap-2 px-3 py-1 bg-primary/20 text-primary rounded-full text-xs font-black uppercase tracking-widest border border-primary/30">
                        <span class="material-symbols-outlined text-sm">shield</span> Official Squad
                    </div>
                </div>
                <h1 class="text-4xl md:text-5xl lg:text-6xl font-black italic tracking-tighter text-on-surface uppercase mb-4 leading-none text-shadow-sm">${safeTitle}</h1>
                <p class="text-lg text-on-surface-variant flex items-center gap-2 mb-6">
                    <span class="material-symbols-outlined text-primary">stars</span>
                    Captain: <span class="font-bold text-on-surface">${safeCaptain}</span>
                </p>

                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <div class="bg-surface-container-high p-4 rounded-xl border border-outline-variant/10 flex flex-col justify-center shadow-sm">
                        <p class="text-[10px] text-outline uppercase font-bold tracking-widest mb-1">Home Court</p>
                        <p class="font-black text-on-surface truncate w-full flex items-center gap-1"><span class="material-symbols-outlined text-sm text-secondary">location_on</span> ${safeLocation}</p>
                    </div>
                    <div class="bg-surface-container-high p-4 rounded-xl border border-outline-variant/10 flex flex-col justify-center shadow-sm">
                        <p class="text-[10px] text-outline uppercase font-bold tracking-widest mb-1">Record</p>
                        <p class="font-black text-primary text-xl">${currentSquadData.wins || 0} - ${currentSquadData.losses || 0}</p>
                    </div>
                    <div class="bg-surface-container-high p-4 rounded-xl border border-outline-variant/10 flex flex-col justify-center shadow-sm">
                        <p class="text-[10px] text-outline uppercase font-bold tracking-widest mb-1">Roster Size</p>
                        <p class="font-black text-on-surface">${members.length} Hoopers</p>
                    </div>
                </div>

                <div class="bg-surface-container-low p-6 rounded-2xl border-l-4 border-primary mb-10 shadow-sm">
                    <h3 class="font-headline text-lg font-black uppercase tracking-tight mb-3 text-primary">Squad Intel</h3>
                    <p class="text-on-surface-variant leading-relaxed whitespace-pre-wrap">${safeDesc}</p>
                </div>

                ${applicationsHtml}

                <h3 class="font-headline text-2xl font-black uppercase tracking-tighter mb-6 border-b border-outline-variant/10 pb-4">The Roster</h3>
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    ${rosterHtml}
                </div>
            </div>
        `;
    }

    function updateBottomBar() {
        if (!currentSquadData) return;

        const isGuest = !currentUser;
        const uid = currentUser ? currentUser.uid : null;
        
        const isCaptain = uid === currentSquadData.captainId;
        const isMember = currentSquadData.members.includes(uid);
        const isApplicant = currentSquadData.applicants.includes(uid);

        actionsContainer.innerHTML = ''; // clear buttons

        if (isGuest) {
            statusText.textContent = "Sign in to apply";
            actionsContainer.innerHTML = `<button onclick="window.location.href='index.html'" class="bg-surface-variant text-on-surface px-6 py-3 rounded-xl font-headline font-black uppercase tracking-tighter transition-all">LOG IN</button>`;
        } else if (isCaptain) {
            statusText.textContent = "You are the Captain";
            statusText.className = "font-headline text-lg font-black text-primary";
            actionsContainer.innerHTML = `
                <button onclick="window.openEditModal()" class="bg-surface-container-highest text-on-surface hover:bg-surface-bright px-6 py-3 rounded-xl font-headline font-black uppercase tracking-tighter transition-all shadow-md border border-outline-variant/20">Edit</button>
                <button onclick="window.deleteSquad()" class="bg-error/10 text-error hover:bg-error/20 px-6 py-3 rounded-xl font-headline font-black uppercase tracking-tighter transition-all shadow-md">Delete</button>
            `;
        } else if (isMember) {
            statusText.textContent = "You are a member";
            statusText.className = "font-headline text-lg font-black text-secondary";
            actionsContainer.innerHTML = `<button onclick="window.leaveSquad()" class="bg-error/10 text-error hover:bg-error/20 px-6 py-3 rounded-xl font-headline font-black uppercase tracking-tighter transition-all shadow-md">LEAVE SQUAD</button>`;
        } else if (isApplicant) {
            statusText.textContent = "Application Pending";
            statusText.className = "font-headline text-lg font-black text-outline";
            actionsContainer.innerHTML = `<button disabled class="bg-surface-container-highest text-outline-variant px-6 py-3 rounded-xl font-headline font-black uppercase tracking-tighter opacity-50 cursor-not-allowed">APPLIED</button>`;
        } else {
            statusText.textContent = "Recruiting Open";
            actionsContainer.innerHTML = `<button onclick="window.applyToSquad()" class="bg-primary text-on-primary-container hover:brightness-110 px-8 py-3 rounded-xl font-headline font-black uppercase tracking-tighter transition-all shadow-lg active:scale-95">APPLY TO JOIN</button>`;
        }
    }

    // --- SQUAD ACTIONS API ---

    window.applyToSquad = async function() {
        try {
            await updateDoc(doc(db, "squads", squadId), {
                applicants: arrayUnion(currentUser.uid)
            });
            loadSquadDetails();
        } catch(e) { alert("Failed to apply."); }
    };

    window.leaveSquad = async function() {
        if(confirm("Are you sure you want to leave this squad?")) {
            try {
                await updateDoc(doc(db, "squads", squadId), {
                    members: arrayRemove(currentUser.uid)
                });
                loadSquadDetails();
            } catch(e) { alert("Failed to leave."); }
        }
    };

    window.resolveApplication = async function(applicantUid, accept) {
        try {
            const squadRef = doc(db, "squads", squadId);
            if (accept) {
                await updateDoc(squadRef, {
                    applicants: arrayRemove(applicantUid),
                    members: arrayUnion(applicantUid)
                });
            } else {
                await updateDoc(squadRef, {
                    applicants: arrayRemove(applicantUid)
                });
            }
            loadSquadDetails();
        } catch(e) { alert("Failed to process application."); }
    };

    window.kickPlayer = async function(memberUid) {
        if(confirm("Remove this player from the roster?")) {
            try {
                await updateDoc(doc(db, "squads", squadId), {
                    members: arrayRemove(memberUid)
                });
                loadSquadDetails();
            } catch(e) { alert("Failed to kick player."); }
        }
    };

    window.deleteSquad = async function() {
        if(confirm("DANGER: Are you sure you want to completely delete this squad? This cannot be undone.")) {
            try {
                await deleteDoc(doc(db, "squads", squadId));
                window.location.href = 'squads.html';
            } catch(e) { alert("Failed to delete squad."); }
        }
    };

    // --- EDIT SQUAD MODAL LOGIC ---
    
    window.openEditModal = function() {
        if (!currentSquadData) return;
        document.getElementById('edit-squad-name').value = currentSquadData.name;
        document.getElementById('edit-squad-court').value = currentSquadData.court || "";
        document.getElementById('edit-squad-desc').value = currentSquadData.description || "";
        
        editModal.classList.remove('hidden');
        setTimeout(() => {
            editModal.classList.remove('opacity-0', 'pointer-events-none');
            editModal.querySelector('div').classList.remove('scale-95');
        }, 10);
    };

    if (closeEditModalBtn) {
        closeEditModalBtn.addEventListener('click', () => {
            editModal.classList.add('opacity-0', 'pointer-events-none');
            editModal.querySelector('div').classList.add('scale-95');
            setTimeout(() => editModal.classList.add('hidden'), 300);
        });
    }

    if (editForm) {
        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('submit-edit-btn');
            btn.disabled = true;
            btn.textContent = "SAVING...";

            try {
                await updateDoc(doc(db, "squads", squadId), {
                    name: document.getElementById('edit-squad-name').value,
                    court: document.getElementById('edit-squad-court').value,
                    description: document.getElementById('edit-squad-desc').value,
                });
                closeEditModalBtn.click();
                loadSquadDetails();
            } catch (e) {
                alert("Failed to update squad.");
            } finally {
                btn.disabled = false;
                btn.textContent = "Save Changes";
            }
        });
    }

});
