import { handleSignup, handleLogin, handleGoogleAuth } from './auth.js';

// Auth Modal Logic
let currentAuthMode = 'login'; // 'login' or 'signup'

let modal, modalContent, title, subtitle, nameField, submitBtn, toggleText, toggleBtn, nameInput, errorMsg, submitBtnText, loadingIcon;

document.addEventListener('DOMContentLoaded', () => {
    modal = document.getElementById('auth-modal');
    modalContent = document.getElementById('auth-modal-content');
    title = document.getElementById('auth-title');
    subtitle = document.getElementById('auth-subtitle');
    nameField = document.getElementById('name-field-container');
    submitBtn = document.getElementById('auth-submit-btn');
    toggleText = document.getElementById('auth-toggle-text');
    toggleBtn = document.getElementById('auth-toggle-btn');
    nameInput = document.getElementById('auth-name');
    errorMsg = document.getElementById('auth-error-msg');
    submitBtnText = document.getElementById('auth-submit-text');
    loadingIcon = document.getElementById('auth-loading');

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                window.closeAuthModal();
            }
        });
    }
});

window.openAuthModal = function(mode = 'login') {
    window.setAuthMode(mode);

    // Show modal
    if(modal) {
        modal.classList.remove('opacity-0', 'pointer-events-none');
        modalContent.classList.remove('scale-95');
        modalContent.classList.add('scale-100');
        document.body.style.overflow = 'hidden'; // Prevent scrolling
    }
}

window.closeAuthModal = function() {
    // Hide modal
    if(modal) {
        modal.classList.add('opacity-0', 'pointer-events-none');
        modalContent.classList.remove('scale-100');
        modalContent.classList.add('scale-95');
        document.body.style.overflow = ''; // Restore scrolling
    }
}

window.setAuthMode = function(mode) {
    currentAuthMode = mode;
    if(errorMsg) errorMsg.classList.add('hidden'); // clear errors on switch
    if (mode === 'login') {
        if(title) title.textContent = 'Welcome Back';
        if(subtitle) subtitle.textContent = 'Log in to hit the court';
        if(nameField) nameField.classList.add('hidden');
        if(nameInput) nameInput.removeAttribute('required');
        if (submitBtnText) submitBtnText.textContent = 'Log In';
        if(toggleText) toggleText.textContent = "Don't have an account?";
        if(toggleBtn) toggleBtn.textContent = 'Sign up';
    } else {
        if(title) title.textContent = 'Join the League';
        if(subtitle) subtitle.textContent = 'Create your player profile';
        if(nameField) nameField.classList.remove('hidden');
        if(nameInput) nameInput.setAttribute('required', 'true');
        if (submitBtnText) submitBtnText.textContent = 'Create Account';
        if(toggleText) toggleText.textContent = 'Already have an account?';
        if(toggleBtn) toggleBtn.textContent = 'Log in';
    }
}

window.toggleAuthMode = function() {
    window.setAuthMode(currentAuthMode === 'login' ? 'signup' : 'login');
}

window.handleAuthSubmit = async function(event) {
    event.preventDefault();

    if(errorMsg) errorMsg.classList.add('hidden');
    if(loadingIcon) loadingIcon.classList.remove('hidden');
    if(submitBtnText) submitBtnText.textContent = currentAuthMode === 'login' ? 'Logging in...' : 'Creating Account...';
    if(submitBtn) submitBtn.disabled = true;

    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const name = document.getElementById('auth-name').value;

    let result;
    if (currentAuthMode === 'login') {
        result = await handleLogin(email, password);
    } else {
        result = await handleSignup(email, password, name);
    }

    if(loadingIcon) loadingIcon.classList.add('hidden');
    if(submitBtn) submitBtn.disabled = false;

    if (result.success) {
        // Redirect on success
        window.location.href = 'feeds.html';
    } else {
        // Show error
        if(errorMsg) {
            errorMsg.textContent = result.error;
            errorMsg.classList.remove('hidden');
        }
        if(submitBtnText) submitBtnText.textContent = currentAuthMode === 'login' ? 'Log In' : 'Create Account';
    }
}

window.handleGoogleSubmit = async function(event) {
    event.preventDefault();
    if(errorMsg) errorMsg.classList.add('hidden');

    const result = await handleGoogleAuth();

    if (result.success) {
        window.location.href = 'feeds.html';
    } else {
        if(errorMsg) {
            errorMsg.textContent = result.error;
            errorMsg.classList.remove('hidden');
        }
    }
}
