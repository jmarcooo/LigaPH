import { auth, db, storage } from './firebase-setup.js';
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp, doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, limit, startAfter } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { generate12DigitId } from './utils.js';
import { ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";

document.addEventListener('DOMContentLoaded', () => {
    const postForm = document.getElementById('create-post-form');
    const contentInput = document.getElementById('post-content');
    const locationBtn = document.getElementById('add-location-btn');
    const locationInput = document.getElementById('post-location-input');
    const imageInput = document.getElementById('post-image-input');
    const imagePreviewContainer = document.getElementById('post-image-preview-container');
    const imagePreview = document.getElementById('post-image-preview');
    const removeImageBtn = document.getElementById('remove-post-image-btn');
    const submitBtn = document.getElementById('submit-post-btn');
    
    const feedContainer = document.getElementById('feed-container');
    const currentUserAvatar = document.getElementById('current-user-avatar');

    let currentUserData = null;

    function getFallbackAvatar(name) {
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'P')}&background=20262f&color=ff8f6f`;
    }

    function escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                const docRef = doc(db, "users", user.uid);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    currentUserData = docSnap.data();
                    if (currentUserAvatar) {
                        currentUserAvatar.src = currentUserData.photoURL || getFallbackAvatar(currentUserData.displayName);
                    }
                }
            } catch(e) {}
        } else {
            if (postForm && postForm.parentElement) postForm.parentElement.style.display = 'none';
        }
        
        loadPosts(); 
        loadTopSquads();
        loadRisingTalents();
    });

    if (locationBtn && locationInput) {
        locationBtn.addEventListener('click', (e) => {
            e.preventDefault();
            locationInput.classList.toggle('hidden');
            if(!locationInput.classList.contains('hidden')) locationInput.focus();
        });
    }

    let selectedImageFile = null;
    if (imageInput && imagePreviewContainer && imagePreview && removeImageBtn) {
        imageInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                selectedImageFile = file;
                const reader = new FileReader();
                reader.onload = (e) => {
                    imagePreview.src = e.target.result;
                    imagePreviewContainer.classList.remove('hidden');
                };
                reader.readAsDataURL(file);
            }
        });

        removeImageBtn.addEventListener('click', (e) => {
            e.preventDefault();
            selectedImageFile = null;
            imageInput.value = '';
            imagePreview.src = '';
            imagePreviewContainer.classList.add('hidden');
        });
    }

    if (postForm) {
        postForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const content = contentInput.value.trim();
            const location = locationInput ? locationInput.value.trim() : '';

            if (!content && !selectedImageFile) return alert("Please add some text or an image.");
            if (!auth.currentUser) return alert("Please log in to post.");

            submitBtn.textContent = 'Posting...';
            submitBtn.disabled = true;

            try {
                let imageUrl = null;
                if (selectedImageFile) {
                    imageUrl = await new Promise((resolve, reject) => {
                        const storageRef = ref(storage, `post_images/${Date.now()}_${selectedImageFile.name}`);
                        const uploadTask = uploadBytesResumable(storageRef, selectedImageFile);
                        uploadTask.on('state_changed', 
                            (snapshot) => {
                                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                                submitBtn.textContent = `POSTING... ${Math.round(progress)}%`;
                            }, 
                            (error) => reject(error), 
                            async () => resolve(await getDownloadURL(uploadTask.snapshot.ref))
                        );
                    });
                }

                let finalAuthorName = currentUserData?.displayName || auth.currentUser.displayName || "Unknown Player";
                let finalAuthorPhoto = currentUserData?.photoURL || auth.currentUser.photoURL || null;

                const postData = {
                    content: content,
                    location: location,
                    imageUrl: imageUrl,
                    authorId: auth.currentUser.uid,
                    authorName: finalAuthorName,
                    authorPhoto: finalAuthorPhoto, 
                    createdAt: serverTimestamp(),
                    likedBy: [],
                    commentsCount: 0
                };

                await addDoc(collection(db, "posts"), postData);
                contentInput.value = '';
                if(locationInput) { locationInput.value = ''; locationInput.classList.add('hidden'); }
                if(removeImageBtn) removeImageBtn.click();
                loadPosts();
            } catch (error) {
                alert("Failed to post.");
            } finally {
                submitBtn.textContent = 'Post';
                submitBtn.disabled = false;
            }
        });
    }

    // --- Dynamic Window Functions ---
    window.toggleLike = async function(postId, btnElement) {
        if (!auth.currentUser) return alert("Please log in to like posts.");
        const iconSpan = btnElement.querySelector('span');
        const countSpan = btnElement.querySelector('.like-count');
        let currentLikes = parseInt(countSpan.textContent) || 0;
        const isLiked = iconSpan.style.fontVariationSettings === "'FILL' 1";
        const postRef = doc(db, "posts", postId);

        if (isLiked) {
            iconSpan.style.fontVariationSettings = "'FILL' 0";
            iconSpan.classList.remove('text-primary');
            countSpan.textContent = currentLikes - 1;
            await updateDoc(postRef, { likedBy: arrayRemove(auth.currentUser.uid) });
        } else {
            iconSpan.style.fontVariationSettings = "'FILL' 1";
            iconSpan.classList.add('text-primary');
            countSpan.textContent = currentLikes + 1;
            await updateDoc(postRef, { likedBy: arrayUnion(auth.currentUser.uid) });
        }
    };

    window.toggleComments = async function(postId) {
        const section = document.getElementById(`comment-section-${postId}`);
        section.classList.toggle('hidden');
        if (!section.classList.contains('hidden')) loadCommentsForPost(postId);
    };

    window.submitComment = async function(postId) {
        if (!auth.currentUser) return alert("Please log in to reply.");
        const input = document.getElementById(`comment-input-${postId}`);
        const text = input.value.trim();
        if (!text) return;

        input.disabled = true;
        try {
            await addDoc(collection(db, `posts/${postId}/comments`), {
                text: text,
                authorId: auth.currentUser.uid,
                authorName: currentUserData?.displayName || "Player",
                authorPhoto: currentUserData?.photoURL || null,
                createdAt: serverTimestamp()
            });
            const postRef = doc(db, "posts", postId);
            const postSnap = await getDoc(postRef);
            if (postSnap.exists()) {
                const currentCount = postSnap.data().commentsCount || 0;
                await updateDoc(postRef, { commentsCount: currentCount + 1 });
                document.getElementById(`comment-count-${postId}`).textContent = currentCount + 1;
            }
            input.value = '';
            loadCommentsForPost(postId);
        } catch (error) { alert("Failed to post comment."); }
        input.disabled = false;
    };

    async function loadCommentsForPost(postId) {
        const list = document.getElementById(`comment-list-${postId}`);
        list.innerHTML = '<span class="text-xs text-outline animate-pulse">Loading replies...</span>';
        try {
            const q = query(collection(db, `posts/${postId}/comments`), orderBy("createdAt", "asc"));
            const snap = await getDocs(q);
            list.innerHTML = snap.empty ? '<span class="text-[10px] text-outline italic">No replies yet.</span>' : '';
            snap.forEach(doc => {
                const comment = doc.data();
                const safeName = escapeHTML(comment.authorName);
                const photo = escapeHTML(comment.authorPhoto) || getFallbackAvatar(safeName);
                
                list.innerHTML += `
                    <div class="flex gap-2 items-start mb-3">
                        <img src="${photo}" onerror="this.onerror=null; this.src='${getFallbackAvatar(safeName)}';" class="w-6 h-6 rounded-full object-cover border border-outline-variant/30 shrink-0 bg-surface-container-highest">
                        <div class="bg-surface-container p-3 rounded-xl rounded-tl-none border border-outline-variant/10 text-sm w-full">
                            <span class="font-bold text-on-surface block text-xs mb-0.5">${safeName}</span>
                            <span class="text-on-surface-variant">${escapeHTML(comment.text)}</span>
                        </div>
                    </div>`;
            });
        } catch (e) { list.innerHTML = '<span class="text-error text-xs">Failed to load comments.</span>'; }
    }

    // --- WIDGET DATA FETCHERS ---
    async function loadTopSquads() {
        const container = document.getElementById('top-squads-container');
        if (!container) return;
        try {
            const q = query(collection(db, "squads"), orderBy("wins", "desc"), limit(3));
            const snapshot = await getDocs(q);
            container.innerHTML = snapshot.empty ? '<span class="text-xs text-on-surface-variant">No squads found.</span>' : '';
            let count = 0;
            snapshot.forEach(doc => {
                const squad = doc.data();
                const rank = (count + 1).toString().padStart(2, '0');
                container.innerHTML += `
                    <div class="flex items-center gap-4 group cursor-pointer" onclick="window.location.href='squad-details.html?id=${doc.id}'">
                        <span class="font-black italic text-xl text-outline-variant/50 group-hover:text-primary transition-colors">${rank}</span>
                        <div class="w-10 h-10 rounded-lg bg-surface-container-highest border border-outline-variant/20 flex items-center justify-center shrink-0 group-hover:border-primary/50 transition-colors">
                            <span class="material-symbols-outlined text-[18px] text-primary/70 group-hover:text-primary">shield</span>
                        </div>
                        <div class="flex-1 min-w-0">
                            <h4 class="font-bold text-sm text-on-surface truncate uppercase group-hover:text-primary transition-colors">${escapeHTML(squad.name)}</h4>
                            <p class="text-[10px] text-on-surface-variant uppercase tracking-widest mt-0.5">${squad.wins || 0}-${squad.losses || 0} Record</p>
                        </div>
                    </div>`;
                count++;
            });
        } catch (error) { container.innerHTML = '<span class="text-xs text-error">Failed to load.</span>'; }
    }

    async function loadRisingTalents() {
        const container = document.getElementById('rising-talents-container');
        if (!container) return;
        try {
            const q = query(collection(db, "users"), limit(3));
            const snapshot = await getDocs(q);
            container.innerHTML = snapshot.empty ? '<span class="text-xs text-on-surface-variant col-span-3 text-center">No players found.</span>' : '';
            snapshot.forEach(doc => {
                const player = doc.data();
                const safeName = escapeHTML(player.displayName || 'Unknown');
                const photoUrl = escapeHTML(player.photoURL) || getFallbackAvatar(safeName);
                const shortName = safeName.split(' ').slice(0, 2).join(' ');
                
                container.innerHTML += `
                    <div class="flex flex-col items-center gap-2 cursor-pointer group" onclick="window.location.href='profile.html?id=${doc.id}'">
                        <div class="w-16 h-16 rounded-xl overflow-hidden border border-outline-variant/30 group-hover:border-primary transition-colors bg-surface-container-highest relative">
                            <img src="${photoUrl}" onerror="this.onerror=null; this.src='${getFallbackAvatar(safeName)}';" class="w-full h-full object-cover">
                        </div>
                        <span class="text-[10px] font-black text-on-surface uppercase tracking-widest truncate w-full text-center group-hover:text-primary transition-colors">${shortName}</span>
                    </div>`;
            });
        } catch (error) { container.innerHTML = '<span class="text-xs text-error">Failed to load.</span>'; }
    }

    async function loadPosts() {
        if(!feedContainer) return;
        try {
            const q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(20));
            const snapshot = await getDocs(q);
            feedContainer.innerHTML = snapshot.empty ? `<div class="flex flex-col items-center py-12 text-on-surface-variant"><span class="material-symbols-outlined text-6xl mb-4 opacity-50">forum</span><p class="text-lg">No posts yet.</p></div>` : '';

            snapshot.forEach(doc => {
                const post = { id: doc.id, ...doc.data() };
                const safeName = escapeHTML(post.authorName);
                const photoUrl = escapeHTML(post.authorPhoto) || getFallbackAvatar(safeName);
                
                let timeStr = "Recently";
                if (post.createdAt) {
                    const diff = Date.now() - post.createdAt.toMillis();
                    const hours = Math.floor(diff / 3600000);
                    timeStr = hours < 1 ? 'Just now' : (hours < 24 ? `${hours}h ago` : `${Math.floor(hours/24)}d ago`);
                }

                const likedArray = post.likedBy || [];
                const isLiked = auth.currentUser && likedArray.includes(auth.currentUser.uid);

                const card = document.createElement('article');
                card.className = 'bg-surface-container-low rounded-2xl p-5 border border-outline-variant/20 shadow-sm';
                card.innerHTML = `
                    <div class="flex items-center justify-between mb-4">
                        <div class="flex items-center gap-3 cursor-pointer group" onclick="window.location.href='profile.html?id=${post.authorId}'">
                            <div class="w-11 h-11 rounded-full overflow-hidden border-2 border-outline-variant/30 shrink-0 bg-surface-container group-hover:border-primary transition-colors">
                                <img src="${photoUrl}" onerror="this.onerror=null; this.src='${getFallbackAvatar(safeName)}';" class="w-full h-full object-cover">
                            </div>
                            <div>
                                <h4 class="font-bold text-sm text-on-surface group-hover:text-primary transition-colors">${safeName}</h4>
                                <p class="text-[10px] text-secondary font-black uppercase tracking-widest mt-0.5">SCOUTED ${post.location ? `• ${escapeHTML(post.location)}` : ''}</p>
                            </div>
                        </div>
                        <span class="text-[10px] text-outline font-bold uppercase tracking-widest">${timeStr}</span>
                    </div>
                    ${post.imageUrl ? `<div class="w-full max-h-96 rounded-xl overflow-hidden mt-4 mb-4 bg-surface-container-highest"><img src="${escapeHTML(post.imageUrl)}" class="w-full h-full object-contain"></div>` : ''}
                    <p class="text-sm text-on-surface-variant mt-2 whitespace-pre-wrap">${escapeHTML(post.content)}</p>
                    <div class="flex gap-6 mt-6 pt-4 border-t border-outline-variant/10">
                        <button onclick="toggleLike('${post.id}', this)" class="flex items-center gap-2 hover:text-primary transition-colors text-sm font-bold ${isLiked ? 'text-primary' : 'text-on-surface-variant'}">
                            <span class="material-symbols-outlined text-[20px]" style="font-variation-settings: ${isLiked ? "'FILL' 1" : "'FILL' 0"}">favorite</span><span class="like-count">${likedArray.length}</span>
                        </button>
                        <button onclick="toggleComments('${post.id}')" class="flex items-center gap-2 text-on-surface-variant hover:text-secondary text-sm font-bold">
                            <span class="material-symbols-outlined text-[20px]">chat_bubble</span><span id="comment-count-${post.id}">${post.commentsCount || 0}</span>
                        </button>
                    </div>
                    <div id="comment-section-${post.id}" class="hidden mt-4 pt-4 border-t border-outline-variant/10">
                        <div id="comment-list-${post.id}" class="space-y-3 mb-3 max-h-48 overflow-y-auto"></div>
                        <div class="flex gap-2">
                            <input type="text" id="comment-input-${post.id}" placeholder="Write a reply..." class="flex-1 bg-surface-container-highest border border-outline-variant/30 rounded-lg px-4 py-2 text-sm text-on-surface">
                            <button onclick="submitComment('${post.id}')" class="bg-primary text-on-primary-container px-5 py-2 rounded-lg text-xs font-black uppercase tracking-widest">Reply</button>
                        </div>
                    </div>`;
                feedContainer.appendChild(card);
            });
        } catch (error) { feedContainer.innerHTML = '<p class="text-error text-center p-8">Failed to load feed.</p>'; }
    }
});
