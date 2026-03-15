import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import type Database from 'better-sqlite3';
import { ExperienceRepository } from '../../src/storage/experienceRepo.js';
import { buildExperience, createInMemoryDb } from './helpers.js';

describe('ExperienceRepository', () => {
  let db: Database.Database | undefined;

  afterEach(() => db?.close());

  it('creates experiences and lists them by session id', () => {
    db = createInMemoryDb();
    const repo = new ExperienceRepository(db);
    repo.insert(buildExperience({ id: 'exp-1', sessionId: 'session-1', createdAt: '2024-01-01T00:00:00.000Z' }));
    repo.insert(buildExperience({ id: 'exp-2', sessionId: 'session-1', createdAt: '2024-01-02T00:00:00.000Z' }));
    repo.insert(buildExperience({ id: 'exp-3', sessionId: 'session-2', createdAt: '2024-01-03T00:00:00.000Z' }));

    const sessionLogs = repo.listRecentBySession('session-1', 10);
    assert.deepEqual(sessionLogs.map((item) => item.id), ['exp-2', 'exp-1']);
  });

  it('supports empty session ids without throwing', () => {
    db = createInMemoryDb();
    const repo = new ExperienceRepository(db);
    repo.insert(buildExperience({ id: 'exp-empty', sessionId: '' }));

    assert.equal(repo.findById('exp-empty')?.sessionId, '');
    assert.equal(repo.listRecentBySession('', 10).length, 1);
    assert.equal(repo.count(''), 1);
  });
});
