import glob
import re

files = glob.glob('*.html')

# Regex to find the <script id="tailwind-config">...</script> block
pattern_tailwind = re.compile(r'<script\s+id="tailwind-config">.*?<\/script>', re.DOTALL)

for file in files:
    with open(file, 'r') as f:
        content = f.read()

    new_content = pattern_tailwind.sub('<script src="tailwind-theme.js"></script>', content)

    if new_content != content:
        with open(file, 'w') as f:
            f.write(new_content)
        print(f"Updated {file}")
