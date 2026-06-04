import { db } from './firebase-setup.js';
import { collection, query, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

// DOM Elements
const listView = document.getElementById('list-view');
const singleArticleView = document.getElementById('single-article-view');
const singleArticleContent = document.getElementById('single-article-content');
const heroNewsContainer = document.getElementById('hero-news-container');
const fullNewsContainer = document.getElementById('full-news-container');
const loadingIndicator = document.getElementById('news-loading-indicator');
const filterBtns = document.querySelectorAll('.news-filter-btn');

// State
let allArticles = [];
let currentFilter = 'all';

// Fallback Data (In case your Firestore is empty during testing)
const fallbackNews = [
    {
        id: 'news-1',
        title: 'Welcome to Liga PH: Your Court, Your Legacy.',
        category: 'Announcement',
        author: 'Marco Odoño',
        createdAt: new Date('2026-04-20T13:35:00'),
        imageUrl: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?q=80&w=2090&auto=format&fit=crop',
        content: `The premier platform for Filipino basketball players to find games, build their reputation, and connect with the community.
        
        Never Miss a Run: Browse a real-time feed of open games, pick-up runs, and leagues happening in your area.
        
        Build Your Player Profile: Create your digital basketball identity. Track your stats, update your position, and let the community know what you bring to the floor.
        
        Reputation & Attendance: Good players show up. Our attendance tracker rewards reliable players, meaning you always know if the guys you're playing with are the real deal or just talk.`
    },
    {
        id: 'news-2',
        title: 'Patch Notes v1.2: Matchmaking Updates & Rating Adjustments',
        category: 'Patch Notes',
        author: 'Liga PH Dev Team',
        createdAt: new Date('2026-05-10T09:00:00'),
        imageUrl: 'https://images.unsplash.com/photo-1515523110800-9415d13b84a8?q=80&w=2000&auto=format&fit=crop',
        content: `We've heard your feedback! Matchmaking in the competitive queues has been adjusted to better balance squads based on aggregate team ELO.
        
        We have also tuned the post-game rating system. Commendations now have a slightly higher weight towards your overall character rating, ensuring good sportsmanship is properly rewarded.
        
        Keep balling and keep submitting those post-game stats!`
    },
    {
        id: 'news-3',
        title: 'Manila Streetball Invitational: Summer 2026',
        category: 'Event',
        author: 'Liga PH Events',
        createdAt: new Date('2026-05-25T16:20:00'),
        imageUrl: 'https://images.unsplash.com/photo-1504450758481-7338eba7524a?q=80&w=2069&auto=format&fit=crop',
        content: `The biggest 5v5 streetball tournament of the summer is officially here. Gather your squad and prepare for a weekend of intense competition.
        
        Registration opens next week. All teams must have an average squad reliability score of 90% or higher to qualify for the bracket.
        
        Prizes include exclusive in-app badges, premium gear, and the ultimate bragging rights as the Kings of the Court.`
    }
];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    fetchNews();

    // Hook up filter buttons
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Update active state
            filterBtns.forEach(b => {
                b.classList.remove('active', 'text-[#ff751f]', 'border-[#ff751f]');
                b.classList.add('text-gray-500', 'border-transparent');
            });
            const target = e.target;
            target.classList.add('active', 'text-[#ff751f]', 'border-[#ff751f]');
            target.classList.remove('text-gray-500', 'border-transparent');

            currentFilter = target.getAttribute('data-filter');
            renderFeed();
        });
    });

    // Hook up "Back" button intercept for smooth SPA feel
    const backBtn = document.querySelector('#single-article-view button');
    if (backBtn) {
        backBtn.onclick = (e) => {
            e.preventDefault();
            closeArticle();
        };
    }
});

