import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { openDatabase, closeDatabase } from '../src/storage/db.js';
import { CURRENT_SCHEMA_VERSION, getSchemaVersion, runMigrations } from '../src/storage/migrations.js';
import { createTempDbPath } from './helpers.js';

test('migrations directory barrel exposes the public migration API', async () => {
  const exports = await import('../src/storage/migrations/index.js');

  assert.equal(exports.runMigrations, runMigrations);
  assert.equal(exports.getSchemaVersion, getSchemaVersion);
  assert.equal(exports.CURRENT_SCHEMA_VERSION, CURRENT_SCHEMA_VERSION);
});

test('migrations are idempotent and preserve schema version', () => {
  const databasePath = createTempDbPath('migration');
  const db = openDatabase(databasePath);

  const first = runMigrations(db.connection);
  const second = runMigrations(db.connection);
  const version = getSchemaVersion(db.connection);
  const intentTableRow = db.connection.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'intent_records'
  `).get() as { name: string } | undefined;
  const experienceTableRow = db.connection.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'experience_logs'
  `).get() as { name: string } | undefined;
  const reflectionTableRow = db.connection.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'reflection_records'
  `).get() as { name: string } | undefined;
  const behaviorTableRow = db.connection.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'behavior_rules'
  `).get() as { name: string } | undefined;
  const semanticIndexTableRow = db.connection.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'semantic_index'
  `).get() as { name: string } | undefined;
  const projectedProfileTableRow = db.connection.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'projected_profiles'
  `).get() as { name: string } | undefined;
  const retrievalFeedbackTableRow = db.connection.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'retrieval_feedback'
  `).get() as { name: string } | undefined;
  const butlerStateTableRow = db.connection.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'butler_state'
  `).get() as { name: string } | undefined;
  const butlerTasksTableRow = db.connection.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'butler_tasks'
  `).get() as { name: string } | undefined;
  const narrativeThreadsTableRow = db.connection.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'narrative_threads'
  `).get() as { name: string } | undefined;
  const butlerInsightsTableRow = db.connection.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'butler_insights'
  `).get() as { name: string } | undefined;
  const llmInvocationsTableRow = db.connection.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'llm_invocations'
  `).get() as { name: string } | undefined;
  const retrievalFeedbackColumns = db.connection.prepare(`
    SELECT name FROM pragma_table_info('retrieval_feedback')
  `).all() as Array<{ name: string }>;

  assert.equal(first, CURRENT_SCHEMA_VERSION);
  assert.equal(second, CURRENT_SCHEMA_VERSION);
  assert.equal(version, CURRENT_SCHEMA_VERSION);
  assert.equal(intentTableRow?.name, 'intent_records');
  assert.equal(experienceTableRow?.name, 'experience_logs');
  assert.equal(reflectionTableRow?.name, 'reflection_records');
  assert.equal(behaviorTableRow?.name, 'behavior_rules');
  assert.equal(semanticIndexTableRow?.name, 'semantic_index');
  assert.equal(projectedProfileTableRow?.name, 'projected_profiles');
  assert.equal(retrievalFeedbackTableRow?.name, 'retrieval_feedback');
  assert.equal(butlerStateTableRow?.name, 'butler_state');
  assert.equal(butlerTasksTableRow?.name, 'butler_tasks');
  assert.equal(narrativeThreadsTableRow?.name, 'narrative_threads');
  assert.equal(butlerInsightsTableRow?.name, 'butler_insights');
  assert.equal(llmInvocationsTableRow?.name, 'llm_invocations');
  assert.ok(retrievalFeedbackColumns.some((column) => column.name === 'top_factors'));

  closeDatabase(db);
  rmSync(databasePath, { force: true });
});
