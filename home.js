import { auth, db, storage } from './firebase-setup.js';
import { doc, getDoc, collection, query, orderBy, getDocs, deleteDoc, onSnapshot, where, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { ref, deleteObject } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";

document.addEventListener('DOMContentLoaded', () => {
    
    // ==========================================
    // THEME TOGGLE LOGIC
    // ==========================================
    const themeBtn = document.getElementById('theme-toggle-btn');
    const themeIcon = document.getElementById('theme-toggle-icon');
    const htmlEl = document.documentElement;

    function applyTheme(isLight) {
        if (isLight) {
            htmlEl.classList.add('light-mode');
            if(themeIcon) themeIcon.textContent = 'dark_mode';
            localStorage.theme = 'light';
        } else {
            htmlEl.classList.remove('light-mode');
            if(themeIcon) themeIcon.textContent = 'light_mode';
            localStorage.theme = 'dark';
        }
    }

    if (localStorage.theme === 'light') {
        applyTheme(true);
    } else {
        applyTheme(false); 
    }

    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            const isCurrentlyLight = htmlEl.classList.contains('light-mode');
            applyTheme(!isCurrentlyLight);
        });
    }

    // ==========================================
    // MOBILE SIDEBAR LOGIC
    // ==========================================
    const menuBtn = document.getElementById('menu-btn');
    const sidebar = document.getElementById('global-sidebar');
    const overlay = document.getElementById('global-sidebar-overlay');
    const closeBtn = document.getElementById('close-sidebar-btn');

    function toggleSidebar() {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('open');
    }

    if(menuBtn) menuBtn.addEventListener('click', toggleSidebar);
    if(closeBtn) closeBtn.addEventListener('click', toggleSidebar);
    if(overlay) overlay.addEventListener('click', toggleSidebar);

    // ==========================================
    // CORE USER & AUTH LOGIC
    // ==========================================
    const newsContainer = document.getElementById('official-news-container');
    const feedsContainer = document.getElementById('home-feeds-container');
    const adminShortcut = document.getElementById('sidebar-admin-shortcut'); 

    let currentUserData = null;
    let unsubscribeProfile = null;
    let unsubscribeNotifs = null;

    onAuthStateChanged(auth, (user) => {
        if (user) {
            unsubscribeProfile = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
                if (docSnap.exists()) {
                    currentUserData = docSnap.data();
                    
                    document.getElementById('sidebar-name').textContent = currentUserData.displayName || 'Player';
                    document.getElementById('sidebar-email').textContent = currentUserData.email || '...';
                    
                    if(currentUserData.photoURL) {
                        document.getElementById('sidebar-avatar').src = currentUserData.photoURL;
                        const postAvatar = document.getElementById('post-avatar');
                        if (postAvatar) postAvatar.src = currentUserData.photoURL;
                    }

                    if (currentUserData.accountType === 'Administrator') {
                        if (adminShortcut) {
                            adminShortcut.classList.remove('hidden');
                            adminShortcut.classList.add('flex');
                        }
                    } else {
                        if (adminShortcut) {
                            adminShortcut.classList.add('hidden');
                            adminShortcut.classList.remove('flex');
                        }
                    }
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
            if (adminShortcut) {
                adminShortcut.classList.add('hidden');
                adminShortcut.classList.remove('flex');
            }
            window.location.href = "index.html"; 
        }
        
        loadSliderItems();
        loadOfficialNews();
        loadHomeFeeds();
        setupLightbox();
        setupPostFeed();
    });

    const logoutBtn = document.getElementById('sidebar-logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            signOut(auth).then(() => { window.location.href = 'index.html'; });
        });
    }

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
                        <div class="w-full h-full flex-none snap-center relative min-h-[400px] md:min-h-[500px] xl:min-h-[600px]">
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
                    const isActiveDot = index === 0 ? 'bg-[#ff8f6f] w-6' : 'bg-gray-400 dark:bg-white/20 w-2';
                    const iconToUse = data.tagIcon || 'local_fire_department'; 

                    let actionButton = '';
                    if (data.linkUrl && data.linkText) {
                        actionButton = `
                            <button onclick="window.location.href='${escapeHTML(data.linkUrl)}'" class="w-max bg-[#ff8f6f] text-gray-900 hover:brightness-110 px-5 py-2.5 md:px-6 md:py-3 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg flex items-center gap-2 mt-2">
                                ${escapeHTML(data.linkText)} <span class="material-symbols-outlined text-[14px] md:text-[16px]">arrow_forward</span>
                            </button>
                        `;
                    }

                    slidesHtml += `
                        <div class="w-full h-full flex-none snap-center relative min-h-[400px] md:min-h-[500px] xl:min-h-[600px]" data-index="${index}">
                            
                            <img src="${escapeHTML(data.imageUrl)}" class="absolute inset-0 w-full h-full object-cover blur-2xl opacity-40 scale-110 z-0 pointer-events-none">
                            <img src="${escapeHTML(data.imageUrl)}" class="absolute inset-0 w-full h-full object-contain md:object-cover object-center md:object-[center_right] z-10 pointer-events-none">
                            
                            <div class="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-white via-white/80 dark:from-[#0a0e14] dark:via-[#0a0e14]/80 to-transparent md:hidden z-20 pointer-events-none transition-colors duration-300"></div>
                            <div class="hidden md:block absolute inset-y-0 left-0 w-3/5 bg-gradient-to-r from-white via-white/80 dark:from-[#0a0e14] dark:via-[#0a0e14]/80 to-transparent z-20 pointer-events-none transition-colors duration-300"></div>
                            
                            <div class="relative z-30 px-5 pb-6 pt-32 md:px-10 md:pb-10 flex flex-col justify-end h-full w-full md:w-2/3">
                                <div class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#ff8f6f]/10 dark:bg-[#ff8f6f]/20 border border-[#ff8f6f]/30 rounded-full shadow-sm w-max mb-3 backdrop-blur-sm">
                                    <span class="material-symbols-outlined text-[12px] md:text-[14px] text-[#ff8f6f]">${escapeHTML(iconToUse)}</span>
                                    <span class="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-[#ff8f6f]">${escapeHTML(data.tag || 'Featured')}</span>
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
                    dot.className = 'slider-dot h-2 rounded-full transition-all duration-300 bg-[#ff8f6f] w-6 shadow-[0_0_10px_rgba(255,143,111,0.5)]';
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
    // FEEDS LOGIC (COMMUNITY FEED)
    // ==========================================
    function setupPostFeed() {
        const form = document.getElementById('post-feed-form');
        const input = document.getElementById('post-input');
        const btn = document.getElementById('post-submit-btn');

        if (form && input && btn) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const content = input.value.trim();
                if (!content || !auth.currentUser) return;

                btn.disabled = true;
                btn.innerHTML = `<span class="material-symbols-outlined text-[18px] animate-spin">sync</span>`;

                try {
                    await addDoc(collection(db, "posts"), {
                        authorId: auth.currentUser.uid,
                        authorName: currentUserData?.displayName || "Player",
                        authorPhoto: currentUserData?.photoURL || "",
                        content: content,
                        createdAt: serverTimestamp(),
                        likes: 0
                    });
                    input.value = '';
                } catch (err) {
                    console.error("Error posting to feed: ", err);
                    alert("Failed to post. Please try again.");
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = `<span class="material-symbols-outlined text-[18px]">send</span>`;
                }
            });
        }
    }

    window.deletePost = async function(postId) {
        if (!confirm("Are you sure you want to delete this post?")) return;
        try {
            await deleteDoc(doc(db, "posts", postId));
        } catch (err) {
            console.error("Failed to delete post:", err);
            alert("Failed to delete post.");
        }
    };

    function loadHomeFeeds() {
        if (!feedsContainer) return;
        
        try {
            const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
            
            onSnapshot(q, (snap) => {
                if (snap.empty) {
                    feedsContainer.innerHTML = `
                        <div class="bg-white dark:bg-[#14171d] rounded-2xl p-8 border border-gray-200 dark:border-white/5 flex flex-col items-center justify-center text-center transition-colors duration-300">
                            <span class="material-symbols-outlined text-4xl text-gray-400 dark:text-gray-500 mb-3">forum</span>
                            <p class="text-sm font-bold text-gray-600 dark:text-gray-300 uppercase tracking-widest">No Posts Yet</p>
                            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Be the first to share an update with the community.</p>
                        </div>
                    `;
                    return;
                }

                feedsContainer.innerHTML = '';
                
                snap.forEach(documentObj => {
                    const data = documentObj.data();
                    const docId = documentObj.id;
                    
                    let timeStr = "Just now";
                    if (data.createdAt) {
                        const dateObj = new Date(data.createdAt.toMillis());
                        const now = new Date();
                        const diffMs = now - dateObj;
                        
                        const diffMins = Math.floor(diffMs / 60000);
                        const diffHours = Math.floor(diffMs / 3600000);
                        const diffDays = Math.floor(diffMs / 86400000);

                        if (diffMins < 60) {
                            timeStr = `${diffMins || 1}m`;
                        } else if (diffHours < 24) {
                            timeStr = `${diffHours}h`;
                        } else {
                            timeStr = `${diffDays}d`;
                        }
                    }

                    const avatarUrl = data.authorPhoto || `https://ui-avatars.com/api/?name=${data.authorName?.charAt(0) || 'P'}&background=161618&color=ff8f6f`;
                    const isOwnerOrAdmin = auth.currentUser && (auth.currentUser.uid === data.authorId || (currentUserData && currentUserData.accountType === 'Administrator'));
                    
                    let deleteBtnHtml = '';
                    if (isOwnerOrAdmin) {
                        deleteBtnHtml = `
                            <button onclick="window.deletePost('${docId}')" class="text-gray-400 hover:text-red-500 p-1 rounded-full hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors flex items-center justify-center">
                                <span class="material-symbols-outlined text-[16px]">delete</span>
                            </button>
                        `;
                    }

                    feedsContainer.innerHTML += `
                        <div class="bg-white dark:bg-[#14171d] rounded-2xl p-5 border border-gray-200 dark:border-white/10 shadow-sm transition-colors duration-300">
                            <div class="flex justify-between items-start mb-3">
                                <div class="flex items-center gap-3">
                                    <img src="${avatarUrl}" class="w-10 h-10 rounded-full border border-gray-200 dark:border-white/10 object-cover shrink-0">
                                    <div class="flex flex-col">
                                        <h4 class="font-bold text-sm text-gray-900 dark:text-white leading-tight">${escapeHTML(data.authorName)}</h4>
                                        <span class="text-[10px] text-gray-500 dark:text-gray-400 font-medium">${timeStr}</span>
                                    </div>
                                </div>
                                ${deleteBtnHtml}
                            </div>
                            <p class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">${escapeHTML(data.content)}</p>
                        </div>
                    `;
                });
            });

        } catch (err) {
            console.error(err);
            feedsContainer.innerHTML = '<p class="text-xs text-red-500">Failed to load feeds.</p>';
        }
    }

    // ==========================================
    // OFFICIAL NEWS LOGIC (RIGHT SIDEBAR WIDGET)
    // ==========================================
    window.deleteOfficialNews = async function(newsId) {
        if (!confirm("ADMIN ACTION: Are you sure you want to permanently delete this news post?")) return;
        
        try {
            const docRef = doc(db, "official_news", newsId);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.imageUrl) {
                    try {
                        const imageRef = ref(storage, data.imageUrl);
                        await deleteObject(imageRef);
                    } catch (storageErr) {
                        console.warn("Could not delete associated image from storage.", storageErr);
                    }
                }
            }
            await deleteDoc(docRef);
        } catch (err) {
            console.error("Failed to delete news:", err);
            alert("Failed to delete news post. Check permissions.");
        }
    };

    function loadOfficialNews() {
        if (!newsContainer) return;
        
        try {
            const q = query(collection(db, "official_news"), orderBy("createdAt", "desc"));
            
            onSnapshot(q, (snap) => {
                if (snap.empty) {
                    newsContainer.innerHTML = '<p class="text-sm text-gray-500 dark:text-gray-400 italic py-6 px-2">No official news posted yet.</p>';
                    return;
                }

                newsContainer.innerHTML = '';
                
                snap.forEach(documentObj => {
                    const data = documentObj.data();
                    const docId = documentObj.id;
                    
                    let timeStr = "Recently";
                    if (data.createdAt) {
                        const dateObj = new Date(data.createdAt.toMillis());
                        const now = new Date();
                        const diffMs = now - dateObj;
                        
                        const diffMins = Math.floor(diffMs / 60000);
                        const diffHours = Math.floor(diffMs / 3600000);
                        const diffDays = Math.floor(diffMs / 86400000);

                        if (diffMins < 60) {
                            timeStr = `${diffMins || 1}m`;
                        } else if (diffHours < 24) {
                            timeStr = `${diffHours}h`;
                        } else {
                            timeStr = `${diffDays}d`;
                        }
                    }

                    let tagColor = 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-white/10';
                    let icon = 'campaign';
                    if (data.tag === 'Patch Notes') { tagColor = 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/30'; icon = 'build'; }
                    if (data.tag === 'Guidelines') { tagColor = 'bg-[#ff8f6f]/10 dark:bg-[#ff8f6f]/20 text-[#ff8f6f] border-[#ff8f6f]/30'; icon = 'admin_panel_settings'; }
                    if (data.tag === 'Event') { tagColor = 'bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-500/30'; icon = 'event_star'; }

                    let imageHtml = '';
                    if (data.imageUrl) {
                        imageHtml = `
                        <div class="w-full aspect-video rounded-xl overflow-hidden mt-3 mb-3 border border-gray-200 dark:border-white/10 shadow-sm relative group cursor-pointer" onclick="window.openLightbox('${escapeHTML(data.imageUrl)}')">
                            <img src="${escapeHTML(data.imageUrl)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                            <div class="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none"></div>
                            <div class="absolute bottom-2 right-2 bg-black/60 text-white p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm pointer-events-none">
                                <span class="material-symbols-outlined text-[14px]">zoom_in</span>
                            </div>
                        </div>`;
                    }

                    let adminDeleteBtnHtml = '';
                    if (currentUserData && currentUserData.accountType === 'Administrator') {
                        adminDeleteBtnHtml = `
                            <button onclick="window.deleteOfficialNews('${docId}')" class="text-red-500 bg-red-50 hover:bg-red-500 dark:bg-red-500/10 dark:hover:bg-red-500 border border-red-200 dark:border-red-500/20 hover:text-white p-1 rounded-lg transition-all ml-3 shadow-sm flex items-center justify-center" title="Delete News">
                                <span class="material-symbols-outlined text-[14px]">delete</span>
                            </button>
                        `;
                    }

                    const safeContent = escapeHTML(data.content);
                    const textLimit = 90; // Shorter limit for sidebar
                    let contentHtml = '';

                    if (safeContent.length > textLimit) {
                        let cutPos = safeContent.lastIndexOf(' ', textLimit);
                        if(cutPos === -1) cutPos = textLimit;
                        const shortText = safeContent.substring(0, cutPos) + '...';
                        
                        contentHtml = `
                            <div id="news-short-${docId}">
                                <p class="text-xs text-gray-700 dark:text-gray-300 mb-2 whitespace-pre-wrap leading-relaxed inline transition-colors duration-300">${shortText}</p>
                                <button onclick="document.getElementById('news-short-${docId}').classList.add('hidden'); document.getElementById('news-full-${docId}').classList.remove('hidden');" class="text-[#ff8f6f] text-[10px] font-black uppercase tracking-widest hover:brightness-110 transition-colors ml-1">Read more</button>
                            </div>
                            <div id="news-full-${docId}" class="hidden">
                                <p class="text-xs text-gray-700 dark:text-gray-300 mb-2 whitespace-pre-wrap leading-relaxed inline transition-colors duration-300">${safeContent}</p>
                                <button onclick="document.getElementById('news-full-${docId}').classList.add('hidden'); document.getElementById('news-short-${docId}').classList.remove('hidden');" class="text-gray-500 dark:text-gray-400 text-[9px] font-black uppercase tracking-widest hover:text-gray-900 dark:hover:text-white transition-colors ml-1 block mt-1">Show less</button>
                            </div>
                        `;
                    } else {
                        contentHtml = `<p class="text-xs text-gray-700 dark:text-gray-300 mb-2 whitespace-pre-wrap leading-relaxed transition-colors duration-300">${safeContent}</p>`;
                    }

                    newsContainer.innerHTML += `
                        <article class="bg-white dark:bg-[#14171d] rounded-2xl p-4 md:p-5 border border-gray-200 dark:border-white/10 shadow-sm relative overflow-hidden transition-colors duration-300">
                            <div class="flex justify-between items-start mb-3 relative z-10">
                                <div class="flex items-center gap-2.5">
                                    <div class="w-8 h-8 rounded-full ${tagColor} flex items-center justify-center border shrink-0 transition-colors duration-300">
                                        <span class="material-symbols-outlined text-[16px]">${icon}</span>
                                    </div>
                                    <div class="flex flex-col justify-center">
                                        <h4 class="font-bold text-[11px] text-gray-900 dark:text-white uppercase tracking-widest leading-tight transition-colors duration-300">${escapeHTML(data.authorRole || 'LigaPH Team')}</h4>
                                        <span class="text-[9px] text-gray-500 dark:text-gray-400 font-medium transition-colors duration-300">${timeStr}</span>
                                    </div>
                                </div>
                                <div class="flex flex-col items-end gap-1.5">
                                    <span class="${tagColor} px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest border transition-colors duration-300">${escapeHTML(data.tag)}</span>
                                    ${adminDeleteBtnHtml}
                                </div>
                            </div>
                            <h3 class="font-headline text-sm font-black italic uppercase text-gray-900 dark:text-white mb-2 relative z-10 transition-colors duration-300 leading-tight">${escapeHTML(data.title)}</h3>
                            ${contentHtml}
                            ${imageHtml}
                        </article>
                    `;
                });
            });

        } catch (err) {
            console.error(err);
            newsContainer.innerHTML = '<p class="text-xs text-red-500">Failed to hook news feed.</p>';
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
