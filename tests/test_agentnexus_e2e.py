import os
import sys
import time
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

def seed_test_session():
    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()

    project_id = "project-management"
    conv_id = f"test-nexus-{uuid.uuid4().hex[:8]}"
    now = int(time.time() * 1000)

    # 1. Insert test conversation
    cur.execute(
        "INSERT INTO conversations (id, project_id, title, created_at, updated_at, status) VALUES (?, ?, ?, ?, ?, ?)",
        (conv_id, project_id, "Тест AgentNexus Студии", now, now, "idle")
    )

    # 2. Assistant message with question choices
    asst_msg_id = f"msg-asst-{uuid.uuid4().hex[:8]}"
    asst_content = (
        "AgentNexus студия успешно инициализирована.\n\n"
        "Как поступить с подготовкой релиза?\n"
        "1. **Запустить тесты** (рекомендуется) — проверка через Playwright\n"
        "2. **Собрать бандл** — компиляция продакшен сборки\n"
        "3. **Проверить Git статус** — аудит изменений"
    )
    cur.execute(
        "INSERT INTO messages (id, conversation_id, role, content, created_at, status) VALUES (?, ?, ?, ?, ?, ?)",
        (asst_msg_id, conv_id, "assistant", asst_content, now + 1000, "done")
    )

    conn.commit()
    conn.close()
    return conv_id

def cleanup_test_session(conv_id):
    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()
    cur.execute("DELETE FROM messages WHERE conversation_id = ?", (conv_id,))
    cur.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))
    conn.commit()
    conn.close()

