import test from 'node:test';
import assert from 'node:assert/strict';
import { evermemoryConsolidate } from '../../src/tools/consolidate.js';
import { MemoryService } from '../../src/core/memory/service.js';
import { MemoryLifecycleService } from '../../src/core/memory/lifecycle.js';
import { MemoryRepository } from '../../src/storage/memoryRepo.js';
import { DebugRepository } from '../../src/storage/debugRepo.js';
import { createInMemoryDb, buildMemory } from '../storage/helpers.js';
import type { MemoryScope } from '../../src/types.js';

function makeFixture() {
  const db = createInMemoryDb();
  const memoryRepo = new MemoryRepository(db);
  const debugRepo = new DebugRepository(db);
  const lifecycleService = new MemoryLifecycleService(memoryRepo, debugRepo);
  const memoryService = new MemoryService(memoryRepo, debugRepo, { lifecycleService });
  return { db, memoryRepo, debugRepo, memoryService };
}

const scope: MemoryScope = { userId: 'u-consolidate-1' };
const nowIso = () => new Date().toISOString();
const staleIso = () => new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();

// ── dryRun ─────────────────────────────────────────────────────────────────

test('consolidate dryRun: returns dryRun flag in result', async () => {
  const { memoryService, memoryRepo } = makeFixture();

  memoryRepo.insert(buildMemory({ content: '内容一', scope }));
  memoryRepo.insert(buildMemory({ content: '内容二', scope }));

  const result = await evermemoryConsolidate(memoryService, memoryRepo, undefined, {
    scope,
    dryRun: true,
  });

  assert.equal(result.dryRun, true);
});

test('consolidate dryRun: does not execute lifecycle consolidation (merged stays 0)', async () => {
  const { memoryService, memoryRepo } = makeFixture();

  // Insert near-duplicate pair that would normally be merged
  const stale = staleIso();
  const dupA = buildMemory({
    content: '部署前先确认回滚方案，避免高风险误操作。',
    scope,
    timestamps: { createdAt: nowIso(), updatedAt: nowIso() },
  });
  const dupB = buildMemory({
    content: '部署前先确认回滚方案，避免高风险误操作！！',
    scope,
    timestamps: { createdAt: nowIso(), updatedAt: nowIso() },
  });
  const staleItem = buildMemory({
    content: '45天前的会话',
    scope,
    lifecycle: 'episodic',
    timestamps: { createdAt: stale, updatedAt: stale },
  });
  memoryRepo.insert(dupA);
  memoryRepo.insert(dupB);
  memoryRepo.insert(staleItem);

  const result = await evermemoryConsolidate(memoryService, memoryRepo, undefined, {
    scope,
    dryRun: true,
  });

  // dryRun skips the consolidation step entirely
  assert.equal(result.merged, 0);
  assert.equal(result.archivedStale, 0);

  // Memories must be untouched
  const a = memoryRepo.findById(dupA.id);
  const b = memoryRepo.findById(dupB.id);
  const s = memoryRepo.findById(staleItem.id);
  assert.equal(a?.state.archived, false, 'dupA should not be archived in dryRun');
  assert.equal(b?.state.archived, false, 'dupB should not be archived in dryRun');
  assert.equal(s?.state.archived, false, 'staleItem should not be archived in dryRun');
});

test('consolidate dryRun: returns processed count from conflict scan', async () => {
  const { memoryService, memoryRepo } = makeFixture();

  memoryRepo.insert(buildMemory({ content: '记忆一', scope }));
  memoryRepo.insert(buildMemory({ content: '记忆二', scope }));
  memoryRepo.insert(buildMemory({ content: '记忆三', scope }));

  const result = await evermemoryConsolidate(memoryService, memoryRepo, undefined, {
    scope,
    dryRun: true,
  });

  assert.ok(result.processed >= 3, `Expected processed >= 3, got ${result.processed}`);
});

