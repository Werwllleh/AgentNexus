import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { BaseEngine } from './baseEngine.js';

export class ClaudeEngine extends BaseEngine {
  constructor() {
    super('claude', 'Claude Code', 'anthropic');
    this.binPath = process.env.CLAUDE_BIN_PATH || '/home/alex/.local/bin/claude';
  }

  isAvailable() {
    return fs.existsSync(this.binPath);
  }

  getModels() {
    return [
      { id: 'sonnet', name: 'Claude 3.7 Sonnet', badge: 'Рекомендуется', default: true },
      { id: 'opus', name: 'Claude 3 Opus', badge: 'Комплексный анализ' },
      { id: 'haiku', name: 'Claude 3.5 Haiku', badge: 'Быстрый' }
    ];
  }

  spawnProcess({ projectPath, prompt, resumeId = null, model = 'sonnet' }) {
    const args = [
      '-p', prompt,
      '--output-format=stream-json',
      '--verbose',
      '--include-partial-messages',
      '--dangerously-skip-permissions'
    ];

    if (resumeId) {
      args.push('--resume', resumeId);
    }

    if (model) {
      args.push('--model', model);
    }

    console.log(`[ClaudeEngine] Spawning ${this.binPath} with args:`, args.join(' '));

    return spawn(this.binPath, args, {
      cwd: projectPath,
      env: { ...process.env, TERM: 'xterm-256color' },
      detached: true
    });
  }

  /**
   * Normalizes Claude Code stream-json events.
   */
  normalizeEvent(raw) {
    if (!raw) return null;
    const event = typeof raw === 'string' ? JSON.parse(raw) : raw;

    // 1. Session ID init / system info
    if (event.session_id && (event.type === 'system' || !event.type)) {
      return {
        type: 'init',
        conversationId: event.session_id,
        tools: event.tools || []
      };
    }

    // 2. Assistant message / text delta / tool calls
    if (event.type === 'assistant' && event.message) {
      const contents = event.message.content || [];
      const textParts = [];
      const toolCalls = [];

      for (const item of contents) {
        if (item.type === 'text' && item.text) {
          textParts.push(item.text);
        } else if (item.type === 'tool_use') {
          toolCalls.push({
            toolName: item.name,
            toolParams: item.input,
            toolId: item.id
          });
        }
      }

      if (event.is_api_error_message || event.error) {
        return {
          type: 'error',
          error: textParts.join('\n') || event.error || 'Claude API Error'
        };
      }

      if (textParts.length > 0) {
        return {
          type: 'text_delta',
          delta: textParts.join(''),
          fullText: textParts.join('')
        };
      }

      if (toolCalls.length > 0) {
        const first = toolCalls[0];
        return {
          type: 'tool_update',
          stepIndex: 1,
          toolName: first.toolName,
          toolParams: first.toolParams,
          status: 'active'
        };
      }
    }

    // 3. Tool results
    if (event.type === 'tool_result' || event.type === 'tool_response') {
      return {
        type: 'tool_update',
        stepIndex: 1,
        toolName: event.tool_name || 'tool',
        toolOutput: event.output || event.stdout || '',
        status: 'done'
      };
    }

    // 4. Result event
    if (event.type === 'result') {
      if (event.is_error) {
        return {
          type: 'error',
          error: event.result || 'Claude execution finished with error'
        };
      }
      return {
        type: 'result',
        finalText: typeof event.result === 'string' ? event.result : JSON.stringify(event.result)
      };
    }

    return null;
  }
}
