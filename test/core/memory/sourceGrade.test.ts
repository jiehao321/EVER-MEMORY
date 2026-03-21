import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initializeEverMemory } from '../../../src/index.js';
import { createTempDbPath } from '../../helpers.js';
import { runMigrations } from '../../../src/storage/migrations.js';

test('sourceGrade: manual store defaults to primary', () => {
  const app = initializeEverMemory({ databasePath: createTempDbPath('sg-primary') });
  const result = app.evermemoryStore({
    content: '用户偏好：我喜欢简洁的回答',
    scope: { userId: 'u-sg-1' },
  });
  assert.ok(result.accepted);
  assert.equal(result.memory?.sourceGrade, 'primary');
  app.database.connection.close();
});

test('sourceGrade: explicit derived grade is persisted and retrievable', () => {
  const app = initializeEverMemory({ databasePath: createTempDbPath('sg-derived') });
  const result = app.evermemoryStore({
    content: '项目状态更新：Phase 2 进行中，测试通过率 100%',
    scope: { userId: 'u-sg-2' },
    sourceGrade: 'derived',
  });
  assert.ok(result.accepted);
  assert.equal(result.memory?.sourceGrade, 'derived');

  // Verify persisted in DB
  const fetched = app.memoryRepo.findById(result.memory!.id);
  assert.equal(fetched?.sourceGrade, 'derived');
  app.database.connection.close();
});

test('sourceGrade: explicit inferred grade is persisted', () => {
  const app = initializeEverMemory({ databasePath: createTempDbPath('sg-inferred') });
  const result = app.evermemoryStore({
    content: '根据多次交互推断，用户可能偏好 dark mode',
    scope: { userId: 'u-sg-3' },
    sourceGrade: 'inferred',
  });
  assert.ok(result.accepted);
  assert.equal(result.memory?.sourceGrade, 'inferred');

  const fetched = app.memoryRepo.findById(result.memory!.id);
  assert.equal(fetched?.sourceGrade, 'inferred');
  app.database.connection.close();
});

test('sourceGrade: derived importance is capped at 0.6', () => {
  const app = initializeEverMemory({ databasePath: createTempDbPath('sg-cap-derived') });
  const result = app.evermemoryStore({
    content: '项目约束：必须使用 TypeScript strict mode',
    scope: { userId: 'u-sg-4' },
    sourceGrade: 'derived',
    importance: 0.9,
  });
  assert.ok(result.accepted);
  assert.ok(
    result.memory!.scores.importance <= 0.6,
    `Expected importance <= 0.6, got ${result.memory!.scores.importance}`,
  );
  app.database.connection.close();
});

test('sourceGrade: inferred importance is capped at 0.4', () => {
  const app = initializeEverMemory({ databasePath: createTempDbPath('sg-cap-inferred') });
  const result = app.evermemoryStore({
    content: '推断用户决定使用 React 而不是 Vue',
    scope: { userId: 'u-sg-5' },
    sourceGrade: 'inferred',
    importance: 0.8,
  });
  assert.ok(result.accepted);
  assert.ok(
    result.memory!.scores.importance <= 0.4,
    `Expected importance <= 0.4, got ${result.memory!.scores.importance}`,
  );
  app.database.connection.close();
});

test('sourceGrade: primary importance is not capped', () => {
  const app = initializeEverMemory({ databasePath: createTempDbPath('sg-cap-primary') });
  const result = app.evermemoryStore({
    content: '我决定使用 PostgreSQL 而不是 MySQL',
    scope: { userId: 'u-sg-6' },
    sourceGrade: 'primary',
    importance: 0.9,
  });
  assert.ok(result.accepted);
  assert.ok(
    result.memory!.scores.importance >= 0.9,
    `Expected importance >= 0.9, got ${result.memory!.scores.importance}`,
  );
  app.database.connection.close();
});

