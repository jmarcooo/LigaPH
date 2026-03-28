import glob

# For all html files, replace the specific img tags using default-avatar with styled ones.
files = glob.glob('*.html')

header_img = '<img alt="User profile" class="w-full h-full object-cover" data-alt="close-up portrait of a young athletic man with a confident expression in cinematic urban lighting" src="assets/default-avatar.jpg"/>'
styled_header_img = '<img alt="User profile" class="w-full h-full object-cover mix-blend-luminosity opacity-80" style="filter: sepia(1) hue-rotate(-50deg) saturate(3);" data-alt="close-up portrait of a young athletic man with a confident expression in cinematic urban lighting" src="assets/default-avatar.jpg"/>'

edit_img = '<img class="w-32 h-32 rounded-full object-cover border-4 border-surface" src="assets/default-avatar.jpg" alt="Profile avatar">'
styled_edit_img = '<img class="w-32 h-32 rounded-full object-cover border-4 border-surface mix-blend-luminosity opacity-80" style="filter: sepia(1) hue-rotate(-50deg) saturate(3);" src="assets/default-avatar.jpg" alt="Profile avatar">'

for file in files:
    with open(file, 'r') as f:
        content = f.read()

    content = content.replace(header_img, styled_header_img)
    content = content.replace(edit_img, styled_edit_img)

    # We also have the one in profile.js, let's inject a class update
    with open(file, 'w') as f:
        f.write(content)

# Update profile.js to ensure the avatar img el gets the right classes and style if using default
with open('profile.js', 'r') as f:
    js_content = f.read()

# Replace the block:
#     if (avatarContainerEl && avatarImgEl) {
#         avatarContainerEl.classList.remove('animate-pulse', 'bg-surface-container-highest');
#         avatarImgEl.src = profile.photoURL || "assets/default-avatar.jpg";
#         avatarImgEl.classList.remove('hidden');
#     }
import re
target = r"if \(avatarContainerEl && avatarImgEl\) \{[\s\S]*?avatarImgEl\.classList\.remove\('hidden'\);\s*\}"

replacement = """if (avatarContainerEl && avatarImgEl) {
        avatarContainerEl.classList.remove('animate-pulse', 'bg-surface-container-highest');
        if (profile.photoURL) {
            avatarImgEl.src = profile.photoURL;
            avatarImgEl.classList.remove('mix-blend-luminosity', 'opacity-80');
            avatarImgEl.style.filter = '';
        } else {
            avatarImgEl.src = "assets/default-avatar.jpg";
            avatarImgEl.classList.add('mix-blend-luminosity', 'opacity-80');
            avatarImgEl.style.filter = 'sepia(1) hue-rotate(-50deg) saturate(3)';
        }
        avatarImgEl.classList.remove('hidden');
    }"""

js_content = re.sub(target, replacement, js_content)

with open('profile.js', 'w') as f:
    f.write(js_content)

print("Replaced CSS filters for avatars.")
