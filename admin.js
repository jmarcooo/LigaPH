import { auth, db, storage } from './firebase-setup.js';
import { doc, getDoc, updateDoc, deleteDoc, collection, query, where, getDocs, addDoc, serverTimestamp, orderBy } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";
import { verifiedCourtsByCity } from './locations.js'; 

function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', () => {
    
    // --- TAB SWITCHING LOGIC (UPDATED FOR LIGHT/DARK MODE & #ff751f) ---
    const tabBtns = document.querySelectorAll('.admin-tab-btn');
    const tabContents = document.querySelectorAll('.admin-tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetBtn = e.currentTarget; 
            
            tabBtns.forEach(b => {
                b.classList.remove('bg-[#ff751f]', 'text-[#0a0e14]', 'shadow-[0_0_15px_rgba(255,117,31,0.2)]', 'active');
                b.classList.add('text-gray-500', 'dark:text-gray-400', 'hover:bg-gray-50', 'dark:hover:bg-white/5', 'hover:text-gray-900', 'dark:hover:text-white');
            });
            
            tabContents.forEach(c => {
                c.classList.add('hidden');
                c.classList.remove('block');
            });

            targetBtn.classList.add('bg-[#ff751f]', 'text-[#0a0e14]', 'shadow-[0_0_15px_rgba(255,117,31,0.2)]', 'active');
            targetBtn.classList.remove('text-gray-500', 'dark:text-gray-400', 'hover:bg-gray-50', 'dark:hover:bg-white/5', 'hover:text-gray-900', 'dark:hover:text-white');
            
            const targetId = targetBtn.dataset.target;
            const targetContent = document.getElementById(targetId);
            if (targetContent) {
                targetContent.classList.remove('hidden');
                targetContent.classList.add('block');
            }
        });
    });

    let allUsersCache = [];
    let activeSlidesCache = []; 
    let activeNewsCache = [];
    let currentUserData = null;

    onAuthStateChanged(auth, async (user) => {
        if (!user) return window.location.href = 'index.html';

        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (!userDoc.exists() || userDoc.data().accountType !== 'Administrator') {
                alert("ACCESS DENIED: You do not have Administrator privileges.");
                return window.location.href = 'home.html';
            }
            
            currentUserData = userDoc.data();
            
            loadPendingCourts();
            loadAllUsers(); 
            loadActiveSlides();
            loadActiveNews(); // Load News into the News tab

        } catch (e) {
            console.error("Auth verification failed", e);
            window.location.href = 'home.html';
        }
    });

    // ==========================================
    // ROSTER TAB: USER ROLE MANAGEMENT
    // ==========================================
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
        const searchInput = document.getElementById('admin-user-search');
        if (!searchInput) return;
        
        const term = searchInput.value.toLowerCase().trim();
        const resultsContainer = document.getElementById('admin-user-results');
        
        if (!term) {
            resultsContainer.innerHTML = '<p class="text-xs text-gray-500 dark:text-gray-400 text-center py-4 italic">Enter a name to search.</p>';
            return;
        }

        const filtered = allUsersCache.filter(u => 
            (u.displayName || "").toLowerCase().includes(term) || 
            (u.email || "").toLowerCase().includes(term)
        );

        resultsContainer.innerHTML = '';
        if(filtered.length === 0) {
            resultsContainer.innerHTML = '<p class="text-xs text-[#ff751f] text-center py-4 italic">No users found.</p>';
            return;
        }

        filtered.forEach(u => {
            const role = u.accountType || 'Player';
            const photoUrl = u.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.displayName || 'P')}&background=14171d&color=ff751f`;
            
            resultsContainer.innerHTML += `
                <div class="bg-gray-50 dark:bg-white/5 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border border-gray-200 dark:border-white/10">
                    <div class="flex items-center gap-3">
                        <img src="${photoUrl}" class="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-white/20 bg-white dark:bg-[#14171d]">
                        <div>
                            <p class="font-bold text-sm text-gray-900 dark:text-white">${escapeHTML(u.displayName)}</p>
                            <p class="text-[10px] text-gray-500 dark:text-gray-400 tracking-widest uppercase">${escapeHTML(u.email || 'No Email')}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 w-full sm:w-auto">
                        <select id="role-select-${u.id}" class="flex-1 sm:w-auto bg-white dark:bg-[#14171d] border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white text-xs rounded-xl px-3 py-2 outline-none focus:border-[#ff751f] transition-colors shadow-sm">
                            <option value="Player" ${role==='Player'?'selected':''}>Player</option>
                            <option value="Verified" ${role==='Verified'?'selected':''}>Verified Player</option>
                            <option value="Organizer" ${role==='Organizer'?'selected':''}>Organizer</option>
                            <option value="Referee" ${role==='Referee'?'selected':''}>Referee</option>
                            <option value="Content Writer" ${role==='Content Writer'?'selected':''}>Content Writer</option>
                            <option value="Administrator" ${role==='Administrator'?'selected':''}>Administrator</option>
                        </select>
                        <button onclick="window.updateUserRole('${u.id}')" class="bg-[#ff751f] hover:brightness-110 text-[#0a0e14] px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all shadow-sm">Save</button>
                    </div>
                </div>
            `;
        });
    };

    window.updateUserRole = async function(uid) {
        const selectEl = document.getElementById(`role-select-${uid}`);
        if (!selectEl) return;
        
        const newRole = selectEl.value;
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
    };

    // ==========================================
    // GAMES TAB: PENDING COURTS
    // ==========================================
    async function loadPendingCourts() {
        const container = document.getElementById('pending-courts-list');
        const countBadge = document.getElementById('pending-courts-count');
        if (!container || !countBadge) return;

        try {
            const q = query(collection(db, "courts"), where("status", "==", "pending"));
            const snap = await getDocs(q);
            
            countBadge.textContent = snap.size;

            if (snap.empty) {
                container.innerHTML = `
                    <div class="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500 opacity-70">
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
                    <div class="bg-gray-50 dark:bg-white/5 p-4 rounded-2xl border border-gray-200 dark:border-white/10 hover:border-[#ff751f]/50 transition-colors shadow-sm">
                        <div class="flex justify-between items-start mb-3">
                            <div class="min-w-0">
                                <h4 class="font-bold text-sm text-gray-900 dark:text-white leading-tight break-words">${escapeHTML(data.name)}</h4>
                                <p class="text-[10px] text-gray-500 dark:text-gray-400 font-black uppercase tracking-widest flex items-center gap-1 mt-1"><span class="material-symbols-outlined text-[12px]">location_on</span> ${escapeHTML(data.city)}</p>
                            </div>
                        </div>
                        
                        <div class="bg-white dark:bg-[#14171d] rounded-lg p-2.5 mb-3 border border-gray-200 dark:border-white/10 shadow-inner">
                            <p class="text-[9px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest mb-0.5">Suggested By</p>
                            <p class="text-xs font-bold text-[#ff751f] truncate">${escapeHTML(data.submittedByName || 'Unknown')}</p>
                        </div>

                        <div class="flex gap-2">
                            <button onclick="window.rejectCourt('${id}')" class="flex-1 bg-white dark:bg-[#14171d] hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500 border border-gray-200 dark:border-white/10 hover:border-red-500/30 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm">Reject</button>
                            <button onclick="window.approveCourt('${id}')" class="flex-1 bg-[#ff751f] hover:brightness-110 text-[#0a0e14] py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-[0_4px_15px_rgba(255,117,31,0.2)] active:scale-95 transition-all">Approve</button>
                        </div>
                    </div>
                `;
            });

        } catch (error) {
            console.error("Error loading courts", error);
            container.innerHTML = '<p class="text-xs text-[#ff751f] text-center py-4">Failed to load data.</p>';
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


    // ==========================================
    // HOME TAB: SLIDER MANAGEMENT
    // ==========================================
    const sliderForm = document.getElementById('admin-slider-form');
    const sliderImageInput = document.getElementById('slider-image');
    const sliderImagePreview = document.getElementById('slider-image-preview');
    const submitSliderBtn = document.getElementById('submit-slider-btn');
    const activeSlidesList = document.getElementById('active-slides-list');

    const previewSliderBtn = document.getElementById('preview-slider-btn');
    const editPreviewSliderBtn = document.getElementById('edit-preview-slider-btn');

    const previewModal = document.getElementById('preview-slide-modal');
    const closePreviewModalBtn = document.getElementById('close-preview-modal');
    const previewModalImg = document.getElementById('preview-modal-img');
    const previewModalTag = document.getElementById('preview-modal-tag');
    const previewModalIcon = document.getElementById('preview-modal-icon');
    const previewModalTitle = document.getElementById('preview-modal-title');
    const previewModalSubtitle = document.getElementById('preview-modal-subtitle');
    const previewModalBtnContainer = document.getElementById('preview-modal-btn-container');

    const editSliderModal = document.getElementById('edit-slider-modal');
    const closeEditSliderBtn = document.getElementById('close-edit-slider-modal');
    const editSliderForm = document.getElementById('edit-slider-form');
    const editSliderImageInput = document.getElementById('edit-slider-image');
    const editSliderImagePreview = document.getElementById('edit-slider-image-preview');

    function openPreviewModal(source) {
        let title, tag, iconVal, subtitle, btnText, imgSource;

        if (source === 'create') {
            title = document.getElementById('slider-title').value || 'Headline Title';
            tag = document.getElementById('slider-tag').value || 'Featured';
            iconVal = document.getElementById('slider-tag-icon').value || 'local_fire_department';
            subtitle = document.getElementById('slider-subtitle').value || 'Subtitle description goes here.';
            btnText = document.getElementById('slider-btn-text').value;
            imgSource = sliderImagePreview.src || 'https://images.unsplash.com/photo-1519861531473-9200262188bf?q=80&w=2071&auto=format&fit=crop';
        } else if (source === 'edit') {
            title = document.getElementById('edit-slider-title').value || 'Headline Title';
            tag = document.getElementById('edit-slider-tag').value || 'Featured';
            iconVal = document.getElementById('edit-slider-tag-icon').value || 'local_fire_department';
            subtitle = document.getElementById('edit-slider-subtitle').value || 'Subtitle description goes here.';
            btnText = document.getElementById('edit-slider-btn-text').value;
            imgSource = editSliderImagePreview.src || 'https://images.unsplash.com/photo-1519861531473-9200262188bf?q=80&w=2071&auto=format&fit=crop';
        }

        previewModalTitle.textContent = title;
        previewModalTag.textContent = tag;
        previewModalIcon.textContent = iconVal;
        previewModalSubtitle.textContent = subtitle;
        previewModalImg.src = imgSource;

        if (btnText) {
            previewModalBtnContainer.innerHTML = `
                <button type="button" class="w-max bg-[#ff751f] text-[#0a0e14] px-5 py-2 md:px-6 md:py-2.5 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest shadow-[0_4px_15px_rgba(255,117,31,0.2)] flex items-center gap-2 hover:brightness-110 transition-all">
                    ${escapeHTML(btnText)} <span class="material-symbols-outlined text-[14px] md:text-[16px]">arrow_forward</span>
                </button>
            `;
        } else {
            previewModalBtnContainer.innerHTML = '';
        }

        previewModal.classList.remove('hidden');
        previewModal.classList.add('flex');
        setTimeout(() => {
            previewModal.classList.remove('opacity-0');
            const innerDiv = previewModal.querySelector('div');
            if(innerDiv) innerDiv.classList.remove('scale-95');
        }, 10);
    }

    if (previewSliderBtn) {
        previewSliderBtn.addEventListener('click', () => openPreviewModal('create'));
    }
    
    if (editPreviewSliderBtn) {
        editPreviewSliderBtn.addEventListener('click', () => openPreviewModal('edit'));
    }

    if (closePreviewModalBtn && previewModal) {
        closePreviewModalBtn.addEventListener('click', () => {
            previewModal.classList.add('opacity-0');
            const innerDiv = previewModal.querySelector('div');
            if(innerDiv) innerDiv.classList.add('scale-95');
            setTimeout(() => {
                previewModal.classList.add('hidden');
                previewModal.classList.remove('flex');
            }, 300);
        });
    }

    if (sliderImageInput) {
        sliderImageInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                sliderImagePreview.src = URL.createObjectURL(file);
                sliderImagePreview.classList.remove('hidden');
            } else {
                sliderImagePreview.src = '';
                sliderImagePreview.classList.add('hidden');
            }
        });
    }

    if (editSliderImageInput) {
        editSliderImageInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                editSliderImagePreview.src = URL.createObjectURL(file);
            }
        });
    }

    async function loadActiveSlides() {
        if (!activeSlidesList) return;
        activeSlidesList.innerHTML = '<p class="text-sm text-gray-500 dark:text-gray-400 animate-pulse px-2">Fetching slides...</p>';
        
        try {
            const q = query(collection(db, "slider_items"), orderBy("createdAt", "desc"));
            const snap = await getDocs(q);

            activeSlidesCache = [];

            if (snap.empty) {
                activeSlidesList.innerHTML = '<p class="text-sm text-gray-500 dark:text-gray-400 italic border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 p-4 rounded-xl shadow-inner">No active slides found.</p>';
                if(submitSliderBtn) {
                    submitSliderBtn.disabled = false;
                    submitSliderBtn.innerHTML = `<span class="material-symbols-outlined text-[18px]">publish</span> Upload Slide`;
                    submitSliderBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                }
                return;
            }

            let html = '';
            let count = 0;
            snap.forEach(doc => {
                const data = doc.data();
                activeSlidesCache.push({ id: doc.id, ...data });

                html += `
                    <div class="flex items-center justify-between bg-gray-50 dark:bg-white/5 p-3 rounded-xl border border-gray-200 dark:border-white/10 shadow-sm group">
                        <div class="flex items-center gap-4">
                            <img src="${data.imageUrl}" class="w-16 h-12 rounded-lg object-cover border border-gray-200 dark:border-white/20 bg-white dark:bg-[#14171d]">
                            <div>
                                <p class="font-bold text-sm text-gray-900 dark:text-white leading-tight">${escapeHTML(data.title)}</p>
                                <p class="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-widest flex items-center gap-1">
                                    <span class="material-symbols-outlined text-[12px]">${escapeHTML(data.tagIcon || 'local_fire_department')}</span>
                                    ${escapeHTML(data.tag || 'Slide')}
                                </p>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <button onclick="window.openEditSlideModal('${doc.id}')" class="bg-white dark:bg-[#14171d] hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400 hover:text-[#ff751f] border border-gray-200 dark:border-white/10 hover:border-[#ff751f]/50 p-2 rounded-lg transition-all shadow-sm flex items-center justify-center" title="Edit Slide">
                                <span class="material-symbols-outlined text-[18px]">edit</span>
                            </button>
                            <button onclick="window.deleteSlide('${doc.id}')" class="bg-white dark:bg-[#14171d] hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500 border border-gray-200 dark:border-white/10 hover:border-red-500/30 p-2 rounded-lg transition-all shadow-sm flex items-center justify-center" title="Delete Slide">
                                <span class="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                        </div>
                    </div>
                `;
                count++;
            });
            activeSlidesList.innerHTML = html;

            if (submitSliderBtn) {
                if (count >= 5) {
                    submitSliderBtn.disabled = true;
                    submitSliderBtn.textContent = "Maximum Limit Reached (5)";
                    submitSliderBtn.classList.add('opacity-50', 'cursor-not-allowed');
                } else {
                    submitSliderBtn.disabled = false;
                    submitSliderBtn.innerHTML = `<span class="material-symbols-outlined text-[18px]">publish</span> Upload Slide`;
                    submitSliderBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                }
            }

        } catch (e) {
            console.error("Failed to load slides", e);
            activeSlidesList.innerHTML = '<p class="text-sm text-red-500 font-bold px-2">Failed to load slides.</p>';
        }
    }

    window.deleteSlide = async function(slideId) {
        if (!confirm("Are you sure you want to delete this slide?")) return;
        try {
            await deleteDoc(doc(db, "slider_items", slideId));
            loadActiveSlides();
        } catch(e) {
            console.error(e);
            alert("Failed to delete slide.");
        }
    };

    window.openEditSlideModal = function(slideId) {
        if (!editSliderModal) return;
        
        const slideData = activeSlidesCache.find(s => s.id === slideId);
        if (!slideData) return;

        document.getElementById('edit-slider-id').value = slideId;
        document.getElementById('edit-slider-title').value = slideData.title || '';
        document.getElementById('edit-slider-tag').value = slideData.tag || '';
        document.getElementById('edit-slider-tag-icon').value = slideData.tagIcon || 'local_fire_department';
        document.getElementById('edit-slider-subtitle').value = slideData.subtitle || '';
        document.getElementById('edit-slider-btn-text').value = slideData.linkText || '';
        document.getElementById('edit-slider-btn-url').value = slideData.linkUrl || '';
        
        if (editSliderImagePreview) {
            editSliderImagePreview.src = slideData.imageUrl || '';
            editSliderImagePreview.classList.remove('hidden');
        }
        if (editSliderImageInput) {
            editSliderImageInput.value = ''; 
        }

        editSliderModal.classList.remove('hidden');
        editSliderModal.classList.add('flex');
        setTimeout(() => {
            editSliderModal.classList.remove('opacity-0');
            const innerDiv = editSliderModal.querySelector('div');
            if(innerDiv) innerDiv.classList.remove('scale-95');
        }, 10);
    };

    if (closeEditSliderBtn && editSliderModal) {
        closeEditSliderBtn.addEventListener('click', () => {
            editSliderModal.classList.add('opacity-0');
            const innerDiv = editSliderModal.querySelector('div');
            if(innerDiv) innerDiv.classList.add('scale-95');
            setTimeout(() => {
                editSliderModal.classList.add('hidden');
                editSliderModal.classList.remove('flex');
            }, 300);
        });
    }

    if (sliderForm) {
        sliderForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (activeSlidesCache.length >= 5) {
                alert("Maximum limit of 5 slides reached. Please delete an old one first.");
                return;
            }

            const file = sliderImageInput.files[0];
            if (!file) return alert("Image is required!");

            submitSliderBtn.disabled = true;
            submitSliderBtn.innerHTML = `<span class="material-symbols-outlined animate-spin">sync</span> Uploading...`;

            try {
                const safeName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
                const storageRef = ref(storage, `slider_images/${Date.now()}_${safeName}`);
                const uploadTask = await uploadBytesResumable(storageRef, file);
                const imageUrl = await getDownloadURL(uploadTask.ref);

                await addDoc(collection(db, "slider_items"), {
                    title: document.getElementById('slider-title').value.trim(),
                    subtitle: document.getElementById('slider-subtitle').value.trim(),
                    tag: document.getElementById('slider-tag').value.trim(),
                    tagIcon: document.getElementById('slider-tag-icon').value,
                    linkText: document.getElementById('slider-btn-text').value.trim(),
                    linkUrl: document.getElementById('slider-btn-url').value.trim(),
                    imageUrl: imageUrl,
                    createdAt: serverTimestamp()
                });

                sliderForm.reset();
                document.getElementById('slider-tag-icon').value = 'local_fire_department';
                sliderImagePreview.src = '';
                sliderImagePreview.classList.add('hidden');
                loadActiveSlides();
                alert("Slide published successfully!");

            } catch (err) {
                console.error(err);
                alert("Failed to publish slide.");
            } finally {
                submitSliderBtn.disabled = false;
                submitSliderBtn.innerHTML = `<span class="material-symbols-outlined text-[18px]">publish</span> Upload Slide`;
            }
        });
    }

    if (editSliderForm) {
        editSliderForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const btn = document.getElementById('submit-edit-slider-btn');
            const originalBtnHtml = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = `<span class="material-symbols-outlined animate-spin">sync</span> Saving...`;

            try {
                const slideId = document.getElementById('edit-slider-id').value;
                const file = editSliderImageInput.files[0];
                
                let imageUrl = editSliderImagePreview.src; 
                
                if (file) {
                    const safeName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
                    const storageRef = ref(storage, `slider_images/${Date.now()}_${safeName}`);
                    const uploadTask = await uploadBytesResumable(storageRef, file);
                    imageUrl = await getDownloadURL(uploadTask.ref);
                }

                await updateDoc(doc(db, "slider_items", slideId), {
                    title: document.getElementById('edit-slider-title').value.trim(),
                    subtitle: document.getElementById('edit-slider-subtitle').value.trim(),
                    tag: document.getElementById('edit-slider-tag').value.trim(),
                    tagIcon: document.getElementById('edit-slider-tag-icon').value,
                    linkText: document.getElementById('edit-slider-btn-text').value.trim(),
                    linkUrl: document.getElementById('edit-slider-btn-url').value.trim(),
                    imageUrl: imageUrl
                });

                if(closeEditSliderBtn) closeEditSliderBtn.click();
                loadActiveSlides();
                alert("Slide updated successfully!");

            } catch (err) {
                console.error(err);
                alert("Failed to update slide.");
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalBtnHtml;
            }
        });
    }

    // ==========================================
    // NEWS TAB: POST & MANAGE OFFICIAL NEWS
    // ==========================================
    const newsForm = document.getElementById('admin-news-form');
    const newsImageInput = document.getElementById('news-image');
    const newsImageLabel = document.getElementById('news-image-label');
    const newsImagePreview = document.getElementById('news-image-preview');
    const newsImageImg = document.getElementById('news-image-img');
    const removeNewsImageBtn = document.getElementById('remove-news-image-btn');
    const activeNewsList = document.getElementById('active-news-list');

    const editNewsModal = document.getElementById('edit-news-modal');
    const closeEditNewsBtn = document.getElementById('close-edit-news-modal');
    const editNewsForm = document.getElementById('edit-news-form');
    const editNewsImageInput = document.getElementById('edit-news-image');
    const editNewsImagePreview = document.getElementById('edit-news-image-preview');

    if (newsImageInput) {
        newsImageInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                if(newsImageLabel) newsImageLabel.textContent = file.name;
                if(newsImageImg) newsImageImg.src = URL.createObjectURL(file);
                if(newsImagePreview) newsImagePreview.classList.remove('hidden');
            }
        });
    }

    if (removeNewsImageBtn) {
        removeNewsImageBtn.addEventListener('click', () => {
            if(newsImageInput) newsImageInput.value = '';
            if(newsImageLabel) newsImageLabel.textContent = 'Attach Cover Image (Optional)';
            if(newsImagePreview) newsImagePreview.classList.add('hidden');
            if(newsImageImg) newsImageImg.src = '';
        });
    }

    if (editNewsImageInput) {
        editNewsImageInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                editNewsImagePreview.src = URL.createObjectURL(file);
                editNewsImagePreview.classList.remove('hidden');
            }
        });
    }

    if (newsForm) {
        newsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('submit-news-btn');
            const originalBtnHtml = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = `<span class="material-symbols-outlined animate-spin text-[16px]">sync</span> Publishing...`;

            const title = document.getElementById('news-title').value.trim();
            const content = document.getElementById('news-content').value.trim();
            const tag = document.getElementById('news-tag').value;
            const imageFile = newsImageInput ? newsImageInput.files[0] : null;

            let imageUrl = null;

            try {
                if (imageFile) {
                    btn.innerHTML = `<span class="material-symbols-outlined animate-spin text-[16px]">sync</span> Uploading Image...`;
                    const safeName = (imageFile.name || 'news_image.jpg').replace(/[^a-zA-Z0-9.]/g, '_');
                    const storageRef = ref(storage, `news/${auth.currentUser.uid}_${Date.now()}_${safeName}`);
                    const uploadTask = await uploadBytesResumable(storageRef, imageFile);
                    imageUrl = await getDownloadURL(uploadTask.ref);
                }

                btn.innerHTML = `<span class="material-symbols-outlined animate-spin text-[16px]">sync</span> Publishing...`;
                await addDoc(collection(db, "official_news"), {
                    title: title,
                    content: content,
                    tag: tag,
                    imageUrl: imageUrl, 
                    authorId: auth.currentUser.uid,
                    authorName: currentUserData?.displayName || "Admin",
                    authorRole: currentUserData?.accountType || "Content Writer",
                    createdAt: serverTimestamp()
                });
                
                newsForm.reset();
                if (newsImageInput) newsImageInput.value = '';
                if (newsImageLabel) newsImageLabel.textContent = 'Attach Cover Image (Optional)';
                if (newsImagePreview) newsImagePreview.classList.add('hidden');
                if (newsImageImg) newsImageImg.src = '';

                alert("News published successfully!");
                loadActiveNews(); // Refresh news list
            } catch (err) {
                alert("Failed to publish news.");
                console.error(err);
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalBtnHtml;
            }
        });
    }

    async function loadActiveNews() {
        if (!activeNewsList) return;
        activeNewsList.innerHTML = '<p class="text-sm text-gray-500 dark:text-gray-400 animate-pulse px-2">Fetching news...</p>';
        
        try {
            const q = query(collection(db, "official_news"), orderBy("createdAt", "desc"));
            const snap = await getDocs(q);

            activeNewsCache = [];

            if (snap.empty) {
                activeNewsList.innerHTML = '<p class="text-sm text-gray-500 dark:text-gray-400 italic border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 p-4 rounded-xl shadow-inner">No official news published yet.</p>';
                return;
            }

            let html = '';
            snap.forEach(doc => {
                const data = doc.data();
                activeNewsCache.push({ id: doc.id, ...data });
                
                const thumb = data.imageUrl ? `<img src="${data.imageUrl}" class="w-16 h-16 rounded-lg object-cover border border-gray-200 dark:border-white/20 bg-white dark:bg-[#14171d] shrink-0">` : `<div class="w-16 h-16 rounded-lg bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-gray-400 dark:text-gray-500">article</span></div>`;

                html += `
                    <div class="flex items-center justify-between bg-gray-50 dark:bg-white/5 p-3 rounded-xl border border-gray-200 dark:border-white/10 shadow-sm group">
                        <div class="flex items-center gap-4 min-w-0">
                            ${thumb}
                            <div class="min-w-0">
                                <p class="font-bold text-sm text-gray-900 dark:text-white leading-tight truncate">${escapeHTML(data.title)}</p>
                                <p class="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-widest mt-1">${escapeHTML(data.tag || 'News')} • ${escapeHTML(data.authorName)}</p>
                            </div>
                        </div>
                        <div class="flex items-center gap-2 shrink-0 ml-2">
                            <button onclick="window.openEditNewsModal('${doc.id}')" class="bg-white dark:bg-[#14171d] hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400 hover:text-[#ff751f] border border-gray-200 dark:border-white/10 hover:border-[#ff751f]/50 p-2 rounded-lg transition-all shadow-sm flex items-center justify-center" title="Edit News">
                                <span class="material-symbols-outlined text-[18px]">edit</span>
                            </button>
                            <button onclick="window.deleteNews('${doc.id}')" class="bg-white dark:bg-[#14171d] hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500 border border-gray-200 dark:border-white/10 hover:border-red-500/30 p-2 rounded-lg transition-all shadow-sm flex items-center justify-center" title="Delete News">
                                <span class="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                        </div>
                    </div>
                `;
            });
            activeNewsList.innerHTML = html;

        } catch (e) {
            console.error("Failed to load news", e);
            activeNewsList.innerHTML = '<p class="text-sm text-red-500 font-bold px-2">Failed to load news.</p>';
        }
    }

    window.deleteNews = async function(newsId) {
        if (!confirm("Are you sure you want to delete this news post?")) return;
        try {
            await deleteDoc(doc(db, "official_news", newsId));
            loadActiveNews();
        } catch(e) {
            console.error(e);
            alert("Failed to delete news.");
        }
    };

    window.openEditNewsModal = function(newsId) {
        if (!editNewsModal) return;
        
        const newsData = activeNewsCache.find(n => n.id === newsId);
        if (!newsData) return;

        document.getElementById('edit-news-id').value = newsId;
        document.getElementById('edit-news-title').value = newsData.title || '';
        document.getElementById('edit-news-content').value = newsData.content || '';
        document.getElementById('edit-news-tag').value = newsData.tag || 'Announcement';
        
        if (editNewsImagePreview) {
            if (newsData.imageUrl) {
                editNewsImagePreview.src = newsData.imageUrl;
                editNewsImagePreview.parentElement.classList.remove('hidden');
            } else {
                editNewsImagePreview.src = '';
                editNewsImagePreview.parentElement.classList.add('hidden');
            }
        }
        if (editNewsImageInput) {
            editNewsImageInput.value = ''; 
        }

        editNewsModal.classList.remove('hidden');
        editNewsModal.classList.add('flex');
        setTimeout(() => {
            editNewsModal.classList.remove('opacity-0');
            const innerDiv = editNewsModal.querySelector('div');
            if(innerDiv) innerDiv.classList.remove('scale-95');
        }, 10);
    };

    if (closeEditNewsBtn && editNewsModal) {
        closeEditNewsBtn.addEventListener('click', () => {
            editNewsModal.classList.add('opacity-0');
            const innerDiv = editNewsModal.querySelector('div');
            if(innerDiv) innerDiv.classList.add('scale-95');
            setTimeout(() => {
                editNewsModal.classList.add('hidden');
                editNewsModal.classList.remove('flex');
            }, 300);
        });
    }

    if (editNewsForm) {
        editNewsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const btn = document.getElementById('submit-edit-news-btn');
            const originalBtnHtml = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = `<span class="material-symbols-outlined animate-spin text-[16px]">sync</span> Saving...`;

            try {
                const newsId = document.getElementById('edit-news-id').value;
                const file = editNewsImageInput.files[0];
                
                let imageUrl = editNewsImagePreview.src; 
                // If it's a generic empty string or domain root, make it null
                if (!imageUrl || imageUrl === window.location.href) {
                    imageUrl = null;
                }
                
                if (file) {
                    const safeName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
                    const storageRef = ref(storage, `news/${auth.currentUser.uid}_${Date.now()}_${safeName}`);
                    const uploadTask = await uploadBytesResumable(storageRef, file);
                    imageUrl = await getDownloadURL(uploadTask.ref);
                }

                await updateDoc(doc(db, "official_news", newsId), {
                    title: document.getElementById('edit-news-title').value.trim(),
                    content: document.getElementById('edit-news-content').value.trim(),
                    tag: document.getElementById('edit-news-tag').value,
                    imageUrl: imageUrl
                });

                if(closeEditNewsBtn) closeEditNewsBtn.click();
                loadActiveNews();
                alert("News updated successfully!");

            } catch (err) {
                console.error(err);
                alert("Failed to update news.");
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalBtnHtml;
            }
        });
    }

    // ==========================================
    // NOTIFICATIONS TAB: SEND TEST NOTIFICATION
    // ==========================================
    const notifForm = document.getElementById('admin-notif-form');
    
    if (notifForm) {
        notifForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const btn = document.getElementById('submit-notif-btn');
            const originalHtml = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = `<span class="material-symbols-outlined animate-spin">sync</span> Sending...`;

            const uid = document.getElementById('notif-user-id').value.trim();
            const title = document.getElementById('notif-title').value.trim();
            const body = document.getElementById('notif-body').value.trim();
            const type = document.getElementById('notif-type').value;
            const link = document.getElementById('notif-link').value.trim();

            try {
                await addDoc(collection(db, "notifications"), {
                    recipientId: uid,
                    title: title,
                    message: body,
                    type: type,
                    link: link,
                    read: false,
                    sender: 'System Admin',
                    createdAt: serverTimestamp()
                });

                const response = await fetch('/.netlify/functions/send-push', {
                    method: 'POST',
                    body: JSON.stringify({
                        uid: uid,
                        title: title,
                        body: body,
                        link: link
                    })
                });

                const result = await response.json();

                if (response.ok) {
                    alert(`Success! Database updated and ${result.message}`);
                } else {
                    console.warn("Netlify function issue:", result);
                    alert(`Saved to database, but push failed: ${result.error || result.body}`);
                }
                
                notifForm.reset();
            } catch (err) {
                console.error("Error sending notif:", err);
                alert("Failed to process notification.");
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalHtml;
            }
        });
    }
});
