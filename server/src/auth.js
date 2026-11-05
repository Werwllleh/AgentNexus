import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { logSecurityIncident } from './guardrails.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUTH_FILE = path.resolve(__dirname, '../data/auth.json');
const ENV_FILE = path.resolve(__dirname, '../../.env');

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days sliding session
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

// Read credentials from .env
function loadEnvCredentials() {
  if (!fs.existsSync(ENV_FILE)) return null;
  try {
    const lines = fs.readFileSync(ENV_FILE, 'utf-8').split('\n');
    const creds = {};
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const k = trimmed.slice(0, eqIdx).trim();
        const v = trimmed.slice(eqIdx + 1).trim();
        creds[k] = v;
      }
    }
    if (creds.USER_LOGIN && creds.USER_PASSWORD) {
      return {
        login: creds.USER_LOGIN,
        password: creds.USER_PASSWORD
      };
    }
  } catch (err) {
    console.error('Failed to read .env credentials:', err.message);
  }
  return null;
}

// Initialize master credentials if not exist
export function initAuth() {
  const envCreds = loadEnvCredentials();
  if (envCreds) {
    return; // Initialized via .env
  }

  if (fs.existsSync(AUTH_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
      if (data.hash && data.salt) {
        return;
      }
    } catch { /* proceed to re-init */ }
  }

  const defaultPassword = crypto.randomBytes(9).toString('base64url');
  setPassword(defaultPassword);
  console.log(' [SECURITY] Master Credentials initialized');
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

// Login attempt handler with login + password verification and rate limiting
export function attemptLogin(loginInput, passwordInput, ip, userAgent) {
  cleanExpiredSessions();

  const now = Date.now();
  const attemptInfo = loginAttempts.get(ip) || { count: 0, lockedUntil: 0 };

  // Check lockout
  if (attemptInfo.lockedUntil > now) {
    const minutesLeft = Math.ceil((attemptInfo.lockedUntil - now) / 60000);
    logSecurityIncident({
      ip,
      userId: loginInput || 'anonymous',
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

  const loginStr = (loginInput || '').trim();
  const passStr = passwordInput || '';

  const envCreds = loadEnvCredentials();
  let isValid = false;

  if (envCreds) {
    const loginMatches = loginStr === envCreds.login;
    const passBuf = Buffer.from(passStr);
    const expBuf = Buffer.from(envCreds.password);
    const passMatches = passBuf.length === expBuf.length && crypto.timingSafeEqual(passBuf, expBuf);
    isValid = loginMatches && passMatches;
  } else if (fs.existsSync(AUTH_FILE)) {
    const authData = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
    isValid = (loginStr === 'admin') && verifyPassword(passStr, authData.salt, authData.hash);
  }

  if (!isValid) {
    attemptInfo.count += 1;
    if (attemptInfo.count >= MAX_FAILED_ATTEMPTS) {
      attemptInfo.lockedUntil = now + LOCKOUT_DURATION_MS;
      logSecurityIncident({
        ip,
        userId: loginStr || 'anonymous',
        prompt: `Failed login attempt #${attemptInfo.count}`,
        category: 'brute_force_detected',
        reason: 'Превышен лимит 5 неверных попыток. IP заблокирован на 15 минут'
      });
      loginAttempts.set(ip, attemptInfo);
      return {
        success: false,
        locked: true,
        error: 'Неверный логин или пароль. Доступ заблокирован на 15 минут.'
      };
    }

    loginAttempts.set(ip, attemptInfo);
    return {
      success: false,
      locked: false,
      attemptsRemaining: MAX_FAILED_ATTEMPTS - attemptInfo.count,
      error: `Неверный логин или пароль. Осталось попыток: ${MAX_FAILED_ATTEMPTS - attemptInfo.count}`
    };
  }

  // Success -> reset failure tracker
  loginAttempts.delete(ip);

  // Generate session token
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = now + SESSION_TTL_MS;

  db.prepare(`
    INSERT INTO sessions (token, user_id, created_at, expires_at, ip, user_agent)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(token, loginStr, now, expiresAt, ip, userAgent || '');

  return {
    success: true,
    token,
    expiresAt,
    user: { id: loginStr, role: 'admin' }
  };
}

export function validateSession(token, autoExtend = true) {
  if (!token || typeof token !== 'string') return null;
  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!session) return null;

  const now = Date.now();
  if (session.expires_at < now) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }

  // Sliding session renewal: if less than 28 days left, extend by 30 days
  let wasRefreshed = false;
  if (autoExtend && session.expires_at - now < 28 * 24 * 60 * 60 * 1000) {
    const newExpires = now + SESSION_TTL_MS;
    try {
      db.prepare('UPDATE sessions SET expires_at = ? WHERE token = ?').run(newExpires, token);
      session.expires_at = newExpires;
      wasRefreshed = true;
    } catch (e) {
      console.warn('Failed to update session expiration:', e.message);
    }
  }

  return {
    userId: session.user_id,
    token: session.token,
    expiresAt: session.expires_at,
    wasRefreshed
  };
}

export function refreshSession(token) {
  if (!token || typeof token !== 'string') return null;
  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!session) return null;

  const now = Date.now();
  if (session.expires_at < now) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }

  const newExpires = now + SESSION_TTL_MS;
  db.prepare('UPDATE sessions SET expires_at = ? WHERE token = ?').run(newExpires, token);

  return {
    success: true,
    userId: session.user_id,
    token: session.token,
    expiresAt: newExpires
  };
}

export function revokeSession(token) {
  if (!token) return;
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

// Express Auth Middleware
export function requireAuth(req, res, next) {
  if (req.method === 'OPTIONS') return next();

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

  const session = validateSession(token, true);
  if (!session) {
    return res.status(401).json({
      error: 'Требуется авторизация',
      code: 'UNAUTHORIZED'
    });
  }

  // If session was extended via sliding window, update cookie
  if (session.wasRefreshed) {
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.cookie('pm_session', session.token, {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      maxAge: SESSION_TTL_MS
    });
  }

  req.user = session;
  next();
}
