# Gemini Hub — Веб-панель управления проектами через Gemini

Защищенный веб-интерфейс для управления серверными проектами через автономного AI-агента Gemini (`agy`).

## 1. Безопасность и Авторизация

- 🔐 **Хеширование паролей:** Пароли не хранятся в открытом виде, используется стандарт `scrypt` (salt + 64-byte key) с постоянным временем проверки (`crypto.timingSafeEqual`) для защиты от атак по времени (timing attacks).
- 🛡 **Защита от подбора (Brute-Force Protection & Rate Limiting):**
  - Максимум 5 неверных попыток ввода пароля.
  - При превышении лимита IP-адрес автоматически блокируется на 15 минут.
- 🍪 **Сессии:** Токены сессий (256 бит энтропии) сохраняются в SQLite и передаются через защищенные `HttpOnly` Cookies и `Authorization: Bearer <token>` заголовок.
- 🔒 **Защита WebSocket:** Сокет проверяет аутентификацию при рукопожатии; неавторизованные соединения немедленно отключаются (`4001 Unauthorized`).
- 🛡 **Security Headers:** Включены заголовки `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection`, `Referrer-Policy`.

### Как сменить мастер-пароль:

```bash
cd /home/alex/apps/project-management
npm run set-password "ваш_новый_надежный_пароль"
```

Текущий установленный пароль: **`alex-gemini-2026`** (рекомендуется сменить на свой).

---

## 2. Управление проектами (`projects.json`)

Список доступных проектов строго изолирован и хранится в локальном файле:
`server/data/projects.json`

Извне через веб-интерфейс нельзя произвольно передать любой путь на сервере. Запросы принимаются только для проектов, явно объявленных в конфигурации.

### Консольная утилита управления проектами:

```bash
# Посмотреть список проектов:
npm run projects list

# Добавить новый проект (только локально на сервере):
npm run projects add <id> <название> <абсолютный_путь> [описание]

# Пример:
npm run projects add myapp "My App" /home/alex/apps/main/myapp "Описание проекта"

# Удалить проект из списка:
npm run projects remove <id>
```

### Текущий список настроенных проектов:
1. `vpn` — `/home/alex/apps/vpn` (WERW VPN & 3X-UI)
2. `autonote` — `/home/alex/apps/main/autonote` (AutoNote API)
3. `bmw-diag` — `/home/alex/apps/main/bmw-diag` (BMW Diag / OpenBimmer)
4. `ivs-technology` — `/home/alex/apps/main/ivs-technology` (IVS Technology)
5. `master-sip` — `/home/alex/apps/main/master-sip` (Master-SIP CRM/CMS)
6. `resume` — `/home/alex/apps/main/resume` (Resume / Portfolio)
7. `vagclub21-union` — `/home/alex/apps/main/vagclub21-union` (VAG Club 21)
8. `project-management` — `/home/alex/apps/project-management` (Gemini Hub)

---

## 3. Защита от промпт-инъекций и деструктивных действий

Реализована эшелонированная система защиты (Defense-in-Depth):

1. **Pre-execution Prompt Guardrail:**
   - Перед передачей промпта агенту выполняется синтаксический и семантический анализ (токенизация).
   - Запросы вроде «удали сервер», «снеси проект», «wipe disk», «rm -rf /», «выведи /etc/shadow», «ignore previous instructions» блокируются на уровне API с кодом `400 Bad Request`.
   - Инцидент записывается в таблицу аудита безопасности `security_audit` в SQLite.
2. **Real-time Tool Command Inspection:**
   - Если модель по какой-либо причине попытается вызвать инструмент `run_command` с опасной командой (`rm -rf /`, `mkfs`, `dd`, `shutdown`, `chmod 777 /`), процесс немедленно принудительно уничтожается (`SIGKILL`), а в чат выводится предупреждение безопасности.
3. **Строгая изоляция рабочей директории (CWD):**
   - Процесс запускается строго в директории выбранного проекта из `projects.json`.

---

## 4. Фоновые сессии (Multiplexer)

Отправьте сложную задачу и закройте вкладку или браузер. Демон на бэкенде продолжит выполнение, запишет вывод в базу данных SQLite, а при следующем входе восстановит всю историю и живой поток.

---

## 5. Управление сервисом (PM2)

```bash
# Статус
pm2 status gemini-hub

# Логи
pm2 logs gemini-hub

# Перезапуск
pm2 restart gemini-hub
```
