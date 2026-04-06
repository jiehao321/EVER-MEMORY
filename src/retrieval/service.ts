import {
  DEFAULT_RETRIEVAL_HYBRID_WEIGHTS,
  DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS,
  DEFAULT_SEMANTIC_SIDECAR_MAX_CANDIDATES,
  DEFAULT_SEMANTIC_SIDECAR_MIN_SCORE,
} from '../constants.js';
import type { DebugRepository } from '../storage/debugRepo.js';
import type { MemoryRepository } from '../storage/memoryRepo.js';
import type { RelationRepository } from '../storage/relationRepo.js';
import type { SemanticRepository } from '../storage/semanticRepo.js';
import type { RetrievalFactor } from '../types/feedback.js';
import type {
  RecallForIntentRequest,
  RecallRequest,
  RecallResult,
  RetrievalHybridWeights,
  RetrievalKeywordWeights,
  RetrievalMode,
} from '../types.js';
import { DEFAULT_RECALL_LIMIT } from '../tuning.js';
import { HybridRetrievalStrategy } from './strategies/hybrid.js';
import { KeywordRetrievalStrategy } from './strategies/keyword.js';
import { RetrievalStrategySupport } from './strategies/policy.js';
import { StructuredRetrievalStrategy } from './strategies/structured.js';
import type { RankedStrategyResult, RecallExecutionMeta } from './strategies/support.js';
import {
  resolveRecallLimit,
  resolvePositiveInteger,
} from './strategies/support.js';
import { RetrievalError } from '../errors.js';
import { embeddingManager } from '../embedding/manager.js';

interface RetrievalServiceOptions {
  semanticEnabled?: boolean;
  semanticRepo?: SemanticRepository;
  semanticCandidateLimit?: number;
  semanticMinScore?: number;
  relationRepo?: RelationRepository;
  maxRecall?: number;
  keywordWeights?: Partial<RetrievalKeywordWeights>;
  hybridWeights?: Partial<RetrievalHybridWeights>;
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

function buildTopFactors(entry: RankedStrategyResult['ranked'][number]): RetrievalFactor[] {
  const factors = [
    ['keyword', entry.keywordScore],
    ['semantic', entry.semanticScore],
    ['base', entry.baseScore],
    ['projectPriority', entry.projectPriority],
    ['dataQuality', entry.dataQuality],
  ] as const;

  return factors
    .filter(([, value]) => value > 0)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([name, value]) => ({
      name,
      value: Number(value.toFixed(4)),
    }));
}

function resolveKeywordWeights(
  weights: Partial<RetrievalKeywordWeights> | undefined,
): RetrievalKeywordWeights {
  return normalizeWeights({
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
  }, { ...DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS });
}

function resolveHybridWeights(
  weights: Partial<RetrievalHybridWeights> | undefined,
): RetrievalHybridWeights {
  return normalizeWeights({
    keyword: resolveWeightNumber(weights?.keyword, DEFAULT_RETRIEVAL_HYBRID_WEIGHTS.keyword),
    semantic: resolveWeightNumber(weights?.semantic, DEFAULT_RETRIEVAL_HYBRID_WEIGHTS.semantic),
    base: resolveWeightNumber(weights?.base, DEFAULT_RETRIEVAL_HYBRID_WEIGHTS.base),
  }, { ...DEFAULT_RETRIEVAL_HYBRID_WEIGHTS });
}

function buildRecallReason(entry: RankedStrategyResult['ranked'][number]): string | undefined {
  const topFactors = buildTopFactors(entry);
  if (topFactors.length === 0) {
    return undefined;
  }

  return topFactors
    .map((factor) => `${factor.name}:${factor.value.toFixed(2)}`)
    .join(' + ');
}

export class RetrievalService {
  private readonly semanticEnabled: boolean;
  private readonly maxRecall: number;
  private readonly keywordWeights: RetrievalKeywordWeights;
  private readonly hybridWeights: RetrievalHybridWeights;
  private readonly structuredStrategy: StructuredRetrievalStrategy;
  private readonly keywordStrategy: KeywordRetrievalStrategy;
  private readonly hybridStrategy: HybridRetrievalStrategy;

  constructor(
    private readonly memoryRepo: MemoryRepository,
    private readonly debugRepo?: DebugRepository,
    options: RetrievalServiceOptions = {},
  ) {
    const semanticEnabled = options.semanticEnabled ?? false;
    const semanticRepo = options.semanticRepo;
    const semanticCandidateLimit = options.semanticCandidateLimit ?? DEFAULT_SEMANTIC_SIDECAR_MAX_CANDIDATES;
    const semanticMinScore = options.semanticMinScore ?? DEFAULT_SEMANTIC_SIDECAR_MIN_SCORE;

    this.semanticEnabled = semanticEnabled;
    this.maxRecall = resolvePositiveInteger(options.maxRecall, DEFAULT_RECALL_LIMIT);
    this.keywordWeights = resolveKeywordWeights(options.keywordWeights);
    this.hybridWeights = resolveHybridWeights(options.hybridWeights);

    const support = new RetrievalStrategySupport(memoryRepo, semanticCandidateLimit);
    this.structuredStrategy = new StructuredRetrievalStrategy(
      support,
      this.maxRecall,
      this.keywordWeights,
      semanticEnabled,
      semanticRepo,
    );
    this.keywordStrategy = new KeywordRetrievalStrategy(support, this.keywordWeights, options.relationRepo);
    this.hybridStrategy = new HybridRetrievalStrategy(
      support,
      semanticRepo,
      semanticEnabled,
      semanticCandidateLimit,
      semanticMinScore,
      this.keywordWeights,
      this.hybridWeights,
      options.relationRepo,
    );
  }

