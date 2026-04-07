import { auth, db } from './firebase-setup.js';
import { doc, getDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

document.addEventListener('DOMContentLoaded', async () => {
    const mainContainer = document.getElementById('squad-details-main');
    const actionsContainer = document.getElementById('squad-actions-container');
    const statusText = document.getElementById('squad-status-text');

    const editModal = document.getElementById('edit-squad-modal');
    const closeEditModalBtn = document.getElementById('close-edit-modal');
    const editForm = document.getElementById('edit-squad-form');

    const manageModal = document.getElementById('manage-squad-modal');
    const closeManageModalBtn = document.getElementById('close-manage-modal');
    const manageForm = document.getElementById('manage-squad-form');

    const urlParams = new URLSearchParams(window.location.search);
    const squadId = urlParams.get('id');

    if (!squadId) {
        mainContainer.innerHTML = '<div class="text-center text-error py-20 lg:col-span-12"><p class="text-2xl font-bold">Squad Not Found</p></div>';
        return;
    }

    let currentSquadData = null;
    let currentUser = null;
    let currentMemberProfiles = []; 
    let userCurrentSquadId = null; // NEW: Strict DB-verified squad state

    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        if (user) {
            await checkUserSquadStatus(user.uid);
        }
        loadSquadDetails();
    });

    // NEW: Bulletproof check against the database to see if they belong to ANY squad
    async function checkUserSquadStatus(uid) {
        try {
            const captQ = query(collection(db, "squads"), where("captainId", "==", uid));
            const captSnap = await getDocs(captQ);
            
            const memQ = query(collection(db, "squads"), where("members", "array-contains", uid));
            const memSnap = await getDocs(memQ);

            if (!captSnap.empty) {
                userCurrentSquadId = captSnap.docs[0].id;
            } else if (!memSnap.empty) {
                userCurrentSquadId = memSnap.docs[0].id;
            } else {
                userCurrentSquadId = null;
            }
        } catch (e) {
            console.error("Error checking squad status", e);
        }
    }

    function getFallbackAvatar(name) {
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'P')}&background=20262f&color=ff8f6f`;
    }

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
                mainContainer.innerHTML = '<div class="text-center text-error py-20 lg:col-span-12"><p class="text-2xl font-bold">Squad Deleted</p></div>';
                return;
            }
            
            currentSquadData = { id: squadSnap.id, ...squadSnap.data() };
            
            if (!currentSquadData.members) currentSquadData.members = [];
            if (!currentSquadData.applicants) currentSquadData.applicants = [];
            
            if (!currentSquadData.ownerId && currentSquadData.captainId) {
                currentSquadData.ownerId = currentSquadData.captainId;
            }

            if (currentSquadData.captainId && !currentSquadData.members.includes(currentSquadData.captainId)) {
                currentSquadData.members.unshift(currentSquadData.captainId);
            }

            if (!currentSquadData.joinPrivacy) {
                currentSquadData.joinPrivacy = 'approval'; 
            }

            currentMemberProfiles = await fetchUsersByUids(currentSquadData.members);
            const applicantProfiles = await fetchUsersByUids(currentSquadData.applicants);

            renderSquadUI(currentMemberProfiles, applicantProfiles);
            updateBottomBar();

        } catch (error) {
            console.error(error);
            mainContainer.innerHTML = '<div class="text-center text-error py-20 lg:col-span-12"><p class="text-2xl font-bold">Error Loading Squad</p></div>';
        }
    }

    function renderSquadUI(members, applicants) {
        const safeTitle = escapeHTML(currentSquadData.name);
        const safeLocation = escapeHTML(currentSquadData.homeCity || currentSquadData.court || "Anywhere");
        const safeDesc = escapeHTML(currentSquadData.description || "No description provided.");
        
        const captainProfile = members.find(m => m.uid === currentSquadData.captainId);
        const safeCaptain = escapeHTML(captainProfile ? captainProfile.displayName : (currentSquadData.captainName || "Unknown Player"));
        const captainPhoto = escapeHTML(captainProfile?.photoURL) || getFallbackAvatar(safeCaptain);
        
        const ownerId = currentSquadData.ownerId;
        const isOwner = currentUser && currentUser.uid === ownerId;

        let rosterHtml = '';
        members.forEach(member => {
            const isMemberOwner = member.uid === ownerId;
            const isMemberCaptain = member.uid === currentSquadData.captainId;
            const name = escapeHTML(member.displayName || 'Unknown');
            const photo = escapeHTML(member.photoURL) || getFallbackAvatar(name);
            
            const sht = member.selfRatings?.shooting || 3;
            const reb = member.selfRatings?.rebounding || 3;
            const pas = member.selfRatings?.passing || 3;
            
            const ppg = (sht * 4.2).toFixed(1);
            const rpg = (reb * 2.3).toFixed(1);
            const apg = (pas * 1.8).toFixed(1);

            let badgesHtml = '';
            if (isMemberOwner) badgesHtml += '<span class="px-2 py-0.5 bg-secondary/20 text-secondary rounded text-[8px] font-black uppercase tracking-widest mr-1">Owner</span>';
            if (isMemberCaptain) badgesHtml += '<span class="px-2 py-0.5 bg-primary/20 text-primary rounded text-[8px] font-black uppercase tracking-widest">C</span>';

            let buttonsHtml = `<button onclick="window.location.href='profile.html?id=${member.uid}'" class="px-5 py-2 bg-surface-container border border-outline-variant/30 hover:border-outline-variant hover:bg-surface-container-highest text-on-surface text-[10px] font-black rounded-full transition-all uppercase tracking-widest active:scale-95 shadow-sm">Profile</button>`;
            
            if (isOwner && !isMemberOwner) {
                buttonsHtml = `
                    <button onclick="window.location.href='profile.html?id=${member.uid}'" class="px-4 py-2 bg-surface-container-highest border border-outline-variant/30 hover:border-outline-variant text-on-surface text-[10px] font-black rounded-full transition-all uppercase tracking-widest active:scale-95 shadow-sm">View</button>
                    <button onclick="window.kickPlayer('${member.uid}')" class="px-4 py-2 bg-surface-container-highest border border-outline-variant/30 hover:border-error/50 hover:bg-error/10 hover:text-error text-on-surface text-[10px] font-black rounded-full transition-all uppercase tracking-widest active:scale-95 shadow-sm">Kick</button>
                `;
            }

            rosterHtml += `
                <div class="bg-surface-container-low p-3 md:p-4 rounded-2xl border border-outline-variant/10 flex items-center justify-between group hover:bg-surface-container-highest transition-colors shadow-sm">
                    <div class="flex items-center gap-4 flex-1 cursor-pointer" onclick="window.location.href='profile.html?id=${member.uid}'">
                        <img src="${photo}" onerror="this.onerror=null; this.src='${getFallbackAvatar(name)}';" class="w-12 h-12 rounded-full object-cover border border-outline-variant/30 shrink-0 bg-surface-container">
                        <div class="min-w-0">
                            <h5 class="font-bold text-sm text-on-surface flex items-center truncate">${name}</h5>
                            <div class="flex items-center mt-1">
                                ${badgesHtml}
                                <span class="text-[10px] text-outline-variant font-medium truncate ml-1">${escapeHTML(member.primaryPosition || 'Player')}</span>
                            </div>
                        </div>
                    </div>
                    <div class="hidden sm:flex items-center gap-6 mr-6 shrink-0">
                        <div class="text-center">
                            <p class="font-black text-on-surface text-sm">${ppg}</p>
                            <p class="text-[9px] text-outline-variant uppercase font-black tracking-widest">PPG</p>
                        </div>
                        <div class="text-center">
                            <p class="font-black text-on-surface text-sm">${rpg}</p>
                            <p class="text-[9px] text-outline-variant uppercase font-black tracking-widest">RPG</p>
                        </div>
                        <div class="text-center">
                            <p class="font-black text-on-surface text-sm">${apg}</p>
                            <p class="text-[9px] text-outline-variant uppercase font-black tracking-widest">APG</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        ${buttonsHtml}
                    </div>
                </div>
            `;
        });

        let applicationsHtml = '';
        if (isOwner) {
            let applicantList = '<p class="text-sm text-on-surface-variant mb-4">No pending applications.</p>';
            if (applicants.length > 0) {
                applicantList = applicants.map(app => {
                    const appName = escapeHTML(app.displayName || 'Unknown');
                    const appPhoto = escapeHTML(app.photoURL) || getFallbackAvatar(appName);
                    return `
                    <div class="flex items-center justify-between bg-surface-container-highest p-3 rounded-lg border border-outline-variant/10">
                        <div class="flex items-center gap-3 cursor-pointer hover:opacity-80" onclick="window.location.href='profile.html?id=${app.uid}'">
                            <img src="${appPhoto}" onerror="this.onerror=null; this.src='${getFallbackAvatar(appName)}';" class="w-10 h-10 rounded-full object-cover border border-outline-variant/30">
                            <div>
                                <p class="font-bold text-sm text-on-surface">${appName}</p>
                                <p class="text-[10px] text-outline uppercase tracking-widest">${escapeHTML(app.primaryPosition || 'Player')}</p>
                            </div>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="window.resolveApplication('${app.uid}', false)" class="p-2 rounded-lg bg-error/10 text-error hover:bg-error/20 transition-colors"><span class="material-symbols-outlined text-[18px]">close</span></button>
                            <button onclick="window.resolveApplication('${app.uid}', true)" class="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"><span class="material-symbols-outlined text-[18px]">check</span></button>
                        </div>
                    </div>
                `}).join('');
            }
            
            if (currentSquadData.joinPrivacy === 'approval' || applicants.length > 0) {
                applicationsHtml = `
                    <div class="bg-surface-container-low p-6 rounded-2xl border border-secondary/20 shadow-sm mt-6">
                        <h3 class="font-headline text-lg font-black uppercase tracking-tight mb-4 flex items-center gap-2 text-secondary">
                            <span class="material-symbols-outlined">assignment_ind</span> Pending Applications
                        </h3>
                        <div class="space-y-3">${applicantList}</div>
                    </div>
                `;
            }
        }

        const privacyBadge = currentSquadData.joinPrivacy === 'open' 
            ? `<div class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 text-primary rounded-md text-[10px] font-black uppercase tracking-widest border border-primary/20 mb-3 shadow-sm"><span class="material-symbols-outlined text-[14px]">public</span> Open to Join</div>`
            : `<div class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-surface-container-highest text-outline-variant rounded-md text-[10px] font-black uppercase tracking-widest border border-outline-variant/30 mb-3 shadow-sm"><span class="material-symbols-outlined text-[14px]">lock</span> Needs Approval</div>`;

        mainContainer.classList.remove('animate-pulse');
        mainContainer.innerHTML = `
            <div class="lg:col-span-4 space-y-6 mt-2">
                <div>
                    ${privacyBadge}
                    <h1 class="text-5xl lg:text-[4rem] font-black italic tracking-tighter text-on-surface uppercase mb-3 leading-[0.9] text-shadow-sm break-words">${safeTitle}</h1>
                    <div class="flex items-center gap-2">
                        <img src="${captainPhoto}" onerror="this.onerror=null; this.src='${getFallbackAvatar(safeCaptain)}';" class="w-6 h-6 rounded-full border border-outline-variant/30 object-cover bg-surface-container">
                        <p class="text-sm text-on-surface-variant font-medium">Captain: <span class="font-bold text-on-surface">${safeCaptain}</span></p>
                    </div>
                </div>

                <div class="flex gap-2">
                    <div class="bg-surface-container-low p-3 rounded-xl border border-outline-variant/10 flex-1 flex flex-col justify-center items-center shadow-sm">
                        <p class="text-[9px] text-outline uppercase font-bold tracking-widest mb-1">Home City</p>
                        <p class="font-black text-on-surface text-xs truncate w-full text-center flex items-center justify-center gap-1">
                            <span class="material-symbols-outlined text-[12px] text-secondary">location_on</span> ${safeLocation}
                        </p>
                    </div>
                    <div class="bg-surface-container-low p-3 rounded-xl border border-outline-variant/10 flex flex-col justify-center items-center shadow-sm px-4">
                        <p class="text-[9px] text-outline uppercase font-bold tracking-widest mb-1">Record</p>
                        <p class="font-black text-on-surface text-sm">${currentSquadData.wins || 0} - ${currentSquadData.losses || 0}</p>
                    </div>
                    <div class="bg-surface-container-low p-3 rounded-xl border border-outline-variant/10 flex flex-col justify-center items-center shadow-sm px-4 shrink-0">
                        <p class="text-[9px] text-outline uppercase font-bold tracking-widest mb-1">Size</p>
                        <p class="font-black text-on-surface text-sm">${members.length}</p>
                    </div>
                </div>

                <div class="bg-surface-container-low p-5 rounded-2xl border border-outline-variant/10 shadow-sm min-h-[250px]">
                    <h3 class="font-headline text-xs font-black uppercase tracking-widest mb-4 text-outline">Squad Intel</h3>
                    <p class="text-on-surface-variant text-sm leading-relaxed whitespace-pre-wrap">${safeDesc}</p>
                </div>
                ${applicationsHtml}
            </div>

            <div class="lg:col-span-8 mt-6 lg:mt-2">
                <h3 class="font-headline text-lg font-black uppercase tracking-widest mb-4 text-on-surface">The Roster</h3>
                <div class="space-y-3">
                    ${rosterHtml}
                </div>
            </div>
        `;
    }

    function updateBottomBar() {
        if (!currentSquadData) return;

        const isGuest = !currentUser;
        const uid = currentUser ? currentUser.uid : null;
        
        const isOwner = uid === currentSquadData.ownerId;
        const isMember = currentSquadData.members.includes(uid);
        const isApplicant = currentSquadData.applicants.includes(uid);
        const privacy = currentSquadData.joinPrivacy || 'approval';

        actionsContainer.innerHTML = ''; 

        if (isGuest) {
            statusText.textContent = "Sign in to interact";
            actionsContainer.innerHTML = `<button onclick="window.location.href='index.html'" class="w-full bg-surface-variant text-on-surface px-4 py-3 rounded-xl font-headline font-black uppercase tracking-tighter transition-all">LOG IN</button>`;
        } else if (isOwner) {
            statusText.textContent = "Admin Control";
            statusText.className = "font-headline text-lg font-black text-primary truncate";
            actionsContainer.innerHTML = `
                <button onclick="window.openManageModal()" class="flex-1 bg-surface-container-highest text-on-surface hover:bg-surface-bright px-3 py-3 rounded-xl font-headline font-black uppercase tracking-widest text-xs transition-all border border-outline-variant/20 active:scale-95 shadow-sm">Manage</button>
                <button onclick="window.openEditModal()" class="flex-1 bg-surface-container-highest text-on-surface hover:bg-surface-bright px-3 py-3 rounded-xl font-headline font-black uppercase tracking-widest text-xs transition-all border border-outline-variant/20 active:scale-95 shadow-sm">Edit</button>
                <button onclick="window.deleteSquad()" class="flex-none bg-error/10 text-error hover:bg-error/20 p-3 rounded-xl transition-all shadow-sm active:scale-95"><span class="material-symbols-outlined mt-1">delete</span></button>
            `;
        } else if (isMember) {
            statusText.textContent = "You are a member";
            statusText.className = "font-headline text-lg font-black text-secondary truncate";
            actionsContainer.innerHTML = `<button onclick="window.leaveSquad()" class="w-full bg-error/10 text-error hover:bg-error/20 px-4 py-3 rounded-xl font-headline font-black uppercase tracking-tighter transition-all shadow-md active:scale-95 text-xs">LEAVE SQUAD</button>`;
        } else if (isApplicant) {
            statusText.textContent = "Application Pending";
            statusText.className = "font-headline text-lg font-black text-outline truncate";
            actionsContainer.innerHTML = `<button disabled class="w-full bg-surface-container-highest text-outline-variant px-4 py-3 rounded-xl font-headline font-black uppercase tracking-tighter opacity-50 cursor-not-allowed text-xs">APPLIED</button>`;
        } else if (userCurrentSquadId && userCurrentSquadId !== squadId) {
            // FIX: Real DB check. They are in a DIFFERENT squad.
            statusText.textContent = "Already in a Squad";
            actionsContainer.innerHTML = `<button disabled class="w-full bg-surface-container-highest text-outline-variant px-4 py-3 rounded-xl font-headline font-black uppercase tracking-tighter opacity-50 cursor-not-allowed text-xs">UNAVAILABLE</button>`;
        } else {
            if (privacy === 'open') {
                statusText.textContent = "Open Roster";
                actionsContainer.innerHTML = `<button onclick="window.joinSquadInstantly()" class="w-full bg-primary text-on-primary-container hover:brightness-110 px-4 py-3 rounded-xl font-headline font-black uppercase tracking-tighter transition-all shadow-lg active:scale-95 text-sm">JOIN NOW</button>`;
            } else {
                statusText.textContent = "Recruiting Open";
                actionsContainer.innerHTML = `<button onclick="window.applyToSquad()" class="w-full bg-primary text-on-primary-container hover:brightness-110 px-4 py-3 rounded-xl font-headline font-black uppercase tracking-tighter transition-all shadow-lg active:scale-95 text-sm">APPLY TO JOIN</button>`;
            }
        }
    }

    // --- SQUAD JOINING & APPLICATIONS API ---

    window.applyToSquad = async function() {
        if (userCurrentSquadId) return alert("You are already in a squad! Please leave your current squad before applying to a new one.");

        try {
            await updateDoc(doc(db, "squads", squadId), {
                applicants: arrayUnion(currentUser.uid)
            });
            loadSquadDetails();
        } catch(e) { alert("Failed to apply."); }
    };

    window.joinSquadInstantly = async function() {
        if (userCurrentSquadId) return alert("You are already in a squad! Please leave your current squad before joining a new one.");

        try {
            await updateDoc(doc(db, "squads", squadId), {
                members: arrayUnion(currentUser.uid)
            });
            await updateDoc(doc(db, "users", currentUser.uid), {
                squadId: squadId,
                squadAbbr: currentSquadData.abbreviation || ""
            });
            
            let p = JSON.parse(localStorage.getItem('ligaPhProfile') || '{}');
            p.squadId = squadId;
            p.squadAbbr = currentSquadData.abbreviation || "";
            localStorage.setItem('ligaPhProfile', JSON.stringify(p));

            userCurrentSquadId = squadId; // Update local state instantly
            loadSquadDetails();
        } catch(e) { alert("Failed to join."); }
    };

    window.leaveSquad = async function() {
        if(confirm("Are you sure you want to leave this squad?")) {
            try {
                await updateDoc(doc(db, "squads", squadId), {
                    members: arrayRemove(currentUser.uid)
                });
                await updateDoc(doc(db, "users", currentUser.uid), {
                    squadId: null,
                    squadAbbr: null
                });

                let p = JSON.parse(localStorage.getItem('ligaPhProfile') || '{}');
                p.squadId = null;
                p.squadAbbr = null;
                localStorage.setItem('ligaPhProfile', JSON.stringify(p));

                userCurrentSquadId = null; // Update local state instantly
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
                await updateDoc(doc(db, "users", applicantUid), {
                    squadId: squadId,
                    squadAbbr: currentSquadData.abbreviation
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
                await updateDoc(doc(db, "users", memberUid), {
                    squadId: null,
                    squadAbbr: null
                });
                loadSquadDetails();
            } catch(e) { alert("Failed to kick player."); }
        }
    };

    window.deleteSquad = async function() {
        if(confirm("DANGER: Are you sure you want to completely delete this squad? This cannot be undone.")) {
            try {
                const members = currentSquadData.members || [];
                for(let m of members) {
                    await updateDoc(doc(db, "users", m), { squadId: null, squadAbbr: null });
                }
                
                let p = JSON.parse(localStorage.getItem('ligaPhProfile') || '{}');
                p.squadId = null;
                p.squadAbbr = null;
                localStorage.setItem('ligaPhProfile', JSON.stringify(p));

                await deleteDoc(doc(db, "squads", squadId));
                window.location.href = 'squads.html';
            } catch(e) { alert("Failed to delete squad."); }
        }
    };

    // --- MANAGE SQUAD MODAL LOGIC ---

    window.openManageModal = function() {
        if (!currentSquadData) return;
        
        const ownerSelect = document.getElementById('manage-owner');
        const captainSelect = document.getElementById('manage-captain');
        const privacySelect = document.getElementById('manage-privacy');

        ownerSelect.innerHTML = '';
        captainSelect.innerHTML = '';

        currentMemberProfiles.forEach(m => {
            const safeName = escapeHTML(m.displayName || 'Unknown');
            
            const opt1 = new Option(safeName, m.uid);
            const opt2 = new Option(safeName, m.uid);

            if (m.uid === currentSquadData.ownerId) opt1.selected = true;
            if (m.uid === currentSquadData.captainId) opt2.selected = true;

            ownerSelect.add(opt1);
            captainSelect.add(opt2);
        });

        privacySelect.value = currentSquadData.joinPrivacy || 'approval';

        manageModal.classList.remove('hidden');
        setTimeout(() => {
            manageModal.classList.remove('opacity-0', 'pointer-events-none');
            manageModal.querySelector('div').classList.remove('scale-95');
        }, 10);
    };

    if (closeManageModalBtn) {
        closeManageModalBtn.addEventListener('click', () => {
            manageModal.classList.add('opacity-0', 'pointer-events-none');
            manageModal.querySelector('div').classList.add('scale-95');
            setTimeout(() => manageModal.classList.add('hidden'), 300);
        });
    }

    if (manageForm) {
        manageForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('submit-manage-btn');
            btn.disabled = true;
            btn.textContent = "UPDATING...";

            const newOwnerId = document.getElementById('manage-owner').value;
            const newCaptainId = document.getElementById('manage-captain').value;
            const newPrivacy = document.getElementById('manage-privacy').value;

            const capProfile = currentMemberProfiles.find(m => m.uid === newCaptainId);
            const newCaptainName = capProfile ? capProfile.displayName : "Unknown";

            try {
                await updateDoc(doc(db, "squads", squadId), {
                    ownerId: newOwnerId,
                    captainId: newCaptainId,
                    captainName: newCaptainName,
                    joinPrivacy: newPrivacy
                });
                
                closeManageModalBtn.click();
                loadSquadDetails();
            } catch (e) {
                alert("Failed to update squad administration.");
            } finally {
                btn.disabled = false;
                btn.textContent = "Update Administration";
            }
        });
    }

    // --- EDIT SQUAD MODAL LOGIC ---
    
    window.openEditModal = function() {
        if (!currentSquadData) return;
        document.getElementById('edit-squad-name').value = currentSquadData.name;
        document.getElementById('edit-squad-court').value = currentSquadData.homeCity || currentSquadData.court || "";
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
                    homeCity: document.getElementById('edit-squad-court').value,
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
