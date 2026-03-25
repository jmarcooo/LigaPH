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
            name: "Courts",
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

    navElement.className = (isProfile ? "md:hidden " : "") + "fixed bottom-0 left-0 w-full flex justify-around items-center px-4 pb-6 pt-3 bg-[#0a0e14]/60 backdrop-blur-xl dark:bg-[#0a0e14]/60 rounded-t-[2rem] z-50 border-t border-[#44484f]/20 shadow-[0_-8px_32px_rgba(31,40,130,0.1)]";

    navItems.forEach(item => {
        const isActive = item.activePaths.some(p => currentPath.endsWith(p)) ||
                         (currentPath.endsWith('/') && item.name === 'Home'); // default root

        const a = document.createElement('a');

        if (isActive) {
            a.className = "flex flex-col items-center justify-center text-[#ff8f6f] bg-[#ff7851]/10 rounded-2xl px-4 py-1 scale-105 active:scale-95 transition-transform";
            a.href = item.link;
            a.innerHTML = `
                <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">${item.icon}</span>
                <span class="font-['Be_Vietnam_Pro'] text-[10px] font-medium">${item.name}</span>
            `;
        } else {
            a.className = "flex flex-col items-center justify-center text-[#a8abb3] hover:bg-[#0f141a] transition-all scale-105 active:scale-95 transition-transform";
            a.href = item.link;
            a.innerHTML = `
                <span class="material-symbols-outlined">${item.icon}</span>
                <span class="font-['Be_Vietnam_Pro'] text-[10px] font-medium">${item.name}</span>
            `;
        }
        navElement.appendChild(a);
    });

    document.body.appendChild(navElement);
});
