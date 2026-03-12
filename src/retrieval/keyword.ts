import { DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS } from '../constants.js';
import type { MemoryItem, RecallRequest, RetrievalKeywordWeights } from '../types.js';

export interface RankedRecallItem {
  memory: MemoryItem;
  score: number;
  factors: {
    keyword: number;
    recency: number;
    importance: number;
    confidence: number;
    explicitness: number;
    scopeMatch: number;
    typePriority: number;
    lifecyclePriority: number;
  };
  matchedTokens: string[];
}

interface RankKeywordRecallOptions {
  weights?: RetrievalKeywordWeights;
}

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function parseTimestamp(iso: string): number {
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : 0;
}

function recencyScore(updatedAt: string): number {
  const timestamp = parseTimestamp(updatedAt);
  if (timestamp <= 0) {
    return 0.35;
  }

  const ageDays = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
  if (ageDays <= 1) {
    return 1;
  }
  if (ageDays <= 7) {
    return 0.85;
  }
  if (ageDays <= 30) {
    return 0.65;
  }
  if (ageDays <= 90) {
    return 0.45;
  }
  return 0.25;
}

function tokenizeQuery(normalizedQuery: string): string[] {
  if (normalizedQuery.length === 0) {
    return [];
  }

  const tokens = normalizedQuery
    .split(/[\s,.;:!?，。；：！？、/]+/g)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .filter((part) => !/^[a-z0-9]$/i.test(part));

  const uniqueTokens = Array.from(new Set(tokens));
  if (uniqueTokens.length === 0) {
    return [normalizedQuery];
  }

  if (!uniqueTokens.includes(normalizedQuery) && uniqueTokens.length > 1) {
    uniqueTokens.push(normalizedQuery);
  }

  return uniqueTokens;
}

function priorityByIndex(value: string, ordered?: string[]): number {
  if (!ordered || ordered.length === 0) {
    return 0.5;
  }

  const index = ordered.findIndex((item) => item === value);
  if (index < 0) {
    return 0;
  }

  return clamp01(1 - index / ordered.length);
}

function computeScopeMatch(memory: MemoryItem, request: RecallRequest): number {
  if (!request.scope) {
    return 0.5;
  }

  let score = 0.4;
  if (request.scope.userId) {
    score += memory.scope.userId === request.scope.userId ? 0.2 : 0;
  }
  if (request.scope.chatId) {
    score += memory.scope.chatId === request.scope.chatId ? 0.2 : 0;
  }
  if (request.scope.project) {
    score += memory.scope.project === request.scope.project ? 0.15 : 0;
  }
  if (request.scope.global !== undefined) {
    score += memory.scope.global === request.scope.global ? 0.05 : 0;
  }

  return clamp01(score);
}

function keywordFactors(memory: MemoryItem, normalizedQuery: string, queryTokens: string[]) {
  const normalizedContent = normalize(memory.content);
  const normalizedTags = memory.tags.map(normalize);
  const phraseInContent = normalizedQuery.length > 0 && normalizedContent.includes(normalizedQuery);
  const phraseInTags = normalizedQuery.length > 0 && normalizedTags.some((tag) => tag.includes(normalizedQuery));

  if (normalizedQuery.length === 0) {
    return {
      score: 0.45,
      matchedTokens: [] as string[],
      matched: true,
    };
  }

  const matchedTokens = queryTokens.filter((token) => (
    normalizedContent.includes(token)
    || normalizedTags.some((tag) => tag.includes(token))
  ));
  const tokenCoverage = queryTokens.length > 0 ? matchedTokens.length / queryTokens.length : 0;
  const keywordScore = clamp01(
    (phraseInContent ? 0.55 : 0)
    + (phraseInTags ? 0.25 : 0)
    + tokenCoverage * 0.5,
  );

  return {
    score: keywordScore,
    matchedTokens,
    matched: phraseInContent || phraseInTags || matchedTokens.length > 0,
  };
}

function scoreMemory(
  memory: MemoryItem,
  request: RecallRequest,
  normalizedQuery: string,
  queryTokens: string[],
  weights: RetrievalKeywordWeights,
): RankedRecallItem {
  const keyword = keywordFactors(memory, normalizedQuery, queryTokens);
  const factors: RankedRecallItem['factors'] = {
    keyword: keyword.score,
    recency: recencyScore(memory.timestamps.updatedAt),
    importance: clamp01(memory.scores.importance),
    confidence: clamp01(memory.scores.confidence),
    explicitness: clamp01(memory.scores.explicitness),
    scopeMatch: computeScopeMatch(memory, request),
    typePriority: priorityByIndex(memory.type, request.types),
    lifecyclePriority: priorityByIndex(memory.lifecycle, request.lifecycles),
  };

  const score = (
    factors.keyword * weights.keyword
    + factors.recency * weights.recency
    + factors.importance * weights.importance
    + factors.confidence * weights.confidence
    + factors.explicitness * weights.explicitness
    + factors.scopeMatch * weights.scopeMatch
    + factors.typePriority * weights.typePriority
    + factors.lifecyclePriority * weights.lifecyclePriority
  );

  return {
    memory,
    score,
    factors,
    matchedTokens: keyword.matchedTokens,
  };
}

export function rankKeywordRecall(
  memories: MemoryItem[],
  request: RecallRequest,
  options: RankKeywordRecallOptions = {},
): RankedRecallItem[] {
  const weights = options.weights ?? { ...DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS };
  const normalizedQuery = normalize(request.query);
  const queryTokens = tokenizeQuery(normalizedQuery);

  const ranked = memories
    .filter((memory) => keywordFactors(memory, normalizedQuery, queryTokens).matched)
    .map((memory) => scoreMemory(memory, request, normalizedQuery, queryTokens, weights));

  ranked.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    const updatedDelta = right.memory.timestamps.updatedAt.localeCompare(left.memory.timestamps.updatedAt);
    if (updatedDelta !== 0) {
      return updatedDelta;
    }

    return right.memory.id.localeCompare(left.memory.id);
  });

  return ranked;
}

export function keywordRetrieve(memories: MemoryItem[], request: RecallRequest): MemoryItem[] {
  return rankKeywordRecall(memories, request).map((item) => item.memory);
}
