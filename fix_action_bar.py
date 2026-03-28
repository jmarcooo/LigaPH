# Fix game-details.html
with open('game-details.html', 'r') as f:
    content = f.read()

content = content.replace('<script src="action-bar.js"></script>', '')
content = content.replace('<script type="module" src="action-bar.js"></script>', '')

with open('game-details.html', 'w') as f:
    f.write(content)

# Fix action-bar.js
with open('action-bar.js', 'r') as f:
    ab_content = f.read()

import re
ab_content = re.sub(r'// Don\'t render action bar on game-details[\s\S]*?return;\n    }', '', ab_content)

with open('action-bar.js', 'w') as f:
    f.write(ab_content)
