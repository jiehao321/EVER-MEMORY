import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticPreload } from '../../src/hooks/beforeAgentStart.js';
import { embeddingManager } from '../../src/embedding/manager.js';
import type { EmbeddingVector } from '../../src/embedding/provider.js';
import type { MemoryItem, MemoryScope } from '../../src/types.js';

function createMemory(id: string, scope: MemoryScope): MemoryItem {
  return {
    id,
    content: `memory-${id}`,
    type: 'fact',
    lifecycle: 'episodic',
    source: { kind: 'test' },
    scope,
    scores: {
      confidence: 1,
      importance: 0.5,
      explicitness: 1,
    },
    timestamps: {
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    state: {
      active: true,
      archived: false,
    },
    evidence: {
      references: [],
    },
    tags: [],
    relatedEntities: [],
    sourceGrade: 'primary',
    stats: {
      accessCount: 0,
      retrievalCount: 0,
    },
  };
}

test('semanticPreload returns empty result when embedding manager is not ready', async () => {
  const originalIsReady = embeddingManager.isReady;
  const originalEmbed = embeddingManager.embed;

  (embeddingManager.isReady as typeof embeddingManager.isReady) = () => false;
  (embeddingManager.embed as typeof embeddingManager.embed) = async () => {
    throw new Error('embed should not be called');
  };

  try {
    const result = await semanticPreload(
      'query',
      { userId: 'u-1', project: 'evermemory' },
      {
        searchByCosine: async () => {
          throw new Error('search should not be called');
        },
      } as unknown as never,
      {
        findById: () => null,
      } as unknown as never,
    );

    assert.deepEqual(result, {
      ids: [],
      hits: [],
      warnings: [],
      relevantRules: [],
    });
  } finally {
    embeddingManager.isReady = originalIsReady;
    embeddingManager.embed = originalEmbed;
  }
});

test('semanticPreload returns top scoped ids after cosine search filtering', async () => {
  const originalIsReady = embeddingManager.isReady;
  const originalEmbed = embeddingManager.embed;
  const vector: EmbeddingVector = {
    values: new Float32Array([0.1, 0.9]),
    dimensions: 2,
  };
  let capturedLimit: number | undefined;
  let capturedMinScore: number | undefined;
  let capturedVector: number[] | undefined;

  (embeddingManager.isReady as typeof embeddingManager.isReady) = () => true;
  (embeddingManager.embed as typeof embeddingManager.embed) = async () => vector;

  try {
    const result = await semanticPreload(
      'deploy flow',
      { userId: 'u-1', project: 'evermemory' },
      {
        searchByCosine: async (queryVector: Float32Array, limit: number, minScore?: number) => {
          capturedLimit = limit;
          capturedMinScore = minScore ?? 0;
          capturedVector = Array.from(queryVector);
          return [
            { memoryId: 'm-3', score: 0.91 },
            { memoryId: 'm-2', score: 0.82 },
            { memoryId: 'missing', score: 0.77 },
            { memoryId: 'm-1', score: 0.73 },
          ];
        },
      } as unknown as never,
      {
        findById: (id: string) => {
          if (id === 'm-1') {
            return createMemory(id, { userId: 'u-1', project: 'evermemory' });
          }
          if (id === 'm-2') {
            return createMemory(id, { userId: 'u-1', project: 'evermemory' });
          }
          if (id === 'm-3') {
            return createMemory(id, { userId: 'u-1', project: 'other-project' });
          }
          return null;
        },
      } as unknown as never,
      2,
      0.35,
    );

    if (!capturedVector) {
      throw new Error('expected searchByCosine to be called');
    }
    assert.equal(capturedLimit, 6);
    assert.equal(capturedMinScore, 0.35);
    assert.ok(Math.abs(capturedVector[0] - 0.1) < 1e-6);
    assert.ok(Math.abs(capturedVector[1] - 0.9) < 1e-6);
    assert.deepEqual(result.ids, ['m-2', 'm-1']);
    assert.deepEqual(result.hits, [
      { memoryId: 'm-2', score: 0.82 },
      { memoryId: 'm-1', score: 0.73 },
    ]);
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(result.relevantRules, []);
  } finally {
    embeddingManager.isReady = originalIsReady;
    embeddingManager.embed = originalEmbed;
  }
});

test('semanticPreload excludes memories outside the current user scope', async () => {
  const originalIsReady = embeddingManager.isReady;
  const originalEmbed = embeddingManager.embed;
  const vector: EmbeddingVector = {
    values: new Float32Array([1, 2, 3]),
    dimensions: 3,
  };

  (embeddingManager.isReady as typeof embeddingManager.isReady) = () => true;
  (embeddingManager.embed as typeof embeddingManager.embed) = async () => vector;

  try {
    const result = await semanticPreload(
      'query',
      { userId: 'u-1', project: 'evermemory' },
      {
        searchByCosine: async () => [
          { memoryId: 'm-1', score: 0.9 },
          { memoryId: 'm-2', score: 0.8 },
        ],
      } as unknown as never,
      {
        findById: (id: string) => {
          if (id === 'm-1') {
            return createMemory(id, { userId: 'u-2', project: 'evermemory' });
          }
          if (id === 'm-2') {
            return createMemory(id, { userId: 'u-1', project: 'evermemory' });
          }
          return null;
        },
      } as unknown as never,
    );

    assert.deepEqual(result.ids, ['m-2']);
    assert.deepEqual(result.hits, [{ memoryId: 'm-2', score: 0.8 }]);
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(result.relevantRules, []);
  } finally {
    embeddingManager.isReady = originalIsReady;
    embeddingManager.embed = originalEmbed;
  }
});

test('semanticPreload returns empty result when cosine search throws', async () => {
  const originalIsReady = embeddingManager.isReady;
  const originalEmbed = embeddingManager.embed;
  const vector: EmbeddingVector = {
    values: new Float32Array([1, 2, 3]),
    dimensions: 3,
  };

  (embeddingManager.isReady as typeof embeddingManager.isReady) = () => true;
  (embeddingManager.embed as typeof embeddingManager.embed) = async () => vector;

  try {
    const result = await semanticPreload(
      'query',
      { userId: 'u-1', project: 'evermemory' },
      {
        searchByCosine: async () => {
          throw new Error('search failed');
        },
      } as unknown as never,
      {
        findById: () => {
          throw new Error('findById should not be called after search failure');
        },
      } as unknown as never,
    );

    assert.deepEqual(result, {
      ids: [],
      hits: [],
      warnings: [],
      relevantRules: [],
    });
  } finally {
    embeddingManager.isReady = originalIsReady;
    embeddingManager.embed = originalEmbed;
  }
});
