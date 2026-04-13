import { auth, db } from './firebase-setup.js';
// FIX: Added missing getDoc and serverTimestamp imports!
import { doc, getDoc, updateDoc, deleteDoc, collection, query, where, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { verifiedCourtsByCity } from './locations.js'; // Added for duplicate checking

document.addEventListener('DOMContentLoaded', () => {
    
    // Security Check: Kick out non-admins immediately
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = 'index.html';
            return;
        }

        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (!userDoc.exists() || userDoc.data().accountType !== 'Administrator') {
                alert("ACCESS DENIED: You do not have Administrator privileges.");
                window.location.href = 'home.html';
                return;
            }
            
            // User is authenticated and is an Admin. Load Dashboard.
            loadPendingCourts();

        } catch (e) {
            console.error("Auth verification failed", e);
            window.location.href = 'home.html';
        }
    });

    async function loadPendingCourts() {
        const container = document.getElementById('pending-courts-list');
        const countBadge = document.getElementById('pending-courts-count');

        try {
            const q = query(collection(db, "courts"), where("status", "==", "pending"));
            const snap = await getDocs(q);
            
            countBadge.textContent = snap.size;

            if (snap.empty) {
                container.innerHTML = `
                    <div class="flex flex-col items-center justify-center py-12 text-outline-variant opacity-70">
                        <span class="material-symbols-outlined text-5xl mb-2">check_circle</span>
                        <p class="text-xs font-bold uppercase tracking-widest text-center">Inbox Zero</p>
                        <p class="text-[10px] mt-1 text-center">No pending court suggestions right now.</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = '';
            
            // FIX: Changed variable name from 'document' to 'courtDoc' to avoid DOM conflict
            snap.forEach(courtDoc => {
                const data = courtDoc.data();
                const id = courtDoc.id;

                container.innerHTML += `
                    <div class="bg-surface-container-highest p-4 rounded-2xl border border-outline-variant/10 hover:border-primary/30 transition-colors">
                        <div class="flex justify-between items-start mb-3">
                            <div class="min-w-0">
                                <h4 class="font-bold text-sm text-on-surface leading-tight break-words">${escapeHTML(data.name)}</h4>
                                <p class="text-[10px] text-outline font-black uppercase tracking-widest flex items-center gap-1 mt-1"><span class="material-symbols-outlined text-[12px]">location_on</span> ${escapeHTML(data.city)}</p>
                            </div>
                        </div>
                        
                        <div class="bg-[#0a0e14] rounded-lg p-2.5 mb-3 border border-outline-variant/5">
                            <p class="text-[9px] text-outline font-bold uppercase tracking-widest mb-0.5">Suggested By</p>
                            <p class="text-xs font-bold text-on-surface truncate text-primary">${escapeHTML(data.submittedByName || 'Unknown')}</p>
                        </div>

                        <div class="flex gap-2">
                            <button onclick="window.rejectCourt('${id}')" class="flex-1 bg-surface-container hover:bg-error/10 text-error border border-error/20 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors">Reject</button>
                            <button onclick="window.approveCourt('${id}')" class="flex-1 bg-primary hover:brightness-110 text-on-primary-container py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm active:scale-95 transition-all">Approve</button>
                        </div>
                    </div>
                `;
            });

        } catch (error) {
            console.error("Error loading courts", error);
            container.innerHTML = '<p class="text-xs text-error text-center py-4">Failed to load data.</p>';
        }
    }

    // Admin Actions
    window.approveCourt = async function(courtId) {
        try {
            // 1. Fetch the exact suggestion data
            const courtRef = doc(db, "courts", courtId);
            const courtSnap = await getDoc(courtRef);
            if (!courtSnap.exists()) return;
            
            const courtData = courtSnap.data();
            const suggestedNameLower = courtData.name.toLowerCase().trim();

            // 2. DUPLICATE CHECK: Check the static locations.js list
            const staticCourts = verifiedCourtsByCity[courtData.city] || [];
            const isStaticDuplicate = staticCourts.some(c => c.toLowerCase() === suggestedNameLower);

            // 3. DUPLICATE CHECK: Check the database for already approved courts
            const q = query(collection(db, "courts"), where("city", "==", courtData.city), where("status", "==", "approved"));
            const dynamicSnap = await getDocs(q);
            let isDynamicDuplicate = false;
            dynamicSnap.forEach(d => {
                if (d.data().name.toLowerCase() === suggestedNameLower) {
                    isDynamicDuplicate = true;
                }
            });

            // 4. Alert Admin if it's a duplicate
            if (isStaticDuplicate || isDynamicDuplicate) {
                alert(`⚠️ DUPLICATE DETECTED!\n\nThe court "${courtData.name}" already exists in ${courtData.city}. Please reject this suggestion to keep the database clean.`);
                return;
            }

            if (!confirm(`Approve "${courtData.name}"? It will immediately become available in the global dropdown for all players.`)) return;

            // 5. If safe, approve it!
            await updateDoc(courtRef, {
                status: "approved",
                approvedAt: serverTimestamp()
            });
            loadPendingCourts(); // Refresh list
        } catch (e) {
            alert("Failed to approve court.");
            console.error(e);
        }
    };

    window.rejectCourt = async function(courtId) {
        if (!confirm("Reject and delete this suggestion?")) return;
        
        try {
            await deleteDoc(doc(db, "courts", courtId));
            loadPendingCourts(); // Refresh list
        } catch (e) {
            alert("Failed to reject court.");
        }
    };

    function escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
});
