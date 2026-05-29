import { auth, db } from './firebase-setup.js';
import { collection, doc, getDoc, query, orderBy, limit, getDocs, startAfter, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

// --- UTILITY FUNCTIONS ---
function formatDateTime(timestamp) {
    if (!timestamp) return 'RECENTLY';
    const date = typeof timestamp.toDate === 'function' ? timestamp.toDate() : new Date(timestamp);
    const formatter = new Intl.DateTimeFormat('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
    });
    const parts = formatter.formatToParts(date);
    
    let rawMonth = parts.find(p => p.type === 'month')?.value || '';
    let month = rawMonth.charAt(0).toUpperCase() + rawMonth.slice(1).toLowerCase();
    let day = parts.find(p => p.type === 'day')?.value || '';
    let year = parts.find(p => p.type === 'year')?.value || '';
    let hour = (parts.find(p => p.type === 'hour')?.value || '').padStart(2, '0');
    let minute = parts.find(p => p.type === 'minute')?.value || '';
    let dayPeriod = parts.find(p => p.type === 'dayPeriod')?.value.toUpperCase() || '';
    
    let absoluteStr = `${month} ${day}, ${year} • ${hour}:${minute}${dayPeriod}`;

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

    return `${absoluteStr} (${relativeStr})`;
}

function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function getTagStyle(tag) {
    let tagColor = 'text-gray-600 dark:text-gray-300 border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-white/5';
    if (tag === 'Patch Notes') tagColor = 'text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/30 bg-blue-100 dark:bg-blue-500/10';
    if (tag === 'Guidelines') tagColor = 'text-[#ff751f] border-[#ff751f]/30 bg-[#ff751f]/10';
    if (tag === 'Event') tagColor = 'text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-500/30 bg-purple-100 dark:bg-purple-500/10';
    return tagColor;
}

function getHeroTagStyle(tag) {
    let tagColor = 'text-gray-900 bg-white';
    if (tag === 'Patch Notes') tagColor = 'text-white bg-blue-500 border-blue-400';
    if (tag === 'Guidelines') tagColor = 'text-white bg-[#ff751f] border-[#ff751f]';
    if (tag === 'Event') tagColor = 'text-white bg-purple-500 border-purple-400';
    return tagColor;
}

