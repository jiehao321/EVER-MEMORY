import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import type Database from 'better-sqlite3';
import { ProfileRepository } from '../../src/storage/profileRepo.js';
import { buildProfile, createInMemoryDb } from './helpers.js';

describe('ProfileRepository', () => {
  let db: Database.Database | undefined;

  afterEach(() => db?.close());

  it('creates and updates a projected profile', () => {
    db = createInMemoryDb();
    const repo = new ProfileRepository(db);
    repo.upsert(buildProfile({ userId: 'u1', behaviorHints: ['be concise'] }));
    repo.upsert(buildProfile({
      userId: 'u1',
      updatedAt: '2024-02-01T00:00:00.000Z',
      behaviorHints: ['be concise', 'prefer bullets'],
      stable: {
        explicitPreferences: {
          language: { value: 'zh-CN', source: 'stable_explicit', canonical: true, evidenceRefs: ['msg-1'] },
        },
        explicitConstraints: [],
      },
    }));

    const profile = repo.getByUserId('u1');
    assert.equal(profile?.updatedAt, '2024-02-01T00:00:00.000Z');
    assert.deepEqual(profile?.behaviorHints, ['be concise', 'prefer bullets']);
    assert.equal(profile?.stable.explicitPreferences.language?.value, 'zh-CN');
  });

  it('returns null for missing users', () => {
    db = createInMemoryDb();
    const repo = new ProfileRepository(db);
    assert.equal(repo.getByUserId('missing-user'), null);
  });
});
