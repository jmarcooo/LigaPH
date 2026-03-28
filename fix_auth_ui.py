with open("auth-ui.js", "r") as f:
    content = f.read()

import re

# We need to wrap all the DOM element queries in DOMContentLoaded or access them lazily
target = r"const modal = document\.getElementById\('auth-modal'\);[\s\S]*?const nameInput = document\.getElementById\('auth-name'\);"
replacement = """
        let modal, modalContent, title, subtitle, nameField, submitBtn, toggleText, toggleBtn, nameInput, errorMsg;

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

            // Close modal when clicking outside
            if(modal) {
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) {
                        window.closeAuthModal();
                    }
                });
            }
        });
"""

content = re.sub(target, replacement, content)

# Remove the old close modal event listener at the end
content = re.sub(r"// Close modal when clicking outside[\s\S]*?\}\);", "", content)

with open("auth-ui.js", "w") as f:
    f.write(content)
