import React, { useRef, useEffect } from 'react';
import {
  FolderGit2,
  GitBranch,
  Terminal,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Loader2,
  Square,
  X,
  Menu
} from 'lucide-react';
import { Project, ConversationDetail, Message } from '../types.ts';
import { MessageCard } from './MessageCard.tsx';
import { PromptInput } from './PromptInput.tsx';

interface ChatAreaProps {
  project: Project | null;
  conversation: ConversationDetail | null;
  isRunning: boolean;
  onSendPrompt: (prompt: string, mode: string, effort: string) => void;
  onStop: () => void;
  activeAssistantMessageId?: string | null;
  securityError?: string | null;
  onDismissSecurityError?: () => void;
  onOpenMobile?: () => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  project,
  conversation,
  isRunning,
  onSendPrompt,
  onStop,
  activeAssistantMessageId,
  securityError,
  onDismissSecurityError,
  onOpenMobile
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  // Track if user is reading previous messages so we don't yank their view
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 140;
  };

  // Smooth jitter-free auto scroll to bottom only when user is near bottom
  useEffect(() => {
    if (!scrollRef.current || !isNearBottomRef.current) return;

    requestAnimationFrame(() => {
      if (scrollRef.current && isNearBottomRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }, [conversation?.messages, isRunning, securityError]);

  if (!project) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-6 text-center text-zinc-500 font-mono text-sm">
        <button
          onClick={onOpenMobile}
          className="md:hidden mb-4 px-4 py-2 rounded-xl bg-indigo-600 text-white font-sans text-xs flex items-center gap-2 shadow-md shadow-indigo-600/20"
        >
          <Menu className="w-4 h-4" />
          <span>Выбрать проект</span>
        </button>
        Выберите проект в меню, чтобы начать работу с Gemini.
      </div>
    );
  }

  const messages = conversation?.messages || [];

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-zinc-50/60 dark:bg-zinc-950 min-w-0 transition-colors duration-200 overflow-hidden relative">
      {/* Top Header - Fixed / Sticky */}
      <header className="h-14 border-b border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 backdrop-blur px-3 sm:px-6 flex items-center justify-between shrink-0 z-20 sticky top-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 mr-2 sm:mr-4">
          {/* Mobile hamburger menu toggle */}
          <button
            onClick={onOpenMobile}
            className="md:hidden p-1.5 -ml-1 rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition shrink-0 cursor-pointer"
            title="Открыть список проектов"
            aria-label="Открыть список проектов"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
            <FolderGit2 className="w-4 h-4" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate font-mono">
                {project.name}
              </h2>
              {project.gitBranch && (
                <span
                  title={`Ветка: ${project.gitBranch}`}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 font-mono shrink-0 max-w-[90px] sm:max-w-[140px]"
                >
                  <GitBranch className="w-2.5 h-2.5 text-zinc-400 dark:text-zinc-500 shrink-0" />
                  <span className="truncate">{project.gitBranch}</span>
                </span>
              )}
            </div>
            <p className="text-[10px] sm:text-[11px] text-zinc-500 dark:text-zinc-400 font-mono truncate hidden xs:block">
              {project.path}
            </p>
          </div>
        </div>

        {/* Status & Stop button */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {isRunning ? (
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-full text-xs bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/20 font-mono">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 dark:text-indigo-400" />
                <span className="hidden sm:inline">Выполняется в фоне</span>
                <span className="sm:hidden text-[11px]">В фоне</span>
              </div>
              <button
                onClick={onStop}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium transition shadow-sm cursor-pointer"
                title="Прервать выполнение"
              >
                <Square className="w-3 h-3 fill-current" />
                <span className="hidden sm:inline">Прервать</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-full text-xs bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="hidden sm:inline">Ожидание задач</span>
              <span className="sm:hidden text-[11px]">Готов</span>
            </div>
          )}
        </div>
      </header>

      {/* Security & Resilience Banner */}
      <div className="px-3 sm:px-6 py-1 bg-zinc-100/60 dark:bg-zinc-900/40 border-b border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-500 dark:text-zinc-400 font-mono flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5 min-w-0 truncate">
          <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <span className="truncate">Сессия в фоне: вкладку браузера можно закрывать в любой момент.</span>
        </div>
      </div>

      {/* Messages Scroll Area - Scrollable middle */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-6 space-y-4 overscroll-contain"
      >
        {/* Security Warning Banner if Blocked */}
        {securityError && (
          <div className="max-w-4xl mx-auto p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-500/40 text-rose-800 dark:text-rose-200 text-xs flex items-start justify-between gap-3 shadow-sm">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold text-rose-800 dark:text-rose-300">
                  Система безопасности заблокировала запрос
                </div>
                <div className="text-rose-700 dark:text-rose-300/80 leading-relaxed font-mono text-[11px]">
                  {securityError}
                </div>
              </div>
            </div>
            {onDismissSecurityError && (
              <button
                onClick={onDismissSecurityError}
                className="text-rose-500 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-200 transition p-1 rounded hover:bg-rose-100 dark:hover:bg-rose-900/40 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {messages.length === 0 ? (
          <div className="max-w-xl mx-auto my-12 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-600/10 border border-indigo-200 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto shadow-xs">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-200">
              Рабочее пространство проекта {project.name}
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-md mx-auto">
              Задайте Gemini промпт: напишите код, запустите тесты, выполните рефакторинг или спросите по архитектуре. Все изменения выполняются прямо в папке <code className="text-indigo-600 dark:text-indigo-300 font-mono">{project.path}</code>.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left pt-2">
              <div className="p-3 bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/80 rounded-xl text-xs text-zinc-700 dark:text-zinc-300 shadow-xs">
                <div className="font-semibold text-zinc-900 dark:text-zinc-200 mb-1 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  Автономное выполнение
                </div>
                Агент читает файлы, запускает bash команды и вносит изменения по вашим указаниям.
              </div>
              <div className="p-3 bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/80 rounded-xl text-xs text-zinc-700 dark:text-zinc-300 shadow-xs">
                <div className="font-semibold text-zinc-900 dark:text-zinc-200 mb-1 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                  Защищенный контур
                </div>
                Деструктивные команды и попытки модификации системы за пределами проекта блокируются.
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto w-full space-y-2">
            {messages.map((msg) => (
              <MessageCard
                key={msg.id}
                message={msg}
                isStreaming={isRunning && msg.id === activeAssistantMessageId}
              />
            ))}
          </div>
        )}
      </div>

      {/* Input area - Fixed / Sticky Bottom */}
      <div className="shrink-0 sticky bottom-0 z-20">
        <PromptInput
          onSend={onSendPrompt}
          onStop={onStop}
          isRunning={isRunning}
        />
      </div>
    </div>
  );
};
