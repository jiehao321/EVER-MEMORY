import {
  DEFAULT_RETRIEVAL_HYBRID_WEIGHTS,
  DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS,
} from '../constants.js';
import type { DebugRepository } from '../storage/debugRepo.js';
import type { MemoryRepository } from '../storage/memoryRepo.js';
import type { SemanticRepository } from '../storage/semanticRepo.js';
import type {
  MemoryItem,
  RecallForIntentRequest,
  RecallRequest,
  RecallResult,
  RetrievalHybridWeights,
  RetrievalKeywordWeights,
  RetrievalMode,
} from '../types.js';
import { rankKeywordRecall } from './keyword.js';

interface RetrievalServiceOptions {
  semanticEnabled?: boolean;
  semanticRepo?: SemanticRepository;
  semanticCandidateLimit?: number;
  semanticMinScore?: number;
  maxRecall?: number;
  keywordWeights?: Partial<RetrievalKeywordWeights>;
  hybridWeights?: Partial<RetrievalHybridWeights>;
}

interface ScoredRecallItem {
  memory: MemoryItem;
  score: number;
  keywordScore: number;
  semanticScore: number;
  baseScore: number;
}

const DEFAULT_RECALL_LIMIT = 8;

const DEEP_QUERY_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'then', 'into', 'about', 'please', 'help',
  '之前', '上次', '一下', '继续', '我们', '你们', '这个', '那个', '请',
  '结合', '推进', '下一', '一步', '保持', '并且', '然后',
]);

const DEEP_QUERY_PRIORITY_TERMS = [
  '项目', '计划', '里程碑', '阶段', '任务', '约束', '决策', '风险', '质量', '回滚', '门禁',
  'project', 'plan', 'milestone', 'phase', 'task', 'constraint', 'decision', 'risk', 'quality', 'rollback',
] as const;

function sanitizeInputText(rawText: string): string {
  return rawText
    .replace(/^\[[^\]]+\]\s*/u, '')
    .trim();
}

function isNoisyNumericToken(token: string): boolean {
  if (!token) {
    return true;
  }
  if (/^\d+$/.test(token)) {
    return true;
  }
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(token)) {
    return true;
  }
  if (/^\d{1,2}:\d{2}$/.test(token)) {
    return true;
  }
  return false;
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

  const rawTerms = normalized.split(/\s+/g).filter((term) => term.length > 0);
  const terms: string[] = [];
  for (const rawTerm of rawTerms) {
    if (isNoisyNumericToken(rawTerm)) {
      continue;
    }

    if (DEEP_QUERY_STOPWORDS.has(rawTerm)) {
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
    if (uniqueTerms.length >= 6) {
      break;
    }
  }

  if (uniqueTerms.length === 0) {
    return sanitizeInputText(rawText).slice(0, 48);
  }

  return uniqueTerms.sort((left, right) => right.length - left.length)[0] ?? sanitizeInputText(rawText).slice(0, 48);
}

function pickIntentQuery(rawText: string, memoryNeed: RecallForIntentRequest['intent']['signals']['memoryNeed']): string {
  const trimmed = sanitizeInputText(rawText);
  if (!trimmed) {
    return '';
  }

  if (memoryNeed === 'deep') {
    return buildDeepQuery(trimmed);
  }

  if (trimmed.length > 24) {
    return '';
  }

  return trimmed;
}

function resolvePositiveInteger(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return fallback;
  }
  return value;
}

function resolveRecallLimit(value: number | undefined, maxRecall: number): number {
  const requested = resolvePositiveInteger(value, DEFAULT_RECALL_LIMIT);
  return Math.min(requested, maxRecall);
}

function resolveWeightNumber(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    return fallback;
  }
  return value;
}

function normalizeWeights<T extends Record<string, number>>(weights: T, fallback: T): T {
  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) {
    return { ...fallback };
  }

  return Object.fromEntries(
    Object.entries(weights).map(([key, weight]) => [key, weight / total]),
  ) as T;
}

function resolveKeywordWeights(
  weights: Partial<RetrievalKeywordWeights> | undefined,
): RetrievalKeywordWeights {
  const merged = {
    keyword: resolveWeightNumber(weights?.keyword, DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS.keyword),
    recency: resolveWeightNumber(weights?.recency, DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS.recency),
    importance: resolveWeightNumber(weights?.importance, DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS.importance),
    confidence: resolveWeightNumber(weights?.confidence, DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS.confidence),
    explicitness: resolveWeightNumber(weights?.explicitness, DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS.explicitness),
    scopeMatch: resolveWeightNumber(weights?.scopeMatch, DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS.scopeMatch),
    typePriority: resolveWeightNumber(weights?.typePriority, DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS.typePriority),
    lifecyclePriority: resolveWeightNumber(
      weights?.lifecyclePriority,
      DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS.lifecyclePriority,
    ),
  };

  return normalizeWeights(merged, { ...DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS });
}

