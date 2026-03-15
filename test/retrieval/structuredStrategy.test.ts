import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { StructuredRetrievalStrategy } from '../../src/retrieval/strategies/structured.js';
import { DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS } from '../../src/constants.js';
import {
  createExecutionMeta,
  createRetrievalFixture,
  createRetrievalMemory,
  insertMemory,
  type RetrievalTestFixture,
} from './helpers.js';

describe('StructuredRetrievalStrategy', () => {
  let fixture: RetrievalTestFixture | undefined;

  afterEach(() => fixture?.close());

  function createStrategy() {
    if (!fixture) {
      throw new Error('fixture not initialized');
    }
    return new StructuredRetrievalStrategy(
      fixture.support,
      8,
      { ...DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS },
      false,
      fixture.semanticRepo,
    );
  }

  it('filters candidates by requested memory type', async () => {
    fixture = createRetrievalFixture();
    const strategy = createStrategy();

    await insertMemory(fixture, createRetrievalMemory({ id: 'structured-project', type: 'project', content: '项目状态：准备发布' }));
    await insertMemory(fixture, createRetrievalMemory({ id: 'structured-decision', type: 'decision', content: '决策：先做灰度发布' }));

    const result = strategy.rank({
      query: '发布',
      scope: { userId: 'user-1' },
      types: ['decision'],
    }, 5, createExecutionMeta());

    assert.deepEqual(result.ranked.map((entry) => entry.memory.id), ['structured-decision']);
  });

  it('filters candidates by lifecycle', async () => {
    fixture = createRetrievalFixture();
    const strategy = createStrategy();

    await insertMemory(fixture, createRetrievalMemory({ id: 'structured-semantic', lifecycle: 'semantic', content: '稳定约束：发布前先确认回滚' }));
    await insertMemory(fixture, createRetrievalMemory({ id: 'structured-working', lifecycle: 'working', content: '临时记录：待确认发布名单' }));

    const result = strategy.rank({
      query: '发布',
      scope: { userId: 'user-1' },
      lifecycles: ['working'],
    }, 5, createExecutionMeta());

    assert.deepEqual(result.ranked.map((entry) => entry.memory.id), ['structured-working']);
  });

  it('applies multiple request filters together', async () => {
    fixture = createRetrievalFixture();
    const strategy = createStrategy();

    await insertMemory(fixture, createRetrievalMemory({
      id: 'structured-match',
      type: 'decision',
      lifecycle: 'semantic',
      scope: { userId: 'user-1', project: 'alpha', global: false },
      content: '决策：alpha 项目周五发布',
    }));
    await insertMemory(fixture, createRetrievalMemory({
      id: 'structured-wrong-project',
      type: 'decision',
      lifecycle: 'semantic',
      scope: { userId: 'user-1', project: 'beta', global: false },
      content: '决策：beta 项目周五发布',
    }));
    await insertMemory(fixture, createRetrievalMemory({
      id: 'structured-wrong-type',
      type: 'project',
      lifecycle: 'semantic',
      scope: { userId: 'user-1', project: 'alpha', global: false },
      content: '项目状态：alpha 项目周五发布',
    }));

    const result = strategy.rank({
      query: '发布',
      scope: { userId: 'user-1', project: 'alpha' },
      types: ['decision'],
      lifecycles: ['semantic'],
    }, 5, createExecutionMeta());

    assert.deepEqual(result.ranked.map((entry) => entry.memory.id), ['structured-match']);
  });

  it('returns no results when no candidate survives structured filtering', async () => {
    fixture = createRetrievalFixture();
    const strategy = createStrategy();

    await insertMemory(fixture, createRetrievalMemory({ id: 'structured-empty', type: 'project', content: '项目状态：准备发布' }));

    const result = strategy.rank({
      query: '发布',
      scope: { userId: 'user-1' },
      types: ['constraint'],
    }, 5, createExecutionMeta());

    assert.equal(result.ranked.length, 0);
  });

  it('prioritizes higher project policy scores for project-oriented queries', async () => {
    fixture = createRetrievalFixture();
    const strategy = createStrategy();

    await insertMemory(fixture, createRetrievalMemory({
      id: 'structured-summary',
      type: 'summary',
      tags: ['active_project_summary'],
      scope: { userId: 'user-1', project: 'alpha', global: false },
      content: '项目连续性摘要（发布）：当前重点是质量门禁',
      timestamps: {
        createdAt: '2026-03-15T10:00:00.000Z',
        updatedAt: '2026-03-15T10:00:00.000Z',
      },
      scores: {
        importance: 0.8,
        confidence: 0.8,
        explicitness: 0.8,
      },
    }));
    await insertMemory(fixture, createRetrievalMemory({
      id: 'structured-constraint',
      type: 'constraint',
      scope: { userId: 'user-1', project: 'alpha', global: false },
      content: '约束：发布前需要确认回滚',
      timestamps: {
        createdAt: '2026-03-15T10:00:00.000Z',
        updatedAt: '2026-03-15T10:00:00.000Z',
      },
      scores: {
        importance: 0.8,
        confidence: 0.8,
        explicitness: 0.8,
      },
    }));

    const result = strategy.rank({
      query: '项目发布当前状态',
      scope: { userId: 'user-1', project: 'alpha' },
    }, 5, createExecutionMeta({ projectOriented: true, routeApplied: true, routeKind: 'project_progress' }));

    assert.deepEqual(result.ranked.map((entry) => entry.memory.id), ['structured-summary', 'structured-constraint']);
  });

  it('removes duplicate normalized content during final selection', async () => {
    fixture = createRetrievalFixture();
    const strategy = createStrategy();

    const ranked = [
      {
        memory: createRetrievalMemory({ id: 'dup-1', type: 'summary', content: '质量门禁已完成' }),
        score: 0.9,
        keywordScore: 0.5,
        semanticScore: 0,
        baseScore: 0.5,
        projectPriority: 0.9,
        dataQuality: 1,
        dataClass: 'unknown' as const,
      },
      {
        memory: createRetrievalMemory({ id: 'dup-2', type: 'project', content: '质量门禁已完成' }),
        score: 0.8,
        keywordScore: 0.4,
        semanticScore: 0,
        baseScore: 0.4,
        projectPriority: 0.7,
        dataQuality: 1,
        dataClass: 'unknown' as const,
      },
    ];

    const selected = strategy.selectTopRanked(
      ranked,
      5,
      createExecutionMeta(),
    );

    assert.deepEqual(selected.top.map((entry) => entry.memory.id), ['dup-1']);
    assert.equal(selected.selectionStats.duplicateItemsRemoved, 1);
  });
});