test('sourceGrade: migration backfills derived for runtime sources', () => {
  const app = initializeEverMemory({ databasePath: createTempDbPath('sg-migration') });
  // Insert a memory with runtime_project source (simulating pre-migration data)
  const db = app.database.connection;
  db.prepare(`INSERT INTO memory_items (
    id, content, type, lifecycle, source_kind, source_actor,
    scope_user_id, scope_global, confidence, importance, explicitness,
    created_at, updated_at, active, archived,
    tags_json, related_entities_json, access_count, retrieval_count, source_grade
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'test-migration-1', 'test content', 'fact', 'episodic',
    'runtime_project', 'system', 'u-1', 0, 0.8, 0.5, 0.5,
    '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z',
    1, 0, '[]', '[]', 0, 0, 'derived',
  );

  const row = db.prepare('SELECT source_grade FROM memory_items WHERE id = ?').get('test-migration-1') as { source_grade: string };
  assert.equal(row.source_grade, 'derived');
  app.database.connection.close();
});

test('migration keeps user-authored generic success text while cleaning system-derived outcomes', () => {
  const databasePath = createTempDbPath('sg-safe-cleanup');
  const db = new Database(databasePath);

  db.exec(`
    CREATE TABLE schema_version (version INTEGER NOT NULL);
    INSERT INTO schema_version(version) VALUES (12);
    CREATE TABLE memory_items (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      type TEXT NOT NULL,
      lifecycle TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      source_actor TEXT,
      session_id TEXT,
      message_id TEXT,
      channel TEXT,
      scope_user_id TEXT,
      scope_chat_id TEXT,
      scope_project TEXT,
      scope_global INTEGER NOT NULL DEFAULT 0,
      confidence REAL NOT NULL DEFAULT 0.5,
      importance REAL NOT NULL DEFAULT 0.5,
      explicitness REAL NOT NULL DEFAULT 0.5,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_accessed_at TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      archived INTEGER NOT NULL DEFAULT 0,
      superseded_by TEXT,
      evidence_excerpt TEXT,
      evidence_references_json TEXT,
      tags_json TEXT NOT NULL,
      related_entities_json TEXT NOT NULL,
      access_count INTEGER NOT NULL DEFAULT 0,
      retrieval_count INTEGER NOT NULL DEFAULT 0,
      source_grade TEXT NOT NULL DEFAULT 'primary',
      embedding_blob BLOB,
      embedding_dim INTEGER DEFAULT 0,
      embedding_model TEXT DEFAULT ''
    );
    CREATE TABLE semantic_index (
      memory_id TEXT PRIMARY KEY,
      updated_at TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      tokens_json TEXT NOT NULL,
      weights_json TEXT NOT NULL
    );
    CREATE TABLE embedding_meta (
      memory_id TEXT PRIMARY KEY,
      model TEXT NOT NULL,
      dimensions INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const insert = db.prepare(`INSERT INTO memory_items (
    id, content, type, lifecycle, source_kind, source_actor,
    scope_user_id, scope_global, confidence, importance, explicitness,
    created_at, updated_at, active, archived,
    tags_json, related_entities_json, access_count, retrieval_count, source_grade
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  insert.run(
    'user-success', '成功', 'fact', 'episodic', 'manual', 'user', 'u-safe', 0, 0.9, 0.8, 1,
    '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 1, 0, '[]', '[]', 0, 0, 'primary',
  );
  insert.run(
    'system-success', '成功', 'fact', 'episodic', 'runtime_project', 'system', 'u-safe', 0, 0.7, 0.3, 0.6,
    '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 1, 0, '[]', '[]', 0, 0, 'derived',
  );

  runMigrations(db, databasePath);

  const userRow = db.prepare('SELECT id FROM memory_items WHERE id = ?').get('user-success');
  const systemRow = db.prepare('SELECT id FROM memory_items WHERE id = ?').get('system-success');

  assert.ok(userRow);
  assert.equal(systemRow, undefined);

  db.close();
});
