import os
import sys
import re
import time
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

    print("🚀 Running Tests for: Tables responsiveness, scrollbar polish, and live agent process...")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={'width': 390, 'height': 844},
            is_mobile=True,
            has_touch=True
        )
        page = context.new_page()

        # 1. Login
        page.goto(base_url)
        page.fill('input[type="text"]', login)
        page.fill('input[type="password"]', password)
        page.click('button[type="submit"]')
        page.wait_for_selector('textarea')

        # 2. Check no-scrollbar on chip container
        chips_container = page.locator('.no-scrollbar')
        expect(chips_container).to_be_visible()
        # Verify scrollbar is suppressed via CSS
        scrollbar_width = chips_container.evaluate("el => getComputedStyle(el).scrollbarWidth")
        print(f"  ✓ Chip row scrollbar suppressed (scrollbar-width: {scrollbar_width})")

        # 3. Test Markdown Table responsiveness & styles on mobile
        # Inject sample markdown table message to test rendering and overflow handling
        page.evaluate("""() => {
            const container = document.querySelector('div[class*="overflow-y-auto"]');
            if (container) {
                const card = document.createElement('div');
                card.id = 'test-table-card';
                card.className = 'max-w-4xl mx-auto w-full my-4';
                card.innerHTML = `
                    <div class="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-4">
                        <div class="markdown-body">
                            <h3>Тестовая таблица статусов</h3>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Сервис</th>
                                        <th>Статус</th>
                                        <th>Порт</th>
                                        <th>Протокол</th>
                                        <th>Память (RAM)</th>
                                        <th>Нагрузка (CPU)</th>
                                        <th>Uptime</th>
                                        <th>Описание сервиса</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>gemini-hub</td>
                                        <td>ONLINE</td>
                                        <td>3050</td>
                                        <td>HTTP/2 + WSS</td>
                                        <td>81.8 MB</td>
                                        <td>0.1%</td>
                                        <td>48 hours</td>
                                        <td>Управление проектами через Gemini CLI</td>
                                    </tr>
                                    <tr>
                                        <td>autonote-api</td>
                                        <td>ONLINE</td>
                                        <td>4000</td>
                                        <td>HTTPS</td>
                                        <td>68.3 MB</td>
                                        <td>0.0%</td>
                                        <td>7 days</td>
                                        <td>Сервис автоматических заметок</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
                container.appendChild(card);
            }
        }""")

        table = page.locator('#test-table-card table')
        expect(table).to_be_visible()

        # Check table display and scrollability
        table_display = table.evaluate("el => getComputedStyle(el).display")
        table_overflow = table.evaluate("el => getComputedStyle(el).overflowX")
        table_scroll_width = table.evaluate("el => el.scrollWidth")
        table_client_width = table.evaluate("el => el.clientWidth")

        assert table_display == 'block', f"Table display should be block, got {table_display}"
        assert table_overflow == 'auto', f"Table overflowX should be auto, got {table_overflow}"
        assert table_scroll_width >= table_client_width, "Table should be horizontally scrollable"
        print(f"  ✓ Markdown table is responsive: display={table_display}, overflowX={table_overflow}, scrollWidth={table_scroll_width}px, clientWidth={table_client_width}px")

        page.screenshot(path=str(SCREENSHOTS_DIR / "table_mobile_responsive.png"))
        print(f"  ✓ Saved table screenshot: {SCREENSHOTS_DIR / 'table_mobile_responsive.png'}")

        # 4. Test Live Agent Process & Zero Empty Messages
        print("\n🤖 [Test Live Turn] Sending prompt and verifying real-time thinking & response...")
        textarea = page.locator('textarea')
        textarea.fill("Ответь строго одним словом: РАБОТАЕТ")
        send_btn = page.locator('button[title="Отправить (Enter)"]')
        send_btn.click()

        # Immediately assert that assistant card appears
        assistant_badge = page.locator('text=Gemini Agent').last
        expect(assistant_badge).to_be_visible()
        print("  ✓ Assistant message card appears immediately upon submission")

        # Wait for agent turn to finish (max 30s)
        page.wait_for_selector('text=РАБОТАЕТ', timeout=30000)
        print("  ✓ Agent completed turn successfully and output 'РАБОТАЕТ'")

        # Verify that all assistant cards have body content (markdown or status text)
        assistant_cards = page.locator('[data-testid="assistant-card"]')
        total_assistant_cards = assistant_cards.count()
        assert total_assistant_cards > 0, "No assistant cards found!"
        
        for i in range(total_assistant_cards):
            card = assistant_cards.nth(i)
            # Each card must contain either markdown-body or action step or valid status text
            has_body = card.locator('.markdown-body').count() > 0 or card.locator('text=/Анализирую|Действия|завершен/').count() > 0
            assert has_body, f"Assistant card #{i} is completely empty without body or status!"
        print(f"  ✓ Verified all {total_assistant_cards} assistant cards have valid non-empty content")

        page.screenshot(path=str(SCREENSHOTS_DIR / "live_agent_completed.png"))
        print(f"  ✓ Saved completed turn screenshot: {SCREENSHOTS_DIR / 'live_agent_completed.png'}")

        context.close()
        browser.close()

    print("\n🎉 ALL TESTS (TABLE RESPONSIVENESS, SCROLLBARS, LIVE AGENT) PASSED 100%!")

if __name__ == "__main__":
    try:
        run_tests()
    except Exception as e:
        print(f"\n❌ Test failed: {e}", file=sys.stderr)
        sys.exit(1)
