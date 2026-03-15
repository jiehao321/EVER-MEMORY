import test from 'node:test';
import assert from 'node:assert/strict';
import { embeddingManager } from '../../../src/embedding/manager.js';
import type { EmbeddingVector } from '../../../src/embedding/provider.js';
import { checkSemanticDuplicate } from '../../../src/core/memory/dedup.js';

test('checkSemanticDuplicate returns non-duplicate when embedding manager is not ready', async () => {
  const originalIsReady = embeddingManager.isReady;
  const originalEmbed = embeddingManager.embed;

  (embeddingManager.isReady as typeof embeddingManager.isReady) = () => false;
  (embeddingManager.embed as typeof embeddingManager.embed) = async () => {
    throw new Error('embed should not be called');
  };

  try {
    const result = await checkSemanticDuplicate(
      'duplicate candidate',
      'project_state',
      {
        searchByCosine: async () => {
          throw new Error('search should not be called');
        },
      } as unknown as never,
      { enabled: true, threshold: 0.92 },
    );

    assert.deepEqual(result, { isDuplicate: false });
  } finally {
    embeddingManager.isReady = originalIsReady;
    embeddingManager.embed = originalEmbed;
  }
});

test('checkSemanticDuplicate returns non-duplicate when embed returns null', async () => {
  const originalIsReady = embeddingManager.isReady;
  const originalEmbed = embeddingManager.embed;

  (embeddingManager.isReady as typeof embeddingManager.isReady) = () => true;
  (embeddingManager.embed as typeof embeddingManager.embed) = async () => null;

  try {
    const result = await checkSemanticDuplicate(
      'duplicate candidate',
      'project_state',
      {
        searchByCosine: async () => {
          throw new Error('search should not be called');
        },
      } as unknown as never,
      { enabled: true, threshold: 0.92 },
    );

    assert.deepEqual(result, { isDuplicate: false });
  } finally {
    embeddingManager.isReady = originalIsReady;
    embeddingManager.embed = originalEmbed;
  }
});

test('checkSemanticDuplicate returns existing memory id when cosine meets threshold', async () => {
  const originalIsReady = embeddingManager.isReady;
  const originalEmbed = embeddingManager.embed;
  const vector: EmbeddingVector = {
    values: new Float32Array([0.2, 0.8]),
    dimensions: 2,
  };

  (embeddingManager.isReady as typeof embeddingManager.isReady) = () => true;
  (embeddingManager.embed as typeof embeddingManager.embed) = async () => vector;

  try {
    const result = await checkSemanticDuplicate(
      'duplicate candidate',
      'project_state',
      {
        searchByCosine: async (queryVector: Float32Array, limit: number, minScore?: number) => {
          assert.ok(Math.abs(queryVector[0] - 0.2) < 1e-6);
          assert.ok(Math.abs(queryVector[1] - 0.8) < 1e-6);
          assert.equal(limit, 3);
          assert.equal(minScore, 0.92);
          return [{ memoryId: 'memory-1', score: 0.95 }];
        },
      } as unknown as never,
      { enabled: true, threshold: 0.92 },
    );

    assert.deepEqual(result, {
      isDuplicate: true,
      existingId: 'memory-1',
      similarity: 0.95,
    });
  } finally {
    embeddingManager.isReady = originalIsReady;
    embeddingManager.embed = originalEmbed;
  }
});

test('checkSemanticDuplicate returns non-duplicate when cosine stays below threshold', async () => {
  const originalIsReady = embeddingManager.isReady;
  const originalEmbed = embeddingManager.embed;
  const vector: EmbeddingVector = {
    values: new Float32Array([0.4, 0.6]),
    dimensions: 2,
  };

  (embeddingManager.isReady as typeof embeddingManager.isReady) = () => true;
  (embeddingManager.embed as typeof embeddingManager.embed) = async () => vector;

  try {
    const result = await checkSemanticDuplicate(
      'duplicate candidate',
      'project_state',
      {
        searchByCosine: async () => [{ memoryId: 'memory-1', score: 0.91 }],
      } as unknown as never,
      { enabled: true, threshold: 0.92 },
    );

    assert.deepEqual(result, { isDuplicate: false });
  } finally {
    embeddingManager.isReady = originalIsReady;
    embeddingManager.embed = originalEmbed;
  }
});
