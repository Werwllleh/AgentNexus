/**
 * Base abstract class for AgentNexus AI Execution Engines.
 */
export class BaseEngine {
  constructor(id, name, provider) {
    this.id = id;
    this.name = name;
    this.provider = provider;
  }

  /**
   * Returns whether this engine CLI or API is available on the system.
   * @returns {boolean}
   */
  isAvailable() {
    return true;
  }

  /**
   * Returns list of supported models.
   * @returns {Array<{id: string, name: string, badge?: string, default?: boolean}>}
   */
  getModels() {
    return [];
  }

  /**
   * Spawns or starts a turn execution for this engine.
   * @param {object} params
   * @returns {object} Process or stream controller
   */
  spawnProcess(params) {
    throw new Error('spawnProcess must be implemented by engine subclass');
  }

  /**
   * Normalizes incoming raw line/event from the engine into standard AgentNexus event.
   * @param {string|object} raw
   * @returns {object|null}
   */
  normalizeEvent(raw) {
    return null;
  }
}
