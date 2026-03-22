import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type Database from 'better-sqlite3';
import { ProgressiveConsolidationService } from '../../../src/core/memory/progressiveConsolidation.js';
import { MemoryRepository } from '../../../src/storage/memoryRepo.js';
import { buildMemory, createInMemoryDb } from '../../storage/helpers.js';

describe('ProgressiveConsolidationService', () => {
  let db: Database.Database;
  let memoryRepo: MemoryRepository;

  beforeEach(() => {
    db = createInMemoryDb();
    memoryRepo = new MemoryRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('does not trigger consolidation when active count cannot be measured accurately', () => {
    memoryRepo.insert(buildMemory({ id: 'm1', content: 'only one active memory' }));

    let compressCalls = 0;
    const compressionService = {
      compress() {
        compressCalls += 1;
        return { compressed: true };
      },
    };

    const service = new ProgressiveConsolidationService(
      compressionService as any,
      memoryRepo,
    );

    for (let i = 0; i < 4; i += 1) {
      assert.deepEqual(service.onMessage('session-1'), { triggered: false });
    }

    assert.deepEqual(service.onMessage('session-1'), { triggered: false });
    assert.equal(compressCalls, 0);
  });
});
