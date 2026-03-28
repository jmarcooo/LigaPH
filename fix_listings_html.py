with open("listings.html", "r") as f:
    content = f.read()

start_marker = "<!-- Create Pickup Game Option -->"
end_marker = "    </div>\n  </div>\n</div>\n\n<script>"

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx != -1 and end_idx != -1:
    new_content = content[:start_idx] + '''<!-- Form to create a game -->
      <form id="create-game-form" class="space-y-4">
        <div>
          <label class="block text-xs font-bold uppercase tracking-widest text-outline mb-1">Title</label>
          <input id="game-title" type="text" required class="w-full bg-surface-container-highest border border-outline-variant/20 rounded-lg px-4 py-2 text-sm text-on-surface focus:border-primary focus:outline-none transition-colors" placeholder="e.g. 5v5 Full Court Pickup">
        </div>
        <div>
          <label class="block text-xs font-bold uppercase tracking-widest text-outline mb-1">Location</label>
          <input id="game-location" type="text" required class="w-full bg-surface-container-highest border border-outline-variant/20 rounded-lg px-4 py-2 text-sm text-on-surface focus:border-primary focus:outline-none transition-colors" placeholder="e.g. Rucker Park, Harlem">
        </div>
        <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold uppercase tracking-widest text-outline mb-1">Date</label>
              <input id="game-date" type="date" required class="w-full bg-surface-container-highest border border-outline-variant/20 rounded-lg px-4 py-2 text-sm text-on-surface focus:border-primary focus:outline-none transition-colors">
            </div>
            <div>
              <label class="block text-xs font-bold uppercase tracking-widest text-outline mb-1">Time</label>
              <input id="game-time" type="time" required class="w-full bg-surface-container-highest border border-outline-variant/20 rounded-lg px-4 py-2 text-sm text-on-surface focus:border-primary focus:outline-none transition-colors">
            </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold uppercase tracking-widest text-outline mb-1">Type</label>
              <select id="game-type" class="w-full bg-surface-container-highest border border-outline-variant/20 rounded-lg px-4 py-2 text-sm text-on-surface focus:border-primary focus:outline-none transition-colors">
                <option value="5v5">5v5</option>
                <option value="4v4">4v4</option>
                <option value="3v3">3v3</option>
                <option value="Training">Training</option>
                <option value="Tournament">Tournament</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-bold uppercase tracking-widest text-outline mb-1">Total Spots</label>
              <input id="game-spots" type="number" min="2" max="50" required class="w-full bg-surface-container-highest border border-outline-variant/20 rounded-lg px-4 py-2 text-sm text-on-surface focus:border-primary focus:outline-none transition-colors" value="10">
            </div>
        </div>
        <button type="submit" id="submit-game-btn" class="w-full bg-primary text-on-primary-container py-3 rounded-full font-bold uppercase text-sm tracking-widest hover:brightness-110 active:scale-95 transition-all mt-4">
            Post Game
        </button>
      </form>
''' + content[end_idx:]
    with open("listings.html", "w") as f:
        f.write(new_content)
else:
    print("Could not find markers")
