import os
import sys
import time
import json
import uuid
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

def seed_test_conversation():
    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()

    # Use Gemini Hub project
    project_id = "project-management"

    conv_id = f"test-interactive-{uuid.uuid4().hex[:8]}"
    now = int(time.time() * 1000)

    # 1. Insert conversation
    cur.execute(
        "INSERT INTO conversations (id, project_id, title, created_at, updated_at, status) VALUES (?, ?, ?, ?, ?, ?)",
        (conv_id, project_id, "Тест интерактива вопросов", now, now, "idle")
    )

    # 2. Turn 1: Tool-based question (ask_question)
    user_msg_1 = f"msg-user-1-{uuid.uuid4().hex[:8]}"
    cur.execute(
        "INSERT INTO messages (id, conversation_id, role, content, created_at, status) VALUES (?, ?, ?, ?, ?, ?)",
        (user_msg_1, conv_id, "user", "Подготовь деплой", now, "done")
    )

    asst_msg_1 = f"msg-asst-1-{uuid.uuid4().hex[:8]}"
    cur.execute(
        "INSERT INTO messages (id, conversation_id, role, content, created_at, status) VALUES (?, ?, ?, ?, ?, ?)",
        (asst_msg_1, conv_id, "assistant", "Перед сборкой необходимо выбрать целевое окружение.", now + 500, "done")
    )

    step_1 = f"step-1-{uuid.uuid4().hex[:8]}"
    tool_params = json.dumps({
        "questions": [{
            "question": "Какую конфигурацию деплоя применить?",
            "options": ["(Recommended) Production", "Staging", "Development"],
            "is_multi_select": False
        }]
    })
    cur.execute(
        "INSERT INTO steps (id, message_id, step_index, step_type, tool_name, tool_params, tool_output, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (step_1, asst_msg_1, 1, "tool", "ask_question", tool_params, "User selected option", "done", now + 600)
    )

    # 3. Turn 2: Markdown-based question
    user_msg_2 = f"msg-user-2-{uuid.uuid4().hex[:8]}"
    cur.execute(
        "INSERT INTO messages (id, conversation_id, role, content, created_at, status) VALUES (?, ?, ?, ?, ?, ?)",
        (user_msg_2, conv_id, "user", "Production", now + 1000, "done")
    )

    asst_msg_2 = f"msg-asst-2-{uuid.uuid4().hex[:8]}"
    asst_content_2 = (
        "Конфигурация Production успешно применена.\n\n"
        "Как поступим дальше?\n"
        "1. **Запустить тесты** (рекомендуется) — проверка через Playwright\n"
        "2. **Собрать бандл** — компиляция продакшен сборки\n"
        "3. **Закоммитить изменения** — пуш в ветку master"
    )
    cur.execute(
        "INSERT INTO messages (id, conversation_id, role, content, created_at, status) VALUES (?, ?, ?, ?, ?, ?)",
        (asst_msg_2, conv_id, "assistant", asst_content_2, now + 1500, "done")
    )

    conn.commit()
    conn.close()
    return conv_id, project_id

def cleanup_test_conversation(conv_id):
    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()
    cur.execute("DELETE FROM messages WHERE conversation_id = ?", (conv_id,))
    cur.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))
    conn.commit()
    conn.close()

def run_tests():
    login, password = load_credentials()
    base_url = "http://127.0.0.1:3050"

    print("🚀 Validating Interactive Question Options via Playwright...")
    conv_id, project_id = seed_test_conversation()

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            # Test with 1280x800 desktop viewport
            context = browser.new_context(viewport={'width': 1280, 'height': 800})
            page = context.new_page()

            # 1. Login
            page.goto(base_url)
            page.fill('input[type="text"]', login)
            page.fill('input[type="password"]', password)
            page.click('button[type="submit"]')
            page.wait_for_selector('header', timeout=10000)
            print("✅ Logged in successfully.")

            # 2. Select Project and Conversation
            time.sleep(1)
            # Click Gemini Hub project if not already selected
            proj_btn = page.locator('button:has-text("Gemini Hub / PM")').first
            if proj_btn.is_visible():
                proj_btn.click(force=True)
                time.sleep(0.5)

            # Click the seeded conversation
            conv_btn = page.locator('button:has-text("Тест интерактива вопросов")').first
            expect(conv_btn).to_be_visible(timeout=8000)
            conv_btn.click(force=True)
            time.sleep(0.5)

            # 3. Check for Tool-based Question Card (Turn 1)
            tool_q_card = page.locator('[data-testid="interactive-question-card"]:has-text("Какую конфигурацию деплоя применить?")').first
            expect(tool_q_card).to_be_visible(timeout=8000)
            expect(tool_q_card.locator('text=запрос агента')).to_be_visible()
            expect(tool_q_card.locator('text=Production')).to_be_visible()
            print("✅ Tool-based question (ask_question) rendered with 'запрос агента' badge!")

            # 4. Check for Markdown Question Card (Turn 2)
            md_q_card = page.locator('[data-testid="interactive-question-card"]:has-text("Как поступим дальше?")').first
            expect(md_q_card).to_be_visible(timeout=8000)
            print("✅ Markdown-based question rendered correctly!")

            # 5. Check for Option Buttons inside markdown question card
            option_btns = md_q_card.locator('[data-testid="interactive-option-btn"]')
            count = option_btns.count()
            print(f"✅ Found {count} interactive option buttons inside the question card.")
            assert count == 3, f"Expected 3 options inside question card, found {count}"

            # 6. Check Recommended Badge
            recommended_badge = md_q_card.locator('text=Рекомендуется').first
            expect(recommended_badge).to_be_visible()
            print("✅ Recommended badge is visible on Option 1.")

            # Take screenshot before click
            screenshot_path = SCREENSHOTS_DIR / "interactive_options_flow.png"
            page.screenshot(path=str(screenshot_path))
            print(f"📸 Saved screenshot: {screenshot_path}")

            # 7. Click the second option ("Собрать бандл")
            second_btn = option_btns.nth(1)
            print(f"Clicking option 2: {second_btn.inner_text()}...")
            second_btn.click()

            # 8. Check that prompt was sent!
            # It should create a new user message containing "2. Собрать бандл"
            new_user_msg = page.locator('[data-testid="user-card"]:has-text("2. Собрать бандл")').first
            expect(new_user_msg).to_be_visible(timeout=8000)
            print("✅ Option clicked and immediately sent as prompt without manual typing!")

            # Take screenshot after click
            screenshot_after = SCREENSHOTS_DIR / "interactive_option_clicked.png"
            page.screenshot(path=str(screenshot_after))
            print(f"📸 Saved clicked screenshot: {screenshot_after}")

            browser.close()
            print("🎉 ALL INTERACTIVE QUESTIONS TESTS PASSED SUCCESSFULLY!")

    finally:
        cleanup_test_conversation(conv_id)

if __name__ == '__main__':
    run_tests()
