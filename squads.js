import { auth, db, storage } from './firebase-setup.js';
import { collection, getDocs, query, addDoc, serverTimestamp, where } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";

// --- Utility Functions ---
function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function getFallbackLogo(name) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'S')}&background=20262f&color=ff8f6f`;
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
        img.onerror = () => reject(new Error("Failed to load image for resizing"));
        img.src = URL.createObjectURL(file);
    });
}

function uploadSquadLogo(file, squadName) {
    return new Promise((resolve, reject) => {
        const safeName = squadName.replace(/[^a-zA-Z0-9.]/g, '_');
        const storageRef = ref(storage, `squads/${Date.now()}_${safeName}`);
        const uploadTask = uploadBytesResumable(storageRef, file);
        uploadTask.on('state_changed',
            (snapshot) => {}, 
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

// Dynamically grab cities from locations.js with a safe fallback
const citiesToLoad = window.metroManilaCities || [
    "Caloocan", "Las Piñas", "Makati", "Malabon", "Mandaluyong", 
    "Manila", "Marikina", "Muntinlupa", "Navotas", "Parañaque", 
    "Pasay", "Pasig", "Pateros", "Quezon City", "San Juan", "Taguig", "Valenzuela"
];

document.addEventListener('DOMContentLoaded', () => {
    const filterSelect = document.getElementById('squad-location-filter');
    const searchInput = document.getElementById('squad-search-input');
    const mySquadContainer = document.getElementById('my-squad-container');
    const topSquadContainer = document.getElementById('top-squad-container');
    const squadsGrid = document.getElementById('squads-grid');
    const createBtn = document.getElementById('create-squad-btn');
    
    // Modal Elements
    const createModal = document.getElementById('create-squad-modal');
    const closeModalBtn = document.getElementById('close-squad-modal');
    const createForm = document.getElementById('create-squad-form');
    const squadCityInput = document.getElementById('squad-city-input');
    
    // File Upload Elements
    const logoInput = document.getElementById('squad-logo-input');
    const logoPreview = document.getElementById('squad-logo-preview');
    const logoPlaceholder = document.getElementById('squad-logo-placeholder');
    let selectedLogoFile = null;

    let allSquads = [];
    let userHasSquad = false;
    let mySquadData = null;

    // 1. Populate Dropdowns from Locations.js
    citiesToLoad.forEach(city => {
        if (filterSelect) {
            const opt = document.createElement('option');
            opt.value = city;
            opt.textContent = city;
            opt.className = 'bg-surface-container-high text-on-surface';
            filterSelect.appendChild(opt);
        }
        if (squadCityInput) {
            const optForm = document.createElement('option');
            optForm.value = city;
            optForm.textContent = city;
            optForm.className = 'bg-[#0a0e14] text-on-surface';
            squadCityInput.appendChild(optForm);
        }
    });

    // 2. Auth State & Global Checks
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            await checkUserSquadStatus(user.uid);
            createBtn.classList.remove('hidden');
            createBtn.classList.add('flex'); // Always show button to logged-in users
        } else {
            userHasSquad = false;
            mySquadData = null;
            createBtn.classList.add('hidden');
            createBtn.classList.remove('flex');
            renderMySquad();
        }
        loadSquads();
    });

    async function checkUserSquadStatus(uid) {
        try {
            const captQ = query(collection(db, "squads"), where("captainId", "==", uid));
            const captSnap = await getDocs(captQ);
            
            const memQ = query(collection(db, "squads"), where("members", "array-contains", uid));
            const memSnap = await getDocs(memQ);

            if (!captSnap.empty) {
                mySquadData = { id: captSnap.docs[0].id, ...captSnap.docs[0].data() };
                userHasSquad = true;
            } else if (!memSnap.empty) {
                mySquadData = { id: memSnap.docs[0].id, ...memSnap.docs[0].data() };
                userHasSquad = true;
            } else {
                mySquadData = null;
                userHasSquad = false;
            }
            renderMySquad();
        } catch (e) {
            console.error("Error checking squad status", e);
        }
    }

    function renderMySquad() {
        if (!mySquadContainer) return;

        if (!auth.currentUser) {
            mySquadContainer.innerHTML = `
                <div class="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/10 text-center flex flex-col items-center justify-center shadow-sm">
                    <span class="material-symbols-outlined text-3xl text-outline-variant mb-2">login</span>
                    <p class="text-sm font-medium text-on-surface-variant">Log in to view or join a squad.</p>
                </div>
            `;
            return;
        }

        if (!userHasSquad || !mySquadData) {
            mySquadContainer.innerHTML = `
                <div class="bg-surface-container-highest rounded-2xl p-6 border border-outline-variant/20 border-dashed hover:border-primary/50 transition-colors text-center flex flex-col items-center justify-center cursor-pointer group" onclick="document.getElementById('create-squad-btn').click()">
                    <span class="material-symbols-outlined text-3xl text-primary mb-2 group-hover:scale-110 transition-transform">group_add</span>
                    <p class="text-sm font-bold text-on-surface mb-1">No squad, join a squad first.</p>
                    <p class="text-[10px] text-outline font-black uppercase tracking-widest">Or tap here to create your own</p>
                </div>
            `;
            return;
        }

        const safeName = escapeHTML(mySquadData.name);
        const safeAbbr = escapeHTML(mySquadData.abbreviation);
        const logoUrl = mySquadData.logoUrl ? escapeHTML(mySquadData.logoUrl) : getFallbackLogo(safeName);
        const wins = mySquadData.wins || 0;
        const losses = mySquadData.losses || 0;
        const winPct = (calculateWinRate(mySquadData) * 100).toFixed(0);
        
        const roleBadge = mySquadData.captainId === auth.currentUser.uid 
            ? '<span class="px-2 py-0.5 bg-primary/20 text-primary rounded text-[9px] font-black uppercase tracking-widest border border-primary/20">Captain</span>'
            : '<span class="px-2 py-0.5 bg-secondary/20 text-secondary rounded text-[9px] font-black uppercase tracking-widest border border-secondary/20">Member</span>';

        mySquadContainer.innerHTML = `
            <div class="bg-gradient-to-r from-[#14171d] to-surface-container-low rounded-2xl p-4 md:p-5 border border-tertiary/40 shadow-[0_4px_20px_rgba(202,165,255,0.1)] hover:brightness-110 transition-all cursor-pointer flex items-center gap-4 group" onclick="window.location.href='squad-details.html?id=${mySquadData.id}'">
                <div class="w-16 h-16 md:w-20 md:h-20 rounded-xl border border-tertiary/20 bg-surface-container shrink-0 flex items-center justify-center overflow-hidden shadow-sm group-hover:scale-105 transition-transform">
                    <img src="${logoUrl}" onerror="this.onerror=null; this.src='${getFallbackLogo(safeName)}';" class="w-full h-full object-cover">
                </div>
                
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1 md:mb-1.5">
                        <h4 class="font-headline font-black italic uppercase text-on-surface truncate text-lg md:text-xl">
                            <span class="text-tertiary">[${safeAbbr}]</span> ${safeName}
                        </h4>
                    </div>
                    <div class="flex items-center gap-3">
                        ${roleBadge}
                        <p class="text-[10px] text-outline font-bold uppercase tracking-widest flex items-center gap-1">
                            <span class="material-symbols-outlined text-[12px]">location_on</span> ${escapeHTML(mySquadData.homeCity || 'Anywhere')}
                        </p>
                    </div>
                </div>

                <div class="hidden sm:flex gap-6 shrink-0 mr-4">
                    <div class="text-center bg-surface-container-highest px-3 py-2 rounded-lg border border-outline-variant/10">
                        <p class="font-black text-on-surface text-sm leading-none">${wins}-${losses}</p>
                        <p class="text-[8px] text-outline font-bold uppercase tracking-widest mt-1">Record</p>
                    </div>
                    <div class="text-center bg-surface-container-highest px-3 py-2 rounded-lg border border-outline-variant/10">
                        <p class="font-black text-primary text-sm leading-none">${winPct}%</p>
                        <p class="text-[8px] text-outline font-bold uppercase tracking-widest mt-1">Win Rate</p>
                    </div>
                </div>
                
                <span class="material-symbols-outlined text-outline-variant group-hover:text-tertiary transition-colors sm:hidden">chevron_right</span>
            </div>
        `;
    }

    // 3. Setup Modal Listeners
    if (createBtn && createModal) {
        createBtn.addEventListener('click', () => {
            createModal.classList.remove('hidden');
            createModal.classList.add('flex');
            setTimeout(() => {
                createModal.classList.remove('opacity-0');
                createModal.querySelector('div').classList.remove('scale-95');
            }, 10);
        });
    }

    if (closeModalBtn && createModal) {
        closeModalBtn.addEventListener('click', () => {
            createModal.classList.add('opacity-0');
            createModal.querySelector('div').classList.add('scale-95');
            setTimeout(() => {
                createModal.classList.add('hidden');
                createModal.classList.remove('flex');
            }, 300);
        });
        createModal.addEventListener('click', (e) => {
            if (e.target === createModal) closeModalBtn.click();
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
                logoPreview.src = '';
                logoPreview.classList.add('hidden');
                logoPlaceholder.classList.remove('hidden');
            }
        });
    }

    // 5. Handle Form Submission with Abbreviation Check!
    if (createForm) {
        createForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (!auth.currentUser) return alert("You must be logged in to create a squad.");
            
            if (userHasSquad) {
                alert("You are already in a squad! Please leave your current squad before creating a new one.");
                return;
            }

            const submitBtn = document.getElementById('submit-squad-btn');
            submitBtn.textContent = 'Checking Abbreviation...';
            submitBtn.disabled = true;

            const nameVal = document.getElementById('squad-name-input').value.trim();
            const abbrVal = document.getElementById('squad-abbr-input').value.trim().toUpperCase();
            const cityVal = document.getElementById('squad-city-input').value;
            const skillVal = document.getElementById('squad-skill-input').value; // Get Skill Level

            try {
                // VERIFY UNIQUE ABBREVIATION
                const abbrCheckQ = query(collection(db, "squads"), where("abbreviation", "==", abbrVal));
                const abbrCheckSnap = await getDocs(abbrCheckQ);
                
                if (!abbrCheckSnap.empty) {
                    alert(`The abbreviation [${abbrVal}] is already taken! Please choose another.`);
                    submitBtn.innerHTML = `<span>Create Squad</span><span class="material-symbols-outlined text-lg">shield</span>`;
                    submitBtn.disabled = false;
                    return; // Abort creation
                }

                let finalLogoUrl = null;
                if (selectedLogoFile) {
                    submitBtn.textContent = 'Optimizing Logo...';
                    const optimizedBlob = await resizeAndCropImage(selectedLogoFile, 300);
                    submitBtn.textContent = 'Uploading...';
                    finalLogoUrl = await uploadSquadLogo(optimizedBlob, nameVal);
                }

                submitBtn.textContent = 'Saving Squad...';

                await addDoc(collection(db, "squads"), {
                    name: nameVal,
                    abbreviation: abbrVal,
                    homeCity: cityVal,
                    skillLevel: skillVal, // Save Skill Level to DB
                    logoUrl: finalLogoUrl,
                    captainId: auth.currentUser.uid,
                    captainName: auth.currentUser.displayName || "Unknown Player",
                    wins: 0,
                    losses: 0,
                    members: [auth.currentUser.uid], 
                    createdAt: serverTimestamp()
                });

                await checkUserSquadStatus(auth.currentUser.uid);

                createForm.reset();
                selectedLogoFile = null;
                logoPreview.src = '';
                logoPreview.classList.add('hidden');
                logoPlaceholder.classList.remove('hidden');
                closeModalBtn.click();
                
                submitBtn.innerHTML = `<span>Create Squad</span><span class="material-symbols-outlined text-lg">shield</span>`;
                submitBtn.disabled = false;
                
                loadSquads();
                
            } catch (error) {
                console.error("Error creating squad:", error);
                alert("Failed to create squad.");
                submitBtn.innerHTML = `<span>Create Squad</span><span class="material-symbols-outlined text-lg">shield</span>`;
                submitBtn.disabled = false;
            }
        });
    }

    // 6. Data Fetching & Rendering
    async function loadSquads() {
        try {
            const squadsRef = collection(db, "squads");
            const q = query(squadsRef);
            const snap = await getDocs(q);
            
            allSquads = [];
            snap.forEach(doc => {
                allSquads.push({ id: doc.id, ...doc.data() });
            });

            renderFilteredSquads();
        } catch (e) {
            console.error("Error loading squads:", e);
            topSquadContainer.innerHTML = '<p class="text-error text-center py-10">Failed to load squads.</p>';
            squadsGrid.innerHTML = '';
        }
    }

    function renderFilteredSquads() {
        const currentCity = filterSelect.value;
        const searchTerm = searchInput ? searchInput.value.toLowerCase() : "";
        let filteredSquads = [...allSquads];

        // Apply Location Filter
        if (currentCity !== "Metro Manila") {
            filteredSquads = filteredSquads.filter(s => s.homeCity === currentCity || s.location === currentCity);
        }

        // Apply Search Filter
        if (searchTerm) {
            filteredSquads = filteredSquads.filter(s => 
                (s.name && s.name.toLowerCase().includes(searchTerm)) || 
                (s.abbreviation && s.abbreviation.toLowerCase().includes(searchTerm))
            );
        }

        filteredSquads.sort((a, b) => {
            const wrA = calculateWinRate(a);
            const wrB = calculateWinRate(b);
            if (wrB !== wrA) return wrB - wrA; 
            return (b.wins || 0) - (a.wins || 0); 
        });

        // Render Top 3 instead of just Top 1
        renderTopSquads(filteredSquads.slice(0, 3), currentCity);
        
        // Render the rest in the main grid starting at #4
        renderSquadList(filteredSquads.slice(3)); 
    }

    // UPDATED: Renders up to 3 squads in a beautiful podium-style grid
    function renderTopSquads(topSquads, city) {
        if (topSquads.length === 0) {
            topSquadContainer.innerHTML = `
                <div class="bg-[#14171d] rounded-3xl p-10 border border-outline-variant/10 shadow-lg flex flex-col items-center justify-center text-center">
                    <span class="material-symbols-outlined text-5xl text-outline-variant/50 mb-4">search_off</span>
                    <h3 class="font-headline text-xl font-black text-on-surface uppercase tracking-widest">No Squads Found</h3>
                    <p class="text-outline-variant text-sm mt-2">Adjust your filters or create a squad in ${city}!</p>
                </div>
            `;
            return;
        }

        let html = '<div class="grid grid-cols-1 md:grid-cols-2 gap-6">';

        topSquads.forEach((squad, index) => {
            const rank = index + 1;
            const isFirstPlace = rank === 1; // Make #1 take full width on top
            
            const safeName = escapeHTML(squad.name);
            const safeAbbr = escapeHTML(squad.abbreviation);
            const logoUrl = squad.logoUrl ? escapeHTML(squad.logoUrl) : getFallbackLogo(safeName);
            const wins = squad.wins || 0;
            const losses = squad.losses || 0;
            const memberCount = (squad.members || []).length; 
            const winPct = (calculateWinRate(squad) * 100).toFixed(0);

            // Conditional styling to make #1 stand out
            const gridClass = isFirstPlace ? 'md:col-span-2' : 'col-span-1';
            const flexDir = isFirstPlace ? 'md:flex-row' : 'flex-col';
            const textSize = isFirstPlace ? 'text-3xl md:text-5xl' : 'text-2xl';
            const badgeColor = isFirstPlace ? 'bg-primary text-on-primary-container' : 'bg-secondary text-on-primary-container';
            const badgeLabel = isFirstPlace ? `#1 ${city === 'Metro Manila' ? 'GLOBAL' : 'CITY'}` : `#${rank} RANK`;

            html += `
                <div class="${gridClass} bg-gradient-to-br from-[#14171d] to-[#0a0e14] rounded-3xl p-6 md:p-8 border border-outline-variant/20 hover:border-primary/50 shadow-lg flex flex-col ${flexDir} items-center md:items-start gap-6 relative overflow-hidden group cursor-pointer transition-transform hover:scale-[1.01]" onclick="window.location.href='squad-details.html?id=${squad.id}'">
                    
                    <div class="absolute -right-20 -top-20 w-64 h-64 ${isFirstPlace ? 'bg-primary/10' : 'bg-secondary/10'} rounded-full blur-3xl pointer-events-none group-hover:opacity-100 opacity-50 transition-opacity"></div>

                    <div class="w-28 h-28 ${isFirstPlace ? 'md:w-36 md:h-36' : ''} rounded-3xl border border-outline-variant/20 bg-surface-container shrink-0 flex items-center justify-center overflow-hidden z-10 shadow-xl">
                        <img src="${logoUrl}" onerror="this.onerror=null; this.src='${getFallbackLogo(safeName)}';" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                    </div>

                    <div class="flex-1 w-full text-center ${isFirstPlace ? 'md:text-left' : 'md:text-center'} z-10 flex flex-col justify-center">
                        <div class="flex flex-wrap items-center justify-center ${isFirstPlace ? 'md:justify-start' : 'md:justify-center'} gap-3 mb-3">
                            <span class="${badgeColor} px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest shadow-sm">${badgeLabel}</span>
                            <div class="bg-surface-container-highest px-3 py-1 rounded flex items-center gap-1.5 border border-outline-variant/10 shadow-sm">
                                <span class="material-symbols-outlined text-[14px] text-outline-variant">person</span>
                                <span class="text-[9px] font-bold text-outline-variant uppercase tracking-widest">Capt: <span class="text-on-surface">${escapeHTML(squad.captainName || 'Unknown')}</span></span>
                            </div>
                        </div>

                        <h1 class="font-headline ${textSize} font-black italic tracking-tighter uppercase text-on-surface mb-5 drop-shadow-md leading-[1.1]">
                            <span class="text-outline-variant">[${safeAbbr}]</span> ${safeName}
                        </h1>

                        <div class="flex flex-wrap justify-center ${isFirstPlace ? 'md:justify-start' : 'md:justify-center'} gap-3">
                            <div class="bg-surface-container-highest border border-outline-variant/10 px-4 py-2 rounded-xl flex flex-col items-center justify-center min-w-[70px]">
                                <span class="text-[8px] text-outline font-bold uppercase tracking-widest mb-1">Record</span>
                                <span class="font-headline font-black text-lg text-on-surface leading-none">${wins}-${losses}</span>
                            </div>
                            <div class="bg-surface-container-highest border border-outline-variant/10 px-4 py-2 rounded-xl flex flex-col items-center justify-center min-w-[70px]">
                                <span class="text-[8px] text-outline font-bold uppercase tracking-widest mb-1">Win Rate</span>
                                <span class="font-headline font-black text-lg text-primary leading-none">${winPct}%</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        topSquadContainer.innerHTML = html;
    }

    // Render squads #4 and beyond
    function renderSquadList(squads) {
        squadsGrid.innerHTML = '';
        
        if (squads.length === 0) {
            squadsGrid.innerHTML = '<div class="col-span-full text-center text-outline-variant py-8 text-sm">No other squads match your search.</div>';
            return;
        }

        squads.forEach((squad, index) => {
            const rank = index + 4; // Because 1, 2, and 3 are on the podium!
            const safeName = escapeHTML(squad.name);
            const safeAbbr = escapeHTML(squad.abbreviation);
            const logoUrl = squad.logoUrl ? escapeHTML(squad.logoUrl) : getFallbackLogo(safeName);
            const wins = squad.wins || 0;
            const losses = squad.losses || 0;
            const winPct = (calculateWinRate(squad) * 100).toFixed(0);

            squadsGrid.innerHTML += `
                <div class="bg-[#14171d] rounded-2xl p-5 border border-outline-variant/10 hover:border-primary/30 hover:bg-surface-bright transition-all cursor-pointer shadow-sm flex flex-col group" onclick="window.location.href='squad-details.html?id=${squad.id}'">
                    
                    <div class="flex items-center gap-4 w-full">
                        <div class="font-headline font-black italic text-outline-variant/50 text-xl w-6 text-center group-hover:text-primary transition-colors">
                            #${rank}
                        </div>
                        
                        <div class="w-14 h-14 rounded-xl border border-outline-variant/20 bg-surface-container shrink-0 flex items-center justify-center overflow-hidden">
                            <img src="${logoUrl}" onerror="this.onerror=null; this.src='${getFallbackLogo(safeName)}';" class="w-full h-full object-cover">
                        </div>
                        
                        <div class="flex-1 min-w-0">
                            <h4 class="font-headline font-black italic uppercase text-on-surface truncate text-sm md:text-base mb-1">
                                <span class="text-outline-variant">[${safeAbbr}]</span> ${safeName}
                            </h4>
                            <div class="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-outline">
                                <span>W-L: <span class="text-on-surface">${wins}-${losses}</span></span>
                                <span class="text-primary">${winPct}% WIN</span>
                            </div>
                        </div>
                    </div>

                    <div class="mt-4 pt-3 border-t border-outline-variant/10 flex items-center gap-2">
                        <div class="w-5 h-5 rounded-full bg-surface-container-high flex items-center justify-center text-outline shadow-sm">
                            <span class="material-symbols-outlined text-[12px]">person</span>
                        </div>
                        <span class="text-[10px] font-medium text-outline-variant">CAPTAIN: <span class="text-on-surface font-bold uppercase tracking-widest">${escapeHTML(squad.captainName || 'Unknown Player')}</span></span>
                    </div>

                </div>
            `;
        });
    }

    // Search and Filter Listeners
    if (filterSelect) filterSelect.addEventListener('change', renderFilteredSquads);
    if (searchInput) searchInput.addEventListener('input', renderFilteredSquads);
});
