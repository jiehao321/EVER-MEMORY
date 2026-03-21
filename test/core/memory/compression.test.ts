import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type Database from 'better-sqlite3';
import { MemoryCompressionService } from '../../../src/core/memory/compression.js';
import { MemoryRepository } from '../../../src/storage/memoryRepo.js';
import { RelationRepository } from '../../../src/storage/relationRepo.js';
import { buildMemory, createInMemoryDb } from '../../storage/helpers.js';

describe('MemoryCompressionService', () => {
  let db: Database.Database;
  let memoryRepo: MemoryRepository;
  let relationRepo: RelationRepository;
  let service: MemoryCompressionService;

  beforeEach(() => {
    db = createInMemoryDb();
    memoryRepo = new MemoryRepository(db);
    relationRepo = new RelationRepository(db);
    service = new MemoryCompressionService(memoryRepo, relationRepo);
  });

  afterEach(() => {
    db.close();
  });

  it('skips compression when there are too few active memories', () => {
    memoryRepo.insert(buildMemory({ id: 'm1', content: 'single preference only' }));

    const result = service.compress();

    assert.deepEqual(result, {
      clustersFound: 0,
      memoriesCompressed: 0,
      summariesCreated: 0,
      skipped: true,
      reason: 'insufficient_memories',
    });
  });

  it('compresses a similar cluster into a summary and archives originals', () => {
    memoryRepo.insert(buildMemory({ id: 'm1', content: 'user prefers dark mode theme', type: 'preference' }));
    memoryRepo.insert(buildMemory({ id: 'm2', content: 'user prefers dark mode interface', type: 'preference' }));
    memoryRepo.insert(buildMemory({ id: 'm3', content: 'user prefers dark mode display', type: 'preference' }));
    memoryRepo.insert(buildMemory({ id: 'm4', content: 'user likes cats', type: 'fact' }));

    const result = service.compress({ minClusterSize: 3, similarityThreshold: 0.7 });

    assert.equal(result.skipped, false);
    assert.equal(result.clustersFound, 1);
    assert.equal(result.memoriesCompressed, 3);
    assert.equal(result.summariesCreated, 1);

    assert.equal(memoryRepo.findById('m1')?.state.archived, true);
    assert.equal(memoryRepo.findById('m2')?.state.archived, true);
    assert.equal(memoryRepo.findById('m3')?.state.archived, true);

    const activePreferences = memoryRepo.search({
      types: ['preference'],
      activeOnly: true,
      archived: false,
      limit: 10,
    });
    assert.equal(activePreferences.length, 1);
    assert.equal(activePreferences[0]?.source.kind, 'summary');
    assert.equal(activePreferences[0]?.sourceGrade, 'derived');
    assert.match(activePreferences[0]?.content ?? '', /dark mode/);
  });

  it('does not mutate stored memories during dry run', () => {
    memoryRepo.insert(buildMemory({ id: 'm1', content: 'user prefers dark mode theme', type: 'preference' }));
    memoryRepo.insert(buildMemory({ id: 'm2', content: 'user prefers dark mode interface', type: 'preference' }));
    memoryRepo.insert(buildMemory({ id: 'm3', content: 'user prefers dark mode display', type: 'preference' }));

    const result = service.compress({ dryRun: true, minClusterSize: 3, similarityThreshold: 0.7 });

    assert.equal(result.skipped, false);
    assert.equal(result.clustersFound, 1);
    assert.equal(result.memoriesCompressed, 0);
    assert.equal(result.summariesCreated, 0);
    assert.equal(memoryRepo.search({ activeOnly: true, archived: false, limit: 10 }).length, 3);
  });
});
