import type { FeedbackRepository } from '../storage/feedbackRepo.js';
import type { RetrievalHybridWeights } from '../types.js';
import { DEFAULT_RETRIEVAL_HYBRID_WEIGHTS } from '../constants.js';

const WEIGHT_FLOOR = 0.1;
const WEIGHT_CEILING = 0.9;
const MIN_FEEDBACK_SAMPLES = 20;
const EFFECTIVENESS_THRESHOLD = 0.15;
const ADJUSTMENT_STEP = 0.1;
const CACHE_TTL_MS = 60 * 60 * 1000;

interface CachedWeights {
  weights: RetrievalHybridWeights;
  computedAt: number;
}

export class AdaptiveWeightsService {
  private cache: CachedWeights | null = null;

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

  /** Clear the cache (for testing or forced recompute) */
  clearCache(): void {
    this.cache = null;
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
