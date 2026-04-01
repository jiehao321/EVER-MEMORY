import test from 'node:test';
import assert from 'node:assert/strict';
import { evermemoryRecall } from '../../src/tools/recall.js';
import { buildMemory } from '../storage/helpers.js';
import type { RecallResult } from '../../src/types.js';

test('recall with query returns matching memories with strategyUsed', async () => {
  const memory = buildMemory({ content: 'Remember the rollback plan', type: 'decision' });
  const calls: Array<Record<string, unknown>> = [];
  const retrievalService = {
    async recall(request: Record<string, unknown>): Promise<RecallResult> {
      calls.push(request);
      return {
        items: [memory],
        total: 1,
        limit: 5,
        strategyUsed: 'keyword',
        meta: {
          degraded: false,
        },
      };
    },
  };

  const result = await evermemoryRecall(retrievalService as never, {
    query: 'rollback',
    limit: 5,
  });

  assert.equal(calls[0]?.query, 'rollback');
  assert.equal(result.total, 1);
  assert.equal(result.strategyUsed, 'keyword');
  assert.equal(result.items[0]?.id, memory.id);
  assert.equal(typeof result.meta?.durationMs, 'number');
});

test('recall with no matches returns empty result with nudge', async () => {
  const retrievalService = {
    async recall(): Promise<RecallResult> {
      return {
        items: [],
        total: 0,
        limit: 10,
        strategyUsed: 'keyword',
        nudge: 'No memories matched. Try broader terms or check if memories exist via evermemory_status.',
        meta: {},
      };
    },
  };

  const result = await evermemoryRecall(retrievalService as never, {
    query: 'missing memory',
  });

  assert.deepEqual(result.items, []);
  assert.equal(result.total, 0);
  assert.match(result.nudge ?? '', /No memories matched/);
  assert.equal(typeof result.meta?.durationMs, 'number');
});

test('recall result shape includes expected fields', async () => {
  const memory = buildMemory({
    content: 'Deployment checklist',
  });
  memory.metadata = {
    recallReason: 'keyword:0.80',
    topFactors: [{ name: 'keyword', value: 0.8 }],
  };
  const retrievalService = {
    async recall(): Promise<RecallResult> {
      return {
        items: [memory],
        total: 1,
        limit: 3,
        strategyUsed: 'hybrid',
        semanticFallback: false,
        degraded: false,
        meta: {
          degraded: false,
        },
      };
    },
  };

  const result = await evermemoryRecall(retrievalService as never, {
    query: 'deployment',
    mode: 'hybrid',
  });

  assert.equal(result.limit, 3);
  assert.equal(result.items[0]?.metadata?.recallReason, 'keyword:0.80');
  assert.deepEqual(result.items[0]?.metadata?.topFactors, [{ name: 'keyword', value: 0.8 }]);
  assert.equal(result.semanticFallback, false);
});

test('recall propagates invalid input errors from the retrieval service', async () => {
  const retrievalService = {
    async recall(request: { query?: string }): Promise<RecallResult> {
      if (!request.query) {
        throw new Error('query is required');
      }
      return {
        items: [],
        total: 0,
        limit: 1,
      };
    },
  };

  await assert.rejects(
    evermemoryRecall(retrievalService as never, {} as never),
    /query is required/,
  );
});
