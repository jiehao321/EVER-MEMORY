import test from 'node:test';
import assert from 'node:assert/strict';
import { evermemoryExport, evermemoryImport } from '../../src/tools/transfer.js';
import { MemoryTransferService } from '../../src/core/memory/transfer.js';
import { MemoryRepository } from '../../src/storage/memoryRepo.js';
import { DebugRepository } from '../../src/storage/debugRepo.js';
import { createInMemoryDb, buildMemory } from '../storage/helpers.js';
import type { MemoryScope } from '../../src/types.js';

function makeFixture() {
  const db = createInMemoryDb();
  const memoryRepo = new MemoryRepository(db);
  const debugRepo = new DebugRepository(db);
  const transferService = new MemoryTransferService(memoryRepo, debugRepo);
  return { db, memoryRepo, debugRepo, transferService };
}

const scope: MemoryScope = { userId: 'u-transfer-1', project: 'proj-transfer' };

test('export mode returns serialized memory data', () => {
  const { transferService, memoryRepo } = makeFixture();
  const memory = buildMemory({
    content: 'Export this memory',
    type: 'fact',
    scope,
  });
  memoryRepo.insert(memory);

  const result = evermemoryExport(transferService, { scope });

  assert.equal(result.snapshot.format, 'evermemory.snapshot.v1');
  assert.equal(result.snapshot.total, 1);
  assert.equal(result.snapshot.items[0]?.id, memory.id);
  assert.equal(result.summary.exported, 1);
  assert.equal(result.summary.includeArchived, false);
});

test('import review mode returns preview', () => {
  const { transferService } = makeFixture();
  const imported = buildMemory({
    content: 'Import preview item',
    scope,
  });

  const result = evermemoryImport(transferService, {
    mode: 'review',
    snapshot: {
      format: 'evermemory.snapshot.v1',
      generatedAt: '2026-03-31T00:00:00.000Z',
      total: 1,
      items: [imported],
    },
  });

  assert.equal(result.mode, 'review');
  assert.equal(result.applied, false);
  assert.equal(result.total, 1);
  assert.equal(result.toCreate, 1);
  assert.equal(result.imported, 0);
  assert.deepEqual(result.rejected, []);
});

test('import with empty data is handled gracefully', () => {
  const { transferService } = makeFixture();

  const result = evermemoryImport(transferService, {
    snapshot: {
      format: 'evermemory.snapshot.v1',
      generatedAt: '2026-03-31T00:00:00.000Z',
      total: 0,
      items: [],
    },
  });

  assert.equal(result.mode, 'review');
  assert.equal(result.applied, false);
  assert.equal(result.total, 0);
  assert.equal(result.summary.totalRequested, 0);
  assert.deepEqual(result.rejected, []);
});

test('import with invalid snapshot format returns structured rejection', () => {
  const { transferService } = makeFixture();

  const result = evermemoryImport(transferService, {
    snapshot: {
      format: 'invalid.snapshot.v1' as 'evermemory.snapshot.v1',
      generatedAt: '2026-03-31T00:00:00.000Z',
      total: 0,
      items: [],
    },
  });

  assert.equal(result.applied, false);
  assert.equal(result.rejected[0]?.reason, 'invalid_snapshot_format');
});
