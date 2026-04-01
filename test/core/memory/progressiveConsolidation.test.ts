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

  it('does not trigger consolidation when active memory count is below threshold', () => {
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

  it('triggers consolidation when count fallback reports enough active memories', () => {
    for (let i = 0; i < 100; i += 1) {
      memoryRepo.insert(buildMemory({ id: `m${i}`, content: `memory ${i}` }));
    }

    const compressionResult = {
      clustersFound: 1,
      memoriesCompressed: 3,
      summariesCreated: 1,
      skipped: false,
    };
    let compressCalls = 0;
    const compressionService = {
      compress() {
        compressCalls += 1;
        return compressionResult;
      },
    };

    const service = new ProgressiveConsolidationService(
      compressionService as any,
      memoryRepo,
    );

    for (let i = 0; i < 4; i += 1) {
      assert.deepEqual(service.onMessage('session-2'), { triggered: false });
    }

    assert.deepEqual(service.onMessage('session-2'), {
      triggered: true,
      result: compressionResult,
    });
    assert.equal(compressCalls, 1);
  });

  it('logs compression errors and returns not triggered', () => {
    for (let i = 0; i < 100; i += 1) {
      memoryRepo.insert(buildMemory({ id: `err${i}`, content: `memory ${i}` }));
    }

    const debugEvents: Array<{ kind: string; entityId: string | undefined; payload: Record<string, unknown> }> = [];
    const compressionService = {
      compress() {
        throw new Error('compression failed');
      },
    };
    const debugRepo = {
      log(kind: string, entityId: string | undefined, payload: Record<string, unknown>) {
        debugEvents.push({ kind, entityId, payload });
      },
    };

    const service = new ProgressiveConsolidationService(
      compressionService as any,
      memoryRepo,
      debugRepo as any,
    );

    for (let i = 0; i < 4; i += 1) {
      assert.deepEqual(service.onMessage('session-3'), { triggered: false });
    }

    assert.deepEqual(service.onMessage('session-3'), { triggered: false });
    assert.deepEqual(debugEvents, [
      {
        kind: 'progressive_consolidation_error',
        entityId: 'session-3',
        payload: { error: 'compression failed' },
      },
    ]);
  });
});
