import { GeminiEngine } from './geminiEngine.js';
import { ClaudeEngine } from './claudeEngine.js';
import { OpenAIEngine } from './openaiEngine.js';

class EngineRegistry {
  constructor() {
    this.engines = new Map();
    this.register(new GeminiEngine());
    this.register(new ClaudeEngine());
    this.register(new OpenAIEngine());
  }

  register(engine) {
    this.engines.set(engine.id, engine);
  }

  get(id = 'gemini') {
    return this.engines.get(id) || this.engines.get('gemini');
  }

  getAll() {
    return Array.from(this.engines.values()).map((e) => ({
      id: e.id,
      name: e.name,
      provider: e.provider,
      isAvailable: e.isAvailable(),
      models: e.getModels()
    }));
  }
}

export const engineRegistry = new EngineRegistry();
