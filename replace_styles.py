import glob
import re

files = glob.glob('*.html')

# Regex to find the <style>...</style> block in the head
pattern_style = re.compile(r'<style>.*?<\/style>', re.DOTALL)

for file in files:
    with open(file, 'r') as f:
        content = f.read()

    new_content = pattern_style.sub('<link rel="stylesheet" href="global.css" />', content)

    if new_content != content:
        with open(file, 'w') as f:
            f.write(new_content)
        print(f"Updated {file}")
