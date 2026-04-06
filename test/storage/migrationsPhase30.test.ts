import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { CURRENT_SCHEMA_VERSION, runMigrations } from '../../src/storage/migrations.js';

function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(tableName) as { name: string } | undefined;
  return row?.name === tableName;
}

test('phase 31 migrations add FTS5 support on top of Butler evolution tables', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  try {
    const version = runMigrations(db);

    assert.equal(version, 31);
    assert.equal(CURRENT_SCHEMA_VERSION, 31);
    assert.equal(tableExists(db, 'butler_evolution_log'), true);
    assert.equal(tableExists(db, 'butler_prompt_variants'), true);
    assert.equal(tableExists(db, 'butler_experiments'), true);
    assert.equal(tableExists(db, 'memory_items_fts'), true);
  } finally {
    db.close();
  }
});
