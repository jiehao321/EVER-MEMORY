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

describe('HybridRetrievalStrategy', () => {
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
  });

  function createStrategy(hybridWeights = { keyword: 0.5, semantic: 0.35, base: 0.15 }) {
    if (!fixture) {
      throw new Error('fixture not initialized');
    }
    return new HybridRetrievalStrategy(
      fixture.support,
      fixture.semanticRepo,
      true,
      10,
      0.15,
      { ...DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS },
      hybridWeights,
    );
  }

  it('merges keyword and semantic result sets', async () => {
    fixture = createRetrievalFixture();
    const strategy = createStrategy();
    originalIsReady = embeddingManager.isReady;
    originalEmbed = embeddingManager.embed;
    (embeddingManager.isReady as typeof embeddingManager.isReady) = () => false;
    (embeddingManager.embed as typeof embeddingManager.embed) = async () => null;

    await insertMemory(fixture, createRetrievalMemory({ id: 'hybrid-keyword', content: '发布质量门禁需要先完成' }));
    await insertMemory(fixture, createRetrievalMemory({ id: 'hybrid-semantic', content: '灰度演练与回滚脚本' }));

    const result = await strategy.rank({ query: '质量门禁 回滚脚本', scope: { userId: 'user-1' } }, 5, createExecutionMeta());
    assert.deepEqual(result.ranked.map((entry) => entry.memory.id), ['hybrid-semantic', 'hybrid-keyword']);
    assert.equal(result.semanticHitCount, 2);
  });

  it('does not duplicate the same memory when both keyword and semantic hit it', async () => {
    fixture = createRetrievalFixture();
    const strategy = createStrategy();
    originalIsReady = embeddingManager.isReady;
    originalEmbed = embeddingManager.embed;
    (embeddingManager.isReady as typeof embeddingManager.isReady) = () => false;
    (embeddingManager.embed as typeof embeddingManager.embed) = async () => null;

    await insertMemory(fixture, createRetrievalMemory({ id: 'hybrid-dedup', content: '发布质量门禁与回滚脚本都要检查' }));

    const result = await strategy.rank({ query: '质量门禁 回滚脚本', scope: { userId: 'user-1' } }, 5, createExecutionMeta());
    assert.deepEqual(result.ranked.map((entry) => entry.memory.id), ['hybrid-dedup']);
  });

  it('applies configured score weights to blended lexical results', async () => {
    fixture = createRetrievalFixture();
    const strategy = createStrategy({ keyword: 0.8, semantic: 0.1, base: 0.1 });
    originalIsReady = embeddingManager.isReady;
    originalEmbed = embeddingManager.embed;
    (embeddingManager.isReady as typeof embeddingManager.isReady) = () => false;
    (embeddingManager.embed as typeof embeddingManager.embed) = async () => null;

    await insertMemory(fixture, createRetrievalMemory({ id: 'hybrid-weight-a', content: '发布 质量 门禁 回滚', scores: { importance: 0.7, confidence: 0.7, explicitness: 0.7 } }));
    await insertMemory(fixture, createRetrievalMemory({ id: 'hybrid-weight-b', content: '发布', scores: { importance: 0.7, confidence: 0.7, explicitness: 0.7 } }));

    const result = await strategy.rank({ query: '发布 质量 门禁 回滚', scope: { userId: 'user-1' } }, 5, createExecutionMeta());
    assert.equal(result.ranked[0]?.memory.id, 'hybrid-weight-a');
    assert.ok((result.ranked[0]?.score ?? 0) > (result.ranked[1]?.score ?? 0));
  });

  it('falls back to lexical ranking when cosine search throws', async () => {
    fixture = createRetrievalFixture();
    const strategy = createStrategy();
    originalIsReady = embeddingManager.isReady;
    originalEmbed = embeddingManager.embed;
    (embeddingManager.isReady as typeof embeddingManager.isReady) = () => true;
    (embeddingManager.embed as typeof embeddingManager.embed) = async () => ({
      values: new Float32Array([1, 0]),
      dimensions: 2,
    });

    await insertMemory(fixture, createRetrievalMemory({ id: 'hybrid-fallback', content: '发布质量门禁' }));
    fixture.semanticRepo.searchByCosine = async () => {
      throw new Error('boom');
    };

    const result = await strategy.rank({ query: '质量门禁', scope: { userId: 'user-1' } }, 5, createExecutionMeta());
    assert.deepEqual(result.ranked.map((entry) => entry.memory.id), ['hybrid-fallback']);
  });

  it('ignores semantic hits outside the loaded candidate set', async () => {
    fixture = createRetrievalFixture();
    const strategy = createStrategy();
    originalIsReady = embeddingManager.isReady;
    originalEmbed = embeddingManager.embed;
    (embeddingManager.isReady as typeof embeddingManager.isReady) = () => false;
    (embeddingManager.embed as typeof embeddingManager.embed) = async () => null;

    await insertMemory(fixture, createRetrievalMemory({ id: 'hybrid-in-scope', content: '发布质量门禁', scope: { userId: 'user-1', global: false } }));
    await insertMemory(fixture, createRetrievalMemory({ id: 'hybrid-out-scope', content: '发布质量门禁', scope: { userId: 'user-2', global: false } }));

    const result = await strategy.rank({ query: '质量门禁', scope: { userId: 'user-1' } }, 5, createExecutionMeta());
    assert.deepEqual(result.ranked.map((entry) => entry.memory.id), ['hybrid-in-scope']);
  });
});
