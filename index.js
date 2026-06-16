import { auth, db } from './firebase-setup.js'; // MUST EXPORT 'db' FROM FIREBASE SETUP!
import { onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { handleGoogleAuth } from './auth.js';
import { metroManilaCities } from './locations.js';

document.addEventListener('DOMContentLoaded', () => {

    // 1. AUTH STATE GUARD: Immediately redirect logged-in users to home.html
    onAuthStateChanged(auth, (user) => {
        if (user) {
            window.location.replace('home.html');
        }
    });

    // 2. REGISTER SERVICE WORKER
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').catch(() => {}); 
        });
    }

    // 3. ATTACH GOOGLE AUTH EVENTS
    document.getElementById('google-login-btn')?.addEventListener('click', handleGoogleAuth);
    document.getElementById('google-signup-btn')?.addEventListener('click', handleGoogleAuth);

    // 4. POPULATE CITY DROPDOWN
    const locationSelect = document.getElementById('signup-location');
    if (locationSelect && metroManilaCities) {
        metroManilaCities.forEach(city => {
            const option = document.createElement('option');
            option.value = city; 
            option.textContent = city;
            locationSelect.appendChild(option);
        });
    }

    // 5. MODAL UI LOGIC & ERROR HANDLING
    const authModal = document.getElementById('auth-modal');
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const showLoginBtn = document.getElementById('show-login');
    const showSignupBtn = document.getElementById('show-signup');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const errorContainer = document.getElementById('auth-error-container');

    function showError(message) {
        errorContainer.textContent = message;
        errorContainer.classList.remove('hidden');
    }

    function hideError() {
        errorContainer.classList.add('hidden');
        errorContainer.textContent = '';
    }

    function openAuthModal(mode) {
        hideError();
        authModal.classList.remove('hidden');
        authModal.classList.add('flex'); // Keeps modal centered
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
        setTimeout(() => {
            authModal.classList.add('hidden');
            authModal.classList.remove('flex');
            hideError();
        }, 300);
    }

    // Modal Triggers
    const loginTriggers = ['nav-login-btn', 'hero-login-btn'];
    const signupTriggers = ['nav-signup-btn', 'hero-signup-btn', 'feature-signup-btn'];

    loginTriggers.forEach(id => {
        document.getElementById(id)?.addEventListener('click', () => openAuthModal('login'));
    });

    signupTriggers.forEach(id => {
        document.getElementById(id)?.addEventListener('click', () => openAuthModal('signup'));
    });

    if (closeModalBtn) closeModalBtn.addEventListener('click', closeAuthModal);

    // Toggle Login/Signup Tabs
    if(showLoginBtn && showSignupBtn && loginForm && signupForm) {
        showLoginBtn.addEventListener('click', () => {
            hideError();
            loginForm.classList.remove('hidden'); 
            signupForm.classList.add('hidden');
            showLoginBtn.classList.add('border-primary', 'text-primary');
            showLoginBtn.classList.remove('border-transparent', 'text-gray-500', 'dark:text-gray-400');
            showSignupBtn.classList.add('border-transparent', 'text-gray-500', 'dark:text-gray-400');
            showSignupBtn.classList.remove('border-primary', 'text-primary');
        });

        showSignupBtn.addEventListener('click', () => {
            hideError();
            signupForm.classList.remove('hidden'); 
            loginForm.classList.add('hidden');
            showSignupBtn.classList.add('border-primary', 'text-primary');
            showSignupBtn.classList.remove('border-transparent', 'text-gray-500', 'dark:text-gray-400');
            showLoginBtn.classList.add('border-transparent', 'text-gray-500', 'dark:text-gray-400');
            showLoginBtn.classList.remove('border-primary', 'text-primary');
        });
    }

    // Click outside modal to close
    if (authModal) {
        authModal.addEventListener('click', (e) => {
            if(e.target === authModal) closeAuthModal();
        });
    }

    // Toggle Password Visibility
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

    // 6. FIREBASE REGISTRATION (SIGNUP) LOGIC
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideError();
            
            const submitBtn = document.getElementById('signup-btn');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<span class="material-symbols-outlined animate-spin">sync</span> Creating Account...';
            submitBtn.disabled = true;

            const email = document.getElementById('signup-email').value.trim();
            const password = document.getElementById('signup-password').value;
            const firstName = document.getElementById('signup-first-name').value.trim();
            const lastName = document.getElementById('signup-last-name').value.trim();
            const location = document.getElementById('signup-location').value;
            const homeCourt = document.getElementById('signup-home-court').value.trim();
            const skill = document.getElementById('signup-skill').value;
            const position = document.getElementById('signup-position').value;

            try {
                // Create user in Authentication
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;

                // Save extra details in Firestore 'users' collection
                await setDoc(doc(db, 'users', user.uid), {
                    firstName,
                    lastName,
                    location,
                    homeCourt,
                    skill,
                    position,
                    email,
                    createdAt: new Date().toISOString()
                });

                // Success - onAuthStateChanged will redirect them automatically
            } catch (error) {
                // Restore button and show error
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
                
                if (error.code === 'auth/email-already-in-use') {
                    showError('This email is already in use. Try logging in.');
                } else if (error.code === 'auth/weak-password') {
                    showError('Password should be at least 6 characters.');
                } else {
                    showError(error.message);
                }
            }
        });
    }

    // 7. FIREBASE LOGIN LOGIC
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideError();
            
            const submitBtn = document.getElementById('login-btn');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<span class="material-symbols-outlined animate-spin">sync</span> Logging In...';
            submitBtn.disabled = true;

            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value;

            try {
                await signInWithEmailAndPassword(auth, email, password);
                // Success - onAuthStateChanged will redirect them automatically
            } catch (error) {
                // Restore button and show error
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
                
                if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                    showError('Invalid email or password. Please try again.');
                } else {
                    showError(error.message);
                }
            }
        });
    }
});
