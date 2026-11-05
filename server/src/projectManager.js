import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dbRepo } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECTS_FILE = path.resolve(__dirname, '../data/projects.json');

export function loadConfiguredProjects() {
  if (!fs.existsSync(PROJECTS_FILE)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(PROJECTS_FILE, 'utf-8');
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list;
  } catch (err) {
    console.error('Failed to parse projects.json:', err.message);
    return [];
  }
}

export function scanProjects() {
  const configs = loadConfiguredProjects();
  const projects = [];

  for (const cfg of configs) {
    if (!cfg.id || !cfg.path) continue;

    const projPath = path.resolve(cfg.path);

    // Security check: ensure path actually exists and is a directory
    try {
      const stat = fs.statSync(projPath);
      if (!stat.isDirectory()) continue;
    } catch {
      // directory does not exist or inaccessible
      continue;
    }

    let gitBranch = null;
    try {
      const gitDir = path.join(projPath, '.git');
      if (fs.existsSync(gitDir)) {
        gitBranch = execSync('git branch --show-current', {
          cwd: projPath,
          encoding: 'utf-8',
          timeout: 2000
        }).trim();
      }
    } catch {
      // not a git repo or timeout
    }

    const name = cfg.name || cfg.id;
    dbRepo.upsertProject(cfg.id, name, projPath);

    const conversations = dbRepo.getConversationsByProject(cfg.id);
    const hasRunningSession = conversations.some((c) => c.status === 'running');

    projects.push({
      id: cfg.id,
      name,
      path: projPath,
      description: cfg.description || '',
      category: cfg.category || 'apps',
      gitBranch,
      conversationCount: conversations.length,
      hasRunningSession,
      conversations
    });
  }

  return projects;
}

export function getProjectById(id) {
  if (!id || typeof id !== 'string') return null;
  const projects = scanProjects();
  return projects.find((p) => p.id === id) || null;
}
