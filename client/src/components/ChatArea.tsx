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
  AlertTriangle,
  X
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
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  project,
  conversation,
  isRunning,
  onSendPrompt,
  onStop,
  activeAssistantMessageId,
  securityError,
  onDismissSecurityError
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation?.messages, isRunning, securityError]);

  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-950 p-6 text-center text-zinc-500 font-mono text-sm">
        Выберите проект в левой панели, чтобы начать работу с Gemini.
      </div>
    );
  }

  const messages = conversation?.messages || [];

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950 min-w-0">
      {/* Top Header */}
      <header className="h-14 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-indigo-400">
            <FolderGit2 className="w-4 h-4" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-zinc-100 truncate font-mono">
                {project.name}
              </h2>
              {project.gitBranch && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono">
                  <GitBranch className="w-2.5 h-2.5 text-zinc-500" />
                  {project.gitBranch}
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-500 font-mono truncate">
              {project.path}
            </p>
          </div>
        </div>

        {/* Status & Stop button */}
        <div className="flex items-center gap-3">
          {isRunning ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-mono">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                <span>Выполняется в фоне</span>
              </div>
              <button
                onClick={onStop}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600/80 hover:bg-rose-500 text-white text-xs font-medium transition shadow-sm cursor-pointer"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>Прервать</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-zinc-900 text-zinc-400 border border-zinc-800 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Ожидание задач</span>
            </div>
          )}
        </div>
      </header>

      {/* Security & Resilience Banner */}
      <div className="px-6 py-1.5 bg-zinc-900/40 border-b border-zinc-800/60 text-[11px] text-zinc-400 font-mono flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
          <span>Фоновая сессия активна: можно закрыть вкладку в любой момент, выполнение не прервется.</span>
        </div>
        <span className="text-[10px] text-emerald-400 font-medium">Защита от инъекций: Активна</span>
      </div>

      {/* Messages Scroll Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {/* Security Warning Banner if Blocked */}
        {securityError && (
          <div className="max-w-4xl mx-auto p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs flex items-start justify-between gap-3 shadow-lg shadow-rose-950/30">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold text-rose-300">
                  Система безопасности заблокировала запрос
                </div>
                <div className="text-rose-300/80 leading-relaxed font-mono text-[11px]">
                  {securityError}
                </div>
              </div>
            </div>
            {onDismissSecurityError && (
              <button
                onClick={onDismissSecurityError}
                className="text-rose-400 hover:text-rose-200 transition p-1 rounded hover:bg-rose-900/40"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {messages.length === 0 ? (
          <div className="max-w-xl mx-auto my-12 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto shadow-inner">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-zinc-200">
              Рабочее пространство проекта {project.name}
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed max-w-md mx-auto">
              Задайте Gemini промпт: напишите код, запустите тесты, выполните рефакторинг или спросите по архитектуре. Все изменения выполняются прямо в папке <code className="text-indigo-300 font-mono">{project.path}</code>.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left pt-2">
              <div className="p-3 bg-zinc-900/40 border border-zinc-800/80 rounded-xl text-xs text-zinc-300">
                <div className="font-semibold text-zinc-200 mb-1 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                  Автономное выполнение
                </div>
                Агент читает файлы, запускает bash команды и вносит изменения по вашим указаниям.
              </div>
              <div className="p-3 bg-zinc-900/40 border border-zinc-800/80 rounded-xl text-xs text-zinc-300">
                <div className="font-semibold text-zinc-200 mb-1 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
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

      {/* Input area */}
      <PromptInput
        onSend={onSendPrompt}
        onStop={onStop}
        isRunning={isRunning}
      />
    </div>
  );
};
