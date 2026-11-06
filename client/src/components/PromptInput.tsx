import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowUp,
  Square,
  SlidersHorizontal,
  Compass,
  FileSearch,
  Play,
  GitBranch,
  Bot,
  Sparkles,
  Cpu,
  CheckCircle2
} from 'lucide-react';
import { AIEngine } from '../types.ts';
import { fetchEngines } from '../services/api.ts';

interface PromptInputProps {
  onSend: (prompt: string, mode: string, effort: string, engine?: string, model?: string) => void;
  onStop: () => void;
  isRunning: boolean;
  disabled?: boolean;
}

export const PromptInput: React.FC<PromptInputProps> = ({
  onSend,
  onStop,
  isRunning,
  disabled
}) => {
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState('auto');
  const [effort, setEffort] = useState('high');
  const [engine, setEngine] = useState<string>(() => localStorage.getItem('nexus_engine') || 'gemini');
  const [model, setModel] = useState<string>(() => localStorage.getItem('nexus_model') || 'auto');
  const [availableEngines, setAvailableEngines] = useState<AIEngine[]>([]);
  const [showOptions, setShowOptions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch AI engines on mount
  useEffect(() => {
    fetchEngines()
      .then((engines) => {
        setAvailableEngines(engines);
      })
      .catch(() => {
        // Fallback default list
        setAvailableEngines([
          {
            id: 'gemini',
            name: 'Gemini Antigravity',
            provider: 'google',
            isAvailable: true,
            models: [
              { id: 'auto', name: 'Gemini Auto (Flash / Pro)', default: true },
              { id: 'pro', name: 'Gemini 2.5 Pro' },
              { id: 'flash', name: 'Gemini 2.5 Flash' }
            ]
          },
          {
            id: 'claude',
            name: 'Claude Code',
            provider: 'anthropic',
            isAvailable: true,
            models: [
              { id: 'sonnet', name: 'Claude 3.7 Sonnet', default: true },
              { id: 'opus', name: 'Claude 3 Opus' },
              { id: 'haiku', name: 'Claude 3.5 Haiku' }
            ]
          },
          {
            id: 'openai',
            name: 'OpenAI / Codex',
            provider: 'openai',
            isAvailable: true,
            models: [
              { id: 'gpt-4o', name: 'GPT-4o', default: true },
              { id: 'o3-mini', name: 'o3-mini' }
            ]
          }
        ]);
      });
  }, []);

  // Save selected engine and model to localStorage
  useEffect(() => {
    localStorage.setItem('nexus_engine', engine);
    localStorage.setItem('nexus_model', model);
  }, [engine, model]);

  // When engine changes, set default model for that engine
  const handleEngineChange = (newEngineId: string) => {
    setEngine(newEngineId);
    const eng = availableEngines.find((e) => e.id === newEngineId);
    if (eng && eng.models.length > 0) {
      const def = eng.models.find((m) => m.default) || eng.models[0];
      setModel(def.id);
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [prompt]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    if (!prompt.trim() || isRunning || disabled) return;
    onSend(prompt.trim(), mode, effort, engine, model);
    setPrompt('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleChipClick = (text: string) => {
    setPrompt((prev) => (prev ? `${prev}\n${text}` : text));
    textareaRef.current?.focus();
  };

  const currentEngineObj = availableEngines.find((e) => e.id === engine) || availableEngines[0];

  const getEngineIcon = (engId: string) => {
    switch (engId) {
      case 'claude':
        return <Bot className="w-3.5 h-3.5 text-amber-500" />;
      case 'openai':
        return <Cpu className="w-3.5 h-3.5 text-emerald-500" />;
      default:
        return <Sparkles className="w-3.5 h-3.5 text-indigo-500" />;
    }
  };

  return (
    <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md p-3 sm:p-4 pb-safe transition-colors">
      {/* Quick shortcut chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2.5 mb-1 no-scrollbar text-xs">
        <button
          onClick={() => handleChipClick('/plan ')}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 transition shrink-0 cursor-pointer"
        >
          <Compass className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
          <span>/plan</span>
        </button>
        <button
          onClick={() => handleChipClick('Проверь git status и покажи текущие изменения')}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 transition shrink-0 cursor-pointer"
        >
          <GitBranch className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
          <span>Git status</span>
        </button>
        <button
          onClick={() => handleChipClick('Запусти тесты проекта и исправь ошибки, если они есть')}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 transition shrink-0 cursor-pointer"
        >
          <Play className="w-3 h-3 text-amber-600 dark:text-amber-400" />
          <span>Запусти тесты</span>
        </button>
        <button
          onClick={() => handleChipClick('Сделай code review последних изменений и найди потенциальные проблемы')}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 transition shrink-0 cursor-pointer"
        >
          <CheckCircle2 className="w-3 h-3 text-purple-600 dark:text-purple-400" />
          <span>Ревью кода</span>
        </button>
        <button
          onClick={() => handleChipClick('Изучи архитектуру проекта и опиши ключевые модули')}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 transition shrink-0 cursor-pointer"
        >
          <FileSearch className="w-3 h-3 text-sky-600 dark:text-sky-400" />
          <span>Объясни архитектуру</span>
        </button>
      </div>

      {/* Main input card */}
      <div className="relative border border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/60 rounded-xl shadow-xs focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/20 transition-all">
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isRunning
              ? 'Агент выполняет задачу в фоне... (можно закрыть вкладку)'
              : `Задайте промпт для ${currentEngineObj?.name || 'агента'}... (Enter для отправки)`
          }
          rows={1}
          disabled={disabled || isRunning}
          className="w-full bg-transparent text-zinc-900 dark:text-zinc-100 text-sm px-3.5 sm:px-4 pt-3 pb-12 focus:outline-hidden resize-none placeholder:text-zinc-400 dark:placeholder:text-zinc-500 leading-relaxed font-sans"
        />

        {/* Bottom controls inside the textarea box */}
        <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between pointer-events-none">
          {/* Options toggle & engine/model selector */}
          <div className="relative flex items-center gap-2 pointer-events-auto">
            {/* Engine Picker Button */}
            <button
              type="button"
              data-testid="engine-selector-btn"
              onClick={() => setShowOptions(!showOptions)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-200/90 dark:bg-zinc-800/90 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-[11px] text-zinc-800 dark:text-zinc-200 border border-zinc-300/70 dark:border-zinc-700/60 transition cursor-pointer font-medium"
              title="Выбор AI-движка и параметров"
            >
              {getEngineIcon(engine)}
              <span className="capitalize">{engine}</span>
              <span className="text-zinc-400 dark:text-zinc-500 font-mono text-[10px]">
                ({model})
              </span>
              <SlidersHorizontal className="w-2.5 h-2.5 text-zinc-400 ml-0.5" />
            </button>

            {/* Dropdown settings popup */}
            {showOptions && (
              <div
                data-testid="engine-options-popup"
                className="absolute bottom-9 left-0 z-30 flex flex-col gap-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-3 rounded-2xl shadow-xl backdrop-blur min-w-[260px] animate-in fade-in duration-150"
              >
                <div>
                  <label className="block text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                    AI-Движок
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    {availableEngines.map((eng) => (
                      <button
                        key={eng.id}
                        type="button"
                        onClick={() => handleEngineChange(eng.id)}
                        className={`px-2 py-1.5 rounded-lg border text-xs font-medium flex items-center justify-center gap-1 transition cursor-pointer ${
                          engine === eng.id
                            ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-500 text-indigo-700 dark:text-indigo-300'
                            : 'bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700/60 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        }`}
                      >
                        {getEngineIcon(eng.id)}
                        <span className="capitalize">{eng.id}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Model Selector */}
                {currentEngineObj && currentEngineObj.models.length > 0 && (
                  <div>
                    <label className="block text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                      Модель
                    </label>
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="w-full bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-200 text-xs rounded-lg px-2.5 py-1.5 border border-zinc-200 dark:border-zinc-700 focus:outline-hidden"
                    >
                      {currentEngineObj.models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} {m.badge ? `(${m.badge})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Mode and Effort */}
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-zinc-100 dark:border-zinc-800">
                  <div>
                    <label className="block text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                      Режим
                    </label>
                    <select
                      value={mode}
                      onChange={(e) => setMode(e.target.value)}
                      className="w-full bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-200 text-[11px] rounded px-2 py-1 border border-zinc-200 dark:border-zinc-700 focus:outline-hidden"
                    >
                      <option value="auto">Auto</option>
                      <option value="accept-edits">Accept Edits</option>
                      <option value="plan">Plan Only</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                      Reasoning
                    </label>
                    <select
                      value={effort}
                      onChange={(e) => setEffort(e.target.value)}
                      className="w-full bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-200 text-[11px] rounded px-2 py-1 border border-zinc-200 dark:border-zinc-700 focus:outline-hidden"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="xhigh">Extra High</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action button: Send or Stop */}
          <div className="pointer-events-auto">
            {isRunning ? (
              <button
                type="button"
                onClick={onStop}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium shadow-md shadow-rose-600/30 transition animate-pulse cursor-pointer"
                title="Остановить выполнение"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Стоп</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!prompt.trim() || disabled}
                className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-200 dark:disabled:bg-zinc-800 disabled:text-zinc-400 dark:disabled:text-zinc-600 text-white shadow-md shadow-indigo-600/20 transition cursor-pointer disabled:cursor-not-allowed"
                title="Отправить (Enter)"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
