import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import type Database from 'better-sqlite3';
import { ReflectionRepository } from '../../src/storage/reflectionRepo.js';
import { buildReflection, createInMemoryDb } from './helpers.js';

describe('ReflectionRepository', () => {
  let db: Database.Database | undefined;

  afterEach(() => db?.close());

  it('creates reflections and lists them by trigger kind', () => {
    db = createInMemoryDb();
    const repo = new ReflectionRepository(db);
    repo.insert(buildReflection({
      id: 'ref-1',
      createdAt: '2024-01-01T00:00:00.000Z',
      trigger: { kind: 'manual-review', experienceIds: ['exp-1'] },
    }));
    repo.insert(buildReflection({
      id: 'ref-2',
      createdAt: '2024-01-02T00:00:00.000Z',
      trigger: { kind: 'manual-review', experienceIds: ['exp-2'] },
    }));
    repo.insert(buildReflection({
      id: 'ref-3',
      createdAt: '2024-01-03T00:00:00.000Z',
      trigger: { kind: 'success', experienceIds: ['exp-3'] },
    }));

    const manual = repo.listByTriggerKind('manual-review', 10);
    assert.deepEqual(manual.map((item) => item.id), ['ref-2', 'ref-1']);
  });

  it('keeps duplicate trigger kinds as separate records', () => {
    db = createInMemoryDb();
    const repo = new ReflectionRepository(db);
    repo.insert(buildReflection({ id: 'ref-a', trigger: { kind: 'manual-review', experienceIds: ['exp-a'] } }));
    repo.insert(buildReflection({ id: 'ref-b', trigger: { kind: 'manual-review', experienceIds: ['exp-b'] } }));

    assert.equal(repo.count('manual-review'), 2);
    assert.equal(repo.findById('missing-reflection'), null);
  });
});
