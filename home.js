import { auth, db } from './firebase-setup.js';
import { doc, getDoc, collection, addDoc, serverTimestamp, query, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

document.addEventListener('DOMContentLoaded', () => {
    
    const newsFormContainer = document.getElementById('admin-news-form-container');
    const newsForm = document.getElementById('admin-news-form');
    const newsContainer = document.getElementById('official-news-container');

    let currentUserData = null;

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                const userDoc = await getDoc(doc(db, "users", user.uid));
                if (userDoc.exists()) {
                    currentUserData = userDoc.data();
                    
                    // Show form only to Admins and Writers
                    if (currentUserData.accountType === 'Administrator' || currentUserData.accountType === 'Content Writer') {
                        if(newsFormContainer) newsFormContainer.classList.remove('hidden');
                    }
                }
            } catch (e) { console.error(e); }
        } else {
            if(newsFormContainer) newsFormContainer.classList.add('hidden');
        }
        
        loadOfficialNews();
    });

    if (newsForm) {
        newsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('submit-news-btn');
            btn.disabled = true;
            btn.textContent = "Publishing...";

            const title = document.getElementById('news-title').value.trim();
            const content = document.getElementById('news-content').value.trim();
            const tag = document.getElementById('news-tag').value;

            try {
                await addDoc(collection(db, "official_news"), {
                    title: title,
                    content: content,
                    tag: tag,
                    authorId: auth.currentUser.uid,
                    authorName: currentUserData.displayName || "Admin",
                    authorRole: currentUserData.accountType || "Content Writer",
                    createdAt: serverTimestamp()
                });
                
                newsForm.reset();
                loadOfficialNews();
            } catch (err) {
                alert("Failed to publish news.");
                console.error(err);
            } finally {
                btn.disabled = false;
                btn.textContent = "Publish News";
            }
        });
    }

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

                // Tag Colors
                let tagColor = 'bg-surface-container-highest text-on-surface-variant border-outline-variant/20';
                let icon = 'campaign';
                if (data.tag === 'Patch Notes') { tagColor = 'bg-secondary/20 text-secondary border-secondary/30'; icon = 'build'; }
                if (data.tag === 'Guidelines') { tagColor = 'bg-primary/20 text-primary border-primary/30'; icon = 'admin_panel_settings'; }
                if (data.tag === 'Event') { tagColor = 'bg-tertiary/20 text-tertiary border-tertiary/30'; icon = 'event_star'; }

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
                            <span class="${tagColor} px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border">${escapeHTML(data.tag)}</span>
                        </div>
                        <h3 class="font-headline text-xl font-black italic uppercase text-on-surface mb-2 relative z-10">${escapeHTML(data.title)}</h3>
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
