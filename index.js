import { auth } from './firebase-setup.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { handleGoogleAuth } from './auth.js';
import { metroManilaCities } from './locations.js';

document.addEventListener('DOMContentLoaded', () => {

    // 1. AUTH STATE GUARD: Immediately redirect logged-in users to home.html
    onAuthStateChanged(auth, (user) => {
        if (user) {
            window.location.replace('home.html');
        }
    });

    // 2. REGISTER SERVICE WORKER (For PWA and Push Notifications)
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').catch(() => {}); 
        });
    }

    // 3. PWA INSTALLATION LOGIC
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
    });

    const installBtn = document.getElementById('install-pwa-btn');
    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                await deferredPrompt.userChoice;
                deferredPrompt = null;
            } else {
                alert("To install on iOS: Tap the Share icon at the bottom of Safari, then select 'Add to Home Screen'.\n\nIf you are on Android, you may have already installed the app.");
            }
        });
    }

    // 4. ATTACH GOOGLE AUTH EVENTS
    document.getElementById('google-login-btn')?.addEventListener('click', handleGoogleAuth);
    document.getElementById('google-signup-btn')?.addEventListener('click', handleGoogleAuth);

    // 5. POPULATE CITY DROPDOWN
    const locationSelect = document.getElementById('signup-location');
    if (locationSelect && metroManilaCities) {
        metroManilaCities.forEach(city => {
            const option = document.createElement('option');
            option.value = city; 
            option.textContent = city;
            locationSelect.appendChild(option);
        });
    }

    // 6. MODAL UI LOGIC
    const authModal = document.getElementById('auth-modal');
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const showLoginBtn = document.getElementById('show-login');
    const showSignupBtn = document.getElementById('show-signup');
    const closeModalBtn = document.getElementById('close-modal-btn');

    function openAuthModal(mode) {
        authModal.classList.remove('hidden');
        setTimeout(() => {
            authModal.classList.remove('opacity-0', 'pointer-events-none');
            authModal.querySelector('div').classList.remove('scale-95');
            authModal.querySelector('div').classList.add('scale-100');
            document.body.style.overflow = 'hidden';
        }, 10);

        if (mode === 'signup') {
            showSignupBtn.click();
        } else {
            showLoginBtn.click();
        }
    }

    function closeAuthModal() {
        authModal.classList.add('opacity-0', 'pointer-events-none');
        authModal.querySelector('div').classList.add('scale-95');
        document.body.style.overflow = '';
        setTimeout(() => authModal.classList.add('hidden'), 300);
    }

    // Attach trigger buttons mapping
    const loginTriggers = ['nav-login-btn', 'hero-login-btn'];
    const signupTriggers = ['nav-signup-btn', 'hero-signup-btn', 'feature-signup-btn'];

    loginTriggers.forEach(id => {
        document.getElementById(id)?.addEventListener('click', () => openAuthModal('login'));
    });

    signupTriggers.forEach(id => {
        document.getElementById(id)?.addEventListener('click', () => openAuthModal('signup'));
    });

    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeAuthModal);
    }

    // Toggle between Login and Signup tabs
    if(showLoginBtn && showSignupBtn && loginForm && signupForm) {
        showLoginBtn.addEventListener('click', () => {
            loginForm.classList.remove('hidden'); 
            signupForm.classList.add('hidden');
            showLoginBtn.classList.add('border-primary', 'text-primary');
            showLoginBtn.classList.remove('border-transparent', 'text-on-surface-variant');
            showSignupBtn.classList.add('border-transparent', 'text-on-surface-variant');
            showSignupBtn.classList.remove('border-primary', 'text-primary');
        });

        showSignupBtn.addEventListener('click', () => {
            signupForm.classList.remove('hidden'); 
            loginForm.classList.add('hidden');
            showSignupBtn.classList.add('border-primary', 'text-primary');
            showSignupBtn.classList.remove('border-transparent', 'text-on-surface-variant');
            showLoginBtn.classList.add('border-transparent', 'text-on-surface-variant');
            showLoginBtn.classList.remove('border-primary', 'text-primary');
        });
    }

    // Click outside modal to close
    if (authModal) {
        authModal.addEventListener('click', (e) => {
            if(e.target === authModal) closeAuthModal();
        });
    }

    // 7. TOGGLE PASSWORD VISIBILITY
    document.querySelectorAll('.toggle-password-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = btn.getAttribute('data-target');
            const input = document.getElementById(targetId);
            const icon = btn.querySelector('span');
            
            if (input.type === 'password') {
                input.type = 'text';
                icon.textContent = 'visibility_off';
            } else {
                input.type = 'password';
                icon.textContent = 'visibility';
            }
        });
    });

});
