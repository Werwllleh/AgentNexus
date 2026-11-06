import { EventEmitter } from 'node:events';
import { BaseEngine } from './baseEngine.js';

export class OpenAIEngine extends BaseEngine {
  constructor() {
    super('openai', 'OpenAI / Codex', 'openai');
  }

  isAvailable() {
    return !!process.env.OPENAI_API_KEY;
  }

  getModels() {
    return [
      { id: 'gpt-4o', name: 'GPT-4o (Omni)', badge: 'Рекомендуется', default: true },
      { id: 'o3-mini', name: 'o3-mini (Reasoning)', badge: 'Глубокие вычисления' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', badge: 'Быстрый' }
    ];
  }

  /**
   * Spawns or initiates a streaming turn for OpenAI API.
   * Returns a mockable child process interface with stdout and event emitter.
   */
  spawnProcess({ projectPath, prompt, model = 'gpt-4o' }) {
    const apiKey = process.env.OPENAI_API_KEY;
    const abortController = new AbortController();
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {
      abortController.abort();
      child.emit('close', 0);
    };

    if (!apiKey) {
      setTimeout(() => {
        child.stderr.emit(
          'data',
          Buffer.from('OPENAI_API_KEY не задан в .env файле. Укажите ключ в настройках сервера.\n')
        );
        child.emit('close', 1);
      }, 50);
      return child;
    }

    // Native fetch stream from OpenAI API
    (async () => {
      try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          signal: abortController.signal,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model || 'gpt-4o',
            messages: [
              {
                role: 'system',
                content: `You are an expert software engineer assistant working inside project directory ${projectPath}.`
              },
              { role: 'user', content: prompt }
            ],
            stream: true
          })
        });

        if (!res.ok) {
          const errText = await res.text();
          child.stderr.emit('data', Buffer.from(`OpenAI API error: ${errText}\n`));
          child.emit('close', 1);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const dataStr = trimmed.slice(6);
            if (dataStr === '[DONE]') continue;

            try {
              const parsed = JSON.parse(dataStr);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                const eventPayload = JSON.stringify({
                  event: 'step_update',
                  step_update: {
                    step_type: 'agent_response',
                    text_delta: delta
                  }
                }) + '\n';
                child.stdout.emit('data', Buffer.from(eventPayload));
              }
            } catch { /* ignore parse error */ }
          }
        }

        child.emit('close', 0);
      } catch (err) {
        if (err.name === 'AbortError') {
          // Process was killed intentionally
          return;
        }
        child.stderr.emit('data', Buffer.from(`OpenAI connection error: ${err.message}\n`));
        child.emit('close', 1);
      }
    })();

    return child;
  }

  normalizeEvent(raw) {
    if (!raw) return null;
    const event = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (event.event === 'step_update' && event.step_update?.text_delta) {
      return {
        type: 'text_delta',
        delta: event.step_update.text_delta
      };
    }
    return null;
  }
}
