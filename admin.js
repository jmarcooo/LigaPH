import { auth, db } from './firebase-setup.js';
import { doc, getDoc, updateDoc, deleteDoc, collection, query, where, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { verifiedCourtsByCity } from './locations.js'; 

document.addEventListener('DOMContentLoaded', () => {
    
    let allUsersCache = [];

    onAuthStateChanged(auth, async (user) => {
        if (!user) return window.location.href = 'index.html';

        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (!userDoc.exists() || userDoc.data().accountType !== 'Administrator') {
                alert("ACCESS DENIED: You do not have Administrator privileges.");
                return window.location.href = 'home.html';
            }
            
            loadPendingCourts();
            loadAllUsers(); // Pre-fetch users for instant searching

        } catch (e) {
            console.error("Auth verification failed", e);
            window.location.href = 'home.html';
        }
    });

    // --- NEW: USER ROLE MANAGEMENT ---
    async function loadAllUsers() {
        try {
            const snap = await getDocs(collection(db, "users"));
            allUsersCache = [];
            snap.forEach(doc => {
                allUsersCache.push({ id: doc.id, ...doc.data() });
            });
        } catch(e) { console.error("Failed to load users", e); }
    }

    window.searchUsers = function() {
        const term = document.getElementById('admin-user-search').value.toLowerCase().trim();
        const resultsContainer = document.getElementById('admin-user-results');
        
        if (!term) {
            resultsContainer.innerHTML = '<p class="text-xs text-outline-variant text-center py-4 italic">Enter a name to search.</p>';
            return;
        }

        const filtered = allUsersCache.filter(u => 
            (u.displayName || "").toLowerCase().includes(term) || 
            (u.email || "").toLowerCase().includes(term)
        );

        resultsContainer.innerHTML = '';
        if(filtered.length === 0) {
            resultsContainer.innerHTML = '<p class="text-xs text-error text-center py-4 italic">No users found.</p>';
            return;
        }

        filtered.forEach(u => {
            const role = u.accountType || 'Player';
            const photoUrl = u.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.displayName || 'P')}&background=20262f&color=ff8f6f`;
            
            resultsContainer.innerHTML += `
                <div class="bg-surface-container-highest p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border border-outline-variant/10">
                    <div class="flex items-center gap-3">
                        <img src="${photoUrl}" class="w-10 h-10 rounded-full object-cover border border-outline-variant/30">
                        <div>
                            <p class="font-bold text-sm text-on-surface">${escapeHTML(u.displayName)}</p>
                            <p class="text-[10px] text-outline-variant tracking-widest uppercase">${escapeHTML(u.email || 'No Email')}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 w-full sm:w-auto">
                        <select id="role-select-${u.id}" class="flex-1 sm:w-auto bg-[#0a0e14] border border-outline-variant/30 text-on-surface text-xs rounded-xl px-3 py-2 outline-none focus:border-secondary transition-colors">
                            <option value="Player" ${role==='Player'?'selected':''}>Player</option>
                            <option value="Verified" ${role==='Verified'?'selected':''}>Verified Player</option>
                            <option value="Organizer" ${role==='Organizer'?'selected':''}>Organizer</option>
                            <option value="Referee" ${role==='Referee'?'selected':''}>Referee</option>
                            <option value="Content Writer" ${role==='Content Writer'?'selected':''}>Content Writer</option>
                            <option value="Administrator" ${role==='Administrator'?'selected':''}>Administrator</option>
                        </select>
                        <button onclick="window.updateUserRole('${u.id}')" class="bg-secondary hover:brightness-110 text-on-primary-container px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all shadow-sm">Save</button>
                    </div>
                </div>
            `;
        });
    }

    window.updateUserRole = async function(uid) {
        const newRole = document.getElementById(`role-select-${uid}`).value;
        if(!confirm(`Change role to ${newRole}?`)) return;
        try {
            await updateDoc(doc(db, "users", uid), { accountType: newRole });
            const userIndex = allUsersCache.findIndex(u => u.id === uid);
            if(userIndex !== -1) allUsersCache[userIndex].accountType = newRole;
            alert("Role updated successfully!");
        } catch(e) {
            console.error(e);
            alert("Failed to update role.");
        }
    }
    // ------------------------------------

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

    window.approveCourt = async function(courtId) {
        try {
            const courtRef = doc(db, "courts", courtId);
            const courtSnap = await getDoc(courtRef);
            if (!courtSnap.exists()) return;
            
            const courtData = courtSnap.data();
            const suggestedNameLower = courtData.name.toLowerCase().trim();

            const staticCourts = verifiedCourtsByCity[courtData.city] || [];
            const isStaticDuplicate = staticCourts.some(c => c.toLowerCase() === suggestedNameLower);

            const q = query(collection(db, "courts"), where("city", "==", courtData.city), where("status", "==", "approved"));
            const dynamicSnap = await getDocs(q);
            let isDynamicDuplicate = false;
            dynamicSnap.forEach(d => {
                if (d.data().name.toLowerCase() === suggestedNameLower) {
                    isDynamicDuplicate = true;
                }
            });

            if (isStaticDuplicate || isDynamicDuplicate) {
                alert(`⚠️ DUPLICATE DETECTED!\n\nThe court "${courtData.name}" already exists in ${courtData.city}. Please reject this suggestion to keep the database clean.`);
                return;
            }

            if (!confirm(`Approve "${courtData.name}"? It will immediately become available in the global dropdown for all players.`)) return;

            await updateDoc(courtRef, {
                status: "approved",
                approvedAt: serverTimestamp()
            });
            loadPendingCourts(); 
        } catch (e) {
            alert("Failed to approve court.");
            console.error(e);
        }
    };

    window.rejectCourt = async function(courtId) {
        if (!confirm("Reject and delete this suggestion?")) return;
        
        try {
            await deleteDoc(doc(db, "courts", courtId));
            loadPendingCourts(); 
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
