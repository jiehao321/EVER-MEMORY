import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import type Database from 'better-sqlite3';
import { MemoryRepository } from '../../src/storage/memoryRepo.js';
import { createInMemoryDb, buildMemory } from './helpers.js';

describe('MemoryRepository', () => {
  let db: Database.Database | undefined;

  afterEach(() => db?.close());

  it('writes and reads memory items, including empty and long content', () => {
    db = createInMemoryDb();
    const repo = new MemoryRepository(db);
    const empty = buildMemory({ id: 'mem-empty', content: '' });
    const long = buildMemory({ id: 'mem-long', content: 'x'.repeat(10_000) });

    repo.insert(empty);
    repo.insert(long);

    assert.equal(repo.findById('mem-empty')?.content, '');
    assert.equal(repo.findById('mem-long')?.content.length, 10_000);
    assert.equal(repo.findById('missing-id'), null);
  });

  it('filters by scope and truncates search results by limit', () => {
    db = createInMemoryDb();
    const repo = new MemoryRepository(db);
    const older = buildMemory({
      id: 'mem-1',
      content: 'alpha',
      scope: { userId: 'user-1', global: false },
      timestamps: { createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' },
    });
    const newer = buildMemory({
      id: 'mem-2',
      content: 'beta',
      scope: { userId: 'user-1', global: false },
      timestamps: { createdAt: '2024-01-02T00:00:00.000Z', updatedAt: '2024-01-02T00:00:00.000Z' },
    });
    const other = buildMemory({ id: 'mem-3', scope: { userId: 'user-2', global: false } });

    repo.insert(older);
    repo.insert(newer);
    repo.insert(other);

    const results = repo.search({ scope: { userId: 'user-1' }, limit: 1 });
    assert.deepEqual(results.map((item) => item.id), ['mem-2']);
  });

  it('updates content, tags, scores, and archived state', () => {
    db = createInMemoryDb();
    const repo = new MemoryRepository(db);
    const memory = buildMemory({ id: 'mem-update', tags: ['old'] });
    repo.insert(memory);

    repo.update({
      ...memory,
      content: 'updated content',
      tags: ['new', 'tag'],
      scores: { confidence: 0.9, importance: 0.8, explicitness: 0.7 },
      state: { active: false, archived: true, supersededBy: 'mem-next' },
    });

    const updated = repo.findById('mem-update');
    assert.equal(updated?.content, 'updated content');
    assert.deepEqual(updated?.tags, ['new', 'tag']);
    assert.deepEqual(updated?.scores, { confidence: 0.9, importance: 0.8, explicitness: 0.7 });
    assert.deepEqual(updated?.state, { active: false, archived: true, supersededBy: 'mem-next' });
  });

  it('rejects duplicate ids at insert time', () => {
    db = createInMemoryDb();
    const repo = new MemoryRepository(db);
    repo.insert(buildMemory({ id: 'mem-dup' }));

    assert.throws(() => repo.insert(buildMemory({ id: 'mem-dup' })), {
      name: 'StorageError',
    });
  });
});
