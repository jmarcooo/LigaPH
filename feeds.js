import { auth, db, storage } from './firebase-setup.js';
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp, doc, getDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove, limit, startAfter, where } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { generate12DigitId } from './utils.js';
import { ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";

// --- UTILITY FUNCTIONS ---
function calculateSquadScore(squad) {
    const wins = squad.wins || 0;
    const losses = squad.losses || 0;
    let score = (wins * 50) - (losses * 15);
    return score < 0 ? 0 : score;
}

function calculatePlayerScore(player) {
    const attended = player.gamesAttended || 0;
    const missed = player.gamesMissed || 0;
    const totalGames = attended + missed;
    const reliabilityMultiplier = totalGames === 0 ? 1 : (attended / totalGames);
    let statsAvg = 0;
    if (player.selfRatings) {
        const sr = player.selfRatings;
        const total = (sr.shooting || 0) + (sr.passing || 0) + (sr.dribbling || 0) + (sr.rebounding || 0) + (sr.defense || 0);
        statsAvg = total / 5;
    }
    const props = player.commendations || 0;
    const activityScore = (attended * 50) * reliabilityMultiplier; 
    const propsScore = props * 15;
    const skillScore = statsAvg * 5;
    return Math.round(activityScore + propsScore + skillScore);
}

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

    let currentUserData = null;
    const userCache = {};

    let lastVisiblePost = null;
    let isFetchingPosts = false;
    let hasMorePosts = true;
    const POSTS_PER_PAGE = 10;

    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !isFetchingPosts && hasMorePosts) {
            loadPosts(true); 
        }
    }, { rootMargin: '200px' });

    if (loadingIndicator) observer.observe(loadingIndicator);

    function getFallbackAvatar(name) {
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'P')}&background=20262f&color=ff8f6f`;
    }
    function getFallbackLogo(name) {
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'S')}&background=20262f&color=ff8f6f`;
    }

    function escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function getFullPosition(abbr) {
        const map = {
            'PG': 'Point Guard',
            'SG': 'Shooting Guard',
            'SF': 'Small Forward',
            'PF': 'Power Forward',
            'C': 'Center',
            'UNASSIGNED': 'Player'
        };
        return map[abbr] || abbr || 'Player';
    }

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                const docRef = doc(db, "users", user.uid);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    currentUserData = docSnap.data();
                    userCache[user.uid] = currentUserData;
                    if (currentUserAvatar) {
                        currentUserAvatar.src = currentUserData.photoURL || getFallbackAvatar(currentUserData.displayName);
                    }
                }
            } catch(e) {}
        } else {
            if (postForm && postForm.parentElement) postForm.parentElement.style.display = 'none';
        }
        
        loadPosts(false);
        loadTopSquads();
        loadRisingTalents();
        loadUpcomingGames(); // NEW
    });

    if (locationBtn && locationInput) {
        locationBtn.addEventListener('click', (e) => {
            e.preventDefault();
            
            if (!locationInput.classList.contains('hidden') && locationInput.value.trim() !== '') {
                locationInput.classList.add('hidden');
                locationInput.value = '';
                locationBtn.classList.remove('text-primary', 'bg-primary/10');
                locationBtn.classList.add('text-secondary', 'hover:bg-secondary/10');
                return;
            }

            locationInput.classList.remove('hidden');
            locationInput.placeholder = "Locating...";
            locationInput.disabled = true;
            
            const icon = locationBtn.querySelector('span');
            const originalIcon = icon.textContent;
            icon.textContent = 'refresh';
            icon.classList.add('animate-spin');

            if ("geolocation" in navigator) {
                navigator.geolocation.getCurrentPosition(async (position) => {
                    const lat = position.coords.latitude;
                    const lon = position.coords.longitude;
                    
                    try {
                        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
                        const data = await res.json();
                        
                        let locName = "";
                        if (data.address) {
                            locName = data.address.city || data.address.town || data.address.village || data.address.suburb || data.address.county || "";
                            if (locName && data.address.state) {
                                locName += ", " + data.address.state;
                            } else if (!locName) {
                                locName = data.display_name.split(',').slice(0, 2).join(','); 
                            }
                        } else {
                            locName = "Current Location";
                        }
                        
                        locationInput.value = locName;
                        
                        locationBtn.classList.remove('text-secondary', 'hover:bg-secondary/10');
                        locationBtn.classList.add('text-primary', 'bg-primary/10');
                    } catch (err) {
                        locationInput.placeholder = "Add location...";
                        alert("Could not resolve location name. Please type it manually.");
                    } finally {
                        locationInput.disabled = false;
                        icon.classList.remove('animate-spin');
                        icon.textContent = originalIcon;
                    }
                }, (error) => {
                    locationInput.placeholder = "Add location...";
                    locationInput.disabled = false;
                    icon.classList.remove('animate-spin');
                    icon.textContent = originalIcon;
                    alert("Location access denied or unavailable. Please type it manually.");
                }, { timeout: 10000 });
            } else {
                locationInput.placeholder = "Add location...";
                locationInput.disabled = false;
                icon.classList.remove('animate-spin');
                icon.textContent = originalIcon;
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

    if (postForm) {
        postForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const content = contentInput.value.trim();
            const location = locationInput ? locationInput.value.trim() : '';
            const visibility = document.getElementById('post-visibility') ? document.getElementById('post-visibility').value : 'Public';

            if (!content && !selectedImageFile) return alert("Please add some text or an image.");
            if (!auth.currentUser) return alert("Please log in to post.");

            submitBtn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[16px]">sync</span>';
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
                            (snapshot) => {}, 
                            (error) => { clearTimeout(timer); reject(error); }, 
                            async () => {
                                clearTimeout(timer);
                                resolve(await getDownloadURL(uploadTask.snapshot.ref));
                            }
                        );
                    });
                }

                let finalAuthorName = currentUserData?.displayName || auth.currentUser.displayName || "Unknown Player";
                let finalAuthorPhoto = currentUserData?.photoURL || auth.currentUser.photoURL || null;
                let finalAuthorPosition = currentUserData?.primaryPosition || "PLAYER";
                let finalAuthorSquad = currentUserData?.squadAbbr || null;

                if (!currentUserData) {
                    const localProfile = localStorage.getItem('ligaPhProfile');
                    if (localProfile) {
                        try {
                            const parsed = JSON.parse(localProfile);
                            if (parsed.displayName) finalAuthorName = parsed.displayName;
                            if (parsed.photoURL) finalAuthorPhoto = parsed.photoURL;
                            if (parsed.primaryPosition) finalAuthorPosition = parsed.primaryPosition;
                            if (parsed.squadAbbr) finalAuthorSquad = parsed.squadAbbr;
                        } catch(e) {}
                    }
                }

                const postData = {
                    content: content,
                    location: location,
                    imageUrl: imageUrl,
                    visibility: visibility,
                    authorId: auth.currentUser.uid,
                    authorName: finalAuthorName,
                    authorPhoto: finalAuthorPhoto,
                    authorPosition: finalAuthorPosition,
                    authorSquadAbbr: finalAuthorSquad, 
                    createdAt: serverTimestamp(),
                    likedBy: [],
                    commentsCount: 0
                };

                await addDoc(collection(db, "posts"), postData);

                contentInput.value = '';
                if(locationInput) { 
                    locationInput.value = ''; 
                    locationInput.classList.add('hidden'); 
                    locationBtn.classList.remove('text-primary', 'bg-primary/10');
                    locationBtn.classList.add('text-secondary', 'hover:bg-secondary/10');
                }
                if(removeImageBtn) removeImageBtn.click();
                loadPosts(false);
            } catch (error) {
                alert("Failed to post. Check console.");
            } finally {
                submitBtn.textContent = 'Post';
                submitBtn.disabled = false;
            }
        });
    }

    // --- NEW: ADMIN OVERRIDE DELETE FUNCTION ---
    window.deletePost = async function(postId) {
        if (!auth.currentUser) return;
        
        if (confirm("Are you sure you want to delete this post? This action cannot be undone.")) {
            try {
                await deleteDoc(doc(db, "posts", postId));
                const postElement = document.getElementById(`post-${postId}`);
                if (postElement) postElement.remove();
            } catch (error) {
                console.error("Error deleting post:", error);
                alert("Failed to delete post.");
            }
        }
    };

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
            iconSpan.classList.add('text-on-surface-variant');
            countSpan.textContent = currentLikes - 1;
            await updateDoc(postRef, { likedBy: arrayRemove(auth.currentUser.uid) });
        } else {
            iconSpan.style.fontVariationSettings = "'FILL' 1";
            iconSpan.classList.add('text-primary');
            iconSpan.classList.remove('text-on-surface-variant');
            countSpan.textContent = currentLikes + 1;
            await updateDoc(postRef, { likedBy: arrayUnion(auth.currentUser.uid) });
            
            try {
                const postSnap = await getDoc(postRef);
                const postData = postSnap.data();
                if (postData.authorId && postData.authorId !== auth.currentUser.uid) {
                    await addDoc(collection(db, "notifications"), {
                        recipientId: postData.authorId,
                        actorId: auth.currentUser.uid,
                        actorName: auth.currentUser.displayName || currentUserData?.displayName || "Someone",
                        actorPhoto: auth.currentUser.photoURL || currentUserData?.photoURL || null,
                        type: 'post_like',
                        targetId: postId,
                        message: `liked your post.`,
                        link: `feeds.html#post-${postId}`,
                        read: false,
                        createdAt: serverTimestamp()
                    });
                }
            } catch(e){}
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
            let authorName = currentUserData?.displayName || auth.currentUser.displayName || "Player";
            let authorPhoto = currentUserData?.photoURL || auth.currentUser.photoURL || null;
            
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

                const postData = postSnap.data();
                if (postData.authorId && postData.authorId !== auth.currentUser.uid) {
                    let shortText = text.length > 25 ? text.substring(0, 25) + '...' : text;
                    await addDoc(collection(db, "notifications"), {
                        recipientId: postData.authorId,
                        actorId: auth.currentUser.uid,
                        actorName: authorName,
                        actorPhoto: authorPhoto,
                        type: 'post_comment',
                        targetId: postId,
                        message: `commented on your post: "${shortText}"`,
                        link: `feeds.html#post-${postId}`,
                        read: false,
                        createdAt: serverTimestamp()
                    });
                }
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
        list.innerHTML = '<span class="text-xs text-outline animate-pulse flex items-center justify-center p-4">Loading replies...</span>';
        try {
            const q = query(collection(db, `posts/${postId}/comments`), orderBy("createdAt", "asc"));
            const snap = await getDocs(q);
            list.innerHTML = snap.empty ? '<span class="text-[10px] text-outline italic flex items-center justify-center p-4">No replies yet. Be the first!</span>' : '';
            
            const commentsData = [];
            const missingUids = new Set();
            snap.forEach(doc => {
                const c = doc.data();
                commentsData.push(c);
                if (c.authorId && !userCache[c.authorId]) missingUids.add(c.authorId);
            });

            if (missingUids.size > 0) {
                await Promise.all(Array.from(missingUids).map(async uid => {
                    try {
                        const uSnap = await getDoc(doc(db, "users", uid));
                        if (uSnap.exists()) userCache[uid] = uSnap.data();
                        else userCache[uid] = { _deleted: true }; 
                    } catch(e) {}
                }));
            }
            
            commentsData.forEach(comment => {
                const authorProfile = userCache[comment.authorId];
                const profileExists = authorProfile && !authorProfile._deleted;
                
                const safeName = escapeHTML(profileExists ? (authorProfile.displayName || 'Unknown Player') : (comment.authorName || 'Unknown Player'));
                const photo = escapeHTML(profileExists ? authorProfile.photoURL : comment.authorPhoto) || getFallbackAvatar(safeName);

                let commentTimeStr = "Just now";
                if (comment.createdAt) {
                    const diff = Date.now() - comment.createdAt.toMillis();
                    const minutes = Math.floor(diff / 60000);
                    const hours = Math.floor(diff / 3600000);
                    if (minutes < 1) commentTimeStr = 'Just now';
                    else if (minutes < 60) commentTimeStr = `${minutes}m ago`;
                    else if (hours < 24) commentTimeStr = `${hours}h ago`;
                    else commentTimeStr = `${Math.floor(hours/24)}d ago`;
                }

                list.innerHTML += `
                    <div class="flex gap-3 items-start mb-4 group">
                        <img src="${photo}" onerror="this.onerror=null; this.src='${getFallbackAvatar(safeName)}';" class="w-8 h-8 rounded-full object-cover border border-outline-variant/30 shrink-0 bg-surface-container cursor-pointer hover:border-primary transition-colors" onclick="window.location.href='profile.html?id=${comment.authorId}'">
                        <div class="bg-surface-container p-3.5 rounded-2xl rounded-tl-none border border-outline-variant/10 text-sm w-full shadow-sm">
                            <div class="flex justify-between items-start mb-1">
                                <span class="font-bold text-on-surface block text-xs cursor-pointer hover:text-primary transition-colors" onclick="window.location.href='profile.html?id=${comment.authorId}'">${safeName}</span>
                                <span class="text-[9px] text-outline ml-2 shrink-0 font-bold uppercase tracking-widest">${commentTimeStr}</span>
                            </div>
                            <span class="text-on-surface-variant leading-relaxed text-sm">${escapeHTML(comment.text)}</span>
                        </div>
                    </div>`;
            });
        } catch (e) { list.innerHTML = '<span class="text-error text-xs p-4 block text-center">Failed to load comments.</span>'; }
    }

    window.openImageModal = function(url) {
        const modal = document.getElementById('image-modal');
        const img = document.getElementById('lightbox-image');
        img.src = url;
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            img.classList.remove('scale-95');
            img.classList.add('scale-100');
        }, 10);
    }

    document.getElementById('close-image-modal')?.addEventListener('click', () => {
        const modal = document.getElementById('image-modal');
        const img = document.getElementById('lightbox-image');
        modal.classList.add('opacity-0');
        img.classList.remove('scale-100');
        img.classList.add('scale-95');
        setTimeout(() => modal.classList.add('hidden'), 300);
    });

    function formatRelativeTime(timestamp) {
        if (!timestamp) return 'Recently';
        const diff = Date.now() - timestamp.toMillis();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days === 1) return 'Yesterday';
        return `${days}d ago`;
    }

    // ==========================================
    // RIGHT SIDEBAR WIDGETS
    // ==========================================

    async function loadUpcomingGames() {
        const container = document.getElementById('upcoming-games-container');
        if (!container) return;
        try {
            // Find games where date is >= today
            const todayStr = new Date().toISOString().split('T')[0];
            const q = query(collection(db, "games"), where("date", ">=", todayStr), orderBy("date", "asc"), limit(3));
            const snapshot = await getDocs(q);
            
            container.innerHTML = snapshot.empty ? '<div class="text-center p-4 bg-surface-container rounded-xl border border-outline-variant/10"><span class="text-xs text-outline italic">No upcoming games found.</span></div>' : '';
            
            snapshot.forEach(doc => {
                const game = doc.data();
                const d = new Date(`${game.date}T${game.time}`);
                const month = d.toLocaleString('default', { month: 'short' });
                const day = d.getDate();
                
                container.innerHTML += `
                    <div class="flex items-center gap-3 p-3 bg-surface-container hover:bg-surface-container-highest rounded-xl border border-outline-variant/10 cursor-pointer transition-colors group" onclick="window.location.href='game-details.html?id=${doc.id}'">
                        <div class="w-12 h-12 rounded-lg bg-[#0a0e14] border border-outline-variant/20 flex flex-col items-center justify-center shrink-0 shadow-inner group-hover:border-primary/50 transition-colors">
                            <span class="text-[9px] text-error font-black uppercase tracking-widest leading-none">${month}</span>
                            <span class="text-lg font-headline font-black text-on-surface leading-none">${day}</span>
                        </div>
                        <div class="flex-1 min-w-0">
                            <h4 class="font-bold text-xs text-on-surface truncate group-hover:text-primary transition-colors">${escapeHTML(game.title)}</h4>
                            <p class="text-[9px] text-outline-variant uppercase tracking-widest mt-0.5 truncate flex items-center gap-1"><span class="material-symbols-outlined text-[10px]">location_on</span> ${escapeHTML(game.location)}</p>
                        </div>
                    </div>`;
            });
        } catch (error) { 
            console.error(error);
            container.innerHTML = '<span class="text-xs text-error">Failed to load games.</span>'; 
        }
    }

    async function loadTopSquads() {
        const container = document.getElementById('top-roster-container');
        if (!container) return;
        try {
            const q = query(collection(db, "squads"));
            const snapshot = await getDocs(q);
            
            let squads = [];
            snapshot.forEach(doc => squads.push({ id: doc.id, ...doc.data() }));
            
            squads.forEach(s => s.squadScore = calculateSquadScore(s));
            squads.sort((a, b) => b.squadScore - a.squadScore);
            
            const top3 = squads.slice(0, 3);
            
            container.innerHTML = top3.length === 0 ? '<div class="text-center p-4 bg-surface-container rounded-xl border border-outline-variant/10"><span class="text-xs text-outline italic">No squads found.</span></div>' : '';
            
            top3.forEach((squad, index) => {
                const rank = (index + 1);
                const rankColor = rank === 1 ? 'text-primary' : 'text-outline-variant/50';
                const safeName = escapeHTML(squad.name);
                const logoUrl = squad.logoUrl ? escapeHTML(squad.logoUrl) : getFallbackLogo(safeName);

                container.innerHTML += `
                    <div class="flex items-center gap-4 p-3 bg-surface-container hover:bg-surface-container-highest rounded-xl border border-outline-variant/10 cursor-pointer transition-colors group" onclick="window.location.href='squad-details.html?id=${squad.id}'">
                        <span class="font-headline font-black italic text-xl ${rankColor} group-hover:text-primary transition-colors w-4 text-center">#${rank}</span>
                        <div class="w-10 h-10 rounded-lg bg-surface-container-highest border border-outline-variant/20 flex items-center justify-center shrink-0 overflow-hidden shadow-inner group-hover:border-primary/50 transition-colors">
                            <img src="${logoUrl}" onerror="this.onerror=null; this.src='${getFallbackLogo(safeName)}';" class="w-full h-full object-cover">
                        </div>
                        <div class="flex-1 min-w-0">
                            <h4 class="font-bold text-xs text-on-surface truncate uppercase group-hover:text-primary transition-colors">${safeName}</h4>
                            <p class="text-[9px] text-outline-variant uppercase font-black tracking-widest mt-0.5">${squad.squadScore} PTS • ${squad.wins || 0} Wins</p>
                        </div>
                    </div>`;
            });
        } catch (error) { container.innerHTML = '<span class="text-xs text-error">Failed to load.</span>'; }
    }

    async function loadRisingTalents() {
        const container = document.getElementById('rising-talents-container');
        if (!container) return;
        try {
            const q = query(collection(db, "users"));
            const snapshot = await getDocs(q);
            
            let players = [];
            snapshot.forEach(doc => players.push({ id: doc.id, ...doc.data() }));
            
            players.forEach(p => p.playerScore = calculatePlayerScore(p));
            players.sort((a, b) => b.playerScore - a.playerScore);
            
            const top3 = players.slice(0, 3);
            
            container.innerHTML = top3.length === 0 ? '<span class="text-xs text-on-surface-variant col-span-3 text-center">No players found.</span>' : '';
            
            top3.forEach(player => {
                const safeName = escapeHTML(player.displayName || 'Unknown');
                const photoUrl = escapeHTML(player.photoURL) || getFallbackAvatar(safeName);
                const shortName = safeName.split(' ').slice(0, 2).join(' ');
                
                container.innerHTML += `
                    <div class="flex flex-col items-center gap-2 cursor-pointer group" onclick="window.location.href='profile.html?id=${player.id}'">
                        <div class="w-16 h-16 md:w-20 md:h-20 rounded-2xl overflow-hidden border-2 border-outline-variant/20 group-hover:border-secondary transition-colors bg-surface-container relative shadow-sm">
                            <img src="${photoUrl}" onerror="this.onerror=null; this.src='${getFallbackAvatar(safeName)}';" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300">
                            <div class="absolute inset-0 bg-gradient-to-t from-[#0a0e14] to-transparent opacity-60"></div>
                            <span class="absolute bottom-1 right-1 bg-secondary text-white text-[8px] font-black px-1.5 rounded uppercase">${player.playerScore}</span>
                        </div>
                        <span class="text-[10px] font-black text-on-surface uppercase tracking-widest truncate w-full text-center group-hover:text-secondary transition-colors">${shortName}</span>
                    </div>`;
            });
        } catch (error) { container.innerHTML = '<span class="text-xs text-error col-span-3 text-center">Failed to load.</span>'; }
    }


    // ==========================================
    // MAIN FEED RENDER LOOP
    // ==========================================
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

            if (!isLoadMore) feedContainer.innerHTML = '';

            if (snapshot.empty) {
                hasMorePosts = false;
                if (!isLoadMore) {
                    feedContainer.innerHTML = `
                        <div class="flex flex-col items-center justify-center py-20 text-center text-outline-variant bg-surface-container-low rounded-3xl border border-outline-variant/10 shadow-sm">
                            <span class="material-symbols-outlined text-6xl mb-4 opacity-50 drop-shadow-md">forum</span>
                            <p class="text-xl font-headline font-black uppercase tracking-widest text-on-surface">No posts yet</p>
                            <p class="text-xs mt-2 max-w-xs">Be the first to share an update, a highlight, or invite players to a game!</p>
                        </div>
                    `;
                } else {
                    const endMsg = document.createElement('div');
                    endMsg.className = "text-center text-outline-variant text-[10px] py-6 uppercase tracking-widest font-bold flex items-center justify-center gap-2";
                    endMsg.innerHTML = '<span class="w-8 h-[1px] bg-outline-variant/30"></span> End of Feed <span class="w-8 h-[1px] bg-outline-variant/30"></span>';
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

            const postsData = [];
            const missingUids = new Set();
            const missingGameIds = new Set();

            snapshot.forEach(doc => {
                const data = { id: doc.id, ...doc.data() };
                postsData.push(data);
                if (data.authorId && !userCache[data.authorId]) missingUids.add(data.authorId);
                if (data.type === 'game_promo' && data.gameId) missingGameIds.add(data.gameId);
            });

            if (missingUids.size > 0) {
                await Promise.all(Array.from(missingUids).map(async uid => {
                    try {
                        const uSnap = await getDoc(doc(db, "users", uid));
                        if (uSnap.exists()) userCache[uid] = uSnap.data();
                        else userCache[uid] = { _deleted: true }; 
                    } catch(e) {}
                }));
            }

            const gameCache = {};
            if (missingGameIds.size > 0) {
                await Promise.all(Array.from(missingGameIds).map(async gid => {
                    try {
                        const gSnap = await getDoc(doc(db, "games", gid));
                        if (gSnap.exists()) gameCache[gid] = gSnap.data();
                    } catch(e) {}
                }));
            }

            postsData.forEach(post => {
                const authorProfile = userCache[post.authorId];
                const profileExists = authorProfile && !authorProfile._deleted;
                
                const safeName = escapeHTML(profileExists ? (authorProfile.displayName || 'Unknown Player') : (post.authorName || 'Unknown Player'));
                const photoUrl = escapeHTML(profileExists ? authorProfile.photoURL : post.authorPhoto) || getFallbackAvatar(safeName);
                
                const rawPos = profileExists ? (authorProfile.primaryPosition || "UNASSIGNED") : (post.authorPosition || "UNASSIGNED");
                const fullPos = getFullPosition(rawPos);
                const activeSquadAbbr = profileExists ? authorProfile.squadAbbr : post.authorSquadAbbr;
                const squadTag = activeSquadAbbr ? `[${escapeHTML(activeSquadAbbr)}] ` : '';
                
                const roleDisplay = `${squadTag}${fullPos}`.toUpperCase();
                const safeContent = escapeHTML(post.content);

                const absTimeStr = formatRelativeTime(post.createdAt);

                let visIcon = 'public';
                if (post.visibility === 'Connections Only') visIcon = 'group';
                if (post.visibility === 'Squad Only') visIcon = 'shield';
                if (post.visibility === 'Leagues') visIcon = 'emoji_events';

                const card = document.createElement('article');
                card.id = `post-${post.id}`;
                card.className = 'bg-surface-container-low rounded-3xl p-5 md:p-6 border border-outline-variant/10 shadow-md transition-all relative overflow-hidden';

                // EDGE-TO-EDGE IMAGE RENDER
                let imageHtml = post.imageUrl ? `
                    <div class="-mx-5 md:-mx-6 mt-4 mb-4 bg-[#0a0e14] relative group cursor-pointer border-y border-outline-variant/10" onclick="window.openImageModal('${escapeHTML(post.imageUrl)}')">
                        <img src="${escapeHTML(post.imageUrl)}" alt="Post image" class="w-full max-h-[500px] object-cover">
                        <div class="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                            <span class="material-symbols-outlined text-white text-5xl opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-xl scale-90 group-hover:scale-100">zoom_in</span>
                        </div>
                    </div>` : '';
                
                let joinGameHtml = '';
                if (post.type === 'game_promo') {
                    const dest = post.gameId ? `game-details.html?id=${post.gameId}` : `listings.html`;
                    
                    let buttonText = "JOIN MATCHUP";
                    let buttonStyle = "bg-primary text-on-primary-container shadow-[0_0_20px_rgba(255,143,111,0.3)] hover:brightness-110";

                    if (post.gameId && gameCache[post.gameId]) {
                        const gameInfo = gameCache[post.gameId];
                        const players = gameInfo.players || [];
                        
                        let myName = "Unknown Player";
                        if (currentUserData && currentUserData.uid) {
                            myName = currentUserData.uid; // We use UID now
                        }

                        if (players.includes(myName)) {
                            buttonText = "VIEW MATCHUP";
                            buttonStyle = "bg-surface-container-highest border border-outline-variant/30 text-on-surface hover:bg-surface-bright";
                        } else if (gameInfo.spotsFilled >= gameInfo.spotsTotal) {
                            buttonText = "MATCH FULL - VIEW";
                            buttonStyle = "bg-surface-container border border-outline-variant/10 text-outline hover:bg-surface-container-highest";
                        }
                        
                        const gameStart = new Date(`${gameInfo.date}T${gameInfo.time}`);
                        const gameEnd = new Date(gameStart.getTime() + (2 * 60 * 60 * 1000));
                        const now = new Date();
                        if (now > gameEnd || (now >= gameStart && now <= gameEnd)) {
                            buttonText = "VIEW MATCHUP";
                            buttonStyle = "bg-surface-container border border-outline-variant/10 text-outline hover:bg-surface-container-highest";
                        }
                    }

                    joinGameHtml = `
                    <div class="mt-4 mb-2">
                        <button onclick="window.location.href='${dest}'" class="w-full flex items-center justify-center gap-2 transition-all py-3.5 rounded-xl font-black uppercase text-xs tracking-widest active:scale-95 ${buttonStyle}">
                            <span class="material-symbols-outlined text-[18px]">sports_basketball</span> ${buttonText}
                        </button>
                    </div>`;
                }

                const likedArray = post.likedBy || [];
                const isLiked = auth.currentUser && likedArray.includes(auth.currentUser.uid);
                const heartStyle = isLiked ? "'FILL' 1" : "'FILL' 0";
                const heartColor = isLiked ? "text-primary" : "text-outline-variant hover:text-on-surface";

                const isAdmin = currentUserData && currentUserData.accountType === 'Administrator';
                const isAuthor = auth.currentUser && post.authorId === auth.currentUser.uid;
                
                let deleteBtnHtml = '';
                if (isAuthor || isAdmin) {
                    const btnColor = isAdmin && !isAuthor ? 'text-error hover:bg-error/10' : 'text-outline-variant hover:bg-surface-container-highest hover:text-on-surface';
                    const btnIcon = isAdmin && !isAuthor ? 'admin_panel_settings' : 'delete';
                    
                    deleteBtnHtml = `
                        <button onclick="window.deletePost('${post.id}')" class="p-2 -mr-2 rounded-full transition-colors ${btnColor}" title="${isAdmin && !isAuthor ? 'Admin Delete' : 'Delete Post'}">
                            <span class="material-symbols-outlined text-[18px]">${btnIcon}</span>
                        </button>
                    `;
                }

                card.innerHTML = `
                    <div class="flex items-start justify-between mb-4">
                        <div class="flex items-center gap-3 cursor-pointer group" onclick="window.location.href='profile.html?id=${post.authorId}'">
                            <div class="w-12 h-12 rounded-full overflow-hidden border-2 border-outline-variant/30 shrink-0 bg-surface-container group-hover:border-primary transition-colors shadow-sm">
                                <img src="${photoUrl}" onerror="this.onerror=null; this.src='${getFallbackAvatar(safeName)}';" alt="${safeName}" class="w-full h-full object-cover">
                            </div>
                            <div>
                                <h4 class="font-bold text-base text-on-surface group-hover:text-primary transition-colors leading-tight mb-0.5">${safeName}</h4>
                                <div class="flex items-center gap-2">
                                    <span class="text-[9px] text-outline font-bold uppercase tracking-widest">${absTimeStr}</span>
                                    <span class="w-1 h-1 rounded-full bg-outline-variant/30"></span>
                                    <span class="text-[9px] font-black uppercase tracking-widest text-secondary">${roleDisplay}</span>
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            ${post.location ? `<span class="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container text-outline-variant text-[9px] font-bold uppercase tracking-widest border border-outline-variant/20"><span class="material-symbols-outlined text-[12px]">location_on</span> ${escapeHTML(post.location)}</span>` : ''}
                            <span class="material-symbols-outlined text-[16px] text-outline-variant" title="Visibility: ${escapeHTML(post.visibility || 'Public')}">${visIcon}</span>
                            ${deleteBtnHtml}
                        </div>
                    </div>
                    
                    ${post.location ? `<div class="sm:hidden mb-3"><span class="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container text-outline-variant text-[9px] font-bold uppercase tracking-widest border border-outline-variant/20"><span class="material-symbols-outlined text-[12px]">location_on</span> ${escapeHTML(post.location)}</span></div>` : ''}
                    
                    <p class="text-sm md:text-base text-on-surface mb-3 whitespace-pre-wrap leading-relaxed">${safeContent}</p>
                    
                    ${imageHtml}
                    ${joinGameHtml}

                    <div class="flex items-center gap-2 mt-4 pt-4 border-t border-outline-variant/10 bg-surface-container-low rounded-b-3xl -mx-5 md:-mx-6 -mb-5 md:-mb-6 px-5 md:px-6 py-3">
                        <button onclick="toggleLike('${post.id}', this)" class="flex items-center justify-center gap-2 flex-1 hover:bg-surface-container-highest py-2 rounded-xl transition-colors font-black uppercase text-xs tracking-widest ${heartColor} active:scale-95">
                            <span class="material-symbols-outlined text-[20px]" style="font-variation-settings: ${heartStyle}">favorite</span>
                            <span class="like-count">${likedArray.length}</span>
                        </button>
                        <div class="w-px h-6 bg-outline-variant/20"></div>
                        <button onclick="toggleComments('${post.id}')" class="flex items-center justify-center gap-2 flex-1 hover:bg-surface-container-highest py-2 rounded-xl transition-colors font-black uppercase text-xs tracking-widest text-outline-variant hover:text-on-surface active:scale-95">
                            <span class="material-symbols-outlined text-[20px]">chat_bubble</span>
                            <span id="comment-count-${post.id}">${post.commentsCount || 0}</span>
                        </button>
                    </div>
                    
                    <div id="comment-section-${post.id}" class="hidden mt-6 pt-4 border-t border-outline-variant/10">
                        <div id="comment-list-${post.id}" class="space-y-4 mb-4 max-h-64 overflow-y-auto custom-scrollbar pr-2"></div>
                        <div class="flex gap-3">
                            <input type="text" id="comment-input-${post.id}" placeholder="Write a reply..." class="flex-1 bg-[#0a0e14] border border-outline-variant/30 rounded-xl px-4 py-2.5 text-sm text-on-surface focus:border-primary focus:ring-1 focus:outline-none transition-colors">
                            <button onclick="submitComment('${post.id}')" class="bg-primary text-on-primary-container px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest active:scale-95 transition-transform shadow-md hover:brightness-110 flex items-center justify-center">
                                <span class="material-symbols-outlined text-[18px]">send</span>
                            </button>
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
