import test from 'node:test';
import assert from 'node:assert/strict';
import type { MemoryItem } from '../../../src/types.js';
import { embeddingManager } from '../../../src/embedding/manager.js';
import { detectConflicts, resolveConflict, type ConflictPair } from '../../../src/core/memory/conflict.js';

function createMemory(overrides: Partial<MemoryItem> = {}): MemoryItem {
  return {
    id: overrides.id ?? 'memory-default',
    content: overrides.content ?? '默认记忆',
    type: overrides.type ?? 'preference',
    lifecycle: overrides.lifecycle ?? 'semantic',
    source: overrides.source ?? { kind: 'manual', actor: 'user' },
    scope: overrides.scope ?? { userId: 'user-1', project: 'apollo' },
    scores: overrides.scores ?? { confidence: 0.9, importance: 0.7, explicitness: 1 },
    timestamps: overrides.timestamps ?? {
      createdAt: '2026-03-14T00:00:00.000Z',
      updatedAt: '2026-03-14T00:00:00.000Z',
    },
    state: overrides.state ?? { active: true, archived: false },
    evidence: overrides.evidence ?? { references: [] },
    tags: overrides.tags ?? ['user_preference'],
    relatedEntities: overrides.relatedEntities ?? [],
    stats: overrides.stats ?? { accessCount: 0, retrievalCount: 0 },
  };
}

test('detectConflicts returns conflict when similarity is in range and contradiction signals exist', async () => {
  const originalIsReady = embeddingManager.isReady;
  const originalEmbed = embeddingManager.embed;
  (embeddingManager.isReady as typeof embeddingManager.isReady) = () => true;
  (embeddingManager.embed as typeof embeddingManager.embed) = async () => ({
    values: new Float32Array([0.4, 0.6]),
    dimensions: 2,
  });

  const current = createMemory({
    id: 'memory-new',
    content: '用户偏好记录：部署 流程 要 保留 回滚 计划 记录 风险',
  });
  const existing = createMemory({
    id: 'memory-old',
    content: '用户偏好记录：部署 流程 不要 保留 回滚 计划 记录 风险',
    timestamps: {
      createdAt: '2026-03-13T00:00:00.000Z',
      updatedAt: '2026-03-13T00:00:00.000Z',
    },
  });

  try {
    const conflicts = await detectConflicts(
      current.id,
      current.content,
      {
        searchByCosine: async () => [{ memoryId: existing.id, score: 0.84 }],
      } as unknown as never,
      {
        findById: (id: string) => {
          if (id === current.id) {
            return current;
          }
          if (id === existing.id) {
            return existing;
          }
          return null;
        },
      } as unknown as never,
    );

    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0]?.memoryA.id, current.id);
    assert.equal(conflicts[0]?.memoryB.id, existing.id);
    assert.equal(conflicts[0]?.similarity, 0.84);
    assert.ok((conflicts[0]?.conflictScore ?? 0) > 0);
  } finally {
    embeddingManager.isReady = originalIsReady;
    embeddingManager.embed = originalEmbed;
  }
});

test('detectConflicts ignores candidates below similarity threshold', async () => {
  const originalIsReady = embeddingManager.isReady;
  const originalEmbed = embeddingManager.embed;
  (embeddingManager.isReady as typeof embeddingManager.isReady) = () => true;
  (embeddingManager.embed as typeof embeddingManager.embed) = async () => ({
    values: new Float32Array([0.1, 0.9]),
    dimensions: 2,
  });

  const current = createMemory({ id: 'memory-new-2', content: '部署 流程 要 保留 回滚 计划' });
  const existing = createMemory({ id: 'memory-old-2', content: '部署 流程 不要 保留 回滚 计划' });

  try {
    const conflicts = await detectConflicts(
      current.id,
      current.content,
      {
        searchByCosine: async () => [{ memoryId: existing.id, score: 0.74 }],
      } as unknown as never,
      {
        findById: (id: string) => (id === current.id ? current : id === existing.id ? existing : null),
      } as unknown as never,
    );
    assert.deepEqual(conflicts, []);
  } finally {
    embeddingManager.isReady = originalIsReady;
    embeddingManager.embed = originalEmbed;
  }
});

test('detectConflicts ignores near-duplicates above dedup threshold', async () => {
  const originalIsReady = embeddingManager.isReady;
  const originalEmbed = embeddingManager.embed;
  (embeddingManager.isReady as typeof embeddingManager.isReady) = () => true;
  (embeddingManager.embed as typeof embeddingManager.embed) = async () => ({
    values: new Float32Array([0.7, 0.3]),
    dimensions: 2,
  });

  const current = createMemory({ id: 'memory-new-3', content: '部署 流程 要 保留 回滚 计划' });
  const existing = createMemory({ id: 'memory-old-3', content: '部署 流程 不要 保留 回滚 计划' });

  try {
    const conflicts = await detectConflicts(
      current.id,
      current.content,
      {
        searchByCosine: async () => [{ memoryId: existing.id, score: 0.95 }],
      } as unknown as never,
      {
        findById: (id: string) => (id === current.id ? current : id === existing.id ? existing : null),
      } as unknown as never,
    );
    assert.deepEqual(conflicts, []);
  } finally {
    embeddingManager.isReady = originalIsReady;
    embeddingManager.embed = originalEmbed;
  }
});

test('resolveConflict keeps newer memory and tags the older one as conflict_resolved', async () => {
  const newer = createMemory({
    id: 'memory-newer',
    content: '用户偏好记录：部署 流程 要 保留 回滚 计划',
    timestamps: {
      createdAt: '2026-03-14T00:00:00.000Z',
      updatedAt: '2026-03-14T00:00:00.000Z',
    },
  });
  const older = createMemory({
    id: 'memory-older',
    content: '用户偏好记录：部署 流程 不要 保留 回滚 计划',
    timestamps: {
      createdAt: '2026-03-13T00:00:00.000Z',
      updatedAt: '2026-03-13T00:00:00.000Z',
    },
    tags: ['user_preference'],
  });
  const updates: MemoryItem[] = [];
  const pair: ConflictPair = {
    memoryA: newer,
    memoryB: older,
    similarity: 0.83,
    conflictScore: 0.9,
  };

  await resolveConflict(pair, {
    update(memory: MemoryItem) {
      updates.push(memory);
    },
  } as unknown as never);

  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.id, older.id);
  assert.ok(updates[0]?.tags.includes('conflict_resolved'));
  assert.ok(!updates[0]?.tags.includes('conflict_resolved') || !newer.tags.includes('conflict_resolved'));
});
