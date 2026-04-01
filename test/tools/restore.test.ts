import test from 'node:test';
import assert from 'node:assert/strict';
import { evermemoryRestore } from '../../src/tools/restore.js';
import { MemoryArchiveService } from '../../src/core/memory/archive.js';
import { MemoryRepository } from '../../src/storage/memoryRepo.js';
import { DebugRepository } from '../../src/storage/debugRepo.js';
import { createInMemoryDb, buildMemory } from '../storage/helpers.js';
import type { MemoryScope } from '../../src/types.js';

function makeFixture() {
  const db = createInMemoryDb();
  const memoryRepo = new MemoryRepository(db);
  const debugRepo = new DebugRepository(db);
  const archiveService = new MemoryArchiveService(memoryRepo, debugRepo);
  return { db, memoryRepo, debugRepo, archiveService };
}

const scope: MemoryScope = { userId: 'u-restore-1', project: 'proj-restore' };

test('restore archived memory returns success result', () => {
  const { archiveService, memoryRepo } = makeFixture();
  const archived = buildMemory({
    content: 'Archived deployment note',
    lifecycle: 'archive',
    scope,
    state: {
      active: false,
      archived: true,
    },
  });
  memoryRepo.insert(archived);

  const result = evermemoryRestore(archiveService, {
    ids: [archived.id],
    mode: 'apply',
    approved: true,
    targetLifecycle: 'episodic',
  });

  const restored = memoryRepo.findById(archived.id);
  assert.equal(result.applied, true);
  assert.equal(result.restored, 1);
  assert.equal(result.restorable, 1);
  assert.equal(result.rejected.length, 0);
  assert.equal(restored?.state.archived, false);
  assert.equal(restored?.lifecycle, 'episodic');
});

test('restore non-existent ID returns error response', () => {
  const { archiveService } = makeFixture();

  const result = evermemoryRestore(archiveService, {
    ids: ['missing-id'],
    mode: 'apply',
    approved: true,
  });

  assert.equal(result.applied, true);
  assert.equal(result.restorable, 0);
  assert.equal(result.restored, 0);
  assert.deepEqual(result.rejected, [{ id: 'missing-id', reason: 'not_found' }]);
});

test('restore with no ids returns structured rejection', () => {
  const { archiveService } = makeFixture();

  const result = evermemoryRestore(archiveService, {
    ids: [],
  });

  assert.equal(result.applied, false);
  assert.equal(result.rejected[0]?.reason, 'no_ids');
});
