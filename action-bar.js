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
            link: "index.html",
            activePaths: ["/index.html", "/"]
        },
        {
            name: "Leagues",
            icon: "trophy",
            link: "leagues.html",
            activePaths: ["/leagues.html"]
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
            link: "#",
            activePaths: [] // Not implemented
        },
        {
            name: "Profile",
            icon: "person",
            link: "profile.html",
            activePaths: ["/profile.html"]
        }
    ];

    const navElement = document.createElement('nav');

    // We will use md:hidden for profile, so let's check if it's profile to add md:hidden,
    let isProfile = currentPath.includes("profile.html");

    // Updated container to use grid for equal spacing, or flex-1 for children.
    // Using flex with w-full and flex-1 on children ensures exact equal width spacing.
    navElement.className = (isProfile ? "md:hidden " : "") + "fixed bottom-0 left-0 w-full flex justify-between items-center px-2 pb-6 pt-3 bg-[#0a0e14]/60 backdrop-blur-xl dark:bg-[#0a0e14]/60 rounded-t-[2rem] z-50 border-t border-[#44484f]/20 shadow-[0_-8px_32px_rgba(31,40,130,0.1)]";

    navItems.forEach(item => {
        const isActive = item.activePaths.some(p => currentPath.endsWith(p)) ||
                         (currentPath.endsWith('/') && item.name === 'Home'); // default root

        const a = document.createElement('a');

        // Base classes for equal width and alignment
        const baseClass = "flex-1 flex flex-col items-center justify-center h-12 transition-all active:scale-95";

        if (isActive) {
            a.className = `${baseClass} text-[#ff8f6f] group`;
            a.href = item.link;
            a.innerHTML = `
                <div class="bg-[#ff7851]/10 rounded-2xl px-5 py-1 flex flex-col items-center justify-center">
                    <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">${item.icon}</span>
                    <span class="font-['Be_Vietnam_Pro'] text-[10px] font-medium">${item.name}</span>
                </div>
            `;
        } else {
            a.className = `${baseClass} text-[#a8abb3] hover:text-[#ff8f6f]`;
            a.href = item.link;
            a.innerHTML = `
                <div class="rounded-2xl px-5 py-1 flex flex-col items-center justify-center transition-colors hover:bg-[#0f141a]">
                    <span class="material-symbols-outlined">${item.icon}</span>
                    <span class="font-['Be_Vietnam_Pro'] text-[10px] font-medium">${item.name}</span>
                </div>
            `;
        }
        navElement.appendChild(a);
    });

    document.body.appendChild(navElement);
});
