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
        raise ValueError("Missing APP_LOGIN or APP_PASSWORD in .env file")
    return login, password

def run_tests():
    login, password = load_credentials()
    base_url = "http://127.0.0.1:3050"

    print("🚀 Starting Playwright Mobile & Desktop E2E Test Suite...")

    with sync_playwright() as p:
        # Launch Chromium headless
        browser = p.chromium.launch(headless=True)

        # -------------------------------------------------------------
        # TEST 1: MOBILE VIEWPORT (iPhone 14 / Mobile Safari simulation)
        # -------------------------------------------------------------
        print("\n📱 [Test 1] Testing Mobile Viewport (390x844)...")
        context_mobile = browser.new_context(
            viewport={'width': 390, 'height': 844},
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
            is_mobile=True,
            has_touch=True
        )
        page = context_mobile.new_page()

        # 1.1 Load Login Page
        page.goto(base_url)
        page.wait_for_selector('input[type="text"]')
        print("  ✓ Login page loaded successfully")

        # 1.2 Perform Login
        page.fill('input[type="text"]', login)
        page.fill('input[type="password"]', password)
        page.click('button[type="submit"]')

        # 1.3 Wait for workspace to load
        page.wait_for_selector('header')
        page.wait_for_selector('textarea')
        print("  ✓ Authenticated and navigated to main workspace")

        # 1.4 Check mobile header and hamburger menu visibility
        hamburger_btn = page.locator('button[aria-label="Открыть список проектов"]')
        expect(hamburger_btn).to_be_visible()
        print("  ✓ Hamburger menu button is visible on mobile")

        # 1.5 Verify sidebar drawer is initially closed (off-screen)
        sidebar = page.locator('aside')
        expect(sidebar).to_have_class(re.compile(r'-translate-x-full'))
        print("  ✓ Sidebar drawer is properly closed off-screen on mobile load")

        # 1.6 Open drawer by tapping hamburger button
        hamburger_btn.click()
        page.wait_for_timeout(300) # Wait for CSS transition
        expect(sidebar).to_have_class(re.compile(r'translate-x-0'))
        
        # Backdrop overlay should be visible
        backdrop = page.locator('div[aria-hidden="true"]')
        expect(backdrop).to_be_visible()
        print("  ✓ Hamburger click opens sidebar drawer and mobile backdrop overlay")

        # 1.7 Take screenshot of open drawer on mobile
        page.screenshot(path=str(SCREENSHOTS_DIR / "mobile_drawer_open.png"))
        print(f"  ✓ Saved screenshot: {SCREENSHOTS_DIR / 'mobile_drawer_open.png'}")

        # 1.8 Verify projects list rendered in drawer
        project_buttons = sidebar.locator('button:has-text("/")')
        project_count = project_buttons.count()
        assert project_count > 0, "No project items found in drawer"
        print(f"  ✓ Found {project_count} projects in mobile navigation drawer")

        # 1.9 Tap second project to switch project and auto-close drawer
        if project_count > 1:
            second_project = project_buttons.nth(1)
            second_project_text = second_project.inner_text().split('\n')[0].strip()
            second_project.click()
            page.wait_for_timeout(300)
            
            # Assert drawer auto-closed
            expect(sidebar).to_have_class(re.compile(r'-translate-x-full'))
            print(f"  ✓ Drawer auto-closed upon project selection: '{second_project_text}'")

        # 1.10 Test theme toggle on mobile
        # Reopen drawer to access theme switcher or check current theme
        hamburger_btn.click()
        page.wait_for_timeout(300)
        
        theme_btn = sidebar.locator('button[title*="тему"]')
        expect(theme_btn).to_be_visible()
        
        initial_is_dark = page.evaluate("() => document.documentElement.classList.contains('dark')")
        theme_btn.click()
        page.wait_for_timeout(200)
        new_is_dark = page.evaluate("() => document.documentElement.classList.contains('dark')")
        assert initial_is_dark != new_is_dark, "Theme class did not toggle on HTML element"
        print(f"  ✓ Theme toggled successfully (dark was {initial_is_dark} -> now {new_is_dark})")

        # Toggle back to original
        theme_btn.click()
        page.wait_for_timeout(200)

        # Close drawer using mobile close 'X' button
        close_btn = sidebar.locator('button[title="Закрыть меню"]')
        close_btn.click()
        page.wait_for_timeout(300)
        expect(sidebar).to_have_class(re.compile(r'-translate-x-full'))
        print("  ✓ Drawer closed via 'X' button")

        # 1.11 Test Mobile Prompt Input & Shortcut Chips
        chip = page.locator('button:has-text("/plan")')
        expect(chip).to_be_visible()
        chip.click()
        
        textarea = page.locator('textarea')
        val = textarea.input_value()
        assert "/plan" in val, "Chip did not insert text into prompt textarea"
        print("  ✓ Mobile shortcut chips responsive and populate textarea correctly")

        # Test options toggle (mode / effort popover)
        options_toggle = page.locator('button[title="Параметры выполнения"]')
        expect(options_toggle).to_be_visible()
        options_toggle.click()
        page.wait_for_timeout(200)
        select_mode = page.locator('select').first
        expect(select_mode).to_be_visible()
        print("  ✓ Execution options popover renders smoothly on mobile")
        options_toggle.click() # Close options popover

        # Clear textarea
        textarea.fill('')

        # 1.12 Test Destructive Prompt Security Shielding on Mobile
        textarea.fill('rm -rf /')
        send_btn = page.locator('button[title="Отправить (Enter)"]')
        send_btn.click()
        page.wait_for_selector('text=Система безопасности заблокировала запрос', timeout=5000)
        print("  ✓ Prompt injection / destructive command blocked and security banner rendered on mobile")

        # Take mobile workspace screenshot with security alert
        page.screenshot(path=str(SCREENSHOTS_DIR / "mobile_chat_view.png"))
        print(f"  ✓ Saved mobile screenshot: {SCREENSHOTS_DIR / 'mobile_chat_view.png'}")

        context_mobile.close()

        # -------------------------------------------------------------
        # TEST 2: DESKTOP VIEWPORT (1280x800)
        # -------------------------------------------------------------
        print("\n🖥️ [Test 2] Testing Desktop Viewport (1280x800)...")
        context_desktop = browser.new_context(viewport={'width': 1280, 'height': 800})
        page_desk = context_desktop.new_page()

        page_desk.goto(base_url)
        page_desk.fill('input[type="text"]', login)
        page_desk.fill('input[type="password"]', password)
        page_desk.click('button[type="submit"]')

        page_desk.wait_for_selector('header')
        
        # In desktop mode, hamburger button should be hidden (md:hidden)
        hamburger_desk = page_desk.locator('button[aria-label="Открыть список проектов"]')
        expect(hamburger_desk).not_to_be_visible()
        print("  ✓ Hamburger menu button is hidden on desktop (md:hidden)")

        # Sidebar is statically visible in layout
        sidebar_desk = page_desk.locator('aside')
        expect(sidebar_desk).to_be_visible()
        print("  ✓ Sidebar is statically visible on desktop")

        page_desk.screenshot(path=str(SCREENSHOTS_DIR / "desktop_view.png"))
        print(f"  ✓ Saved desktop screenshot: {SCREENSHOTS_DIR / 'desktop_view.png'}")

        context_desktop.close()
        browser.close()

    print("\n🎉 ALL PLAYWRIGHT RESPONSIVE TESTS PASSED SUCCESSFULLY! 100% GREEN.")

if __name__ == "__main__":
    try:
        run_tests()
    except Exception as e:
        print(f"\n❌ Test failed: {e}", file=sys.stderr)
        sys.exit(1)