document.addEventListener('DOMContentLoaded', () => {
    
    // ==========================================
    // 1. THEME TOGGLE LOGIC
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

    if (localStorage.theme === 'light') applyTheme(false);
    else applyTheme(true); 

    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            applyTheme(!htmlEl.classList.contains('dark'));
        });
    }

    // ==========================================
    // 2. AUTH & NOTIFICATION BADGE
    // ==========================================
    let unsubscribeNotifs = null;

    onAuthStateChanged(auth, (user) => {
        if (user) {
            const notifQ = query(collection(db, "notifications"), where("recipientId", "==", user.uid), where("read", "==", false));
            unsubscribeNotifs = onSnapshot(notifQ, (snap) => {
                const badge = document.getElementById('nav-notif-badge');
                if (badge) {
                    if (!snap.empty) badge.classList.remove('hidden');
                    else badge.classList.add('hidden');
                }
            });
        } else {
            if (unsubscribeNotifs) unsubscribeNotifs();
        }
    });

    // ==========================================
    // 3. LIGHTBOX LOGIC
    // ==========================================
    setupLightbox();

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

    // ==========================================
    // 4. ROUTING & NEWS FETCHING
    // ==========================================
    const urlParams = new URLSearchParams(window.location.search);
    const articleId = urlParams.get('id');

    const listView = document.getElementById('list-view');
    const singleArticleView = document.getElementById('single-article-view');
    const singleArticleContent = document.getElementById('single-article-content');

    const newsContainer = document.getElementById('full-news-container');
    const heroContainer = document.getElementById('hero-news-container');
    const loadingIndicator = document.getElementById('news-loading-indicator');
    const filterBtns = document.querySelectorAll('.news-filter-btn');
    
    let lastVisibleNews = null;
    let isFetchingNews = false;
    let hasMoreNews = true;
    const NEWS_PER_PAGE = 5;
    let currentFilter = 'all';

    // Route Handler
    if (articleId) {
        listView.classList.add('hidden');
        singleArticleView.classList.remove('hidden');
        loadSingleArticle(articleId);
    } else {
        listView.classList.remove('hidden');
        singleArticleView.classList.add('hidden');
        
        // Initialize Intersection Observer for Feed
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && !isFetchingNews && hasMoreNews) {
                loadNewsList(true); 
            }
        }, { rootMargin: '200px' });
        if (loadingIndicator) observer.observe(loadingIndicator);
        
        loadNewsList(false);
    }

    // Filter Buttons Logic
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterBtns.forEach(b => {
                b.classList.remove('bg-[#ff751f]', 'text-[#0a0e14]', 'active');
                b.classList.add('bg-white', 'dark:bg-[#14171d]', 'text-gray-500');
            });
            e.target.classList.add('bg-[#ff751f]', 'text-[#0a0e14]', 'active');
            e.target.classList.remove('bg-white', 'dark:bg-[#14171d]', 'text-gray-500');
            
            currentFilter = e.target.dataset.filter;
            loadNewsList(false);
        });
    });

    // --- SINGLE ARTICLE PAGE ---
    async function loadSingleArticle(id) {
        try {
            const docRef = doc(db, "official_news", id);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                const timeStr = formatDateTime(data.createdAt);
                const tagColor = getTagStyle(data.tag);
                
                const imageHtml = data.imageUrl 
                    ? `<img src="${escapeHTML(data.imageUrl)}" class="w-full max-h-[500px] object-cover rounded-3xl mb-8 shadow-md cursor-pointer border border-gray-200 dark:border-white/10" onclick="window.openLightbox('${escapeHTML(data.imageUrl)}')">` 
                    : '';
                const safeContent = escapeHTML(data.content).replace(/\n/g, '<br>');

                singleArticleContent.innerHTML = `
                    <div class="flex items-center gap-2 mb-6">
                        <span class="${tagColor} px-3 py-1.5 rounded-md text-xs font-black uppercase tracking-widest border shadow-sm">${escapeHTML(data.tag)}</span>
                        <span class="text-[10px] md:text-xs text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest flex items-center gap-1">
                            <span class="material-symbols-outlined text-[16px]">schedule</span> ${timeStr}
                        </span>
                    </div>
                    <h1 class="font-headline text-3xl md:text-5xl font-black italic text-gray-900 dark:text-white leading-tight mb-8">${escapeHTML(data.title)}</h1>
                    ${imageHtml}
                    <div class="text-sm md:text-base text-gray-800 dark:text-gray-300 leading-relaxed pb-12 font-poppins">
                        ${safeContent}
                    </div>
                `;
            } else {
                singleArticleContent.innerHTML = `
                    <div class="py-20 text-center text-gray-500 dark:text-gray-400 bg-white dark:bg-[#14171d] rounded-3xl border border-gray-200 dark:border-white/10">
                        <span class="material-symbols-outlined text-6xl mb-4 opacity-50 drop-shadow-md">error</span>
                        <p class="text-xl font-headline font-black uppercase tracking-widest text-gray-900 dark:text-white">Article Not Found</p>
                        <p class="text-xs mt-2">The article you are looking for does not exist or has been removed.</p>
                    </div>
                `;
            }
        } catch (error) {
            console.error("Error loading single article:", error);
            singleArticleContent.innerHTML = '<p class="text-red-500 text-center font-bold">Failed to load the article. Please try again.</p>';
        }
    }

    // --- LIST AND HERO FEED ---
    function renderHeroCard(data, docId) {
        const timeStr = formatDateTime(data.createdAt);
        const tagColor = getHeroTagStyle(data.tag);
        
        const imageHtml = data.imageUrl 
            ? `<img src="${escapeHTML(data.imageUrl)}" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700">` 
            : `<div class="absolute inset-0 w-full h-full bg-gradient-to-br from-gray-300 to-gray-400 dark:from-[#1b1f27] dark:to-[#0a0e14]"></div>`;

        return `
            <div class="relative w-full h-[400px] md:h-[500px] rounded-3xl overflow-hidden shadow-xl group cursor-pointer border border-gray-200 dark:border-white/10" onclick="window.location.href='news.html?id=${docId}'">
                ${imageHtml}
                <div class="absolute inset-0 bg-gradient-to-t from-[#0a0e14] via-[#0a0e14]/50 to-transparent"></div>
                
                <div class="absolute top-4 left-4 right-4 flex items-center justify-between">
                    <span class="bg-[#ff751f] text-[#0a0e14] px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-md flex items-center gap-1">
                        <span class="material-symbols-outlined text-[14px]">star</span> Latest Update
                    </span>
                </div>

                <div class="absolute inset-x-0 bottom-0 p-6 md:p-8 flex flex-col justify-end">
                    <div class="flex items-center gap-3 mb-3">
                        <span class="${tagColor} px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-widest border shadow-sm">${escapeHTML(data.tag)}</span>
                        <span class="text-[10px] text-gray-300 font-bold uppercase tracking-widest drop-shadow-md flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">schedule</span> ${timeStr}</span>
                    </div>
                    <h2 class="font-headline text-2xl md:text-4xl font-black italic text-white leading-tight mb-3 drop-shadow-lg group-hover:text-[#ff751f] transition-colors">${escapeHTML(data.title)}</h2>
                    <p class="text-gray-300 text-xs md:text-sm line-clamp-2 drop-shadow-md mb-5 font-poppins">${escapeHTML(data.content).substring(0, 150)}...</p>
                    
                    <button class="bg-white/10 hover:bg-[#ff751f] text-white hover:text-gray-900 border border-white/20 hover:border-transparent px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest backdrop-blur-md transition-all flex items-center justify-center gap-2 w-max active:scale-95 group-hover:bg-[#ff751f] group-hover:text-[#0a0e14] group-hover:border-[#ff751f]">
                        Read Full Article <span class="material-symbols-outlined text-[16px] group-hover:translate-x-1 transition-transform">arrow_forward</span>
                    </button>
                </div>
            </div>
        `;
    }

    async function loadNewsList(isLoadMore = false) {
        if(!newsContainer) return;
        if(isFetchingNews) return;
        if(isLoadMore && !hasMoreNews) return;

        isFetchingNews = true;

        if (!isLoadMore) {
            lastVisibleNews = null;
            hasMoreNews = true;
            newsContainer.innerHTML = ''; 
            heroContainer.innerHTML = '';
            heroContainer.classList.add('hidden');
            if (loadingIndicator) loadingIndicator.classList.remove('hidden');
        }

        try {
            let q;
            const newsRef = collection(db, "official_news");

            if (currentFilter === 'all') {
                if (lastVisibleNews) {
                    q = query(newsRef, orderBy("createdAt", "desc"), startAfter(lastVisibleNews), limit(NEWS_PER_PAGE));
                } else {
                    q = query(newsRef, orderBy("createdAt", "desc"), limit(NEWS_PER_PAGE));
                }
            } else {
                if (lastVisibleNews) {
                    q = query(newsRef, where("tag", "==", currentFilter), orderBy("createdAt", "desc"), startAfter(lastVisibleNews), limit(NEWS_PER_PAGE));
                } else {
                    q = query(newsRef, where("tag", "==", currentFilter), orderBy("createdAt", "desc"), limit(NEWS_PER_PAGE));
                }
            }

            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                hasMoreNews = false;
                if (!isLoadMore) {
                    newsContainer.innerHTML = `
                        <div class="flex flex-col items-center justify-center py-20 text-center text-gray-500 dark:text-gray-400 bg-white dark:bg-[#14171d] rounded-3xl border border-gray-200 dark:border-white/10 shadow-sm transition-colors duration-300">
                            <span class="material-symbols-outlined text-6xl mb-4 opacity-50 drop-shadow-md">info</span>
                            <p class="text-xl font-headline font-black uppercase tracking-widest text-gray-900 dark:text-white">No News Found</p>
                            <p class="text-xs mt-2 max-w-xs">There are no official updates matching this filter right now.</p>
                        </div>
                    `;
                } else {
                    const endMsg = document.createElement('div');
                    endMsg.className = "text-center text-gray-500 dark:text-gray-400 text-[10px] py-6 uppercase tracking-widest font-bold flex items-center justify-center gap-2";
                    endMsg.innerHTML = '<span class="w-8 h-[1px] bg-gray-300 dark:bg-white/10"></span> You\'re all caught up <span class="w-8 h-[1px] bg-gray-300 dark:bg-white/10"></span>';
                    newsContainer.appendChild(endMsg);
                }
                
                if (loadingIndicator) loadingIndicator.classList.add('hidden');
                isFetchingNews = false;
                return;
            }

            lastVisibleNews = snapshot.docs[snapshot.docs.length - 1];
            if (snapshot.docs.length < NEWS_PER_PAGE) hasMoreNews = false;

            const fragment = document.createDocumentFragment();

            snapshot.docs.forEach((docSnap, index) => {
                const data = docSnap.data();
                const docId = docSnap.id;
                const timeStr = formatDateTime(data.createdAt);

                // Render first item as Hero if not loading more and filter is "all"
                if (!isLoadMore && currentFilter === 'all' && index === 0) {
                    heroContainer.innerHTML = renderHeroCard(data, docId);
                    heroContainer.classList.remove('hidden');
                    return; // Skip standard card rendering for this item
                }

                const tagColor = getTagStyle(data.tag);
                
                let imageHtml = '';
                if (data.imageUrl) {
                    imageHtml = `
                    <div class="-mx-6 -mb-6 mt-6 bg-gray-100 dark:bg-[#0a0e14] relative group cursor-pointer border-t border-gray-200 dark:border-white/10 transition-colors duration-300" onclick="window.location.href='news.html?id=${docId}'">
                        <img src="${escapeHTML(data.imageUrl)}" alt="News image" class="w-full max-h-[350px] object-cover">
                        <div class="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                            <button class="bg-[#ff751f] text-gray-900 px-5 py-2 rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg opacity-0 group-hover:opacity-100 transition-opacity scale-90 group-hover:scale-100 flex items-center gap-1">Read Article <span class="material-symbols-outlined text-[14px]">arrow_forward</span></button>
                        </div>
                    </div>`;
                }

                const safeContent = escapeHTML(data.content);
                const shortText = safeContent.length > 250 ? safeContent.substring(0, 250) + '...' : safeContent;
                
                const card = document.createElement('article');
                card.className = 'bg-white dark:bg-[#14171d] rounded-3xl p-6 border border-gray-200 dark:border-white/10 shadow-sm transition-colors duration-300 relative overflow-hidden group hover:border-[#ff751f]/50 hover:shadow-md';

                card.innerHTML = `
                    <div class="flex items-center justify-between mb-4">
                        <span class="${tagColor} px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-widest border transition-colors shadow-sm">${escapeHTML(data.tag)}</span>
                        <span class="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest flex items-center gap-1">
                            <span class="material-symbols-outlined text-[14px]">schedule</span> ${timeStr.split('(')[0]} </span>
                    </div>
                    <h2 class="font-headline text-xl md:text-2xl font-black italic text-gray-900 dark:text-white leading-tight mb-3 group-hover:text-[#ff751f] transition-colors cursor-pointer" onclick="window.location.href='news.html?id=${docId}'">${escapeHTML(data.title)}</h2>
                    <p class="text-xs md:text-sm text-gray-700 dark:text-gray-300 leading-relaxed font-poppins">${shortText}</p>
                    
                    ${safeContent.length > 250 ? `<button onclick="window.location.href='news.html?id=${docId}'" class="text-[#ff751f] font-bold text-[11px] uppercase tracking-widest mt-4 hover:underline flex items-center gap-1 group-hover:translate-x-1 transition-transform w-max">Read Full Article <span class="material-symbols-outlined text-[14px]">arrow_forward</span></button>` : ''}
                    
                    ${imageHtml}
                `;
                fragment.appendChild(card);
            });
            
            newsContainer.appendChild(fragment);

            if (loadingIndicator) {
                if (hasMoreNews) loadingIndicator.classList.remove('hidden');
                else loadingIndicator.classList.add('hidden');
            }

        } catch (error) {
            console.error("Error loading official news:", error);
            newsContainer.innerHTML = `
                <div class="p-6 text-center text-red-500 text-sm font-bold bg-red-500/10 rounded-2xl border border-red-500/20">
                    Failed to load official news. Please try again.
                </div>
            `;
            if (loadingIndicator) loadingIndicator.classList.add('hidden');
        } finally {
            isFetchingNews = false;
        }
    }

});
