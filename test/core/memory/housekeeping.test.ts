import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { initializeEverMemory } from '../../../src/index.js';
import type { MemoryItem, MemoryScope } from '../../../src/types.js';
import { createTempDbPath } from '../../helpers.js';

function createMemory(
  scope: MemoryScope,
  content: string,
  overrides: Partial<MemoryItem> = {},
): MemoryItem {
  const now = overrides.timestamps?.updatedAt ?? new Date().toISOString();
  return {
    id: overrides.id ?? randomUUID(),
    content,
    type: overrides.type ?? 'constraint',
    lifecycle: overrides.lifecycle ?? 'semantic',
    source: overrides.source ?? { kind: 'manual', actor: 'user' },
    scope,
    scores: overrides.scores ?? {
      confidence: 0.8,
      importance: 0.5,
      explicitness: 0.8,
    },
    timestamps: {
      createdAt: overrides.timestamps?.createdAt ?? now,
      updatedAt: now,
      lastAccessedAt: overrides.timestamps?.lastAccessedAt,
    },
    state: overrides.state ?? {
      active: true,
      archived: false,
    },
    evidence: overrides.evidence ?? {
      references: [],
    },
    tags: overrides.tags ?? [],
    relatedEntities: overrides.relatedEntities ?? [],
    stats: overrides.stats ?? {
      accessCount: 0,
      retrievalCount: 0,
    },
  };
}

test('housekeeping merges near duplicates, archives stale memories, and reinforces high-frequency items', async () => {
  const databasePath = createTempDbPath('housekeeping-run');
  const app = initializeEverMemory({ databasePath });
  const scope = { userId: 'u-housekeep-1', project: 'evermemory' };
  const staleIso = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();

  const recent = createMemory(scope, '部署前必须确认回滚方案，避免高风险误操作。', {
    id: 'recent-keep',
    scores: {
      confidence: 0.96,
      importance: 0.7,
      explicitness: 0.95,
    },
    timestamps: {
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-10T00:00:00.000Z',
    },
  });
  const duplicate = createMemory(scope, '部署前必须确认回滚方案，避免高风险误操作！！', {
    id: 'recent-dup',
    scores: {
      confidence: 0.7,
      importance: 0.4,
      explicitness: 0.7,
    },
    timestamps: {
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-10T00:00:00.000Z',
    },
  });
  const stale = createMemory(scope, '45 天前的会话总结。', {
    id: 'stale-1',
    lifecycle: 'episodic',
    timestamps: {
      createdAt: staleIso,
      updatedAt: staleIso,
      lastAccessedAt: staleIso,
    },
    stats: {
      accessCount: 1,
      retrievalCount: 0,
    },
  });
  const frequent = createMemory(scope, '高频命中的长期规则。', {
    id: 'freq-1',
    scores: {
      confidence: 0.8,
      importance: 0.92,
      explicitness: 0.8,
    },
    stats: {
      accessCount: 6,
      retrievalCount: 3,
    },
  });

  app.memoryRepo.insert(recent);
  app.memoryRepo.insert(duplicate);
  app.memoryRepo.insert(stale);
  app.memoryRepo.insert(frequent);

  const result = await app.housekeeping(scope);

  assert.equal(result.mergedCount, 1);
  assert.equal(result.archivedCount, 1);
  assert.equal(result.reinforcedCount, 1);
  assert.ok(result.durationMs >= 0);

  const duplicateAfter = app.memoryRepo.findById('recent-dup');
  assert.equal(duplicateAfter?.state.archived, true);
  assert.equal(duplicateAfter?.state.active, false);
  assert.equal(duplicateAfter?.state.supersededBy, 'recent-keep');

  const staleAfter = app.memoryRepo.findById('stale-1');
  assert.equal(staleAfter?.state.archived, true);
  assert.equal(staleAfter?.state.active, false);

  const frequentAfter = app.memoryRepo.findById('freq-1');
  assert.equal(frequentAfter?.scores.importance, 1);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('housekeeping runIfNeeded skips rerun within 24 hours', async () => {
  const databasePath = createTempDbPath('housekeeping-run-if-needed');
  const app = initializeEverMemory({ databasePath });
  const scope = { userId: 'u-housekeep-2', project: 'evermemory' };

  app.memoryRepo.insert(createMemory(scope, '需要保留的记忆', { id: 'memory-1' }));

  const first = await app.housekeepingService.runIfNeeded(scope);
  assert.ok(first);

  const second = await app.housekeepingService.runIfNeeded(scope, new Date().toISOString());
  assert.equal(second, null);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});