def run_e2e_tests():
    login, password = load_credentials()
    base_url = "http://127.0.0.1:3050"

    print("🚀 Running AgentNexus Comprehensive E2E Verification Suite...")
    conv_id = seed_test_session()

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(viewport={'width': 1280, 'height': 850})
            page = context.new_page()

            # -------------------------------------------------------------
            # 1. BRANDING & LOGIN VERIFICATION
            # -------------------------------------------------------------
            print("\n[Step 1] Verifying Login & Brand Identity...")
            page.goto(base_url)
            page.wait_for_selector('h1')

            # Verify Login page has AgentNexus and STUDIO
            login_title = page.locator('h1:has-text("AgentNexus")').first
            expect(login_title).to_be_visible()
            expect(login_title.locator('text=STUDIO')).to_be_visible()
            print("  ✓ Login page features AgentNexus STUDIO branding")

            # Perform login
            page.fill('input[type="text"]', login)
            page.fill('input[type="password"]', password)
            page.click('button[type="submit"]')
            page.wait_for_selector('header', timeout=10000)
            print("  ✓ Authenticated and loaded main dashboard")

            # Verify sidebar branding
            sidebar_brand = page.locator('aside h1:has-text("AgentNexus")').first
            expect(sidebar_brand).to_be_visible()
            expect(sidebar_brand.locator('text=STUDIO')).to_be_visible()
            print("  ✓ Sidebar header features AgentNexus STUDIO brand badge")

            # Select AgentNexus Studio project
            proj_btn = page.locator('button:has-text("AgentNexus Studio")').first
            expect(proj_btn).to_be_visible(timeout=8000)
            proj_btn.click(force=True)
            time.sleep(0.5)

            # Save screenshot of dashboard
            page.screenshot(path=str(SCREENSHOTS_DIR / "nexus_branding.png"))

            # -------------------------------------------------------------
            # 2. MULTI-ENGINE & MODEL SELECTOR (Gemini, Claude, OpenAI)
            # -------------------------------------------------------------
            print("\n[Step 2] Verifying Multi-Engine & Model Selector...")
            engine_btn = page.locator('[data-testid="engine-selector-btn"]').first
            expect(engine_btn).to_be_visible(timeout=8000)
            print(f"  ✓ Initial engine button: {engine_btn.inner_text()}")

            # Open engine dropdown
            engine_btn.click()
            popup = page.locator('[data-testid="engine-options-popup"]').first
            expect(popup).to_be_visible(timeout=5000)

            # Check for all three engines
            claude_btn = popup.locator('button:has-text("claude")').first
            gemini_btn = popup.locator('button:has-text("gemini")').first
            openai_btn = popup.locator('button:has-text("openai")').first

            expect(claude_btn).to_be_visible()
            expect(gemini_btn).to_be_visible()
            expect(openai_btn).to_be_visible()
            print("  ✓ All 3 AI Engines (Gemini, Claude, OpenAI) available in picker")

            # Switch to Claude
            claude_btn.click()
            time.sleep(0.3)
            page.screenshot(path=str(SCREENSHOTS_DIR / "nexus_engine_selector_claude.png"))
            expect(engine_btn.locator('text=claude')).to_be_visible()
            print("  ✓ Successfully switched active engine to Claude Code")

            # Switch back to Gemini
            if not popup.is_visible():
                engine_btn.click()
            gemini_btn.click()
            time.sleep(0.3)
            expect(engine_btn.locator('text=gemini')).to_be_visible()
            print("  ✓ Successfully switched active engine to Gemini")

            # Close popup
            if popup.is_visible():
                engine_btn.click()

            # -------------------------------------------------------------
            # 3. VISUAL DIRECTORY PICKER (Add Project Modal)
            # -------------------------------------------------------------
            print("\n[Step 3] Verifying Visual Directory Picker...")
            add_proj_btn = page.locator('[data-testid="add-project-btn"]').first
            expect(add_proj_btn).to_be_visible()
            add_proj_btn.click()

            picker_modal = page.locator('[data-testid="directory-picker-modal"]').first
            expect(picker_modal).to_be_visible(timeout=8000)
            print("  ✓ Visual Directory Picker modal opened")

            # Check breadcrumbs and folder items
            expect(picker_modal.locator('text="apps"').first).to_be_visible()
            folders = picker_modal.locator('button:has(.text-amber-500)')
            folder_count = folders.count()
            print(f"  ✓ Found {folder_count} browsable server directories in current path")
            assert folder_count > 0, "Expected at least 1 directory in picker"

            # Check project registration form
            expect(picker_modal.locator('input[placeholder="My Project"]')).to_be_visible()
            page.screenshot(path=str(SCREENSHOTS_DIR / "nexus_directory_picker.png"))

            # Close picker modal
            picker_modal.locator('button:has-text("Отмена")').click()
            time.sleep(0.5)
            expect(picker_modal).not_to_be_visible()
            print("  ✓ Directory Picker closed cleanly")

            # -------------------------------------------------------------
            # 4. PROJECT FILE EXPLORER & GIT DIFF VIEWER
            # -------------------------------------------------------------
            print("\n[Step 4] Verifying Project File Explorer & Git Diff Modal...")
            open_files_btn = page.locator('[data-testid="open-files-btn"]').first
            expect(open_files_btn).to_be_visible()
            open_files_btn.click()

            files_modal = page.locator('[data-testid="project-files-modal"]').first
            expect(files_modal).to_be_visible(timeout=8000)
            print("  ✓ Project File Explorer opened")

            # Check that files tab is active and files list is rendered
            files_tab_btn = files_modal.locator('button:has-text("Файлы")').first
            expect(files_tab_btn).to_be_visible()

            # Click a file (e.g. package.json or README.md) to test code viewer
            target_file_btn = files_modal.locator('button:has-text("package.json")').first
            if target_file_btn.is_visible():
                target_file_btn.click()
                time.sleep(0.5)
                # Verify code preview has file content
                code_pre = files_modal.locator('pre').first
                expect(code_pre).to_be_visible()
                expect(code_pre).to_contain_text("agent-nexus")
                print("  ✓ File code viewer successfully inspected package.json content")

            # Switch to Git Diff Tab
            git_tab_btn = files_modal.locator('button:has-text("Git Diff")').first
            git_tab_btn.click()
            time.sleep(0.5)

            # Check Git tab content
            expect(files_modal.locator('text=Ветка').first).to_be_visible()
            print("  ✓ Git Diff tab shows active repository branch and change status")

            page.screenshot(path=str(SCREENSHOTS_DIR / "nexus_file_explorer.png"))

            # Close files modal
            files_modal.locator('button[title*="Закрыть"], button:has(svg.lucide-x)').first.click()
            time.sleep(0.5)
            print("  ✓ Project Files & Git modal closed cleanly")

            # -------------------------------------------------------------
            # 5. INTERACTIVE QUESTION OPTIONS & DIALOG FLOW
            # -------------------------------------------------------------
            print("\n[Step 5] Verifying Interactive Question Options in Dialog...")
            # Select test conversation
            conv_btn = page.locator(':is(button, [data-testid="conversation-item"]):has-text("Тест AgentNexus Студии")').first
            expect(conv_btn).to_be_visible(timeout=8000)
            conv_btn.click(force=True)
            time.sleep(0.5)

            # Check Interactive Question Card
            question_card = page.locator('[data-testid="interactive-question-card"]').last
            expect(question_card).to_be_visible(timeout=8000)
            print("  ✓ Interactive Question Card rendered with prompt options")

            # Check options and recommended badge
            options = question_card.locator('[data-testid="interactive-option-btn"]')
            expect(options.first).to_contain_text("Запустить тесты")
            expect(question_card.locator('text=Рекомендуется').first).to_be_visible()
            print("  ✓ Option 1 has 'Рекомендуется' badge")

            page.screenshot(path=str(SCREENSHOTS_DIR / "nexus_interactive_card.png"))

            browser.close()
            print("\n🎉 ALL AGENTNEXUS E2E TESTS PASSED 100%!")

    finally:
        cleanup_test_session(conv_id)

if __name__ == '__main__':
    run_e2e_tests()
