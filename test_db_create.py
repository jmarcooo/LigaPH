from playwright.sync_api import sync_playwright

def run_cuj(page):
    page.goto('file:///app/listings.html')

    page.evaluate("localStorage.setItem('ligaPhProfile', JSON.stringify({displayName: 'Jules Tester', reliability: '100%'}))")

    page.reload()
    page.wait_for_timeout(2000)

    # Try using JS click since it might be obscured by the action bar
    page.evaluate("document.querySelector('#create-btn').click()")

    page.wait_for_timeout(1000)

    # Fill form
    page.locator("#game-title").fill("AI Generated Tournament")
    page.locator("#game-location").fill("Digital Court")
    page.locator("#game-date").fill("2026-12-31")
    page.locator("#game-time").fill("14:00")
    page.locator("#game-type").select_option("Tournament")
    page.locator("#game-spots").fill("100")

    page.wait_for_timeout(500)
    page.screenshot(path="/home/jules/verification/screenshots/verification_form.png")

    # Submit
    page.locator("#submit-game-btn").click()

    # Wait for the modal to close and the page to update
    page.wait_for_timeout(3000)

    # We should see our newly seeded game in the grid
    page.screenshot(path="/home/jules/verification/screenshots/verification_success.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            record_video_dir="/home/jules/verification/videos",
            viewport={'width': 1280, 'height': 720}
        )
        page = context.new_page()
        try:
            run_cuj(page)
        finally:
            context.close()
            browser.close()
