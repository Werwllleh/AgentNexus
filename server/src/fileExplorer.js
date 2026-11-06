import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { dbRepo } from './db.js';
import { loadConfiguredProjects } from './projectManager.js';

const ALLOWED_ROOTS = ['/home/alex'];
const PROJECTS_FILE = path.resolve(import.meta.dirname, '../data/projects.json');

/**
 * Checks whether a requested path is inside the allowed user root directory.
 * Safely resolves symlinks and prevents prefix traversal.
 */
function isSafePath(targetPath) {
  const resolved = path.resolve(targetPath);
  return ALLOWED_ROOTS.some((root) => {
    const normalizedRoot = path.resolve(root);
    const isDirectChild = resolved === normalizedRoot || resolved.startsWith(normalizedRoot + path.sep);
    if (!isDirectChild) return false;
    try {
      if (fs.existsSync(resolved)) {
        const real = fs.realpathSync(resolved);
        return real === normalizedRoot || real.startsWith(normalizedRoot + path.sep);
      }
    } catch {
      return false;
    }
    return true;
  });
}

/**
 * Browses a directory and returns files/folders with metadata and project detection.
 */
export function browseDirectory(requestedPath = '/home/alex/apps') {
  let target = path.resolve(requestedPath || '/home/alex/apps');

  if (!isSafePath(target)) {
    target = '/home/alex/apps';
  }

  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    target = '/home/alex';
  }

  const parentPath = path.dirname(target) !== target && isSafePath(path.dirname(target))
    ? path.dirname(target)
    : null;

  const entries = fs.readdirSync(target, { withFileTypes: true });
  const items = [];

  let isGitRepo = false;
  let detectedProject = null;

  // Check for project indicator files
  let hasGit = false;
  let pkgName = null;
  let pkgDesc = null;

  for (const entry of entries) {
    // Skip hidden system cache dirs
    if (entry.name === '.git') {
      hasGit = true;
      isGitRepo = true;
      continue;
    }

    const itemPath = path.join(target, entry.name);
    try {
      const isDir = entry.isDirectory();

      if (!isDir && entry.name === 'package.json') {
        try {
          const pkg = JSON.parse(fs.readFileSync(itemPath, 'utf-8'));
          pkgName = pkg.name;
          pkgDesc = pkg.description;
        } catch { /* ignore */ }
      }

      items.push({
        name: entry.name,
        path: itemPath,
        isDirectory: isDir,
        isProjectFolder: isDir && (
          fs.existsSync(path.join(itemPath, '.git')) ||
          fs.existsSync(path.join(itemPath, 'package.json')) ||
          fs.existsSync(path.join(itemPath, 'requirements.txt')) ||
          fs.existsSync(path.join(itemPath, 'Cargo.toml'))
        )
      });
    } catch {
      // ignore permission or unreadable errors
    }
  }

  // Sort: directories first, then alphabetically
  items.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });

  if (hasGit || pkgName) {
    let branch = null;
    if (hasGit) {
      try {
        branch = execSync('git branch --show-current', { cwd: target, encoding: 'utf-8', timeout: 1500 }).trim();
      } catch { /* ignore */ }
    }
    detectedProject = {
      name: pkgName || path.basename(target),
      description: pkgDesc || `Проект в папке ${path.basename(target)}`,
      branch,
      path: target
    };
  }

  return {
    currentPath: target,
    parentPath,
    isGitRepo,
    detectedProject,
    items
  };
}

const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'wasm', 'bin', 'exe',
  'tar', 'gz', 'zip', '7z', 'pdf', 'mp4', 'mp3', 'wav', 'db', 'sqlite', 'pyc', 'class'
]);

/**
 * Reads text file content safely.
 */
export function readFileContent(filePath) {
  const resolved = path.resolve(filePath);
  if (!isSafePath(resolved) || !fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
    throw new Error('Файл не найден или доступ заблокирован');
  }

  const stat = fs.statSync(resolved);
  if (stat.size > 2 * 1024 * 1024) {
    throw new Error('Файл слишком велик для предпросмотра (>2MB)');
  }

  const ext = path.extname(resolved).slice(1).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) {
    return {
      path: resolved,
      name: path.basename(resolved),
      size: stat.size,
      extension: ext,
      isBinary: true,
      content: `[Бинарный файл (${ext.toUpperCase()}) — предварительный просмотр недоступен. Размер: ${Math.round(stat.size / 1024)} KB]`
    };
  }

  const content = fs.readFileSync(resolved, 'utf-8');
  return {
    path: resolved,
    name: path.basename(resolved),
    size: stat.size,
    extension: ext,
    isBinary: false,
    content
  };
}

/**
 * Returns Git status and changes for a project directory.
 */
export function getGitStatus(projectPath) {
  const resolved = path.resolve(projectPath);
  if (!fs.existsSync(path.join(resolved, '.git'))) {
    return { isGitRepo: false, isClean: true, branch: null, changedFiles: [], diffSummary: '' };
  }

  try {
    const branch = execSync('git branch --show-current', { cwd: resolved, encoding: 'utf-8', timeout: 2000 }).trim();
    const porcelain = execSync('git status --porcelain', { cwd: resolved, encoding: 'utf-8', timeout: 2000 }).trim();
    const diffStat = execSync('git diff --stat', { cwd: resolved, encoding: 'utf-8', timeout: 2000 }).trim();

    const changedFiles = [];
    if (porcelain) {
      const lines = porcelain.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        const status = line.slice(0, 2).trim();
        const file = line.slice(3).trim();
        changedFiles.push({ file, status });
      }
    }

    return {
      isGitRepo: true,
      branch: branch || 'HEAD',
      isClean: changedFiles.length === 0,
      changedFiles,
      diffSummary: diffStat
    };
  } catch (err) {
    return { isGitRepo: true, isClean: true, branch: 'unknown', changedFiles: [], error: err.message };
  }
}

/**
 * Adds an existing folder as a registered project in SQLite and projects.json.
 */
export function addFolderAsProject({ folderPath, name, description, category = 'apps' }) {
  const resolved = path.resolve(folderPath);
  if (!isSafePath(resolved) || !fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error('Указанная папка не существует или недоступна');
  }

  const id = path.basename(resolved).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  const projName = name || path.basename(resolved);
  const projDesc = description || `Проект в ${resolved}`;

  // 1. Update SQLite
  dbRepo.upsertProject(id, projName, resolved);

  // 2. Update projects.json
  const existingList = loadConfiguredProjects();
  const existingIdx = existingList.findIndex((p) => p.id === id || path.resolve(p.path) === resolved);

  const newEntry = {
    id,
    name: projName,
    path: resolved,
    description: projDesc,
    category
  };

  if (existingIdx >= 0) {
    existingList[existingIdx] = newEntry;
  } else {
    existingList.push(newEntry);
  }

  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(existingList, null, 2), 'utf-8');

  return newEntry;
}
