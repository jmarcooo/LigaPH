import { auth, db, storage } from './firebase-setup.js';
import { doc, getDoc, updateDoc, setDoc, deleteDoc, arrayUnion, arrayRemove, collection, query, where, getDocs, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";

document.addEventListener('DOMContentLoaded', async () => {
    const mainContainer = document.getElementById('squad-details-main');
    let actionsContainer = null; 

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

    let squadHistoryGames = [];

    const urlParams = new URLSearchParams(window.location.search);
    const squadId = urlParams.get('id');

    if (!squadId) {
        mainContainer.innerHTML = '<div class="text-center text-error py-20 lg:col-span-12"><p class="text-2xl font-bold">Squad Not Found</p></div>';
        return;
    }

    let currentSquadData = null;
    let currentUser = null;
    let currentUserProfile = null;
    let currentMemberProfiles = []; 
    let pendingChallenges = [];
    
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
            try {
                const snap = await getDoc(doc(db, "users", user.uid));
                if (snap.exists()) currentUserProfile = snap.data();
            } catch(e) {}
            await checkUserSquadStatus(user.uid);
        } else {
            currentUserProfile = null;
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
                
                if (!myOwnSquadData.members) myOwnSquadData.members = [];
                if (myOwnSquadData.captainId && !myOwnSquadData.members.includes(myOwnSquadData.captainId)) {
                    myOwnSquadData.members.unshift(myOwnSquadData.captainId);
                }
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

    function formatDateFriendly(dateString) {
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        } catch(e) { return dateString; }
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
                if (typeof uid === 'string') {
                    const userSnap = await getDoc(doc(db, "users", uid));
                    if (userSnap.exists()) users.push({ uid, ...userSnap.data() });
                }
            } catch (e) { console.warn(`Could not fetch user ${uid}`); }
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
            loadSquadHistory();

        } catch (error) {
            console.error(error);
            mainContainer.innerHTML = `<div class="text-center text-error py-20 lg:col-span-12"><p class="text-2xl font-bold">Error Loading Squad</p><p class="text-sm mt-2 text-on-surface-variant">${error.message}</p></div>`;
        }
    }

    function renderSquadUI(members, applicants) {
        const rawTitle = currentSquadData.name || "Unknown Squad";
        const safeTitle = escapeHTML(rawTitle);
        const safeAbbr = escapeHTML(currentSquadData.abbreviation);
        const rawLocation = currentSquadData.homeCity || currentSquadData.court || "Anywhere";
        const safeLocation = escapeHTML(rawLocation);
        const safeDesc = escapeHTML(currentSquadData.description || "No description provided.");
        const safeSkill = escapeHTML(currentSquadData.skillLevel || "Intermediate");
        
        const captainProfile = members.find(m => m.uid === currentSquadData.captainId);
        const rawCaptain = captainProfile ? captainProfile.displayName : (currentSquadData.captainName || "Unknown Player");
        const safeCaptain = escapeHTML(rawCaptain);
        const captainPhoto = captainProfile?.photoURL || getFallbackAvatar(rawCaptain);
        
        const squadLogo = currentSquadData.logoUrl || getFallbackLogo(rawTitle);
        
        const ownerId = currentSquadData.ownerId;
        const isOwner = currentUser && currentUser.uid === ownerId;
        const isOwnerOrCaptain = currentUser && (currentUser.uid === currentSquadData.ownerId || currentUser.uid === currentSquadData.captainId);

        let heroBadges = [];
        if (currentSquadData.globalRank && currentSquadData.globalRank <= 3) {
            heroBadges.push(`<span class="bg-primary/20 text-primary px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-primary/30">Rank #${currentSquadData.globalRank}</span>`);
        }
        if (currentSquadData.joinPrivacy === 'open') {
            heroBadges.push(`<span class="bg-secondary/20 text-secondary px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-secondary/30 flex items-center gap-1"><span class="material-symbols-outlined text-[12px]">public</span> Open</span>`);
        } else {
            heroBadges.push(`<span class="bg-surface-container-highest text-outline-variant px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-outline-variant/30 flex items-center gap-1"><span class="material-symbols-outlined text-[12px]">lock</span> Approval</span>`);
        }
        heroBadges.push(`<span class="bg-surface-container-highest text-outline-variant px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-outline-variant/30">${safeSkill}</span>`);
        const heroBadgesHtml = heroBadges.join('');

        const totalGames = (currentSquadData.wins || 0) + (currentSquadData.losses || 0);
        let wr = (calculateWinRate(currentSquadData) * 100).toFixed(1);

        let rosterHtml = '';
        members.forEach(member => {
            const isMemberOwner = member.uid === ownerId;
            const isMemberCaptain = member.uid === currentSquadData.captainId;
            const rawName = member.displayName || 'Unknown';
            const name = escapeHTML(rawName);
            const photo = member.photoURL || getFallbackAvatar(rawName);
            
            const rawPos = member.primaryPosition || 'Unassigned';
            const fullPos = posMap[rawPos] || rawPos;
            
            const attended = member.gamesAttended || 0;
            const missed = member.gamesMissed || 0;
            const userTotalGames = attended + missed;
            const reliabilityScore = userTotalGames === 0 ? 100 : Math.round((attended / userTotalGames) * 100);
            const props = member.commendations || 0;

            let positionHtml = fullPos;
            if (isMemberCaptain) positionHtml += ' • CAPTAIN';
            if (isMemberOwner && !isMemberCaptain) positionHtml += ' • OWNER';

            const relColor = reliabilityScore < 75 ? 'bg-error' : 'bg-primary';
            const relTextColor = reliabilityScore < 75 ? 'text-error' : 'text-primary';

            let kickHtml = '';
            if (isOwner && !isMemberOwner) {
                kickHtml = `
                    <div class="ml-4 pl-4 border-l border-outline-variant/10 hidden md:flex items-center gap-2 shrink-0">
                        <button onclick="event.stopPropagation(); window.kickPlayer('${member.uid}')" class="p-2 bg-error/10 hover:bg-error hover:text-white text-error border border-error/20 rounded-xl transition-all shadow-sm group-hover:scale-105" title="Remove Player">
                            <span class="material-symbols-outlined text-[16px]">person_remove</span>
                        </button>
                    </div>
                `;
            }

            rosterHtml += `
                <div class="bg-surface-container p-4 rounded-2xl border border-outline-variant/10 flex items-center justify-between group hover:bg-surface-container-highest transition-colors shadow-sm cursor-pointer" onclick="window.location.href='profile.html?id=${member.uid}'">
                    
                    <div class="flex items-center gap-4 flex-1 min-w-0">
                        <img src="${photo}" onerror="this.onerror=null; this.src='${getFallbackAvatar(rawName)}';" class="w-12 h-12 rounded-xl object-cover border border-outline-variant/30 shrink-0 bg-surface-container">
                        <div class="min-w-0 flex-1">
                            <h5 class="font-bold text-sm text-on-surface break-words leading-tight group-hover:text-primary transition-colors">${name}</h5>
                            <span class="text-[10px] text-outline-variant uppercase font-medium tracking-widest mt-1 truncate block">${escapeHTML(positionHtml)}</span>
                        </div>
                    </div>
                    
                    <div class="hidden sm:flex items-center gap-6 md:gap-8 mx-6 md:mx-10 shrink-0">
                        <div class="text-left w-16">
                            <p class="text-[9px] text-outline-variant uppercase font-black tracking-widest mb-1">GAMES</p>
                            <p class="font-black text-on-surface text-sm leading-tight">${userTotalGames}</p>
                        </div>
                        <div class="text-left w-16">
                            <p class="text-[9px] text-outline-variant uppercase font-black tracking-widest mb-1">PROPS</p>
                            <p class="font-black text-on-surface text-sm leading-tight">${props}</p>
                        </div>
                        <div class="text-left w-24">
                            <p class="text-[9px] text-outline-variant uppercase font-black tracking-widest mb-1 flex justify-between">RELIABILITY <span class="font-black ${relTextColor}">${reliabilityScore}%</span></p>
                            <div class="w-full h-1 bg-surface-container-highest rounded-full mt-1.5 relative overflow-hidden">
                                <div class="absolute inset-y-0 left-0 ${relColor}" style="width: ${reliabilityScore}%"></div>
                            </div>
                        </div>
                    </div>
                    ${kickHtml}
                </div>
            `;
        });

        let applicationsHtml = '';
        if (isOwner) {
            let applicantList = '<p class="text-sm text-on-surface-variant mb-4">No pending applications.</p>';
            if (applicants.length > 0) {
                applicantList = applicants.map(app => {
                    const rawAppName = app.displayName || 'Unknown';
                    const appName = escapeHTML(rawAppName);
                    const appPhoto = app.photoURL || getFallbackAvatar(rawAppName);
                    const rawPosApp = app.primaryPosition || 'Unassigned';
                    const fullPosApp = posMap[rawPosApp] || rawPosApp;

                    return `
                    <div class="flex items-center justify-between bg-surface-container p-3 rounded-xl border border-outline-variant/10 hover:border-primary/30 transition-colors">
                        <div class="flex items-center gap-3 cursor-pointer flex-1 min-w-0" onclick="window.location.href='profile.html?id=${app.uid}'">
                            <img src="${appPhoto}" onerror="this.onerror=null; this.src='${getFallbackAvatar(rawAppName)}';" class="w-10 h-10 rounded-full object-cover border border-outline-variant/30">
                            <div class="min-w-0">
                                <p class="font-bold text-sm text-on-surface truncate leading-tight">${appName}</p>
                                <p class="text-[10px] text-outline-variant uppercase tracking-widest mt-0.5">${escapeHTML(fullPosApp)}</p>
                            </div>
                        </div>
                        <div class="flex gap-2 shrink-0">
                            <button onclick="window.resolveApplication('${app.uid}', false)" class="p-2 rounded-lg bg-error/10 text-error hover:bg-error hover:text-white transition-colors border border-error/20"><span class="material-symbols-outlined text-[16px]">close</span></button>
                            <button onclick="window.resolveApplication('${app.uid}', true)" class="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-on-primary-container transition-colors border border-primary/20"><span class="material-symbols-outlined text-[16px]">check</span></button>
                        </div>
                    </div>
                `}).join('');
            }
            
            if (currentSquadData.joinPrivacy === 'approval' || applicants.length > 0) {
                applicationsHtml = `
                    <details class="bg-[#14171d] border border-outline-variant/20 rounded-2xl shadow-sm overflow-hidden group" ${applicants.length > 0 ? 'open' : ''}>
                        <summary class="p-4 font-headline text-sm font-black uppercase tracking-widest text-on-surface flex justify-between items-center cursor-pointer select-none hover:bg-surface-container-highest transition-colors">
                            <span class="flex items-center gap-2"><span class="material-symbols-outlined text-primary text-[18px]">how_to_reg</span> Pending Joins <span class="bg-primary/20 text-primary text-[10px] px-2 py-0.5 rounded-full ml-2">${applicants.length}</span></span>
                            <span class="material-symbols-outlined transition-transform group-open:rotate-180">expand_more</span>
                        </summary>
                        <div class="p-4 border-t border-outline-variant/10 space-y-2 bg-surface-container-lowest">
                            ${applicantList}
                        </div>
                    </details>
                `;
            }
        }

        let challengesHtml = '';
        if (pendingChallenges.length > 0 && (isOwnerOrCaptain || currentSquadData.members.includes(currentUser?.uid))) {
            let listHtml = pendingChallenges.map(c => {
                const challengingTeam = allSquadsList.find(s => s.id === c.challengerSquadId);
                const liveLogo = challengingTeam?.logoUrl || c.challengerLogo || getFallbackLogo(c.challengerName);

                return `
                <div onclick="window.openViewChallengeModal('${c.id}')" class="bg-surface-container hover:bg-surface-container-highest cursor-pointer p-4 rounded-2xl border border-error/30 flex items-center justify-between gap-4 mb-2 shadow-sm transition-all group active:scale-[0.98]">
                    <div class="flex items-center gap-4 min-w-0">
                        <div class="w-12 h-12 rounded-xl border border-error/20 bg-surface-container shrink-0 overflow-hidden shadow-inner">
                            <img src="${liveLogo}" onerror="this.onerror=null; this.src='${getFallbackLogo(c.challengerName)}';" class="w-full h-full object-cover">
                        </div>
                        <div class="min-w-0">
                            <p class="text-[9px] font-bold text-error uppercase tracking-widest flex items-center gap-1 mb-0.5"><span class="material-symbols-outlined text-[12px]">warning</span> Incoming Match</p>
                            <p class="font-headline font-black italic text-sm text-on-surface uppercase leading-tight break-words"><span class="text-outline-variant">[${escapeHTML(c.challengerAbbr)}]</span> ${escapeHTML(c.challengerName)}</p>
                        </div>
                    </div>
                    <div class="shrink-0 flex flex-col items-end gap-2">
                        <div class="w-8 h-8 rounded-full bg-surface-container-highest border border-outline-variant/10 flex items-center justify-center group-hover:bg-error/10 group-hover:text-error group-hover:border-error/30 transition-colors">
                            <span class="material-symbols-outlined text-[18px]">chevron_right</span>
                        </div>
                    </div>
                </div>
            `}).join('');

            challengesHtml = `
                <details class="bg-[#14171d] border border-error/30 rounded-2xl shadow-sm overflow-hidden group" open>
                    <summary class="p-4 font-headline text-sm font-black uppercase tracking-widest text-error flex justify-between items-center cursor-pointer select-none hover:bg-error/5 transition-colors">
                        <span class="flex items-center gap-2"><span class="material-symbols-outlined text-[18px]">swords</span> Match Requests <span class="bg-error/20 text-error text-[10px] px-2 py-0.5 rounded-full ml-2">${pendingChallenges.length}</span></span>
                        <span class="material-symbols-outlined transition-transform group-open:rotate-180">expand_more</span>
                    </summary>
                    <div class="p-4 border-t border-error/10 space-y-2 bg-surface-container-lowest">
                        ${listHtml}
                    </div>
                </details>
            `;
        }

        let adminOverrideHtml = '';
        if (currentUserProfile && currentUserProfile.accountType === 'Administrator' && currentSquadData.ownerId !== currentUser?.uid && currentSquadData.captainId !== currentUser?.uid) {
            adminOverrideHtml = `
                <div class="bg-error/10 border border-error/30 p-5 rounded-2xl flex flex-col items-center justify-between gap-4 shadow-md w-full mt-6 text-center">
                    <h3 class="font-headline text-error font-black italic uppercase tracking-tighter text-lg flex items-center justify-center gap-2 mb-1">
                        <span class="material-symbols-outlined text-[20px]">gavel</span> Admin Override
                    </h3>
                    <p class="text-xs text-on-surface-variant leading-relaxed">Force disband and delete this squad from the database.</p>
                    <button onclick="window.adminForceDisbandSquad('${squadId}', '${safeAbbr}')" class="w-full bg-error hover:brightness-110 text-white px-6 py-3 rounded-xl font-black uppercase text-[11px] tracking-widest shadow-lg active:scale-95 transition-all mt-2">Force Disband</button>
                </div>
            `;
        }

        mainContainer.classList.remove('animate-pulse');
        mainContainer.innerHTML = `
            <div class="col-span-1 lg:col-span-12 flex flex-col md:flex-row gap-6 relative p-6 md:p-10 border-b border-outline-variant/10">
                <div class="absolute inset-0 bg-gradient-to-b from-surface-container-highest/20 to-transparent pointer-events-none rounded-3xl"></div>
                
                <div class="flex-1 min-w-0 z-10 pt-4 order-2 md:order-1 text-center md:text-left">
                    <div class="flex flex-wrap items-center justify-center md:justify-start gap-2 mb-6">
                        ${heroBadgesHtml}
                    </div>
                    
                    <h1 class="font-headline text-5xl sm:text-6xl md:text-7xl lg:text-[5rem] font-black italic tracking-tighter uppercase text-on-surface leading-[0.85] text-shadow-sm mb-8 break-words max-w-4xl">
                        <span class="text-outline-variant">[${safeAbbr}]</span><br> ${safeTitle}
                    </h1>
                    
                    <div class="flex flex-wrap items-center justify-center md:justify-start gap-8 md:gap-12 pt-4 border-t border-outline-variant/10">
                        <div>
                            <p class="text-[10px] text-outline-variant uppercase font-medium tracking-widest mb-1">REGION</p>
                            <p class="font-black text-on-surface text-sm uppercase tracking-widest leading-tight">${safeLocation}</p>
                        </div>
                        <div>
                            <p class="text-[10px] text-outline-variant uppercase font-medium tracking-widest mb-1">GAMES</p>
                            <p class="font-black text-on-surface text-sm uppercase tracking-widest leading-tight">${totalGames}</p>
                        </div>
                        <div>
                            <p class="text-[10px] text-primary uppercase font-medium tracking-widest mb-1">WIN RATE</p>
                            <p class="font-black text-primary text-sm uppercase tracking-widest leading-tight">${wr}%</p>
                        </div>
                    </div>
                </div>
                
                <div class="flex flex-col items-center md:items-end shrink-0 z-10 gap-6 mt-4 md:mt-0 order-1 md:order-2 w-full md:w-auto">
                    <div class="w-32 h-32 md:w-48 md:h-48 rounded-2xl bg-surface-container shrink-0 flex items-center justify-center overflow-hidden shadow-2xl relative border border-outline-variant/20">
                        <img src="${squadLogo}" onerror="this.onerror=null; this.src='${getFallbackLogo(rawTitle)}';" class="w-full h-full object-cover">
                    </div>
                    <div id="squad-actions-container-header" class="w-full md:w-auto flex justify-center md:justify-end">
                        </div>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full">
                <div class="col-span-1 lg:col-span-8 flex flex-col gap-4">
                    <div class="flex items-center justify-between mb-2 pl-2">
                        <h3 class="font-headline text-xl font-black italic uppercase tracking-tighter text-on-surface">SQUAD ROSTER</h3>
                        <div class="flex gap-2">
                            <button class="w-8 h-8 rounded-lg bg-surface-container border border-outline-variant/20 flex items-center justify-center hover:bg-surface-container-highest transition-colors"><span class="material-symbols-outlined text-[16px]">filter_list</span></button>
                        </div>
                    </div>
                    <div class="space-y-3">
                        ${rosterHtml}
                    </div>
                </div>

                <div class="col-span-1 lg:col-span-4 flex flex-col gap-4">
                    <div id="squad-history-container" class="bg-surface-container-low p-4 md:p-5 rounded-2xl border border-outline-variant/10 shadow-sm"></div>
                    ${challengesHtml}
                    ${applicationsHtml}
                    ${adminOverrideHtml}
                </div>
            </div>
        `;
        
        updateBottomBar();
    }

    async function loadSquadHistory() {
        const container = document.getElementById('squad-history-container');
        if (!container) return;
        container.innerHTML = '<div class="flex justify-center py-6"><span class="material-symbols-outlined animate-spin text-primary">refresh</span></div>';
        
        try {
            const winQ = query(collection(db, "games"), where("matchResult.winnerSquadId", "==", squadId));
            const loseQ = query(collection(db, "games"), where("matchResult.loserSquadId", "==", squadId));
            
            const [winSnap, loseSnap] = await Promise.all([getDocs(winQ), getDocs(loseQ)]);
            squadHistoryGames = [];
            winSnap.forEach(d => squadHistoryGames.push({ id: d.id, ...d.data(), isWin: true }));
            loseSnap.forEach(d => squadHistoryGames.push({ id: d.id, ...d.data(), isWin: false }));
            
            squadHistoryGames.sort((a, b) => (b.matchResult?.reportedAt?.toMillis() || 0) - (a.matchResult?.reportedAt?.toMillis() || 0));
            
            if (squadHistoryGames.length === 0) {
                container.innerHTML = `
                    <div class="flex items-center justify-between mb-3">
                        <h3 class="font-headline text-sm font-black uppercase tracking-widest text-on-surface">Match History</h3>
                    </div>
                    <div class="text-center py-4 opacity-50">
                        <p class="text-[10px] text-outline uppercase tracking-widest font-black">No completed matches yet.</p>
                    </div>
                `;
                return;
            }
            
            let historyHtml = `
                <div class="flex items-center justify-between mb-3">
                    <h3 class="font-headline text-sm font-black uppercase tracking-widest text-on-surface">Match History</h3>
                    <a href="#" class="text-[10px] font-black uppercase tracking-widest text-primary hover:text-primary-container transition-colors">Archive</a>
                </div>
                <div class="space-y-2 max-h-[300px] overflow-y-auto hide-scrollbar pr-1">
            `;
            
            squadHistoryGames.forEach(game => {
                const isWin = game.isWin;
                const resultColor = isWin ? 'text-primary' : 'text-error';
                const resultText = isWin ? 'W' : 'L';
                const oppId = isWin ? game.matchResult.loserSquadId : game.matchResult.winnerSquadId;
                
                const myScore = game.matchResult.scores[squadId] || 0;
                const opponentScore = game.matchResult.scores[oppId] || 0;
                
                historyHtml += `
                    <div onclick="window.openSquadGameModal('${game.id}')" class="bg-[#14171d] p-3 rounded-xl border-l-4 ${isWin ? 'border-l-primary' : 'border-l-error'} border-y border-r border-outline-variant/10 flex flex-col gap-2 cursor-pointer hover:bg-surface-container-highest transition-colors shadow-sm group">
                        <div class="flex items-center justify-between">
                            <span class="text-[8px] font-black uppercase tracking-widest ${resultColor}">${resultText}</span>
                            <p class="text-[9px] text-outline-variant uppercase font-bold tracking-widest">${formatDateFriendly(game.date)}</p>
                        </div>
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-2">
                                <p class="font-black text-on-surface text-xl ${isWin ? 'text-primary' : ''}">${myScore}</p>
                                <span class="text-[10px] font-bold text-outline-variant/50 uppercase tracking-widest">vs</span>
                                <p class="font-black text-on-surface text-xl ${!isWin ? 'text-error' : ''}">${opponentScore}</p>
                            </div>
                            <p class="text-[10px] text-outline-variant uppercase font-medium truncate max-w-[80px] text-right">${escapeHTML(game.matchResult.scores.oppAbbr || "OPP")}</p>
                        </div>
                    </div>
                `;
            });
            
            historyHtml += `</div>`;
            container.innerHTML = historyHtml;
            
        } catch(e) {
            console.error(e);
            container.innerHTML = '<p class="text-xs text-error">Failed to load history.</p>';
        }
    }

    window.openSquadGameModal = async function(gameId) {
        const game = squadHistoryGames.find(g => g.id === gameId);
        if (!game) return;
        
        const modal = document.getElementById('squad-game-modal');
        const contentContainer = document.getElementById('squad-game-modal-content');
        
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            modal.querySelector('div').classList.remove('scale-95');
        }, 10);
        
        contentContainer.innerHTML = '<div class="flex justify-center py-10"><span class="material-symbols-outlined animate-spin text-4xl text-primary">refresh</span></div>';
        
        try {
            const opponentId = game.matchResult.winnerSquadId === squadId ? game.matchResult.loserSquadId : game.matchResult.winnerSquadId;
            const myScore = game.matchResult.scores[squadId] || 0;
            const opponentScore = game.matchResult.scores[opponentId] || 0;
            
            const players = await fetchUsersByUids(game.players || []);
            
            let playersHtml = players.map(p => `
                <div class="flex items-center gap-3 p-2.5 bg-surface-container rounded-xl border border-outline-variant/10 shadow-sm cursor-pointer hover:bg-surface-container-highest transition-colors" onclick="window.location.href='profile.html?id=${p.uid}'">
                    <img src="${p.photoURL || getFallbackAvatar(p.displayName)}" class="w-8 h-8 rounded-full object-cover border border-outline-variant/30 shrink-0">
                    <span class="text-xs font-bold text-on-surface truncate">${escapeHTML(p.displayName || 'Unknown')}</span>
                </div>
            `).join('');
            
            if (!playersHtml) playersHtml = '<p class="text-xs text-outline italic col-span-2">No players recorded.</p>';

            contentContainer.innerHTML = `
                <div class="text-center mb-6">
                    <span class="inline-block px-3 py-1 rounded-full ${game.isWin ? 'bg-primary/10 text-primary border-primary/20' : 'bg-error/10 text-error border-error/20'} border text-[10px] font-black uppercase tracking-widest mb-3 shadow-sm">
                        ${game.isWin ? 'VICTORY' : 'DEFEAT'}
                    </span>
                    <h3 class="font-headline text-xl md:text-2xl font-black italic uppercase text-on-surface leading-tight break-words">${escapeHTML(game.title)}</h3>
                    <p class="text-xs font-medium text-outline-variant mt-2 flex items-center justify-center gap-1.5"><span class="material-symbols-outlined text-[14px]">calendar_today</span> ${formatDateFriendly(game.date)} @ ${escapeHTML(game.location)}</p>
                </div>
                
                <div class="flex items-center justify-center gap-8 mb-6 bg-[#0a0e14] py-6 rounded-3xl border border-outline-variant/20 shadow-inner">
                    <div class="text-center flex-1">
                        <p class="text-[10px] text-outline uppercase font-bold tracking-widest mb-1">Your Squad</p>
                        <p class="text-5xl font-black ${game.isWin ? 'text-primary drop-shadow-md' : 'text-on-surface'}">${myScore}</p>
                    </div>
                    <span class="text-2xl font-black text-outline-variant">-</span>
                    <div class="text-center flex-1">
                        <p class="text-[10px] text-outline uppercase font-bold tracking-widest mb-1">Opponent</p>
                        <p class="text-5xl font-black ${!game.isWin ? 'text-primary drop-shadow-md' : 'text-on-surface'}">${opponentScore}</p>
                    </div>
                </div>
                
                <div>
                    <h4 class="text-[10px] font-black uppercase tracking-widest text-outline mb-3 border-b border-outline-variant/10 pb-2">Players Who Participated</h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1 hide-scrollbar">
                        ${playersHtml}
                    </div>
                </div>
            `;
            
        } catch(e) {
            console.error(e);
            contentContainer.innerHTML = '<p class="text-sm text-error text-center py-6">Failed to load game details.</p>';
        }
    };
    
    window.closeSquadGameModal = function() {
        const modal = document.getElementById('squad-game-modal');
        modal.classList.add('opacity-0');
        modal.querySelector('div').classList.add('scale-95');
        setTimeout(() => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }, 300);
    };

    function updateBottomBar() {
        actionsContainer = document.getElementById('squad-actions-container-header');
        if (!actionsContainer || !currentSquadData) return;

        const isGuest = !currentUser;
        const uid = currentUser ? currentUser.uid : null;
        
        const isOwner = uid === currentSquadData.ownerId;
        const isMember = currentSquadData.members.includes(uid);
        const isApplicant = currentSquadData.applicants.includes(uid);
        const privacy = currentSquadData.joinPrivacy || 'approval';

        actionsContainer.innerHTML = ''; 

        let primaryBtnClass = "w-full md:w-auto bg-secondary text-on-secondary hover:brightness-110 px-8 md:px-10 py-4 md:py-5 rounded-full font-headline font-black uppercase text-[12px] md:text-[13px] tracking-widest transition-all border border-secondary/20 active:scale-95 shadow-xl flex items-center justify-center gap-2.5";

        if (isGuest) {
            actionsContainer.innerHTML = `<button onclick="window.location.href='index.html'" class="${primaryBtnClass} bg-surface-variant text-on-surface border-outline-variant/30">LOGIN TO APPLY <span class="material-symbols-outlined text-[20px]">login</span></button>`;
        } else if (isOwner) {
            actionsContainer.innerHTML = `<button onclick="window.openManageModal()" class="${primaryBtnClass}"><span class="material-symbols-outlined text-[20px]">settings</span> MANAGE SQUAD</button>`;
        } else if (isMember) {
            actionsContainer.innerHTML = `<button onclick="window.leaveSquad()" class="${primaryBtnClass} bg-error/10 text-error border-error/30 hover:bg-error/20 shadow-none">LEAVE SQUAD <span class="material-symbols-outlined text-[20px]">logout</span></button>`;
        } else if (isApplicant) {
            actionsContainer.innerHTML = `<button disabled class="${primaryBtnClass} bg-surface-container-highest text-outline-variant border-outline-variant/30 opacity-50 cursor-not-allowed shadow-none">APPLICATION PENDING <span class="material-symbols-outlined text-[20px]">schedule</span></button>`;
        } else if (userCurrentSquadId && userCurrentSquadId !== squadId) {
            if (isUserCaptainOfOwnSquad) {
                actionsContainer.innerHTML = `<button onclick="window.openChallengeModal()" class="${primaryBtnClass} bg-primary border-primary text-on-primary-container hover:brightness-110"><span class="material-symbols-outlined text-[20px]">swords</span> ISSUE A CHALLENGE</button>`;
            } else {
                actionsContainer.innerHTML = `<button disabled class="${primaryBtnClass} bg-surface-container-highest text-outline-variant border-outline-variant/30 opacity-50 cursor-not-allowed shadow-none">IN A SQUAD <span class="material-symbols-outlined text-[20px]">lock</span></button>`;
            }
        } else {
            if (privacy === 'open') {
                actionsContainer.innerHTML = `<button onclick="window.joinSquadInstantly()" class="${primaryBtnClass} bg-primary border-primary text-on-primary-container">JOIN NOW <span class="material-symbols-outlined text-[22px]">chevron_right</span></button>`;
            } else {
                actionsContainer.innerHTML = `<button onclick="window.applyToSquad()" class="${primaryBtnClass} bg-surface-container border-primary/30 text-primary hover:bg-primary hover:text-on-primary-container shadow-sm"><span class="material-symbols-outlined text-[20px]">person_add</span> APPLY TO JOIN</button>`;
            }
        }
    }

    window.openChallengeModal = async function() {
        if (!currentSquadData || !myOwnSquadData) return;
        
        document.getElementById('challenge-target-name').textContent = currentSquadData.name;
        
        const targetLogo = document.getElementById('challenge-target-logo');
        targetLogo.src = currentSquadData.logoUrl || getFallbackLogo(currentSquadData.name);
        targetLogo.onerror = function() { this.onerror = null; this.src = getFallbackLogo(currentSquadData.name); };
        
        const rosterContainer = document.getElementById('challenge-roster-selection');
        rosterContainer.innerHTML = '<p class="text-xs text-center text-outline-variant py-4">Loading your roster...</p>';
        
        challengeModal.classList.remove('hidden');
        challengeModal.classList.add('flex');
        setTimeout(() => {
            challengeModal.classList.remove('opacity-0');
            challengeModal.querySelector('div').classList.remove('scale-95');
        }, 10);

        const myMembers = await fetchUsersByUids(myOwnSquadData.members);
        rosterContainer.innerHTML = '';

        myMembers.sort((a, b) => {
            if (a.uid === currentUser.uid) return -1;
            if (b.uid === currentUser.uid) return 1;
            return 0;
        });

        myMembers.forEach(m => {
            const isMe = m.uid === currentUser.uid;
            const name = escapeHTML(m.displayName || 'Unknown');
            const photoUrl = escapeHTML(m.photoURL) || getFallbackAvatar(name);
            const badge = isMe ? `<span class="bg-primary/20 text-primary px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ml-2 border border-primary/30">YOU / CAPTAIN</span>` : '';
            
            rosterContainer.innerHTML += `
                <label class="flex items-center gap-3 p-3 bg-surface-container hover:bg-surface-container-highest rounded-xl cursor-pointer transition-all border border-outline-variant/10 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                    <input type="checkbox" name="challenge-players" value="${m.uid}" class="rounded border-outline-variant/30 bg-[#0a0e14] text-primary focus:ring-primary w-5 h-5" onchange="window.updateChallengeRosterCount()">
                    <img src="${photoUrl}" class="w-8 h-8 rounded-full object-cover border border-outline-variant/30">
                    <span class="text-sm font-bold text-on-surface flex-1 flex items-center">${name} ${badge}</span>
                </label>
            `;
        });
        window.updateChallengeRosterCount();
    };

    window.updateChallengeRosterCount = function() {
        const checkedCount = document.querySelectorAll('input[name="challenge-players"]:checked').length;
        const counter = document.getElementById('challenge-roster-counter');
        if (counter) {
            counter.textContent = `${checkedCount} / 5 Selected`;
            counter.className = checkedCount === 5 ? "text-[9px] text-primary font-bold text-right mt-1" : "text-[9px] text-error font-bold text-right mt-1";
        }
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

            const checkedBoxes = document.querySelectorAll('input[name="challenge-players"]:checked');
            if (checkedBoxes.length !== 5) {
                alert("You must select exactly 5 starting players to issue a challenge.");
                return;
            }
            const selectedMembers = Array.from(checkedBoxes).map(cb => cb.value);

            const btn = document.getElementById('submit-challenge-btn');
            btn.disabled = true;
            btn.innerHTML = `SENDING...`;

            const dateVal = document.getElementById('challenge-date').value;
            const timeVal = document.getElementById('challenge-time').value;
            const endTimeVal = document.getElementById('challenge-end-time').value;
            const locVal = document.getElementById('challenge-location').value.trim();
            const mapVal = document.getElementById('challenge-map-link').value.trim();
            const msgVal = document.getElementById('challenge-message').value.trim();

            try {
                await addDoc(collection(db, "challenges"), {
                    challengerSquadId: myOwnSquadData.id,
                    challengerName: myOwnSquadData.name,
                    challengerAbbr: myOwnSquadData.abbreviation,
                    challengerLogo: myOwnSquadData.logoUrl || getFallbackLogo(myOwnSquadData.name),
                    challengerMembers: selectedMembers, 
                    challengedSquadId: squadId,
                    date: dateVal,
                    time: timeVal,
                    endTime: endTimeVal,
                    location: locVal,
                    mapLink: mapVal,
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

    window.openViewChallengeModal = async function(challengeId) {
        const c = pendingChallenges.find(ch => ch.id === challengeId);
        if (!c) return;

        const challengingTeam = allSquadsList.find(s => s.id === c.challengerSquadId);
        const liveLogo = challengingTeam?.logoUrl || escapeHTML(c.challengerLogo) || getFallbackLogo(c.challengerName);

        const vcLogo = document.getElementById('vc-challenger-logo');
        vcLogo.src = liveLogo;
        vcLogo.onerror = function() { this.onerror = null; this.src = getFallbackLogo(c.challengerName); };

        document.getElementById('vc-challenger-name').innerHTML = `<span class="text-outline-variant">[${escapeHTML(c.challengerAbbr)}]</span><br/>${escapeHTML(c.challengerName)}`;
        
        let timeString = escapeHTML(c.time);
        if (c.endTime) timeString += ` - ${escapeHTML(c.endTime)}`;
        document.getElementById('vc-datetime').textContent = `${escapeHTML(c.date)} @ ${timeString}`;
        
        document.getElementById('vc-location').textContent = escapeHTML(c.location);
        
        const mapLinkEl = document.getElementById('vc-map-link');
        if (c.mapLink) {
            mapLinkEl.href = c.mapLink;
            mapLinkEl.classList.remove('hidden');
        } else {
            mapLinkEl.classList.add('hidden');
        }

        const msgContainer = document.getElementById('vc-message-container');
        if (c.message) {
            document.getElementById('vc-message').textContent = `"${escapeHTML(c.message)}"`;
            msgContainer.classList.remove('hidden');
        } else {
            msgContainer.classList.add('hidden');
        }

        document.getElementById('vc-accept-roster-section').classList.add('hidden');
        const actionBtnsContainer = document.getElementById('vc-actions');
        actionBtnsContainer.classList.remove('hidden');

        const isOwnerOrCaptain = currentUser && (currentUser.uid === currentSquadData.ownerId || currentUser.uid === currentSquadData.captainId);

        if (isOwnerOrCaptain) {
            actionBtnsContainer.innerHTML = `
                <div class="flex gap-3">
                    <button onclick="window.resolveChallenge('${c.id}', false)" class="flex-1 px-4 py-3 rounded-xl bg-surface-container border border-error/30 text-error hover:bg-error/10 font-bold text-xs uppercase tracking-widest transition-colors shadow-sm">Decline</button>
                    <button onclick="window.prepareAcceptChallenge('${c.id}')" class="flex-1 px-4 py-3 rounded-xl bg-error text-on-primary-container hover:brightness-110 font-black text-xs uppercase tracking-widest transition-all shadow-md active:scale-95">Accept Match</button>
                </div>
            `;
        } else {
            actionBtnsContainer.innerHTML = `
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

    window.prepareAcceptChallenge = async function(challengeId) {
        document.getElementById('vc-actions').classList.add('hidden');
        const acceptSection = document.getElementById('vc-accept-roster-section');
        const rosterContainer = document.getElementById('vc-roster-selection');
        const confirmBtn = document.getElementById('vc-confirm-accept-btn');
        
        acceptSection.classList.remove('hidden');
        rosterContainer.innerHTML = '<p class="text-xs text-center text-outline-variant py-4">Loading your roster...</p>';

        const myMembers = await fetchUsersByUids(currentSquadData.members);
        rosterContainer.innerHTML = '';

        myMembers.sort((a, b) => {
            if (a.uid === currentUser.uid) return -1;
            if (b.uid === currentUser.uid) return 1;
            return 0;
        });

        myMembers.forEach(m => {
            const isMe = m.uid === currentUser.uid;
            const name = escapeHTML(m.displayName || 'Unknown');
            const photoUrl = escapeHTML(m.photoURL) || getFallbackAvatar(name);
            const badge = isMe ? `<span class="bg-primary/20 text-primary px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ml-2 border border-primary/30">YOU / CAPTAIN</span>` : '';
            
            rosterContainer.innerHTML += `
                <label class="flex items-center gap-3 p-3 bg-surface-container hover:bg-surface-container-highest rounded-xl cursor-pointer transition-all border border-outline-variant/10 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                    <input type="checkbox" name="accept-players" value="${m.uid}" class="rounded border-outline-variant/30 bg-[#0a0e14] text-primary focus:ring-primary w-5 h-5" onchange="window.updateAcceptRosterCount()">
                    <img src="${photoUrl}" class="w-8 h-8 rounded-full object-cover border border-outline-variant/30">
                    <span class="text-sm font-bold text-on-surface flex-1 flex items-center">${name} ${badge}</span>
                </label>
            `;
        });
        window.updateAcceptRosterCount();

        confirmBtn.onclick = () => window.resolveChallenge(challengeId, true);
    };

    window.updateAcceptRosterCount = function() {
        const checkedCount = document.querySelectorAll('input[name="accept-players"]:checked').length;
        const counter = document.getElementById('vc-roster-counter');
        if (counter) {
            counter.textContent = `${checkedCount} / 5 Selected`;
            counter.className = checkedCount === 5 ? "text-[9px] text-primary font-bold text-right mt-1" : "text-[9px] text-error font-bold text-right mt-1";
        }
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
                const checkedBoxes = document.querySelectorAll('input[name="accept-players"]:checked');
                if (checkedBoxes.length !== 5) {
                    alert("You must select exactly 5 defending players to accept the challenge.");
                    return;
                }
                const defendingMembers = Array.from(checkedBoxes).map(cb => cb.value);

                const cSnap = await getDoc(doc(db, "challenges", challengeId));
                if (cSnap.exists()) {
                    const cData = cSnap.data();
                    
                    const newGameRef = await addDoc(collection(db, "games"), {
                        title: `[${currentSquadData.abbreviation}] vs [${cData.challengerAbbr}]`,
                        type: "5v5 Squad Match",
                        date: cData.date,
                        time: cData.time,
                        endTime: cData.endTime || '',
                        location: cData.location,
                        mapLink: cData.mapLink || '',
                        skillLevel: currentSquadData.skillLevel || "Intermediate",
                        host: currentSquadData.captainName,
                        hostId: currentSquadData.captainId,
                        players: [...defendingMembers, ...cData.challengerMembers], 
                        status: 'upcoming',
                        createdAt: serverTimestamp()
                    });

                    const newGameId = newGameRef.id;

                    const notifPromises = [];
                    
                    const challengerSquadSnap = await getDoc(doc(db, "squads", cData.challengerSquadId));
                    if (challengerSquadSnap.exists()) {
                        const trueChallengerMembers = challengerSquadSnap.data().members || [];
                        trueChallengerMembers.forEach(uid => {
                            notifPromises.push(addDoc(collection(db, "notifications"), {
                                recipientId: uid,
                                actorId: currentUser.uid,
                                actorName: currentSquadData.name,
                                actorPhoto: currentSquadData.logoUrl || null,
                                type: 'system_alert',
                                message: `accepted your challenge! The match is scheduled.`,
                                link: `game-details.html?id=${newGameId}`,
                                read: false,
                                createdAt: serverTimestamp()
                            }));
                        });
                    }
                    
                    const mySquadMembers = currentSquadData.members || [];
                    mySquadMembers.forEach(uid => {
                        if(uid !== currentUser.uid) {
                            notifPromises.push(addDoc(collection(db, "notifications"), {
                                recipientId: uid,
                                actorId: currentUser.uid,
                                actorName: currentSquadData.name,
                                actorPhoto: currentSquadData.logoUrl || null,
                                type: 'system_alert',
                                message: `Our squad challenge against ${cData.challengerName} is confirmed!`,
                                link: `game-details.html?id=${newGameId}`,
                                read: false,
                                createdAt: serverTimestamp()
                            }));
                        }
                    });

                    await Promise.all(notifPromises);

                    const postContent = `🏆 MATCH CONFIRMED!\n\n[${currentSquadData.abbreviation}] ${currentSquadData.name} has accepted the challenge from [${cData.challengerAbbr}] ${cData.challengerName}!\n\n📍 ${cData.location}\n📅 ${cData.date} @ ${cData.time}\n\nGet ready for battle!`;
                    await addDoc(collection(db, "posts"), {
                        content: postContent,
                        location: cData.location,
                        imageUrl: currentSquadData.logoUrl || null,
                        authorId: 'system',
                        authorName: 'Liga PH',
                        authorPhoto: 'assets/logo-192.png',
                        authorPosition: 'System',
                        createdAt: serverTimestamp(),
                        likedBy: [],
                        commentsCount: 0,
                        type: 'game_promo',
                        gameId: newGameId,
                        visibility: 'Public'
                    });
                }
                await updateDoc(doc(db, "challenges", challengeId), { status: 'accepted' });
                alert("Challenge accepted! The match is live and teams have been notified.");
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

    window.applyToSquad = async function() {
        if (userCurrentSquadId) return alert("You are already in a squad! Please leave your current squad before applying to a new one.");
        if (!confirm("Are you sure you want to apply to join this squad?")) return;

        try {
            await updateDoc(doc(db, "squads", squadId), { applicants: arrayUnion(currentUser.uid) });
            loadSquadDetails();
        } catch(e) { 
            console.error(e); 
            alert("Failed to apply."); 
        }
    };

    window.joinSquadInstantly = async function() {
        if (userCurrentSquadId) return alert("You are already in a squad! Please leave your current squad before joining a new one.");
        if (!confirm("Are you sure you want to join this squad?")) return;

        try {
            await updateDoc(doc(db, "squads", squadId), { members: arrayUnion(currentUser.uid) });
            await setDoc(doc(db, "users", currentUser.uid), { squadId: squadId, squadAbbr: currentSquadData.abbreviation || "" }, { merge: true });
            
            let p = JSON.parse(localStorage.getItem('ligaPhProfile') || '{}');
            p.squadId = squadId;
            p.squadAbbr = currentSquadData.abbreviation || "";
            localStorage.setItem('ligaPhProfile', JSON.stringify(p));

            userCurrentSquadId = squadId;
            loadSquadDetails();
        } catch(e) { 
            console.error(e); 
            alert("Failed to join."); 
        }
    };

    window.leaveSquad = async function() {
        if(confirm("Are you sure you want to leave this squad?")) {
            try {
                await updateDoc(doc(db, "squads", squadId), { members: arrayRemove(currentUser.uid) });
                await setDoc(doc(db, "users", currentUser.uid), { squadId: null, squadAbbr: null }, { merge: true });

                let p = JSON.parse(localStorage.getItem('ligaPhProfile') || '{}');
                p.squadId = null;
                p.squadAbbr = null;
                localStorage.setItem('ligaPhProfile', JSON.stringify(p));

                userCurrentSquadId = null; 
                loadSquadDetails();
            } catch(e) { 
                console.error(e); 
                alert("Failed to leave."); 
            }
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
                await setDoc(doc(db, "users", applicantUid), { squadId: squadId, squadAbbr: currentSquadData.abbreviation }, { merge: true });

                await addDoc(collection(db, "notifications"), {
                    recipientId: applicantUid,
                    actorId: currentUser.uid,
                    actorName: currentSquadData.name,
                    actorPhoto: currentSquadData.logoUrl || null,
                    type: 'system_alert', 
                    message: `Your application to join ${currentSquadData.name} was accepted!`,
                    link: `squad-details.html?id=${squadId}`,
                    read: false,
                    createdAt: serverTimestamp()
                });

            } else {
                await updateDoc(squadRef, { applicants: arrayRemove(applicantUid) });
            }
            loadSquadDetails();
        } catch(e) { 
            console.error(e); 
            alert("Failed to process application."); 
        }
    };

    window.kickPlayer = async function(memberUid) {
        if(confirm("Remove this player from the roster?")) {
            try {
                await updateDoc(doc(db, "squads", squadId), { members: arrayRemove(memberUid) });
                await setDoc(doc(db, "users", memberUid), { squadId: null, squadAbbr: null }, { merge: true });
                loadSquadDetails();
            } catch(e) { 
                console.error(e); 
                alert("Failed to kick player."); 
            }
        }
    };

    window.deleteSquad = async function() {
        if(confirm("DANGER: Are you sure you want to completely delete this squad? This cannot be undone.")) {
            try {
                const members = currentSquadData.members || [];
                for(let m of members) {
                    await setDoc(doc(db, "users", m), { squadId: null, squadAbbr: null }, { merge: true });
                }
                
                let p = JSON.parse(localStorage.getItem('ligaPhProfile') || '{}');
                p.squadId = null;
                p.squadAbbr = null;
                localStorage.setItem('ligaPhProfile', JSON.stringify(p));

                await deleteDoc(doc(db, "squads", squadId));
                window.location.href = 'roster.html';
            } catch(e) { 
                console.error(e); 
                alert("Failed to delete squad."); 
            }
        }
    };

    window.adminForceDisbandSquad = async function(sid, abbr) {
        const confirmDisband = prompt(`ADMIN ACTION: Type "${abbr}" to permanently delete this squad.`);
        if(confirmDisband === abbr) {
            try {
                await deleteDoc(doc(db, "squads", sid));
                alert("Squad has been disbanded by Admin.");
                window.location.replace("roster.html");
            } catch (e) {
                console.error(e);
                alert("Failed to disband squad.");
            }
        } else if (confirmDisband !== null) {
            alert("Abbreviation did not match. Action canceled.");
        }
    };

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
