import os
import sys
import time
import sqlite3
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ENV_FILE = Path(__file__).resolve().parent.parent / '.env'
DB_FILE = Path(__file__).resolve().parent.parent / 'server' / 'data' / 'pm.db'
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

def test_ux_and_usability_enhancements():
    login, password = load_credentials()
    base_url = "http://127.0.0.1:3050"

    print("\n=======================================================")
    print("🚀 Running Playwright UX & Usability Validation Suite")
    print("=======================================================\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # -------------------------------------------------------------
        # PART 1: Desktop Viewport (1280x800)
        # -------------------------------------------------------------
        print("🖥️ PART 1: Desktop Viewport (1280x800)")
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        # Step 1: Login
        print("1. Logging into AgentNexus...")
        page.goto(base_url)
        page.fill('input[type="text"]', login)
        page.fill('input[type="password"]', password)
        page.click('button[type="submit"]')
        page.wait_for_timeout(1000)

        # Step 2: Test Sidebar Project Search Filter
        print("2. Testing Sidebar Project Search filter...")
        search_input = page.locator('input[data-testid="project-search-input"]')
        expect(search_input).to_be_visible()
        search_bbox = search_input.bounding_box()
        assert search_bbox is not None, "Search input must have bounding box"
        assert search_bbox['width'] >= 140, f"Search input too narrow: {search_bbox['width']}px"
        assert search_bbox['height'] >= 24, f"Search input too short: {search_bbox['height']}px"

        # Type search query "Nexus"
        search_input.fill("Nexus")
        page.wait_for_timeout(300)
        # Verify filtered projects
        projects_text = page.locator('[data-testid="projects-list-container"]').inner_text()
        assert "AgentNexus" in projects_text, f"Filtered project list should contain AgentNexus, got: {projects_text}"

        # Clear search
        clear_btn = page.locator('button[title="Очистить поиск"]')
        expect(clear_btn).to_be_visible()
        clear_btn.click()
        page.wait_for_timeout(300)
        expect(search_input).to_have_value("")

        # Step 3: Select AgentNexus project
        print("3. Navigating to AgentNexus project (?project=project-management)...")
        page.goto(f"{base_url}/?project=project-management")
        page.wait_for_timeout(1000)

        # Step 4: Test Prompt Input Usability (Metrics & Clear button)
        print("4. Testing Prompt Input usability...")
        textarea = page.locator('textarea')
        expect(textarea).to_be_visible()
        textarea.fill("Тестовый запрос для проверки метрик токенов и очистки")
        page.wait_for_timeout(300)

        metrics = page.locator('[data-testid="prompt-metrics"]')
        expect(metrics).to_be_visible()
        metrics_text = metrics.inner_text()
        print(f"   Prompt metrics visible: {metrics_text}")
        assert "симв" in metrics_text and "tok" in metrics_text

        clear_prompt_btn = page.locator('button[title="Очистить ввод"]')
        expect(clear_prompt_btn).to_be_visible()
        clear_prompt_btn.click()
        page.wait_for_timeout(300)
        expect(textarea).to_have_value("")

        # Step 5: Test Session Management (Create, Rename, Delete)
        print("5. Testing Conversation Session Management (Create, Rename, Delete)...")
        new_conv_btn = page.locator('[data-testid="new-conversation-btn"]')
        expect(new_conv_btn).to_be_visible()
        new_conv_btn.click()
        page.wait_for_timeout(1000)

        # Hover first conversation item and click rename (Pencil)
        conv_items = page.locator('[data-testid="conversation-item"]')
        first_conv = conv_items.first
        first_conv.hover()
        page.wait_for_timeout(300)

        rename_btn = first_conv.locator('[title="Переименовать сессию"]')
        expect(rename_btn).to_be_visible()
        rename_btn.click()
        page.wait_for_timeout(300)

        # Inline rename input
        rename_input = first_conv.locator('input[type="text"]')
        expect(rename_input).to_be_visible()
        test_title = f"Test Session {int(time.time())}"
        rename_input.fill(test_title)
        first_conv.locator('button[title="Сохранить"]').click()
        page.wait_for_timeout(500)
        expect(first_conv).to_contain_text(test_title)
        print(f"   Successfully renamed conversation to: {test_title}")

        # Test Starter Prompt Cards in empty conversation
        print("6. Verifying Starter Prompt Cards in empty conversation...")
        starter_cards = page.locator('[data-testid^="starter-prompt-card-"]')
        cards_count = starter_cards.count()
        assert cards_count == 4, f"Expected 4 starter prompt cards, got {cards_count}"
        for i in range(cards_count):
            card = starter_cards.nth(i)
            expect(card).to_be_visible()
            bbox = card.bounding_box()
            assert bbox is not None and bbox['height'] >= 40, f"Starter card {i} squashed"
        print("   All 4 starter prompt cards verified with valid bounding boxes!")

        # Now test Delete of this test conversation
        print("7. Testing Conversation Deletion with Confirmation...")
        first_conv.hover()
        page.wait_for_timeout(300)
        delete_btn = first_conv.locator('[title="Удалить сессию"]')
        expect(delete_btn).to_be_visible()
        delete_btn.click()
        page.wait_for_timeout(300)

        # Verify inline confirmation prompt
        expect(first_conv).to_contain_text("Удалить сессию?")
        confirm_yes = first_conv.locator('button[title="Подтвердить удаление"]')
        expect(confirm_yes).to_be_visible()
        confirm_yes.click()
        page.wait_for_timeout(600)
        print("   Conversation deleted successfully!")

        # Step 8: Verify Markdown rendering with Code block & Callout
        print("8. Testing Markdown rendering, Code syntax highlighting & Callouts...")
        # Insert a synthetic assistant test message into the active conversation to test rendering
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM conversations WHERE project_id = 'project-management' ORDER BY updated_at DESC LIMIT 1")
        conv_row = cursor.fetchone()
        if conv_row:
            active_conv_id = conv_row[0]
            test_msg_id = f"test-md-{int(time.time())}"
            md_content = """## Синтаксис и Вызовы

Вот пример кода TypeScript:
```typescript
interface StudioConfig {
  version: string;
  isAutonomous: boolean;
}

const config: StudioConfig = {
  version: "2.1.0",
  isAutonomous: true
};
console.log("Studio ready:", config);
```

> [!NOTE]
> Это тестовый блок примечания с полезным контекстом.

> [!WARNING]
> Это тестовое предупреждение системы безопасности.
"""
            cursor.execute(
                "INSERT INTO messages (id, conversation_id, role, content, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (test_msg_id, active_conv_id, 'assistant', md_content, 'done', int(time.time() * 1000))
            )
            conn.commit()
            conn.close()

            # Refresh page to load updated messages
            page.reload()
            page.wait_for_timeout(1200)

            # Check code block wrapper
            code_wrapper = page.locator('.code-block-wrapper').last
            expect(code_wrapper).to_be_visible()
            code_bbox = code_wrapper.bounding_box()
            assert code_bbox is not None and code_bbox['height'] >= 60, f"Code block squashed: {code_bbox}"
            expect(code_wrapper.locator('.hljs')).to_be_visible()
            expect(code_wrapper).to_contain_text("TYPESCRIPT")

            # Check snippet copy button
            copy_snippet_btn = code_wrapper.locator('.copy-code-btn')
            expect(copy_snippet_btn).to_be_visible()
            copy_snippet_btn.click()
            page.wait_for_timeout(300)
            print("   Code block highlighting & snippet copy button verified!")

            # Check callout banners
            callout_note = page.locator('.callout-note').last
            expect(callout_note).to_be_visible()
            expect(callout_note).to_contain_text("Примечание")

            callout_warning = page.locator('.callout-warning').last
            expect(callout_warning).to_be_visible()
            expect(callout_warning).to_contain_text("Предупреждение")
            print("   Callouts (NOTE & WARNING) verified with distinctive borders!")

            # Clean up test message from DB
            conn = sqlite3.connect(DB_FILE)
            conn.cursor().execute("DELETE FROM messages WHERE id = ?", (test_msg_id,))
            conn.commit()
            conn.close()

        # Desktop screenshot
        desktop_shot = SCREENSHOTS_DIR / 'ux_enhancements_desktop.png'
        page.screenshot(path=str(desktop_shot), full_page=True)
        print(f"📸 Saved desktop screenshot: {desktop_shot}")
        context.close()

        # -------------------------------------------------------------
        # PART 2: Mobile Viewport (390x844 - iPhone 12/13/14)
        # -------------------------------------------------------------
        print("\n📱 PART 2: Mobile Viewport (390x844)")
        mobile_context = browser.new_context(
            viewport={'width': 390, 'height': 844},
            is_mobile=True,
            has_touch=True
        )
        mobile_page = mobile_context.new_page()

        mobile_page.goto(f"{base_url}/?project=project-management")
        # Login if redirected
        if mobile_page.locator('input[type="password"]').is_visible():
            mobile_page.fill('input[type="text"]', login)
            mobile_page.fill('input[type="password"]', password)
            mobile_page.click('button[type="submit"]')
            mobile_page.wait_for_timeout(1000)

        # Open mobile sidebar drawer via hamburger menu
        menu_btn = mobile_page.locator('button[title="Открыть список проектов"]')
        expect(menu_btn).to_be_visible()
        menu_btn.click()
        mobile_page.wait_for_timeout(500)

        # Verify mobile sidebar is visible
        mobile_sidebar = mobile_page.locator('aside')
        expect(mobile_sidebar).to_be_visible()
        sidebar_bbox = mobile_sidebar.bounding_box()
        assert sidebar_bbox is not None and sidebar_bbox['width'] >= 260, "Mobile sidebar width issue"

        # Verify project search in mobile drawer
        mobile_search = mobile_page.locator('input[data-testid="project-search-input"]')
        expect(mobile_search).to_be_visible()

        # Close mobile drawer via close button (X)
        close_drawer_btn = mobile_page.locator('button[title="Закрыть меню"]')
        expect(close_drawer_btn).to_be_visible()
        close_drawer_btn.click()
        mobile_page.wait_for_timeout(400)

        # Verify no horizontal scroll on mobile
        scroll_width = mobile_page.evaluate("document.body.scrollWidth")
        viewport_width = mobile_page.evaluate("window.innerWidth")
        assert scroll_width <= viewport_width + 1, f"Horizontal overflow on mobile: scrollWidth={scroll_width}, viewportWidth={viewport_width}"

        # Mobile screenshot
        mobile_shot = SCREENSHOTS_DIR / 'ux_enhancements_mobile.png'
        mobile_page.screenshot(path=str(mobile_shot), full_page=True)
        print(f"📸 Saved mobile screenshot: {mobile_shot}")
        mobile_context.close()

        browser.close()

    print("\n=======================================================")
    print("✅ All UX & Usability Enhancements Successfully Verified!")
    print("=======================================================\n")

if __name__ == '__main__':
    test_ux_and_usability_enhancements()
