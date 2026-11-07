import fs from 'node:fs';
import { spawn, execFile, execFileSync } from 'node:child_process';
import { BaseEngine } from './baseEngine.js';

export class GeminiEngine extends BaseEngine {
  constructor() {
    super('gemini', 'Gemini Antigravity', 'google');
    this.binPath = process.env.AGY_BIN_PATH || '/home/alex/.local/bin/agy';
    this.cachedModels = null;
    this.lastFetchTime = 0;
    this.cacheTtlMs = 10 * 60 * 1000; // 10 минут кеша
    this.isFetching = false;

    // Фоновая инициализация кеша при запуске
    if (this.isAvailable()) {
      this.refreshModels().catch((err) => {
        console.warn('[GeminiEngine] Не удалось предварительно загрузить модели:', err.message);
      });
    }
  }

  isAvailable() {
    return fs.existsSync(this.binPath);
  }

  getFallbackModels() {
    return [
      { id: 'auto', name: 'Gemini Auto (Flash)', badge: 'Рекомендуется', default: true },
      { id: 'gemini-3.8-flash-high', name: 'Gemini 3.8 Flash (High)', badge: 'Глубокий анализ' },
      { id: 'gemini-3.8-flash-medium', name: 'Gemini 3.8 Flash (Medium)', badge: 'Баланс' },
      { id: 'gemini-3.8-flash-low', name: 'Gemini 3.8 Flash (Low)', badge: 'Быстрый' }
    ];
  }

  parseModelsOutput(stdout) {
    if (!stdout || typeof stdout !== 'string') return [];
    const lines = stdout.split('\n');
    const list = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      const match = line.match(/^(\S+)\s+(.+)$/);
      if (!match) continue;

      const id = match[1].trim();
      const name = match[2].trim();

      let badge;
      const lowerId = id.toLowerCase();
      if (lowerId.includes('high') || lowerId.includes('opus')) {
        badge = 'Глубокий анализ';
      } else if (lowerId.includes('medium')) {
        badge = 'Баланс';
      } else if (lowerId.includes('low') || lowerId.includes('flash')) {
        badge = 'Быстрый';
      } else if (lowerId.startsWith('claude')) {
        badge = 'Anthropic';
      } else if (lowerId.startsWith('gpt')) {
        badge = 'Open-Source';
      }

      list.push({ id, name, ...(badge ? { badge } : {}) });
    }

    return list;
  }

  async refreshModels() {
    if (!this.isAvailable()) {
      this.cachedModels = this.getFallbackModels();
      this.lastFetchTime = Date.now();
      return this.cachedModels;
    }

    return new Promise((resolve) => {
      execFile(this.binPath, ['models'], { timeout: 8000, maxBuffer: 1024 * 1024 }, (err, stdout) => {
        if (err) {
          console.warn(`[GeminiEngine] Ошибка при вызове ${this.binPath} models:`, err.message);
          if (!this.cachedModels) {
            this.cachedModels = this.getFallbackModels();
          }
          resolve(this.cachedModels);
          return;
        }

        const parsed = this.parseModelsOutput(stdout);
        if (parsed.length > 0) {
          this.cachedModels = [
            { id: 'auto', name: 'Gemini Auto (Flash)', badge: 'Рекомендуется', default: true },
            ...parsed
          ];
          this.lastFetchTime = Date.now();
          console.log(`[GeminiEngine] Успешно загружено моделей из agy: ${parsed.length}`);
        } else if (!this.cachedModels) {
          this.cachedModels = this.getFallbackModels();
        }
        resolve(this.cachedModels);
      });
    });
  }

  getModels() {
    const now = Date.now();
    const isExpired = !this.lastFetchTime || (now - this.lastFetchTime > this.cacheTtlMs);

    // Если данные есть и кеш свежий
    if (this.cachedModels && !isExpired) {
      return this.cachedModels;
    }

    // Если данные есть, но устарели — возвращаем текущие и запускаем обновление в фоне
    if (this.cachedModels && isExpired) {
      if (!this.isFetching) {
        this.isFetching = true;
        this.refreshModels().finally(() => {
          this.isFetching = false;
        });
      }
      return this.cachedModels;
    }

    // Первоначальный запрос при холодном старте
    if (this.isAvailable()) {
      try {
        const stdout = execFileSync(this.binPath, ['models'], {
          encoding: 'utf-8',
          timeout: 6000,
          stdio: ['ignore', 'pipe', 'ignore']
        });
        const parsed = this.parseModelsOutput(stdout);
        if (parsed.length > 0) {
          this.cachedModels = [
            { id: 'auto', name: 'Gemini Auto (Flash)', badge: 'Рекомендуется', default: true },
            ...parsed
          ];
          this.lastFetchTime = Date.now();
          return this.cachedModels;
        }
      } catch (err) {
        console.warn('[GeminiEngine] Синхронный вызов agy models не удался, используется fallback:', err.message);
      }
    }

    this.cachedModels = this.getFallbackModels();
    this.lastFetchTime = Date.now();
    return this.cachedModels;
  }

  spawnProcess({ projectPath, prompt, mode = 'auto', effort = 'high', resumeId = null, model = 'auto' }) {
    const args = [
      '--output-format', 'stream-json',
      '--dangerously-skip-permissions',
    ];

    if (resumeId) {
      args.push('--conversation', resumeId);
    }

    if (model && model !== 'auto') {
      args.push('--model', model);
    }

    if (mode && mode !== 'auto' && mode !== 'default') {
      args.push('--mode', mode);
    }

    if (effort) {
      args.push('--effort', effort);
    }

    args.push('-p', prompt);

    console.log(`[GeminiEngine] Spawning ${this.binPath} with args:`, args.join(' '));

    return spawn(this.binPath, args, {
      cwd: projectPath,
      env: { ...process.env, TERM: 'xterm-256color' },
      detached: true
    });
  }

  /**
   * Normalizes agy stream-json events.
   */
  normalizeEvent(raw) {
    if (!raw) return null;
    const event = typeof raw === 'string' ? JSON.parse(raw) : raw;

    // 1. Init event
    if (event.event === 'init') {
      return {
        type: 'init',
        conversationId: event.conversation_id,
        tools: event.init?.tools || []
      };
    }

    // 2. Step update
    if (event.event === 'step_update' && event.step_update) {
      const su = event.step_update;

      if (su.step_type === 'agent_response') {
        if (su.text_delta) {
          return {
            type: 'text_delta',
            delta: su.text_delta
          };
        }
        if (su.state === 'ACTIVE') {
          return { type: 'agent_thinking' };
        }
      }

      if (su.step_type === 'tool') {
        return {
          type: 'tool_update',
          stepIndex: su.step_index,
          toolName: su.tool_name,
          toolParams: su.tool_info?.parameters || null,
          toolOutput: su.tool_info?.output || null,
          status: su.state === 'DONE' ? 'done' : 'active',
          durationSeconds: su.duration_seconds || null
        };
      }
    }

    // 3. Result event
    if (event.event === 'result') {
      return {
        type: 'result',
        finalText: event.result?.response || ''
      };
    }

    return null;
  }
}
