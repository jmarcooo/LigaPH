import { auth, db } from './firebase-setup.js';
import { collection, addDoc, getDocs, query, orderBy, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async () => {
    const topSquadContainer = document.getElementById('top-squad-container');
    const squadsContainer = document.getElementById('squads-container');
    const searchInput = document.getElementById('squad-search-input');

    // Modal Elements
    const modal = document.getElementById('create-squad-modal');
    const modalContent = modal.querySelector('div.bg-surface-container');
    const openModalBtn = document.getElementById('open-create-squad-modal');
    const closeModalBtn = document.getElementById('close-squad-modal');
    const form = document.getElementById('create-squad-form');

    let allSquads = [];

    // Modal logic
    function openModal() {
        if (!auth.currentUser) {
            alert("Please log in to create a squad.");
            return;
        }
        modal.classList.remove('hidden');
        // Small delay to allow display:block to apply before animating opacity/transform
        setTimeout(() => {
            modal.classList.remove('opacity-0', 'pointer-events-none');
            modalContent.classList.remove('scale-95');
            modalContent.classList.add('scale-100');
        }, 10);
    }

    function closeModal() {
        modal.classList.add('opacity-0', 'pointer-events-none');
        modalContent.classList.remove('scale-100');
        modalContent.classList.add('scale-95');
        // Wait for transition to finish before hiding
        setTimeout(() => {
            modal.classList.add('hidden');
            form.reset();
        }, 300);
    }

    if (openModalBtn) openModalBtn.addEventListener('click', openModal);
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);

    // Close on background click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // Handle Form Submit
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('submit-squad-btn');

            const name = document.getElementById('squad-name').value;
            const court = document.getElementById('squad-court').value;
            const desc = document.getElementById('squad-desc').value;

            try {
                submitBtn.textContent = 'CREATING...';
                submitBtn.disabled = true;

                const user = auth.currentUser;
                let creatorName = "Unknown Player";

                // Get profile from localStorage for speed, or user.displayName
                const localProfile = localStorage.getItem('ligaPhProfile');
                if (localProfile) {
                    try {
                        const parsed = JSON.parse(localProfile);
                        creatorName = parsed.displayName || "Unknown Player";
                    } catch(e) {}
                }

                const newSquad = {
                    name: name,
                    court: court || "Anywhere",
                    description: desc || "We ball.",
                    captain: creatorName,
                    captainId: user.uid,
                    createdAt: serverTimestamp(),
                    wins: 0,
                    losses: 0,
                    members: [creatorName]
                };

                await addDoc(collection(db, "squads"), newSquad);

                closeModal();
                loadSquads(); // Refresh list

            } catch (error) {
                console.error("Error creating squad: ", error);
                alert("Failed to create squad. Check console.");
            } finally {
                submitBtn.textContent = 'CREATE SQUAD';
                submitBtn.disabled = false;
            }
        });
    }

    function escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Load and Render Squads
    async function loadSquads() {
        try {
            const squadsRef = collection(db, "squads");
            // Query for top squad (most wins, or just created first if we don't have many)
            const q = query(squadsRef, orderBy("wins", "desc"));
            const snapshot = await getDocs(q);

            allSquads = [];
            snapshot.forEach(doc => {
                allSquads.push({ id: doc.id, ...doc.data() });
            });

            renderTopSquad(allSquads[0]); // First one is top
            renderSquads(allSquads);

        } catch (error) {
            console.error("Error loading squads:", error);
            squadsContainer.innerHTML = '<span class="block text-error col-span-full text-center">Failed to load squads.</span>';
            topSquadContainer.innerHTML = '<span class="block text-error text-center">Failed to load top squad.</span>';
        }
    }

    function renderTopSquad(squad) {
        if (!squad) {
            topSquadContainer.innerHTML = `
                <div class="flex flex-col items-center justify-center py-12 text-center text-on-surface-variant w-full">
                    <span class="material-symbols-outlined text-6xl mb-4 opacity-50">trophy</span>
                    <p class="text-lg">No top squad found. Be the first!</p>
                </div>
            `;
            return;
        }

        const safeName = escapeHTML(squad.name);
        const safeCaptain = escapeHTML(squad.captain);

        topSquadContainer.innerHTML = `
            <div class="absolute top-0 right-0 w-64 h-64 bg-primary opacity-10 blur-[100px] -mr-32 -mt-32"></div>
            <div class="relative z-10 w-full flex flex-col md:flex-row gap-8 items-start md:items-center">
                <div class="w-32 h-32 rounded-xl bg-surface-container-highest flex items-center justify-center border-2 border-primary/50 shadow-xl shrink-0">
                    <span class="material-symbols-outlined text-6xl text-primary" style="font-variation-settings: 'FILL' 1;">shield</span>
                </div>
                <div class="flex-1 w-full">
                    <div class="flex items-center gap-3 mb-2">
                        <span class="px-3 py-1 bg-tertiary-container text-on-tertiary-container text-xs font-black rounded-md uppercase tracking-widest border border-tertiary/20">#1 Global</span>
                        <span class="text-on-surface-variant text-sm font-bold flex items-center gap-1"><span class="material-symbols-outlined text-sm text-primary">person</span> Capt: ${safeCaptain}</span>
                    </div>
                    <h3 class="text-3xl md:text-5xl font-black italic tracking-tighter text-on-surface uppercase mb-4 line-clamp-1 text-outline shadow-sm">${safeName}</h3>

                    <div class="flex gap-8 flex-wrap">
                        <div class="bg-surface-container-highest px-4 py-2 rounded-lg border border-outline-variant/10">
                            <p class="text-[10px] text-outline uppercase font-black tracking-widest mb-0.5">Record</p>
                            <p class="text-xl font-headline font-black text-on-surface">${squad.wins || 0} - ${squad.losses || 0}</p>
                        </div>
                        <div class="bg-surface-container-highest px-4 py-2 rounded-lg border border-outline-variant/10">
                            <p class="text-[10px] text-outline uppercase font-black tracking-widest mb-0.5">Members</p>
                            <p class="text-xl font-headline font-black text-secondary">${(squad.members || []).length}</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function renderSquads(squads) {
        squadsContainer.innerHTML = '';

        if (squads.length === 0) {
            squadsContainer.innerHTML = `
                <div class="col-span-full flex flex-col items-center justify-center py-12 text-center text-on-surface-variant">
                    <span class="material-symbols-outlined text-6xl mb-4 opacity-50">search_off</span>
                    <p class="text-lg">No squads found matching your criteria.</p>
                </div>
            `;
            return;
        }

        squads.forEach(squad => {
            const safeName = escapeHTML(squad.name);
            const safeCourt = escapeHTML(squad.court);
            const safeDesc = escapeHTML(squad.description);
            const membersCount = (squad.members || []).length;

            const card = document.createElement('div');
            card.className = 'bg-surface-container-high rounded-xl p-6 border border-outline-variant/10 hover:bg-surface-container-highest transition-all group hover:shadow-lg flex flex-col cursor-pointer';

            card.innerHTML = `
                <div class="flex items-center gap-4 mb-4">
                    <div class="w-16 h-16 rounded-lg bg-surface-container flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                        <span class="material-symbols-outlined text-3xl text-primary/70 group-hover:text-primary transition-colors">shield</span>
                    </div>
                    <div class="flex-1 min-w-0">
                        <h4 class="text-xl font-black italic tracking-tighter text-on-surface uppercase truncate mb-1">${safeName}</h4>
                        <div class="flex items-center gap-1 text-xs font-bold text-on-surface-variant truncate">
                            <span class="material-symbols-outlined text-[14px]">location_on</span>
                            <span class="truncate">${safeCourt}</span>
                        </div>
                    </div>
                </div>

                <p class="text-sm text-on-surface-variant line-clamp-2 mb-4 flex-1">${safeDesc}</p>

                <div class="flex justify-between items-end pt-4 border-t border-outline-variant/10 mt-auto">
                    <div class="flex items-center gap-2">
                        <div class="flex -space-x-2">
                            ${Array.from({length: Math.min(3, membersCount)}).map((_, i) => `
                                <div class="w-6 h-6 rounded-full bg-surface-container-lowest border border-surface-container-high flex items-center justify-center overflow-hidden">
                                    <span class="material-symbols-outlined text-[12px] text-primary/50">person</span>
                                </div>
                            `).join('')}
                        </div>
                        <span class="text-[10px] font-black uppercase tracking-widest text-outline">${membersCount} Hoopers</span>
                    </div>
                    <div class="text-right">
                        <p class="text-[10px] font-black uppercase tracking-widest text-outline mb-0.5">Record</p>
                        <p class="text-sm font-black text-secondary">${squad.wins || 0} - ${squad.losses || 0}</p>
                    </div>
                </div>
            `;

            squadsContainer.appendChild(card);
        });
    }

    // Filter Logic
    function applyFilters() {
        const term = searchInput.value.toLowerCase().trim();
        const filtered = allSquads.filter(s => {
            return (s.name || '').toLowerCase().includes(term) ||
                   (s.court || '').toLowerCase().includes(term) ||
                   (s.captain || '').toLowerCase().includes(term);
        });
        renderSquads(filtered);
    }

    if (searchInput) {
        searchInput.addEventListener('input', applyFilters);
    }

    // Init
    loadSquads();
});
