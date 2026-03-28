with open("profile.html", "r") as f:
    content = f.read()

start_marker = "<!-- Game Card 1 -->"
end_marker = "<!-- Stats & Achievements Sidebar -->"

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx != -1 and end_idx != -1:
    # Just empty out the space-y-4 div that holds the cards
    new_content = content[:start_idx] + '''<div id="profile-games-container" class="space-y-4 text-center text-on-surface-variant p-8">
    <span class="block">No active games.</span>
</div>
</div>
</div>
''' + content[end_idx:]
    with open("profile.html", "w") as f:
        f.write(new_content)
else:
    print("Could not find markers")