test('consolidate dryRun: preserves mode field from input', async () => {
  const { memoryService, memoryRepo } = makeFixture();

  const result = await evermemoryConsolidate(memoryService, memoryRepo, undefined, {
    scope,
    dryRun: true,
    mode: 'deep',
  });

  assert.equal(result.mode, 'deep');
});

test('consolidate dryRun: false (default) runs actual consolidation', async () => {
  const { memoryService, memoryRepo } = makeFixture();

  const stale = staleIso();
  // Insert a fresh semantic memory (non-episodic trigger) so the loop can
  // process it and — while doing so — archive the stale episodic item.
  memoryRepo.insert(buildMemory({
    content: '最近的语义记忆，用于触发合并循环。',
    scope,
    lifecycle: 'semantic',
    timestamps: { createdAt: nowIso(), updatedAt: nowIso() },
  }));
  memoryRepo.insert(buildMemory({
    content: '陈旧会话记忆，应被存档。',
    scope,
    lifecycle: 'episodic',
    timestamps: { createdAt: stale, updatedAt: stale },
    stats: { accessCount: 0, retrievalCount: 0 },
  }));

  const result = await evermemoryConsolidate(memoryService, memoryRepo, undefined, {
    scope,
    mode: 'daily',
  });

  assert.equal(result.dryRun, undefined);
  assert.ok(result.archivedStale >= 1, `Expected archivedStale >= 1, got ${result.archivedStale}`);
});

// ── autoResolveConflicts ───────────────────────────────────────────────────

test('consolidate autoResolveConflicts: resolvedCount is undefined when no conflicts detected', async () => {
  const { memoryService, memoryRepo } = makeFixture();

  memoryRepo.insert(buildMemory({ content: '完全不同的内容 alpha', scope }));
  memoryRepo.insert(buildMemory({ content: '完全不同的内容 beta', scope }));

  const result = await evermemoryConsolidate(memoryService, memoryRepo, undefined, {
    scope,
    autoResolveConflicts: true,
  });

  // With no semantic repo, conflict scan returns no pairs → resolvedCount stays undefined
  assert.equal(result.resolvedCount, undefined);
});

test('consolidate autoResolveConflicts: not applied during dryRun', async () => {
  const { memoryService, memoryRepo } = makeFixture();

  memoryRepo.insert(buildMemory({ content: '冲突内容 A', scope }));
  memoryRepo.insert(buildMemory({ content: '冲突内容 B', scope }));

  const result = await evermemoryConsolidate(memoryService, memoryRepo, undefined, {
    scope,
    dryRun: true,
    autoResolveConflicts: true,
  });

  // dryRun takes priority: no resolution should happen
  assert.equal(result.dryRun, true);
  assert.equal(result.merged, 0);
  assert.equal(result.archivedStale, 0);
});

// ── conflict scan output ───────────────────────────────────────────────────

test('consolidate: returns no detectedConflicts field when semantic repo is absent', async () => {
  const { memoryService, memoryRepo } = makeFixture();

  memoryRepo.insert(buildMemory({ content: '内容', scope }));

  const result = await evermemoryConsolidate(memoryService, memoryRepo, undefined, {
    scope,
  });

  // Without semanticRepo, scanConflicts returns only processed, no conflicts block
  assert.equal(result.detectedConflicts, undefined);
});

// ── mode propagation ───────────────────────────────────────────────────────

test('consolidate: mode defaults to daily', async () => {
  const { memoryService, memoryRepo } = makeFixture();

  const result = await evermemoryConsolidate(memoryService, memoryRepo, undefined, { scope });

  assert.equal(result.mode, 'daily');
});

test('consolidate: mode=deep is reflected in result', async () => {
  const { memoryService, memoryRepo } = makeFixture();

  const result = await evermemoryConsolidate(memoryService, memoryRepo, undefined, {
    scope,
    mode: 'deep',
  });

  assert.equal(result.mode, 'deep');
});
