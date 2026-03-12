import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { initializeEverMemory } from '../src/index.js';
import { createTempDbPath } from './helpers.js';

test('lifecycle maintenance dedupes near-identical memory and archives duplicate noise', () => {
  const databasePath = createTempDbPath('lifecycle-dedupe');
  const app = initializeEverMemory({ databasePath });

  const first = app.evermemoryStore({
    content: '部署前先确认回滚方案，避免高风险误操作。',
    type: 'constraint',
    scope: { userId: 'u-life-1', project: 'evermemory' },
  });
  const second = app.evermemoryStore({
    content: '  部署前先确认回滚方案，避免高风险误操作！！！ ',
    type: 'constraint',
    scope: { userId: 'u-life-1', project: 'evermemory' },
  });

  assert.equal(first.accepted, true);
  assert.equal(second.accepted, true);

  const recall = app.evermemoryRecall({
    query: '回滚方案',
    scope: { userId: 'u-life-1', project: 'evermemory' },
    mode: 'keyword',
    limit: 10,
  });
  assert.equal(recall.total, 1);

  const archived = app.memoryRepo.search({
    scope: { userId: 'u-life-1', project: 'evermemory' },
    archived: true,
    limit: 10,
  });
  assert.ok(archived.length >= 1);
  assert.equal(archived[0]?.lifecycle, 'archive');
  assert.ok(archived[0]?.state.supersededBy);

  const mergedEvents = app.debugRepo.listRecent('memory_merged', 10);
  assert.ok(mergedEvents.length >= 1);

  const status = app.evermemoryStatus({ userId: 'u-life-1' });
  assert.equal(status.memoryCount, 2);
  assert.equal(status.archivedMemoryCount, 1);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('lifecycle maintenance archives stale episodic memory in follow-up writes', () => {
  const databasePath = createTempDbPath('lifecycle-archive');
  const app = initializeEverMemory({ databasePath });

  const staleIso = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
  const stale = app.memoryService.store({
    content: '阶段复盘：这是 45 天前的会话记录。',
    type: 'summary',
    lifecycle: 'episodic',
    scope: { userId: 'u-life-2' },
    source: { kind: 'manual', actor: 'user' },
    createdAt: staleIso,
    updatedAt: staleIso,
  });
  assert.equal(stale.accepted, true);
  const staleMemoryId = stale.memory?.id;
  assert.ok(staleMemoryId);

  app.evermemoryStore({
    content: '最新约束：输出前先给简要结论。',
    type: 'constraint',
    scope: { userId: 'u-life-2' },
  });

  const staleAfter = staleMemoryId ? app.memoryRepo.findById(staleMemoryId) : null;
  assert.ok(staleAfter);
  assert.equal(staleAfter?.state.archived, true);
  assert.equal(staleAfter?.state.active, false);
  assert.equal(staleAfter?.lifecycle, 'archive');

  const archiveEvents = app.debugRepo.listRecent('memory_archived', 10);
  assert.ok(archiveEvents.length >= 1);
  assert.equal(archiveEvents[0]?.payload.reason, 'stale_episodic');

  const status = app.evermemoryStatus({ userId: 'u-life-2' });
  assert.ok((status.archivedMemoryCount ?? 0) >= 1);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('lifecycle consolidate is idempotent for already-processed scope', () => {
  const databasePath = createTempDbPath('lifecycle-idempotent');
  const app = initializeEverMemory({ databasePath });

  app.evermemoryStore({
    content: '部署前先确认回滚方案，避免高风险误操作。',
    type: 'constraint',
    scope: { userId: 'u-life-3', project: 'evermemory' },
  });
  app.evermemoryStore({
    content: '部署前先确认回滚方案，避免高风险误操作！！！',
    type: 'constraint',
    scope: { userId: 'u-life-3', project: 'evermemory' },
  });

  const staleIso = new Date(Date.now() - 50 * 24 * 60 * 60 * 1000).toISOString();
  app.memoryService.store({
    content: '历史会话记录：50 天前。',
    type: 'summary',
    lifecycle: 'episodic',
    scope: { userId: 'u-life-3', project: 'evermemory' },
    source: { kind: 'manual', actor: 'user' },
    createdAt: staleIso,
    updatedAt: staleIso,
  });

  const first = app.evermemoryConsolidate({
    mode: 'deep',
    scope: { userId: 'u-life-3', project: 'evermemory' },
  });
  assert.ok(first.processed >= 1);
  const statusAfterFirst = app.evermemoryStatus({ userId: 'u-life-3' });

  const second = app.evermemoryConsolidate({
    mode: 'deep',
    scope: { userId: 'u-life-3', project: 'evermemory' },
  });
  assert.equal(second.merged, 0);
  assert.equal(second.archivedStale, 0);
  const statusAfterSecond = app.evermemoryStatus({ userId: 'u-life-3' });
  assert.equal(statusAfterSecond.memoryCount, statusAfterFirst.memoryCount);
  assert.equal(statusAfterSecond.activeMemoryCount, statusAfterFirst.activeMemoryCount);
  assert.equal(statusAfterSecond.archivedMemoryCount, statusAfterFirst.archivedMemoryCount);

  const active = app.memoryRepo.search({
    scope: { userId: 'u-life-3', project: 'evermemory' },
    archived: false,
    activeOnly: true,
    limit: 20,
  });
  const archived = app.memoryRepo.search({
    scope: { userId: 'u-life-3', project: 'evermemory' },
    archived: true,
    limit: 20,
  });
  assert.equal(active.length, 1);
  assert.ok(archived.length >= 2);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});
