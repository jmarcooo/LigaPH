import { auth, db } from './firebase-setup.js';
import { collection, doc, setDoc, getDocs, query, orderBy, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { generate12DigitId } from './utils.js';

document.addEventListener('DOMContentLoaded', async () => {
    const topLeagueContainer = document.getElementById('top-league-container');
    const leaguesContainer = document.getElementById('leagues-container');
    const searchInput = document.getElementById('league-search-input');
    const openModalBtn = document.getElementById('open-create-league-modal');

    // Check auth state to hide action
    import('./firebase-setup.js').then(({ auth }) => {
        auth.onAuthStateChanged((user) => {
            if (!user && openModalBtn) {
                openModalBtn.style.display = 'none';
            }
        });
    });

    // Modal Elements
    const modal = document.getElementById('create-league-modal');
    const modalContent = modal.querySelector('div.bg-surface-container');
    const closeModalBtn = document.getElementById('close-league-modal');
    const form = document.getElementById('create-league-form');

    let allLeagues = [];

    // Modal logic
    function openModal() {
        if (!auth.currentUser) {
            alert("Please log in to create a league.");
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
            const submitBtn = document.getElementById('submit-league-btn');

            const name = document.getElementById('league-name').value;
            const court = document.getElementById('league-court').value;
            const desc = document.getElementById('league-desc').value;

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

                const customId = generate12DigitId();
                const newLeague = {
                    name: name,
                    location: court || "Anywhere",
                    description: desc || "We ball.",
                    creator: creatorName,
                    creatorId: user.uid,
                    createdAt: serverTimestamp(),
                    wins: 0,
                    losses: 0,
                    members: [creatorName]
                };

                await setDoc(doc(db, "leagues", customId), newLeague);

                closeModal();
                loadLeagues(); // Refresh list

            } catch (error) {
                console.error("Error creating league: ", error);
                alert("Failed to create league. Check console.");
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

    // Load and Render Leagues
    async function loadLeagues() {
        try {
            const leaguesRef = collection(db, "leagues");
            // Query for top league (sort by createdAt for now to match feeds logic)
            const q = query(leaguesRef, orderBy("createdAt", "desc"));
            const snapshot = await getDocs(q);

            allLeagues = [];
            snapshot.forEach(doc => {
                allLeagues.push({ id: doc.id, ...doc.data() });
            });

            renderTopLeague(allLeagues[0]); // First one is top
            renderLeagues(allLeagues);

        } catch (error) {
            console.error("Error loading leagues:", error);
            leaguesContainer.innerHTML = '<span class="block text-error col-span-full text-center">Failed to load leagues.</span>';
            topLeagueContainer.innerHTML = '<span class="block text-error text-center">Failed to load top league.</span>';
        }
    }

    function renderTopLeague(league) {
        if (!league) {
            topLeagueContainer.innerHTML = `
                <div class="flex flex-col items-center justify-center py-12 text-center text-on-surface-variant w-full">
                    <span class="material-symbols-outlined text-6xl mb-4 opacity-50">trophy</span>
                    <p class="text-lg">No top league found. Be the first!</p>
                </div>
            `;
            return;
        }

        const safeName = escapeHTML(league.name);
        const safeCaptain = escapeHTML(league.creator || league.captain || "Unknown");
        const safeCourt = escapeHTML(league.location || league.court || "Anywhere");

        topLeagueContainer.style.cursor = 'pointer';
        topLeagueContainer.onclick = () => window.location.href = `league-details.html?id=${league.id}`;

        topLeagueContainer.innerHTML = `
            <div class="absolute top-0 right-0 w-64 h-64 bg-primary opacity-10 blur-[100px] -mr-32 -mt-32"></div>
            <div class="relative z-10 w-full flex flex-col md:flex-row gap-8 items-start md:items-center">
                <div class="w-32 h-32 rounded-xl bg-surface-container-highest flex items-center justify-center border-2 border-primary/50 shadow-xl shrink-0">
                    <span class="material-symbols-outlined text-6xl text-primary" style="font-variation-settings: 'FILL' 1;">emoji_events</span>
                </div>
                <div class="flex-1 w-full">
                    <div class="flex items-center gap-3 mb-2">
                        <span class="px-3 py-1 bg-tertiary-container text-on-tertiary-container text-xs font-black rounded-md uppercase tracking-widest border border-tertiary/20">Featured League</span>
                        <span class="text-on-surface-variant text-sm font-bold flex items-center gap-1"><span class="material-symbols-outlined text-sm text-primary">person</span> Admin: ${safeCaptain}</span>
                    </div>
                    <h3 class="text-3xl md:text-5xl font-black italic tracking-tighter text-on-surface uppercase mb-4 line-clamp-1 text-outline shadow-sm">${safeName}</h3>

                    <div class="flex gap-8 flex-wrap">
                        <div class="bg-surface-container-highest px-4 py-2 rounded-lg border border-outline-variant/10">
                            <p class="text-[10px] text-outline uppercase font-black tracking-widest mb-0.5">Location</p>
                            <p class="text-xl font-headline font-black text-on-surface">${safeCourt}</p>
                        </div>
                        <div class="bg-surface-container-highest px-4 py-2 rounded-lg border border-outline-variant/10">
                            <p class="text-[10px] text-outline uppercase font-black tracking-widest mb-0.5">Teams/Members</p>
                            <p class="text-xl font-headline font-black text-secondary">${(league.members || []).length}</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function renderLeagues(leagues) {
        leaguesContainer.innerHTML = '';

        if (leagues.length === 0) {
            leaguesContainer.innerHTML = `
                <div class="col-span-full flex flex-col items-center justify-center py-12 text-center text-on-surface-variant">
                    <span class="material-symbols-outlined text-6xl mb-4 opacity-50">search_off</span>
                    <p class="text-lg">No leagues found matching your criteria.</p>
                </div>
            `;
            return;
        }

        leagues.forEach(league => {
            const safeName = escapeHTML(league.name);
            const safeCourt = escapeHTML(league.location || league.court || "Anywhere");
            const safeDesc = escapeHTML(league.description);
            const membersCount = (league.members || []).length;

            const card = document.createElement('div');
            card.className = 'bg-surface-container-high rounded-xl p-6 border border-outline-variant/10 hover:bg-surface-container-highest transition-all group hover:shadow-lg flex flex-col cursor-pointer';
            card.onclick = () => window.location.href = `league-details.html?id=${league.id}`;

            card.innerHTML = `
                <div class="flex items-center gap-4 mb-4">
                    <div class="w-16 h-16 rounded-lg bg-surface-container flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                        <span class="material-symbols-outlined text-3xl text-primary/70 group-hover:text-primary transition-colors">emoji_events</span>
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
                        <span class="text-[10px] font-black uppercase tracking-widest text-outline">${membersCount} Members</span>
                    </div>
                    <div class="text-right">
                        <p class="text-[10px] font-black uppercase tracking-widest text-outline mb-0.5">Status</p>
                        <p class="text-sm font-black text-secondary">Active</p>
                    </div>
                </div>
            `;

            leaguesContainer.appendChild(card);
        });
    }

    // Filter Logic
    function applyFilters() {
        const term = searchInput.value.toLowerCase().trim();
        const filtered = allLeagues.filter(s => {
            return (s.name || '').toLowerCase().includes(term) ||
                   (s.location || s.court || '').toLowerCase().includes(term) ||
                   (s.creator || s.captain || '').toLowerCase().includes(term);
        });
        renderLeagues(filtered);
    }

    if (searchInput) {
        searchInput.addEventListener('input', applyFilters);
    }

    // Init
    loadLeagues();
});
