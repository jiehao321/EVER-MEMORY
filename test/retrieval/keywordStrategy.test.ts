import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { KeywordRetrievalStrategy } from '../../src/retrieval/strategies/keyword.js';
import { DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS } from '../../src/constants.js';
import {
  createExecutionMeta,
  createRetrievalFixture,
  createRetrievalMemory,
  insertMemory,
  type RetrievalTestFixture,
} from './helpers.js';

describe('KeywordRetrievalStrategy', () => {
  let fixture: RetrievalTestFixture | undefined;

  afterEach(() => fixture?.close());

  it('returns the exact content match ahead of weaker matches', async () => {
    fixture = createRetrievalFixture();
    const strategy = new KeywordRetrievalStrategy(fixture.support, { ...DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS });

    const exact = createRetrievalMemory({
      id: 'keyword-exact',
      content: '发布质量门禁必须在上线前完成',
      tags: ['quality-gate'],
    });
    const partial = createRetrievalMemory({
      id: 'keyword-partial',
      content: '发布流程需要先完成检查',
      tags: ['发布'],
    });

    await insertMemory(fixture, partial);
    await insertMemory(fixture, exact);

    const result = strategy.rank({ query: '发布 质量', scope: { userId: 'user-1' } }, 5, createExecutionMeta());
    assert.deepEqual(result.ranked.map((entry) => entry.memory.id), ['keyword-exact', 'keyword-partial']);
  });

  it('supports partial keyword matching against content fragments', async () => {
    fixture = createRetrievalFixture();
    const strategy = new KeywordRetrievalStrategy(fixture.support, { ...DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS });

    const release = createRetrievalMemory({ id: 'keyword-release', content: '项目发布窗口调整到周五晚上' });
    const review = createRetrievalMemory({ id: 'keyword-review', content: '代码评审窗口调整到周四' });

    await insertMemory(fixture, release);
    await insertMemory(fixture, review);

    const result = strategy.rank({ query: '发布窗', scope: { userId: 'user-1' } }, 5, createExecutionMeta());
    assert.deepEqual(result.ranked.map((entry) => entry.memory.id), ['keyword-release']);
  });

  it('returns no ranked items when no candidate matches the query', async () => {
    fixture = createRetrievalFixture();
    const strategy = new KeywordRetrievalStrategy(fixture.support, { ...DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS });

    await insertMemory(fixture, createRetrievalMemory({ id: 'keyword-none', content: '只记录部署回滚流程' }));

    const result = strategy.rank({ query: '完全不存在', scope: { userId: 'user-1' } }, 5, createExecutionMeta());
    assert.equal(result.ranked.length, 0);
  });

  it('filters candidates by scope before ranking', async () => {
    fixture = createRetrievalFixture();
    const strategy = new KeywordRetrievalStrategy(fixture.support, { ...DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS });

    await insertMemory(fixture, createRetrievalMemory({
      id: 'keyword-scope-a',
      content: '发布计划在项目A执行',
      scope: { userId: 'user-1', project: 'project-a', global: false },
    }));
    await insertMemory(fixture, createRetrievalMemory({
      id: 'keyword-scope-b',
      content: '发布计划在项目B执行',
      scope: { userId: 'user-1', project: 'project-b', global: false },
    }));

    const result = strategy.rank({
      query: '发布计划',
      scope: { userId: 'user-1', project: 'project-a' },
    }, 5, createExecutionMeta());

    assert.deepEqual(result.ranked.map((entry) => entry.memory.id), ['keyword-scope-a']);
  });

  it('loads enough candidates but caller limit can truncate selected results', async () => {
    fixture = createRetrievalFixture();
    const strategy = new KeywordRetrievalStrategy(fixture.support, { ...DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS });

    await insertMemory(fixture, createRetrievalMemory({ id: 'keyword-limit-1', content: '发布步骤一：检查门禁' }));
    await insertMemory(fixture, createRetrievalMemory({ id: 'keyword-limit-2', content: '发布步骤二：同步里程碑' }));
    await insertMemory(fixture, createRetrievalMemory({ id: 'keyword-limit-3', content: '发布步骤三：通知回滚负责人' }));

    const result = strategy.rank({ query: '发布步骤', scope: { userId: 'user-1' } }, 2, createExecutionMeta());
    assert.equal(result.ranked.length >= 2, true);
    assert.deepEqual(result.ranked.slice(0, 2).map((entry) => entry.memory.id), ['keyword-limit-3', 'keyword-limit-2']);
  });

  it('uses tag matches to improve ranking among already loaded candidates', async () => {
    fixture = createRetrievalFixture();
    const strategy = new KeywordRetrievalStrategy(fixture.support, { ...DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS });

    await insertMemory(fixture, createRetrievalMemory({
      id: 'keyword-tag-hit',
      content: '当前发布里程碑需要补检查项',
      tags: ['质量门禁'],
    }));
    await insertMemory(fixture, createRetrievalMemory({
      id: 'keyword-tag-miss',
      content: '当前发布里程碑需要补检查项',
      tags: ['发布检查'],
    }));

    const result = strategy.rank({ query: '发布 质量门禁', scope: { userId: 'user-1' } }, 5, createExecutionMeta());
    assert.deepEqual(result.ranked.map((entry) => entry.memory.id), ['keyword-tag-hit', 'keyword-tag-miss']);
  });

  it('merges execution weight overrides without changing default strategy weights', async () => {
    fixture = createRetrievalFixture();
    const strategy = new KeywordRetrievalStrategy(fixture.support, { ...DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS });

    await insertMemory(fixture, createRetrievalMemory({
      id: 'keyword-override-exact-old',
      content: '发布 质量 门禁',
      timestamps: {
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    }));
    await insertMemory(fixture, createRetrievalMemory({
      id: 'keyword-override-recent-partial',
      content: '发布',
      timestamps: {
        createdAt: '2026-03-28T00:00:00.000Z',
        updatedAt: '2026-03-28T00:00:00.000Z',
      },
    }));

    const baseline = strategy.rank({ query: '发布 质量 门禁', scope: { userId: 'user-1' } }, 5, createExecutionMeta());
    assert.equal(baseline.ranked[0]?.memory.id, 'keyword-override-exact-old');

    const overridden = strategy.rank(
      { query: '发布 质量 门禁', scope: { userId: 'user-1' } },
      5,
      createExecutionMeta({ weightOverrides: { keyword: 0.1, recency: 1 } }),
    );
    assert.equal(overridden.ranked[0]?.memory.id, 'keyword-override-recent-partial');
  });
});
