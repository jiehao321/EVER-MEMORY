import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS } from '../../src/constants.js';
import { enhanceWithGraphBoost } from '../../src/retrieval/strategies/graphBoost.js';
import { KeywordRetrievalStrategy } from '../../src/retrieval/strategies/keyword.js';
import { RelationRepository } from '../../src/storage/relationRepo.js';
import {
  createExecutionMeta,
  createRetrievalFixture,
  createRetrievalMemory,
  insertMemory,
  type RetrievalTestFixture,
} from './helpers.js';

describe('enhanceWithGraphBoost', () => {
  let fixture: RetrievalTestFixture | undefined;

  afterEach(() => fixture?.close());

  it('increases scores of connected memories already in the result set', async () => {
    fixture = createRetrievalFixture();
    const relationRepo = new RelationRepository(fixture.db);
    const anchor = createRetrievalMemory({ id: 'graph-anchor', content: '发布质量门禁 anchor' });
    const connected = createRetrievalMemory({ id: 'graph-connected', content: '回滚演练 connected' });

    await insertMemory(fixture, anchor);
    await insertMemory(fixture, connected);
    relationRepo.upsert({
      id: 'rel-boost',
      sourceId: anchor.id,
      targetId: connected.id,
      relationType: 'supports',
      confidence: 0.9,
      weight: 1,
      createdAt: '2026-04-06T00:00:00.000Z',
      updatedAt: '2026-04-06T00:00:00.000Z',
      createdBy: 'user_explicit',
    });

    const ranked = enhanceWithGraphBoost([
      {
        memory: anchor,
        score: 0.8,
        keywordScore: 1,
        semanticScore: 0,
        baseScore: 0.8,
        projectPriority: 0,
        dataQuality: 0.8,
        dataClass: 'unknown',
      },
      {
        memory: connected,
        score: 0.5,
        keywordScore: 0.5,
        semanticScore: 0,
        baseScore: 0.5,
        projectPriority: 0,
        dataQuality: 0.8,
        dataClass: 'unknown',
      },
    ], relationRepo, fixture.memoryRepo);

    const boosted = ranked.find((entry: { memory: { id: string } }) => entry.memory.id === connected.id);
    assert.ok((boosted?.score ?? 0) > 0.5);
  });

  it('injects connected memories that clear the minimum boost threshold', async () => {
    fixture = createRetrievalFixture();
    const relationRepo = new RelationRepository(fixture.db);
    const anchor = createRetrievalMemory({ id: 'graph-seed', content: '图谱种子 memory' });
    const injected = createRetrievalMemory({ id: 'graph-injected', content: '只通过图谱扩展出现' });

    await insertMemory(fixture, anchor);
    await insertMemory(fixture, injected);
    relationRepo.upsert({
      id: 'rel-inject',
      sourceId: anchor.id,
      targetId: injected.id,
      relationType: 'supports',
      confidence: 0.9,
      weight: 1.3,
      createdAt: '2026-04-06T00:00:00.000Z',
      updatedAt: '2026-04-06T00:00:00.000Z',
      createdBy: 'user_explicit',
    });

    const ranked = enhanceWithGraphBoost([
      {
        memory: anchor,
        score: 0.75,
        keywordScore: 1,
        semanticScore: 0,
        baseScore: 0.75,
        projectPriority: 0,
        dataQuality: 0.8,
        dataClass: 'unknown',
      },
    ], relationRepo, fixture.memoryRepo);

    const expanded = ranked.find((entry: { memory: { id: string } }) => entry.memory.id === injected.id);
    assert.equal(expanded?.graphInjected, true);
    assert.ok((expanded?.score ?? 0) >= 0.1);
  });

  it('returns ranked items unchanged when the graph has no connections', async () => {
    fixture = createRetrievalFixture();
    const relationRepo = new RelationRepository(fixture.db);
    const anchor = createRetrievalMemory({ id: 'graph-alone', content: '独立记忆' });

    const ranked = enhanceWithGraphBoost([
      {
        memory: anchor,
        score: 0.42,
        keywordScore: 0.42,
        semanticScore: 0,
        baseScore: 0.42,
        projectPriority: 0,
        dataQuality: 0.8,
        dataClass: 'unknown',
      },
    ], relationRepo, fixture.memoryRepo);

    assert.deepEqual(ranked.map((entry: { memory: { id: string } }) => entry.memory.id), ['graph-alone']);
    assert.equal(ranked[0]?.score, 0.42);
  });
});

describe('KeywordRetrievalStrategy graph integration', () => {
  let fixture: RetrievalTestFixture | undefined;

  afterEach(() => fixture?.close());

  it('uses graph boost when a relation repository is provided', async () => {
    fixture = createRetrievalFixture();
    const relationRepo = new RelationRepository(fixture.db);
    const strategy = new KeywordRetrievalStrategy(
      fixture.support,
      { ...DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS },
      relationRepo,
    );
    const anchor = createRetrievalMemory({
      id: 'keyword-graph-anchor',
      content: '发布计划 graphanchor',
      tags: ['release'],
    });
    const connected = createRetrievalMemory({
      id: 'keyword-graph-connected',
      content: '只在图谱里关联到发布链路',
    });

    await insertMemory(fixture, anchor);
    await insertMemory(fixture, connected);
    relationRepo.upsert({
      id: 'rel-keyword-graph',
      sourceId: anchor.id,
      targetId: connected.id,
      relationType: 'supports',
      confidence: 0.9,
      weight: 1.3,
      createdAt: '2026-04-06T00:00:00.000Z',
      updatedAt: '2026-04-06T00:00:00.000Z',
      createdBy: 'user_explicit',
    });

    const result = strategy.rank(
      { query: 'graphanchor', scope: { userId: 'user-1' } },
      5,
      createExecutionMeta(),
    );

    assert.deepEqual(
      result.ranked.map((entry) => entry.memory.id).sort(),
      ['keyword-graph-anchor', 'keyword-graph-connected'],
    );
    const injected = result.ranked.find((entry) => entry.memory.id === 'keyword-graph-connected');
    assert.equal(injected?.graphInjected, true);
  });
});
