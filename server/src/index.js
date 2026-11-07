import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import util from 'node:util';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { scanProjects, getProjectById } from './projectManager.js';
import { dbRepo } from './db.js';
import {
  initAuth,
  attemptLogin,
  requireAuth,
  validateSession,
  refreshSession,
  revokeSession,
  getClientIp
} from './auth.js';
import {
  setWss,
  broadcast,
  getActiveSession,
  startTurn,
  stopSession,
  getAllActiveSessionIds
} from './sessionManager.js';
import { engineRegistry } from './engines/engineRegistry.js';
import {
  browseDirectory,
  readFileContent,
  getGitStatus,
  addFolderAsProject
} from './fileExplorer.js';
import { versionManager } from './versionManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize authentication on boot
initAuth();

// Clean up any stale active sessions on server start
dbRepo.cleanupOrphanedSessions();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

setWss(wss);

// Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Public Health & Auth Endpoints
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'AgentNexus',
    version: versionManager.getPackageVersion(),
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

app.post('/api/auth/login', (req, res) => {
  const { login, password } = req.body || {};
  if (!login || !password) {
    return res.status(400).json({ error: 'Логин и пароль обязательны' });
  }

  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';

  const result = attemptLogin(login, password, ip, userAgent);
  if (!result.success) {
    const statusCode = result.locked ? 429 : 401;
    return res.status(statusCode).json({ error: result.error });
  }

  // Set secure cookie
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie('pm_session', result.token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });

  res.json({
    success: true,
    token: result.token,
    user: result.user
  });
});

app.get('/api/auth/me', (req, res) => {
  // Check auth without failing hard
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
    return res.json({ authenticated: false });
  }

  res.json({
    authenticated: true,
    user: { id: session.userId, role: 'admin' }
  });
});

app.post('/api/auth/logout', (req, res) => {
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
  if (token) {
    revokeSession(token);
  }
  res.clearCookie('pm_session');
  res.json({ success: true });
});

app.post('/api/auth/refresh', requireAuth, (req, res) => {
  const result = refreshSession(req.user.token);
  if (!result) {
    return res.status(401).json({ error: 'Сессия недействительна' });
  }

  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie('pm_session', result.token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  });

  res.json({
    success: true,
    expiresAt: result.expiresAt
  });
});

// All routes below require valid authentication
app.use('/api', requireAuth);

