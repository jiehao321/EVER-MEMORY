import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import type Database from 'better-sqlite3';
import { DebugRepository } from '../../src/storage/debugRepo.js';
import { createInMemoryDb } from './helpers.js';

describe('DebugRepository', () => {
  let db: Database.Database | undefined;

  afterEach(() => db?.close());

  it('logs debug events and queries by event kind', () => {
    db = createInMemoryDb();
    const repo = new DebugRepository(db);
    repo.log('memory_archived', 'mem-1', { sessionId: 'session-1', detail: 'first' });
    repo.log('reflection_created', 'ref-1', { sessionId: 'session-1', detail: 'second' });

    const events = repo.listRecent('memory_archived', 10);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.entityId, 'mem-1');
    assert.equal(events[0]?.payload.sessionId, 'session-1');
  });

  it('handles large event volumes without dropping recent rows', () => {
    db = createInMemoryDb();
    const repo = new DebugRepository(db);
    for (let i = 0; i < 500; i += 1) {
      repo.log('memory_archived', `mem-${i}`, { index: i });
    }

    const latest = repo.listRecent('memory_archived', 25);
    assert.equal(latest.length, 25);
    const row = db.prepare('SELECT COUNT(*) AS count FROM debug_events').get() as { count: number };
    assert.equal(row.count, 500);
  });

  it('does not write debug events when disabled', () => {
    db = createInMemoryDb();
    const repo = new DebugRepository(db, false);

    repo.log('memory_archived', 'mem-1', { detail: 'ignored' });

    const row = db.prepare('SELECT COUNT(*) AS count FROM debug_events').get() as { count: number };
    assert.equal(row.count, 0);
    assert.deepEqual(repo.listRecent(), []);
  });
});
