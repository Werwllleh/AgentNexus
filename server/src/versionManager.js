import fs from 'node:fs';
import path from 'node:path';
import { exec, execSync } from 'node:child_process';
import util from 'node:util';
import { fileURLToPath } from 'node:url';

const execAsync = util.promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const DATA_DIR = path.resolve(__dirname, '../data');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

class VersionManager {
  constructor() {
    this.cachedUpdateInfo = null;
    this.lastCheckedTime = 0;
    this.cacheTtlMs = 5 * 60 * 1000; // 5 minutes cache
    this.isUpdating = false;
    this.updateLogs = [];
  }

  /**
   * Reads package.json version
   */
  getPackageVersion() {
    try {
      const pkgPath = path.join(ROOT_DIR, 'package.json');
      const content = fs.readFileSync(pkgPath, 'utf-8');
      const parsed = JSON.parse(content);
      return parsed.version || '2.0.0';
    } catch {
      return '2.0.0';
    }
  }

  /**
   * Retrieves local git and version metadata
   */
  getLocalInfo() {
    const version = this.getPackageVersion();
    let commitShort = 'unknown';
    let commitFull = '';
    let commitDate = '';
    let commitMessage = '';
    let branch = 'master';

    try {
      commitShort = execSync('git rev-parse --short HEAD', { cwd: ROOT_DIR, encoding: 'utf-8' }).trim();
      commitFull = execSync('git rev-parse HEAD', { cwd: ROOT_DIR, encoding: 'utf-8' }).trim();
      commitDate = execSync('git log -1 --format=%ci', { cwd: ROOT_DIR, encoding: 'utf-8' }).trim();
      commitMessage = execSync('git log -1 --format=%s', { cwd: ROOT_DIR, encoding: 'utf-8' }).trim();
      branch = execSync('git branch --show-current', { cwd: ROOT_DIR, encoding: 'utf-8' }).trim() || 'master';
    } catch (err) {
      console.warn('[VersionManager] Could not read local git info:', err.message);
    }

    return {
      version,
      commitShort,
      commitFull,
      commitDate,
      commitMessage,
      branch
    };
  }

  /**
   * Checks for remote updates via GitHub API & git ls-remote
   */
  async checkForUpdates(force = false) {
    const now = Date.now();
    if (!force && this.cachedUpdateInfo && (now - this.lastCheckedTime < this.cacheTtlMs)) {
      return this.cachedUpdateInfo;
    }

    const local = this.getLocalInfo();
    let remoteCommit = local.commitFull;
    let remoteCommitShort = local.commitShort;
    let hasUpdate = false;
    let commitsBehind = 0;
    let latestRelease = null;
    let checkSource = 'git-remote';

    // 1. Try checking remote Git ref via git ls-remote
    try {
      const lsRemote = execSync(`git ls-remote origin refs/heads/${local.branch}`, {
        cwd: ROOT_DIR,
        encoding: 'utf-8',
        timeout: 5000
      }).trim();

      if (lsRemote) {
        const parts = lsRemote.split(/\s+/);
        if (parts[0] && parts[0].length >= 7) {
          remoteCommit = parts[0];
          remoteCommitShort = parts[0].slice(0, 7);
          hasUpdate = remoteCommit !== local.commitFull;
        }
      }
    } catch (err) {
      console.warn('[VersionManager] git ls-remote failed:', err.message);
    }

    // 2. Query GitHub Releases API for tagged releases
    try {
      const res = await fetch('https://api.github.com/repos/Werwllleh/AgentNexus/releases/latest', {
        headers: {
          'User-Agent': 'AgentNexus-UpdateManager',
          Accept: 'application/vnd.github.v3+json'
        },
        signal: AbortSignal.timeout(4000)
      });

      if (res.ok) {
        const relData = await res.json();
        latestRelease = {
          tagName: relData.tag_name,
          name: relData.name || relData.tag_name,
          body: relData.body || '',
          publishedAt: relData.published_at,
          htmlUrl: relData.html_url
        };
        checkSource = 'github-releases';
      }
    } catch {
      // Fallback silently if offline or rate limited
    }

    const info = {
      currentVersion: local.version,
      currentCommit: local.commitShort,
      currentCommitFull: local.commitFull,
      branch: local.branch,
      commitDate: local.commitDate,
      commitMessage: local.commitMessage,
      remoteCommit: remoteCommitShort,
      remoteCommitFull: remoteCommit,
      hasUpdate,
      commitsBehind,
      latestRelease,
      checkSource,
      isUpdating: this.isUpdating,
      lastChecked: new Date().toISOString()
    };

    this.cachedUpdateInfo = info;
    this.lastCheckedTime = now;
    return info;
  }

