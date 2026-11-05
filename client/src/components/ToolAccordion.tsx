import React, { useState } from 'react';
import {
  Terminal,
  FileCode,
  Search,
  Globe,
  Wrench,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Loader2,
  Copy,
  Check
} from 'lucide-react';
import { Step } from '../types.ts';

interface ToolAccordionProps {
  step: Step;
}

export const ToolAccordion: React.FC<ToolAccordionProps> = ({ step }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const getToolIcon = (name?: string) => {
    switch (name) {
      case 'run_command':
        return <Terminal className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
      case 'view_file':
      case 'write_to_file':
      case 'replace_file_content':
      case 'multi_replace_file_content':
        return <FileCode className="w-4 h-4 text-sky-600 dark:text-sky-400" />;
      case 'grep_search':
      case 'find_by_name':
        return <Search className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
      case 'search_web':
      case 'open_browser_url':
        return <Globe className="w-4 h-4 text-purple-600 dark:text-purple-400" />;
      default:
        return <Wrench className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />;
    }
  };

  const getToolSummary = () => {
    const params = step.toolParams || {};
    if (step.toolName === 'run_command') {
      return params.CommandLine || 'Выполнение команды shell';
    }
    if (step.toolName === 'view_file' || step.toolName === 'write_to_file') {
      return params.Path || params.TargetFile || step.toolName;
    }
    if (step.toolName === 'grep_search') {
      return `Поиск: "${params.pattern || params.query || ''}"`;
    }
    return step.toolName || 'Вызов инструмента';
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    const content = step.toolOutput || JSON.stringify(step.toolParams, null, 2) || '';
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2 border border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/70 rounded-lg overflow-hidden text-xs transition-colors">
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors select-none"
      >
        <div className="flex items-center gap-2 overflow-hidden mr-2">
          {getToolIcon(step.toolName)}
          <span className="font-medium text-zinc-800 dark:text-zinc-300 font-mono">
            {step.toolName}
          </span>
          <span className="text-zinc-500 dark:text-zinc-400 font-mono truncate max-w-[280px] sm:max-w-md">
            {getToolSummary()}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {step.durationSeconds !== undefined && step.durationSeconds !== null && (
            <span className="text-zinc-400 dark:text-zinc-500 font-mono text-[11px]">
              {step.durationSeconds.toFixed(1)}s
            </span>
          )}

          {step.status === 'active' ? (
            <Loader2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 animate-spin" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          )}

          {isOpen ? (
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
          )}
        </div>
      </div>

      {isOpen && (
        <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/80 p-3 font-mono text-[11px] space-y-2">
          {step.toolParams && (
            <div>
              <div className="text-zinc-500 dark:text-zinc-400 font-semibold mb-1 uppercase tracking-wider text-[10px]">
                Параметры:
              </div>
              <pre className="p-2 bg-zinc-50 dark:bg-zinc-900 rounded border border-zinc-200 dark:border-zinc-800/80 text-zinc-800 dark:text-zinc-300 overflow-x-auto whitespace-pre-wrap max-h-48">
                {typeof step.toolParams === 'string'
                  ? step.toolParams
                  : JSON.stringify(step.toolParams, null, 2)}
              </pre>
            </div>
          )}

          {step.toolOutput && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-zinc-500 dark:text-zinc-400 font-semibold uppercase tracking-wider text-[10px]">
                  Вывод:
                </span>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 text-[10px] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition cursor-pointer"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Скопировано' : 'Копировать'}
                </button>
              </div>
              <pre className="p-2 bg-zinc-900 rounded border border-zinc-800 text-emerald-300 overflow-x-auto whitespace-pre-wrap max-h-64">
                {step.toolOutput}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
