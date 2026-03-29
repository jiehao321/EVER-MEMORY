import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS } from '../../src/constants.js';
import { AdaptiveWeightsService } from '../../src/retrieval/adaptiveWeights.js';
import type { RetrievalFactorAggregation } from '../../src/types/feedback.js';

class FeedbackRepoStub {
  strategyCalls = 0;
  factorCalls = 0;

  constructor(
    private readonly strategyAggregations: Array<{
      strategy: string;
      totalUsed: number;
      totalIgnored: number;
      totalUnknown: number;
      effectiveness: number;
    }> = [],
    private readonly factorAggregations: RetrievalFactorAggregation[] = [],
  ) {}

  aggregateByStrategy(): Array<{
    strategy: string;
    totalUsed: number;
    totalIgnored: number;
    totalUnknown: number;
    effectiveness: number;
  }> {
    this.strategyCalls += 1;
    return this.strategyAggregations;
  }

  aggregateFactorEffectiveness(): RetrievalFactorAggregation[] {
    this.factorCalls += 1;
    return this.factorAggregations;
  }
}

describe('AdaptiveWeightsService keyword adaptation', () => {
  it('returns default keyword weights when feedback samples are insufficient', () => {
    const repo = new FeedbackRepoStub([], [
      {
        factor: 'keywordScore',
        usedAverage: 0.9,
        ignoredAverage: 0.2,
        usedCount: 10,
        ignoredCount: 5,
      },
    ]);
    const service = new AdaptiveWeightsService(repo as never);

    const weights = service.getAdaptedKeywordWeights();

    assert.deepEqual(weights, { ...DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS });
    assert.equal(repo.factorCalls, 1);
  });

  it('adjusts keyword weights when factor effectiveness diverges materially', () => {
    const repo = new FeedbackRepoStub([], [
      {
        factor: 'keywordScore',
        usedAverage: 0.8,
        ignoredAverage: 0.5,
        usedCount: 12,
        ignoredCount: 12,
      },
      {
        factor: 'freshness',
        usedAverage: 0.2,
        ignoredAverage: 0.4,
        usedCount: 12,
        ignoredCount: 12,
      },
    ]);
    const service = new AdaptiveWeightsService(repo as never);

    const weights = service.getAdaptedKeywordWeights();

    assert.ok(weights.keyword > DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS.keyword);
    assert.ok(weights.recency < DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS.recency);
    assert.equal(
      Number((weights.keyword + weights.recency + weights.importance + weights.confidence
        + weights.explicitness + weights.scopeMatch + weights.typePriority
        + weights.lifecyclePriority).toFixed(6)),
      1,
    );
  });

  it('applies floor and ceiling limits before normalization', () => {
    const repo = new FeedbackRepoStub([], [
      {
        factor: 'keywordScore',
        usedAverage: 0.9,
        ignoredAverage: 0.1,
        usedCount: 15,
        ignoredCount: 15,
      },
      {
        factor: 'lifecyclePriority',
        usedAverage: 0.05,
        ignoredAverage: 0.3,
        usedCount: 15,
        ignoredCount: 15,
      },
    ]);
    const service = new AdaptiveWeightsService(repo as never);

    const weights = service.getAdaptedKeywordWeights();

    assert.ok(weights.keyword < 0.5);
    assert.ok(weights.lifecyclePriority > 0);
    assert.equal(
      Number((weights.keyword + weights.recency + weights.importance + weights.confidence
        + weights.explicitness + weights.scopeMatch + weights.typePriority
        + weights.lifecyclePriority).toFixed(6)),
      1,
    );
  });

  it('caches keyword weights independently and supports clearing keyword cache', () => {
    const repo = new FeedbackRepoStub(
      [
        {
          strategy: 'hybrid',
          totalUsed: 10,
          totalIgnored: 10,
          totalUnknown: 0,
          effectiveness: 0.6,
        },
        {
          strategy: 'keyword',
          totalUsed: 10,
          totalIgnored: 10,
          totalUnknown: 0,
          effectiveness: 0.4,
        },
      ],
      [
        {
          factor: 'keywordScore',
          usedAverage: 0.8,
          ignoredAverage: 0.5,
          usedCount: 12,
          ignoredCount: 12,
        },
      ],
    );
    const service = new AdaptiveWeightsService(repo as never);

    const firstKeywordWeights = service.getAdaptedKeywordWeights();
    const secondKeywordWeights = service.getAdaptedKeywordWeights();
    service.getAdaptedWeights();
    service.clearKeywordCache();
    const thirdKeywordWeights = service.getAdaptedKeywordWeights();

    assert.equal(repo.factorCalls, 2);
    assert.equal(repo.strategyCalls, 1);
    assert.strictEqual(firstKeywordWeights, secondKeywordWeights);
    assert.notStrictEqual(secondKeywordWeights, thirdKeywordWeights);
  });
});
