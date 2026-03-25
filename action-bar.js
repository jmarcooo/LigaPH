// action-bar.js

document.addEventListener("DOMContentLoaded", () => {
    // Don't render action bar on game-details
    if (window.location.pathname.includes("game-details.html")) {
        return;
    }

    const currentPath = window.location.pathname;

    const navItems = [
        {
            name: "Feed",
            icon: "style",
            link: "index.html",
            activePaths: ["/index.html", "/"]
        },
        {
            name: "Games",
            icon: "sports_basketball",
            link: "listings.html",
            activePaths: ["/listings.html"]
        },
        {
            name: "Leagues",
            icon: "emoji_events",
            link: "leagues.html",
            activePaths: ["/leagues.html"]
        },
        {
            name: "Profile",
            icon: "person",
            link: "profile.html",
            activePaths: ["/profile.html"]
        }
    ];

    const navElement = document.createElement('nav');

    // Check if we are on a desktop page (profile.html has a hidden mobile nav class)
    // Actually, looking at the existing code, index, listings, and profile all have slightly different classes.
    // Let's use a standard unified class set for the bottom nav.
    // profile.html used: class="md:hidden fixed bottom-0 left-0 w-full h-20 flex justify-around items-center px-4 pb-2 bg-[#0a0e14]/60 backdrop-blur-xl rounded-t-[2rem] z-50 shadow-[0_-8px_32px_rgba(31,40,130,0.1)]"
    // index.html used: class="fixed bottom-0 left-0 w-full h-20 flex justify-around items-center px-4 pb-2 bg-[#0a0e14]/60 backdrop-blur-xl rounded-t-[2rem] z-50 no-border tonal-shift shadow-[0_-8px_32px_rgba(31,40,130,0.1)]"

    // We will use md:hidden for profile, so let's check if it's profile to add md:hidden,
    // or just always use md:hidden if we want a consistent mobile-only bottom bar.
    // Wait, the prompt says "remove from all pages and change it to a action-bar.js". Let's unify it.

    let isProfile = currentPath.includes("profile.html");

    navElement.className = (isProfile ? "md:hidden " : "") + "fixed bottom-0 left-0 w-full h-20 flex justify-around items-center px-4 pb-2 bg-[#0a0e14]/60 backdrop-blur-xl rounded-t-[2rem] z-50 shadow-[0_-8px_32px_rgba(31,40,130,0.1)]";

    navItems.forEach(item => {
        const isActive = item.activePaths.some(p => currentPath.endsWith(p)) ||
                         (currentPath.endsWith('/') && item.name === 'Feed'); // default to feed for root

        const a = document.createElement('a');

        if (isActive) {
            a.className = "flex flex-col items-center justify-center text-[#ff8f6f] bg-[#ff7851]/20 rounded-full px-5 py-1 active:scale-90 transition-all duration-200";
            a.href = item.link;
            a.innerHTML = `
                <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">${item.icon}</span>
                <span class="font-['Be_Vietnam_Pro'] text-[10px] font-bold tracking-wide uppercase">${item.name}</span>
            `;
        } else {
            a.className = "flex flex-col items-center justify-center text-[#929bfa] hover:text-[#eeacff] transition-all active:scale-90 duration-200";
            a.href = item.link;
            a.innerHTML = `
                <span class="material-symbols-outlined">${item.icon}</span>
                <span class="font-['Be_Vietnam_Pro'] text-[10px] font-bold tracking-wide uppercase">${item.name}</span>
            `;
        }
        navElement.appendChild(a);
    });

    document.body.appendChild(navElement);
});