// Protected API Routes
app.get('/api/projects', (req, res) => {
  try {
    const projects = scanProjects();
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/projects/:id', (req, res) => {
  const project = getProjectById(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

app.get('/api/projects/:id/conversations', (req, res) => {
  try {
    const conversations = dbRepo.getConversationsByProject(req.params.id);
    const activeIds = getAllActiveSessionIds();
    const enriched = conversations.map((c) => ({
      ...c,
      isRunning: activeIds.includes(c.id)
    }));
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/projects/:id/conversations', (req, res) => {
  try {
    const { title } = req.body;
    const conversationId = crypto.randomUUID();
    const conv = dbRepo.createConversation(conversationId, req.params.id, title || 'Новый диалог');
    res.json(conv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/conversations/:id', (req, res) => {
  try {
    const conversation = dbRepo.getConversation(req.params.id);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    const messages = dbRepo.getMessagesByConversation(req.params.id);
    const activeSession = getActiveSession(req.params.id);

    res.json({
      ...conversation,
      isRunning: !!activeSession,
      activeAssistantMessageId: activeSession ? activeSession.assistantMessageId : null,
      messages
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/conversations/:id', requireAuth, (req, res) => {
  try {
    const { title } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }
    const conv = dbRepo.getConversation(req.params.id);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });

    dbRepo.updateConversation(req.params.id, { title: title.trim() });
    const updated = dbRepo.getConversation(req.params.id);
    res.json({ success: true, conversation: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/conversations/:id', requireAuth, (req, res) => {
  try {
    if (getActiveSession(req.params.id)) {
      stopSession(req.params.id);
    }
    const success = dbRepo.deleteConversation(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    res.json({ success: true, id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Available AI Engines & Models
app.get('/api/engines', requireAuth, (req, res) => {
  try {
    const list = engineRegistry.getAll();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// File System Explorer & Directory Picker
app.get('/api/fs/browse', requireAuth, (req, res) => {
  try {
    const data = browseDirectory(req.query.path);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/fs/file', requireAuth, (req, res) => {
  try {
    const data = readFileContent(req.query.path);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/fs/git-status', requireAuth, (req, res) => {
  try {
    const data = getGitStatus(req.query.path);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/projects/add-folder', requireAuth, (req, res) => {
  try {
    const { path: folderPath, name, description, category } = req.body;
    if (!folderPath) {
      return res.status(400).json({ error: 'path is required' });
    }
    const newProject = addFolderAsProject({ folderPath, name, description, category });
    res.json({ success: true, project: newProject });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/prompt', async (req, res) => {
  try {
    const { projectId, conversationId, prompt, engine, model, mode, effort } = req.body;
    if (!projectId || !prompt) {
      return res.status(400).json({ error: 'projectId and prompt are required' });
    }

    const project = getProjectById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check if session is already running
    if (conversationId && getActiveSession(conversationId)) {
      return res.status(409).json({ error: 'This conversation is already running a task' });
    }

    const clientIp = getClientIp(req);

    const result = await startTurn({
      projectId,
      projectPath: project.path,
      conversationId: conversationId || null,
      prompt,
      engine: engine || 'gemini',
      model: model || 'auto',
      mode: mode || 'auto',
      effort: effort || 'high',
      clientIp
    });

    res.json({ success: true, ...result });
  } catch (err) {
    if (err.isSecurityBlock) {
      return res.status(400).json({
        error: err.message,
        isSecurityBlock: true,
        category: err.category
      });
    }
    console.error('Error starting turn:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/conversations/:id/stop', (req, res) => {
  try {
    const stopped = stopSession(req.params.id);
    res.json({ success: stopped });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dynamic Quotas / Usage API from agy /usage
const execFileAsync = util.promisify(execFile);
let usageCache = null;
let usageCacheTime = 0;
const USAGE_CACHE_TTL_MS = 60 * 1000; // 60s cache

async function fetchUsageFromCLI() {
  const { stdout } = await execFileAsync(
    '/home/alex/.local/bin/agy',
    ['-p', '/usage', '--output-format', 'json'],
    { timeout: 15000, env: { ...process.env, TERM: 'dumb' } }
  );
  return stdout;
}

async function getUsageData(force = false) {
  const now = Date.now();
  if (!force && usageCache && now - usageCacheTime < USAGE_CACHE_TTL_MS) {
    return { ...usageCache, cached: true };
  }

  let stdout;
  try {
    stdout = await fetchUsageFromCLI();
  } catch (err) {
    console.warn('[Usage] Attempt 1 failed:', err.message, '- retrying in 700ms...');
    await new Promise((r) => setTimeout(r, 700));
    stdout = await fetchUsageFromCLI();
  }

  const parsed = JSON.parse(stdout);
  let formattedGroups = [];

  if (Array.isArray(parsed.command?.data?.groups) && parsed.command.data.groups.length > 0) {
    formattedGroups = parsed.command.data.groups.map((grp) => {
      const buckets = grp.buckets || [];
      const weeklyBucket = buckets.find((b) => b.window === 'weekly') || buckets.find((b) => b.id?.includes('weekly')) || buckets[0];
      const fiveHourBucket = buckets.find((b) => b.window === '5h') || buckets.find((b) => b.id?.includes('5h')) || buckets[1];

      const parseBucket = (b) => {
        if (!b) return null;
        let frac = typeof b.remaining_fraction === 'number' ? b.remaining_fraction : 1;
        frac = Math.max(0, Math.min(1, frac));
        const percent = Math.round(frac * 100);
        return {
          id: b.id,
          name: b.name,
          percent,
          fraction: frac,
          resetTime: b.reset_time,
          description: b.description
        };
      };

      return {
        name: grp.name,
        description: grp.description,
        weekly: parseBucket(weeklyBucket),
        fiveHour: parseBucket(fiveHourBucket)
      };
    });
  } else if (typeof parsed.response === 'string' && parsed.response.trim()) {
    // Parse TSV fallback
    const lines = parsed.response.split('\n');
    const groupMap = new Map();
    for (const line of lines) {
      const parts = line.split('\t').map((s) => s.trim());
      if (parts.length < 3) continue;
      const [groupName, bucketName, percentStr, resetTime] = parts;
      const num = parseInt(percentStr.replace('%', ''), 10);
      const percent = isNaN(num) ? 100 : Math.max(0, Math.min(100, num));
      if (!groupMap.has(groupName)) {
        groupMap.set(groupName, { name: groupName, weekly: null, fiveHour: null });
      }
      const g = groupMap.get(groupName);
      const isWeekly = bucketName.toLowerCase().includes('weekly') || bucketName.toLowerCase().includes('недел');
      const bObj = {
        name: bucketName,
        percent,
        fraction: percent / 100,
        resetTime: resetTime || null
      };
      if (isWeekly) {
        g.weekly = bObj;
      } else {
        g.fiveHour = bObj;
      }
    }
    formattedGroups = Array.from(groupMap.values());
  }

  usageCache = {
    groups: formattedGroups,
    updatedAt: now
  };
  usageCacheTime = now;

  return { ...usageCache, cached: false };
}

// Pre-warm usage cache on boot
setTimeout(() => {
  getUsageData().then(() => console.log('[Usage] Pre-warmed usage quotas cache')).catch((e) => console.warn('[Usage] Pre-warm failed:', e.message));
}, 2500);

app.get('/api/system/usage', async (req, res) => {
  const force = req.query.force === 'true';
  try {
    const data = await getUsageData(force);
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('Error fetching usage quotas:', err.message);
    if (usageCache) {
      return res.json({ success: true, ...usageCache, stale: true });
    }
    res.status(500).json({ error: 'Не удалось получить квоты: ' + err.message, groups: [] });
  }
});

// Version & Update Center API
app.get('/api/system/version', requireAuth, async (req, res) => {
  try {
    const force = req.query.force === 'true';
    const versionInfo = await versionManager.checkForUpdates(force);
    res.json({ success: true, ...versionInfo });
  } catch (err) {
    console.error('[API] Error checking version:', err);
    res.status(500).json({ error: 'Ошибка проверки версии: ' + err.message });
  }
});

app.post('/api/system/update', requireAuth, async (req, res) => {
  try {
    const { branch = 'master', force = false } = req.body || {};
    const result = await versionManager.performUpdate({ branch, force });
    res.json(result);
  } catch (err) {
    console.error('[API] Error performing update:', err);
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/system/update-status', requireAuth, (req, res) => {
  res.json(versionManager.getUpdateStatus());
});

// WebSocket Connection handling with Authentication
wss.on('connection', (ws, req) => {
  // Extract token from query or cookies
  let token = null;
  const parsedUrl = new URL(req.url, 'http://localhost');
  token = parsedUrl.searchParams.get('token');

  if (!token && req.headers.cookie) {
    const cookies = Object.fromEntries(
      req.headers.cookie.split(';').map((c) => {
        const [k, ...v] = c.trim().split('=');
        return [k, decodeURIComponent(v.join('='))];
      })
    );
    token = cookies['pm_session'];
  }

  const session = validateSession(token);
  if (!session) {
    ws.send(JSON.stringify({ type: 'error', error: 'Authentication required' }));
    ws.close(4001, 'Unauthorized');
    return;
  }

  ws.authenticated = true;
  ws.user = session;
  ws.subscribedConversationId = null;

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'subscribe') {
        ws.subscribedConversationId = msg.conversationId;

        // If there's an active session, sync state immediately to this client
        const active = getActiveSession(msg.conversationId);
        if (active) {
          ws.send(
            JSON.stringify({
              type: 'sync_state',
              conversationId: msg.conversationId,
              isRunning: true,
              assistantMessageId: active.assistantMessageId,
              currentContent: active.accumulatedText,
              currentSteps: Array.from(active.stepMap.values())
            })
          );
        } else {
          ws.send(
            JSON.stringify({
              type: 'sync_state',
              conversationId: msg.conversationId,
              isRunning: false
            })
          );
        }
      }

      if (msg.type === 'unsubscribe') {
        ws.subscribedConversationId = null;
      }
    } catch (err) {
      console.error('WS message error:', err);
    }
  });

  ws.on('close', () => {
    ws.subscribedConversationId = null;
  });
});

// Serve frontend build if exists
const publicDir = path.resolve(__dirname, '../public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.use((req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

const PORT = process.env.PORT || 3050;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Gemini Project Management] Server listening on http://0.0.0.0:${PORT}`);
});
