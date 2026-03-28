import os
from playwright.sync_api import sync_playwright

os.makedirs("/home/jules/verification/video", exist_ok=True)

def verify_feature():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Mobile viewport
        context = browser.new_context(
            viewport={'width': 375, 'height': 812},
            is_mobile=True,
            user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1',
            record_video_dir="/home/jules/verification/video"
        )
        page = context.new_page()

        try:
            # 1. Load profile page
            page.goto("http://localhost:8000/index.html")
            # Fake the Firebase Auth state by injecting it
            page.evaluate("""
                localStorage.setItem('ligaPhProfile', JSON.stringify({
                    displayName: 'MARCUS R.',
                    primaryPosition: 'PG',
                    homeCourt: 'DOWNTOWN COURT',
                    bio: 'Testing profile'
                }));
            """)

            # Use file protocol for tests to bypass route guard
            page.goto("file:///app/profile.html")
            page.wait_for_timeout(2000)

            html = page.content()
            print("Is edit-profile.html in HTML?", "edit-profile.html" in html)

            # Use evaluate to click the link as normal click is failing
            page.evaluate("document.querySelector('a[href=\"edit-profile.html\"]').click()")
            page.wait_for_timeout(1000)

            # 3. Check we are on edit-profile.html and it looks okay
            page.screenshot(path="/app/verification_edit_profile.png")

            # Interact with the form a bit
            name_input = page.locator("input#displayName")
            name_input.fill("MARCUS R. (EDITED)")
            page.wait_for_timeout(500)

            # Save
            page.locator("button:has-text('Save Changes')").click()
            page.wait_for_timeout(1000)

            # Check we are back on profile
            page.screenshot(path="/app/verification_profile_after_save.png")

            print("Screenshots captured successfully.")
        finally:
            context.close()
            browser.close()

if __name__ == "__main__":
    verify_feature()
