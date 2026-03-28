with open("auth-ui.js", "r") as f:
    content = f.read()

# Fix the Google Auth replacement we did, it might be messy
content = content.replace(
'''            const result = await handleGoogleAuth();
            if (result) {
                if (result.success) {
                    window.location.href = 'feeds.html';
                } else {
                    alert("Authentication failed: " + result.error);
                }
            } else {
                console.error("firebaseAuthAPI not loaded yet.");
                alert("Authentication system is still loading. Please try again in a moment.");
            }''',
'''            const result = await handleGoogleAuth();
            if (result.success) {
                window.location.href = 'feeds.html';
            } else {
                alert("Authentication failed: " + result.error);
            }'''
)

with open("auth-ui.js", "w") as f:
    f.write(content)
