import { auth, db } from './firebase-setup.js';
import { collection, query, orderBy, limit, getDocs, startAfter, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

// --- UTILITY FUNCTIONS ---
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

function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
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
    // 4. NEWS FETCHING & PAGINATION LOGIC
    // ==========================================
    const newsContainer = document.getElementById('full-news-container');
    const loadingIndicator = document.getElementById('news-loading-indicator');
    const filterBtns = document.querySelectorAll('.news-filter-btn');
    
    let lastVisibleNews = null;
    let isFetchingNews = false;
    let hasMoreNews = true;
    const NEWS_PER_PAGE = 5;
    let currentFilter = 'all';

    // Intersection Observer for Infinite Scroll
    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !isFetchingNews && hasMoreNews) {
            loadNews(true); 
        }
    }, { rootMargin: '200px' });

    if (loadingIndicator) observer.observe(loadingIndicator);

    // Filter Buttons Logic
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Update active styling
            filterBtns.forEach(b => {
                b.classList.remove('bg-[#ff751f]', 'text-[#0a0e14]', 'active');
                b.classList.add('bg-white', 'dark:bg-[#14171d]', 'text-gray-500');
            });
            e.target.classList.add('bg-[#ff751f]', 'text-[#0a0e14]', 'active');
            e.target.classList.remove('bg-white', 'dark:bg-[#14171d]', 'text-gray-500');
            
            // Apply filter and reset feed
            currentFilter = e.target.dataset.filter;
            loadNews(false);
        });
    });

    async function loadNews(isLoadMore = false) {
        if(!newsContainer) return;
        if(isFetchingNews) return;
        if(isLoadMore && !hasMoreNews) return;

        isFetchingNews = true;

        if (!isLoadMore) {
            lastVisibleNews = null;
            hasMoreNews = true;
            newsContainer.innerHTML = ''; // Clear container for fresh load
            if (loadingIndicator) loadingIndicator.classList.remove('hidden');
        }

        try {
            let q;
            const newsRef = collection(db, "official_news");

            /* Note: Filtering by 'tag' and ordering by 'createdAt' requires a composite index in Firestore. 
               If the index doesn't exist, this query will fail with a console link to create it. */
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

            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                const docId = docSnap.id;

                let tagColor = 'text-gray-600 dark:text-gray-300 border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-white/5';
                if (data.tag === 'Patch Notes') tagColor = 'text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/30 bg-blue-100 dark:bg-blue-500/10';
                if (data.tag === 'Guidelines') tagColor = 'text-[#ff751f] border-[#ff751f]/30 bg-[#ff751f]/10';
                if (data.tag === 'Event') tagColor = 'text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-500/30 bg-purple-100 dark:bg-purple-500/10';

                const timeStr = formatDateTime(data.createdAt);
                
                let imageHtml = '';
                if (data.imageUrl) {
                    imageHtml = `
                    <div class="-mx-6 -mb-6 mt-6 bg-gray-100 dark:bg-[#0a0e14] relative group cursor-pointer border-t border-gray-200 dark:border-white/10 transition-colors duration-300" onclick="window.openLightbox('${escapeHTML(data.imageUrl)}')">
                        <img src="${escapeHTML(data.imageUrl)}" alt="News image" class="w-full max-h-[500px] object-cover">
                        <div class="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                            <span class="material-symbols-outlined text-white text-5xl opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-xl scale-90 group-hover:scale-100">zoom_in</span>
                        </div>
                    </div>`;
                }

                const safeContent = escapeHTML(data.content);
                let contentHtml = '';
                
                // Allow "Read More" collapse for very long news articles
                if (safeContent.length > 400) {
                    const shortText = safeContent.substring(0, 400) + '...';
                    contentHtml = `
                        <div id="news-short-${docId}">
                            <span class="inline">${shortText}</span>
                            <button onclick="document.getElementById('news-short-${docId}').classList.add('hidden'); document.getElementById('news-full-${docId}').classList.remove('hidden');" class="text-[#ff751f] font-bold cursor-pointer hover:underline text-[12px] ml-1 uppercase tracking-wider">Read Full Article</button>
                        </div>
                        <div id="news-full-${docId}" class="hidden">
                            <span class="inline">${safeContent}</span>
                            <button onclick="document.getElementById('news-full-${docId}').classList.add('hidden'); document.getElementById('news-short-${docId}').classList.remove('hidden');" class="text-gray-500 dark:text-gray-400 font-bold cursor-pointer hover:underline text-[12px] ml-1 uppercase tracking-wider mt-2 block">Show Less</button>
                        </div>
                    `;
                } else {
                    contentHtml = `<span>${safeContent}</span>`;
                }

                const card = document.createElement('article');
                card.className = 'bg-white dark:bg-[#14171d] rounded-3xl p-6 border border-gray-200 dark:border-white/10 shadow-md transition-colors duration-300 relative overflow-hidden group';

                card.innerHTML = `
                    <div class="flex items-center justify-between mb-4">
                        <span class="${tagColor} px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-widest border transition-colors shadow-sm">${escapeHTML(data.tag)}</span>
                        <span class="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest flex items-center gap-1">
                            <span class="material-symbols-outlined text-[14px]">schedule</span> ${timeStr}
                        </span>
                    </div>
                    <h2 class="font-headline text-xl md:text-2xl font-black italic text-gray-900 dark:text-white leading-tight mb-3 group-hover:text-[#ff751f] transition-colors">${escapeHTML(data.title)}</h2>
                    <div class="text-[13px] md:text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">${contentHtml}</div>
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
                    <p class="text-[10px] font-normal mt-2 text-gray-500">Note: If you filtered by a specific tag, the database might require a composite index to be built.</p>
                </div>
            `;
            if (loadingIndicator) loadingIndicator.classList.add('hidden');
        } finally {
            isFetchingNews = false;
        }
    }

    // Initial Load
    loadNews(false);
});
