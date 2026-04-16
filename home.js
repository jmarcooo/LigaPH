import { auth, db } from './firebase-setup.js';
import { doc, getDoc, collection, query, orderBy, getDocs, deleteDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

document.addEventListener('DOMContentLoaded', () => {
    
    const newsContainer = document.getElementById('official-news-container');
    const adminShortcut = document.getElementById('sidebar-admin-shortcut'); 

    let currentUserData = null;

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                const userDoc = await getDoc(doc(db, "users", user.uid));
                if (userDoc.exists()) {
                    currentUserData = userDoc.data();
                    
                    if (currentUserData.accountType === 'Administrator') {
                        if (adminShortcut) {
                            adminShortcut.classList.remove('hidden');
                            adminShortcut.classList.add('flex');
                        }
                    }
                }
            } catch (e) { console.error(e); }
        } else {
            currentUserData = null;
            if (adminShortcut) {
                adminShortcut.classList.add('hidden');
                adminShortcut.classList.remove('flex');
            }
        }
        
        loadSliderItems();
        loadOfficialNews();
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

    async function loadSliderItems() {
        if (!sliderTrack) return;
        
        try {
            const q = query(collection(db, "slider_items"), orderBy("createdAt", "desc"));
            const snap = await getDocs(q);

            if (snap.empty) {
                sliderTrack.innerHTML = `
                    <div class="w-full h-full flex-none snap-center relative">
                        <div class="absolute inset-0 bg-gradient-to-t from-[#0a0e14] via-[#0a0e14]/80 to-transparent md:bg-gradient-to-r md:from-[#0a0e14] md:via-[#0a0e14]/60 z-10 pointer-events-none"></div>
                        <img src="https://images.unsplash.com/photo-1519861531473-9200262188bf?q=80&w=2071&auto=format&fit=crop" class="absolute inset-0 w-full h-full object-cover object-center md:object-[center_right] opacity-70">
                        <div class="relative z-20 px-5 pb-6 pt-32 md:px-10 md:pb-10 flex flex-col justify-end h-full">
                            <h1 class="font-headline text-3xl md:text-5xl font-black italic uppercase tracking-tighter text-white leading-[1.05] mb-2 drop-shadow-lg">Welcome to Liga PH</h1>
                            <p class="text-gray-300 text-xs md:text-sm font-medium mb-4 drop-shadow-md">Your premier basketball community platform.</p>
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

            snap.forEach(doc => {
                const data = doc.data();
                const isActiveDot = index === 0 ? 'bg-primary w-6' : 'bg-outline-variant/50 w-2';
                
                let actionButton = '';
                if (data.linkUrl && data.linkText) {
                    actionButton = `
                        <button onclick="window.location.href='${escapeHTML(data.linkUrl)}'" class="w-max bg-primary text-on-primary-container hover:brightness-110 px-5 py-2.5 md:px-6 md:py-3 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg flex items-center gap-2 mt-2">
                            ${escapeHTML(data.linkText)} <span class="material-symbols-outlined text-[14px] md:text-[16px]">arrow_forward</span>
                        </button>
                    `;
                }

                slidesHtml += `
                    <div class="w-full h-full flex-none snap-center relative" data-index="${index}">
                        <div class="absolute inset-0 bg-gradient-to-t from-[#0a0e14] via-[#0a0e14]/80 to-transparent md:bg-gradient-to-r md:from-[#0a0e14] md:via-[#0a0e14]/60 z-10 pointer-events-none"></div>
                        
                        <img src="${escapeHTML(data.imageUrl)}" class="absolute inset-0 w-full h-full object-cover object-center md:object-[center_right] opacity-70">
                        
                        <div class="relative z-20 px-5 pb-6 pt-32 md:px-10 md:pb-10 flex flex-col justify-end h-full w-full md:w-2/3">
                            <div class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-tertiary/20 border border-tertiary/30 rounded-full shadow-sm w-max mb-3 backdrop-blur-sm">
                                <span class="material-symbols-outlined text-[12px] md:text-[14px] text-tertiary">local_fire_department</span>
                                <span class="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-tertiary">${escapeHTML(data.tag || 'Featured')}</span>
                            </div>
                            <h1 class="font-headline text-3xl md:text-5xl font-black italic uppercase tracking-tighter text-white leading-[1.05] mb-2 drop-shadow-lg">
                                ${escapeHTML(data.title)}
                            </h1>
                            <p class="text-gray-300 text-xs md:text-sm font-medium line-clamp-2 md:line-clamp-3 mb-4 drop-shadow-md">
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

        } catch (e) {
            console.error("Error loading slider", e);
            sliderLoader.innerHTML = '<p class="text-error text-xs font-bold text-center mt-4">Failed to load featured content.</p>';
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
                    dot.className = 'slider-dot h-2 rounded-full transition-all duration-300 bg-primary w-6 shadow-[0_0_10px_rgba(255,143,111,0.5)]';
                } else {
                    dot.className = 'slider-dot h-2 rounded-full transition-all duration-300 bg-outline-variant/50 w-2 hover:bg-outline-variant';
                }
            });
        };

        const goToSlide = (index) => {
            if (index < 0) index = totalSlides - 1;
            if (index >= totalSlides) index = 0;
            currentSlideIndex = index;
            
            const slideWidth = sliderTrack.clientWidth;
            sliderTrack.scrollTo({ left: slideWidth * currentSlideIndex, behavior: 'smooth' });
            updateDots(currentSlideIndex);
            resetInterval();
        };

        btnPrev.addEventListener('click', () => goToSlide(currentSlideIndex - 1));
        btnNext.addEventListener('click', () => goToSlide(currentSlideIndex + 1));

        document.querySelectorAll('.slider-dot').forEach(dot => {
            dot.addEventListener('click', (e) => {
                goToSlide(parseInt(e.target.dataset.index));
            });
        });

        sliderTrack.addEventListener('scroll', () => {
            const slideWidth = sliderTrack.clientWidth;
            const scrollLeft = sliderTrack.scrollLeft;
            const newIndex = Math.round(scrollLeft / slideWidth);
            if (newIndex !== currentSlideIndex) {
                currentSlideIndex = newIndex;
                updateDots(currentSlideIndex);
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

        const resetInterval = () => {
            clearInterval(slideInterval);
            slideInterval = setInterval(() => {
                if (!isSliderPaused) {
                    goToSlide(currentSlideIndex + 1);
                }
            }, 5000); 
        };

        resetInterval();
    }

    // ==========================================
    // OFFICIAL NEWS LOGIC
    // ==========================================
    window.deleteOfficialNews = async function(newsId) {
        if (!confirm("ADMIN ACTION: Are you sure you want to permanently delete this news post?")) return;
        
        try {
            await deleteDoc(doc(db, "official_news", newsId));
            loadOfficialNews(); 
        } catch (err) {
            console.error("Failed to delete news:", err);
            alert("Failed to delete news post. Check permissions.");
        }
    };

    async function loadOfficialNews() {
        if (!newsContainer) return;
        
        try {
            const q = query(collection(db, "official_news"), orderBy("createdAt", "desc"));
            const snap = await getDocs(q);

            if (snap.empty) {
                newsContainer.innerHTML = '<p class="text-sm text-outline-variant italic py-6">No official news posted yet.</p>';
                return;
            }

            newsContainer.innerHTML = '';
            
            snap.forEach(document => {
                const data = document.data();
                
                let timeStr = "Recently";
                if (data.createdAt) {
                    const diff = Date.now() - data.createdAt.toMillis();
                    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                    if (days === 0) timeStr = "Today";
                    else if (days === 1) timeStr = "Yesterday";
                    else timeStr = `${days} days ago`;
                }

                let tagColor = 'bg-surface-container-highest text-on-surface-variant border-outline-variant/20';
                let icon = 'campaign';
                if (data.tag === 'Patch Notes') { tagColor = 'bg-secondary/20 text-secondary border-secondary/30'; icon = 'build'; }
                if (data.tag === 'Guidelines') { tagColor = 'bg-primary/20 text-primary border-primary/30'; icon = 'admin_panel_settings'; }
                if (data.tag === 'Event') { tagColor = 'bg-tertiary/20 text-tertiary border-tertiary/30'; icon = 'event_star'; }

                // UPDATED: Fixed 220px height wrapper with overflow hidden, object-cover, and scale hover effect
                let imageHtml = '';
                if (data.imageUrl) {
                    imageHtml = `
                    <div class="w-full h-[220px] rounded-xl overflow-hidden mt-4 mb-4 border border-outline-variant/10 shadow-sm relative group cursor-pointer" onclick="window.open('${escapeHTML(data.imageUrl)}', '_blank')">
                        <img src="${escapeHTML(data.imageUrl)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                        <div class="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none"></div>
                    </div>`;
                }

                let adminDeleteBtnHtml = '';
                if (currentUserData && currentUserData.accountType === 'Administrator') {
                    adminDeleteBtnHtml = `
                        <button onclick="window.deleteOfficialNews('${document.id}')" class="text-error bg-error/10 hover:bg-error border border-error/20 hover:text-white p-1.5 rounded-lg transition-all ml-3 shadow-sm flex items-center justify-center" title="Delete News">
                            <span class="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                    `;
                }

                newsContainer.innerHTML += `
                    <article class="bg-surface-container-low rounded-2xl p-5 md:p-6 border border-outline-variant/10 shadow-sm relative overflow-hidden">
                        <div class="flex justify-between items-start mb-4 relative z-10">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-xl ${tagColor} flex items-center justify-center border">
                                    <span class="material-symbols-outlined text-[20px]">${icon}</span>
                                </div>
                                <div>
                                    <h4 class="font-bold text-sm text-on-surface uppercase tracking-widest">${escapeHTML(data.authorRole || 'LigaPH Team')}</h4>
                                    <p class="text-[10px] text-outline uppercase tracking-widest mt-0.5">${timeStr}</p>
                                </div>
                            </div>
                            <div class="flex items-center">
                                <span class="${tagColor} px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border">${escapeHTML(data.tag)}</span>
                                ${adminDeleteBtnHtml}
                            </div>
                        </div>
                        <h3 class="font-headline text-xl font-black italic uppercase text-on-surface mb-2 relative z-10">${escapeHTML(data.title)}</h3>
                        ${imageHtml}
                        <p class="text-sm text-on-surface-variant leading-relaxed relative z-10 whitespace-pre-wrap">${escapeHTML(data.content)}</p>
                    </article>
                `;
            });

        } catch (err) {
            console.error(err);
            newsContainer.innerHTML = '<p class="text-xs text-error">Failed to load news feed.</p>';
        }
    }

    function escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
});
