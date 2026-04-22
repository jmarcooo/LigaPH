import { handleSignup, handleLogin } from './auth.js';

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');

    // ==========================================
    // LOG IN LOGIC
    // ==========================================
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault(); // Stop the page from reloading
            
            const emailInput = document.getElementById('login-email');
            const passwordInput = document.getElementById('login-password');
            const submitBtn = document.getElementById('login-btn');

            const email = emailInput.value.trim();
            const password = passwordInput.value;

            if (submitBtn) {
                submitBtn.textContent = 'LOGGING IN...';
                submitBtn.disabled = true;
            }

            // Call the engine in auth.js
            const result = await handleLogin(email, password);

            if (result.success) {
                window.location.replace('feeds.html');
            } else {
                alert(result.error); // Show error (e.g., wrong password)
                if (submitBtn) {
                    submitBtn.textContent = 'Log In';
                    submitBtn.disabled = false;
                }
            }
        });
    }

    // ==========================================
    // SIGN UP LOGIC
    // ==========================================
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault(); // Stop the page from reloading
            
            const nameInput = document.getElementById('signup-name');
            const emailInput = document.getElementById('signup-email');
            const passwordInput = document.getElementById('signup-password');
            const submitBtn = document.getElementById('signup-btn');

            const name = nameInput.value.trim();
            const email = emailInput.value.trim();
            const password = passwordInput.value;

            if (submitBtn) {
                submitBtn.textContent = 'CREATING...';
                submitBtn.disabled = true;
            }

            // Call the engine in auth.js
            const result = await handleSignup(email, password, name);

            if (result.success) {
                window.location.replace('feeds.html');
            } else {
                alert(result.error); // Show error (e.g., email in use)
                if (submitBtn) {
                    submitBtn.textContent = 'Create Account';
                    submitBtn.disabled = false;
                }
            }
        });
    }
});
