// swipe-nav.js
document.addEventListener('DOMContentLoaded', () => {
    // The exact order of your bottom navigation bar
    const navOrder = ['home.html', 'feeds.html', 'listings.html', 'squads.html'];
    
    let touchStartX = 0;
    let touchEndX = 0;
    let touchStartY = 0;
    let touchEndY = 0;

    const minSwipeDistance = 100; // Require a deliberate swipe
    const maxVerticalWander = 50; // Prevent diagonal swipes from triggering

    document.addEventListener('touchstart', e => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    document.addEventListener('touchend', e => {
        // Ignore swipes if the user is interacting with a horizontal scrolling element (like filter chips)
        if (e.target.closest('.overflow-x-auto') || e.target.closest('input') || e.target.closest('textarea')) return;

        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        handleSwipe();
    }, { passive: true });

    function handleSwipe() {
        const deltaX = touchEndX - touchStartX;
        const deltaY = Math.abs(touchEndY - touchStartY);

        // Check if it was mostly horizontal and long enough
        if (Math.abs(deltaX) > minSwipeDistance && deltaY < maxVerticalWander) {
            
            const currentPath = window.location.pathname;
            let currentIndex = navOrder.findIndex(route => currentPath.includes(route));
            
            if (currentIndex === -1) return; // Not on a main tab

            if (deltaX < 0) {
                // Swiped Left -> Go to Next Tab
                if (currentIndex < navOrder.length - 1) {
                    document.documentElement.classList.remove('swipe-right-anim');
                    window.location.href = navOrder[currentIndex + 1];
                }
            } else {
                // Swiped Right -> Go to Previous Tab
                if (currentIndex > 0) {
                    // Add class to reverse the animation direction
                    document.documentElement.classList.add('swipe-right-anim');
                    sessionStorage.setItem('swipeDirection', 'right'); // Save for the next page load
                    window.location.href = navOrder[currentIndex - 1];
                }
            }
        }
    }

    // Apply the correct animation class when the new page loads
    if (sessionStorage.getItem('swipeDirection') === 'right') {
        document.documentElement.classList.add('swipe-right-anim');
        sessionStorage.removeItem('swipeDirection');
    } else {
        document.documentElement.classList.remove('swipe-right-anim');
    }
});
