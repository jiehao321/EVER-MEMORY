import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { HybridRetrievalStrategy } from '../../src/retrieval/strategies/hybrid.js';
import { embeddingManager } from '../../src/embedding/manager.js';
import {
  DEFAULT_RETRIEVAL_HYBRID_WEIGHTS,
  DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS,
} from '../../src/constants.js';
import {
  createExecutionMeta,
  createRetrievalFixture,
  createRetrievalMemory,
  insertMemory,
  type RetrievalTestFixture,
} from './helpers.js';

describe('semantic retrieval path', () => {
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

  function createHybridStrategy() {
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
      { ...DEFAULT_RETRIEVAL_HYBRID_WEIGHTS },
    );
  }

  it('uses cosine search when embeddings are available', async () => {
    fixture = createRetrievalFixture();
    const strategy = createHybridStrategy();
    originalIsReady = embeddingManager.isReady;
    originalEmbed = embeddingManager.embed;
    (embeddingManager.isReady as typeof embeddingManager.isReady) = () => true;
    (embeddingManager.embed as typeof embeddingManager.embed) = async () => ({
      values: new Float32Array([1, 0]),
      dimensions: 2,
    });

    await insertMemory(fixture, createRetrievalMemory({ id: 'cosine-a', content: '完全无关文本A' }), {
      semanticIndex: false,
      embedding: new Float32Array([1, 0]),
    });
    await insertMemory(fixture, createRetrievalMemory({ id: 'cosine-b', content: '完全无关文本B' }), {
      semanticIndex: false,
      embedding: new Float32Array([0, 1]),
    });

    const result = await strategy.rank({ query: '查询本身不做词法命中', scope: { userId: 'user-1' } }, 5, createExecutionMeta());
    assert.equal(result.semanticHitCount, 1);
    assert.deepEqual(result.ranked.map((entry) => entry.memory.id), ['cosine-a']);
    assert.equal(result.ranked[0]?.semanticScore, 1);
  });

  it('falls back to token search when embeddings are unavailable', async () => {
    fixture = createRetrievalFixture();
    const strategy = createHybridStrategy();
    originalIsReady = embeddingManager.isReady;
    originalEmbed = embeddingManager.embed;
    (embeddingManager.isReady as typeof embeddingManager.isReady) = () => false;
    (embeddingManager.embed as typeof embeddingManager.embed) = async () => null;

    await insertMemory(fixture, createRetrievalMemory({ id: 'token-hit', content: '发布质量门禁需要先完成' }));
    await insertMemory(fixture, createRetrievalMemory({ id: 'token-miss', content: '整理回顾文档' }));

    const result = await strategy.rank({ query: '质量门禁', scope: { userId: 'user-1' } }, 5, createExecutionMeta());
    assert.equal(result.semanticHitCount, 1);
    assert.deepEqual(result.ranked.map((entry) => entry.memory.id), ['token-hit']);
    assert.ok((result.ranked[0]?.semanticScore ?? 0) > 0);
  });

  it('filters token search results by minScore', () => {
    fixture = createRetrievalFixture();

    fixture.memoryRepo.insert(createRetrievalMemory({ id: 'minscore-1', content: '发布 质量 门禁' }));
    fixture.memoryRepo.insert(createRetrievalMemory({ id: 'minscore-2', content: '发布 计划' }));
    fixture.memoryRepo.insert(createRetrievalMemory({ id: 'minscore-3', content: '完全无关' }));

    fixture.semanticRepo.upsertFromMemory(fixture.memoryRepo.findById('minscore-1')!);
    fixture.semanticRepo.upsertFromMemory(fixture.memoryRepo.findById('minscore-2')!);
    fixture.semanticRepo.upsertFromMemory(fixture.memoryRepo.findById('minscore-3')!);

    const hits = fixture.semanticRepo.search('发布 质量 门禁', { minScore: 0.5, limit: 5 });
    assert.equal(hits[0]?.memoryId, 'minscore-1');
    assert.equal(hits.every((hit) => hit.score >= 0.5), true);
  });

  it('respects token search result limits', () => {
    fixture = createRetrievalFixture();

    for (const id of ['semantic-limit-1', 'semantic-limit-2', 'semantic-limit-3']) {
      fixture.memoryRepo.insert(createRetrievalMemory({ id, content: `发布计划 ${id}` }));
      fixture.semanticRepo.upsertFromMemory(fixture.memoryRepo.findById(id)!);
    }

    const hits = fixture.semanticRepo.search('发布计划', { limit: 2, minScore: 0.01 });
    assert.equal(hits.length, 2);
  });

  it('returns no token hits for empty semantic queries', () => {
    fixture = createRetrievalFixture();
    assert.deepEqual(fixture.semanticRepo.search('', { limit: 5 }), []);
  });
});
