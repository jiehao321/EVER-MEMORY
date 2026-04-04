import type { ButlerLogger } from '../core/butler/types.js';

interface ButlerAskDeps {
  getActiveQuestions: () => Array<{ id: string; questionText: string; gapType: string; importance: number }>;
  logger?: ButlerLogger;
}

export interface ButlerAskResult {
  questions: Array<{ id: string; questionText: string; gapType: string; importance: number }>;
  count: number;
}

export function executeButlerAsk(deps: ButlerAskDeps): ButlerAskResult {
  const questions = deps.getActiveQuestions();
  return { questions, count: questions.length };
}
