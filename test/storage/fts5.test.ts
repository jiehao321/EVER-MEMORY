import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { CURRENT_SCHEMA_VERSION, runMigrations } from '../../src/storage/migrations.js';
import { MemoryRepository } from '../../src/storage/memoryRepo.js';
import { buildMemory, createInMemoryDb } from './helpers.js';

function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE name = ?
  `).get(tableName) as { name: string } | undefined;
  return row?.name === tableName;
}

describe('FTS5 migration and repository support', () => {
  let db: Database.Database | undefined;

  afterEach(() => db?.close());

  it('creates the FTS5 table on migration', () => {
    db = createInMemoryDb();

    assert.equal(CURRENT_SCHEMA_VERSION, 31);
    assert.equal(tableExists(db, 'memory_items_fts'), true);
  });

  it('keeps the FTS index in sync across insert, update, and delete', () => {
    db = createInMemoryDb();
    const repo = new MemoryRepository(db);
    const memory = buildMemory({
      id: 'fts-sync',
      content: 'alpha release note',
      tags: ['release'],
    });

    repo.insert(memory);
    let row = db.prepare('SELECT content, tags FROM memory_items_fts WHERE rowid = (SELECT rowid FROM memory_items WHERE id = ?)').get(memory.id) as {
      content: string;
      tags: string;
    };
    assert.equal(row.content, 'alpha release note');

    repo.update({
      ...memory,
      content: 'beta release note',
      tags: ['beta'],
    });
    row = db.prepare('SELECT content, tags FROM memory_items_fts WHERE rowid = (SELECT rowid FROM memory_items WHERE id = ?)').get(memory.id) as {
      content: string;
      tags: string;
    };
    assert.equal(row.content, 'beta release note');

    db.prepare('DELETE FROM memory_items WHERE id = ?').run(memory.id);
    const deleted = db.prepare('SELECT rowid FROM memory_items_fts WHERE rowid = (SELECT rowid FROM memory_items WHERE id = ?)').get(memory.id);
    assert.equal(deleted, undefined);
  });

  it('searchFts returns matching results', () => {
    db = createInMemoryDb();
    const repo = new MemoryRepository(db);
    repo.insert(buildMemory({ id: 'fts-hit-1', content: 'release plan includes rollback drill', tags: ['release'] }));
    repo.insert(buildMemory({ id: 'fts-hit-2', content: 'release checklist only', tags: ['checklist'] }));
    repo.insert(buildMemory({ id: 'fts-miss', content: 'garden checklist', tags: ['home'] }));

    const results = repo.searchFts('release plan', 5);
    assert.deepEqual(results.map((item: { id: string }) => item.id), ['fts-hit-1']);
  });

  it('searchFts handles special characters safely', () => {
    db = createInMemoryDb();
    const repo = new MemoryRepository(db);
    repo.insert(buildMemory({
      id: 'fts-special',
      content: 'release plan v2 rollout',
      tags: ['release:v2', 'rollout'],
    }));

    assert.doesNotThrow(() => repo.searchFts('release (plan) "v2": rollout*', 5));
    const results = repo.searchFts('release (plan) "v2": rollout*', 5);
    assert.equal(results[0]?.id, 'fts-special');
  });

  it('backfills FTS rows for existing memory data during migration', () => {
    db = createInMemoryDb();
    const repo = new MemoryRepository(db);
    repo.insert(buildMemory({
      id: 'fts-backfill',
      content: 'legacy migration content',
      tags: ['legacy'],
    }));

    db.exec(`
      DROP TRIGGER IF EXISTS memory_items_fts_insert;
      DROP TRIGGER IF EXISTS memory_items_fts_update;
      DROP TRIGGER IF EXISTS memory_items_fts_delete;
      DROP TABLE IF EXISTS memory_items_fts;
    `);
    db.prepare('UPDATE schema_version SET version = 30').run();

    const version = runMigrations(db);
    const rows = db.prepare(`
      SELECT content
      FROM memory_items_fts
      WHERE rowid = (SELECT rowid FROM memory_items WHERE id = ?)
    `).all('fts-backfill') as Array<{ content: string }>;

    assert.equal(version, 31);
    assert.deepEqual(rows.map((row) => row.content), ['legacy migration content']);
  });
});
