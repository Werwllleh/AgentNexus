import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { logSecurityIncident } from './guardrails.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUTH_FILE = path.resolve(__dirname, '../data/auth.json');

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// In-memory brute force tracker: ip -> { count, lockedUntil }
const loginAttempts = new Map();

// Initialize sessions table in SQLite
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    ip TEXT,
    user_agent TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
`);

// Clean expired sessions
export function cleanExpiredSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
}
cleanExpiredSessions();

// Hash password with scrypt
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return { salt, hash };
}

// Constant-time verify password
export function verifyPassword(password, salt, storedHash) {
  try {
    const computedHash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
    const computedBuf = Buffer.from(computedHash, 'hex');
    const storedBuf = Buffer.from(storedHash, 'hex');
    if (computedBuf.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(computedBuf, storedBuf);
  } catch {
    return false;
  }
}

// Initialize master credentials if not exist
export function initAuth() {
  if (fs.existsSync(AUTH_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
      if (data.hash && data.salt) {
        return; // Already initialized
      }
    } catch { /* proceed to re-init */ }
  }

  // Generate a strong default password
  const defaultPassword = crypto.randomBytes(9).toString('base64url'); // ~12 characters url-safe
  setPassword(defaultPassword);
  console.log('================================================================');
  console.log(' [SECURITY] Master Password initialized for Gemini Hub:');
  console.log(`   Password: ${defaultPassword}`);
  console.log('   Change it anytime via: npm run set-password <new_password>');
  console.log('================================================================');
}

export function setPassword(newPassword) {
  if (!newPassword || newPassword.length < 6) {
    throw new Error('Password must be at least 6 characters long');
  }
  const { salt, hash } = hashPassword(newPassword);
  const data = {
    salt,
    hash,
    updatedAt: Date.now()
  };
  fs.writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || 'unknown';
}

// Login attempt handler with brute force protection
export function attemptLogin(password, ip, userAgent) {
  cleanExpiredSessions();

  const now = Date.now();
  const attemptInfo = loginAttempts.get(ip) || { count: 0, lockedUntil: 0 };

  // Check lockout
  if (attemptInfo.lockedUntil > now) {
    const minutesLeft = Math.ceil((attemptInfo.lockedUntil - now) / 60000);
    logSecurityIncident({
      ip,
      userId: 'anonymous',
      prompt: 'Blocked login attempt during active lockout',
      category: 'brute_force_lockout',
      reason: `Превышено количество попыток входа. Блокировка еще ${minutesLeft} мин.`
    });
    return {
      success: false,
      locked: true,
      error: `Слишком много неверных попыток. Доступ заблокирован на ${minutesLeft} мин.`
    };
  }

  if (!fs.existsSync(AUTH_FILE)) {
    initAuth();
  }

  const authData = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
  const isValid = verifyPassword(password, authData.salt, authData.hash);

  if (!isValid) {
    attemptInfo.count += 1;
    if (attemptInfo.count >= MAX_FAILED_ATTEMPTS) {
      attemptInfo.lockedUntil = now + LOCKOUT_DURATION_MS;
      logSecurityIncident({
        ip,
        userId: 'anonymous',
        prompt: `Failed login attempt #${attemptInfo.count}`,
        category: 'brute_force_detected',
        reason: 'Превышен лимит 5 неверных попыток. IP заблокирован на 15 минут'
      });
      loginAttempts.set(ip, attemptInfo);
      return {
        success: false,
        locked: true,
        error: 'Неверный пароль. Превышен лимит попыток. Доступ заблокирован на 15 минут.'
      };
    }

    loginAttempts.set(ip, attemptInfo);
    return {
      success: false,
      locked: false,
      attemptsRemaining: MAX_FAILED_ATTEMPTS - attemptInfo.count,
      error: `Неверный пароль. Осталось попыток: ${MAX_FAILED_ATTEMPTS - attemptInfo.count}`
    };
  }

  // Password is correct -> reset failure tracker
  loginAttempts.delete(ip);

  // Generate session token
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = now + SESSION_TTL_MS;

  db.prepare(`
    INSERT INTO sessions (token, user_id, created_at, expires_at, ip, user_agent)
    VALUES (?, 'admin', ?, ?, ?, ?)
  `).run(token, now, expiresAt, ip, userAgent || '');

  return {
    success: true,
    token,
    expiresAt,
    user: { id: 'admin', role: 'admin' }
  };
}

export function validateSession(token) {
  if (!token || typeof token !== 'string') return null;
  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!session) return null;

  if (session.expires_at < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }

  return {
    userId: session.user_id,
    token: session.token,
    expiresAt: session.expires_at
  };
}

export function revokeSession(token) {
  if (!token) return;
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

// Express Auth Middleware
export function requireAuth(req, res, next) {
  // Allow OPTIONS preflight
  if (req.method === 'OPTIONS') return next();

  // Extract token from Header or Cookie or Query
  let token = null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }

  if (!token && req.headers.cookie) {
    const cookies = Object.fromEntries(
      req.headers.cookie.split(';').map((c) => {
        const [k, ...v] = c.trim().split('=');
        return [k, decodeURIComponent(v.join('='))];
      })
    );
    token = cookies['pm_session'];
  }

  if (!token && req.query?.token) {
    token = String(req.query.token);
  }

  const session = validateSession(token);
  if (!session) {
    return res.status(401).json({
      error: 'Требуется авторизация',
      code: 'UNAUTHORIZED'
    });
  }

  req.user = session;
  next();
}
