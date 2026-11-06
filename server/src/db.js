import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, '../data/pm.db');

export const db = new DatabaseSync(dbPath);

// Initialize tables
db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_activity INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'idle',
    last_error TEXT
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'done'
  );

  CREATE TABLE IF NOT EXISTS steps (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    step_index INTEGER NOT NULL,
    step_type TEXT NOT NULL,
    tool_name TEXT,
    tool_params TEXT,
    tool_output TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at INTEGER NOT NULL,
    duration_seconds REAL
  );

  CREATE INDEX IF NOT EXISTS idx_conversations_proj ON conversations(project_id);
  CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_steps_msg ON steps(message_id);
`);

// Safe migration for agy_id column
try {
  db.exec('ALTER TABLE conversations ADD COLUMN agy_id TEXT');
} catch {
  // column already exists
}

// Clean up orphaned streaming messages and reset conversations on startup
try {
  db.exec(`
    DELETE FROM messages WHERE status = 'streaming' AND content = '';
    UPDATE messages SET status = 'stopped' WHERE status = 'streaming';
    UPDATE conversations SET status = 'idle' WHERE status = 'running';
  `);
} catch (err) {
  console.error('Error cleaning orphaned sessions in DB:', err);
}

// Repository helpers
export const dbRepo = {
  // Projects
  upsertProject(id, name, projPath) {
    const existing = db.prepare('SELECT id FROM projects WHERE id = ?').get(id);
    const now = Date.now();
    if (!existing) {
      db.prepare('INSERT INTO projects (id, name, path, created_at, last_activity) VALUES (?, ?, ?, ?, ?)').run(id, name, projPath, now, now);
    } else {
      db.prepare('UPDATE projects SET name = ?, path = ?, last_activity = ? WHERE id = ?').run(name, projPath, now, id);
    }
  },

  getAllProjects() {
    return db.prepare('SELECT * FROM projects ORDER BY last_activity DESC').all();
  },

  // Conversations
  getConversationsByProject(projectId) {
    return db.prepare('SELECT * FROM conversations WHERE project_id = ? ORDER BY updated_at DESC').all(projectId);
  },

  getConversation(id) {
    return db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  },

  createConversation(id, projectId, title = 'Новый диалог') {
    const now = Date.now();
    db.prepare(`
      INSERT INTO conversations (id, project_id, title, created_at, updated_at, status)
      VALUES (?, ?, ?, ?, ?, 'idle')
    `).run(id, projectId, title, now, now);
    db.prepare('UPDATE projects SET last_activity = ? WHERE id = ?').run(now, projectId);
    return this.getConversation(id);
  },

  updateConversation(id, { title, status, lastError, agyId }) {
    const now = Date.now();
    if (title !== undefined) {
      db.prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?').run(title, now, id);
    }
    if (status !== undefined) {
      db.prepare('UPDATE conversations SET status = ?, updated_at = ? WHERE id = ?').run(status, now, id);
    }
    if (lastError !== undefined) {
      db.prepare('UPDATE conversations SET last_error = ?, updated_at = ? WHERE id = ?').run(lastError, now, id);
    }
    if (agyId !== undefined) {
      db.prepare('UPDATE conversations SET agy_id = ?, updated_at = ? WHERE id = ?').run(agyId, now, id);
    }
  },

  // Messages
  createMessage(id, conversationId, role, content, status = 'done') {
    const now = Date.now();
    db.prepare(`
      INSERT INTO messages (id, conversation_id, role, content, created_at, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, conversationId, role, content, now, status);
    db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, conversationId);
  },

  updateMessage(id, { content, status }) {
    if (content !== undefined && status !== undefined) {
      db.prepare('UPDATE messages SET content = ?, status = ? WHERE id = ?').run(content, status, id);
    } else if (content !== undefined) {
      db.prepare('UPDATE messages SET content = ? WHERE id = ?').run(content, id);
    } else if (status !== undefined) {
      db.prepare('UPDATE messages SET status = ? WHERE id = ?').run(status, id);
    }
  },

  getMessage(id) {
    return db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
  },

  getMessagesByConversation(conversationId) {
    const messages = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(conversationId);
    for (const msg of messages) {
      const rawSteps = db.prepare('SELECT * FROM steps WHERE message_id = ? ORDER BY step_index ASC').all(msg.id);
      msg.steps = rawSteps.map((step) => {
        let parsedParams = null;
        if (step.tool_params) {
          try {
            parsedParams = JSON.parse(step.tool_params);
          } catch {
            parsedParams = step.tool_params;
          }
        }
        return {
          id: step.id,
          stepIndex: step.step_index,
          stepType: step.step_type,
          toolName: step.tool_name,
          toolParams: parsedParams,
          toolOutput: step.tool_output,
          status: step.status,
          durationSeconds: step.duration_seconds,
          // Backward compatibility aliases:
          step_index: step.step_index,
          step_type: step.step_type,
          tool_name: step.tool_name,
          tool_params: parsedParams,
          tool_output: step.tool_output,
          duration_seconds: step.duration_seconds
        };
      });
    }
    return messages;
  },

  // Steps
  upsertStep({ id, messageId, stepIndex, stepType, toolName, toolParams, toolOutput, status, durationSeconds }) {
    const existing = db.prepare('SELECT id FROM steps WHERE id = ?').get(id);
    const now = Date.now();
    const paramsStr = toolParams ? (typeof toolParams === 'string' ? toolParams : JSON.stringify(toolParams)) : null;

    if (!existing) {
      db.prepare(`
        INSERT INTO steps (id, message_id, step_index, step_type, tool_name, tool_params, tool_output, status, created_at, duration_seconds)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, messageId, stepIndex, stepType, toolName || null, paramsStr, toolOutput || null, status || 'active', now, durationSeconds || null);
    } else {
      db.prepare(`
        UPDATE steps
        SET status = ?,
            tool_params = COALESCE(?, tool_params),
            tool_output = COALESCE(?, tool_output),
            duration_seconds = COALESCE(?, duration_seconds)
        WHERE id = ?
      `).run(status || 'done', paramsStr || null, toolOutput || null, durationSeconds || null, id);
    }
  }
};
