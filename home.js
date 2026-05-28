import { auth, db, storage } from './firebase-setup.js';
import { doc, getDoc, collection, query, orderBy, getDocs, deleteDoc, onSnapshot, where, addDoc, serverTimestamp, updateDoc, arrayRemove, arrayUnion, limit, startAfter } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";

// --- UTILITY FUNCTIONS ---
function getFallbackAvatar(name) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'P')}&background=161618&color=ff751f`;
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

function formatDateTime(timestamp) {
    if (!timestamp) return 'RECENTLY';
    const date = typeof timestamp.toDate === 'function' ? timestamp.toDate() : new Date(timestamp);
    const formatter = new Intl.DateTimeFormat('en-US', {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
    });
    const parts = formatter.formatToParts(date);
    
    let rawMonth = parts.find(p => p.type === 'month')?.value || '';
    let month = rawMonth.charAt(0).toUpperCase() + rawMonth.slice(1).toLowerCase();
    let day = parts.find(p => p.type === 'day')?.value || '';
    let hour = (parts.find(p => p.type === 'hour')?.value || '').padStart(2, '0');
    let minute = parts.find(p => p.type === 'minute')?.value || '';
    let dayPeriod = parts.find(p => p.type === 'dayPeriod')?.value.toUpperCase() || '';
    
    let absoluteStr = `${month} ${day} ${hour}:${minute}${dayPeriod}`;

    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    let relativeStr = '';
    if (minutes < 1) relativeStr = 'JUST NOW';
    else if (minutes < 60) relativeStr = `${minutes}M AGO`;
    else if (hours < 24) relativeStr = `${hours}H AGO`;
    else if (days === 1) relativeStr = 'YESTERDAY';
    else relativeStr = `${days}D AGO`;

    return `${absoluteStr} • ${relativeStr}`;
}

function showToast(message, isError = false) {
    const toast = document.createElement('div');
    toast.className = `fixed bottom-20 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 rounded-full shadow-lg font-bold text-xs uppercase tracking-widest transition-all duration-300 transform translate-y-10 opacity-0 ${isError ? 'bg-red-500 text-white' : 'bg-white dark:bg-[#14171d] text-[#ff751f] border border-[#ff751f]/20'}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-10', 'opacity-0');
    });

    setTimeout(() => {
        toast.classList.add('translate-y-10', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

document.addEventListener('DOMContentLoaded', () => {
    
    // ==========================================
    // THEME TOGGLE LOGIC
    // ==========================================
    const themeBtn = document.getElementById('theme-toggle-btn');
    const themeIcon = document.getElementById('theme-toggle-icon');
    const htmlEl = document.documentElement;

    function applyTheme(isDark) {
        if (isDark) {
            htmlEl.classList.add('dark');
            if(themeIcon) themeIcon.textContent = 'light_mode';
            localStorage.theme = 'dark';
        } else {
            htmlEl.classList.remove('dark');
            if(themeIcon) themeIcon.textContent = 'dark_mode';
            localStorage.theme = 'light';
        }
    }

    if (localStorage.theme === 'light') {
        applyTheme(false);
    } else {
        applyTheme(true); 
    }

    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            const isCurrentlyDark = htmlEl.classList.contains('dark');
            applyTheme(!isCurrentlyDark);
        });
    }

    // ==========================================
    // CORE USER & AUTH LOGIC
    // ==========================================
    const newsContainer = document.getElementById('official-news-container');
    const feedContainer = document.getElementById('feed-container');

    let currentUserData = null;
    let unsubscribeProfile = null;
    let unsubscribeNotifs = null;
    const userCache = {};

    onAuthStateChanged(auth, (user) => {
        if (user) {
            const immediateAvatar = user.photoURL || getFallbackAvatar(user.displayName || 'Jon Marco C. Odoño');
            const postAvatarPreload = document.getElementById('current-user-avatar');
            if (postAvatarPreload) postAvatarPreload.src = immediateAvatar;

            unsubscribeProfile = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
                if (docSnap.exists()) {
                    currentUserData = docSnap.data();
                    userCache[user.uid] = currentUserData;
                    
                    const finalAvatar = currentUserData.photoURL || user.photoURL || getFallbackAvatar(currentUserData.displayName);
                    const postAvatar = document.getElementById('current-user-avatar');
                    if (postAvatar) postAvatar.src = finalAvatar;
                }
            });

            const notifQ = query(collection(db, "notifications"), where("recipientId", "==", user.uid), where("read", "==", false));
            unsubscribeNotifs = onSnapshot(notifQ, (snap) => {
                const badge = document.getElementById('nav-notif-badge');
                if (badge) {
                    if (!snap.empty) {
                        badge.classList.remove('hidden');
                    } else {
                        badge.classList.add('hidden');
                    }
                }
            });

        } else {
            currentUserData = null;
            if (unsubscribeProfile) unsubscribeProfile();
            if (unsubscribeNotifs) unsubscribeNotifs();
            window.location.href = "index.html"; 
        }
        
        loadSliderItems();
        loadOfficialNews();
        loadPosts(false);
        setupLightbox();
        setupPostFeed();
    });

    // ==========================================
    // DYNAMIC IMAGE SLIDER LOGIC
    // ==========================================
    const sliderContainer = document.getElementById('dynamic-slider-container');
    const sliderTrack = document.getElementById('slider-track');
    const sliderLoader = document.getElementById('slider-loader');
    const sliderDots = document.getElementById('slider-dots');
    const btnPrev = document.getElementById('slider-prev');
    const btnNext = document.getElementById('slider-next');
    
    let slideInterval;
    let currentSlideIndex = 0;
    let totalSlides = 0;
    let isSliderPaused = false; 
    let isProgrammaticScroll = false; 

    function loadSliderItems() {
        if (!sliderTrack) return;
        
        try {
            const q = query(collection(db, "slider_items"), orderBy("createdAt", "desc"));
            onSnapshot(q, (snap) => {
                if (snap.empty) {
                    sliderTrack.innerHTML = `
                        <div class="w-full h-full flex-none snap-center relative overflow-hidden">
                            <img src="https://images.unsplash.com/photo-1519861531473-9200262188bf?q=80&w=2071&auto=format&fit=crop" class="absolute inset-0 w-full h-full object-cover blur-2xl opacity-40 scale-110 z-0 pointer-events-none">
                            <img src="https://images.unsplash.com/photo-1519861531473-9200262188bf?q=80&w=2071&auto=format&fit=crop" class="absolute inset-0 w-full h-full object-contain md:object-cover object-center md:object-[center_right] z-10 pointer-events-none">
                            
                            <div class="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-white via-white/80 dark:from-[#0a0e14] dark:via-[#0a0e14]/80 to-transparent md:hidden z-20 pointer-events-none transition-colors duration-300"></div>
                            <div class="hidden md:block absolute inset-y-0 left-0 w-3/5 bg-gradient-to-r from-white via-white/80 dark:from-[#0a0e14] dark:via-[#0a0e14]/80 to-transparent z-20 pointer-events-none transition-colors duration-300"></div>

                            <div class="relative z-30 px-5 pb-6 pt-32 md:px-10 md:pb-10 flex flex-col justify-end h-full">
                                <h1 class="font-headline text-3xl md:text-5xl font-black italic uppercase tracking-tighter text-gray-900 dark:text-white leading-[1.05] mb-2 drop-shadow-md dark:drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)] transition-colors duration-300">Welcome to Liga PH</h1>
                                <p class="text-gray-700 dark:text-gray-200 text-xs md:text-sm font-medium mb-4 drop-shadow-sm dark:drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] transition-colors duration-300">Your premier basketball community platform.</p>
                            </div>
                        </div>
                    `;
                    sliderLoader.classList.add('hidden');
                    sliderTrack.classList.remove('opacity-0');
                    return;
                }

                let slidesHtml = '';
                let dotsHtml = '';
                totalSlides = snap.size;
                let index = 0;

                snap.forEach(docSnap => {
                    const data = docSnap.data();
                    const isActiveDot = index === 0 ? 'bg-[#ff751f] w-6' : 'bg-gray-400 dark:bg-white/20 w-2';
                    const iconToUse = data.tagIcon || 'local_fire_department'; 

                    let actionButton = '';
                    if (data.linkUrl && data.linkText) {
                        actionButton = `
                            <button onclick="window.location.href='${escapeHTML(data.linkUrl)}'" class="w-max bg-[#ff751f] text-gray-900 hover:brightness-110 px-5 py-2.5 md:px-6 md:py-3 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg flex items-center gap-2 mt-2">
                                ${escapeHTML(data.linkText)} <span class="material-symbols-outlined text-[14px] md:text-[16px]">arrow_forward</span>
                            </button>
                        `;
                    }

                    slidesHtml += `
                        <div class="w-full h-full flex-none snap-center relative overflow-hidden" data-index="${index}">
                            
                            <img src="${escapeHTML(data.imageUrl)}" class="absolute inset-0 w-full h-full object-cover blur-2xl opacity-40 scale-110 z-0 pointer-events-none">
                            <img src="${escapeHTML(data.imageUrl)}" class="absolute inset-0 w-full h-full object-contain md:object-cover object-center md:object-[center_right] z-10 pointer-events-none">
                            
                            <div class="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-white via-white/80 dark:from-[#0a0e14] dark:via-[#0a0e14]/80 to-transparent md:hidden z-20 pointer-events-none transition-colors duration-300"></div>
                            <div class="hidden md:block absolute inset-y-0 left-0 w-3/5 bg-gradient-to-r from-white via-white/80 dark:from-[#0a0e14] dark:via-[#0a0e14]/80 to-transparent z-20 pointer-events-none transition-colors duration-300"></div>
                            
                            <div class="relative z-30 px-5 pb-6 pt-32 md:px-10 md:pb-10 flex flex-col justify-end h-full w-full md:w-2/3">
                                <div class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#ff751f]/10 dark:bg-[#ff751f]/20 border border-[#ff751f]/30 rounded-full shadow-sm w-max mb-3 backdrop-blur-sm">
                                    <span class="material-symbols-outlined text-[12px] md:text-[14px] text-[#ff751f]">${escapeHTML(iconToUse)}</span>
                                    <span class="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-[#ff751f]">${escapeHTML(data.tag || 'Featured')}</span>
                                </div>
                                <h1 class="font-headline text-3xl md:text-5xl font-black italic uppercase tracking-tighter text-gray-900 dark:text-white leading-[1.05] mb-2 drop-shadow-md dark:drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)] transition-colors duration-300">
                                    ${escapeHTML(data.title)}
                                </h1>
                                <p class="text-gray-700 dark:text-gray-200 text-xs md:text-sm font-medium line-clamp-2 md:line-clamp-3 mb-4 drop-shadow-sm dark:drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] transition-colors duration-300">
                                    ${escapeHTML(data.subtitle)}
                                </p>
                                ${actionButton}
                            </div>
                        </div>
                    `;

                    dotsHtml += `<button class="slider-dot h-2 rounded-full transition-all duration-300 ${isActiveDot}" data-index="${index}"></button>`;
                    index++;
                });

                sliderTrack.innerHTML = slidesHtml;
                sliderDots.innerHTML = dotsHtml;
                
                sliderLoader.classList.add('hidden');
                sliderTrack.classList.remove('opacity-0');

                setupSliderControls();
            });

        } catch (e) {
            console.error("Error loading slider", e);
            sliderLoader.innerHTML = '<p class="text-red-500 text-xs font-bold text-center mt-4">Failed to load featured content.</p>';
            sliderLoader.classList.remove('animate-pulse');
        }
    }

    function setupSliderControls() {
        if (totalSlides <= 1) {
            btnPrev.classList.add('hidden');
            btnNext.classList.add('hidden');
            sliderDots.classList.add('hidden');
            return;
        }

        const updateDots = (activeIndex) => {
            document.querySelectorAll('.slider-dot').forEach((dot, idx) => {
                if (idx === activeIndex) {
                    dot.className = 'slider-dot h-2 rounded-full transition-all duration-300 bg-[#ff751f] w-6 shadow-[0_0_10px_rgba(255,117,31,0.5)]';
                } else {
                    dot.className = 'slider-dot h-2 rounded-full transition-all duration-300 bg-gray-400 dark:bg-white/20 w-2 hover:bg-gray-600 dark:hover:bg-white/40';
                }
            });
        };

        const startAutoplay = () => {
            clearInterval(slideInterval);
            slideInterval = setInterval(() => {
                if (!isSliderPaused) {
                    let next = currentSlideIndex + 1;
                    if (next >= totalSlides) next = 0;
                    goToSlide(next);
                }
            }, 5000); 
        };

        const goToSlide = (index) => {
            if (index < 0) index = totalSlides - 1;
            if (index >= totalSlides) index = 0;
            currentSlideIndex = index;
            
            const slideWidth = sliderTrack.clientWidth;
            
            isProgrammaticScroll = true;
            sliderTrack.scrollTo({ left: slideWidth * currentSlideIndex, behavior: 'smooth' });
            updateDots(currentSlideIndex);
            
            setTimeout(() => { isProgrammaticScroll = false; }, 600);
            startAutoplay();
        };

        btnPrev.addEventListener('click', () => goToSlide(currentSlideIndex - 1));
        btnNext.addEventListener('click', () => goToSlide(currentSlideIndex + 1));

        document.querySelectorAll('.slider-dot').forEach(dot => {
            dot.addEventListener('click', (e) => {
                goToSlide(parseInt(e.target.dataset.index));
            });
        });

        sliderTrack.addEventListener('scroll', () => {
            if (isProgrammaticScroll) return;
            
            const slideWidth = sliderTrack.clientWidth;
            const scrollLeft = sliderTrack.scrollLeft;
            const newIndex = Math.round(scrollLeft / slideWidth);
            
            if (newIndex !== currentSlideIndex) {
                currentSlideIndex = newIndex;
                updateDots(currentSlideIndex);
                startAutoplay();
            }
        });

        if (sliderContainer) {
            sliderContainer.addEventListener('mouseenter', () => isSliderPaused = true);
            sliderContainer.addEventListener('mouseleave', () => isSliderPaused = false);
            sliderContainer.addEventListener('touchstart', () => isSliderPaused = true, { passive: true });
            sliderContainer.addEventListener('touchend', () => {
                setTimeout(() => isSliderPaused = false, 2000); 
            }, { passive: true });
        }

        startAutoplay();
    }

    // ==========================================
    // COMMUNITY FEEDS LOGIC
    // ==========================================
    let lastVisiblePost = null;
    let isFetchingPosts = false;
    let hasMorePosts = true;
    const POSTS_PER_PAGE = 10;
    const loadingIndicator = document.getElementById('feed-loading-indicator');

    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !isFetchingPosts && hasMorePosts) {
            loadPosts(true); 
        }
    }, { rootMargin: '200px' });

    if (loadingIndicator) observer.observe(loadingIndicator);

    function setupPostFeed() {
        // --- ADDED: TOGGLE LOGIC FOR POST CREATION ---
        const togglePostBtn = document.getElementById('toggle-post-btn');
        const createPostContainer = document.getElementById('create-post-container');

        if (togglePostBtn && createPostContainer) {
            togglePostBtn.onclick = (e) => {
                e.preventDefault();
                const isHidden = createPostContainer.classList.contains('hidden');
                const icon = togglePostBtn.querySelector('.material-symbols-outlined');
                
                if (isHidden) {
                    createPostContainer.classList.remove('hidden');
                    if (icon) icon.textContent = 'close';
                } else {
                    createPostContainer.classList.add('hidden');
                    if (icon) icon.textContent = 'add';
                }
            };
        }

        const form = document.getElementById('create-post-form');
        const contentInput = document.getElementById('post-content');
        const locationBtn = document.getElementById('add-location-btn');
        const locationInput = document.getElementById('post-location-input');
        const imageInput = document.getElementById('post-image-input');
        const imagePreviewContainer = document.getElementById('post-image-preview-container');
        const imagePreview = document.getElementById('post-image-preview');
        const removeImageBtn = document.getElementById('remove-post-image-btn');
        const submitBtn = document.getElementById('submit-post-btn');

        if (locationBtn && locationInput) {
            locationBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (!locationInput.classList.contains('hidden')) {
                    locationInput.classList.add('hidden');
                    locationInput.value = '';
                    locationBtn.classList.remove('text-[#ff751f]', 'bg-[#ff751f]/10');
                    return;
                }
                
                locationInput.classList.remove('hidden');
                locationInput.placeholder = "Locating (or type manually)...";
                locationInput.disabled = false; 
                locationBtn.classList.add('text-[#ff751f]', 'bg-[#ff751f]/10');
                
                const icon = locationBtn.querySelector('span');
                const originalIcon = icon ? icon.textContent : 'location_on';
                if (icon) {
                    icon.textContent = 'refresh';
                    icon.classList.add('animate-spin');
                }

                setTimeout(() => {
                    if ("geolocation" in navigator) {
                        navigator.geolocation.getCurrentPosition(async (position) => {
                            const lat = position.coords.latitude;
                            const lon = position.coords.longitude;
                            
                            try {
                                const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
                                const data = await res.json();
                                
                                let locName = "Current Location";
                                if (data.address) {
                                    locName = data.address.city || data.address.town || data.address.village || data.address.suburb || data.display_name.split(',')[0];
                                }
                                
                                if (locationInput.value.trim() === '') {
                                    locationInput.value = locName;
                                }
                            } catch (err) {
                                locationInput.placeholder = "Add location manually...";
                                if (locationInput.value.trim() === '') showToast("Network error. Type it manually.", true);
                            } finally {
                                if(icon) {
                                    icon.classList.remove('animate-spin');
                                    icon.textContent = originalIcon;
                                }
                            }
                        }, (error) => {
                            locationInput.placeholder = "Add location manually...";
                            if(icon) {
                                icon.classList.remove('animate-spin');
                                icon.textContent = originalIcon;
                            }
                            if (locationInput.value.trim() === '') showToast("Location blocked. Type it manually.", true);
                        }, { timeout: 10000, maximumAge: 60000 }); 
                    } else {
                        locationInput.placeholder = "Add location manually...";
                        if(icon) {
                            icon.classList.remove('animate-spin');
                            icon.textContent = originalIcon;
                        }
                    }
                }, 300); 
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

        if (form && submitBtn) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const content = contentInput.value.trim();
                const location = locationInput ? locationInput.value.trim() : '';
                const visibility = document.getElementById('post-visibility') ? document.getElementById('post-visibility').value : 'Public';

                if (!content && !selectedImageFile) return showToast("Add some text or an image.", true);
                if (!auth.currentUser) return showToast("Please log in to post.", true);

                submitBtn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[20px]">sync</span>';
                submitBtn.disabled = true;

                try {
                    let imageUrl = null;
                    if (selectedImageFile) {
                        const safeName = selectedImageFile.name.replace(/[^a-zA-Z0-9.]/g, '_');
                        const storageRef = ref(storage, `post_images/${Date.now()}_${safeName}`);
                        const uploadTask = await uploadBytesResumable(storageRef, selectedImageFile);
                        imageUrl = await getDownloadURL(uploadTask.ref);
                    }

                    const postData = {
                        content: content,
                        location: location,
                        imageUrl: imageUrl,
                        visibility: visibility,
                        authorId: auth.currentUser.uid,
                        authorName: currentUserData?.displayName || auth.currentUser.displayName || "Jon Marco C. Odoño",
                        authorPhoto: currentUserData?.photoURL || auth.currentUser.photoURL || null,
                        authorPosition: currentUserData?.primaryPosition || "UNASSIGNED",
                        authorSquadAbbr: currentUserData?.squadAbbr || null, 
                        createdAt: serverTimestamp(),
                        likedBy: [],
                        commentsCount: 0
                    };

                    await addDoc(collection(db, "posts"), postData);

                    contentInput.value = '';
                    if(locationInput) { 
                        locationInput.value = ''; 
                        locationInput.classList.add('hidden'); 
                        if(locationBtn) locationBtn.classList.remove('text-[#ff751f]', 'bg-[#ff751f]/10');
                    }
                    if(removeImageBtn) removeImageBtn.click();
                    
                    showToast("Post created!");
                    
                    // Reset container back to hidden after posting
                    if (createPostContainer && togglePostBtn) {
                        createPostContainer.classList.add('hidden');
                        const icon = togglePostBtn.querySelector('.material-symbols-outlined');
                        if (icon) icon.textContent = 'add';
                    }

                    loadPosts(false); 
                } catch (error) {
                    showToast("Failed to post. Try again.", true);
                } finally {
                    submitBtn.innerHTML = '<span class="material-symbols-outlined text-[20px]">send</span>';
                    submitBtn.disabled = false;
                }
            });
        }
    }

    window.deletePost = async function(postId) {
        if (!auth.currentUser) return;
        if (confirm("Delete this post? This action cannot be undone.")) {
            try {
                await deleteDoc(doc(db, "posts", postId));
                const postElement = document.getElementById(`post-${postId}`);
                if (postElement) postElement.remove();
                showToast("Post deleted");
            } catch (error) {
                showToast("Failed to delete post.", true);
            }
        }
    };

    window.toggleLike = async function(postId, btnElement) {
        if (!auth.currentUser) return showToast("Log in to like posts", true);
        if (btnElement.disabled) return;
        btnElement.disabled = true;

        const iconSpan = btnElement.querySelector('span');
        const countSpan = btnElement.querySelector('.like-count');
        let currentLikes = parseInt(countSpan.textContent) || 0;
        
        const isLiked = iconSpan.classList.contains('text-[#ff751f]');
        const postRef = doc(db, "posts", postId);

        if (isLiked) {
            iconSpan.style.fontVariationSettings = "'FILL' 0";
            iconSpan.classList.remove('text-[#ff751f]');
            iconSpan.classList.add('text-gray-400', 'dark:text-gray-500');
            countSpan.textContent = Math.max(0, currentLikes - 1);
        } else {
            iconSpan.style.fontVariationSettings = "'FILL' 1";
            iconSpan.classList.add('text-[#ff751f]');
            iconSpan.classList.remove('text-gray-400', 'dark:text-gray-500');
            countSpan.textContent = currentLikes + 1;
        }

        try {
            if (isLiked) {
                await updateDoc(postRef, { likedBy: arrayRemove(auth.currentUser.uid) });
            } else {
                await updateDoc(postRef, { likedBy: arrayUnion(auth.currentUser.uid) });
                getDoc(postRef).then(postSnap => {
                    const postData = postSnap.data();
                    if (postData && postData.authorId && postData.authorId !== auth.currentUser.uid) {
                        addDoc(collection(db, "notifications"), {
                            recipientId: postData.authorId,
                            actorId: auth.currentUser.uid,
                            actorName: auth.currentUser.displayName || currentUserData?.displayName || "Someone",
                            actorPhoto: auth.currentUser.photoURL || currentUserData?.photoURL || null,
                            type: 'post_like',
                            targetId: postId,
                            message: `liked your post.`,
                            link: `home.html#post-${postId}`,
                            read: false,
                            createdAt: serverTimestamp()
                        });
                    }
                }).catch(e => {}); 
            }
        } catch(err) {
            console.error("Error toggling like:", err);
            showToast("Failed to update like", true);
        } finally {
            btnElement.disabled = false;
        }
    };

    window.toggleComments = async function(postId) {
        const section = document.getElementById(`comment-section-${postId}`);
        section.classList.toggle('hidden');
        if (!section.classList.contains('hidden')) loadCommentsForPost(postId);
    };

    window.sharePost = async function(postId) {
        const url = window.location.origin + window.location.pathname + '#post-' + postId;
        if (navigator.share) {
            try { await navigator.share({ title: 'Liga PH Update', url: url }); } catch (err) {}
        } else {
            navigator.clipboard.writeText(url);
            showToast("Link copied to clipboard!");
        }
    };

    window.submitComment = async function(postId, btnElement) {
        if (!auth.currentUser) return showToast("Log in to reply", true);
        const input = document.getElementById(`comment-input-${postId}`);
        const text = input.value.trim();
        if (!text) return;

        if (btnElement.disabled) return;
        
        input.disabled = true;
        btnElement.disabled = true;
        const originalIcon = btnElement.innerHTML;
        btnElement.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">sync</span>';

        try {
            let authorName = currentUserData?.displayName || auth.currentUser.displayName || "Jon Marco C. Odoño";
            let authorPhoto = currentUserData?.photoURL || auth.currentUser.photoURL || null;
            
            await addDoc(collection(db, `posts/${postId}/comments`), {
                text: text,
                authorId: auth.currentUser.uid,
                authorName: authorName,
                authorPhoto: authorPhoto,
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
        } catch (error) {
            showToast("Failed to post comment", true);
        } finally {
            input.disabled = false;
            btnElement.disabled = false;
            btnElement.innerHTML = originalIcon;
        }
    };

    async function loadCommentsForPost(postId) {
        const list = document.getElementById(`comment-list-${postId}`);
        list.innerHTML = '<span class="text-[11px] text-gray-500 animate-pulse flex items-center justify-center p-4">Loading replies...</span>';
        try {
            const q = query(collection(db, `posts/${postId}/comments`), orderBy("createdAt", "asc"));
            const snap = await getDocs(q);
            
            if (snap.empty) {
                list.innerHTML = '<span class="text-[10px] text-gray-500 italic flex items-center justify-center p-4">No replies yet. Be the first!</span>';
                return;
            }
            
            let commentsHtml = '';
            snap.forEach(doc => {
                const comment = doc.data();
                const safeName = escapeHTML(comment.authorName || 'Unknown Player');
                const photo = escapeHTML(comment.authorPhoto) || getFallbackAvatar(safeName);
                const commentTimeStr = formatDateTime(comment.createdAt);

                commentsHtml += `
                    <div class="flex gap-3 items-start mb-4 group">
                        <img src="${photo}" onerror="this.onerror=null; this.src='${getFallbackAvatar(safeName)}';" class="w-8 h-8 rounded-full object-cover border border-gray-200 dark:border-white/10 shrink-0 cursor-pointer hover:border-[#ff751f] transition-colors" onclick="window.location.href='profile.html?id=${comment.authorId}'">
                        <div class="bg-gray-50 dark:bg-white/5 p-3.5 rounded-2xl rounded-tl-none border border-gray-200 dark:border-white/10 text-[11px] w-full shadow-sm transition-colors duration-300">
                            <div class="flex flex-col mb-1.5">
                                <span class="font-bold text-gray-900 dark:text-white block text-[11px] cursor-pointer hover:text-[#ff751f] transition-colors leading-tight" onclick="window.location.href='profile.html?id=${comment.authorId}'">${safeName}</span>
                                <span class="text-[8px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest mt-0.5">${commentTimeStr}</span>
                            </div>
                            <span class="text-gray-700 dark:text-gray-300 leading-relaxed text-[11px]">${escapeHTML(comment.text)}</span>
                        </div>
                    </div>`;
            });
            
            list.innerHTML = commentsHtml;
        } catch (e) { list.innerHTML = '<span class="text-red-500 text-[11px] p-4 block text-center">Failed to load comments.</span>'; }
    }

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
                        <div class="flex flex-col items-center justify-center py-20 text-center text-gray-500 dark:text-gray-400 bg-white dark:bg-[#14171d] rounded-3xl border border-gray-200 dark:border-white/10 shadow-sm transition-colors duration-300">
                            <span class="material-symbols-outlined text-6xl mb-4 opacity-50 drop-shadow-md">forum</span>
                            <p class="text-xl font-headline font-black uppercase tracking-widest text-gray-900 dark:text-white">No posts yet</p>
                            <p class="text-xs mt-2 max-w-xs">Be the first to share an update, a highlight, or invite players to a game!</p>
                        </div>
                    `;
                } else {
                    const endMsg = document.createElement('div');
                    endMsg.className = "text-center text-gray-500 dark:text-gray-400 text-[10px] py-6 uppercase tracking-widest font-bold flex items-center justify-center gap-2";
                    endMsg.innerHTML = '<span class="w-8 h-[1px] bg-gray-300 dark:bg-white/10"></span> End of Feed <span class="w-8 h-[1px] bg-gray-300 dark:bg-white/10"></span>';
                    feedContainer.appendChild(endMsg);
                }
                
                if (loadingIndicator) loadingIndicator.classList.add('hidden');
                isFetchingPosts = false;
                return;
            }

            lastVisiblePost = snapshot.docs[snapshot.docs.length - 1];
            if (snapshot.docs.length < POSTS_PER_PAGE) hasMorePosts = false;

            const postsData = [];
            const missingUids = new Set();
            const missingGameIds = new Set();

            snapshot.forEach(docSnap => {
                const data = { id: docSnap.id, ...docSnap.data() };
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

            const fragment = document.createDocumentFragment();

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

                const formattedDateTimeStr = formatDateTime(post.createdAt);

                let visIcon = 'public';
                if (post.visibility === 'Connections Only') visIcon = 'group';
                if (post.visibility === 'Squad Only') visIcon = 'shield';
                if (post.visibility === 'Leagues') visIcon = 'emoji_events';

                const card = document.createElement('article');
                card.id = `post-${post.id}`;
                card.className = 'bg-white dark:bg-[#14171d] rounded-3xl p-5 md:p-6 border border-gray-200 dark:border-white/10 shadow-md transition-colors duration-300 relative overflow-hidden';

                let imageHtml = post.imageUrl ? `
                    <div class="-mx-5 md:-mx-6 mt-4 mb-4 bg-gray-100 dark:bg-[#0a0e14] relative group cursor-pointer border-y border-gray-200 dark:border-white/10 transition-colors duration-300" onclick="window.openLightbox('${escapeHTML(post.imageUrl)}')">
                        <img src="${escapeHTML(post.imageUrl)}" alt="Post image" class="w-full max-h-[500px] object-cover">
                        <div class="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                            <span class="material-symbols-outlined text-white text-5xl opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-xl scale-90 group-hover:scale-100">zoom_in</span>
                        </div>
                    </div>` : '';

                let joinGameHtml = '';
                if (post.type === 'game_promo') {
                    const dest = post.gameId ? `game-details.html?id=${post.gameId}` : `listings.html`;
                    
                    let buttonText = "JOIN MATCHUP";
                    let buttonStyle = "bg-[#ff751f] text-gray-900 shadow-md hover:brightness-110";

                    if (post.gameId && gameCache[post.gameId]) {
                        const gameInfo = gameCache[post.gameId];
                        const players = gameInfo.players || [];
                        
                        let myName = "Unknown Player";
                        if (currentUserData && currentUserData.uid) {
                            myName = currentUserData.uid; 
                        }

                        if (players.includes(myName)) {
                            buttonText = "VIEW MATCHUP";
                            buttonStyle = "bg-gray-100 dark:bg-white/10 border border-gray-200 dark:border-white/20 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-white/20";
                        } else if (gameInfo.spotsFilled >= gameInfo.spotsTotal) {
                            buttonText = "MATCH FULL - VIEW";
                            buttonStyle = "bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10";
                        }
                        
                        const gameStart = new Date(`${gameInfo.date}T${gameInfo.time}`);
                        const gameEnd = new Date(gameStart.getTime() + (2 * 60 * 60 * 1000));
                        const now = new Date();
                        if (now > gameEnd || (now >= gameStart && now <= gameEnd)) {
                            buttonText = "VIEW MATCHUP";
                            buttonStyle = "bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10";
                        }
                    }

                    joinGameHtml = `
                    <div class="mt-4 mb-2">
                        <button onclick="window.location.href='${dest}'" class="w-full flex items-center justify-center gap-2 transition-all py-3 rounded-xl font-black uppercase text-xs tracking-widest active:scale-95 ${buttonStyle}">
                            <span class="material-symbols-outlined text-[18px]">sports_basketball</span> ${buttonText}
                        </button>
                    </div>`;
                }

                const likedArray = post.likedBy || [];
                const isLiked = auth.currentUser && likedArray.includes(auth.currentUser.uid);
                const heartStyle = isLiked ? "'FILL' 1" : "'FILL' 0";
                const heartColor = isLiked ? "text-[#ff751f]" : "text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white";

                const isAdmin = currentUserData && currentUserData.accountType === 'Administrator';
                const isAuthor = auth.currentUser && post.authorId === auth.currentUser.uid;
                
                let deleteBtnHtml = '';
                if (isAuthor || isAdmin) {
                    const btnColor = isAdmin && !isAuthor ? 'text-red-500 hover:bg-red-500/10' : 'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white';
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
                            <div class="w-12 h-12 rounded-full overflow-hidden border-2 border-gray-200 dark:border-white/10 shrink-0 bg-gray-50 dark:bg-white/5 group-hover:border-[#ff751f] transition-colors shadow-sm">
                                <img src="${photoUrl}" onerror="this.onerror=null; this.src='${getFallbackAvatar(safeName)}';" alt="${safeName}" class="w-full h-full object-cover">
                            </div>
                            <div class="flex flex-col">
                                <h4 class="font-bold text-[13px] text-gray-900 dark:text-white group-hover:text-[#ff751f] transition-colors leading-tight mb-0.5">${safeName}</h4>
                                <span class="text-[9px] font-black uppercase tracking-widest text-[#ff751f] mb-0.5">${roleDisplay}</span>
                                <span class="text-[8px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest">${formattedDateTimeStr}</span>
                            </div>
                        </div>
                        <div class="flex items-center gap-2 shrink-0 ml-2">
                            ${post.location ? `<span class="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded bg-gray-50 dark:bg-white/5 text-gray-500 dark:text-gray-400 text-[8px] font-bold uppercase tracking-widest border border-gray-200 dark:border-white/10 transition-colors duration-300"><span class="material-symbols-outlined text-[11px]">location_on</span> ${escapeHTML(post.location)}</span>` : ''}
                            <span class="material-symbols-outlined text-[16px] text-gray-400 dark:text-gray-500" title="Visibility: ${escapeHTML(post.visibility || 'Public')}">${visIcon}</span>
                            ${deleteBtnHtml}
                        </div>
                    </div>
                    
                    ${post.location ? `<div class="sm:hidden mb-3"><span class="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-gray-50 dark:bg-white/5 text-gray-500 dark:text-gray-400 text-[8px] font-bold uppercase tracking-widest border border-gray-200 dark:border-white/10 transition-colors duration-300"><span class="material-symbols-outlined text-[11px]">location_on</span> ${escapeHTML(post.location)}</span></div>` : ''}
                    
                    <p class="text-[12px] md:text-[13px] text-gray-900 dark:text-white mb-3 whitespace-pre-wrap leading-relaxed transition-colors duration-300">${safeContent}</p>
                    
                    ${imageHtml}
                    ${joinGameHtml}

                    <div class="flex items-center gap-1 mt-4 pt-4 border-t border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 rounded-b-3xl -mx-5 md:-mx-6 -mb-5 md:-mb-6 px-2 md:px-4 py-2.5 transition-colors duration-300">
                        <button onclick="toggleLike('${post.id}', this)" class="flex items-center justify-center gap-1.5 flex-1 hover:bg-gray-100 dark:hover:bg-white/10 py-1.5 rounded-xl transition-colors font-bold uppercase text-[11px] tracking-wide ${heartColor} active:scale-95">
                            <span class="material-symbols-outlined text-[18px]" style="font-variation-settings: ${heartStyle}">favorite</span>
                            <span class="like-count">${likedArray.length}</span>
                        </button>
                        <div class="w-px h-5 bg-gray-200 dark:bg-white/10 transition-colors duration-300"></div>
                        <button onclick="toggleComments('${post.id}')" class="flex items-center justify-center gap-1.5 flex-1 hover:bg-gray-100 dark:hover:bg-white/10 py-1.5 rounded-xl transition-colors font-black uppercase text-[11px] tracking-wide text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white active:scale-95">
                            <span class="material-symbols-outlined text-[18px]">chat_bubble</span>
                            <span id="comment-count-${post.id}">${post.commentsCount || 0}</span>
                        </button>
                        <div class="w-px h-5 bg-gray-200 dark:bg-white/10 transition-colors duration-300"></div>
                        <button onclick="sharePost('${post.id}')" class="flex items-center justify-center gap-1.5 flex-1 hover:bg-gray-100 dark:hover:bg-white/10 py-1.5 rounded-xl transition-colors font-black uppercase text-[11px] tracking-wide text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white active:scale-95">
                            <span class="material-symbols-outlined text-[18px]">share</span>
                            <span class="hidden sm:inline">Share</span>
                        </button>
                    </div>
                    
                    <div id="comment-section-${post.id}" class="hidden mt-6 pt-4 border-t border-gray-200 dark:border-white/10 transition-colors duration-300">
                        <div id="comment-list-${post.id}" class="space-y-4 mb-4 max-h-64 overflow-y-auto custom-scrollbar pr-2"></div>
                        <div class="flex gap-3">
                            <input type="text" id="comment-input-${post.id}" placeholder="Write a reply..." class="flex-1 bg-white dark:bg-[#0a0e14] border border-gray-200 dark:border-white/20 rounded-xl px-4 py-2.5 text-[12px] text-gray-900 dark:text-white focus:border-[#ff751f] focus:ring-1 focus:outline-none transition-colors">
                            <button onclick="submitComment('${post.id}', this)" class="bg-[#ff751f] text-[#0a0e14] px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest active:scale-95 transition-transform shadow-md hover:brightness-110 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed">
                                <span class="material-symbols-outlined text-[18px]">send</span>
                            </button>
                        </div>
                    </div>
                `;
                fragment.appendChild(card);
            });
            
            feedContainer.appendChild(fragment);

            if (loadingIndicator) {
                if (hasMorePosts) loadingIndicator.classList.remove('hidden');
                else loadingIndicator.classList.add('hidden');
            }

        } catch (error) {
            console.error("Error loading feed:", error);
        } finally {
            isFetchingPosts = false;
        }
    }

    // ==========================================
    // OFFICIAL NEWS LOGIC (RIGHT SIDEBAR WIDGET)
    // ==========================================
    function loadOfficialNews() {
        const newsWidget = document.getElementById('official-news-container');
        if (!newsWidget) return;
        
        try {
            const q = query(collection(db, "official_news"), orderBy("createdAt", "desc"));
            
            onSnapshot(q, (snap) => {
                if (snap.empty) {
                    newsWidget.innerHTML = '<div class="p-4 text-center text-xs text-gray-500 dark:text-gray-400 italic">No official news posted yet.</div>';
                    return;
                }

                newsWidget.innerHTML = '';
                
                snap.forEach(documentObj => {
                    const data = documentObj.data();
                    const docId = documentObj.id;
                    
                    let timeStr = "Recently";
                    if (data.createdAt) {
                        const dateObj = new Date(data.createdAt.toMillis());
                        const now = new Date();
                        const diffMs = now - dateObj;
                        const diffDays = Math.floor(diffMs / 86400000);

                        if (diffDays < 1) {
                            const diffHours = Math.floor(diffMs / 3600000);
                            timeStr = diffHours < 1 ? 'Just now' : `${diffHours}h ago`;
                        } else {
                            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                            timeStr = `${monthNames[dateObj.getMonth()]} ${dateObj.getDate()}`;
                        }
                    }

                    let tagColor = 'text-gray-600 dark:text-gray-300 border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-white/5';
                    if (data.tag === 'Patch Notes') tagColor = 'text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/30 bg-blue-100 dark:bg-blue-500/10';
                    if (data.tag === 'Guidelines') tagColor = 'text-[#ff751f] border-[#ff751f]/30 bg-[#ff751f]/10';
                    if (data.tag === 'Event') tagColor = 'text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-500/30 bg-purple-100 dark:bg-purple-500/10';

                    let imageHtml = '';
                    if (data.imageUrl) {
                        imageHtml = `
                        <div class="mt-3 aspect-video w-full rounded-lg overflow-hidden cursor-pointer border border-gray-200 dark:border-white/10" onclick="window.openLightbox('${escapeHTML(data.imageUrl)}')">
                            <img src="${escapeHTML(data.imageUrl)}" class="w-full h-full object-cover hover:scale-105 transition-transform duration-300">
                        </div>`;
                    }

                    const safeContent = escapeHTML(data.content);
                    let contentHtml = '';
                    if (safeContent.length > 80) {
                        const shortText = safeContent.substring(0, 80) + '...';
                        contentHtml = `
                            <div id="news-short-${docId}">
                                <p class="text-[11px] text-gray-600 dark:text-gray-400 leading-snug inline">${shortText}</p>
                                <button onclick="document.getElementById('news-short-${docId}').classList.add('hidden'); document.getElementById('news-full-${docId}').classList.remove('hidden');" class="text-[#ff751f] font-bold cursor-pointer hover:underline text-[10px] ml-1 uppercase tracking-wider">More</button>
                            </div>
                            <div id="news-full-${docId}" class="hidden">
                                <p class="text-[11px] text-gray-600 dark:text-gray-400 leading-snug inline">${safeContent}</p>
                                <button onclick="document.getElementById('news-full-${docId}').classList.add('hidden'); document.getElementById('news-short-${docId}').classList.remove('hidden');" class="text-gray-500 dark:text-gray-400 font-bold cursor-pointer hover:underline text-[10px] ml-1 uppercase tracking-wider">Less</button>
                            </div>
                        `;
                    } else {
                        contentHtml = `<p class="text-[11px] text-gray-600 dark:text-gray-400 leading-snug">${safeContent}</p>`;
                    }

                    newsWidget.innerHTML += `
                        <div class="p-4 border-b border-gray-200 dark:border-white/5 last:border-0 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors duration-200">
                            <div class="flex items-center justify-between mb-1.5">
                                <span class="${tagColor} px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border transition-colors">${escapeHTML(data.tag)}</span>
                                <span class="text-[9px] text-gray-400 dark:text-gray-500 font-medium">${timeStr}</span>
                            </div>
                            <h4 class="font-bold text-xs text-gray-900 dark:text-white leading-tight mb-1">${escapeHTML(data.title)}</h4>
                            ${contentHtml}
                            ${imageHtml}
                        </div>
                    `;
                });
            });

        } catch (err) {
            console.error(err);
        }
    }

    // ==========================================
    // LIGHTBOX LOGIC
    // ==========================================
    function setupLightbox() {
        const lightbox = document.getElementById('image-lightbox');
        const closeBtn = document.getElementById('close-lightbox');
        
        window.openLightbox = function(url) {
            const lightboxImg = document.getElementById('lightbox-img');
            if (lightbox && lightboxImg) {
                lightboxImg.src = url;
                lightbox.classList.remove('hidden');
                
                requestAnimationFrame(() => {
                    lightbox.classList.remove('opacity-0');
                    lightboxImg.classList.remove('scale-95');
                    lightboxImg.classList.add('scale-100');
                });
            }
        };

        if (lightbox && closeBtn) {
            const close = () => {
                lightbox.classList.add('opacity-0');
                document.getElementById('lightbox-img').classList.remove('scale-100');
                document.getElementById('lightbox-img').classList.add('scale-95');
                
                setTimeout(() => {
                    lightbox.classList.add('hidden');
                    document.getElementById('lightbox-img').src = '';
                }, 300);
            };

            closeBtn.addEventListener('click', close);
            lightbox.addEventListener('click', (e) => {
                if (e.target === lightbox) close(); 
            });
        }
    }

    function escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
});
