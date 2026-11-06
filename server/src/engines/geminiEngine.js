import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { BaseEngine } from './baseEngine.js';

export class GeminiEngine extends BaseEngine {
  constructor() {
    super('gemini', 'Gemini Antigravity', 'google');
    this.binPath = process.env.AGY_BIN_PATH || '/home/alex/.local/bin/agy';
  }

  isAvailable() {
    return fs.existsSync(this.binPath);
  }

  getModels() {
    return [
      { id: 'auto', name: 'Gemini Auto (Flash / Pro)', badge: 'Рекомендуется', default: true },
      { id: 'pro', name: 'Gemini 2.5 Pro', badge: 'Глубокий анализ' },
      { id: 'flash', name: 'Gemini 2.5 Flash', badge: 'Быстрый' },
      { id: 'flash-lite', name: 'Gemini Flash Lite', badge: 'Экономный' }
    ];
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
