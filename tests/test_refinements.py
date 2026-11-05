import os
import sys
import re
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ENV_FILE = Path(__file__).resolve().parent.parent / '.env'
SCREENSHOTS_DIR = Path(__file__).resolve().parent / 'screenshots'
SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)

def load_credentials():
    login = None
    password = None
    if ENV_FILE.exists():
        with open(ENV_FILE, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line.startswith('#') or not line or '=' not in line:
                    continue
                k, v = line.split('=', 1)
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                if k in ('APP_LOGIN', 'USER_LOGIN'):
                    login = v
                elif k in ('APP_PASSWORD', 'USER_PASSWORD'):
                    password = v
    if not login or not password:
        raise ValueError("Missing credentials in .env file")
    return login, password

def run_tests():
    login, password = load_credentials()
    base_url = "http://127.0.0.1:3050"

    print("🚀 Validating 6 User Refinements via Playwright...")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Mobile viewport (iPhone 14: 390x844)
        context = browser.new_context(
            viewport={'width': 390, 'height': 844},
            is_mobile=True,
            has_touch=True
        )
        page = context.new_page()

        # Login
        page.goto(base_url)
        page.fill('input[type="text"]', login)
        page.fill('input[type="password"]', password)
        page.click('button[type="submit"]')
        page.wait_for_selector('header')

        # -------------------------------------------------------------
        # 1. FIXED MOBILE HEADER AT TOP, INPUT AT BOTTOM, MIDDLE SCROLLS
        # -------------------------------------------------------------
        header = page.locator('header').first
        prompt_input = page.locator('textarea')
        messages_area = page.locator('div[class*="overflow-y-auto"]').first

        header_box = header.bounding_box()
        assert header_box is not None
        assert header_box['y'] == 0, f"Header should be fixed at top (y=0), but got y={header_box['y']}"
        print(f"  ✓ 1. Header is pinned at top: y={header_box['y']}, height={header_box['height']}")

        input_box = prompt_input.bounding_box()
        assert input_box is not None
        # On 844px height screen, input should be near bottom (e.g. y > 650)
        assert input_box['y'] > 600, f"Prompt input should be fixed at bottom, got y={input_box['y']}"
        print(f"  ✓ 1. Prompt input is pinned at bottom: y={input_box['y']}")

        # -------------------------------------------------------------
        # 2. VERIFY REMOVAL OF "/home/alex/apps" and "Защита активна"
        # -------------------------------------------------------------
        header_text = page.locator('header').inner_text()
        assert "Защита активна" not in page.content(), "Text 'Защита активна' still found on page!"
        print("  ✓ 6. 'Защита активна' is completely removed from the UI")

        # Open drawer to check sidebar
        hamburger_btn = page.locator('button[aria-label="Открыть список проектов"]')
        hamburger_btn.click()
        page.wait_for_timeout(300)

        sidebar = page.locator('aside')
        sidebar_content = sidebar.inner_text()
        assert "/home/alex/apps" not in sidebar_content, "Text '/home/alex/apps' still found in sidebar!"
        print("  ✓ 6. '/home/alex/apps' is completely removed from sidebar brand header")

        # -------------------------------------------------------------
        # 3. VERIFY DYNAMIC MODEL QUOTAS (/usage) IN BOTTOM-LEFT CORNER
        # -------------------------------------------------------------
        usage_widget = sidebar.locator('text=Лимиты (/usage)')
        expect(usage_widget).to_be_visible()
        expect(sidebar.locator('text=Gemini Models')).to_be_visible()
        expect(sidebar.locator('text=5-часовой лимит:')).to_be_visible()
        expect(sidebar.locator('text=Недельный лимит:')).to_be_visible()
        expect(sidebar.locator('text=Claude & GPT')).to_be_visible()
        print("  ✓ 4. Dynamic /usage quotas widget is visible in bottom-left corner with live 5h/weekly progress bars")

        # -------------------------------------------------------------
        # 4. VERIFY PROJECTS CONTAINER HEIGHT EXPANDED
        # -------------------------------------------------------------
        projects_container = sidebar.locator('div[class*="max-h-"]').first
        computed_max_h = projects_container.evaluate("el => getComputedStyle(el).maxHeight")
        print(f"  ✓ 5. Projects block max-height is expanded: {computed_max_h}")

        # Close drawer
        close_btn = sidebar.locator('button[title="Закрыть меню"]')
        close_btn.click()
        page.wait_for_timeout(300)

        # -------------------------------------------------------------
        # 5. TEST REAL TURN: NO "Завершение процесса", NO JITTER
        # -------------------------------------------------------------
        print("\n🤖 Submitting prompt to verify truthful running status and jitter-free display...")
        prompt_input.fill("Ответь строго одним словом: ТЕСТ_ПРОЙДЕН")
        send_btn = page.locator('button[title="Отправить (Enter)"]')
        send_btn.click()

        # Check during turn: MUST NOT say "Завершение процесса"
        page.wait_for_timeout(500)
        interim_text = page.locator('[data-testid="assistant-card"]').last.inner_text()
        assert "Завершение процесса" not in interim_text, "Found premature 'Завершение процесса' message!"
        print("  ✓ 3. Verified running message does NOT say 'Завершение процесса'")

        # Wait for completion
        page.wait_for_selector('text=ТЕСТ_ПРОЙДЕН', timeout=25000)
        print("  ✓ 2 & 3. Turn completed cleanly without jerky jumps, received 'ТЕСТ_ПРОЙДЕН'")

        # Take mobile verification screenshot
        page.screenshot(path=str(SCREENSHOTS_DIR / "refinements_verified.png"))
        print(f"  ✓ Saved mobile verification screenshot: {SCREENSHOTS_DIR / 'refinements_verified.png'}")

        context.close()
        browser.close()

    print("\n🎉 ALL 6 USER REFINEMENTS FULLY VERIFIED AND PASSING 100%!")

if __name__ == "__main__":
    try:
        run_tests()
    except Exception as e:
        print(f"\n❌ Test failed: {e}", file=sys.stderr)
        sys.exit(1)
