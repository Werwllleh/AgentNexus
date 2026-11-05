import React, { useMemo, useState } from 'react';
import { marked } from 'marked';
import 'highlight.js/styles/github-dark.css';
import { User, Sparkles, Copy, Check, AlertCircle } from 'lucide-react';
import { Message } from '../types.ts';
import { ToolAccordion } from './ToolAccordion.tsx';

interface MessageCardProps {
  message: Message;
  isStreaming?: boolean;
}

marked.setOptions({
  breaks: true,
  gfm: true,
});

export const MessageCard: React.FC<MessageCardProps> = ({ message, isStreaming }) => {
  const [copied, setCopied] = useState(false);

  const isUser = message.role === 'user';

  const htmlContent = useMemo(() => {
    if (isUser) return '';
    try {
      const raw = marked.parse(message.content || '') as string;
      return raw;
    } catch {
      return message.content || '';
    }
  }, [message.content, isUser]);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isUser) {
    return (
      <div className="flex justify-end my-4">
        <div className="flex gap-3 max-w-[85%] sm:max-w-[75%] items-start">
          <div className="bg-indigo-600 text-white px-4 py-3 rounded-2xl rounded-tr-sm shadow-md border border-indigo-500/30 text-sm leading-relaxed whitespace-pre-wrap font-sans">
            {message.content}
          </div>
          <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-center shrink-0 text-indigo-600 dark:text-indigo-300">
            <User className="w-4 h-4" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 my-4 items-start group">
      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center shrink-0 text-white shadow-lg shadow-indigo-500/20 mt-1">
        <Sparkles className="w-4 h-4" />
      </div>

      <div className="flex-1 min-w-0 bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-4 sm:p-5 relative shadow-xs transition-colors">
        {/* Header toolbar */}
        <div className="flex items-center justify-between mb-3 text-xs text-zinc-500 dark:text-zinc-400 pb-2 border-b border-zinc-100 dark:border-zinc-800/60">
          <span className="font-semibold text-zinc-900 dark:text-zinc-200 flex items-center gap-1.5">
            Gemini Agent
            {isStreaming && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400 animate-ping" />
                генерация...
              </span>
            )}
            {message.status === 'stopped' && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30">
                остановлено
              </span>
            )}
            {message.status === 'error' && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-rose-50 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30">
                <AlertCircle className="w-3 h-3" />
                ошибка
              </span>
            )}
          </span>

          <button
            onClick={handleCopy}
            className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800/60 hover:bg-zinc-200 dark:hover:bg-zinc-800 cursor-pointer"
            title="Скопировать ответ"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
            <span className="text-[11px]">{copied ? 'Скопировано' : 'Копировать'}</span>
          </button>
        </div>

        {/* Steps / Tool executions */}
        {message.steps && message.steps.length > 0 && (
          <div className="mb-4 space-y-1">
            <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <span>Действия агента:</span>
              <span className="text-zinc-400 dark:text-zinc-500">({message.steps.length})</span>
            </div>
            {message.steps.map((step, idx) => (
              <ToolAccordion key={step.id || idx} step={step} />
            ))}
          </div>
        )}

        {/* Main message text */}
        {message.content ? (
          <div
            className="markdown-body"
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        ) : isStreaming ? (
          <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 text-sm py-2 italic font-mono">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            Анализирую проект и выполняю действия...
          </div>
        ) : null}

        {isStreaming && message.content && (
          <span className="streaming-cursor" />
        )}
      </div>
    </div>
  );
};
