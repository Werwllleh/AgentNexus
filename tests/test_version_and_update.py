import os
import sys
import time
import urllib.request
import json
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

def test_version_api(base_url, login, password):
    print("\n[API Test] Verifying Health & Version API endpoints...")
    # 1. Health check
    req = urllib.request.Request(f"{base_url}/api/health")
    with urllib.request.urlopen(req) as res:
        assert res.status == 200
        data = json.loads(res.read())
        assert data.get("status") == "ok"
        assert data.get("app") == "AgentNexus"
        assert "version" in data
        print(f"  ✓ GET /api/health returned 200 OK (app={data['app']}, version={data['version']})")

    # 2. Login to get token
    login_data = json.dumps({"login": login, "password": password}).encode("utf-8")
    req = urllib.request.Request(
        f"{base_url}/api/auth/login",
        data=login_data,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as res:
        token = json.loads(res.read())["token"]
        print("  ✓ Authenticated and obtained JWT session token")

    # 3. Authenticated version check
    req = urllib.request.Request(
        f"{base_url}/api/system/version",
        headers={"Authorization": f"Bearer {token}"}
    )
    with urllib.request.urlopen(req) as res:
        v_data = json.loads(res.read())
        assert v_data.get("success") is True
        assert "currentVersion" in v_data
        assert "currentCommit" in v_data
        assert "branch" in v_data
        print(f"  ✓ GET /api/system/version: v{v_data['currentVersion']} (commit: {v_data['currentCommit']}, branch: {v_data['branch']})")

    # 4. Unauthorized update prevention
    try:
        req = urllib.request.Request(
            f"{base_url}/api/system/update",
            data=b"{}",
            headers={"Content-Type": "application/json"}
        )
        urllib.request.urlopen(req)
        assert False, "Unauthorized update must fail!"
    except urllib.error.HTTPError as e:
        assert e.code == 401
        print("  ✓ POST /api/system/update correctly rejected unauthenticated request (401 Unauthorized)")

def main():
    base_url = "http://127.0.0.1:3050"
    login, password = load_credentials()

    test_version_api(base_url, login, password)

    print("\n[UI Test] Launching Playwright to test 3X-UI Style Versioning & Update Center...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        # Step 1: Login
        page.goto(base_url)
        page.wait_for_selector('input[type="text"]')
        page.fill('input[type="text"]', login)
        page.fill('input[type="password"]', password)
        page.click('button[type="submit"]')
        page.wait_for_selector('aside')
        print("  ✓ Logged into AgentNexus dashboard")

        # Step 2: Verify Version Badges in Sidebar
        header_badge = page.locator('[data-testid="header-version-badge"]').first
        expect(header_badge).to_be_visible(timeout=5000)
        footer_btn = page.locator('[data-testid="version-btn"]').first
        expect(footer_btn).to_be_visible(timeout=5000)
        print(f"  ✓ Version badge visible in brand header: '{header_badge.text_content().strip()}'")
        print(f"  ✓ Version button visible in sidebar footer: '{footer_btn.text_content().strip()}'")

        # Take screenshot of sidebar with version badge
        page.screenshot(path=str(SCREENSHOTS_DIR / "nexus_version_badge.png"))
        print("  📸 Saved screenshot: nexus_version_badge.png")

        # Step 3: Open Update Modal (3X-UI Style)
        footer_btn.click()
        modal = page.locator('[data-testid="update-modal"]').first
        expect(modal).to_be_visible(timeout=5000)
        print("  ✓ Opened 3X-UI Style Update Center modal")

        # Verify modal content elements
        expect(modal.locator('text=Центр обновлений')).to_be_visible()
        expect(modal.locator('text=Текущая версия')).to_be_visible()
        expect(modal.locator('text=Удаленный статус')).to_be_visible()
        expect(modal.locator('text=Резервная копия')).to_be_visible()
        expect(modal.locator('button:has-text("Проверить обновления")')).to_be_visible()
        expect(modal.locator('[data-testid="start-update-btn"]')).to_be_visible()
        print("  ✓ Verified all 3X-UI modal cards (Local Version, Remote Status, Backup Notice, Action Buttons)")

        # Test Re-check button
        modal.locator('button:has-text("Проверить обновления")').click()
        page.wait_for_timeout(1000)
        print("  ✓ Successfully triggered re-check of updates via UI")

        # Take screenshot of open update modal
        page.screenshot(path=str(SCREENSHOTS_DIR / "nexus_update_modal_3xui.png"))
        print("  📸 Saved screenshot: nexus_update_modal_3xui.png")

        # Close modal
        modal.locator('button:has-text("Закрыть")').click()
        expect(modal).not_to_be_visible()
        print("  ✓ Update modal closed cleanly")

        browser.close()
        print("\n🎉 ALL VERSIONING & UPDATE CENTER TESTS PASSED 100%!")

if __name__ == "__main__":
    main()
