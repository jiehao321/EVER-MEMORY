import { DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS } from '../../constants.js';
import {
  KEYWORD_EMPTY_QUERY_SCORE,
  KEYWORD_PHRASE_IN_CONTENT_SCORE,
  KEYWORD_PHRASE_IN_TAGS_SCORE,
  KEYWORD_RECENCY_BRACKETS,
  KEYWORD_SCOPE_BASE_SCORE,
  KEYWORD_SCOPE_CHAT_BONUS,
  KEYWORD_SCOPE_GLOBAL_BONUS,
  KEYWORD_SCOPE_NO_REQUEST,
  KEYWORD_SCOPE_PROJECT_BONUS,
  KEYWORD_SCOPE_USER_BONUS,
  KEYWORD_TOKEN_COVERAGE_WEIGHT,
} from '../../tuning.js';
import type { MemoryItem, RecallRequest, RetrievalKeywordWeights } from '../../types.js';
import type { RankedStrategyResult, RecallExecutionMeta, ScoredRecallItem } from './support.js';
import { RetrievalStrategySupport } from './policy.js';

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

function recencyScore(updatedAt: string): number {
  const timestamp = Date.parse(updatedAt);
  if (!Number.isFinite(timestamp)) {
    return KEYWORD_RECENCY_BRACKETS.unknownScore;
  }

  const ageDays = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
  if (ageDays <= 1) {
    return KEYWORD_RECENCY_BRACKETS.day1Score;
  }
  if (ageDays <= 7) {
    return KEYWORD_RECENCY_BRACKETS.day7Score;
  }
  if (ageDays <= 30) {
    return KEYWORD_RECENCY_BRACKETS.day30Score;
  }
  if (ageDays <= 90) {
    return KEYWORD_RECENCY_BRACKETS.day90Score;
  }
  return KEYWORD_RECENCY_BRACKETS.olderScore;
}

function tokenizeQuery(normalizedQuery: string): string[] {
  if (normalizedQuery.length === 0) {
    return [];
  }

  const uniqueTokens = Array.from(new Set(
    normalizedQuery
      .split(/[\s,.;:!?，。；：！？、/]+/g)
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .filter((part) => !/^[a-z0-9]$/i.test(part)),
  ));

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
    return KEYWORD_SCOPE_NO_REQUEST;
  }
  const index = ordered.findIndex((item) => item === value);
  return index < 0 ? 0 : clamp01(1 - index / ordered.length);
}

function computeScopeMatch(memory: MemoryItem, request: RecallRequest): number {
  if (!request.scope) {
    return KEYWORD_SCOPE_NO_REQUEST;
  }
  let score = KEYWORD_SCOPE_BASE_SCORE;
  if (request.scope.userId) {
    score += memory.scope.userId === request.scope.userId ? KEYWORD_SCOPE_USER_BONUS : 0;
  }
  if (request.scope.chatId) {
    score += memory.scope.chatId === request.scope.chatId ? KEYWORD_SCOPE_CHAT_BONUS : 0;
  }
  if (request.scope.project) {
    score += memory.scope.project === request.scope.project ? KEYWORD_SCOPE_PROJECT_BONUS : 0;
  }
  if (request.scope.global !== undefined) {
    score += memory.scope.global === request.scope.global ? KEYWORD_SCOPE_GLOBAL_BONUS : 0;
  }
  return clamp01(score);
}

function keywordFactors(memory: MemoryItem, normalizedQuery: string, queryTokens: string[]) {
  const normalizedContent = normalize(memory.content);
  const normalizedTags = memory.tags.map(normalize);
  if (normalizedQuery.length === 0) {
    return {
      score: KEYWORD_EMPTY_QUERY_SCORE,
      matchedTokens: [] as string[],
      matched: true,
    };
  }

  const phraseInContent = normalizedContent.includes(normalizedQuery);
  const phraseInTags = normalizedTags.some((tag) => tag.includes(normalizedQuery));
  const matchedTokens = queryTokens.filter((token) => (
    normalizedContent.includes(token)
    || normalizedTags.some((tag) => tag.includes(token))
  ));
  const tokenCoverage = queryTokens.length > 0 ? matchedTokens.length / queryTokens.length : 0;
  const score = clamp01(
    (phraseInContent ? KEYWORD_PHRASE_IN_CONTENT_SCORE : 0)
    + (phraseInTags ? KEYWORD_PHRASE_IN_TAGS_SCORE : 0)
    + tokenCoverage * KEYWORD_TOKEN_COVERAGE_WEIGHT,
  );

  return {
    score,
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

function toStrategyItem(
  entry: RankedRecallItem,
  support: RetrievalStrategySupport,
  meta: RecallExecutionMeta,
): ScoredRecallItem {
  const policyScore = support.applyRecallPolicyScore(entry.memory, entry.score, meta);
  return {
    memory: entry.memory,
    score: policyScore.score,
    keywordScore: entry.factors.keyword,
    semanticScore: 0,
    baseScore: entry.score,
    projectPriority: policyScore.projectPriority,
    dataQuality: policyScore.dataQuality,
    dataClass: policyScore.dataClass,
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

export class KeywordRetrievalStrategy {
  constructor(
    private readonly support: RetrievalStrategySupport,
    private readonly keywordWeights: RetrievalKeywordWeights,
  ) {}

  rank(
    request: RecallRequest,
    limit: number,
    meta: RecallExecutionMeta,
  ): RankedStrategyResult {
    const loaded = this.support.loadCandidates(request, limit, true, meta);
    const candidateResult = this.support.applyCandidatePolicy(loaded, limit, meta);
    return {
      ranked: rankKeywordRecall(candidateResult.candidates, request, {
        weights: this.keywordWeights,
      }).map((entry) => toStrategyItem(entry, this.support, meta)),
      candidates: candidateResult.candidates,
      semanticHitCount: 0,
      candidatePolicy: candidateResult.stats,
    };
  }
}
