import { auth, db, storage } from './firebase-setup.js';
import { doc, getDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove, collection, query, where, getDocs, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";

document.addEventListener('DOMContentLoaded', async () => {
    const mainContainer = document.getElementById('squad-details-main');
    const actionsContainer = document.getElementById('squad-actions-container');
    const statusText = document.getElementById('squad-status-text');

    const manageModal = document.getElementById('manage-squad-modal');
    const closeManageModalBtn = document.getElementById('close-manage-modal');
    const manageForm = document.getElementById('manage-squad-form');
    
    const challengeModal = document.getElementById('challenge-squad-modal');
    const closeChallengeModalBtn = document.getElementById('close-challenge-modal');
    const challengeForm = document.getElementById('challenge-squad-form');

    const logoInput = document.getElementById('manage-logo-input');
    const logoPreview = document.getElementById('manage-logo-preview');
    const logoPlaceholder = document.getElementById('manage-logo-placeholder');
    let selectedLogoFile = null;

    const urlParams = new URLSearchParams(window.location.search);
    const squadId = urlParams.get('id');

    if (!squadId) {
        mainContainer.innerHTML = '<div class="text-center text-error py-20 lg:col-span-12"><p class="text-2xl font-bold">Squad Not Found</p></div>';
        return;
    }

    let currentSquadData = null;
    let currentUser = null;
    let currentMemberProfiles = []; 
    let pendingChallenges = [];
    
    // NEW: Global all squads cache to pull live logos
    let allSquadsList = [];
    
    let userCurrentSquadId = null;
    let isUserCaptainOfOwnSquad = false;
    let myOwnSquadData = null;

    const posMap = {
        'PG': 'Point Guard',
        'SG': 'Shooting Guard',
        'SF': 'Small Forward',
        'PF': 'Power Forward',
        'C': 'Center'
    };

    const citiesToLoad = window.metroManilaCities || [
        "Caloocan", "Las Piñas", "Makati", "Malabon", "Mandaluyong", 
        "Manila", "Marikina", "Muntinlupa", "Navotas", "Parañaque", 
        "Pasay", "Pasig", "Pateros", "Quezon City", "San Juan", "Taguig", "Valenzuela"
    ];

    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        if (user) {
            await checkUserSquadStatus(user.uid);
        }
        loadSquadDetails();
    });

    async function checkUserSquadStatus(uid) {
        try {
            const captQ = query(collection(db, "squads"), where("captainId", "==", uid));
            const captSnap = await getDocs(captQ);
            const memQ = query(collection(db, "squads"), where("members", "array-contains", uid));
            const memSnap = await getDocs(memQ);

            if (!captSnap.empty) {
                userCurrentSquadId = captSnap.docs[0].id;
                isUserCaptainOfOwnSquad = true;
                myOwnSquadData = { id: captSnap.docs[0].id, ...captSnap.docs[0].data() };
            } else if (!memSnap.empty) {
                userCurrentSquadId = memSnap.docs[0].id;
                isUserCaptainOfOwnSquad = false;
            } else {
                userCurrentSquadId = null;
                isUserCaptainOfOwnSquad = false;
            }
        } catch (e) {
            console.error("Error checking squad status", e);
        }
    }

    function getFallbackAvatar(name) {
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'P')}&background=20262f&color=ff8f6f`;
    }

    function getFallbackLogo(name) {
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'S')}&background=20262f&color=ff8f6f`;
    }

    function escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function calculateWinRate(squad) {
        const wins = squad.wins || 0;
        const losses = squad.losses || 0;
        const total = wins + losses;
        if (total === 0) return 0;
        return (wins / total);
    }

    function resizeAndCropImage(file, targetSize = 300) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = targetSize;
                canvas.height = targetSize;
                const size = Math.min(img.width, img.height);
                const startX = (img.width - size) / 2;
                const startY = (img.height - size) / 2;
                ctx.drawImage(img, startX, startY, size, size, 0, 0, targetSize, targetSize);
                canvas.toBlob((blob) => {
                    if (blob) {
                        blob.name = file.name || 'squad_logo.jpg'; 
                        resolve(blob);
                    } else {
                        reject(new Error("Canvas optimization failed"));
                    }
                }, file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.9); 
            };
            img.onerror = () => reject(new Error("Failed to load image"));
            img.src = URL.createObjectURL(file);
        });
    }

    function uploadSquadLogo(file, squadName) {
        return new Promise((resolve, reject) => {
            const safeName = squadName.replace(/[^a-zA-Z0-9.]/g, '_');
            const storageRef = ref(storage, `squads/${Date.now()}_${safeName}`);
            const uploadTask = uploadBytesResumable(storageRef, file);
            uploadTask.on('state_changed', null, 
                (error) => reject(error),
                async () => {
                    try {
                        const url = await getDownloadURL(uploadTask.snapshot.ref);
                        resolve(url);
                    } catch (e) { reject(e); }
                }
            );
        });
    }

    if (logoInput) {
        logoInput.addEventListener('change', (e) => {
            if (e.target.files[0]) {
                selectedLogoFile = e.target.files[0];
                logoPreview.src = URL.createObjectURL(selectedLogoFile);
                logoPreview.classList.remove('hidden');
                logoPlaceholder.classList.add('hidden');
            } else {
                selectedLogoFile = null;
                logoPreview.src = currentSquadData?.logoUrl || '';
                if(currentSquadData?.logoUrl){
                    logoPreview.classList.remove('hidden');
                    logoPlaceholder.classList.add('hidden');
                } else {
                    logoPreview.classList.add('hidden');
                    logoPlaceholder.classList.remove('hidden');
                }
            }
        });
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
            
            const allSquadsSnap = await getDocs(collection(db, "squads"));
            allSquadsList = [];
            allSquadsSnap.forEach(s => allSquadsList.push({id: s.id, ...s.data()}));
            
            allSquadsList.sort((a, b) => {
                const wrA = calculateWinRate(a);
                const wrB = calculateWinRate(b);
                if (wrB !== wrA) return wrB - wrA; 
                return (b.wins || 0) - (a.wins || 0); 
            });

            allSquadsList.forEach((s, idx) => { if(s.id === squadId) currentSquadData.globalRank = idx + 1; });

            const citySquads = allSquadsList.filter(s => s.homeCity === currentSquadData.homeCity);
            citySquads.forEach((s, idx) => { if(s.id === squadId) currentSquadData.cityRank = idx + 1; });

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

            const challengesQ = query(collection(db, "challenges"), where("challengedSquadId", "==", squadId), where("status", "==", "pending"));
            const challengesSnap = await getDocs(challengesQ);
            pendingChallenges = [];
            challengesSnap.forEach(doc => pendingChallenges.push({ id: doc.id, ...doc.data() }));

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
        const safeAbbr = escapeHTML(currentSquadData.abbreviation);
        const safeLocation = escapeHTML(currentSquadData.homeCity || currentSquadData.court || "Anywhere");
        const safeDesc = escapeHTML(currentSquadData.description || "No description provided.");
        const safeSkill = escapeHTML(currentSquadData.skillLevel || "Intermediate");
        
        const captainProfile = members.find(m => m.uid === currentSquadData.captainId);
        const safeCaptain = escapeHTML(captainProfile ? captainProfile.displayName : (currentSquadData.captainName || "Unknown Player"));
        const captainPhoto = escapeHTML(captainProfile?.photoURL) || getFallbackAvatar(safeCaptain);
        
        const squadLogo = escapeHTML(currentSquadData.logoUrl) || getFallbackLogo(safeTitle);
        
        const ownerId = currentSquadData.ownerId;
        const isOwner = currentUser && currentUser.uid === ownerId;
        const isOwnerOrCaptain = currentUser && (currentUser.uid === currentSquadData.ownerId || currentUser.uid === currentSquadData.captainId);

        let heroBadges = [];
        if (currentSquadData.globalRank && currentSquadData.globalRank <= 3) {
            heroBadges.push(`<span class="bg-primary text-on-primary-container px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest shadow-md border border-primary">Overall Rank #${currentSquadData.globalRank}</span>`);
        }
        if (currentSquadData.cityRank && currentSquadData.cityRank <= 3 && currentSquadData.homeCity) {
            heroBadges.push(`<span class="bg-secondary text-on-primary-container px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest shadow-md border border-secondary">${escapeHTML(currentSquadData.homeCity)} Rank #${currentSquadData.cityRank}</span>`);
        }
        heroBadges.push(`<span class="bg-surface-container-highest text-outline-variant px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest border border-outline-variant/30 shadow-sm">${safeSkill}</span>`);
        
        if (currentSquadData.joinPrivacy === 'open') {
            heroBadges.push(`<span class="bg-primary/10 text-primary px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest border border-primary/20 shadow-sm flex items-center gap-1"><span class="material-symbols-outlined text-[12px]">public</span> Open</span>`);
        } else {
            heroBadges.push(`<span class="bg-surface-container-highest text-outline-variant px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest border border-outline-variant/30 shadow-sm flex items-center gap-1"><span class="material-symbols-outlined text-[12px]">lock</span> Approval</span>`);
        }
        const heroBadgesHtml = heroBadges.join('');

        let rosterHtml = '';
        members.forEach(member => {
            const isMemberOwner = member.uid === ownerId;
            const isMemberCaptain = member.uid === currentSquadData.captainId;
            const name = escapeHTML(member.displayName || 'Unknown');
            const photo = escapeHTML(member.photoURL) || getFallbackAvatar(name);
            
            const rawPos = member.primaryPosition || 'Unassigned';
            const fullPos = posMap[rawPos] || rawPos;
            
            const sht = member.selfRatings?.shooting || 3;
            const reb = member.selfRatings?.rebounding || 3;
            const pas = member.selfRatings?.passing || 3;
            
            const ppg = (sht * 4.2).toFixed(1);
            const rpg = (reb * 2.3).toFixed(1);
            const apg = (pas * 1.8).toFixed(1);

            let badgesHtml = '';
            if (isMemberOwner) badgesHtml += '<span class="px-2 py-0.5 bg-secondary/20 text-secondary rounded text-[8px] font-black uppercase tracking-widest mr-1">Owner</span>';
            if (isMemberCaptain) badgesHtml += '<span class="px-2 py-0.5 bg-primary/20 text-primary rounded text-[8px] font-black uppercase tracking-widest">CAPTAIN</span>';

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
                            <div class="flex items-center mt-1 gap-2">
                                ${badgesHtml}
                                <span class="text-[10px] text-outline-variant font-medium truncate">${escapeHTML(fullPos)}</span>
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
                    const rawPosApp = app.primaryPosition || 'Unassigned';
                    const fullPosApp = posMap[rawPosApp] || rawPosApp;

                    return `
                    <div class="flex items-center justify-between bg-surface-container-highest p-3 rounded-lg border border-outline-variant/10">
                        <div class="flex items-center gap-3 cursor-pointer hover:opacity-80" onclick="window.location.href='profile.html?id=${app.uid}'">
                            <img src="${appPhoto}" onerror="this.onerror=null; this.src='${getFallbackAvatar(appName)}';" class="w-10 h-10 rounded-full object-cover border border-outline-variant/30">
                            <div>
                                <p class="font-bold text-sm text-on-surface">${appName}</p>
                                <p class="text-[10px] text-outline uppercase tracking-widest">${escapeHTML(fullPosApp)}</p>
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

        let challengesHtml = '';
        if (pendingChallenges.length > 0 && (isOwnerOrCaptain || currentSquadData.members.includes(currentUser?.uid))) {
            let listHtml = pendingChallenges.map(c => {
                // FIX: Dynamically fetch the LIVE logo of the challenger from the allSquadsList cache
                const challengingTeam = allSquadsList.find(s => s.id === c.challengerSquadId);
                const liveLogo = challengingTeam?.logoUrl || escapeHTML(c.challengerLogo) || getFallbackLogo(c.challengerName);

                return `
                <div onclick="window.openViewChallengeModal('${c.id}')" class="bg-surface-container-highest hover:bg-surface-bright cursor-pointer p-4 md:p-5 rounded-2xl border border-error/30 flex items-center justify-between gap-4 mb-3 shadow-sm transition-all group active:scale-[0.98]">
                    <div class="flex items-center gap-4 min-w-0">
                        <div class="w-12 h-12 md:w-16 md:h-16 rounded-xl border border-error/20 bg-surface-container shrink-0 overflow-hidden shadow-inner">
                            <img src="${liveLogo}" onerror="this.onerror=null; this.src='${getFallbackLogo(c.challengerName)}';" class="w-full h-full object-cover">
                        </div>
                        <div class="min-w-0">
                            <p class="text-[9px] font-bold text-error uppercase tracking-widest flex items-center gap-1 mb-0.5"><span class="material-symbols-outlined text-[12px]">warning</span> Incoming Match</p>
                            <p class="font-headline font-black italic text-sm md:text-lg text-on-surface uppercase truncate leading-tight">[${escapeHTML(c.challengerAbbr)}] ${escapeHTML(c.challengerName)}</p>
                            <p class="text-[11px] font-medium text-outline-variant mt-1 truncate"><span class="material-symbols-outlined text-[13px] align-middle mr-0.5">calendar_clock</span> ${escapeHTML(c.date)} @ ${escapeHTML(c.time)}</p>
                        </div>
                    </div>
                    <div class="shrink-0 flex flex-col items-end gap-2">
                        ${isOwnerOrCaptain ? `<span class="px-2.5 py-1 bg-error/10 text-error border border-error/20 font-bold text-[9px] uppercase tracking-widest rounded-md animate-pulse hidden sm:block">Action Required</span>` : `<span class="px-2.5 py-1 bg-surface-container border border-outline-variant/30 text-outline-variant font-bold text-[9px] uppercase tracking-widest rounded-md hidden sm:block">Pending</span>`}
                        <div class="w-8 h-8 rounded-full bg-surface-container border border-outline-variant/10 flex items-center justify-center group-hover:bg-error/10 group-hover:text-error group-hover:border-error/30 transition-colors">
                            <span class="material-symbols-outlined text-[18px]">chevron_right</span>
                        </div>
                    </div>
                </div>
            `}).join('');

            challengesHtml = `
                <div class="bg-gradient-to-b from-error/5 to-transparent p-6 md:p-8 rounded-3xl border border-error/20 shadow-lg mt-6">
                    <h3 class="font-headline text-xl font-black uppercase tracking-tighter mb-5 flex items-center gap-2 text-error">
                        <span class="material-symbols-outlined text-2xl">swords</span> Pending Challenges
                    </h3>
                    <div class="space-y-3">
                        ${listHtml}
                    </div>
                </div>
            `;
        }

        mainContainer.classList.remove('animate-pulse');
        mainContainer.innerHTML = `
            <div class="col-span-1 lg:col-span-12 bg-gradient-to-br from-[#14171d] to-[#0a0e14] rounded-3xl p-6 md:p-10 lg:p-12 border border-outline-variant/20 shadow-[0_10px_40px_rgba(0,0,0,0.5)] flex flex-col md:flex-row items-center md:items-start gap-8 relative overflow-hidden group">
                <div class="absolute -right-20 -top-20 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none transition-opacity"></div>
                <div class="w-32 h-32 md:w-48 md:h-48 rounded-[2rem] border border-outline-variant/20 bg-surface-container shrink-0 flex items-center justify-center overflow-hidden z-10 shadow-2xl">
                    <img src="${squadLogo}" onerror="this.onerror=null; this.src='${getFallbackLogo(safeTitle)}';" class="w-full h-full object-cover">
                </div>
                <div class="flex-1 w-full text-center md:text-left z-10 flex flex-col justify-center">
                    <div class="flex flex-wrap items-center justify-center md:justify-start gap-2 mb-4">
                        ${heroBadgesHtml}
                    </div>
                    <h1 class="font-headline text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black italic tracking-tighter uppercase text-on-surface leading-[0.9] text-shadow-sm mb-4 break-words">
                        <span class="text-primary">[${safeAbbr}]</span> ${safeTitle}
                    </h1>
                    <div class="flex items-center justify-center md:justify-start gap-3">
                        <img src="${captainPhoto}" onerror="this.onerror=null; this.src='${getFallbackAvatar(safeCaptain)}';" class="w-8 h-8 rounded-full border border-outline-variant/30 object-cover bg-surface-container">
                        <p class="text-sm text-on-surface-variant font-medium">Captain: <span class="font-bold text-on-surface uppercase tracking-widest text-[12px]">${safeCaptain}</span></p>
                    </div>
                </div>
            </div>

            <div class="col-span-1 lg:col-span-4 space-y-6">
                <div class="flex gap-2">
                    <div class="bg-surface-container-low p-4 rounded-xl border border-outline-variant/10 flex-1 flex flex-col justify-center items-center shadow-sm">
                        <p class="text-[9px] text-outline uppercase font-bold tracking-widest mb-1">Home City</p>
                        <p class="font-black text-on-surface text-sm truncate w-full text-center flex items-center justify-center gap-1">
                            <span class="material-symbols-outlined text-[14px] text-secondary">location_on</span> ${safeLocation}
                        </p>
                    </div>
                    <div class="bg-surface-container-low p-4 rounded-xl border border-outline-variant/10 flex flex-col justify-center items-center shadow-sm px-5">
                        <p class="text-[9px] text-outline uppercase font-bold tracking-widest mb-1">Record</p>
                        <p class="font-black text-on-surface text-lg">${currentSquadData.wins || 0} - ${currentSquadData.losses || 0}</p>
                    </div>
                    <div class="bg-surface-container-low p-4 rounded-xl border border-outline-variant/10 flex flex-col justify-center items-center shadow-sm px-5 shrink-0">
                        <p class="text-[9px] text-outline uppercase font-bold tracking-widest mb-1">Size</p>
                        <p class="font-black text-on-surface text-lg">${members.length}</p>
                    </div>
                </div>
                <div class="bg-surface-container-low p-6 rounded-2xl border border-outline-variant/10 shadow-sm min-h-[250px]">
                    <h3 class="font-headline text-sm font-black uppercase tracking-[0.2em] mb-4 text-primary flex items-center gap-2"><span class="w-4 h-[2px] bg-primary"></span> Squad Intel</h3>
                    <p class="text-on-surface-variant text-sm leading-relaxed whitespace-pre-wrap">${safeDesc}</p>
                </div>
                ${applicationsHtml}
                ${challengesHtml}
            </div>

            <div class="col-span-1 lg:col-span-8">
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
                <button onclick="window.openManageModal()" class="w-full bg-primary text-on-primary-container hover:brightness-110 px-4 py-3 rounded-xl font-headline font-black uppercase tracking-widest text-sm transition-all border border-primary/20 active:scale-95 shadow-lg flex items-center justify-center gap-2"><span class="material-symbols-outlined text-[18px]">settings</span> Manage Squad</button>
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
            if (isUserCaptainOfOwnSquad) {
                statusText.textContent = "Issue a Challenge";
                statusText.className = "font-headline text-lg font-black text-error truncate";
                actionsContainer.innerHTML = `<button onclick="window.openChallengeModal()" class="w-full bg-error text-on-primary-container hover:brightness-110 px-4 py-3 rounded-xl font-headline font-black uppercase tracking-tighter transition-all shadow-lg active:scale-95 text-sm flex items-center justify-center gap-1.5"><span class="material-symbols-outlined text-[18px]">swords</span> CHALLENGE SQUAD</button>`;
            } else {
                statusText.textContent = "Already in a Squad";
                actionsContainer.innerHTML = `<button disabled class="w-full bg-surface-container-highest text-outline-variant px-4 py-3 rounded-xl font-headline font-black uppercase tracking-tighter opacity-50 cursor-not-allowed text-xs">UNAVAILABLE</button>`;
            }
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

    // --- SQUAD CHALLENGE API ---
    window.openChallengeModal = function() {
        if (!currentSquadData || !myOwnSquadData) return;
        
        document.getElementById('challenge-target-name').textContent = currentSquadData.name;
        
        const targetLogo = document.getElementById('challenge-target-logo');
        targetLogo.src = currentSquadData.logoUrl || getFallbackLogo(currentSquadData.name);
        targetLogo.onerror = function() { this.onerror = null; this.src = getFallbackLogo(currentSquadData.name); };
        
        challengeModal.classList.remove('hidden');
        challengeModal.classList.add('flex'); // FIX: Ensures target preview container sits dead center
        setTimeout(() => {
            challengeModal.classList.remove('opacity-0');
            challengeModal.querySelector('div').classList.remove('scale-95');
        }, 10);
    };

    if (closeChallengeModalBtn) {
        closeChallengeModalBtn.addEventListener('click', () => {
            challengeModal.classList.add('opacity-0');
            challengeModal.querySelector('div').classList.add('scale-95');
            setTimeout(() => {
                challengeModal.classList.add('hidden');
                challengeModal.classList.remove('flex'); 
            }, 300);
        });
        
        challengeModal.addEventListener('click', (e) => {
            if (e.target === challengeModal) closeChallengeModalBtn.click();
        });
    }

    if (challengeForm) {
        challengeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('submit-challenge-btn');
            btn.disabled = true;
            btn.innerHTML = `SENDING...`;

            const dateVal = document.getElementById('challenge-date').value;
            const timeVal = document.getElementById('challenge-time').value;
            const locVal = document.getElementById('challenge-location').value.trim();
            const msgVal = document.getElementById('challenge-message').value.trim();

            try {
                await addDoc(collection(db, "challenges"), {
                    challengerSquadId: myOwnSquadData.id,
                    challengerName: myOwnSquadData.name,
                    challengerAbbr: myOwnSquadData.abbreviation,
                    challengerLogo: myOwnSquadData.logoUrl || getFallbackLogo(myOwnSquadData.name),
                    challengerMembers: myOwnSquadData.members || [],
                    challengedSquadId: squadId,
                    date: dateVal,
                    time: timeVal,
                    location: locVal,
                    message: msgVal,
                    status: 'pending',
                    createdAt: serverTimestamp()
                });

                const challengedMembers = currentSquadData.members || [];
                for (const memberUid of challengedMembers) {
                    await addDoc(collection(db, "notifications"), {
                        recipientId: memberUid,
                        actorId: currentUser.uid,
                        actorName: myOwnSquadData.name, 
                        actorPhoto: myOwnSquadData.logoUrl || getFallbackLogo(myOwnSquadData.name),
                        type: 'squad_challenge',
                        message: `issued a 5v5 challenge to your squad!`,
                        link: `squad-details.html?id=${squadId}`,
                        read: false,
                        createdAt: serverTimestamp()
                    });
                }

                challengeForm.reset();
                closeChallengeModalBtn.click();
                alert("Challenge Sent! They have been notified.");
            } catch(err) {
                console.error(err);
                alert("Failed to send challenge.");
            } finally {
                btn.disabled = false;
                btn.innerHTML = `<span class="material-symbols-outlined group-hover:rotate-12 transition-transform">send</span> Send Challenge`;
            }
        });
    }

    // --- VIEW CHALLENGE MODAL ---
    window.openViewChallengeModal = function(challengeId) {
        const c = pendingChallenges.find(ch => ch.id === challengeId);
        if (!c) return;

        // FIX: Fetch the actual LIVE logo of the challenger from memory to guarantee it displays!
        const challengingTeam = allSquadsList.find(s => s.id === c.challengerSquadId);
        const liveLogo = challengingTeam?.logoUrl || escapeHTML(c.challengerLogo) || getFallbackLogo(c.challengerName);

        const vcLogo = document.getElementById('vc-challenger-logo');
        vcLogo.src = liveLogo;
        vcLogo.onerror = function() { this.onerror = null; this.src = getFallbackLogo(c.challengerName); };

        document.getElementById('vc-challenger-name').innerHTML = `<span class="text-outline-variant">[${escapeHTML(c.challengerAbbr)}]</span><br/>${escapeHTML(c.challengerName)}`;
        document.getElementById('vc-datetime').textContent = `${escapeHTML(c.date)} @ ${escapeHTML(c.time)}`;
        document.getElementById('vc-location').textContent = escapeHTML(c.location);
        
        const msgContainer = document.getElementById('vc-message-container');
        if (c.message) {
            document.getElementById('vc-message').textContent = `"${escapeHTML(c.message)}"`;
            msgContainer.classList.remove('hidden');
        } else {
            msgContainer.classList.add('hidden');
        }

        const actionsContainer = document.getElementById('vc-actions');
        const isOwnerOrCaptain = currentUser && (currentUser.uid === currentSquadData.ownerId || currentUser.uid === currentSquadData.captainId);

        if (isOwnerOrCaptain) {
            actionsContainer.innerHTML = `
                <div class="flex gap-3">
                    <button onclick="window.resolveChallenge('${c.id}', false)" class="flex-1 px-4 py-3 rounded-xl bg-surface-container border border-error/30 text-error hover:bg-error/10 font-bold text-xs uppercase tracking-widest transition-colors shadow-sm">Decline</button>
                    <button onclick="window.resolveChallenge('${c.id}', true)" class="flex-1 px-4 py-3 rounded-xl bg-error text-on-primary-container hover:brightness-110 font-black text-xs uppercase tracking-widest transition-all shadow-md active:scale-95">Accept Match</button>
                </div>
            `;
        } else {
            actionsContainer.innerHTML = `
                <button disabled class="w-full px-4 py-3 rounded-xl bg-surface-container border border-outline-variant/20 text-outline-variant font-bold text-xs uppercase tracking-widest cursor-not-allowed">Waiting for Captain</button>
            `;
        }

        const vcModal = document.getElementById('view-challenge-modal');
        vcModal.classList.remove('hidden');
        vcModal.classList.add('flex');
        setTimeout(() => {
            vcModal.classList.remove('opacity-0');
            vcModal.querySelector('div').classList.remove('scale-95');
        }, 10);
    };

    const vcModal = document.getElementById('view-challenge-modal');
    const closeVcBtn = document.getElementById('close-view-challenge-modal');
    if (closeVcBtn) {
        closeVcBtn.addEventListener('click', () => {
            vcModal.classList.add('opacity-0');
            vcModal.querySelector('div').classList.add('scale-95');
            setTimeout(() => {
                vcModal.classList.add('hidden');
                vcModal.classList.remove('flex');
            }, 300);
        });
        vcModal.addEventListener('click', (e) => {
            if (e.target === vcModal) closeVcBtn.click();
        });
    }

    window.resolveChallenge = async function(challengeId, accept) {
        try {
            if (accept) {
                const cSnap = await getDoc(doc(db, "challenges", challengeId));
                if (cSnap.exists()) {
                    const cData = cSnap.data();
                    
                    await addDoc(collection(db, "games"), {
                        title: `[${currentSquadData.abbreviation}] vs [${cData.challengerAbbr}]`,
                        type: "5v5 Squad Match",
                        date: cData.date,
                        time: cData.time,
                        location: cData.location,
                        skillLevel: currentSquadData.skillLevel || "Intermediate",
                        host: currentSquadData.captainName,
                        hostId: currentSquadData.captainId,
                        players: [...currentSquadData.members, ...cData.challengerMembers], 
                        status: 'upcoming',
                        createdAt: serverTimestamp()
                    });
                }
                await updateDoc(doc(db, "challenges", challengeId), { status: 'accepted' });
                alert("Challenge accepted! Match has been officially scheduled in Games.");
            } else {
                await updateDoc(doc(db, "challenges", challengeId), { status: 'declined' });
            }
            
            if (closeVcBtn) closeVcBtn.click();
            loadSquadDetails();
            
        } catch(e) { 
            alert("Failed to resolve challenge."); 
            console.error(e); 
        }
    };


    // --- SQUAD JOINING & APPLICATIONS API ---
    window.applyToSquad = async function() {
        if (userCurrentSquadId) return alert("You are already in a squad! Please leave your current squad before applying to a new one.");
        try {
            await updateDoc(doc(db, "squads", squadId), { applicants: arrayUnion(currentUser.uid) });
            loadSquadDetails();
        } catch(e) { alert("Failed to apply."); }
    };

    window.joinSquadInstantly = async function() {
        if (userCurrentSquadId) return alert("You are already in a squad! Please leave your current squad before joining a new one.");
        try {
            await updateDoc(doc(db, "squads", squadId), { members: arrayUnion(currentUser.uid) });
            await updateDoc(doc(db, "users", currentUser.uid), { squadId: squadId, squadAbbr: currentSquadData.abbreviation || "" });
            
            let p = JSON.parse(localStorage.getItem('ligaPhProfile') || '{}');
            p.squadId = squadId;
            p.squadAbbr = currentSquadData.abbreviation || "";
            localStorage.setItem('ligaPhProfile', JSON.stringify(p));

            userCurrentSquadId = squadId;
            loadSquadDetails();
        } catch(e) { alert("Failed to join."); }
    };

    window.leaveSquad = async function() {
        if(confirm("Are you sure you want to leave this squad?")) {
            try {
                await updateDoc(doc(db, "squads", squadId), { members: arrayRemove(currentUser.uid) });
                await updateDoc(doc(db, "users", currentUser.uid), { squadId: null, squadAbbr: null });

                let p = JSON.parse(localStorage.getItem('ligaPhProfile') || '{}');
                p.squadId = null;
                p.squadAbbr = null;
                localStorage.setItem('ligaPhProfile', JSON.stringify(p));

                userCurrentSquadId = null; 
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
                await updateDoc(doc(db, "users", applicantUid), { squadId: squadId, squadAbbr: currentSquadData.abbreviation });
            } else {
                await updateDoc(squadRef, { applicants: arrayRemove(applicantUid) });
            }
            loadSquadDetails();
        } catch(e) { alert("Failed to process application."); }
    };

    window.kickPlayer = async function(memberUid) {
        if(confirm("Remove this player from the roster?")) {
            try {
                await updateDoc(doc(db, "squads", squadId), { members: arrayRemove(memberUid) });
                await updateDoc(doc(db, "users", memberUid), { squadId: null, squadAbbr: null });
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

    // --- UNIFIED MANAGE SQUAD MODAL LOGIC ---

    window.openManageModal = function() {
        if (!currentSquadData) return;
        
        document.getElementById('manage-squad-name').value = currentSquadData.name || '';
        document.getElementById('manage-squad-abbr').value = currentSquadData.abbreviation || '';
        document.getElementById('manage-squad-desc').value = currentSquadData.description || '';
        document.getElementById('manage-squad-skill').value = currentSquadData.skillLevel || 'Intermediate';

        const citySelect = document.getElementById('manage-squad-city');
        citySelect.innerHTML = '';
        citiesToLoad.forEach(city => {
            const opt = document.createElement('option');
            opt.value = city;
            opt.textContent = city;
            opt.className = 'bg-[#0a0e14] text-on-surface';
            if (currentSquadData.homeCity === city || currentSquadData.court === city) opt.selected = true;
            citySelect.appendChild(opt);
        });

        if (currentSquadData.logoUrl) {
            logoPreview.src = currentSquadData.logoUrl;
            logoPreview.classList.remove('hidden');
            logoPlaceholder.classList.add('hidden');
        } else {
            logoPreview.src = '';
            logoPreview.classList.add('hidden');
            logoPlaceholder.classList.remove('hidden');
        }
        selectedLogoFile = null;

        const ownerSelect = document.getElementById('manage-owner');
        const captainSelect = document.getElementById('manage-captain');
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

        document.getElementById('manage-privacy').value = currentSquadData.joinPrivacy || 'approval';

        manageModal.classList.remove('hidden');
        manageModal.classList.add('flex');
        setTimeout(() => {
            manageModal.classList.remove('opacity-0');
            manageModal.querySelector('div').classList.remove('scale-95');
        }, 10);
    };

    if (closeManageModalBtn) {
        closeManageModalBtn.addEventListener('click', () => {
            manageModal.classList.add('opacity-0');
            manageModal.querySelector('div').classList.add('scale-95');
            setTimeout(() => {
                manageModal.classList.add('hidden');
                manageModal.classList.remove('flex');
            }, 300);
        });
    }

    if (manageForm) {
        manageForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('submit-manage-btn');
            btn.disabled = true;
            btn.textContent = "CHECKING ABBREVIATION...";

            const newName = document.getElementById('manage-squad-name').value.trim();
            const newAbbr = document.getElementById('manage-squad-abbr').value.trim().toUpperCase();
            const newDesc = document.getElementById('manage-squad-desc').value.trim();
            const newCity = document.getElementById('manage-squad-city').value;
            const newSkill = document.getElementById('manage-squad-skill').value;
            
            const newOwnerId = document.getElementById('manage-owner').value;
            const newCaptainId = document.getElementById('manage-captain').value;
            const newPrivacy = document.getElementById('manage-privacy').value;

            try {
                if (newAbbr !== currentSquadData.abbreviation) {
                    const abbrCheckQ = query(collection(db, "squads"), where("abbreviation", "==", newAbbr));
                    const abbrCheckSnap = await getDocs(abbrCheckQ);
                    if (!abbrCheckSnap.empty) {
                        alert(`The abbreviation [${newAbbr}] is already taken by another squad!`);
                        btn.disabled = false;
                        btn.innerHTML = `<span class="material-symbols-outlined">save</span> Save All Changes`;
                        return;
                    }
                }

                let finalLogoUrl = currentSquadData.logoUrl;
                if (selectedLogoFile) {
                    btn.textContent = 'OPTIMIZING LOGO...';
                    const optimizedBlob = await resizeAndCropImage(selectedLogoFile, 300);
                    btn.textContent = 'UPLOADING LOGO...';
                    finalLogoUrl = await uploadSquadLogo(optimizedBlob, newName);
                }

                btn.textContent = 'SAVING DETAILS...';

                const capProfile = currentMemberProfiles.find(m => m.uid === newCaptainId);
                const newCaptainName = capProfile ? capProfile.displayName : "Unknown";

                await updateDoc(doc(db, "squads", squadId), {
                    name: newName,
                    abbreviation: newAbbr,
                    description: newDesc,
                    homeCity: newCity,
                    skillLevel: newSkill,
                    logoUrl: finalLogoUrl,
                    ownerId: newOwnerId,
                    captainId: newCaptainId,
                    captainName: newCaptainName,
                    joinPrivacy: newPrivacy
                });
                
                closeManageModalBtn.click();
                loadSquadDetails();

            } catch (e) {
                console.error(e);
                alert("Failed to update squad administration.");
            } finally {
                btn.disabled = false;
                btn.innerHTML = `<span class="material-symbols-outlined">save</span> Save All Changes`;
            }
        });
    }
});
