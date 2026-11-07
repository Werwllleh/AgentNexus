import React, { useMemo, useState } from 'react';
import { marked } from 'marked';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';
import { Copy, Check, AlertCircle, Loader2, Clock } from 'lucide-react';
import { Message } from '../types.ts';
import { ToolAccordion } from './ToolAccordion.tsx';
import { InteractiveQuestionsCard } from './InteractiveQuestionsCard.tsx';
import { extractInteractiveQuestions } from '../services/interactiveQuestions.ts';

interface MessageCardProps {
  message: Message;
  isStreaming?: boolean;
  disabled?: boolean;
  onSelectOption?: (optionText: string) => void;
}

// Format relative timestamp nicely
function formatRelativeTime(timestamp?: number | string): string {
  if (!timestamp) return '';
  const ts = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
  if (!ts || isNaN(ts)) return '';

  const now = Date.now();
  const diffSec = Math.floor((now - ts) / 1000);

  if (diffSec < 45) return 'только что';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} мин назад`;

  const date = new Date(ts);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');

  if (diffSec < 86400) return `сегодня в ${hours}:${minutes}`;
  if (diffSec < 172800) return `вчера в ${hours}:${minutes}`;
  return `${date.toLocaleDateString([], { day: '2-digit', month: '2-digit' })} в ${hours}:${minutes}`;
}

// Configure marked with syntax highlighting, language headers, copy buttons and callouts
marked.use({
  breaks: true,
  gfm: true,
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      const language = (lang || '').trim().toLowerCase();
      const validLang = hljs.getLanguage(language) ? language : '';
      let highlighted = '';
      try {
        if (validLang) {
          highlighted = hljs.highlight(text, { language: validLang, ignoreIllegals: true }).value;
        } else {
          highlighted = hljs.highlightAuto(text).value;
        }
      } catch {
        highlighted = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }
      const displayLang = (language || 'code').toUpperCase();
      const encoded = encodeURIComponent(text);

      return `<div class="code-block-wrapper my-3 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-[#0d1117] text-zinc-100 shadow-xs">
  <div class="code-block-header flex items-center justify-between px-3.5 py-1.5 bg-[#161b22] border-b border-zinc-800 text-[11px] font-mono text-zinc-400 select-none">
    <div class="flex items-center gap-2">
      <span class="inline-block w-2.5 h-2.5 rounded-full bg-zinc-700/60"></span>
      <span class="font-semibold text-zinc-300 tracking-wider">${displayLang}</span>
    </div>
    <button type="button" class="copy-code-btn flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition cursor-pointer" data-code="${encoded}" title="Скопировать код">
      <svg class="w-3 h-3 copy-icon pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
      <span class="copy-label pointer-events-none">Копировать</span>
    </button>
  </div>
  <pre class="p-3.5 overflow-x-auto text-[13px] font-mono leading-relaxed m-0 bg-transparent"><code class="hljs ${validLang || ''}">${highlighted}</code></pre>
</div>`;
    },
    blockquote({ text }: { text: string }) {
      const trimmed = text.trim();
      const match = trimmed.match(/^(?:<p>)?\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\s*<br\s*\/?>)?([\s\S]*?)(?:<\/p>)?$/i);
      if (match) {
        const type = match[1].toUpperCase();
        const content = match[2].trim();
        const config: Record<string, { title: string; color: string; border: string; bg: string }> = {
          NOTE: {
            title: 'Примечание',
            color: 'text-indigo-600 dark:text-indigo-400',
            border: 'border-indigo-500/50 dark:border-indigo-500/40',
            bg: 'bg-indigo-50/50 dark:bg-indigo-950/20'
          },
          TIP: {
            title: 'Совет',
            color: 'text-emerald-600 dark:text-emerald-400',
            border: 'border-emerald-500/50 dark:border-emerald-500/40',
            bg: 'bg-emerald-50/50 dark:bg-emerald-950/20'
          },
          IMPORTANT: {
            title: 'Важно',
            color: 'text-purple-600 dark:text-purple-400',
            border: 'border-purple-500/50 dark:border-purple-500/40',
            bg: 'bg-purple-50/50 dark:bg-purple-950/20'
          },
          WARNING: {
            title: 'Предупреждение',
            color: 'text-amber-600 dark:text-amber-400',
            border: 'border-amber-500/50 dark:border-amber-500/40',
            bg: 'bg-amber-50/50 dark:bg-amber-950/20'
          },
          CAUTION: {
            title: 'Внимание',
            color: 'text-rose-600 dark:text-rose-400',
            border: 'border-rose-500/50 dark:border-rose-500/40',
            bg: 'bg-rose-50/50 dark:bg-rose-950/20'
          }
        };
        const c = config[type] || config.NOTE;
        return `<div class="callout callout-${type.toLowerCase()} my-3 p-3.5 rounded-xl border ${c.border} ${c.bg} text-xs leading-relaxed">
  <div class="flex items-center gap-1.5 font-semibold text-[11px] mb-1.5 uppercase tracking-wider ${c.color}">
    <span>${c.title} (${type})</span>
  </div>
  <div class="callout-content text-zinc-700 dark:text-zinc-300 font-sans">${content}</div>