  async recall(request: RecallRequest, meta?: RecallExecutionMeta): Promise<RecallResult> {
    try {
      const startTime = Date.now();
      const executionMeta = meta ?? this.structuredStrategy.deriveExecutionMeta(request);
      const requestedMode = request.mode;
      const mode = this.structuredStrategy.resolveMode(request.mode);
      const limit = resolveRecallLimit(request.limit, this.maxRecall);
      const result = await this.rankByMode(mode, request, limit, executionMeta);
      const { top, selectionStats } = this.structuredStrategy.selectTopRanked(result.ranked, limit, executionMeta);
      const topWithReasons = top.map((entry) => ({
        ...entry,
        topFactors: buildTopFactors(entry),
        recallReason: buildRecallReason(entry),
      }));
      const items = topWithReasons.map((entry) => ({
        ...entry.memory,
        metadata: {
          ...(entry.memory.metadata ?? {}),
          recallReason: entry.recallReason,
          topFactors: entry.topFactors,
        },
      }));

      if (items.length > 0) {
        this.memoryRepo.incrementRetrieval(items.map((item) => item.id));
      }

      this.debugRepo?.log('retrieval_executed', undefined, {
        query: request.query,
        requestedMode: requestedMode ?? 'keyword',
        mode,
        fallback: requestedMode === 'hybrid' && mode !== 'hybrid',
        semanticEnabled: this.semanticEnabled,
        semanticHits: result.semanticHitCount,
        embeddingReady: embeddingManager.isReady(),
        degradationReason: result.degradationReason,
        returned: items.length,
        limit,
        maxRecall: this.maxRecall,
        weights: {
          keyword: this.keywordWeights,
          hybrid: this.hybridWeights,
        },
        routeKind: executionMeta.routeKind,
        routeApplied: executionMeta.routeApplied,
        projectOriented: executionMeta.projectOriented,
        routeReason: executionMeta.routeReason,
        routeScore: executionMeta.routeScore,
        routeProjectSignal: executionMeta.routeProjectSignal,
        hasProjectScope: executionMeta.hasProjectScope,
        intentProjectOriented: executionMeta.intentProjectOriented,
        candidates: result.candidates.length,
        candidatePolicy: result.candidatePolicy,
        recallOptimization: selectionStats,
        perfTrace: {
          durationMs: Date.now() - startTime,
          candidateCount: result.candidates.length,
          returnedCount: items.length,
          strategy: mode,
          topScore: topWithReasons[0]?.score ?? 0,
        },
        topScores: topWithReasons.slice(0, 3).map((entry) => ({
          id: entry.memory.id,
          score: Number(entry.score.toFixed(4)),
          keyword: Number(entry.keywordScore.toFixed(3)),
          semantic: Number(entry.semanticScore.toFixed(3)),
          base: Number(entry.baseScore.toFixed(3)),
          projectPriority: Number(entry.projectPriority.toFixed(3)),
          dataQuality: Number(entry.dataQuality.toFixed(3)),
          recallReason: entry.recallReason,
          topFactors: entry.topFactors,
          dataClass: entry.dataClass,
        })),
      });

      // C4: Surface strategy used and semantic fallback info for operators
      const semanticFallback = requestedMode === 'hybrid' && mode !== 'hybrid';
      const nudge = items.length === 0
        ? 'No memories matched. Try broader terms or check if memories exist via evermemory_status.'
        : undefined;
      const degradedReason = result.degradationReason
        ?? (semanticFallback ? 'semantic_disabled' : undefined);
      const degraded = semanticFallback || Boolean(result.degradationReason);

      return {
        items,
        total: items.length,
        limit,
        strategyUsed: mode,
        semanticFallback,
        degraded: degraded || undefined,
        degradedReason,
        nudge,
        meta: {
          degraded: degraded || undefined,
          degradedReason,
        },
      };
    } catch (error) {
      if (error instanceof RetrievalError) {
        throw error;
      }
      throw new RetrievalError('Failed to execute recall.', {
        code: 'RETRIEVAL_EXECUTION_FAILED',
        context: {
          query: request.query,
          requestedMode: request.mode ?? 'keyword',
          limit: request.limit,
        },
        cause: error,
      });
    }
  }

  async recallForIntent(request: RecallForIntentRequest): Promise<RecallResult> {
    try {
      if (request.intent.signals.memoryNeed === 'none') {
        return {
          items: [],
          total: 0,
          limit: request.limit === undefined ? 0 : resolveRecallLimit(request.limit, this.maxRecall),
        };
      }

      const prepared = this.structuredStrategy.prepareIntentRecall(request);
      const recallResult = await this.recall(prepared.request, prepared.meta);
      return recallResult;
    } catch (error) {
      if (error instanceof RetrievalError) {
        throw error;
      }
      throw new RetrievalError('Failed to execute intent-aware recall.', {
        code: 'RETRIEVAL_INTENT_EXECUTION_FAILED',
        context: {
          query: request.query,
          memoryNeed: request.intent.signals.memoryNeed,
          limit: request.limit,
        },
        cause: error,
      });
    }
  }

  private async rankByMode(
    mode: RetrievalMode,
    request: RecallRequest,
    limit: number,
    meta: RecallExecutionMeta,
  ): Promise<RankedStrategyResult> {
    if (mode === 'structured') {
      return this.structuredStrategy.rank(request, limit, meta);
    }
    if (mode === 'keyword') {
      return this.keywordStrategy.rank(request, limit, meta);
    }
    return this.hybridStrategy.rank(request, limit, meta);
  }
}
