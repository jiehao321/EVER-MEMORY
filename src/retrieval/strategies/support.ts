import type {
  MemoryDataClass,
  MemoryItem,
  MemoryType,
  RecallForIntentRequest,
} from '../../types.js';
import {
  DEFAULT_RECALL_LIMIT,
  DEEP_QUERY_FALLBACK_MAX_LENGTH,
  DEEP_QUERY_MAX_TERMS,
  DEEP_QUERY_PRIORITY_TERMS,
  DEEP_QUERY_STOPWORDS,
  INTENT_QUERY_MAX_LENGTH,
} from '../../tuning.js';
import { NEXT_STEP_PATTERNS } from '../../patterns.js';

export type ProjectRecallRouteKind =
  | 'none'
  | 'project_progress'
  | 'current_stage'
  | 'next_step'
  | 'last_decision';

export interface RecallExecutionMeta {
  routeKind: ProjectRecallRouteKind;
  routeApplied: boolean;
  projectOriented: boolean;
  routeReason: 'none' | 'project_signal' | 'scope_project' | 'intent_project' | 'pattern_without_project_context';
  routeScore: number;
  routeProjectSignal: boolean;
  hasProjectScope: boolean;
  intentProjectOriented: boolean;
}

export interface CandidatePolicyStats {
  initialCandidates: number;
  filteredCandidates: number;
  suppressedTestCandidates: number;
  retainedTestCandidates: number;
  suppressedLowValueCandidates: number;
  retainedLowValueCandidates: number;
  filterMode: 'default' | 'project_strict';
  dataClassCounts: Record<MemoryDataClass, number>;
}

export interface RecallSelectionStats {
  duplicateItemsRemoved: number;
  highValueItemsSelected: number;
  routeAnchorItemsSelected: number;
  selectedTypeCounts: Partial<Record<MemoryType, number>>;
}

export interface ScoredRecallItem {
  memory: MemoryItem;
  score: number;
  keywordScore: number;
  semanticScore: number;
  baseScore: number;
  projectPriority: number;
  dataQuality: number;
  dataClass: MemoryDataClass;
}

export interface RankedStrategyResult {
  ranked: ScoredRecallItem[];
  candidates: MemoryItem[];
  semanticHitCount: number;
  candidatePolicy: CandidatePolicyStats;
}

export function sanitizeInputText(rawText: string): string {
  return rawText
    .replace(/^\[[^\]]+\]\s*/u, '')
    .trim();
}

export function looksLikeNextStepQuery(text: string): boolean {
  const normalized = sanitizeInputText(text).toLowerCase();
  if (!normalized) {
    return false;
  }
  if (NEXT_STEP_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }
  return /\b(next\s*(action|milestone)|what'?s?\s+next)\b/i.test(normalized);
}

function isNoisyNumericToken(token: string): boolean {
  if (!token) {
    return true;
  }
  return (
    /^\d+$/.test(token)
    || /^\d{4}-\d{1,2}-\d{1,2}$/.test(token)
    || /^\d{1,2}:\d{2}$/.test(token)
  );
}

function buildDeepQuery(rawText: string): string {
  const normalized = sanitizeInputText(rawText)
    .toLowerCase()
    .replace(/[^a-z0-9_\u4e00-\u9fff]+/g, ' ')
    .trim();
  if (!normalized) {
    return '';
  }

  for (const term of DEEP_QUERY_PRIORITY_TERMS) {
    if (normalized.includes(term)) {
      return term;
    }
  }

  const terms: string[] = [];
  for (const rawTerm of normalized.split(/\s+/g).filter((term) => term.length > 0)) {
    if (isNoisyNumericToken(rawTerm) || DEEP_QUERY_STOPWORDS.has(rawTerm)) {
      continue;
    }
    if (/^[\u4e00-\u9fff]+$/.test(rawTerm) && rawTerm.length > 6) {
      for (let index = 0; index < rawTerm.length; index += 3) {
        const chunk = rawTerm.slice(index, index + 3);
        if (chunk.length >= 2 && !DEEP_QUERY_STOPWORDS.has(chunk)) {
          terms.push(chunk);
        }
      }
      continue;
    }
    if (rawTerm.length >= 2) {
      terms.push(rawTerm);
    }
  }

  const uniqueTerms: string[] = [];
  const seen = new Set<string>();
  for (const term of terms) {
    if (seen.has(term)) {
      continue;
    }
    seen.add(term);
    uniqueTerms.push(term);
    if (uniqueTerms.length >= DEEP_QUERY_MAX_TERMS) {
      break;
    }
  }

  if (uniqueTerms.length === 0) {
    return sanitizeInputText(rawText).slice(0, DEEP_QUERY_FALLBACK_MAX_LENGTH);
  }

  return uniqueTerms.sort((left, right) => right.length - left.length)[0]
    ?? sanitizeInputText(rawText).slice(0, DEEP_QUERY_FALLBACK_MAX_LENGTH);
}

export function pickIntentQuery(rawText: string, memoryNeed: RecallForIntentRequest['intent']['signals']['memoryNeed']): string {
  const trimmed = sanitizeInputText(rawText);
  if (!trimmed) {
    return '';
  }
  if (memoryNeed === 'deep') {
    return buildDeepQuery(trimmed);
  }
  if (trimmed.length > INTENT_QUERY_MAX_LENGTH) {
    return '';
  }
  return trimmed;
}

export function buildCandidateSeedQuery(rawQuery: string): string | undefined {
  const trimmed = sanitizeInputText(rawQuery);
  if (!trimmed) {
    return undefined;
  }

  const normalized = trimmed
    .replace(/[^a-z0-9_\u4e00-\u9fff\s]+/gi, ' ')
    .trim();
  if (normalized.includes('项目')) {
    return '项目';
  }
  if (/\bproject\b/i.test(normalized)) {
    return 'project';
  }

  const firstToken = normalized.split(/\s+/g).find((part) => part.length >= 2);
  if (!firstToken) {
    return buildDeepQuery(trimmed) || trimmed.split(/\s+/g).find((part) => part.length >= 2);
  }
  if (
    looksLikeNextStepQuery(firstToken)
    || (looksLikeNextStepQuery(normalized) && /^(what|whats|next|follow)$/i.test(firstToken))
  ) {
    return '下一步';
  }
  if (firstToken.includes('下一步')) {
    return '下一步';
  }
  if (firstToken.includes('决策')) {
    return '决策';
  }
  if (firstToken.includes('阶段')) {
    return '阶段';
  }
  if (firstToken.includes('进展')) {
    return '进展';
  }
  if (firstToken.length > 8 && /^[\u4e00-\u9fff]+$/.test(firstToken)) {
    return firstToken.slice(0, 4);
  }
  return firstToken;
}

export function resolvePositiveInteger(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return fallback;
  }
  return value;
}

export function resolveRecallLimit(value: number | undefined, maxRecall: number): number {
  return Math.min(resolvePositiveInteger(value, DEFAULT_RECALL_LIMIT), maxRecall);
}
