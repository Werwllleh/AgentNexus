import React, { useState } from 'react';
import {
  HelpCircle,
  Sparkles,
  ArrowRight,
  CheckSquare,
  Square,
  Send,
  Check
} from 'lucide-react';
import { ExtractedQuestion, InteractiveOption } from '../services/interactiveQuestions.ts';

interface InteractiveQuestionsCardProps {
  questions: ExtractedQuestion[];
  isStreaming?: boolean;
  disabled?: boolean;
  onSelectOption?: (optionText: string) => void;
}

export const InteractiveQuestionsCard: React.FC<InteractiveQuestionsCardProps> = ({
  questions,
  isStreaming = false,
  disabled = false,
  onSelectOption
}) => {
  const [selectedMulti, setSelectedMulti] = useState<Record<string, Set<number>>>({});
  const [lastClickedOption, setLastClickedOption] = useState<string | null>(null);

  if (!questions || questions.length === 0) return null;

  const toggleMultiSelect = (questionId: string, idx: number) => {
    setSelectedMulti((prev) => {
      const current = new Set(prev[questionId] || []);
      if (current.has(idx)) {
        current.delete(idx);
      } else {
        current.add(idx);
      }
      return { ...prev, [questionId]: current };
    });
  };

  const handleSingleClick = (opt: InteractiveOption) => {
    if (disabled || isStreaming || !onSelectOption) return;
    setLastClickedOption(opt.sendValue);
    onSelectOption(opt.sendValue);
  };

  const handleMultiSubmit = (q: ExtractedQuestion) => {
    if (disabled || isStreaming || !onSelectOption) return;
    const selectedIndices = selectedMulti[q.id] || new Set();
    if (selectedIndices.size === 0) return;

    const chosen = Array.from(selectedIndices)
      .sort((a, b) => a - b)
      .map((idx) => q.options[idx]?.sendValue)
      .filter(Boolean);

    if (chosen.length > 0) {
      const combined = chosen.join(', ');
      setLastClickedOption(combined);
      onSelectOption(combined);
    }
  };

  return (
    <div
      data-testid="interactive-question-card"
      className="mt-3.5 pt-3.5 border-t border-zinc-200/80 dark:border-zinc-800/80 space-y-3.5"
    >
      {questions.map((q) => {
        const selectedSet = selectedMulti[q.id] || new Set<number>();

        return (
          <div
            key={q.id}
            className="rounded-xl p-3 sm:p-4 bg-gradient-to-b from-indigo-50/60 to-purple-50/30 dark:from-indigo-950/25 dark:to-purple-950/15 border border-indigo-200/70 dark:border-indigo-800/50 shadow-xs"
          >
            {/* Question Header */}
            <div className="flex items-start gap-2.5 mb-2.5">
              <div className="w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
                <HelpCircle className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-semibold text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 leading-snug">
                    {q.question}
                  </h4>
                  {q.source === 'tool' && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-mono">
                      запрос агента
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {q.isMultiSelect
                    ? 'Отметьте один или несколько вариантов и нажмите «Отправить ответ»:'
                    : 'Нажмите на нужный вариант, чтобы отправить его агенту:'}
                </p>
              </div>
            </div>

            {/* Options list */}
            <div className="space-y-1.5 mt-2">
              {q.options.map((opt, idx) => {
                const isSelected = selectedSet.has(idx);
                const isJustClicked = lastClickedOption === opt.sendValue;

                if (q.isMultiSelect) {
                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={disabled || isStreaming}
                      onClick={() => toggleMultiSelect(q.id, idx)}
                      className={`w-full text-left p-2.5 sm:p-3 rounded-xl border transition-all flex items-start gap-3 cursor-pointer ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-100 shadow-xs'
                          : 'border-zinc-200 dark:border-zinc-800/80 bg-white/90 dark:bg-zinc-900/60 hover:bg-white dark:hover:bg-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700'
                      } ${disabled || isStreaming ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      <div className="mt-0.5 shrink-0 text-indigo-600 dark:text-indigo-400">
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 fill-indigo-100 dark:fill-indigo-900" />
                        ) : (
                          <Square className="w-4 h-4 text-zinc-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-xs sm:text-sm text-zinc-900 dark:text-zinc-100">
                            {opt.title}
                          </span>
                          {opt.isRecommended && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300/60 dark:border-emerald-700/60">
                              <Sparkles className="w-2.5 h-2.5" /> Рекомендуется
                            </span>
                          )}
                        </div>
                        {opt.description && (
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug">
                            {opt.description}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                }

                // Single Select Pill Button
                return (
                  <button
                    key={idx}
                    type="button"
                    data-testid="interactive-option-btn"
                    disabled={disabled || isStreaming}
                    onClick={() => handleSingleClick(opt)}
                    className={`group w-full text-left p-2.5 sm:p-3 rounded-xl border transition-all flex items-start gap-3 cursor-pointer ${
                      isJustClicked
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-950 dark:text-indigo-100 ring-2 ring-indigo-500/20'
                        : 'border-zinc-200/90 dark:border-zinc-800/80 bg-white/90 dark:bg-zinc-900/60 hover:bg-white dark:hover:bg-zinc-800/80 hover:border-indigo-400 dark:hover:border-indigo-600 hover:shadow-xs active:scale-[0.99]'
                    } ${disabled || isStreaming ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    {/* Number badge or bullet */}
                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 transition-colors ${
                        opt.number
                          ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 group-hover:bg-indigo-600 group-hover:text-white'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 group-hover:bg-indigo-600 group-hover:text-white'
                      }`}
                    >
                      {opt.number || (idx + 1)}
                    </div>

                    {/* Title and Description */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition-colors">
                          {opt.title}
                        </span>
                        {opt.isRecommended && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300/60 dark:border-emerald-700/60">
                            <Sparkles className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                            Рекомендуется
                          </span>
                        )}
                      </div>
                      {opt.description && (
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug">
                          {opt.description}
                        </p>
                      )}
                    </div>

                    {/* Action Arrow Icon */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity text-indigo-600 dark:text-indigo-400 flex items-center gap-1 text-[11px] font-medium shrink-0 self-center">
                      <span className="hidden sm:inline">Выбрать</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Multi-select Submit Button */}
            {q.isMultiSelect && (
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  disabled={disabled || isStreaming || selectedSet.size === 0}
                  onClick={() => handleMultiSubmit(q)}
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Отправить выбранные ({selectedSet.size})</span>
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