function resolveHybridWeights(weights: Partial<RetrievalHybridWeights> | undefined): RetrievalHybridWeights {
  const merged = {
    keyword: resolveWeightNumber(weights?.keyword, DEFAULT_RETRIEVAL_HYBRID_WEIGHTS.keyword),
    semantic: resolveWeightNumber(weights?.semantic, DEFAULT_RETRIEVAL_HYBRID_WEIGHTS.semantic),
    base: resolveWeightNumber(weights?.base, DEFAULT_RETRIEVAL_HYBRID_WEIGHTS.base),
  };

  return normalizeWeights(merged, { ...DEFAULT_RETRIEVAL_HYBRID_WEIGHTS });
}

export class RetrievalService {
  private readonly semanticEnabled: boolean;
  private readonly semanticRepo?: SemanticRepository;
  private readonly semanticCandidateLimit: number;
  private readonly semanticMinScore: number;
  private readonly maxRecall: number;
  private readonly keywordWeights: RetrievalKeywordWeights;
  private readonly hybridWeights: RetrievalHybridWeights;

  constructor(
    private readonly memoryRepo: MemoryRepository,
    private readonly debugRepo?: DebugRepository,
    options: RetrievalServiceOptions = {},
  ) {
    this.semanticEnabled = options.semanticEnabled ?? false;
    this.semanticRepo = options.semanticRepo;
    this.semanticCandidateLimit = options.semanticCandidateLimit ?? 200;
    this.semanticMinScore = options.semanticMinScore ?? 0.15;
    this.maxRecall = resolvePositiveInteger(options.maxRecall, DEFAULT_RECALL_LIMIT);
    this.keywordWeights = resolveKeywordWeights(options.keywordWeights);
    this.hybridWeights = resolveHybridWeights(options.hybridWeights);
  }

  recall(request: RecallRequest): RecallResult {
    const requestedMode = request.mode;
    const mode = this.resolveMode(request.mode);
    const limit = resolveRecallLimit(request.limit, this.maxRecall);
    const { ranked, candidates, semanticHitCount } = this.rankByMode(mode, request, limit);
    const top = ranked.slice(0, limit);
    const items = top.map((entry) => entry.memory);
    if (items.length > 0) {
      this.memoryRepo.incrementRetrieval(items.map((item) => item.id));
    }

    this.debugRepo?.log('retrieval_executed', undefined, {
      query: request.query,
      requestedMode: requestedMode ?? 'keyword',
      mode,
      fallback: requestedMode === 'hybrid' && mode !== 'hybrid',
      semanticEnabled: this.semanticEnabled,
      semanticHits: semanticHitCount,
      returned: items.length,
      limit,
      maxRecall: this.maxRecall,
      weights: {
        keyword: this.keywordWeights,
        hybrid: this.hybridWeights,
      },
      candidates: candidates.length,
      topScores: top.slice(0, 3).map((entry) => ({
        id: entry.memory.id,
        score: Number(entry.score.toFixed(4)),
        keyword: Number(entry.keywordScore.toFixed(3)),
        semantic: Number(entry.semanticScore.toFixed(3)),
        base: Number(entry.baseScore.toFixed(3)),
      })),
    });

    return {
      items,
      total: items.length,
      limit,
    };
  }

  recallForIntent(request: RecallForIntentRequest): RecallResult {
    const memoryNeed = request.intent.signals.memoryNeed;
    if (memoryNeed === 'none') {
      return {
        items: [],
        total: 0,
        limit: request.limit === undefined ? 0 : resolveRecallLimit(request.limit, this.maxRecall),
      };
    }

    const hintedTypes = request.intent.retrievalHints.preferredTypes;
    const preferredTypes = hintedTypes.length > 0 ? hintedTypes : undefined;

    const limit = (() => {
      const requested = resolvePositiveInteger(request.limit, DEFAULT_RECALL_LIMIT);
      const byNeed = (() => {
        if (memoryNeed === 'light') {
          return Math.min(requested, 4);
        }
        if (memoryNeed === 'targeted') {
          return Math.max(4, Math.min(requested, 8));
        }
        return Math.max(8, Math.min(requested, 12));
      })();

      return Math.min(byNeed, this.maxRecall);
    })();

    const lifecycles = memoryNeed === 'deep'
      ? ['semantic', 'episodic'] as const
      : memoryNeed === 'targeted'
        ? ['semantic'] as const
        : undefined;
    const mode: RetrievalMode = request.mode
      ?? (memoryNeed === 'deep' ? 'hybrid' : 'keyword');

    return this.recall({
      query: pickIntentQuery(request.query?.trim() || request.intent.rawText, memoryNeed),
      scope: request.scope,
      types: preferredTypes,
      lifecycles: lifecycles ? [...lifecycles] : undefined,
      mode,
      limit,
    });
  }

