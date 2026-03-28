import glob

files = glob.glob('*.html')

for file in files:
    with open(file, 'r') as f:
        content = f.read()

    # Replace localStorage check with the module import
    old_script_protected = "<script>if(!localStorage.getItem('ligaPhProfile')) window.location.href = 'index.html';</script>"
    old_script_public = "<script>if(localStorage.getItem('ligaPhProfile')) window.location.href = 'feeds.html';</script>"

    new_script = '<script type="module" src="route-guard.js"></script>'

    content = content.replace(old_script_protected, new_script)
    content = content.replace(old_script_public, new_script)

    with open(file, 'w') as f:
        f.write(content)

print("Updated route guards.")