async function fetchNews() {
    try {
        if(loadingIndicator) loadingIndicator.classList.remove('hidden');
        
        const newsRef = collection(db, "news");
        const q = query(newsRef, orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        
        allArticles = [];
        snapshot.forEach(doc => {
            allArticles.push({ id: doc.id, ...doc.data() });
        });

        // Use fallback if DB is empty
        if (allArticles.length === 0) {
            allArticles = [...fallbackNews].sort((a, b) => b.createdAt - a.createdAt);
        }

        renderFeed();

        // Check URL hash to open an article directly
        const hash = window.location.hash.substring(1);
        if (hash && hash.startsWith('article-')) {
            const articleId = hash.replace('article-', '');
            openArticle(articleId);
        }

    } catch (error) {
        console.error("Error fetching news:", error);
        allArticles = [...fallbackNews].sort((a, b) => b.createdAt - a.createdAt);
        renderFeed();
    } finally {
        if(loadingIndicator) loadingIndicator.classList.add('hidden');
    }
}

function renderFeed() {
    let filtered = allArticles;
    if (currentFilter !== 'all') {
        filtered = allArticles.filter(a => a.category === currentFilter);
    }

    if (filtered.length === 0) {
        heroNewsContainer.innerHTML = '';
        heroNewsContainer.classList.add('hidden');
        fullNewsContainer.innerHTML = `
            <div class="text-center py-12 bg-white dark:bg-[#14171d] rounded-3xl border border-gray-200 dark:border-white/10">
                <span class="material-symbols-outlined text-gray-400 text-5xl mb-3">newspaper</span>
                <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-1">No News Found</h3>
                <p class="text-sm text-gray-500">Check back later for updates in this category.</p>
            </div>
        `;
        return;
    }

    // Separate Hero (first item) and the rest
    const hero = filtered[0];
    const list = filtered.slice(1);

    // Render Hero
    heroNewsContainer.innerHTML = `
        <div onclick="openArticle('${hero.id}')" class="group cursor-pointer bg-white dark:bg-[#14171d] rounded-3xl overflow-hidden border border-gray-200 dark:border-white/10 shadow-sm hover:border-[#ff751f]/50 transition-all duration-300">
            <div class="relative aspect-video w-full overflow-hidden bg-gray-200 dark:bg-white/5">
                <img src="${hero.imageUrl || 'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&q=80'}" alt="${hero.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700">
                <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
                <div class="absolute bottom-0 left-0 p-6 md:p-8 w-full">
                    <span class="inline-block bg-[#ff751f] text-[#0a0e14] px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest mb-3 shadow-sm">${hero.category || 'Update'}</span>
                    <h2 class="font-headline font-black italic text-2xl md:text-4xl text-white uppercase tracking-tight leading-tight mb-2 drop-shadow-md group-hover:text-[#ff751f] transition-colors">${hero.title}</h2>
                    <div class="flex items-center gap-2 text-gray-300 text-xs font-medium uppercase tracking-widest">
                        <span class="material-symbols-outlined text-[14px]">schedule</span>
                        ${formatDate(hero.createdAt)}
                    </div>
                </div>
            </div>
        </div>
    `;
    heroNewsContainer.classList.remove('hidden');

    // Render List
    fullNewsContainer.innerHTML = list.map(article => `
        <div onclick="openArticle('${article.id}')" class="flex flex-col md:flex-row gap-6 group border-b border-gray-200 dark:border-white/10 pb-8 cursor-pointer">
            <div class="w-full md:w-5/12 aspect-[3/2] rounded-2xl overflow-hidden bg-gray-200 dark:bg-white/5 shrink-0 relative">
                <img src="${article.imageUrl || 'https://images.unsplash.com/photo-1515523110800-9415d13b84a8?auto=format&fit=crop&q=80'}" alt="${article.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
            </div>
            <div class="flex-1 flex flex-col justify-center">
                <span class="text-[#ff751f] text-[10px] font-black uppercase tracking-widest mb-2">${article.category || 'Update'}</span>
                <h3 class="font-headline font-black text-xl md:text-2xl italic uppercase tracking-tighter text-gray-900 dark:text-white group-hover:text-[#ff751f] transition-colors leading-tight mb-3">${article.title}</h3>
                <p class="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-4 leading-relaxed">${getExcerpt(article.content)}</p>
                <div class="flex items-center gap-2 text-gray-400 dark:text-gray-500 text-[10px] font-bold uppercase tracking-widest mt-auto pt-2">
                    <span class="material-symbols-outlined text-[14px]">schedule</span>
                    ${formatDate(article.createdAt)}
                </div>
            </div>
        </div>
    `).join('');
}

// Attach to window so HTML inline onclicks can find it
window.openArticle = function(id) {
    const article = allArticles.find(a => a.id === id);
    if (!article) return;

    // Update URL hash without jumping
    history.pushState(null, null, `#article-${id}`);

    // Create paragraphs for CSS drop-cap to target the first <p>
    const formattedContent = article.content 
        ? article.content.split('\n').filter(p => p.trim() !== '').map(p => `<p>${p.trim()}</p>`).join('')
        : '<p>No content available.</p>';

    // Find Previous (Older) and Next (Newer) based on the global allArticles array (sorted newest to oldest)
    // Index 0 = Newest. Index length-1 = Oldest.
    const currentIndex = allArticles.findIndex(a => a.id === id);
    const prevArticle = currentIndex < allArticles.length - 1 ? allArticles[currentIndex + 1] : null; // Older article
    const nextArticle = currentIndex > 0 ? allArticles[currentIndex - 1] : null; // Newer article

    // Inject Content
    singleArticleContent.innerHTML = `
        <div class="article-header-meta">
            <span class="article-badge">${article.category || 'Announcement'}</span>
            <span class="article-date">
                <span class="material-symbols-outlined text-[16px]">schedule</span>
                ${formatDate(article.createdAt)}
            </span>
        </div>
        
        <h1>${article.title}</h1>
        
        <div class="article-author-line">
            By: <span class="article-author-name">${article.author || 'Liga PH Staff'}</span>
        </div>
        
        ${article.imageUrl ? `<img src="${article.imageUrl}" alt="${article.title}">` : ''}
        
        <div class="article-body">
            ${formattedContent}
        </div>

        <!-- Pagination Buttons dynamically generated based on position -->
        <div class="mt-16 flex flex-col sm:flex-row items-stretch sm:items-center justify-between border-t border-gray-200 dark:border-white/10 pt-6 gap-4">
            
            <div class="flex-1 min-w-0 flex justify-start">
                ${prevArticle ? `
                <button onclick="openArticle('${prevArticle.id}')" class="flex items-center gap-3 text-left group w-full sm:w-auto">
                    <div class="w-10 h-10 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center shrink-0 group-hover:bg-[#ff751f] group-hover:text-[#0a0e14] transition-all text-gray-500 dark:text-gray-400">
                        <span class="material-symbols-outlined text-[20px] group-hover:-translate-x-1 transition-transform">arrow_back</span>
                    </div>
                    <div class="flex flex-col min-w-0 flex-1">
                        <span class="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">Previous</span>
                        <span class="font-headline font-bold text-sm text-gray-900 dark:text-white group-hover:text-[#ff751f] transition-colors truncate max-w-[200px] md:max-w-[250px]">${prevArticle.title}</span>
                    </div>
                </button>
                ` : '<div></div>'}
            </div>
            
            <div class="flex-1 min-w-0 flex justify-end">
                ${nextArticle ? `
                <button onclick="openArticle('${nextArticle.id}')" class="flex items-center gap-3 text-right group w-full sm:w-auto justify-end">
                    <div class="flex flex-col min-w-0 flex-1 items-end">
                        <span class="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">Next</span>
                        <span class="font-headline font-bold text-sm text-gray-900 dark:text-white group-hover:text-[#ff751f] transition-colors truncate max-w-[200px] md:max-w-[250px]">${nextArticle.title}</span>
                    </div>
                    <div class="w-10 h-10 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center shrink-0 group-hover:bg-[#ff751f] group-hover:text-[#0a0e14] transition-all text-gray-500 dark:text-gray-400">
                        <span class="material-symbols-outlined text-[20px] group-hover:translate-x-1 transition-transform">arrow_forward</span>
                    </div>
                </button>
                ` : '<div></div>'}
            </div>
        </div>
    `;

    // Switch Views
    listView.classList.add('hidden');
    singleArticleView.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.closeArticle = function() {
    history.replaceState(null, null, 'news.html');
    singleArticleView.classList.add('hidden');
    listView.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Helpers
function formatDate(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options).toUpperCase();
}

function getExcerpt(content, maxLength = 120) {
    if (!content) return '';
    const plainText = content.replace(/<[^>]+>/g, '');
    if (plainText.length <= maxLength) return plainText;
    return plainText.substring(0, maxLength) + '...';
}