  private resolveMode(mode: RetrievalMode | undefined): RetrievalMode {
    if (!mode) {
      return 'keyword';
    }

    if (mode === 'hybrid' && (!this.semanticEnabled || !this.semanticRepo)) {
      return 'keyword';
    }

    return mode;
  }

  private loadCandidates(request: RecallRequest, limit: number, queryEnabled: boolean): MemoryItem[] {
    const candidateLimit = queryEnabled
      ? Math.max(limit * 5, limit)
      : Math.max(limit * 8, this.semanticCandidateLimit);

    return this.memoryRepo.search({
      query: queryEnabled ? request.query : undefined,
      scope: request.scope,
      types: request.types,
      lifecycles: request.lifecycles,
      activeOnly: true,
      archived: false,
      limit: candidateLimit,
    });
  }

  private rankByMode(
    mode: RetrievalMode,
    request: RecallRequest,
    limit: number,
  ): { ranked: ScoredRecallItem[]; candidates: MemoryItem[]; semanticHitCount: number } {
    if (mode === 'structured') {
      const candidates = this.loadCandidates(request, limit, false);
      const ranked = rankKeywordRecall(
        candidates,
        { ...request, query: '' },
        { weights: this.keywordWeights },
      ).map((entry) => ({
        memory: entry.memory,
        score: entry.score,
        keywordScore: 0,
        semanticScore: 0,
        baseScore: entry.score,
      }));

      return {
        ranked,
        candidates,
        semanticHitCount: 0,
      };
    }

    if (mode === 'keyword') {
      const candidates = this.loadCandidates(request, limit, true);
      const ranked = rankKeywordRecall(candidates, request, { weights: this.keywordWeights }).map((entry) => ({
        memory: entry.memory,
        score: entry.score,
        keywordScore: entry.factors.keyword,
        semanticScore: 0,
        baseScore: entry.score,
      }));

      return {
        ranked,
        candidates,
        semanticHitCount: 0,
      };
    }

    return this.rankHybrid(request, limit);
  }

  private rankHybrid(
    request: RecallRequest,
    limit: number,
  ): { ranked: ScoredRecallItem[]; candidates: MemoryItem[]; semanticHitCount: number } {
    const candidates = this.loadCandidates(request, limit, false);
    const candidateMap = new Map(candidates.map((item) => [item.id, item]));

    const keywordRanked = rankKeywordRecall(candidates, request, { weights: this.keywordWeights });
    const baseRanked = rankKeywordRecall(candidates, { ...request, query: '' }, { weights: this.keywordWeights });
    const keywordScoreById = new Map(keywordRanked.map((entry) => [entry.memory.id, entry.score]));
    const baseScoreById = new Map(baseRanked.map((entry) => [entry.memory.id, entry.score]));
    const maxKeywordScore = keywordRanked[0]?.score && keywordRanked[0].score > 0
      ? keywordRanked[0].score
      : 1;
    const maxBaseScore = baseRanked[0]?.score && baseRanked[0].score > 0
      ? baseRanked[0].score
      : 1;

    const semanticScoreById = new Map<string, number>();
    if (this.semanticEnabled && this.semanticRepo && request.query.trim().length > 0) {
      const semanticHits = this.semanticRepo.search(request.query, {
        limit: this.semanticCandidateLimit,
        candidateLimit: this.semanticCandidateLimit,
        minScore: this.semanticMinScore,
      });

      for (const hit of semanticHits) {
        if (candidateMap.has(hit.memoryId)) {
          semanticScoreById.set(hit.memoryId, hit.score);
        }
      }
    }

    const selectedIds = new Set<string>([
      ...keywordScoreById.keys(),
      ...semanticScoreById.keys(),
    ]);

    const ranked: ScoredRecallItem[] = [];
    for (const id of selectedIds) {
      const memory = candidateMap.get(id);
      if (!memory) {
        continue;
      }

      const keywordScore = (keywordScoreById.get(id) ?? 0) / maxKeywordScore;
      const semanticScore = semanticScoreById.get(id) ?? 0;
      const baseScore = (baseScoreById.get(id) ?? 0) / maxBaseScore;
      const score = (
        keywordScore * this.hybridWeights.keyword
        + semanticScore * this.hybridWeights.semantic
        + baseScore * this.hybridWeights.base
      );

      ranked.push({
        memory,
        score,
        keywordScore,
        semanticScore,
        baseScore,
      });
    }

    ranked.sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return right.memory.timestamps.updatedAt.localeCompare(left.memory.timestamps.updatedAt);
    });

    return {
      ranked,
      candidates,
      semanticHitCount: semanticScoreById.size,
    };
  }
}
