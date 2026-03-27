// action-bar.js

document.addEventListener("DOMContentLoaded", () => {
    // Don't render action bar on game-details
    if (window.location.pathname.includes("game-details.html")) {
        return;
    }

    const currentPath = window.location.pathname;

    const navItems = [
        {
            name: "Home",
            icon: "home",
            link: "feeds.html",
            activePaths: ["/feeds.html", "/"]
        },
        {
            name: "Games",
            icon: "sports_basketball",
            link: "listings.html",
            activePaths: ["/listings.html"]
        },
        {
            name: "Squads",
            icon: "groups",
            link: "squads.html",
            activePaths: ["/squads.html"]
        },
        {
            name: "Profile",
            icon: "person",
            link: "profile.html",
            activePaths: ["/profile.html"]
        }
    ];

    const navElement = document.createElement('nav');

    // Update logic to only match exactly "profile.html" to prevent issues
    // with generic "/profile" matching if that was somehow happening.
    let isProfile = currentPath.endsWith("profile.html") || currentPath.endsWith("edit-profile.html");

    navElement.className = (isProfile ? "md:hidden " : "") + "fixed bottom-0 left-0 w-full flex justify-between items-center px-2 pb-6 pt-3 bg-[#0a0e14]/60 backdrop-blur-xl dark:bg-[#0a0e14]/60 rounded-t-[2rem] z-50 border-t border-[#44484f]/20 shadow-[0_-8px_32px_rgba(31,40,130,0.1)]";

    navItems.forEach(item => {
        const isActive = item.activePaths.some(p => currentPath.endsWith(p)) ||
                         (currentPath.endsWith('/') && item.name === 'Home');

        const a = document.createElement('a');

        const baseClass = "flex-1 flex flex-col items-center justify-center h-12 transition-all";

        if (isActive) {
            a.className = `${baseClass} text-[#ff8f6f] group`;
            a.href = item.link;
            a.innerHTML = `
                <div class="bg-[#ff7851]/10 rounded-2xl px-4 min-w-[4rem] py-1 flex flex-col items-center justify-center">
                    <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">${item.icon}</span>
                    <span class="font-['Be_Vietnam_Pro'] text-[10px] font-medium leading-tight">${item.name}</span>
                </div>
            `;
        } else {
            a.className = `${baseClass} text-[#a8abb3] hover:text-[#ff8f6f] active:text-[#ff8f6f]/80`;
            a.href = item.link;
            a.innerHTML = `
                <div class="rounded-2xl px-4 min-w-[4rem] py-1 flex flex-col items-center justify-center transition-colors hover:bg-[#0f141a]">
                    <span class="material-symbols-outlined">${item.icon}</span>
                    <span class="font-['Be_Vietnam_Pro'] text-[10px] font-medium leading-tight">${item.name}</span>
                </div>
            `;
        }
        navElement.appendChild(a);
    });

    document.body.appendChild(navElement);
});