</div>`;
      }
      return `<blockquote>${text}</blockquote>`;
    }
  }
});

export const MessageCard: React.FC<MessageCardProps> = ({
  message,
  isStreaming,
  disabled,
  onSelectOption
}) => {
  const [copied, setCopied] = useState(false);

  const isUser = message.role === 'user';
  const relativeTime = useMemo(() => formatRelativeTime(message.created_at), [message.created_at]);

  const htmlContent = useMemo(() => {
    if (isUser) return '';
    try {
      const raw = marked.parse(message.content || '') as string;
      return raw;
    } catch {
      return message.content || '';
    }
  }, [message.content, isUser]);

  // Extract any questions (from ask_question tool or markdown text choices)
  const interactiveQuestions = useMemo(() => {
    if (isUser) return [];
    return extractInteractiveQuestions(message.content || '', message.steps);
  }, [message.content, message.steps, isUser]);

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Delegated click handler for code block snippet copy buttons
  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest('.copy-code-btn') as HTMLButtonElement | null;
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();

    const code = decodeURIComponent(target.dataset.code || '');
    if (!code) return;

    navigator.clipboard.writeText(code).then(() => {
      const label = target.querySelector('.copy-label');
      if (label) {
        const origText = label.textContent;
        label.textContent = 'Скопировано!';
        target.classList.add('text-emerald-400');
        setTimeout(() => {
          label.textContent = origText;
          target.classList.remove('text-emerald-400');
        }, 2000);
      }
    });
  };

  if (isUser) {
    return (
      <div data-testid="user-card" data-message-card="true" data-role="user" className="flex flex-col items-end my-3 w-full">
        <div className="max-w-[88%] sm:max-w-[80%] bg-indigo-600 text-white px-4 py-3 rounded-2xl rounded-tr-sm shadow-md border border-indigo-500/30 text-sm leading-relaxed whitespace-pre-wrap font-sans break-words overflow-hidden">
          {message.content}
        </div>
        {relativeTime && (
          <div className="flex items-center gap-1 text-[10px] text-zinc-400 mt-1 mr-1 font-mono">
            <Clock className="w-2.5 h-2.5 text-zinc-400" />
            <span>{relativeTime}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid="assistant-card"
      data-message-card="true"
      data-role="assistant"
      onClick={handleCardClick}
      className="my-3 w-full min-w-0 group"
    >
      <div className="w-full min-w-0 bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-4 sm:p-5 relative shadow-xs transition-colors overflow-hidden">
        {/* Header toolbar */}
        <div className="flex items-center justify-between mb-3 text-xs text-zinc-500 dark:text-zinc-400 pb-2 border-b border-zinc-100 dark:border-zinc-800/60">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-zinc-900 dark:text-zinc-200 flex items-center gap-1.5">
              AgentNexus AI
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

            {relativeTime && (
              <span className="text-[10px] text-zinc-400 font-mono hidden sm:inline-flex items-center gap-1">
                • {relativeTime}
              </span>
            )}
          </div>

          <button
            onClick={handleCopyMessage}
            className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center gap-1 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800/60 hover:bg-zinc-200 dark:hover:bg-zinc-800 cursor-pointer"
            title="Скопировать весь ответ"
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

        {/* Main message text or Live Status */}
        {message.content ? (
          <div
            className="markdown-body overflow-x-hidden break-words max-w-full"
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        ) : isStreaming || message.status === 'streaming' ? (
          <div className="flex items-center gap-2.5 text-zinc-600 dark:text-zinc-400 text-xs sm:text-sm py-2 px-3 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 font-mono">
            <Loader2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 animate-spin shrink-0" />
            <span>
              {(() => {
                const activeStep = message.steps?.find((s) => s.status === 'active');
                if (activeStep) {
                  return `Выполняю: ${activeStep.toolName || 'действие'}...`;
                }
                return 'Агент выполняет задачу...';
              })()}
            </span>
          </div>
        ) : message.steps && message.steps.length > 0 ? (
          <div className="text-zinc-500 dark:text-zinc-400 text-xs font-mono py-1">
            Действия успешно выполнены.
          </div>
        ) : (
          <div className="text-zinc-400 dark:text-zinc-500 text-xs italic font-mono py-1">
            Сессия была завершена без текстового вывода.
          </div>
        )}

        {(isStreaming || message.status === 'streaming') && message.content && (
          <span className="streaming-cursor" />
        )}

        {/* Interactive Questions & Options Card */}
        {interactiveQuestions.length > 0 && (
          <InteractiveQuestionsCard
            questions={interactiveQuestions}
            isStreaming={isStreaming}
            disabled={disabled}
            onSelectOption={onSelectOption}
          />
        )}
      </div>
    </div>
  );
};
