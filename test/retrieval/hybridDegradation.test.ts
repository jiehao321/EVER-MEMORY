import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { HybridRetrievalStrategy } from '../../src/retrieval/strategies/hybrid.js';
import { embeddingManager } from '../../src/embedding/manager.js';
import { DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS } from '../../src/constants.js';
import {
  createExecutionMeta,
  createRetrievalFixture,
  createRetrievalMemory,
  insertMemory,
  type RetrievalTestFixture,
} from './helpers.js';

describe('HybridRetrievalStrategy degradation', () => {
  let fixture: RetrievalTestFixture | undefined;
  let originalIsReady: typeof embeddingManager.isReady;

  afterEach(() => {
    if (originalIsReady) {
      embeddingManager.isReady = originalIsReady;
    }
    fixture?.close();
    fixture = undefined;
  });

  function createStrategy(semanticEnabled = true) {
    if (!fixture) {
      throw new Error('fixture not initialized');
    }
    return new HybridRetrievalStrategy(
      fixture.support,
      fixture.semanticRepo,
      semanticEnabled,
      10,
      0.15,
      { ...DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS },
      { keyword: 0.5, semantic: 0.35, base: 0.15 },
    );
  }

  it('reports embedding_not_ready when embedding manager is not ready', async () => {
    fixture = createRetrievalFixture();
    originalIsReady = embeddingManager.isReady;
    (embeddingManager.isReady as typeof embeddingManager.isReady) = () => false;

    await insertMemory(fixture, createRetrievalMemory({ id: 'deg-emb-1', content: '降级测试内容' }));

    const strategy = createStrategy();
    const result = await strategy.rank(
      { query: '降级测试', scope: { userId: 'user-1' } },
      5,
      createExecutionMeta(),
    );

    assert.equal(result.degradationReason, 'embedding_not_ready');
  });

  it('reports empty_query when query is empty', async () => {
    fixture = createRetrievalFixture();
    originalIsReady = embeddingManager.isReady;
    (embeddingManager.isReady as typeof embeddingManager.isReady) = () => true;

    await insertMemory(fixture, createRetrievalMemory({ id: 'deg-empty-1', content: '空查询降级测试' }));

    const strategy = createStrategy();
    const result = await strategy.rank(
      { query: '', scope: { userId: 'user-1' } },
      5,
      createExecutionMeta(),
    );

    assert.equal(result.degradationReason, 'empty_query');
  });

  it('reports semantic_disabled when semantic is turned off', async () => {
    fixture = createRetrievalFixture();
    originalIsReady = embeddingManager.isReady;
    (embeddingManager.isReady as typeof embeddingManager.isReady) = () => true;

    await insertMemory(fixture, createRetrievalMemory({ id: 'deg-disabled-1', content: '语义禁用降级测试' }));

    const strategy = createStrategy(false);
    const result = await strategy.rank(
      { query: '语义禁用', scope: { userId: 'user-1' } },
      5,
      createExecutionMeta(),
    );

    assert.equal(result.degradationReason, 'semantic_disabled');
  });
});
