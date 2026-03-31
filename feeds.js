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
    const loadingIndicator = document.getElementById('feed-loading-indicator');
    const currentUserAvatar = document.getElementById('current-user-avatar');

    // League Modal
    const leagueModal = document.getElementById('create-league-modal');
    const openLeagueModalBtn = document.getElementById('open-league-modal-btn');
    const closeLeagueModalBtn = document.getElementById('close-league-modal');
    const leagueForm = document.getElementById('create-league-form');

    let currentUserData = null;

    // --- INFINITE SCROLL STATE ---
    let lastVisiblePost = null;
    let isFetchingPosts = false;
    let hasMorePosts = true;
    const POSTS_PER_PAGE = 10;

    // The Intersection Observer watches the bottom of the feed
    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !isFetchingPosts && hasMorePosts) {
            loadPosts(true); // Fetch the next page
        }
    }, { rootMargin: '200px' });

    if (loadingIndicator) observer.observe(loadingIndicator);

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
                    if (currentUserData.photoURL && currentUserAvatar) {
                        currentUserAvatar.src = currentUserData.photoURL;
                    }
                }
            } catch(e) {}
        } else {
            if (postForm && postForm.parentElement) {
                postForm.parentElement.style.display = 'none';
            }
            if (openLeagueModalBtn) openLeagueModalBtn.style.display = 'none';
        }
        
        loadPosts(false); // Initial load
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

            if (!content && !selectedImageFile) {
                alert("Please add some text or an image to post.");
                return;
            }

            if (!auth.currentUser) return alert("Please log in to post.");

            submitBtn.textContent = 'Posting...';
            submitBtn.disabled = true;

            try {
                let imageUrl = null;
                if (selectedImageFile) {
                    imageUrl = await new Promise((resolve, reject) => {
                        const timestamp = Date.now();
                        const safeName = selectedImageFile.name.replace(/[^a-zA-Z0-9.]/g, '_');
                        const storageRef = ref(storage, `post_images/${timestamp}_${safeName}`);
                        const uploadTask = uploadBytesResumable(storageRef, selectedImageFile);
                        
                        const timer = setTimeout(() => {
                            uploadTask.cancel();
                            reject(new Error("Timeout"));
                        }, 60000);

                        uploadTask.on('state_changed', 
                            (snapshot) => {
                                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                                submitBtn.textContent = `POSTING... ${Math.round(progress)}%`;
                            }, 
                            (error) => { clearTimeout(timer); reject(error); }, 
                            async () => {
                                clearTimeout(timer);
                                resolve(await getDownloadURL(uploadTask.snapshot.ref));
                            }
                        );
                    });
                }

                let finalAuthorName = "Unknown Player";
                let finalAuthorPhoto = null;

                if (currentUserData && currentUserData.displayName) {
                    finalAuthorName = currentUserData.displayName;
                    finalAuthorPhoto = currentUserData.photoURL;
                } else if (auth.currentUser.displayName) {
                    finalAuthorName = auth.currentUser.displayName;
                    finalAuthorPhoto = auth.currentUser.photoURL;
                } else {
                    const localProfile = localStorage.getItem('ligaPhProfile');
                    if (localProfile) {
                        try {
                            const parsed = JSON.parse(localProfile);
                            if (parsed.displayName) finalAuthorName = parsed.displayName;
                            if (parsed.photoURL) finalAuthorPhoto = parsed.photoURL;
                        } catch(e) {}
                    }
                }

                const postData = {
                    content: content,
                    location: location,
                    imageUrl: imageUrl,
                    authorId: auth.currentUser.uid,
                    authorName: finalAuthorName,
                    authorPhoto: finalAuthorPhoto || null, 
                    createdAt: serverTimestamp(),
                    likedBy: [],
                    commentsCount: 0
                };

                await addDoc(collection(db, "posts"), postData);

                contentInput.value = '';
                if(locationInput) {
                    locationInput.value = '';
                    locationInput.classList.add('hidden');
                }
                if(removeImageBtn) removeImageBtn.click();

                // Refresh the feed from the top
                loadPosts(false);
            } catch (error) {
                console.error("Error posting:", error);
                alert("Failed to post. Check console.");
            } finally {
                submitBtn.textContent = 'Post';
                submitBtn.disabled = false;
            }
        });
    }

    // --- Dynamic Window Functions for Interactions ---
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
        if (!section.classList.contains('hidden')) {
            loadCommentsForPost(postId);
        }
    };

    window.submitComment = async function(postId) {
        if (!auth.currentUser) return alert("Please log in to reply.");
        const input = document.getElementById(`comment-input-${postId}`);
        const text = input.value.trim();
        if (!text) return;

        input.disabled = true;
        try {
            let authorName = currentUserData?.displayName || auth.currentUser.displayName || "Player";
            let authorPhoto = currentUserData?.photoURL || auth.currentUser.photoURL || "assets/default-avatar.png";
            
            const commentData = {
                text: text,
                authorId: auth.currentUser.uid,
                authorName: authorName,
                authorPhoto: authorPhoto,
                createdAt: serverTimestamp()
            };

            await addDoc(collection(db, `posts/${postId}/comments`), commentData);
            
            const postRef = doc(db, "posts", postId);
            const postSnap = await getDoc(postRef);
            if (postSnap.exists()) {
                const currentCount = postSnap.data().commentsCount || 0;
                await updateDoc(postRef, { commentsCount: currentCount + 1 });
                document.getElementById(`comment-count-${postId}`).textContent = currentCount + 1;
            }

            input.value = '';
            loadCommentsForPost(postId);
        } catch (error) {
            alert("Failed to post comment.");
        }
        input.disabled = false;
    };

    async function loadCommentsForPost(postId) {
        const list = document.getElementById(`comment-list-${postId}`);
        list.innerHTML = '<span class="text-xs text-outline animate-pulse">Loading replies...</span>';
        
        try {
            const q = query(collection(db, `posts/${postId}/comments`), orderBy("createdAt", "asc"));
            const snap = await getDocs(q);
            list.innerHTML = '';
            
            if (snap.empty) {
                list.innerHTML = '<span class="text-[10px] text-outline italic">No replies yet.</span>';
                return;
            }

            snap.forEach(doc => {
                const comment = doc.data();
                const safeName = escapeHTML(comment.authorName);
                const safeText = escapeHTML(comment.text);
                const photo = comment.authorPhoto || 'assets/default-avatar.png';
                
                list.innerHTML += `
                    <div class="flex gap-2 items-start mb-3">
                        <img src="${photo}" onerror="this.onerror=null; this.src='assets/default-avatar.jpg';" class="w-6 h-6 rounded-full object-cover border border-outline-variant/30 shrink-0 bg-surface-container-highest">
                        <div class="bg-surface-container p-3 rounded-xl rounded-tl-none border border-outline-variant/10 text-sm w-full">
                            <span class="font-bold text-on-surface block text-xs mb-0.5">${safeName}</span>
                            <span class="text-on-surface-variant">${safeText}</span>
                        </div>
                    </div>
                `;
            });
        } catch (e) {
            list.innerHTML = '<span class="text-error text-xs">Failed to load comments.</span>';
        }
    }

    // --- Modal and Time Logic ---
    function openLeagueModal() {
        if (!auth.currentUser) return alert("Please log in to create a league.");
        leagueModal.classList.remove('hidden');
        setTimeout(() => {
            leagueModal.classList.remove('opacity-0', 'pointer-events-none');
            leagueModal.querySelector('div.bg-surface-container').classList.remove('scale-95');
            leagueModal.querySelector('div.bg-surface-container').classList.add('scale-100');
        }, 10);
    }

    function closeLeagueModal() {
        leagueModal.classList.add('opacity-0', 'pointer-events-none');
        leagueModal.querySelector('div.bg-surface-container').classList.remove('scale-100');
        leagueModal.querySelector('div.bg-surface-container').classList.add('scale-95');
        setTimeout(() => {
            leagueModal.classList.add('hidden');
            leagueForm.reset();
        }, 300);
    }

    if (openLeagueModalBtn) openLeagueModalBtn.addEventListener('click', openLeagueModal);
    if (closeLeagueModalBtn) closeLeagueModalBtn.addEventListener('click', closeLeagueModal);
    leagueModal.addEventListener('click', (e) => { if (e.target === leagueModal) closeLeagueModal(); });

    if (leagueForm) {
        leagueForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('submit-league-btn');
            const name = document.getElementById('league-name').value;
            const desc = document.getElementById('league-desc').value;

            submitBtn.textContent = 'CREATING...';
            submitBtn.disabled = true;

            try {
                const customId = generate12DigitId();
                const leagueData = {
                    name: name,
                    description: desc,
                    founderId: auth.currentUser.uid,
                    founderName: currentUserData ? currentUserData.displayName : "Unknown",
                    createdAt: serverTimestamp(),
                    members: [auth.currentUser.uid]
                };
                await setDoc(doc(db, "leagues", customId), leagueData);
                closeLeagueModal();
                alert(`League "${name}" created successfully!`);
            } catch (error) {
                alert("Failed to create league.");
            } finally {
                submitBtn.textContent = 'CREATE LEAGUE';
                submitBtn.disabled = false;
            }
        });
    }

    function formatAbsoluteTime(timestamp) {
        if (!timestamp) return '';
        const d = new Date(timestamp.toMillis());
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const month = months[d.getMonth()];
        const day = d.getDate();
        let hours = d.getHours();
        const minutes = d.getMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'pm' : 'am';
        hours = hours % 12;
        hours = hours ? hours : 12; 
        const formattedHours = hours.toString().padStart(2, '0');
        return `${month} ${day} • ${formattedHours}:${minutes}${ampm}`;
    }

    // --- WIDGET DATA FETCHERS ---
    
    async function loadTopSquads() {
        const container = document.getElementById('top-squads-container');
        if (!container) return;
        try {
            const q = query(collection(db, "squads"), orderBy("wins", "desc"), limit(3));
            const snapshot = await getDocs(q);
            container.innerHTML = '';
            if (snapshot.empty) return container.innerHTML = '<span class="text-xs text-on-surface-variant">No squads found.</span>';

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
                    </div>
                `;
                count++;
            });
        } catch (error) {
            container.innerHTML = '<span class="text-xs text-error">Failed to load.</span>';
        }
    }

    async function loadRisingTalents() {
        const container = document.getElementById('rising-talents-container');
        if (!container) return;
        try {
            const q = query(collection(db, "users"), limit(3));
            const snapshot = await getDocs(q);
            container.innerHTML = '';
            if (snapshot.empty) return container.innerHTML = '<span class="text-xs text-on-surface-variant col-span-3 text-center">No players found.</span>';

            snapshot.forEach(doc => {
                const player = doc.data();
                const photoUrl = player.photoURL || 'assets/default-avatar.png';
                const shortName = player.displayName ? escapeHTML(player.displayName).split(' ').slice(0, 2).join(' ') : 'Unknown';
                container.innerHTML += `
                    <div class="flex flex-col items-center gap-2 cursor-pointer group" onclick="window.location.href='profile.html?id=${doc.id}'">
                        <div class="w-16 h-16 rounded-xl overflow-hidden border border-outline-variant/30 group-hover:border-primary transition-colors bg-surface-container-highest relative">
                            <img src="${photoUrl}" onerror="this.onerror=null; this.src='assets/default-avatar.jpg';" class="w-full h-full object-cover">
                            <div class="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors"></div>
                        </div>
                        <span class="text-[10px] font-black text-on-surface uppercase tracking-widest truncate w-full text-center group-hover:text-primary transition-colors">${shortName}</span>
                    </div>
                `;
            });
        } catch (error) {
            container.innerHTML = '<span class="text-xs text-error">Failed to load.</span>';
        }
    }

    // --- PAGINATED FEED LOADER ---
    async function loadPosts(isLoadMore = false) {
        if(!feedContainer) return;
        if(isFetchingPosts) return;
        if(isLoadMore && !hasMorePosts) return;

        isFetchingPosts = true;

        if (!isLoadMore) {
            lastVisiblePost = null;
            hasMorePosts = true;
            if (loadingIndicator) loadingIndicator.classList.add('hidden');
        } else {
            if (loadingIndicator) loadingIndicator.classList.remove('hidden');
        }

        try {
            let q;
            if (lastVisiblePost) {
                q = query(collection(db, "posts"), orderBy("createdAt", "desc"), startAfter(lastVisiblePost), limit(POSTS_PER_PAGE));
            } else {
                q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(POSTS_PER_PAGE));
            }

            const snapshot = await getDocs(q);

            // If it's a fresh load (like initial page load or after a new post), clear container
            if (!isLoadMore) feedContainer.innerHTML = '';

            if (snapshot.empty) {
                hasMorePosts = false;
                if (!isLoadMore) {
                    feedContainer.innerHTML = `
                        <div class="flex flex-col items-center justify-center py-12 text-center text-on-surface-variant bg-surface-container-low rounded-2xl border border-outline-variant/20">
                            <span class="material-symbols-outlined text-6xl mb-4 opacity-50">forum</span>
                            <p class="text-lg">No posts yet. Be the first to share!</p>
                        </div>
                    `;
                } else {
                    const endMsg = document.createElement('div');
                    endMsg.className = "text-center text-outline-variant text-[10px] py-6 uppercase tracking-widest font-bold";
                    endMsg.textContent = "— You're caught up —";
                    feedContainer.appendChild(endMsg);
                }
                
                if (loadingIndicator) loadingIndicator.classList.add('hidden');
                isFetchingPosts = false;
                return;
            }

            lastVisiblePost = snapshot.docs[snapshot.docs.length - 1];
            if (snapshot.docs.length < POSTS_PER_PAGE) {
                hasMorePosts = false;
            }

            snapshot.forEach(doc => {
                const post = { id: doc.id, ...doc.data() };
                const safeName = escapeHTML(post.authorName);
                const safeContent = escapeHTML(post.content);
                const safeLoc = escapeHTML(post.location);
                const photoUrl = post.authorPhoto || 'assets/default-avatar.png';

                let timeStr = "Recently";
                let absTimeStr = "";
                if (post.createdAt) {
                    absTimeStr = formatAbsoluteTime(post.createdAt);
                    const diff = Date.now() - post.createdAt.toMillis();
                    const minutes = Math.floor(diff / (1000 * 60));
                    const hours = Math.floor(diff / (1000 * 60 * 60));
                    
                    if (minutes < 1) timeStr = 'Just now';
                    else if (minutes < 60) timeStr = `${minutes}m ago`;
                    else if (hours < 24) timeStr = `${hours}h ago`;
                    else timeStr = `${Math.floor(hours/24)}d ago`;
                }

                const card = document.createElement('article');
                card.className = 'bg-surface-container-low rounded-2xl p-5 border border-outline-variant/20 shadow-sm transition-all';

                let imageHtml = '';
                if (post.imageUrl) {
                    imageHtml = `
                        <div class="w-full max-h-96 rounded-xl overflow-hidden mt-4 mb-4 bg-surface-container-highest relative group">
                            <img src="${post.imageUrl}" alt="Post image" class="w-full h-full object-contain">
                        </div>
                    `;
                }

                let locText = post.location ? ` • ${safeLoc}` : '';

                const likedArray = post.likedBy || [];
                const isLiked = auth.currentUser && likedArray.includes(auth.currentUser.uid);
                const heartStyle = isLiked ? "'FILL' 1" : "'FILL' 0";
                const heartColor = isLiked ? "text-primary" : "text-on-surface-variant";

                card.innerHTML = `
                    <div class="flex items-center justify-between mb-4">
                        <div class="flex items-center gap-3 cursor-pointer group" onclick="window.location.href='profile.html?id=${post.authorId}'">
                            <div class="w-11 h-11 rounded-full overflow-hidden border-2 border-outline-variant/30 shrink-0 bg-surface-container group-hover:border-primary transition-colors">
                                <img src="${photoUrl}" onerror="this.onerror=null; this.src='assets/default-avatar.jpg';" alt="${safeName}" class="w-full h-full object-cover bg-surface-container-highest">
                            </div>
                            <div>
                                <h4 class="font-bold text-sm text-on-surface group-hover:text-primary transition-colors">${safeName}</h4>
                                <p class="text-[10px] text-secondary font-black uppercase tracking-widest mt-0.5">SCOUTED${locText.toUpperCase()}</p>
                            </div>
                        </div>
                        <div class="text-right">
                            <span class="text-[10px] text-outline font-bold uppercase tracking-widest">${absTimeStr}</span>
                        </div>
                    </div>
                    
                    ${imageHtml}
                    
                    <p class="text-sm text-on-surface-variant mt-2 whitespace-pre-wrap leading-relaxed">${safeContent}</p>

                    <div class="flex gap-6 mt-6 pt-4 border-t border-outline-variant/10">
                        <button onclick="toggleLike('${post.id}', this)" class="flex items-center gap-2 hover:text-primary transition-colors text-sm font-bold ${heartColor}">
                            <span class="material-symbols-outlined text-[20px] transition-all" style="font-variation-settings: ${heartStyle}">favorite</span>
                            <span class="like-count">${likedArray.length}</span>
                        </button>
                        <button onclick="toggleComments('${post.id}')" class="flex items-center gap-2 text-on-surface-variant hover:text-secondary transition-colors text-sm font-bold">
                            <span class="material-symbols-outlined text-[20px]">chat_bubble</span>
                            <span id="comment-count-${post.id}">${post.commentsCount || 0}</span>
                        </button>
                    </div>
                    
                    <div id="comment-section-${post.id}" class="hidden mt-4 pt-4 border-t border-outline-variant/10">
                        <div id="comment-list-${post.id}" class="space-y-3 mb-3 max-h-48 overflow-y-auto custom-scrollbar pr-2"></div>
                        <div class="flex gap-2">
                            <input type="text" id="comment-input-${post.id}" placeholder="Write a reply..." class="flex-1 bg-surface-container-highest border border-outline-variant/30 rounded-lg px-4 py-2 text-sm text-on-surface focus:border-primary focus:outline-none transition-colors">
                            <button onclick="submitComment('${post.id}')" class="bg-primary text-on-primary-container px-5 py-2 rounded-lg text-xs font-black uppercase tracking-widest active:scale-95 transition-transform shadow-sm hover:brightness-110">Reply</button>
                        </div>
                    </div>
                `;
                feedContainer.appendChild(card);
            });

            if (loadingIndicator) {
                if (hasMorePosts) loadingIndicator.classList.remove('hidden');
                else loadingIndicator.classList.add('hidden');
            }

        } catch (error) {
            console.error("Error loading feed:", error);
            if (!isLoadMore) feedContainer.innerHTML = '<p class="text-error text-center p-8">Failed to load feed.</p>';
        } finally {
            isFetchingPosts = false;
        }
    }
});