  /**
   * Creates a backup of SQLite data and configuration files
   */
  createBackup() {
    if (!fs.existsSync(BACKUPS_DIR)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFolder = path.join(BACKUPS_DIR, `backup-${timestamp}`);
    fs.mkdirSync(backupFolder, { recursive: true });

    const filesToBackup = fs.readdirSync(DATA_DIR);
    const backedUpFiles = [];

    for (const file of filesToBackup) {
      if (file === 'backups') continue;
      const src = path.join(DATA_DIR, file);
      const dest = path.join(backupFolder, file);
      try {
        const stat = fs.statSync(src);
        if (stat.isFile()) {
          fs.copyFileSync(src, dest);
          backedUpFiles.push({ file, size: stat.size });
        }
      } catch (err) {
        console.warn(`[VersionManager] Backup file copy error for ${file}:`, err.message);
      }
    }

    return {
      backupFolder,
      timestamp,
      backedUpFiles
    };
  }

  /**
   * Performs the full one-click update process
   */
  async performUpdate({ branch = 'master' } = {}) {
    if (this.isUpdating) {
      throw new Error('Процесс обновления уже запущен.');
    }

    this.isUpdating = true;
    this.updateLogs = [];

    const log = (step, message, status = 'in_progress') => {
      const entry = {
        timestamp: new Date().toISOString(),
        step,
        message,
        status
      };
      this.updateLogs.push(entry);
      console.log(`[UpdateManager] [${step}] ${message}`);
    };

    try {
      // Step 1: Create Backup
      log('backup', 'Создание резервной копии базы данных и конфигурации...', 'in_progress');
      const backupResult = this.createBackup();
      log('backup', `Резервная копия создана: ${path.basename(backupResult.backupFolder)} (${backupResult.backedUpFiles.length} файлов)`, 'done');

      // Step 2: Git Fetch & Reset
      log('git_pull', `Получение обновлений из ветки origin/${branch}...`, 'in_progress');
      await execAsync(`git fetch origin ${branch}`, { cwd: ROOT_DIR });
      await execAsync(`git reset --hard origin/${branch}`, { cwd: ROOT_DIR });
      const newCommit = execSync('git rev-parse --short HEAD', { cwd: ROOT_DIR, encoding: 'utf-8' }).trim();
      log('git_pull', `Код обновлен до коммита ${newCommit}`, 'done');

      // Step 3: Install dependencies & build client
      log('build', 'Установка зависимостей и компиляция фронтенда...', 'in_progress');
      await execAsync('npm install --omit=dev', { cwd: ROOT_DIR });
      await execAsync('npm run build', { cwd: ROOT_DIR });
      log('build', 'Сборка клиентского приложения успешно завершена', 'done');

      // Step 4: Schedule PM2 restart
      log('restart', 'Перезапуск сервиса через PM2...', 'in_progress');
      setTimeout(() => {
        exec('pm2 restart gemini-hub', (err) => {
          if (err) {
            console.error('[UpdateManager] PM2 restart error:', err);
          } else {
            console.log('[UpdateManager] PM2 restarted successfully');
          }
        });
      }, 1200);

      log('restart', 'Команда перезапуска отправлена. Сервис перезагружается...', 'done');
      this.cachedUpdateInfo = null; // Clear cache

      return {
        success: true,
        message: 'Обновление успешно выполнено. Сервис перезапускается.',
        logs: this.updateLogs,
        backupFolder: backupResult.backupFolder
      };
    } catch (err) {
      log('error', `Ошибка во время обновления: ${err.message}`, 'failed');
      throw err;
    } finally {
      setTimeout(() => {
        this.isUpdating = false;
      }, 5000);
    }
  }

  getUpdateStatus() {
    return {
      isUpdating: this.isUpdating,
      logs: this.updateLogs
    };
  }
}

export const versionManager = new VersionManager();
