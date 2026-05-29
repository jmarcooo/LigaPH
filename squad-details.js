import { auth, db, storage } from './firebase-setup.js';
import { doc, getDoc, collection, query, where, getDocs, updateDoc, arrayUnion, arrayRemove, setDoc, deleteDoc, serverTimestamp, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";

function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function getFallbackLogo(name) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'S')}&background=161618&color=ff751f`;
}

function getFallbackAvatar(name) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'P')}&background=161618&color=ff751f`;
}

function formatGameDate(dateStr) {
    const d = new Date(dateStr);
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${monthNames[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatGameTime(timeStr) {
    let [h, m] = timeStr.split(':');
    let period = 'AM';
    h = parseInt(h);
    if (h >= 12) {
        period = 'PM';
        if (h > 12) h -= 12;
    }
    if (h === 0) h = 12;
    return `${h}:${m} ${period}`;
}

function generateStarsHtml(communityRating) {
    const statsAvg = Math.round(communityRating || 0); 
    let starsHtml = '';
    
    for(let i = 1; i <= 5; i++) {
        const isFilled = i <= statsAvg;
        starsHtml += `<span class="material-symbols-outlined text-[10px] md:text-[12px] ${isFilled ? 'text-[#ff751f]' : 'text-gray-300 dark:text-gray-600'}" style="font-variation-settings: 'FILL' ${isFilled ? '1' : '0'};">star</span>`;
    }
    
    return starsHtml;
}

function showToast(message, isError = false) {
    const toast = document.createElement('div');
    toast.className = `fixed bottom-20 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 rounded-full shadow-lg font-bold text-xs uppercase tracking-widest transition-all duration-300 transform translate-y-10 opacity-0 ${isError ? 'bg-red-500 text-white' : 'bg-white dark:bg-[#14171d] text-[#ff751f] border border-[#ff751f]/20'}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-10', 'opacity-0');
    });

    setTimeout(() => {
        toast.classList.add('translate-y-10', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

document.addEventListener('DOMContentLoaded', () => {

    const urlParams = new URLSearchParams(window.location.search);
    const squadId = urlParams.get('id');

    if (!squadId) {
        document.getElementById('squad-details-main').innerHTML = '<div class="text-center py-20"><p class="text-red-500 font-bold">Squad ID is missing.</p><button onclick="window.history.back()" class="mt-4 bg-[#ff751f] text-[#0a0e14] px-6 py-2 rounded-full font-black uppercase text-xs">Go Back</button></div>';
        return;
    }

    let squadData = null;
    let currentUserData = null;
    let squadMembers = [];
    let isCaptain = false;
    let isMember = false;
    let squadGames = [];
    let teamUserIds = [];

    // Form/Modal Elements
    const manageModal = document.getElementById('manage-squad-modal');
    const manageForm = document.getElementById('manage-squad-form');
    const challengeModal = document.getElementById('challenge-squad-modal');
    const challengeForm = document.getElementById('challenge-squad-form');
    const viewChallengeModal = document.getElementById('view-challenge-modal');

    // DOM Setup for select inputs
    const citiesToLoad = [
        "Caloocan City", "Las Piñas City", "Makati City", "Malabon City", "Mandaluyong City", 
        "Manila City", "Marikina City", "Muntinlupa City", "Navotas City", "Parañaque City", 
        "Pasay City", "Pasig City", "Municipality of Pateros", "Quezon City", "San Juan City", "Taguig City", "Valenzuela City"
    ];

    const manageCitySelect = document.getElementById('manage-squad-city');
    if (manageCitySelect) {
        citiesToLoad.forEach(city => {
            const opt = document.createElement('option');
            opt.value = city;
            opt.textContent = city;
            manageCitySelect.appendChild(opt);
        });
    }

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const uSnap = await getDoc(doc(db, "users", user.uid));
            if (uSnap.exists()) {
                currentUserData = { uid: user.uid, ...uSnap.data() };
            }
        }
        await loadSquadDetails();
    });

    async function loadSquadDetails() {
        try {
            const sqSnap = await getDoc(doc(db, "squads", squadId));
            if (!sqSnap.exists()) throw new Error("Squad not found");
            
            squadData = sqSnap.data();
            
            if (auth.currentUser) {
                isCaptain = squadData.captainId === auth.currentUser.uid;
                isMember = squadData.members && squadData.members.includes(auth.currentUser.uid);
            }

            teamUserIds = Array.isArray(squadData.members) ? squadData.members : [];
            
            if (teamUserIds.length > 0) {
                const membersData = [];
                for(let uid of teamUserIds) {
                    const uSnap = await getDoc(doc(db, "users", uid));
                    if(uSnap.exists()){
                        // Get community rating dynamically for members
                        const rQ = query(collection(db, "ratings"), where("targetUserId", "==", uid));
                        const rSnap = await getDocs(rQ);
                        let sum = 0, count = 0;
                        rSnap.forEach(d => {
                            if(d.data().rating) { sum += d.data().rating; count++; }
                        });
                        const cRating = count > 0 ? Math.round(sum/count) : 0;
                        
                        membersData.push({ id: uid, ...uSnap.data(), communityRating: cRating });
                    }
                }
                squadMembers = membersData;
            } else {
                squadMembers = [];
            }

            const gamesQ = query(collection(db, "games"), where("type", "==", "squad_challenge"));
            const gamesSnap = await getDocs(gamesQ);
            
            squadGames = [];
            gamesSnap.forEach(docSnap => {
                const g = docSnap.data();
                if ((g.challengerId === squadId) || (g.targetId === squadId && g.challengeStatus !== 'declined')) {
                    squadGames.push({ id: docSnap.id, ...g });
                }
            });
            
            squadGames.sort((a, b) => new Date(`${b.date}T${b.time}`) - new Date(`${a.date}T${a.time}`));

            renderSquadUI();

        } catch (error) {
            console.error("Error loading squad:", error);
            document.getElementById('squad-details-main').innerHTML = `
                <div class="text-center py-20 bg-white dark:bg-[#14171d] rounded-3xl border border-gray-200 dark:border-white/10 shadow-sm max-w-2xl mx-auto">
                    <span class="material-symbols-outlined text-6xl text-gray-400 mb-4">error</span>
                    <h2 class="font-headline text-2xl font-black uppercase text-gray-900 dark:text-white">Squad Unavailable</h2>
                    <p class="text-gray-500 mt-2">This squad may have been disbanded or doesn't exist.</p>
                    <button onclick="window.history.back()" class="mt-6 bg-[#ff751f] hover:brightness-110 text-gray-900 px-6 py-3 rounded-xl font-black uppercase tracking-widest text-xs transition-colors shadow-md">Go Back</button>
                </div>
            `;
        }
    }

    function renderSquadUI() {
        const safeName = escapeHTML(squadData.name);
        const safeAbbr = escapeHTML(squadData.abbreviation);
        const logoUrl = squadData.logoUrl ? escapeHTML(squadData.logoUrl) : getFallbackLogo(safeName);
        const wins = squadData.wins || 0;
        const losses = squadData.losses || 0;
        const winPct = (wins + losses) === 0 ? 0 : Math.round((wins / (wins + losses)) * 100);
        const points = (wins * 50) - (losses * 15);
        const safePoints = points < 0 ? 0 : points;
        const privacy = squadData.joinPrivacy === 'open' ? 'Open Roster' : 'Approval Required';

        let primaryActionButton = '';
        
        if (isCaptain) {
            primaryActionButton = `
                <button onclick="window.openManageModal()" class="w-full bg-[#ff751f] hover:brightness-110 text-[#0a0e14] py-3.5 rounded-xl font-black text-xs uppercase tracking-widest shadow-[0_4px_15px_rgba(255,117,31,0.2)] active:scale-95 transition-all flex items-center justify-center gap-2">
                    <span class="material-symbols-outlined text-[16px]">settings</span> Manage Squad
                </button>
            `;
        } else if (isMember) {
            primaryActionButton = `
                <button onclick="window.leaveSquad()" class="w-full bg-red-100 dark:bg-red-500/10 hover:bg-red-200 dark:hover:bg-red-500/20 text-red-600 dark:text-red-500 py-3.5 rounded-xl font-black text-xs uppercase tracking-widest border border-red-200 dark:border-red-500/20 active:scale-95 transition-all flex items-center justify-center gap-2">
                    <span class="material-symbols-outlined text-[16px]">logout</span> Leave Squad
                </button>
            `;
        } else if (auth.currentUser && currentUserData) {
            if (currentUserData.squadId) {
                primaryActionButton = `
                    <button onclick="window.openChallengeModal()" class="w-full bg-gray-900 dark:bg-white text-white dark:text-[#0a0e14] py-3.5 rounded-xl font-black text-xs uppercase tracking-widest shadow-md hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 group">
                        <span class="material-symbols-outlined group-hover:rotate-12 transition-transform text-[16px]">swords</span> Challenge Squad
                    </button>
                `;
            } else {
                if (squadData.joinPrivacy === 'open') {
                    primaryActionButton = `
                        <button onclick="window.joinSquad()" class="w-full bg-[#ff751f] hover:brightness-110 text-[#0a0e14] py-3.5 rounded-xl font-black text-xs uppercase tracking-widest shadow-[0_4px_15px_rgba(255,117,31,0.2)] active:scale-95 transition-all flex items-center justify-center gap-2">
                            <span class="material-symbols-outlined text-[16px]">person_add</span> Join Squad
                        </button>
                    `;
                } else {
                    const hasRequested = squadData.joinRequests && squadData.joinRequests.includes(auth.currentUser.uid);
                    if (hasRequested) {
                        primaryActionButton = `
                            <button disabled class="w-full bg-gray-200 dark:bg-white/10 text-gray-500 dark:text-gray-400 py-3.5 rounded-xl font-black text-xs uppercase tracking-widest border border-gray-300 dark:border-white/20 cursor-not-allowed flex items-center justify-center gap-2">
                                <span class="material-symbols-outlined text-[16px]">schedule</span> Request Pending
                            </button>
                        `;
                    } else {
                        primaryActionButton = `
                            <button onclick="window.requestJoin()" class="w-full bg-[#ff751f] hover:brightness-110 text-[#0a0e14] py-3.5 rounded-xl font-black text-xs uppercase tracking-widest shadow-[0_4px_15px_rgba(255,117,31,0.2)] active:scale-95 transition-all flex items-center justify-center gap-2">
                                <span class="material-symbols-outlined text-[16px]">pan_tool</span> Request to Join
                            </button>
                        `;
                    }
                }
            }
        }

        let pendingRequestsHtml = '';
        if (isCaptain && squadData.joinRequests && squadData.joinRequests.length > 0) {
            pendingRequestsHtml = `
                <div class="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-[24px] p-5 mb-6">
                    <h3 class="font-headline font-black uppercase text-xs tracking-widest text-red-600 dark:text-red-500 mb-3 flex items-center gap-2">
                        <span class="material-symbols-outlined text-[16px]">notification_important</span> Pending Join Requests (${squadData.joinRequests.length})
                    </h3>
                    <div id="join-requests-list" class="space-y-2">
                        <div class="text-center text-[10px] text-gray-500 font-bold uppercase tracking-widest animate-pulse">Loading profiles...</div>
                    </div>
                </div>
            `;
            loadJoinRequests(squadData.joinRequests);
        }

        let membersHtml = '';
        squadMembers.forEach(m => {
            const mSafeName = escapeHTML(m.displayName || 'Unknown');
            const mPhoto = m.photoURL ? escapeHTML(m.photoURL) : getFallbackAvatar(mSafeName);
            const rawPos = m.primaryPosition || 'N/A';
            const mRole = m.id === squadData.captainId 
                ? '<span class="bg-[#ff751f] text-[#0a0e14] px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest">Captain</span>' 
                : '<span class="bg-gray-200 dark:bg-white/10 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border border-gray-300 dark:border-white/20">Member</span>';
            
            // New logic: Use communityRating and generate the exact requested format
            const starsHtml = generateStarsHtml(m);

            membersHtml += `
                <div class="flex items-center gap-4 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 p-4 rounded-2xl group cursor-pointer hover:border-[#ff751f]/50 transition-colors shadow-sm" onclick="window.location.href='profile.html?id=${m.id}'">
                    <img src="${mPhoto}" class="w-12 h-12 md:w-14 md:h-14 rounded-full object-cover border-2 border-white dark:border-[#0a0e14] shadow-sm shrink-0">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-1">
                            <h4 class="font-headline font-black italic uppercase text-gray-900 dark:text-white truncate text-sm md:text-base group-hover:text-[#ff751f] transition-colors">${mSafeName}</h4>
                            ${mRole}
                        </div>
                        <div class="flex items-center gap-1.5 mb-1.5">
                            <span class="text-[9px] text-[#ff751f] font-black uppercase tracking-widest">${rawPos}</span>
                            <span class="text-gray-300 dark:text-gray-600 px-0.5">•</span>
                            <div class="flex items-center -space-x-0.5">
                                ${starsHtml}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });

        let activeGamesHtml = '';
        let pastGamesHtml = '';

        if (squadGames.length === 0) {
            activeGamesHtml = '<div class="text-center text-gray-500 dark:text-gray-400 py-8 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-200 dark:border-white/10 text-[11px] font-bold uppercase tracking-widest shadow-inner">No squad matchups recorded yet.</div>';
        } else {
            const now = new Date();
            const activeList = [];
            const pastList = [];

            squadGames.forEach(g => {
                const gameStart = new Date(`${g.date}T${g.time}`);
                const gameEnd = new Date(gameStart.getTime() + (2 * 60 * 60 * 1000));
                
                if (g.status === 'completed' || now > gameEnd) pastList.push(g);
                else activeList.push(g);
            });

            if (activeList.length === 0) {
                activeGamesHtml = '<div class="text-center text-gray-500 dark:text-gray-400 py-6 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-200 dark:border-white/10 text-[10px] font-bold uppercase tracking-widest shadow-inner">No upcoming matchups.</div>';
            } else {
                activeList.forEach(g => activeGamesHtml += renderSquadGameCard(g, false));
            }

            if (pastList.length === 0) {
                pastGamesHtml = '<div class="text-center text-gray-500 dark:text-gray-400 py-6 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-200 dark:border-white/10 text-[10px] font-bold uppercase tracking-widest shadow-inner">No past matchups.</div>';
            } else {
                pastList.forEach(g => pastGamesHtml += renderSquadGameCard(g, true));
            }
        }

        const mainContainer = document.getElementById('squad-details-main');
        mainContainer.classList.remove('animate-pulse');
        
        mainContainer.innerHTML = `
            <div class="bg-white dark:bg-[#14171d] rounded-[32px] p-6 md:p-10 border border-gray-200 dark:border-white/10 shadow-sm flex flex-col md:flex-row items-center md:items-start gap-8 relative overflow-hidden transition-colors duration-300">
                <div class="absolute -top-40 -right-40 w-96 h-96 bg-gradient-to-bl from-[#ff751f]/10 to-transparent rounded-full blur-3xl pointer-events-none"></div>

                <div class="flex flex-col items-center md:items-end w-full md:w-auto order-1 md:order-2 shrink-0 gap-4 z-10">
                    <div class="w-32 h-32 md:w-48 md:h-48 rounded-[24px] bg-gray-50 dark:bg-[#0a0e14] border-4 border-gray-100 dark:border-white/5 flex items-center justify-center overflow-hidden shadow-lg">
                        <img src="${logoUrl}" onerror="this.onerror=null; this.src='${getFallbackLogo(safeName)}';" class="w-full h-full object-cover hover:scale-105 transition-transform duration-500">
                    </div>
                    ${primaryActionButton}
                </div>
                
                <div class="flex-1 w-full flex flex-col items-center md:items-start text-center md:text-left order-2 md:order-1 z-10 pt-2 md:pt-4">
                    <div class="flex flex-wrap justify-center md:justify-start gap-2 mb-3">
                        <span class="bg-[#ff751f]/10 text-[#ff751f] border border-[#ff751f]/20 px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest shadow-sm">${escapeHTML(squadData.skillLevel || 'N/A')}</span>
                        <span class="bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-white/10 px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest shadow-sm">${privacy}</span>
                    </div>
                    
                    <h1 class="font-headline text-4xl md:text-5xl lg:text-6xl font-black italic uppercase tracking-tighter text-gray-900 dark:text-white leading-[1.1] mb-2">
                        <span class="text-gray-400 dark:text-gray-500 block text-lg md:text-2xl mb-1">[${safeAbbr}]</span>
                        ${safeName}
                    </h1>
                    
                    <p class="text-xs md:text-sm text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest flex items-center gap-1.5 mb-6">
                        <span class="material-symbols-outlined text-[16px] text-[#ff751f]">location_on</span> ${escapeHTML(squadData.homeCity || 'Anywhere')}
                    </p>

                    <div class="flex flex-wrap justify-center md:justify-start gap-3 w-full border-t border-gray-200 dark:border-white/10 pt-6 mt-2">
                        <div class="bg-gray-50 dark:bg-[#0a0e14] border border-gray-200 dark:border-white/10 px-5 py-3 rounded-2xl flex-1 md:flex-none min-w-[100px] shadow-inner">
                            <p class="text-[9px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest mb-0.5">Rating</p>
                            <p class="font-black text-[#ff751f] text-xl md:text-2xl leading-none flex items-end gap-1 justify-center md:justify-start">${safePoints} <span class="text-[10px] pb-1">PTS</span></p>
                        </div>
                        <div class="bg-gray-50 dark:bg-[#0a0e14] border border-gray-200 dark:border-white/10 px-5 py-3 rounded-2xl flex-1 md:flex-none min-w-[100px] shadow-inner">
                            <p class="text-[9px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest mb-0.5">Record</p>
                            <p class="font-black text-gray-900 dark:text-white text-xl md:text-2xl leading-none">${wins}-${losses}</p>
                        </div>
                        <div class="bg-gray-50 dark:bg-[#0a0e14] border border-gray-200 dark:border-white/10 px-5 py-3 rounded-2xl flex-1 md:flex-none min-w-[100px] shadow-inner">
                            <p class="text-[9px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest mb-0.5">Win Rate</p>
                            <p class="font-black text-gray-900 dark:text-white text-xl md:text-2xl leading-none">${winPct}%</p>
                        </div>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                <div class="col-span-1 lg:col-span-7 xl:col-span-8 space-y-6">
                    
                    ${pendingRequestsHtml}

                    <div class="bg-white dark:bg-[#14171d] rounded-[32px] p-6 md:p-8 border border-gray-200 dark:border-white/10 shadow-sm transition-colors duration-300">
                        <h3 class="font-headline font-black italic uppercase text-lg text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                            <span class="material-symbols-outlined text-[#ff751f] text-[22px]">info</span> Squad Intel
                        </h3>
                        <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed font-medium whitespace-pre-wrap font-poppins">${escapeHTML(squadData.description || 'No description provided by the captain.')}</p>
                    </div>

                    <div class="bg-white dark:bg-[#14171d] rounded-[32px] p-6 md:p-8 border border-gray-200 dark:border-white/10 shadow-sm transition-colors duration-300">
                        <div class="flex items-center justify-between mb-6">
                            <h3 class="font-headline font-black italic uppercase text-lg text-gray-900 dark:text-white flex items-center gap-2">
                                <span class="material-symbols-outlined text-[#ff751f] text-[22px]">groups</span> Active Roster
                            </h3>
                            <span class="bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-white/10 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">${teamUserIds.length} Members</span>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            ${membersHtml}
                        </div>
                    </div>
                </div>

                <div class="col-span-1 lg:col-span-5 xl:col-span-4 space-y-6">
                    <div class="bg-white dark:bg-[#14171d] rounded-[32px] p-6 border border-gray-200 dark:border-white/10 shadow-sm transition-colors duration-300">
                        <h3 class="font-headline font-black italic uppercase text-lg text-[#ff751f] mb-5 flex items-center gap-2">
                            <span class="material-symbols-outlined text-[22px]">swords</span> Active Matchups
                        </h3>
                        <div class="space-y-3">
                            ${activeGamesHtml}
                        </div>
                    </div>

                    <div class="bg-white dark:bg-[#14171d] rounded-[32px] p-6 border border-gray-200 dark:border-white/10 shadow-sm transition-colors duration-300">
                        <h3 class="font-headline font-black italic uppercase text-lg text-gray-500 dark:text-gray-400 mb-5 flex items-center gap-2">
                            <span class="material-symbols-outlined text-[22px]">history</span> Match History
                        </h3>
                        <div class="space-y-3">
                            ${pastGamesHtml}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function renderSquadGameCard(g, isPast) {
        const isChallenger = g.challengerId === squadId;
        const opponentId = isChallenger ? g.targetId : g.challengerId;
        const opponentName = isChallenger ? g.targetName : g.challengerName;
        const opponentLogo = isChallenger ? g.targetLogo : g.challengerLogo;

        const dateStr = formatGameDate(g.date);
        const timeStr = formatGameTime(g.time);

        let statusBadge = '';
        let resultHtml = '';
        let clickable = `onclick="window.location.href='game-details.html?id=${g.id}'" class="cursor-pointer group bg-gray-50 dark:bg-[#0a0e14] border border-gray-200 dark:border-white/10 p-4 rounded-[20px] hover:border-[#ff751f]/40 transition-colors shadow-sm relative overflow-hidden"`;

        if (g.challengeStatus === 'pending') {
            statusBadge = `<span class="bg-yellow-100 dark:bg-[#FFD700]/10 text-yellow-700 dark:text-[#FFD700] border border-yellow-200 dark:border-[#FFD700]/30 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest shadow-sm">Pending Request</span>`;
            if (isCaptain && !isChallenger) {
                clickable = `onclick="window.openViewChallengeModal('${g.id}')" class="cursor-pointer group bg-gray-50 dark:bg-[#0a0e14] border border-yellow-300 dark:border-[#FFD700]/30 p-4 rounded-[20px] hover:bg-yellow-50 dark:hover:bg-[#FFD700]/5 transition-colors shadow-md relative overflow-hidden"`;
            }
        } else if (g.challengeStatus === 'accepted') {
            statusBadge = `<span class="bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-500 border border-blue-200 dark:border-blue-500/30 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest shadow-sm">Match Confirmed</span>`;
            if (isCaptain && isPast && (!g.challengerReport || !g.targetReport)) {
                clickable = `onclick="window.openSquadGameModal('${g.id}')" class="cursor-pointer group bg-gray-50 dark:bg-[#0a0e14] border border-error/40 p-4 rounded-[20px] hover:bg-error/5 transition-colors shadow-md relative overflow-hidden"`;
                statusBadge = `<span class="bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-500 border border-red-200 dark:border-red-500/30 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest shadow-sm flex items-center gap-1 animate-pulse"><span class="material-symbols-outlined text-[10px]">warning</span> Action Required</span>`;
            }
        }

        if (isPast && g.status === 'completed') {
            let winColor = 'text-gray-500';
            let wlText = 'TIE';
            if (g.winnerId === squadId) {
                winColor = 'text-green-500';
                wlText = 'WIN';
            } else if (g.winnerId && g.winnerId !== 'tie') {
                winColor = 'text-red-500';
                wlText = 'LOSS';
            }
            
            resultHtml = `
                <div class="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col items-end">
                    <span class="font-headline font-black italic text-xl ${winColor}">${wlText}</span>
                    <span class="text-[8px] text-gray-400 font-bold uppercase tracking-widest">Result</span>
                </div>
            `;
            clickable = `onclick="window.location.href='game-details.html?id=${g.id}'" class="cursor-pointer group bg-gray-50 dark:bg-[#0a0e14] border border-gray-200 dark:border-white/10 p-4 rounded-[20px] hover:border-gray-300 dark:hover:border-white/30 transition-colors shadow-sm relative overflow-hidden opacity-80 hover:opacity-100"`;
            statusBadge = `<span class="bg-gray-200 dark:bg-white/10 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-white/20 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest">Completed</span>`;
        }

        return `
            <div ${clickable}>
                <div class="flex items-start justify-between mb-3">
                    ${statusBadge}
                </div>
                <div class="flex items-center gap-3 relative z-10">
                    <div class="w-10 h-10 rounded-xl bg-white dark:bg-[#14171d] border border-gray-200 dark:border-white/10 flex items-center justify-center overflow-hidden shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                        <img src="${escapeHTML(opponentLogo || getFallbackLogo(opponentName))}" class="w-full h-full object-cover">
                    </div>
                    <div class="flex-1 min-w-0 pr-12">
                        <p class="text-[9px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest mb-0.5">Vs.</p>
                        <h4 class="font-headline font-black italic text-gray-900 dark:text-white uppercase truncate text-sm leading-tight mb-1 group-hover:text-[#ff751f] transition-colors">${escapeHTML(opponentName)}</h4>
                        <p class="text-[9px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest flex items-center gap-1"><span class="material-symbols-outlined text-[12px]">schedule</span> ${dateStr} • ${timeStr}</p>
                    </div>
                </div>
                ${resultHtml}
            </div>
        `;
    }

    async function loadJoinRequests(requestUids) {
        const container = document.getElementById('join-requests-list');
        if (!container || !requestUids || requestUids.length === 0) return;

        try {
            let html = '';
            for (let uid of requestUids) {
                const uSnap = await getDoc(doc(db, "users", uid));
                if (uSnap.exists()) {
                    const data = uSnap.data();
                    const safeName = escapeHTML(data.displayName || 'Unknown');
                    const photo = data.photoURL ? escapeHTML(data.photoURL) : getFallbackAvatar(safeName);
                    
                    html += `
                        <div class="flex items-center justify-between bg-white dark:bg-[#14171d] p-3 rounded-2xl border border-red-100 dark:border-red-500/10 shadow-sm" id="req-row-${uid}">
                            <div class="flex items-center gap-3 cursor-pointer group flex-1 min-w-0" onclick="window.location.href='profile.html?id=${uid}'">
                                <img src="${photo}" class="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-white/10 group-hover:border-[#ff751f] transition-colors shrink-0">
                                <div class="min-w-0">
                                    <h4 class="font-bold text-xs text-gray-900 dark:text-white truncate group-hover:text-[#ff751f] transition-colors">${safeName}</h4>
                                    <p class="text-[9px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest truncate mt-0.5">${escapeHTML(data.primaryPosition || 'Player')} • ${escapeHTML(data.location || 'Anywhere')}</p>
                                </div>
                            </div>
                            <div class="flex items-center gap-1.5 shrink-0 pl-2">
                                <button onclick="window.processJoinRequest('${uid}', true)" class="bg-green-50 dark:bg-green-500/10 hover:bg-green-100 dark:hover:bg-green-500/20 text-green-600 dark:text-green-500 border border-green-200 dark:border-green-500/20 p-2 rounded-xl transition-all active:scale-95" title="Accept">
                                    <span class="material-symbols-outlined text-[16px]">check</span>
                                </button>
                                <button onclick="window.processJoinRequest('${uid}', false)" class="bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 text-red-600 dark:text-red-500 border border-red-200 dark:border-red-500/20 p-2 rounded-xl transition-all active:scale-95" title="Decline">
                                    <span class="material-symbols-outlined text-[16px]">close</span>
                                </button>
                            </div>
                        </div>
                    `;
                }
            }
            container.innerHTML = html;
        } catch (e) {
            container.innerHTML = '<p class="text-[10px] text-red-500 text-center">Failed to load profiles</p>';
        }
    }


    // ==========================================
    // ACTION HANDLERS
    // ==========================================

    window.joinSquad = async function() {
        if (!auth.currentUser) return showToast("Log in to join", true);
        if (currentUserData.squadId) return showToast("You are already in a squad", true);

        if (confirm(`Join ${squadData.name} instantly?`)) {
            try {
                await updateDoc(doc(db, "squads", squadId), { members: arrayUnion(auth.currentUser.uid) });
                await setDoc(doc(db, "users", auth.currentUser.uid), { squadId: squadId, squadAbbr: squadData.abbreviation }, { merge: true });
                
                await addDoc(collection(db, "notifications"), {
                    recipientId: squadData.captainId,
                    actorId: auth.currentUser.uid,
                    actorName: auth.currentUser.displayName,
                    actorPhoto: auth.currentUser.photoURL,
                    type: 'system_alert',
                    message: `joined your squad.`,
                    link: `squad-details.html?id=${squadId}`,
                    read: false,
                    createdAt: serverTimestamp()
                });

                showToast("Joined successfully!");
                setTimeout(() => window.location.reload(), 1000);
            } catch (e) { showToast("Error joining squad", true); }
        }
    };

    window.requestJoin = async function() {
        if (!auth.currentUser) return showToast("Log in to request", true);
        if (currentUserData.squadId) return showToast("You are already in a squad", true);

        try {
            await updateDoc(doc(db, "squads", squadId), { joinRequests: arrayUnion(auth.currentUser.uid) });
            
            await addDoc(collection(db, "notifications"), {
                recipientId: squadData.captainId,
                actorId: auth.currentUser.uid,
                actorName: auth.currentUser.displayName,
                actorPhoto: auth.currentUser.photoURL,
                type: 'system_alert',
                message: `requested to join your squad.`,
                link: `squad-details.html?id=${squadId}`,
                read: false,
                createdAt: serverTimestamp()
            });

            showToast("Request sent to captain!");
            setTimeout(() => window.location.reload(), 1500);
        } catch (e) { showToast("Error sending request", true); }
    };

    window.processJoinRequest = async function(uid, isAccept) {
        try {
            const row = document.getElementById(`req-row-${uid}`);
            if (row) row.style.opacity = '0.5';

            const sqRef = doc(db, "squads", squadId);
            await updateDoc(sqRef, { joinRequests: arrayRemove(uid) });

            if (isAccept) {
                const uSnap = await getDoc(doc(db, "users", uid));
                if (uSnap.exists() && !uSnap.data().squadId) {
                    await updateDoc(sqRef, { members: arrayUnion(uid) });
                    await setDoc(doc(db, "users", uid), { squadId: squadId, squadAbbr: squadData.abbreviation }, { merge: true });
                    
                    await addDoc(collection(db, "notifications"), {
                        recipientId: uid,
                        actorId: auth.currentUser.uid,
                        actorName: squadData.name,
                        actorPhoto: squadData.logoUrl,
                        type: 'system_alert',
                        message: `accepted your request to join the squad!`,
                        link: `squad-details.html?id=${squadId}`,
                        read: false,
                        createdAt: serverTimestamp()
                    });
                    showToast("Player added to roster!");
                } else {
                    showToast("Player already in another squad.", true);
                }
            } else {
                showToast("Request declined.");
            }
            setTimeout(() => window.location.reload(), 1000);
        } catch (e) { showToast("Error processing request", true); }
    };

    window.leaveSquad = async function() {
        if (!confirm(`Are you sure you want to leave ${squadData.name}?`)) return;
        try {
            await updateDoc(doc(db, "squads", squadId), { members: arrayRemove(auth.currentUser.uid) });
            await setDoc(doc(db, "users", auth.currentUser.uid), { squadId: null, squadAbbr: null }, { merge: true });
            
            let localProf = JSON.parse(localStorage.getItem('ligaPhProfile') || '{}');
            localProf.squadId = null;
            localProf.squadAbbr = null;
            localStorage.setItem('ligaPhProfile', JSON.stringify(localProf));

            showToast("Left squad.");
            setTimeout(() => window.location.href = 'roster.html', 1000);
        } catch (e) { showToast("Error leaving squad", true); }
    };

    window.deleteSquad = async function() {
        if (!isCaptain) return;
        if (!confirm("DANGER: Are you sure you want to permanently disband this squad? All members will be removed.")) return;
        
        try {
            for (let uid of teamUserIds) {
                await setDoc(doc(db, "users", uid), { squadId: null, squadAbbr: null }, { merge: true });
            }
            await deleteDoc(doc(db, "squads", squadId));
            
            let localProf = JSON.parse(localStorage.getItem('ligaPhProfile') || '{}');
            localProf.squadId = null;
            localProf.squadAbbr = null;
            localStorage.setItem('ligaPhProfile', JSON.stringify(localProf));

            showToast("Squad disbanded.");
            setTimeout(() => window.location.href = 'roster.html', 1500);
        } catch (e) { showToast("Error disbanding squad", true); }
    };


    // ==========================================
    // MANAGE SQUAD MODAL
    // ==========================================
    
    window.openManageModal = function() {
        if (!isCaptain) return;
        
        document.getElementById('manage-squad-name').value = squadData.name;
        document.getElementById('manage-squad-abbr').value = squadData.abbreviation;
        document.getElementById('manage-squad-skill').value = squadData.skillLevel || 'Intermediate';
        document.getElementById('manage-squad-city').value = squadData.homeCity || '';
        document.getElementById('manage-squad-desc').value = squadData.description || '';
        document.getElementById('manage-privacy').value = squadData.joinPrivacy || 'approval';

        if (squadData.logoUrl) {
            const preview = document.getElementById('manage-logo-preview');
            preview.src = squadData.logoUrl;
            preview.classList.remove('hidden');
            document.getElementById('manage-logo-placeholder').classList.add('hidden');
        }

        const captSelect = document.getElementById('manage-captain');
        const ownerSelect = document.getElementById('manage-owner');
        captSelect.innerHTML = '';
        ownerSelect.innerHTML = '<option value="" disabled selected>Select new owner...</option>';
        
        squadMembers.forEach(m => {
            const safeName = escapeHTML(m.displayName || 'Unknown');
            const opt1 = document.createElement('option');
            opt1.value = m.id;
            opt1.textContent = safeName;
            if (m.id === squadData.captainId) opt1.selected = true;
            captSelect.appendChild(opt1);

            if (m.id !== auth.currentUser.uid) {
                const opt2 = document.createElement('option');
                opt2.value = m.id;
                opt2.textContent = safeName;
                ownerSelect.appendChild(opt2);
            }
        });

        manageModal.classList.remove('hidden');
        manageModal.classList.add('flex');
        setTimeout(() => {
            manageModal.classList.remove('opacity-0');
            manageModal.querySelector('div').classList.remove('scale-95');
        }, 10);
    };

    if (manageModal && document.getElementById('close-manage-modal')) {
        document.getElementById('close-manage-modal').addEventListener('click', () => {
            manageModal.classList.add('opacity-0');
            manageModal.querySelector('div').classList.add('scale-95');
            setTimeout(() => {
                manageModal.classList.add('hidden');
                manageModal.classList.remove('flex');
            }, 300);
        });
    }

    const manageLogoInput = document.getElementById('manage-logo-input');
    let newLogoFile = null;
    if (manageLogoInput) {
        manageLogoInput.addEventListener('change', (e) => {
            if (e.target.files[0]) {
                newLogoFile = e.target.files[0];
                const preview = document.getElementById('manage-logo-preview');
                preview.src = URL.createObjectURL(newLogoFile);
                preview.classList.remove('hidden');
                document.getElementById('manage-logo-placeholder').classList.add('hidden');
            }
        });
    }

    if (manageForm) {
        manageForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('submit-manage-btn');
            btn.disabled = true;
            btn.innerHTML = '<span class="material-symbols-outlined animate-spin">refresh</span> Saving...';

            try {
                const newName = document.getElementById('manage-squad-name').value.trim();
                const newAbbr = document.getElementById('manage-squad-abbr').value.trim().toUpperCase();
                
                if (newAbbr !== squadData.abbreviation) {
                    const checkQ = query(collection(db, "squads"), where("abbreviation", "==", newAbbr));
                    const checkSnap = await getDocs(checkQ);
                    if (!checkSnap.empty) {
                        showToast(`Abbreviation ${newAbbr} is taken!`, true);
                        btn.disabled = false;
                        btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">save</span> Save All Changes';
                        return;
                    }
                }

                let finalLogoUrl = squadData.logoUrl;
                if (newLogoFile) {
                    const optimizedBlob = await resizeAndCropImage(newLogoFile, 300);
                    finalLogoUrl = await uploadSquadLogo(optimizedBlob, newName);
                }

                let finalCaptain = document.getElementById('manage-captain').value;
                const newOwner = document.getElementById('manage-owner').value;
                if (newOwner) finalCaptain = newOwner;

                const updates = {
                    name: newName,
                    abbreviation: newAbbr,
                    homeCity: document.getElementById('manage-squad-city').value,
                    skillLevel: document.getElementById('manage-squad-skill').value,
                    description: document.getElementById('manage-squad-desc').value.trim(),
                    joinPrivacy: document.getElementById('manage-privacy').value,
                    logoUrl: finalLogoUrl,
                    captainId: finalCaptain
                };

                await updateDoc(doc(db, "squads", squadId), updates);

                if (newAbbr !== squadData.abbreviation) {
                    for (let uid of teamUserIds) {
                        await setDoc(doc(db, "users", uid), { squadAbbr: newAbbr }, { merge: true });
                    }
                }

                showToast("Squad updated successfully!");
                setTimeout(() => window.location.reload(), 1500);

            } catch (err) {
                console.error(err);
                showToast("Error updating squad", true);
                btn.disabled = false;
                btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">save</span> Save All Changes';
            }
        });
    }

    // ==========================================
    // CHALLENGE LOGIC
    // ==========================================
    let challengeSelectedPlayers = new Set();

    window.openChallengeModal = function() {
        if (!currentUserData || !currentUserData.squadId) return showToast("You need a squad to challenge.", true);
        if (squadId === currentUserData.squadId) return showToast("You cannot challenge your own squad.", true);

        const tLogo = document.getElementById('challenge-target-logo');
        const tName = document.getElementById('challenge-target-name');
        tLogo.src = squadData.logoUrl ? escapeHTML(squadData.logoUrl) : getFallbackLogo(squadData.name);
        tName.textContent = escapeHTML(squadData.name);

        const now = new Date();
        now.setDate(now.getDate() + 1); 
        document.getElementById('challenge-date').value = now.toISOString().split('T')[0];

        challengeSelectedPlayers.clear();
        challengeSelectedPlayers.add(auth.currentUser.uid); 
        renderChallengeRosterSelection();

        challengeModal.classList.remove('hidden');
        challengeModal.classList.add('flex');
        setTimeout(() => {
            challengeModal.classList.remove('opacity-0');
            challengeModal.querySelector('div').classList.remove('scale-95');
        }, 10);
    };

    if (document.getElementById('close-challenge-modal')) {
        document.getElementById('close-challenge-modal').addEventListener('click', () => {
            challengeModal.classList.add('opacity-0');
            challengeModal.querySelector('div').classList.add('scale-95');
            setTimeout(() => {
                challengeModal.classList.add('hidden');
                challengeModal.classList.remove('flex');
            }, 300);
        });
    }

    async function renderChallengeRosterSelection() {
        const container = document.getElementById('challenge-roster-selection');
        const counter = document.getElementById('challenge-roster-counter');
        
        try {
            const mySqSnap = await getDoc(doc(db, "squads", currentUserData.squadId));
            if (!mySqSnap.exists()) return;
            const mySquad = mySqSnap.data();
            const members = mySquad.members || [];

            let html = '';
            for (let uid of members) {
                const uSnap = await getDoc(doc(db, "users", uid));
                if (uSnap.exists()) {
                    const u = uSnap.data();
                    const safeName = escapeHTML(u.displayName || 'Unknown');
                    const isSelected = challengeSelectedPlayers.has(uid);
                    const isMe = uid === auth.currentUser.uid;
                    
                    html += `
                        <label class="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 cursor-pointer transition-colors border border-transparent ${isSelected ? 'border-[#ff751f]/30 bg-[#ff751f]/5' : ''}">
                            <input type="checkbox" class="form-checkbox text-[#ff751f] rounded border-gray-300 dark:border-white/20 focus:ring-[#ff751f] bg-transparent" 
                                value="${uid}" ${isSelected ? 'checked' : ''} ${isMe ? 'disabled' : ''} onchange="window.toggleChallengePlayer(this)">
                            <img src="${u.photoURL ? escapeHTML(u.photoURL) : getFallbackAvatar(safeName)}" class="w-8 h-8 rounded-full object-cover bg-gray-200 dark:bg-[#0a0e14]">
                            <div class="flex-1 min-w-0">
                                <p class="text-[11px] font-bold text-gray-900 dark:text-white truncate">${safeName} ${isMe ? '<span class="text-gray-400 font-normal">(You)</span>' : ''}</p>
                                <p class="text-[9px] text-gray-500 uppercase tracking-widest">${escapeHTML(u.primaryPosition || 'Player')}</p>
                            </div>
                        </label>
                    `;
                }
            }
            container.innerHTML = html;
            
            counter.textContent = `${challengeSelectedPlayers.size} / 5 Selected`;
            counter.className = `text-[9px] font-bold text-right mt-1.5 ${challengeSelectedPlayers.size === 5 ? 'text-green-500' : 'text-red-500'}`;
            
        } catch (e) {
            container.innerHTML = '<p class="text-xs text-red-500">Error loading roster.</p>';
        }
    }

    window.toggleChallengePlayer = function(checkbox) {
        if (checkbox.checked) {
            if (challengeSelectedPlayers.size >= 5) {
                checkbox.checked = false;
                return showToast("Max 5 players allowed.", true);
            }
            challengeSelectedPlayers.add(checkbox.value);
        } else {
            challengeSelectedPlayers.delete(checkbox.value);
        }
        
        const counter = document.getElementById('challenge-roster-counter');
        counter.textContent = `${challengeSelectedPlayers.size} / 5 Selected`;
        counter.className = `text-[9px] font-bold text-right mt-1.5 ${challengeSelectedPlayers.size === 5 ? 'text-green-500' : 'text-red-500'}`;
        
        const label = checkbox.closest('label');
        if(checkbox.checked) label.classList.add('border-[#ff751f]/30', 'bg-[#ff751f]/5');
        else label.classList.remove('border-[#ff751f]/30', 'bg-[#ff751f]/5');
    };

    if (challengeForm) {
        challengeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (challengeSelectedPlayers.size !== 5) {
                return showToast("You must select exactly 5 players.", true);
            }

            const btn = document.getElementById('submit-challenge-btn');
            btn.disabled = true;
            btn.innerHTML = '<span class="material-symbols-outlined animate-spin">refresh</span> Sending...';

            try {
                const mySqSnap = await getDoc(doc(db, "squads", currentUserData.squadId));
                const mySquad = mySqSnap.data();

                const gameData = {
                    type: 'squad_challenge',
                    title: `${mySquad.abbreviation} vs ${squadData.abbreviation}`,
                    challengerId: currentUserData.squadId,
                    challengerName: mySquad.name,
                    challengerLogo: mySquad.logoUrl || null,
                    targetId: squadId,
                    targetName: squadData.name,
                    targetLogo: squadData.logoUrl || null,
                    date: document.getElementById('challenge-date').value,
                    time: document.getElementById('challenge-time').value,
                    endTime: document.getElementById('challenge-end-time').value,
                    location: document.getElementById('challenge-location').value.trim(),
                    mapLink: document.getElementById('challenge-map-link').value.trim(),
                    message: document.getElementById('challenge-message').value.trim(),
                    challengerRoster: Array.from(challengeSelectedPlayers),
                    targetRoster: [], 
                    challengeStatus: 'pending', 
                    status: 'upcoming', 
                    createdBy: auth.currentUser.uid,
                    createdAt: serverTimestamp(),
                    players: Array.from(challengeSelectedPlayers), 
                    spotsTotal: 10,
                    spotsFilled: 5,
                    visibility: 'Squad Only'
                };

                const gameRef = await addDoc(collection(db, "games"), gameData);

                // Create Post so community knows
                await addDoc(collection(db, "posts"), {
                    type: 'game_promo',
                    gameId: gameRef.id,
                    content: `⚔️ **CHALLENGE ISSUED!**\n\n[${mySquad.abbreviation}] has officially challenged [${squadData.abbreviation}] to a 5v5 matchup!\n\n📍 ${gameData.location}\n📅 ${formatGameDate(gameData.date)} @ ${formatGameTime(gameData.time)}\n\nWill they accept the challenge?`,
                    authorId: auth.currentUser.uid,
                    authorName: auth.currentUser.displayName,
                    authorPhoto: auth.currentUser.photoURL,
                    authorSquadAbbr: mySquad.abbreviation,
                    visibility: 'Public',
                    createdAt: serverTimestamp(),
                    likedBy: [],
                    commentsCount: 0
                });

                // Notify Target Captain
                await addDoc(collection(db, "notifications"), {
                    recipientId: squadData.captainId,
                    actorId: auth.currentUser.uid,
                    actorName: mySquad.name,
                    actorPhoto: mySquad.logoUrl,
                    type: 'squad_challenge',
                    message: `challenged your squad to a matchup!`,
                    link: `squad-details.html?id=${squadId}`,
                    read: false,
                    createdAt: serverTimestamp()
                });

                showToast("Challenge sent successfully!");
                setTimeout(() => window.location.reload(), 2000);

            } catch (err) {
                console.error(err);
                showToast("Error sending challenge", true);
                btn.disabled = false;
                btn.innerHTML = '<span class="material-symbols-outlined">send</span> Send Challenge';
            }
        });
    }

    // ==========================================
    // VIEW CHALLENGE & ACCEPT LOGIC
    // ==========================================
    let activeChallengeGameId = null;
    let acceptSelectedPlayers = new Set();

    window.openViewChallengeModal = async function(gameId) {
        if (!isCaptain) return;
        activeChallengeGameId = gameId;

        try {
            const gSnap = await getDoc(doc(db, "games", gameId));
            if (!gSnap.exists()) return showToast("Challenge not found", true);
            const game = gSnap.data();

            document.getElementById('vc-challenger-logo').src = game.challengerLogo ? escapeHTML(game.challengerLogo) : getFallbackLogo(game.challengerName);
            document.getElementById('vc-challenger-name').textContent = escapeHTML(game.challengerName);
            document.getElementById('vc-datetime').textContent = `${formatGameDate(game.date)} • ${formatGameTime(game.time)} - ${formatGameTime(game.endTime)}`;
            document.getElementById('vc-location').textContent = escapeHTML(game.location);
            
            const mapLink = document.getElementById('vc-map-link');
            if (game.mapLink) {
                mapLink.href = escapeHTML(game.mapLink);
                mapLink.classList.remove('hidden');
            } else {
                mapLink.classList.add('hidden');
            }

            const msgContainer = document.getElementById('vc-message-container');
            if (game.message) {
                document.getElementById('vc-message').textContent = escapeHTML(game.message);
                msgContainer.classList.remove('hidden');
            } else {
                msgContainer.classList.add('hidden');
            }

            const actionsDiv = document.getElementById('vc-actions');
            actionsDiv.innerHTML = `
                <div class="grid grid-cols-2 gap-3">
                    <button onclick="window.declineChallenge()" class="bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 text-red-600 dark:text-red-500 border border-red-200 dark:border-red-500/30 py-3.5 rounded-xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all">Decline</button>
                    <button onclick="window.showAcceptChallengeUI()" class="bg-[#ff751f] hover:brightness-110 text-[#0a0e14] py-3.5 rounded-xl font-black text-xs uppercase tracking-widest shadow-md active:scale-95 transition-all">Accept</button>
                </div>
            `;

            document.getElementById('vc-accept-roster-section').classList.add('hidden');

            viewChallengeModal.classList.remove('hidden');
            viewChallengeModal.classList.add('flex');
            setTimeout(() => {
                viewChallengeModal.classList.remove('opacity-0');
                viewChallengeModal.querySelector('div').classList.remove('scale-95');
            }, 10);

        } catch (e) { showToast("Error loading challenge", true); }
    };

    if (document.getElementById('close-view-challenge-modal')) {
        document.getElementById('close-view-challenge-modal').addEventListener('click', () => {
            viewChallengeModal.classList.add('opacity-0');
            viewChallengeModal.querySelector('div').classList.add('scale-95');
            setTimeout(() => {
                viewChallengeModal.classList.add('hidden');
                viewChallengeModal.classList.remove('flex');
                activeChallengeGameId = null;
            }, 300);
        });
    }

    window.declineChallenge = async function() {
        if (!confirm("Decline this challenge?")) return;
        try {
            await updateDoc(doc(db, "games", activeChallengeGameId), {
                challengeStatus: 'declined',
                status: 'cancelled'
            });
            showToast("Challenge declined.");
            setTimeout(() => window.location.reload(), 1000);
        } catch(e) { showToast("Error declining", true); }
    };

    window.showAcceptChallengeUI = async function() {
        document.getElementById('vc-actions').classList.add('hidden');
        document.getElementById('vc-accept-roster-section').classList.remove('hidden');

        acceptSelectedPlayers.clear();
        acceptSelectedPlayers.add(auth.currentUser.uid); 

        const container = document.getElementById('vc-roster-selection');
        const counter = document.getElementById('vc-roster-counter');
        
        let html = '';
        for (let uid of teamUserIds) {
            const uSnap = await getDoc(doc(db, "users", uid));
            if (uSnap.exists()) {
                const u = uSnap.data();
                const safeName = escapeHTML(u.displayName || 'Unknown');
                const isSelected = acceptSelectedPlayers.has(uid);
                const isMe = uid === auth.currentUser.uid;
                
                html += `
                    <label class="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 cursor-pointer transition-colors border border-transparent ${isSelected ? 'border-[#ff751f]/30 bg-[#ff751f]/5' : ''}">
                        <input type="checkbox" class="form-checkbox text-[#ff751f] rounded border-gray-300 dark:border-white/20 focus:ring-[#ff751f] bg-transparent" 
                            value="${uid}" ${isSelected ? 'checked' : ''} ${isMe ? 'disabled' : ''} onchange="window.toggleAcceptPlayer(this)">
                        <img src="${u.photoURL ? escapeHTML(u.photoURL) : getFallbackAvatar(safeName)}" class="w-8 h-8 rounded-full object-cover bg-gray-200 dark:bg-[#0a0e14]">
                        <div class="flex-1 min-w-0">
                            <p class="text-[11px] font-bold text-gray-900 dark:text-white truncate">${safeName} ${isMe ? '<span class="text-gray-400 font-normal">(You)</span>' : ''}</p>
                            <p class="text-[9px] text-gray-500 uppercase tracking-widest">${escapeHTML(u.primaryPosition || 'Player')}</p>
                        </div>
                    </label>
                `;
            }
        }
        container.innerHTML = html;
        counter.textContent = `${acceptSelectedPlayers.size} / 5 Selected`;
        counter.className = `text-[9px] font-bold text-right mt-1.5 ${acceptSelectedPlayers.size === 5 ? 'text-green-500' : 'text-red-500'}`;
    };

    window.toggleAcceptPlayer = function(checkbox) {
        if (checkbox.checked) {
            if (acceptSelectedPlayers.size >= 5) {
                checkbox.checked = false;
                return showToast("Max 5 players allowed.", true);
            }
            acceptSelectedPlayers.add(checkbox.value);
        } else {
            acceptSelectedPlayers.delete(checkbox.value);
        }
        
        const counter = document.getElementById('vc-roster-counter');
        counter.textContent = `${acceptSelectedPlayers.size} / 5 Selected`;
        counter.className = `text-[9px] font-bold text-right mt-1.5 ${acceptSelectedPlayers.size === 5 ? 'text-green-500' : 'text-red-500'}`;
        
        const label = checkbox.closest('label');
        if(checkbox.checked) label.classList.add('border-[#ff751f]/30', 'bg-[#ff751f]/5');
        else label.classList.remove('border-[#ff751f]/30', 'bg-[#ff751f]/5');
    };

    const confirmAcceptBtn = document.getElementById('vc-confirm-accept-btn');
    if (confirmAcceptBtn) {
        confirmAcceptBtn.addEventListener('click', async () => {
            if (acceptSelectedPlayers.size !== 5) return showToast("You must select exactly 5 defenders.", true);

            confirmAcceptBtn.disabled = true;
            confirmAcceptBtn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[16px]">refresh</span> Processing...';

            try {
                const gSnap = await getDoc(doc(db, "games", activeChallengeGameId));
                const game = gSnap.data();

                const combinedPlayers = [...game.players, ...Array.from(acceptSelectedPlayers)];

                await updateDoc(doc(db, "games", activeChallengeGameId), {
                    challengeStatus: 'accepted',
                    targetRoster: Array.from(acceptSelectedPlayers),
                    players: combinedPlayers,
                    spotsFilled: 10
                });

                await addDoc(collection(db, "posts"), {
                    type: 'game_promo',
                    gameId: activeChallengeGameId,
                    content: `🔥 **CHALLENGE ACCEPTED!**\n\n[${squadData.abbreviation}] has accepted the challenge from [${game.challengerName}].\n\nThe stage is set. Let's get it on!`,
                    authorId: auth.currentUser.uid,
                    authorName: auth.currentUser.displayName,
                    authorPhoto: auth.currentUser.photoURL,
                    authorSquadAbbr: squadData.abbreviation,
                    visibility: 'Public',
                    createdAt: serverTimestamp(),
                    likedBy: [],
                    commentsCount: 0
                });

                await addDoc(collection(db, "notifications"), {
                    recipientId: game.createdBy,
                    actorId: auth.currentUser.uid,
                    actorName: squadData.name,
                    actorPhoto: squadData.logoUrl,
                    type: 'squad_challenge',
                    message: `accepted your challenge!`,
                    link: `game-details.html?id=${activeChallengeGameId}`,
                    read: false,
                    createdAt: serverTimestamp()
                });

                showToast("Match Confirmed!");
                setTimeout(() => window.location.reload(), 2000);
            } catch(e) {
                showToast("Error accepting match", true);
                confirmAcceptBtn.disabled = false;
                confirmAcceptBtn.textContent = 'Confirm Match';
            }
        });
    }

    // ==========================================
    // SQUAD GAME RESULT SUBMISSION LOGIC
    // ==========================================
    
    window.openSquadGameModal = async function(gameId) {
        if (!isCaptain) return;

        const modal = document.getElementById('squad-game-modal');
        const content = document.getElementById('squad-game-modal-content');
        
        content.innerHTML = '<div class="text-center py-10"><span class="material-symbols-outlined animate-spin text-3xl text-primary">sync</span></div>';
        
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            modal.querySelector('div').classList.remove('scale-95');
        }, 10);

        try {
            const gSnap = await getDoc(doc(db, "games", gameId));
            const game = gSnap.data();

            const isChallenger = game.challengerId === squadId;
            const myTeamName = isChallenger ? game.challengerName : game.targetName;
            const myTeamLogo = isChallenger ? game.challengerLogo : game.targetLogo;
            const oppTeamName = isChallenger ? game.targetName : game.challengerName;
            const oppTeamLogo = isChallenger ? game.targetLogo : game.challengerLogo;
            const oppId = isChallenger ? game.targetId : game.challengerId;

            content.innerHTML = `
                <div class="bg-gray-50 dark:bg-[#0a0e14] border border-gray-200 dark:border-white/10 rounded-[24px] p-5 mb-6 shadow-inner">
                    <p class="text-center text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-4">Select Match Winner</p>
                    
                    <div class="flex items-center justify-between gap-2">
                        <label class="flex-1 cursor-pointer group">
                            <input type="radio" name="squad_winner" value="${squadId}" class="peer hidden">
                            <div class="flex flex-col items-center p-3 rounded-2xl border-2 border-transparent bg-white dark:bg-[#14171d] peer-checked:border-[#ff751f] peer-checked:bg-[#ff751f]/5 transition-all shadow-sm">
                                <img src="${myTeamLogo ? escapeHTML(myTeamLogo) : getFallbackLogo(myTeamName)}" class="w-12 h-12 rounded-xl object-cover mb-2 border border-gray-200 dark:border-white/10">
                                <span class="text-[10px] font-black uppercase tracking-widest text-center truncate w-full text-gray-900 dark:text-white peer-checked:text-[#ff751f]">${escapeHTML(myTeamName)}<br>(You)</span>
                            </div>
                        </label>
                        
                        <div class="shrink-0 flex flex-col items-center justify-center">
                            <span class="bg-gray-200 dark:bg-white/10 text-gray-500 dark:text-gray-400 text-[10px] font-black uppercase px-2 py-1 rounded">VS</span>
                        </div>
                        
                        <label class="flex-1 cursor-pointer group">
                            <input type="radio" name="squad_winner" value="${oppId}" class="peer hidden">
                            <div class="flex flex-col items-center p-3 rounded-2xl border-2 border-transparent bg-white dark:bg-[#14171d] peer-checked:border-blue-500 peer-checked:bg-blue-500/5 transition-all shadow-sm">
                                <img src="${oppTeamLogo ? escapeHTML(oppTeamLogo) : getFallbackLogo(oppTeamName)}" class="w-12 h-12 rounded-xl object-cover mb-2 border border-gray-200 dark:border-white/10">
                                <span class="text-[10px] font-black uppercase tracking-widest text-center truncate w-full text-gray-900 dark:text-white peer-checked:text-blue-500">${escapeHTML(oppTeamName)}<br>(Opponent)</span>
                            </div>
                        </label>
                    </div>
                    
                    <div class="mt-4 pt-4 border-t border-gray-200 dark:border-white/10">
                        <label class="flex items-center justify-center cursor-pointer group w-full">
                            <input type="radio" name="squad_winner" value="tie" class="peer hidden">
                            <div class="w-full text-center py-2.5 rounded-xl border-2 border-transparent bg-white dark:bg-[#14171d] peer-checked:border-gray-400 peer-checked:bg-gray-100 dark:peer-checked:border-white/30 dark:peer-checked:bg-white/10 transition-all shadow-sm">
                                <span class="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400 peer-checked:text-gray-900 dark:peer-checked:text-white">Match ended in a Tie</span>
                            </div>
                        </label>
                    </div>
                </div>
                
                <button id="submit-result-btn" class="w-full bg-[#ff751f] hover:brightness-110 text-[#0a0e14] py-4 rounded-xl font-black text-xs uppercase tracking-widest shadow-[0_4px_15px_rgba(255,117,31,0.3)] active:scale-95 transition-all flex items-center justify-center gap-2">
                    Submit Result
                </button>
            `;

            document.getElementById('submit-result-btn').addEventListener('click', async (e) => {
                const selected = document.querySelector('input[name="squad_winner"]:checked');
                if (!selected) return showToast("Please select the outcome", true);
                
                const btn = e.target;
                btn.disabled = true;
                btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[16px]">refresh</span> Processing...';

                try {
                    const freshSnap = await getDoc(doc(db, "games", gameId));
                    const freshGame = freshSnap.data();

                    const reportField = isChallenger ? 'challengerReport' : 'targetReport';
                    await updateDoc(doc(db, "games", gameId), {
                        [reportField]: selected.value
                    });

                    const opponentReport = isChallenger ? freshGame.targetReport : freshGame.challengerReport;

                    // If both reported, check if they match
                    if (opponentReport) {
                        if (opponentReport === selected.value) {
                            // MATCH! Process Win/Loss
                            const winnerId = selected.value;
                            
                            if (winnerId === 'tie') {
                                // Just mark completed
                                await updateDoc(doc(db, "games", gameId), { status: 'completed', winnerId: 'tie' });
                            } else {
                                const loserId = winnerId === squadId ? oppId : squadId;
                                
                                // Update Winner
                                const wSnap = await getDoc(doc(db, "squads", winnerId));
                                const wWins = (wSnap.data().wins || 0) + 1;
                                await updateDoc(doc(db, "squads", winnerId), { wins: wWins });

                                // Update Loser
                                const lSnap = await getDoc(doc(db, "squads", loserId));
                                const lLosses = (lSnap.data().losses || 0) + 1;
                                await updateDoc(doc(db, "squads", loserId), { losses: lLosses });

                                await updateDoc(doc(db, "games", gameId), { status: 'completed', winnerId: winnerId });
                            }

                            // Update games attended for all players involved
                            const allPlayersInGame = freshGame.players || [];
                            for(let pid of allPlayersInGame) {
                                try {
                                    const pSnap = await getDoc(doc(db, "users", pid));
                                    if(pSnap.exists()){
                                        const att = (pSnap.data().gamesAttended || 0) + 1;
                                        await updateDoc(doc(db, "users", pid), { gamesAttended: att });
                                    }
                                } catch(e){}
                            }

                            showToast("Results matched and finalized!");
                        } else {
                            // CONFLICT!
                            await updateDoc(doc(db, "games", gameId), { status: 'disputed' });
                            showToast("Conflict! The other captain reported a different result.", true);
                        }
                    } else {
                        showToast("Report submitted. Waiting for opponent to confirm.");
                    }

                    setTimeout(() => window.location.reload(), 2000);

                } catch(err) {
                    console.error(err);
                    showToast("Error submitting result", true);
                    btn.disabled = false;
                    btn.textContent = 'Submit Result';
                }
            });

        } catch(e) {
            showToast("Error loading game data", true);
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

});
