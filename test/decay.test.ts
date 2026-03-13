import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  calculateDecayScore,
  shouldArchive,
  shouldMigrateToEpisodic,
  shouldMigrateToSemantic,
  DEFAULT_DECAY_WEIGHTS,
} from '../src/core/memory/decay.js';
import type { MemoryItem } from '../src/types.js';

function createTestMemory(overrides: Partial<MemoryItem> = {}): MemoryItem {
  const now = new Date().toISOString();
  return {
    id: 'test-memory-1',
    content: 'Test memory content',
    type: 'fact',
    lifecycle: 'episodic',
    source: { kind: 'test' },
    scope: {},
    scores: {
      confidence: 0.8,
      importance: 0.7,
      explicitness: 0.9,
    },
    timestamps: {
      createdAt: now,
      updatedAt: now,
      lastAccessedAt: now,
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
    stats: {
      accessCount: 0,
      retrievalCount: 0,
    },
    ...overrides,
  };
}

test('calculateDecayScore returns high score for recent, frequently accessed memory', () => {
  const memory = createTestMemory({
    stats: {
      accessCount: 10,
      retrievalCount: 5,
    },
    scores: {
      confidence: 0.9,
      importance: 0.9,
      explicitness: 1.0,
    },
  });

  const score = calculateDecayScore(memory);
  assert.ok(score > 0.7, `Expected score > 0.7, got ${score}`);
});

test('calculateDecayScore returns low score for old, never accessed memory', () => {
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const memory = createTestMemory({
    timestamps: {
      createdAt: sixtyDaysAgo,
      updatedAt: sixtyDaysAgo,
    },
    stats: {
      accessCount: 0,
      retrievalCount: 0,
    },
    scores: {
      confidence: 0.5,
      importance: 0.5,
      explicitness: 0.5,
    },
  });

  const score = calculateDecayScore(memory);
  assert.ok(score < 0.4, `Expected score < 0.4, got ${score}`);
});

test('calculateDecayScore penalizes superseded memories', () => {
  const memory = createTestMemory({
    state: {
      active: true,
      archived: false,
      supersededBy: 'newer-memory-id',
    },
  });

  const scoreSuperseded = calculateDecayScore(memory);

  const memoryNotSuperseded = createTestMemory({
    state: {
      active: true,
      archived: false,
    },
  });

  const scoreNotSuperseded = calculateDecayScore(memoryNotSuperseded);

  assert.ok(
    scoreSuperseded < scoreNotSuperseded,
    `Superseded score (${scoreSuperseded}) should be lower than non-superseded (${scoreNotSuperseded})`,
  );
});

test('calculateDecayScore gives semantic memories higher stability', () => {
  const semanticMemory = createTestMemory({
    lifecycle: 'semantic',
  });

  const workingMemory = createTestMemory({
    lifecycle: 'working',
  });

  const semanticScore = calculateDecayScore(semanticMemory);
  const workingScore = calculateDecayScore(workingMemory);

  assert.ok(
    semanticScore > workingScore,
    `Semantic score (${semanticScore}) should be higher than working (${workingScore})`,
  );
});

test('calculateDecayScore rewards high retrieval count', () => {
  const highRetrievalMemory = createTestMemory({
    stats: {
      accessCount: 0,
      retrievalCount: 20,
    },
  });

  const lowRetrievalMemory = createTestMemory({
    stats: {
      accessCount: 0,
      retrievalCount: 1,
    },
  });

  const highScore = calculateDecayScore(highRetrievalMemory);
  const lowScore = calculateDecayScore(lowRetrievalMemory);

  assert.ok(
    highScore > lowScore,
    `High retrieval score (${highScore}) should be higher than low retrieval (${lowScore})`,
  );
});

test('calculateDecayScore respects custom weights', () => {
  const memory = createTestMemory();

  const defaultScore = calculateDecayScore(memory);
  const customScore = calculateDecayScore(memory, {
    importance: 0.8,
    recency: 0.1,
  });

  assert.notEqual(defaultScore, customScore, 'Custom weights should produce different score');
});

test('calculateDecayScore returns value between 0 and 1', () => {
  const memory = createTestMemory();
  const score = calculateDecayScore(memory);

  assert.ok(score >= 0, `Score should be >= 0, got ${score}`);
  assert.ok(score <= 1, `Score should be <= 1, got ${score}`);
});

test('shouldArchive returns true for low decay score', () => {
  const memory = createTestMemory({
    timestamps: {
      createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    },
    stats: {
      accessCount: 0,
      retrievalCount: 0,
    },
    scores: {
      confidence: 0.3,
      importance: 0.3,
      explicitness: 0.3,
    },
  });

  const score = calculateDecayScore(memory);
  assert.ok(shouldArchive(score), `Memory with score ${score} should be archived`);
});

test('shouldArchive returns false for high decay score', () => {
  const memory = createTestMemory({
    stats: {
      accessCount: 10,
      retrievalCount: 10,
    },
    scores: {
      confidence: 0.9,
      importance: 0.9,
      explicitness: 0.9,
    },
  });

  const score = calculateDecayScore(memory);
  assert.ok(!shouldArchive(score), `Memory with score ${score} should not be archived`);
});

test('shouldMigrateToEpisodic returns true for old working memory', () => {
  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
  const memory = createTestMemory({
    lifecycle: 'working',
    timestamps: {
      createdAt: tenDaysAgo,
      updatedAt: tenDaysAgo,
    },
  });

  assert.ok(shouldMigrateToEpisodic(memory), 'Old working memory should migrate to episodic');
});

test('shouldMigrateToEpisodic returns false for recent working memory', () => {
  const memory = createTestMemory({
    lifecycle: 'working',
  });

  assert.ok(!shouldMigrateToEpisodic(memory), 'Recent working memory should not migrate');
});

test('shouldMigrateToEpisodic returns false for non-working memory', () => {
  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
  const memory = createTestMemory({
    lifecycle: 'episodic',
    timestamps: {
      createdAt: tenDaysAgo,
      updatedAt: tenDaysAgo,
    },
  });

  assert.ok(!shouldMigrateToEpisodic(memory), 'Non-working memory should not migrate to episodic');
});

test('shouldMigrateToSemantic returns true for frequently retrieved important episodic memory', () => {
  const memory = createTestMemory({
    lifecycle: 'episodic',
    stats: {
      accessCount: 5,
      retrievalCount: 5,
    },
    scores: {
      confidence: 0.9,
      importance: 0.9,
      explicitness: 0.9,
    },
  });

  assert.ok(shouldMigrateToSemantic(memory), 'Frequently retrieved important memory should migrate to semantic');
});

test('shouldMigrateToSemantic returns false for low retrieval episodic memory', () => {
  const memory = createTestMemory({
    lifecycle: 'episodic',
    stats: {
      accessCount: 0,
      retrievalCount: 1,
    },
    scores: {
      confidence: 0.9,
      importance: 0.9,
      explicitness: 0.9,
    },
  });

  assert.ok(!shouldMigrateToSemantic(memory), 'Low retrieval memory should not migrate to semantic');
});

test('shouldMigrateToSemantic returns false for low importance episodic memory', () => {
  const memory = createTestMemory({
    lifecycle: 'episodic',
    stats: {
      accessCount: 5,
      retrievalCount: 5,
    },
    scores: {
      confidence: 0.5,
      importance: 0.5,
      explicitness: 0.5,
    },
  });

  assert.ok(!shouldMigrateToSemantic(memory), 'Low importance memory should not migrate to semantic');
});

test('shouldMigrateToSemantic returns false for non-episodic memory', () => {
  const memory = createTestMemory({
    lifecycle: 'working',
    stats: {
      accessCount: 10,
      retrievalCount: 10,
    },
    scores: {
      confidence: 0.9,
      importance: 0.9,
      explicitness: 0.9,
    },
  });

  assert.ok(!shouldMigrateToSemantic(memory), 'Non-episodic memory should not migrate to semantic');
});

test('DEFAULT_DECAY_WEIGHTS sum to 1.0', () => {
  const sum = Object.values(DEFAULT_DECAY_WEIGHTS).reduce((acc, weight) => acc + weight, 0);
  assert.ok(Math.abs(sum - 1.0) < 0.001, `Weights should sum to 1.0, got ${sum}`);
});
