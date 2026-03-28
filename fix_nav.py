import glob
import re

with open("action-bar.js", "r") as f:
    ab_content = f.read()

# Replace the navItems array declaration with an import
ab_content = "import { navItems } from './nav-config.js';\n\n" + ab_content
ab_content = re.sub(r'const navItems = \[[\s\S]*?\];', '', ab_content)

with open("action-bar.js", "w") as f:
    f.write(ab_content)

with open("sidebar.js", "r") as f:
    sb_content = f.read()

# Replace the navItems array declaration with an import and handle logout
sb_content = "import { navItems } from './nav-config.js';\nimport { handleLogout } from './auth.js';\n\n" + sb_content
sb_content = re.sub(r'const navItems = \[[\s\S]*?\];', '', sb_content)

# Fix logout
target_logout = r"logoutBtn\.addEventListener\('click', \(\) => \{[\s\S]*?\}\);"
replacement_logout = "logoutBtn.addEventListener('click', handleLogout);"
sb_content = re.sub(target_logout, replacement_logout, sb_content)

with open("sidebar.js", "w") as f:
    f.write(sb_content)

files = glob.glob('*.html')
for file in files:
    with open(file, 'r') as f:
        content = f.read()

    content = content.replace('<script src="action-bar.js"></script>', '<script type="module" src="action-bar.js"></script>')
    content = content.replace('<script src="sidebar.js"></script>', '<script type="module" src="sidebar.js"></script>')

    with open(file, 'w') as f:
        f.write(content)
