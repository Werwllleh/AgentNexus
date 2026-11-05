import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowUp,
  Square,
  Sparkles,
  SlidersHorizontal,
  Compass,
  FileSearch,
  Play,
  GitBranch
} from 'lucide-react';

interface PromptInputProps {
  onSend: (prompt: string, mode: string, effort: string) => void;
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
  const [showOptions, setShowOptions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    onSend(prompt.trim(), mode, effort);
    setPrompt('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleChipClick = (text: string) => {
    setPrompt((prev) => (prev ? `${prev}\n${text}` : text));
    textareaRef.current?.focus();
  };

  return (
    <div className="border-t border-zinc-800 bg-zinc-950/90 backdrop-blur-md p-4">
      {/* Quick shortcut chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2.5 mb-1 no-scrollbar text-xs">
        <button
          onClick={() => handleChipClick('/plan ')}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition shrink-0"
        >
          <Compass className="w-3 h-3 text-indigo-400" />
          <span>/plan</span>
        </button>
        <button
          onClick={() => handleChipClick('Проверь git status и покажи текущие изменения')}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition shrink-0"
        >
          <GitBranch className="w-3 h-3 text-emerald-400" />
          <span>Git status</span>
        </button>
        <button
          onClick={() => handleChipClick('Запусти тесты проекта и исправь ошибки, если они есть')}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition shrink-0"
        >
          <Play className="w-3 h-3 text-amber-400" />
          <span>Запусти тесты</span>
        </button>
        <button
          onClick={() => handleChipClick('Изучи архитектуру проекта и опиши ключевые модули')}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition shrink-0"
        >
          <FileSearch className="w-3 h-3 text-sky-400" />
          <span>Объясни архитектуру</span>
        </button>
      </div>

      {/* Main input card */}
      <div className="relative border border-zinc-800 bg-zinc-900/60 rounded-xl shadow-inner focus-within:border-indigo-500/60 transition-colors">
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isRunning
              ? 'Gemini выполняет задачу в фоне... (можно закрыть вкладку)'
              : 'Задайте промпт для Gemini... (Enter для отправки, Shift+Enter перенос строки)'
          }
          rows={1}
          disabled={disabled || isRunning}
          className="w-full bg-transparent text-zinc-100 text-sm px-4 pt-3 pb-12 focus:outline-none resize-none placeholder:text-zinc-500 leading-relaxed font-sans"
        />

        {/* Bottom controls inside the textarea box */}
        <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between pointer-events-none">
          {/* Options toggle & chips */}
          <div className="flex items-center gap-2 pointer-events-auto">
            <button
              type="button"
              onClick={() => setShowOptions(!showOptions)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-zinc-800/80 hover:bg-zinc-700/80 text-[11px] text-zinc-400 hover:text-zinc-200 border border-zinc-700/50 transition"
              title="Параметры выполнения"
            >
              <SlidersHorizontal className="w-3 h-3 text-indigo-400" />
              <span>
                {mode} • {effort}
              </span>
            </button>

            {showOptions && (
              <div className="flex items-center gap-2 text-xs bg-zinc-900 border border-zinc-700 p-1 rounded-lg shadow-xl">
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                  className="bg-zinc-800 text-zinc-200 text-[11px] rounded px-2 py-0.5 border border-zinc-700 focus:outline-none"
                >
                  <option value="auto">Режим: Auto</option>
                  <option value="accept-edits">Режим: Accept Edits</option>
                  <option value="plan">Режим: Plan Only</option>
                </select>

                <select
                  value={effort}
                  onChange={(e) => setEffort(e.target.value)}
                  className="bg-zinc-800 text-zinc-200 text-[11px] rounded px-2 py-0.5 border border-zinc-700 focus:outline-none"
                >
                  <option value="low">Reasoning: Low</option>
                  <option value="medium">Reasoning: Medium</option>
                  <option value="high">Reasoning: High</option>
                  <option value="xhigh">Reasoning: Extra High</option>
                </select>
              </div>
            )}
          </div>

          {/* Action button: Send or Stop */}
          <div className="pointer-events-auto">
            {isRunning ? (
              <button
                type="button"
                onClick={onStop}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium shadow-md shadow-rose-600/30 transition animate-pulse"
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
                className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white shadow-md shadow-indigo-600/20 transition cursor-pointer disabled:cursor-not-allowed"
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
