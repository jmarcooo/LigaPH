with open("auth-ui.js", "r") as f:
    content = f.read()

# Completely rewrite the handleGoogleSubmit function to not use window.firebaseAuthAPI and not use setTimeout
import re

target = r"async function handleGoogleSubmit\(event\) \{[\s\S]*?errorMsg\.classList\.remove\('hidden'\);\n            \}\n        \}"
replacement = """window.handleGoogleSubmit = async function(event) {
            event.preventDefault();
            errorMsg.classList.add('hidden');

            const result = await handleGoogleAuth();

            if (result.success) {
                window.location.href = 'feeds.html';
            } else {
                errorMsg.textContent = result.error;
                errorMsg.classList.remove('hidden');
            }
        }"""

content = re.sub(target, replacement, content)

target_auth_submit = r"window\.handleAuthSubmit = async function\(e\) \{[\s\S]*?errorMsg\.classList\.remove\('hidden'\);\n                submitBtnText\.textContent = currentAuthMode === 'login' \? 'Log In' : 'Create Account';\n            \}\n        \}"
replacement_auth_submit = """window.handleAuthSubmit = async function(e) {
            e.preventDefault();
            errorMsg.classList.add('hidden');

            const email = document.getElementById('auth-email').value;
            const password = document.getElementById('auth-password').value;
            const name = document.getElementById('auth-name').value;
            const submitBtnText = document.getElementById('auth-submit-text');

            submitBtnText.textContent = 'Please wait...';

            let result;
            if (currentAuthMode === 'signup') {
                result = await handleSignup(email, password, name);
            } else {
                result = await handleLogin(email, password);
            }

            if (result.success) {
                window.location.href = 'feeds.html';
            } else {
                errorMsg.textContent = result.error;
                errorMsg.classList.remove('hidden');
                submitBtnText.textContent = currentAuthMode === 'login' ? 'Log In' : 'Create Account';
            }
        }"""

content = re.sub(target_auth_submit, replacement_auth_submit, content)

# Also remove the trailing </script>
content = content.replace("</script>", "")

with open("auth-ui.js", "w") as f:
    f.write(content)
