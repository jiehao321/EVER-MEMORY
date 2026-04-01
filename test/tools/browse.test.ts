import test from 'node:test';
import assert from 'node:assert/strict';
import { evermemoryBrowse } from '../../src/tools/browse.js';
import { MemoryRepository } from '../../src/storage/memoryRepo.js';
import { createInMemoryDb, buildMemory } from '../storage/helpers.js';
import type { MemoryScope } from '../../src/types.js';

function makeFixture() {
  const db = createInMemoryDb();
  const memoryRepo = new MemoryRepository(db);
  return { db, memoryRepo };
}

const scope: MemoryScope = { userId: 'u-browse-1', project: 'proj-browse' };

test('browse with default params returns array of memories', () => {
  const { memoryRepo } = makeFixture();
  const older = buildMemory({
    content: 'Older decision memory',
    type: 'decision',
    scope,
    timestamps: {
      createdAt: '2026-03-29T09:00:00.000Z',
      updatedAt: '2026-03-29T09:00:00.000Z',
    },
  });
  const newer = buildMemory({
    content: 'Latest fact memory',
    type: 'fact',
    scope,
    timestamps: {
      createdAt: '2026-03-30T09:00:00.000Z',
      updatedAt: '2026-03-30T10:00:00.000Z',
      lastAccessedAt: '2026-03-31T09:00:00.000Z',
    },
  });

  memoryRepo.insert(older);
  memoryRepo.insert(newer);

  const result = evermemoryBrowse(memoryRepo, { scope });

  assert.equal(result.total, 2);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0]?.id, newer.id);
  assert.equal(result.items[0]?.type, 'fact');
  assert.equal(result.items[0]?.lastAccessedAt, '2026-03-31T09:00:00.000Z');
  assert.match(result.summary, /^2 of 2 active memories\./);
});

test('browse with type filter returns filtered results', () => {
  const { memoryRepo } = makeFixture();
  memoryRepo.insert(buildMemory({ content: 'Fact memory', type: 'fact', scope }));
  memoryRepo.insert(buildMemory({ content: 'Preference memory', type: 'preference', scope }));
  memoryRepo.insert(buildMemory({ content: 'Decision memory', type: 'decision', scope }));

  const result = evermemoryBrowse(memoryRepo, {
    scope,
    type: 'decision',
  });

  assert.equal(result.total, 1);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.type, 'decision');
  assert.equal(result.items[0]?.content, 'Decision memory');
});

test('browse with empty DB returns empty array', () => {
  const { memoryRepo } = makeFixture();

  const result = evermemoryBrowse(memoryRepo, { scope });

  assert.deepEqual(result.items, []);
  assert.equal(result.total, 0);
  assert.equal(result.summary, '0 of 0 active memories.');
});

test('browse with invalid limit clamps to a valid value', () => {
  const { memoryRepo } = makeFixture();
  memoryRepo.insert(buildMemory({ content: 'One', scope }));
  memoryRepo.insert(buildMemory({ content: 'Two', scope }));

  const result = evermemoryBrowse(memoryRepo, {
    scope,
    limit: 0,
  });

  assert.equal(result.items.length, 1);
  assert.equal(result.total, 2);
});
