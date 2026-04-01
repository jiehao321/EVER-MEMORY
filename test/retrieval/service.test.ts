import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { RetrievalService } from '../../src/retrieval/service.js';
import { embeddingManager } from '../../src/embedding/manager.js';
import {
  createRetrievalFixture,
  createRetrievalMemory,
  insertMemory,
  type RetrievalTestFixture,
} from './helpers.js';

describe('RetrievalService', () => {
  let fixture: RetrievalTestFixture | undefined;
  let originalIsReady: typeof embeddingManager.isReady;
  let originalEmbed: typeof embeddingManager.embed;

  afterEach(() => {
    if (originalIsReady) {
      embeddingManager.isReady = originalIsReady;
    }
    if (originalEmbed) {
      embeddingManager.embed = originalEmbed;
    }
    fixture?.close();
    fixture = undefined;
    originalIsReady = undefined as never;
    originalEmbed = undefined as never;
  });

  it('defaults to keyword recall and increments retrieval stats for returned items', async () => {
    fixture = createRetrievalFixture();
    const service = new RetrievalService(fixture.memoryRepo);

    await insertMemory(fixture, createRetrievalMemory({
      id: 'service-keyword-exact',
      content: '发布质量门禁必须在上线前完成',
      tags: ['quality-gate'],
    }));
    await insertMemory(fixture, createRetrievalMemory({
      id: 'service-keyword-partial',
      content: '发布流程需要先完成检查',
      tags: ['发布'],
    }));

    const result = await service.recall({
      query: '发布 质量',
      scope: { userId: 'user-1' },
    });

    assert.equal(result.strategyUsed, 'keyword');
    assert.equal(result.total, 2);
    assert.deepEqual(result.items.map((item) => item.id), [
      'service-keyword-exact',
      'service-keyword-partial',
    ]);
    assert.equal(typeof result.items[0]?.metadata?.recallReason, 'string');
    assert.ok((result.items[0]?.metadata?.topFactors?.length ?? 0) > 0);
    assert.equal(fixture.memoryRepo.findById('service-keyword-exact')?.stats.retrievalCount, 1);
    assert.equal(fixture.memoryRepo.findById('service-keyword-partial')?.stats.retrievalCount, 1);
  });

  it('returns empty results for intent-aware recall when memory need is none', async () => {
    fixture = createRetrievalFixture();
    const service = new RetrievalService(fixture.memoryRepo);

    await insertMemory(fixture, createRetrievalMemory({
      id: 'service-intent-none',
      content: '这条记忆不应该被取回',
    }));

    const result = await service.recallForIntent({
      query: '',
      scope: { userId: 'user-1' },
      intent: {
        id: 'intent-none-1',
        createdAt: '2026-03-31T00:00:00.000Z',
        rawText: '',
        intent: { type: 'question', confidence: 0.9 },
        signals: {
          urgency: 'low',
          emotionalTone: 'neutral',
          actionNeed: 'answer',
          memoryNeed: 'none',
          preferenceRelevance: 0,
          correctionSignal: 0,
        },
        retrievalHints: {
          preferredTypes: [],
          preferredScopes: [],
          preferredTimeBias: 'balanced',
        },
        entities: [],
      },
    });

    assert.deepEqual(result, {
      items: [],
      total: 0,
      limit: 0,
    });
  });

  it('surfaces degraded hybrid fallback when semantic search fails', async () => {
    fixture = createRetrievalFixture();
    const service = new RetrievalService(fixture.memoryRepo, undefined, {
      semanticEnabled: true,
      semanticRepo: fixture.semanticRepo,
    });
    originalIsReady = embeddingManager.isReady;
    originalEmbed = embeddingManager.embed;
    (embeddingManager.isReady as typeof embeddingManager.isReady) = () => true;
    (embeddingManager.embed as typeof embeddingManager.embed) = async () => ({
      values: new Float32Array([1, 0]),
      dimensions: 2,
    });

    await insertMemory(fixture, createRetrievalMemory({
      id: 'service-hybrid-fallback',
      content: '发布质量门禁',
    }));
    fixture.semanticRepo.searchByCosine = async () => {
      throw new Error('boom');
    };

    const result = await service.recall({
      query: '质量门禁',
      mode: 'hybrid',
      scope: { userId: 'user-1' },
    });

    assert.equal(result.strategyUsed, 'hybrid');
    assert.equal(result.total, 1);
    assert.equal(result.items[0]?.id, 'service-hybrid-fallback');
    assert.equal(result.degraded, true);
    assert.equal(result.degradedReason, 'semantic_search_failed');
    assert.equal(result.semanticFallback, false);
  });

  it('applies intent weight overrides through recallForIntent', async () => {
    fixture = createRetrievalFixture();
    const service = new RetrievalService(fixture.memoryRepo);

    await insertMemory(fixture, createRetrievalMemory({
      id: 'service-preference-old',
      type: 'preference',
      content: '偏好：发布前先确认',
      timestamps: {
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    }));
    await insertMemory(fixture, createRetrievalMemory({
      id: 'service-constraint-new',
      type: 'constraint',
      content: '约束：发布前先确认',
      timestamps: {
        createdAt: '2026-03-28T00:00:00.000Z',
        updatedAt: '2026-03-28T00:00:00.000Z',
      },
    }));

    const baseline = await service.recall({
      query: '发布前先确认',
      scope: { userId: 'user-1' },
    });
    assert.equal(baseline.items[0]?.id, 'service-constraint-new');

    const intentResult = await service.recallForIntent({
      query: '发布前先确认',
      scope: { userId: 'user-1' },
      intent: {
        id: 'intent-preference-1',
        createdAt: '2026-03-31T00:00:00.000Z',
        rawText: '发布前先确认',
        intent: { type: 'preference', confidence: 0.95 },
        signals: {
          urgency: 'low',
          emotionalTone: 'neutral',
          actionNeed: 'answer',
          memoryNeed: 'targeted',
          preferenceRelevance: 0.95,
          correctionSignal: 0.05,
        },
        retrievalHints: {
          preferredTypes: ['preference', 'constraint'],
          preferredScopes: [],
          preferredTimeBias: 'balanced',
        },
        entities: [],
      },
      limit: 5,
    });

    assert.equal(intentResult.items[0]?.id, 'service-preference-old');
  });

  it('deduplicates normalized duplicate content in the final service output', async () => {
    fixture = createRetrievalFixture();
    const service = new RetrievalService(fixture.memoryRepo);

    await insertMemory(fixture, createRetrievalMemory({
      id: 'service-dup-summary',
      type: 'summary',
      content: '项目状态更新：质量门禁已完成',
    }));
    await insertMemory(fixture, createRetrievalMemory({
      id: 'service-dup-project',
      type: 'project',
      content: '质量门禁已完成',
    }));

    const result = await service.recall({
      query: '质量门禁',
      mode: 'structured',
      scope: { userId: 'user-1' },
      limit: 5,
    });

    assert.equal(result.total, 1);
    assert.equal(
      ['service-dup-summary', 'service-dup-project'].includes(result.items[0]?.id ?? ''),
      true,
    );
  });

  it('returns normalized top factors in item metadata', async () => {
    fixture = createRetrievalFixture();
    const service = new RetrievalService(fixture.memoryRepo);

    await insertMemory(fixture, createRetrievalMemory({
      id: 'service-factors',
      content: '发布质量门禁必须在上线前完成',
      scores: {
        importance: 0.9,
        confidence: 0.8,
        explicitness: 0.7,
      },
    }));

    const result = await service.recall({
      query: '发布 质量 门禁',
      scope: { userId: 'user-1' },
    });

    const topFactors = result.items[0]?.metadata?.topFactors;
    assert.ok(Array.isArray(topFactors));
    assert.ok((topFactors?.length ?? 0) > 0);
    for (const factor of topFactors ?? []) {
      assert.equal(factor.value >= 0, true);
      assert.equal(factor.value <= 1, true);
    }
  });
});
