import { Step } from '../types.ts';

export interface InteractiveOption {
  raw: string;
  cleanText: string;
  number: string | null;
  title: string;
  description: string | null;
  isRecommended: boolean;
  sendValue: string;
}

export interface ExtractedQuestion {
  id: string;
  question: string;
  options: InteractiveOption[];
  isMultiSelect: boolean;
  source: 'tool' | 'markdown';
}

/**
 * Parses an individual option string into structured display and submission tokens.
 */
export function parseOptionItem(optionStr: string): InteractiveOption {
  const isRecommended = /(?:\(recommended\)|\(рекомендуется\))/i.test(optionStr);

  let clean = optionStr
    .replace(/\(recommended\)/gi, '')
    .replace(/\(рекомендуется\)/gi, '')
    .trim();

  // Strip leading list bullet if present: "- ", "* ", "- [ ] "
  clean = clean.replace(/^[-*]\s+(?:\[[\sx]\]\s*)?/, '').trim();

  // Check if starts with a number like "1. " or "1) "
  const numMatch = clean.match(/^(\d+)[\.\)]\s*(.+)$/);
  const number = numMatch ? numMatch[1] : null;
  const contentAfterNum = numMatch ? numMatch[2].trim() : clean;

  // Split title and description if separated by " — " or " : " or " - "
  let title = contentAfterNum;
  let description: string | null = null;

  const sepMatch = contentAfterNum.match(/^([^\:\—\-]+)(?:\s*[\:\—\-]\s*)(.+)$/);
  if (sepMatch && sepMatch[1].length < 60) {
    title = sepMatch[1].trim();
    description = sepMatch[2].trim();
  }

  // Strip markdown formatting from title & description
  const cleanTitle = title
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();

  const cleanDescription = description
    ? description
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .trim()
    : null;

  const sendValue = number
    ? `${number}. ${cleanTitle}${cleanDescription ? ` — ${cleanDescription}` : ''}`
    : `${cleanTitle}${cleanDescription ? ` — ${cleanDescription}` : ''}`;

  return {
    raw: optionStr,
    cleanText: cleanTitle,
    number,
    title: cleanTitle,
    description: cleanDescription,
    isRecommended,
    sendValue: sendValue.trim()
  };
}

/**
 * Checks whether a line serves as an interrogative or choice header.
 */
function isChoiceHeader(line: string): boolean {
  if (line.endsWith('?')) return true;
  return /(?:выберите|вариант|какой|какое|что делать|что выберем|как поступим|как продолжить|хотите ли|подтвердите|выбор|действие|choose|select|which option|what should|would you like)/i.test(line);
}

/**
 * Extracts interactive questions either from tool executions (e.g. `ask_question`)
 * or from markdown choice blocks at the end of assistant messages.
 */
export function extractInteractiveQuestions(
  content: string,
  steps?: Step[]
): ExtractedQuestion[] {
  // 1. Tool-based question (highest priority and most explicit)
  if (steps && steps.length > 0) {
    for (const step of steps) {
      const toolName = step.toolName || (step as any).tool_name;
      const params = step.toolParams || (step as any).tool_params;
      if (toolName === 'ask_question' && params) {
        if (Array.isArray(params.questions) && params.questions.length > 0) {
          return params.questions.map((q: any, idx: number) => ({
            id: `tool-${step.id || idx}-${idx}`,
            question: q.question || 'Выберите вариант ответа:',
            options: (q.options || [])
              .map((o: any) => parseOptionItem(String(o)))
              .filter((o: InteractiveOption) => o.title.length > 0),
            isMultiSelect: !!q.is_multi_select,
            source: 'tool' as const
          }));
        }
        if (Array.isArray(params.options) && params.options.length > 0) {
          return [{
            id: `tool-${step.id || '0'}`,
            question: params.question || 'Выберите вариант ответа:',
            options: params.options
              .map((o: any) => parseOptionItem(String(o)))
              .filter((o: InteractiveOption) => o.title.length > 0),
            isMultiSelect: !!params.is_multi_select,
            source: 'tool' as const
          }];
        }
      }
    }
  }

  // 2. Markdown text based questions
  if (!content || typeof content !== 'string') return [];

  const lines = content.trim().split('\n');
  const listItems: { num: string | null; rawText: string; fullLine: string }[] = [];
  let questionHeader = '';
  let inList = false;

  for (let i = lines.length - 1; i >= 0; i--) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line) {
      if (inList) continue; // Allow blank lines between items or before header
      continue;
    }

    // Match numbered item (e.g., "1. ...", "1) ...")
    const numMatch = line.match(/^(\d+)[\.\)]\s+(.+)$/);
    // Match bullet or checkbox (e.g., "- ...", "* ...", "- [ ] ...")
    const bulletMatch = line.match(/^[\-\*]\s+(?:\[[\sx]\]\s*)?(.+)$/);

    if (numMatch || bulletMatch) {
      const text = numMatch ? numMatch[2].trim() : bulletMatch![1].trim();
      const num = numMatch ? numMatch[1] : null;
      listItems.unshift({ num, rawText: text, fullLine: line });
      inList = true;
    } else if (inList) {
      if (isChoiceHeader(line)) {
        questionHeader = line.replace(/^[#*>\-\s]+/, '').trim();
      }
      break;
    }
  }

  if (listItems.length >= 2 && listItems.length <= 8) {
    const hasQuestion = !!questionHeader || content.includes('?') ||
      /(?:выберите|вариант|как поступим|что делаем|какое действие|выбор)/i.test(content);

    if (hasQuestion) {
      const options = listItems
        .map((item) => {
          const optionStr = item.num ? `${item.num}. ${item.rawText}` : item.rawText;
          return parseOptionItem(optionStr);
        })
        .filter((o) => o.title.length > 0);

      if (options.length >= 2) {
        return [{
          id: 'md-question',
          question: questionHeader || 'Выберите вариант продолжения:',
          options,
          isMultiSelect: false,
          source: 'markdown' as const
        }];
      }
    }
  }

  return [];
}
