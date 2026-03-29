import type { FeedbackRepository } from '../storage/feedbackRepo.js';
import type { RetrievalHybridWeights, RetrievalKeywordWeights } from '../types.js';
import {
  DEFAULT_RETRIEVAL_HYBRID_WEIGHTS,
  DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS,
} from '../constants.js';

const WEIGHT_FLOOR = 0.1;
const WEIGHT_CEILING = 0.9;
const MIN_FEEDBACK_SAMPLES = 20;
const EFFECTIVENESS_THRESHOLD = 0.15;
const ADJUSTMENT_STEP = 0.1;
const KEYWORD_WEIGHT_FLOOR = 0.03;
const KEYWORD_WEIGHT_CEILING = 0.5;
const KEYWORD_ADJUSTMENT_STEP = 0.02;
const FACTOR_EFFECTIVENESS_THRESHOLD = 0.1;
const CACHE_TTL_MS = 60 * 60 * 1000;

interface CachedWeights {
  weights: RetrievalHybridWeights;
  computedAt: number;
}

interface CachedKeywordWeights {
  weights: RetrievalKeywordWeights;
  computedAt: number;
}

const KEYWORD_FACTOR_ALIASES: Record<keyof RetrievalKeywordWeights, readonly string[]> = {
  keyword: ['keyword', 'keywordScore'],
  recency: ['recency', 'freshness'],
  importance: ['importance'],
  confidence: ['confidence'],
  explicitness: ['explicitness'],
  scopeMatch: ['scopeMatch', 'scope', 'scopeScore'],
  typePriority: ['typePriority', 'type', 'typeScore'],
  lifecyclePriority: ['lifecyclePriority', 'lifecycle', 'lifecycleScore'],
};

export class AdaptiveWeightsService {
  private cache: CachedWeights | null = null;
  private keywordCache: CachedKeywordWeights | null = null;

  constructor(private readonly feedbackRepo: FeedbackRepository) {}

  /**
   * Get adapted hybrid weights based on feedback history.
   * Returns default weights if insufficient data.
   * Cached for 1 hour.
   */
  getAdaptedWeights(): RetrievalHybridWeights {
    if (this.cache && (Date.now() - this.cache.computedAt) < CACHE_TTL_MS) {
      return this.cache.weights;
    }

    const weights = this.computeAdaptedWeights();
    this.cache = {
      weights,
      computedAt: Date.now(),
    };
    return weights;
  }

  /**
   * Get adapted keyword weights based on factor-level feedback history.
   * Returns default weights if insufficient data.
   * Cached for 1 hour independently from hybrid weights.
   */
  getAdaptedKeywordWeights(): RetrievalKeywordWeights {
    if (this.keywordCache && (Date.now() - this.keywordCache.computedAt) < CACHE_TTL_MS) {
      return this.keywordCache.weights;
    }

    const weights = this.computeAdaptedKeywordWeights();
    this.keywordCache = {
      weights,
      computedAt: Date.now(),
    };
    return weights;
  }

  /** Clear the cache (for testing or forced recompute) */
  clearCache(): void {
    this.cache = null;
  }

  /** Clear the keyword cache (for testing or forced recompute) */
  clearKeywordCache(): void {
    this.keywordCache = null;
  }

