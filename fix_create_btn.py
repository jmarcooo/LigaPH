with open("listings.html", "r") as f:
    content = f.read()

content = content.replace(
    '''<!-- Create Modal Overlay -->''',
    '''<!-- Create Game FAB -->
<button id="create-btn" class="fixed bottom-24 right-4 md:right-8 w-14 h-14 bg-primary text-on-primary-container rounded-full shadow-[0_8px_32px_rgba(255,143,111,0.3)] flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-40">
    <span class="material-symbols-outlined text-3xl">add</span>
</button>

<!-- Create Modal Overlay -->'''
)

with open("listings.html", "w") as f:
    f.write(content)
