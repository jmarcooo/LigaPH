import { auth, db, storage } from './firebase-setup.js';
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { generate12DigitId } from './utils.js';
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";

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

    // League Modal
    const leagueModal = document.getElementById('create-league-modal');
    const openLeagueModalBtn = document.getElementById('open-league-modal-btn');
    const closeLeagueModalBtn = document.getElementById('close-league-modal');
    const leagueForm = document.getElementById('create-league-form');

    let currentUserData = null;

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

            const createLeagueBtn = document.getElementById('open-create-league-btn');
            if (createLeagueBtn) createLeagueBtn.style.display = 'none';
            
            if (openLeagueModalBtn) openLeagueModalBtn.style.display = 'none';
        }
        loadPosts();
        loadTopLeagues();
    });

    // --- Compose Post UI Logic ---
    if (locationBtn && locationInput) {
        locationBtn.addEventListener('click', (e) => {
            e.preventDefault();
            locationInput.classList.toggle('hidden');
            if(!locationInput.classList.contains('hidden')) {
                locationInput.focus();
            }
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

    // --- Post Logic ---
    if (postForm) {
        postForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const content = contentInput.value.trim();
            const location = locationInput ? locationInput.value.trim() : '';

            if (!content && !selectedImageFile) {
                alert("Please add some text or an image to post.");
                return;
            }

            if (!auth.currentUser) {
                alert("Please log in to post.");
                return;
            }

            submitBtn.textContent = 'Posting...';
            submitBtn.disabled = true;

            try {
                let imageUrl = null;
                if (selectedImageFile) {
                    const timestamp = Date.now();
                    const safeName = selectedImageFile.name.replace(/[^a-zA-Z0-9.]/g, '_');
                    const storageRef = ref(storage, `post_images/${timestamp}_${safeName}`);
                    const snapshot = await uploadBytes(storageRef, selectedImageFile);
                    imageUrl = await getDownloadURL(snapshot.ref);
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
                    likes: 0,
                    commentsCount: 0
                };

                await addDoc(collection(db, "posts"), postData);

                // Reset UI
                contentInput.value = '';
                if(locationInput) {
                    locationInput.value = '';
                    locationInput.classList.add('hidden');
                }
                if(removeImageBtn) removeImageBtn.click();

                loadPosts(); // Refresh feed
            } catch (error) {
                console.error("Error posting:", error);
                alert("Failed to post. Check console.");
            } finally {
                submitBtn.textContent = 'Post';
                submitBtn.disabled = false;
            }
        });
    }

    // --- League Modal Logic ---
    function openLeagueModal() {
        if (!auth.currentUser) {
            alert("Please log in to create a league.");
            return;
        }
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
    leagueModal.addEventListener('click', (e) => {
        if (e.target === leagueModal) closeLeagueModal();
    });

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
                console.error("Error creating league:", error);
                alert("Failed to create league.");
            } finally {
                submitBtn.textContent = 'CREATE LEAGUE';
                submitBtn.disabled = false;
            }
        });
    }

    // --- Time Formatter ---
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
        hours = hours ? hours : 12; // the hour '0' should be '12'
        const formattedHours = hours.toString().padStart(2, '0');
        return `${month} ${day} • ${formattedHours}:${minutes}${ampm}`;
    }

    // --- Render Posts ---
    function escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    async function loadTopLeagues() {
        const topLeaguesContainer = document.getElementById('top-leagues-container');
        if (!topLeaguesContainer) return;

        try {
            const leaguesRef = collection(db, "leagues");
            const q = query(leaguesRef, orderBy("createdAt", "desc"));
            const snapshot = await getDocs(q);

            topLeaguesContainer.innerHTML = '';

            if (snapshot.empty) {
                topLeaguesContainer.innerHTML = '<span class="text-on-surface-variant px-4">No leagues found.</span>';
                return;
            }

            const leagues = [];
            snapshot.forEach(doc => {
                leagues.push({ id: doc.id, ...doc.data() });
            });

            const topLeagues = leagues.slice(0, 5);

            topLeagues.forEach(league => {
                const safeName = escapeHTML(league.name);
                const safeDesc = escapeHTML(league.description);
                const membersCount = league.members ? league.members.length : 1;

                const card = document.createElement('div');
                card.className = 'flex-none w-64 snap-start bg-surface-container-high rounded-xl p-5 border border-outline-variant/10 flex flex-col group hover:bg-surface-container-highest transition-colors cursor-pointer text-left';
                card.onclick = () => window.location.href = `league-details.html?id=${league.id}`;

                card.innerHTML = `
                    <div class="flex items-center gap-3 mb-3">
                        <div class="w-10 h-10 rounded-full bg-secondary/20 flex items-center justify-center text-secondary shrink-0 group-hover:scale-110 transition-transform">
                            <span class="material-symbols-outlined text-[20px]">emoji_events</span>
                        </div>
                        <div class="flex-1 min-w-0">
                            <h4 class="font-headline font-black text-sm uppercase tracking-tight text-on-surface truncate">${safeName}</h4>
                            <span class="text-secondary text-[10px] font-black uppercase tracking-wider">${membersCount} Members</span>
                        </div>
                    </div>
                    <p class="text-xs text-on-surface-variant line-clamp-2">${safeDesc}</p>
                `;
                topLeaguesContainer.appendChild(card);
            });

        } catch (error) {
            console.error("Error loading top leagues:", error);
            topLeaguesContainer.innerHTML = '<span class="text-error px-4">Failed to load leagues.</span>';
        }
    }

    async function loadPosts() {
        if(!feedContainer) return;
        try {
            const postsRef = collection(db, "posts");
            const q = query(postsRef, orderBy("createdAt", "desc"));
            const snapshot = await getDocs(q);

            feedContainer.innerHTML = '';
            if (snapshot.empty) {
                feedContainer.innerHTML = `
                    <div class="flex flex-col items-center justify-center py-12 text-center text-on-surface-variant">
                        <span class="material-symbols-outlined text-6xl mb-4 opacity-50">forum</span>
                        <p class="text-lg">No posts yet. Be the first to share!</p>
                    </div>
                `;
                return;
            }

            snapshot.forEach(doc => {
                const post = { id: doc.id, ...doc.data() };
                const safeName = escapeHTML(post.authorName);
                const safeContent = escapeHTML(post.content);
                const safeLoc = escapeHTML(post.location);
                const photoUrl = post.authorPhoto || 'assets/default-avatar.jpg';

                // Setup Timestamp Logic
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
                card.className = 'bg-surface-container-high rounded-2xl p-5 border border-outline-variant/10 shadow-sm';

                let imageHtml = '';
                if (post.imageUrl) {
                    imageHtml = `
                        <div class="w-full h-64 sm:h-80 rounded-xl overflow-hidden mt-4 mb-2 bg-surface-container-highest">
                            <img src="${post.imageUrl}" alt="Post image" class="w-full h-full object-cover">
                        </div>
                    `;
                }

                let locHtml = '';
                if (post.location) {
                    locHtml = `
                        <div class="flex items-center gap-1 text-[10px] font-bold text-primary uppercase tracking-widest mt-1">
                            <span class="material-symbols-outlined text-[12px]">location_on</span>
                            ${safeLoc}
                        </div>
                    `;
                }

                card.innerHTML = `
                    <div class="flex gap-3 items-start">
                        <div class="w-11 h-11 rounded-full overflow-hidden border border-outline-variant/30 shrink-0 bg-surface-container cursor-pointer hover:opacity-80 transition-opacity" onclick="window.location.href='profile.html?id=${post.authorId}'">
                            <img src="${photoUrl}" alt="${safeName}" onerror="this.src='assets/default-avatar.jpg'" class="w-full h-full object-cover">
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="flex justify-between items-start cursor-pointer hover:opacity-80 transition-opacity" onclick="window.location.href='profile.html?id=${post.authorId}'">
                                <div>
                                    <h4 class="font-bold text-sm text-on-surface truncate mt-0.5">${safeName}</h4>
                                    ${locHtml}
                                </div>
                                <div class="flex flex-col items-end text-right ml-2 shrink-0">
                                    <span class="text-[10px] text-on-surface font-bold uppercase tracking-widest">${absTimeStr}</span>
                                    <span class="text-[10px] text-outline font-medium mt-0.5">${timeStr}</span>
                                </div>
                            </div>
                            
                            <p class="text-sm text-on-surface-variant mt-3 whitespace-pre-wrap leading-relaxed">${safeContent}</p>
                            ${imageHtml}

                            <div class="flex gap-6 mt-4 pt-3 border-t border-outline-variant/10">
                                <button class="flex items-center gap-1.5 text-on-surface-variant hover:text-primary transition-colors text-xs font-bold">
                                    <span class="material-symbols-outlined text-[18px]">favorite</span>
                                    ${post.likes || 0}
                                </button>
                                <button class="flex items-center gap-1.5 text-on-surface-variant hover:text-secondary transition-colors text-xs font-bold">
                                    <span class="material-symbols-outlined text-[18px]">chat_bubble</span>
                                    ${post.commentsCount || 0}
                                </button>
                            </div>
                        </div>
                    </div>
                `;
                feedContainer.appendChild(card);
            });
        } catch (error) {
            console.error("Error loading feed:", error);
            feedContainer.innerHTML = '<p class="text-error text-center p-8">Failed to load feed.</p>';
        }
    }
});