  private computeAdaptedWeights(): RetrievalHybridWeights {
    const aggregations = this.feedbackRepo.aggregateByStrategy(30);
    const totalSamples = aggregations.reduce(
      (sum, aggregation) => sum + aggregation.totalUsed + aggregation.totalIgnored,
      0,
    );

    if (totalSamples < MIN_FEEDBACK_SAMPLES) {
      return { ...DEFAULT_RETRIEVAL_HYBRID_WEIGHTS };
    }

    const hybridAggregation = aggregations.find((aggregation) => aggregation.strategy === 'hybrid');
    const keywordAggregation = aggregations.find((aggregation) => aggregation.strategy === 'keyword');

    const hybridEffectiveness = hybridAggregation && !Number.isNaN(hybridAggregation.effectiveness)
      ? hybridAggregation.effectiveness
      : 0.5;
    const keywordEffectiveness = keywordAggregation && !Number.isNaN(keywordAggregation.effectiveness)
      ? keywordAggregation.effectiveness
      : 0.5;

    let weights: RetrievalHybridWeights = { ...DEFAULT_RETRIEVAL_HYBRID_WEIGHTS };

    if (hybridEffectiveness - keywordEffectiveness > EFFECTIVENESS_THRESHOLD) {
      weights = {
        keyword: clamp(weights.keyword - ADJUSTMENT_STEP, WEIGHT_FLOOR, WEIGHT_CEILING),
        semantic: clamp(weights.semantic + ADJUSTMENT_STEP, WEIGHT_FLOOR, WEIGHT_CEILING),
        base: weights.base,
      };
    } else if (keywordEffectiveness - hybridEffectiveness > EFFECTIVENESS_THRESHOLD) {
      weights = {
        keyword: clamp(weights.keyword + ADJUSTMENT_STEP, WEIGHT_FLOOR, WEIGHT_CEILING),
        semantic: clamp(weights.semantic - ADJUSTMENT_STEP, WEIGHT_FLOOR, WEIGHT_CEILING),
        base: weights.base,
      };
    }

    return normalizeWeights(weights);
  }

  private computeAdaptedKeywordWeights(): RetrievalKeywordWeights {
    const aggregations = this.feedbackRepo.aggregateFactorEffectiveness(30);
    const totalSamples = aggregations.reduce(
      (max, aggregation) => Math.max(max, aggregation.usedCount + aggregation.ignoredCount),
      0,
    );

    if (totalSamples < MIN_FEEDBACK_SAMPLES) {
      return { ...DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS };
    }

    const aggregationByFactor = new Map(
      aggregations.map((aggregation) => [aggregation.factor, aggregation] as const),
    );
    const weights: RetrievalKeywordWeights = { ...DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS };

    for (const key of Object.keys(KEYWORD_FACTOR_ALIASES) as Array<keyof RetrievalKeywordWeights>) {
      const aggregation = KEYWORD_FACTOR_ALIASES[key]
        .map((alias) => aggregationByFactor.get(alias))
        .find((value) => value !== undefined);
      if (!aggregation || Number.isNaN(aggregation.usedAverage) || Number.isNaN(aggregation.ignoredAverage)) {
        continue;
      }

      const difference = aggregation.usedAverage - aggregation.ignoredAverage;
      if (difference > FACTOR_EFFECTIVENESS_THRESHOLD) {
        weights[key] = clamp(
          weights[key] + KEYWORD_ADJUSTMENT_STEP,
          KEYWORD_WEIGHT_FLOOR,
          KEYWORD_WEIGHT_CEILING,
        );
      } else if (difference < -FACTOR_EFFECTIVENESS_THRESHOLD) {
        weights[key] = clamp(
          weights[key] - KEYWORD_ADJUSTMENT_STEP,
          KEYWORD_WEIGHT_FLOOR,
          KEYWORD_WEIGHT_CEILING,
        );
      }
    }

    return normalizeKeywordWeights(weights);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeWeights(weights: RetrievalHybridWeights): RetrievalHybridWeights {
  const total = weights.keyword + weights.semantic + weights.base;
  if (total <= 0) {
    return { ...DEFAULT_RETRIEVAL_HYBRID_WEIGHTS };
  }

  return {
    keyword: weights.keyword / total,
    semantic: weights.semantic / total,
    base: weights.base / total,
  };
}

function normalizeKeywordWeights(weights: RetrievalKeywordWeights): RetrievalKeywordWeights {
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return { ...DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS };
  }

  return {
    keyword: weights.keyword / total,
    recency: weights.recency / total,
    importance: weights.importance / total,
    confidence: weights.confidence / total,
    explicitness: weights.explicitness / total,
    scopeMatch: weights.scopeMatch / total,
    typePriority: weights.typePriority / total,
    lifecyclePriority: weights.lifecyclePriority / total,
  };
}
