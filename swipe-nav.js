document.addEventListener('DOMContentLoaded', () => {
    // The exact order of your bottom navigation bar
    const navOrder = ['home', 'feeds', 'listings', 'squads'];
    
    let startX = 0;
    let startY = 0;
    let endX = 0;
    let endY = 0;
    let isSwiping = false;

    const minSwipeDistance = 80; // Slightly lower for easier swiping
    const maxVerticalWander = 60; // Allow a bit more diagonal movement

    // --- 1. TOUCH SUPPORT (MOBILE) ---
    document.addEventListener('touchstart', e => {
        startX = e.changedTouches[0].screenX;
        startY = e.changedTouches[0].screenY;
    }, { passive: true });

    document.addEventListener('touchend', e => {
        if (shouldIgnoreSwipe(e.target)) return;
        endX = e.changedTouches[0].screenX;
        endY = e.changedTouches[0].screenY;
        handleSwipe();
    }, { passive: true });

    // --- 2. MOUSE SUPPORT (DESKTOP TESTING) ---
    document.addEventListener('mousedown', e => {
        isSwiping = true;
        startX = e.clientX;
        startY = e.clientY;
    });

    document.addEventListener('mouseup', e => {
        if (!isSwiping || shouldIgnoreSwipe(e.target)) return;
        isSwiping = false;
        endX = e.clientX;
        endY = e.clientY;
        handleSwipe();
    });

    // Prevent random bugs if mouse leaves the window
    document.addEventListener('mouseleave', () => { isSwiping = false; });

    // --- 3. SWIPE LOGIC ---
    function shouldIgnoreSwipe(target) {
        // Don't swipe if they are trying to scroll filters or type in an input
        return target.closest('.overflow-x-auto') || 
               target.closest('input') || 
               target.closest('textarea') || 
               target.closest('button') ||
               target.closest('.leaflet-container'); // Ignore map drags
    }

    function handleSwipe() {
        const deltaX = endX - startX;
        const deltaY = Math.abs(endY - startY);

        // Check if it was mostly horizontal and long enough
        if (Math.abs(deltaX) > minSwipeDistance && deltaY < maxVerticalWander) {
            
            // Smarter URL matching (ignores .html or query parameters)
            const currentPath = window.location.pathname.toLowerCase();
            let currentIndex = navOrder.findIndex(route => currentPath.includes(route));
            
            // Default to Home if root path
            if (currentIndex === -1 && (currentPath === '/' || currentPath.endsWith('index.html'))) {
                currentIndex = 0; 
            }

            if (currentIndex === -1) return; // Not on a main tab

            if (deltaX < 0) {
                // Swiped Left (<--) -> Go to Next Tab (Right)
                if (currentIndex < navOrder.length - 1) {
                    document.documentElement.classList.remove('swipe-right-anim');
                    window.location.href = navOrder[currentIndex + 1] + '.html';
                }
            } else {
                // Swiped Right (-->) -> Go to Previous Tab (Left)
                if (currentIndex > 0) {
                    document.documentElement.classList.add('swipe-right-anim');
                    sessionStorage.setItem('swipeDirection', 'right'); 
                    window.location.href = navOrder[currentIndex - 1] + '.html';
                }
            }
        }
    }

    // --- 4. ANIMATION RESTORE ---
    // Make sure the reverse animation plays when the new page loads
    if (sessionStorage.getItem('swipeDirection') === 'right') {
        document.documentElement.classList.add('swipe-right-anim');
        sessionStorage.removeItem('swipeDirection');
    } else {
        document.documentElement.classList.remove('swipe-right-anim');
    }
});
