import os
import re

files = ["index.html", "listings.html", "leagues.html", "profile.html", "squads.html", "game-details.html"]

STANDARD_HEADER = """<!-- TopAppBar -->
<header class="fixed top-0 w-full z-50 bg-[#0a0e14] dark:bg-[#0a0e14] bg-gradient-to-b from-[#0f141a] to-transparent">
<div class="flex justify-between items-center px-6 py-4 w-full">
<div class="flex items-center gap-4">
<button id="menu-btn" class="text-[#ff8f6f] active:scale-95 transition-transform duration-150 p-2 -ml-2 rounded-full hover:bg-primary/10">
<span class="material-symbols-outlined">menu</span>
</button>
<span class="text-2xl font-black italic tracking-tighter text-[#ff8f6f] uppercase font-headline">Liga PH</span>
</div>
<div class="flex items-center gap-6">
<nav class="hidden md:flex gap-8 font-headline font-bold tracking-tight">
<a class="text-[#a8abb3] hover:text-[#ff7851] transition-colors duration-200" href="index.html">Feed</a>
<a class="text-[#a8abb3] hover:text-[#ff7851] transition-colors duration-200" href="listings.html">Games</a>
<a class="text-[#a8abb3] hover:text-[#ff7851] transition-colors duration-200" href="leagues.html">Leagues</a>
<a class="text-[#a8abb3] hover:text-[#ff7851] transition-colors duration-200" href="squads.html">Squads</a>
<a class="text-[#a8abb3] hover:text-[#ff7851] transition-colors duration-200" href="profile.html">Profile</a>
</nav>
<a href="profile.html" class="block w-10 h-10 rounded-full overflow-hidden border-2 border-primary hover:border-primary-fixed-dim transition-colors active:scale-95">
<img alt="User profile" class="w-full h-full object-cover" data-alt="close-up portrait of a young athletic man with a confident expression in cinematic urban lighting" src="https://lh3.googleusercontent.com/aida-public/AB6AXuD4xEx32oW2W6t08XTsDz-QyYMAlcDLnVVwe-lI-ou6rKuiLBjtoGesccKu_3fIZddCHjKjbkv5--Dw9ht6dsnC1B_IGmjOLbwqr18zgXuRZ7XCod5rC2um6ApFj-HeGJ9rHGLKTnGnF_oe_nSP5F2L5PuRGe-LeupfRGQMIauo4N12_rMAOq3-6jfFMtzBuAc1kC1aMEkn0dUqWdsSc94_u_fYRRigqDa3sSPCaYE4jH9midOwLvgGZzmtlmETgwFg1ObiFshTs6U"/>
</a>
</div>
</div>
</header>"""

DETAILS_HEADER = """<!-- TopAppBar -->
<header class="fixed top-0 w-full z-50 bg-[#0a0e14] dark:bg-[#0a0e14] bg-gradient-to-b from-[#0f141a] to-transparent">
<div class="flex justify-between items-center px-6 py-4 w-full">
<div class="flex items-center gap-4">
<a href="listings.html" class="text-[#a8abb3] hover:text-[#ff7851] active:scale-95 transition-all duration-150 p-2 -ml-2 rounded-full hover:bg-primary/10">
<span class="material-symbols-outlined">arrow_back</span>
</a>
<span class="text-2xl font-black italic tracking-tighter text-[#ff8f6f] uppercase font-headline">Liga PH</span>
</div>
<div class="flex items-center gap-6">
<a href="profile.html" class="block w-10 h-10 rounded-full overflow-hidden border-2 border-primary hover:border-primary-fixed-dim transition-colors active:scale-95">
<img alt="User profile" class="w-full h-full object-cover" data-alt="close-up portrait of a young athletic man with a confident expression in cinematic urban lighting" src="https://lh3.googleusercontent.com/aida-public/AB6AXuD4xEx32oW2W6t08XTsDz-QyYMAlcDLnVVwe-lI-ou6rKuiLBjtoGesccKu_3fIZddCHjKjbkv5--Dw9ht6dsnC1B_IGmjOLbwqr18zgXuRZ7XCod5rC2um6ApFj-HeGJ9rHGLKTnGnF_oe_nSP5F2L5PuRGe-LeupfRGQMIauo4N12_rMAOq3-6jfFMtzBuAc1kC1aMEkn0dUqWdsSc94_u_fYRRigqDa3sSPCaYE4jH9midOwLvgGZzmtlmETgwFg1ObiFshTs6U"/>
</a>
</div>
</div>
</header>"""

for file in files:
    with open(file, "r") as f:
        content = f.read()

    main_index = content.find("<main")
    if main_index == -1:
        continue

    header_start = content.find("<header")
    comment_start = content.rfind("<!-- TopAppBar -->", 0, header_start)
    if comment_start != -1 and comment_start > content.find("<body"):
        start_idx = comment_start
    else:
        start_idx = header_start

    header_end = content.find("</header>") + len("</header>")

    if start_idx == -1 or header_end == -1:
        nav_start = content.find("<nav")
        if nav_start != -1 and nav_start < main_index:
            nav_end = content.find("</nav>") + len("</nav>")
            start_idx = content.rfind("<!--", 0, nav_start)
            if start_idx == -1 or start_idx < content.find("<body"):
                start_idx = nav_start
            header_end = nav_end

    if start_idx != -1 and header_end != -1:
        new_header = DETAILS_HEADER if file == "game-details.html" else STANDARD_HEADER
        content = content[:start_idx] + new_header + content[header_end:]

    if "<script src=\"sidebar.js\"></script>" not in content:
        content = content.replace("</body>", "<script src=\"sidebar.js\"></script>\n</body>")

    with open(file, "w") as f:
        f.write(content)

print("Headers standardized.")
