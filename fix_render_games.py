with open("render-games.js", "r") as f:
    content = f.read()

content = content.replace(
    "import { fetchGames } from './games.js';",
    "import { fetchGames, postGame } from './games.js';"
)

append_content = """

document.addEventListener('DOMContentLoaded', () => {
    const createForm = document.getElementById('create-game-form');
    if (createForm) {
        createForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitBtn = document.getElementById('submit-game-btn');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = 'POSTING...';
            submitBtn.disabled = true;

            // Get host from local storage profile
            let hostName = "Unknown Host";
            try {
                const profileStr = localStorage.getItem('ligaPhProfile');
                if (profileStr) {
                    const profileObj = JSON.parse(profileStr);
                    hostName = profileObj.displayName || "Unknown Host";
                }
            } catch (err) {}

            const gameData = {
                title: document.getElementById('game-title').value,
                location: document.getElementById('game-location').value,
                date: document.getElementById('game-date').value,
                time: document.getElementById('game-time').value,
                type: document.getElementById('game-type').value,
                spotsTotal: parseInt(document.getElementById('game-spots').value, 10),
                spotsFilled: 1, // Host takes one spot
                host: hostName
            };

            const result = await postGame(gameData);

            if (result.success) {
                // Close modal
                const modal = document.getElementById('create-modal');
                const modalContent = modal.querySelector('div');
                modal.classList.add('opacity-0', 'pointer-events-none');
                modalContent.classList.remove('scale-100');
                modalContent.classList.add('scale-95');

                // Reset form
                createForm.reset();

                // Re-render games list to show the newly posted game
                await renderGames();
            } else {
                alert("Failed to post game: " + result.error);
            }

            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        });
    }
});
"""

with open("render-games.js", "w") as f:
    f.write(content + append_content)
