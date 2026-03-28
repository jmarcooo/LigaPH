import { handleSignup, handleLogin, handleGoogleAuth } from './auth.js';

        // Auth Modal Logic
        let currentAuthMode = 'login'; // 'login' or 'signup'

        const modal = document.getElementById('auth-modal');
        const modalContent = document.getElementById('auth-modal-content');
        const title = document.getElementById('auth-title');
        const subtitle = document.getElementById('auth-subtitle');
        const nameField = document.getElementById('name-field-container');
        const submitBtn = document.getElementById('auth-submit-btn');
        const toggleText = document.getElementById('auth-toggle-text');
        const toggleBtn = document.getElementById('auth-toggle-btn');
        const nameInput = document.getElementById('auth-name');

        window.openAuthModal = function(mode = 'login') {
            setAuthMode(mode);

            // Show modal
            modal.classList.remove('opacity-0', 'pointer-events-none');
            modalContent.classList.remove('scale-95');
            modalContent.classList.add('scale-100');
            document.body.style.overflow = 'hidden'; // Prevent scrolling
        }

        window.closeAuthModal = function() {
            // Hide modal
            modal.classList.add('opacity-0', 'pointer-events-none');
            modalContent.classList.remove('scale-100');
            modalContent.classList.add('scale-95');
            document.body.style.overflow = ''; // Restore scrolling
        }

        const submitBtnText = document.getElementById('auth-submit-text');
        const errorMsg = document.getElementById('auth-error-msg');
        const loadingIcon = document.getElementById('auth-loading');

        window.setAuthMode = function(mode) {
            currentAuthMode = mode;
            errorMsg.classList.add('hidden'); // clear errors on switch
            if (mode === 'login') {
                title.textContent = 'Welcome Back';
                subtitle.textContent = 'Log in to hit the court';
                nameField.classList.add('hidden');
                nameInput.removeAttribute('required');
                if (submitBtnText) submitBtnText.textContent = 'Log In';
                toggleText.textContent = "Don't have an account?";
                toggleBtn.textContent = 'Sign up';
            } else {
                title.textContent = 'Join the League';
                subtitle.textContent = 'Create your player profile';
                nameField.classList.remove('hidden');
                nameInput.setAttribute('required', 'true');
                if (submitBtnText) submitBtnText.textContent = 'Create Account';
                toggleText.textContent = 'Already have an account?';
                toggleBtn.textContent = 'Log in';
            }
        }

        window.toggleAuthMode = function() {
            setAuthMode(currentAuthMode === 'login' ? 'signup' : 'login');
        }

        async function handleAuthSubmit(event) {
            event.preventDefault();

            errorMsg.classList.add('hidden');
            loadingIcon.classList.remove('hidden');
            submitBtnText.textContent = currentAuthMode === 'login' ? 'Logging in...' : 'Creating Account...';
            submitBtn.disabled = true;

            const email = document.getElementById('auth-email').value;
            const password = document.getElementById('auth-password').value;
            const name = document.getElementById('auth-name').value;

            // Wait for auth.js to load just in case (we use module script)
            if (typeof window.firebaseAuthAPI === 'undefined') {
                // If the module hasn't populated window.firebaseAuthAPI yet
                setTimeout(() => handleAuthSubmit(event), 500);
                return;
            }

            let result;
            if (currentAuthMode === 'login') {
                result = await window.firebaseAuthAPI.login(email, password);
            } else {
                result = await window.firebaseAuthAPI.signup(email, password, name);
            }

            loadingIcon.classList.add('hidden');
            submitBtn.disabled = false;

            if (result.success) {
                // Redirect on success
                window.location.href = 'feeds.html';
            } else {
                // Show error
                errorMsg.textContent = result.error;
                errorMsg.classList.remove('hidden');
                submitBtnText.textContent = currentAuthMode === 'login' ? 'Log In' : 'Create Account';
            }
        }

        window.handleGoogleSubmit = async function(event) {
            event.preventDefault();
            errorMsg.classList.add('hidden');

            const result = await handleGoogleAuth();

            if (result.success) {
                window.location.href = 'feeds.html';
            } else {
                errorMsg.textContent = result.error;
                errorMsg.classList.remove('hidden');
            }
        }

        // Close modal when clicking outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeAuthModal();
            }
        });
