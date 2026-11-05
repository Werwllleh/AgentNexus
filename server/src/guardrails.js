import crypto from 'node:crypto';
import { db } from './db.js';

// Table for security audit logs
db.exec(`
  CREATE TABLE IF NOT EXISTS security_audit (
    id TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    ip TEXT NOT NULL,
    user_id TEXT,
    prompt_snippet TEXT NOT NULL,
    risk_category TEXT NOT NULL,
    reason TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_security_audit_ts ON security_audit(timestamp);
`);

export function logSecurityIncident({ ip, userId, prompt, category, reason }) {
  try {
    const id = crypto.randomUUID();
    const snippet = (prompt || '').slice(0, 300);
    db.prepare(`
      INSERT INTO security_audit (id, timestamp, ip, user_id, prompt_snippet, risk_category, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, Date.now(), ip || 'unknown', userId || 'admin', snippet, category, reason);
  } catch (err) {
    console.error('Failed to log security incident:', err);
  }
}

// Destructive verbs dictionary (RU & EN)
const DESTRUCTIVE_VERBS = new Set([
  'удали', 'удалить', 'удаляй', 'удалите', 'удали-ка',
  'сотри', 'стереть', 'стирай', 'сотрите',
  'сноси', 'снеси', 'сносить', 'снесите',
  'уничтожь', 'уничтожить', 'уничтожай', 'уничтожьте',
  'очисти', 'очистить', 'вычисти', 'вычистить',
  'вайпни', 'вайпнуть', 'дропни', 'дропнуть',
  'выпили', 'выпилить', 'выкинь', 'выкинуть',
  'delete', 'destroy', 'wipe', 'erase', 'truncate', 'drop', 'kill', 'purge'
]);

// Critical infrastructure targets (RU & EN)
const CRITICAL_TARGETS = new Set([
  'сервер', 'сервера', 'серверу', 'сервером', 'сервере',
  'систему', 'системы', 'системе', 'системой',
  'диск', 'диска', 'диску', 'диском', 'диске', 'диски',
  'проект', 'проекта', 'проекту', 'проектом', 'проекте', 'проекты', 'проектов',
  'apps', 'корень', 'хост', 'хоста', 'машину', 'машины', 'всё',
  'базу', 'базы', 'базе', 'базой', 'бд',
  'server', 'servers', 'system', 'systems', 'root', 'project', 'projects',
  'database', 'databases', 'db', 'disk', 'disks', 'drive', 'drives', 'host'
]);

// High-risk shell command & file patterns
const DANGEROUS_PATTERNS = [
  // rm -rf or rm with broad wildcards
  {
    regex: /\brm\s+(-[a-zA-Z]*[rfRF][a-zA-Z]*\s+)?(\/|~|\$HOME|\.\.|\*|\/\*|\/home|\/etc|\/var|\/usr|\/boot)(?:\s|$|;)/i,
    category: 'dangerous_command',
    reason: 'Обнаружена опасная команда удаления корневых или системных директорий (rm -rf)'
  },
  {
    regex: /\brmdir\s+(\/|~|\$HOME|\/etc|\/var|\/usr)(?:\s|$|;)/i,
    category: 'dangerous_command',
    reason: 'Попытка удаления системной директории (rmdir)'
  },
  // Low level disk wipe / format
  {
    regex: /\b(mkfs(\.[a-z0-9]+)?|dd\s+if=\/dev\/(zero|urandom)|fdisk|parted|wipefs)\b/i,
    category: 'disk_wipe',
    reason: 'Низкоуровневая операция форматирования или перезаписи диска'
  },
  // Fork bomb & DOS
  {
    regex: /:\(\)\s*\{\s*:\|:&\s*\}\s*;\s*:/,
    category: 'fork_bomb',
    reason: 'Обнаружен fork-bomb паттерн (DOS атака на память)'
  },
  // OS shutdown / reboot
  {
    regex: /\b(shutdown|reboot|poweroff|halt|init\s+[06])\b/i,
    category: 'system_sabotage',
    reason: 'Команда выключения или перезагрузки сервера'
  },
  // Privilege & permission sabotage
  {
    regex: /\bchmod\s+(-[a-zA-Z]*[rR][a-zA-Z]*\s+)?777\s+(\/|~|\/etc|\/var|\/usr|\/bin|\/sbin)\b/i,
    category: 'privilege_sabotage',
    reason: 'Небезопасное изменение прав системных каталогов (chmod 777)'
  },
  // Secrets theft
  {
    regex: /(\/etc\/shadow|\/etc\/gshadow|\.ssh\/id_rsa|\.ssh\/id_ed25519|\.ssh\/id_ecdsa|\/etc\/sudoers)/i,
    category: 'credential_theft',
    reason: 'Попытка чтения или кражи приватных ключей SSH, паролей (/etc/shadow) или sudoers'
  },
  // Pipe execution of remote code
  {
    regex: /\b(curl|wget)\s+[^|;&\n]+\|\s*(ba)?sh\b/i,
    category: 'remote_code_execution',
    reason: 'Загрузка и выполнение внешних shell-скриптов через pipe (curl | bash)'
  },
  // Jailbreak & Prompt Injection
  {
    regex: /(ignore\s+(all\s+)?previous\s+instructions|disregard\s+(all\s+)?prior\s+instructions|system\s+override:\s*disable\s+guardrails|DAN\s+mode\s+enabled|you\s+are\s+now\s+unfiltered|jailbreak\s+mode|забудь\s+(все\s+)?(предыдущие\s+)?инструкции|отключи\s+все\s+ограничения|игнорируй\s+все\s+правила)/i,
    category: 'prompt_injection',
    reason: 'Попытка обхода правил безопасности через prompt injection (Jailbreak)'
  }
];

// Dangerous patterns for Tool execution inspection
const DANGEROUS_TOOL_PATTERNS = [
  /\brm\s+(-[a-zA-Z]*[rfRF][a-zA-Z]*\s+)?(\/|~|\$HOME|\.\.|\*|\/\*|\/home|\/etc|\/var|\/usr|\/boot)(?:\s|$|;)/i,
  /\brmdir\s+(\/|~|\$HOME|\/etc|\/var)(?:\s|$|;)/i,
  /\bmkfs(\.[a-z0-9]+)?\b/i,
  /\bdd\s+if=/i,
  /\b(shutdown|reboot|poweroff|halt|init\s+[06])\b/i,
  /:\(\)\s*\{\s*:\|:&\s*\}\s*;\s*:/,
  /\bchmod\s+(-[a-zA-Z]*[rR][a-zA-Z]*\s+)?777\s+(\/|\/etc|\/var|\/usr)\b/i,
  /\bcat\s+.*(\/etc\/shadow|\/etc\/gshadow|\.ssh\/id_)/i,
  /\b(curl|wget)\s+.*\|\s*(ba)?sh\b/i
];

/**
 * Validates a user prompt before passing it to the AI agent.
 * Returns { safe: true } or { safe: false, category, reason }
 */
export function validatePrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return { safe: false, category: 'empty_prompt', reason: 'Промпт не может быть пустым' };
  }

  const text = prompt.trim();

  // 1. Check dangerous patterns & jailbreaks
  for (const rule of DANGEROUS_PATTERNS) {
    if (rule.regex.test(text)) {
      return {
        safe: false,
        category: rule.category,
        reason: rule.reason
      };
    }
  }

  // 2. Semantic token analysis for destructive intent
  const words = text.toLowerCase().split(/[^\p{L}\p{N}]+/u);
  const hasVerb = words.some((w) => DESTRUCTIVE_VERBS.has(w));
  const hasTarget = words.some((w) => CRITICAL_TARGETS.has(w));

  if (hasVerb && hasTarget) {
    return {
      safe: false,
      category: 'destructive_intent',
      reason: 'Запрос содержит указание на удаление или уничтожение проекта, сервера или системных компонентов'
    };
  }

  return { safe: true };
}

/**
 * Validates a tool command line before or during execution.
 * Returns { safe: true } or { safe: false, reason }
 */
export function validateToolCommand(commandLine) {
  if (!commandLine || typeof commandLine !== 'string') {
    return { safe: true };
  }

  for (const pattern of DANGEROUS_TOOL_PATTERNS) {
    if (pattern.test(commandLine)) {
      return {
        safe: false,
        reason: `Выполнение команды заблокировано: обнаружена потенциально деструктивная операция (${commandLine.slice(0, 80)})`
      };
    }
  }

  return { safe: true };
}

/**
 * Returns security instructions to prepend to agy turns
 */
export function getSecurityDirectives() {
  return [
    'CRITICAL SECURITY GUARD: You are strictly forbidden from deleting, formatting, or destroying projects, files outside the project directory, or system files.',
    'Never execute commands like rm -rf /, mkfs, or shutdown.',
    'Never disclose system secrets, private keys, or passwords.',
    'All changes must stay within the project directory.'
  ].join(' ');
}
