import os

files = ["index.html", "listings.html", "profile.html", "game-details.html"]

for file in files:
    with open(file, "r") as f:
        content = f.read()

    # Add view-transition meta tag if not present
    if '<meta name="view-transition" content="same-origin" />' not in content:
        content = content.replace('<head>', '<head>\n<meta name="view-transition" content="same-origin" />')

    # Remove old bottom nav
    nav_start = content.find("<!-- BottomNavBar")
    if nav_start != -1:
        nav_end = content.find("</nav>", nav_start)
        if nav_end != -1:
            nav_end += len("</nav>")
            content = content[:nav_start] + content[nav_end:]

    # Add action-bar.js
    if '<script src="action-bar.js"></script>' not in content:
        content = content.replace("</body>", "<script src=\"action-bar.js\"></script>\n</body>")

    with open(file, "w") as f:
        f.write(content)

print("Files fixed.")
