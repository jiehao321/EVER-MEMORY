import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  CURRENT_SCHEMA_VERSION,
  getSchemaVersion,
  runMigrations,
} from '../../src/storage/migrations.js';
import { StorageError } from '../../src/errors.js';

type SeedOptions = {
  includeRetrievalFeedbackTopFactors?: boolean;
  includeBehaviorOverrideColumns?: boolean;
};

function createDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  return db;
}

function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(tableName) as { name: string } | undefined;
  return row?.name === tableName;
}

function columnNames(db: Database.Database, tableName: string): string[] {
  const escapedTableName = tableName.replace(/'/g, "''");
  return (db.prepare(`SELECT name FROM pragma_table_info('${escapedTableName}')`).all() as Array<{ name: string }>)
    .map((row) => row.name);
}

function assertHasTables(db: Database.Database, tableNames: string[]): void {
  for (const tableName of tableNames) {
    assert.equal(tableExists(db, tableName), true, `Expected table ${tableName} to exist`);
  }
}

function assertHasColumns(db: Database.Database, tableName: string, expectedColumns: string[]): void {
  const names = columnNames(db, tableName);
  for (const expectedColumn of expectedColumns) {
    assert.ok(
      names.includes(expectedColumn),
      `Expected ${tableName} to include column ${expectedColumn}; got ${names.join(', ')}`,
    );
  }
}

function execAll(db: Database.Database, statements: string[]): void {
  for (const statement of statements) {
    db.exec(statement);
  }
}

function seedSchemaAtVersion(
  db: Database.Database,
  version: number,
  options: SeedOptions = {},
): void {
  if (version <= 0) {
    return;
  }

  const includeRetrievalFeedbackTopFactors = options.includeRetrievalFeedbackTopFactors ?? version >= 15;
  const includeBehaviorOverrideColumns = options.includeBehaviorOverrideColumns ?? version >= 27;

  db.exec(`
    CREATE TABLE schema_version (version INTEGER NOT NULL);
    INSERT INTO schema_version(version) VALUES (${version});
  `);

  if (version >= 1) {
    execAll(db, [
      `CREATE TABLE memory_items (
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
        retrieval_count INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE TABLE boot_briefings (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        user_id TEXT,
        generated_at TEXT NOT NULL,
        sections_json TEXT NOT NULL,
        token_target INTEGER NOT NULL,
        actual_approx_tokens INTEGER NOT NULL
      )`,
      `CREATE TABLE debug_events (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        kind TEXT NOT NULL,
        entity_id TEXT,
        payload_json TEXT NOT NULL
      )`,
    ]);
  }

  if (version >= 2) {
    execAll(db, [
      `CREATE TABLE intent_records (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        message_id TEXT,
        created_at TEXT NOT NULL,
        raw_text TEXT NOT NULL,
        intent_type TEXT NOT NULL,
        intent_subtype TEXT,
        intent_confidence REAL NOT NULL,
        urgency TEXT NOT NULL,
        emotional_tone TEXT NOT NULL,
        action_need TEXT NOT NULL,
        memory_need TEXT NOT NULL,
        preference_relevance REAL NOT NULL,
        correction_signal REAL NOT NULL,
        entities_json TEXT NOT NULL,
        retrieval_hints_json TEXT NOT NULL
      )`,
    ]);
  }

  if (version >= 3) {
    execAll(db, [
      `CREATE TABLE experience_logs (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        message_id TEXT,
        created_at TEXT NOT NULL,
        input_summary TEXT NOT NULL,
        action_summary TEXT NOT NULL,
        outcome_summary TEXT,
        indicators_json TEXT NOT NULL,
        evidence_refs_json TEXT NOT NULL
      )`,
      `CREATE TABLE reflection_records (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        trigger_kind TEXT NOT NULL,
        experience_ids_json TEXT NOT NULL,
        analysis_json TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        candidate_rules_json TEXT NOT NULL,
        state_json TEXT NOT NULL
      )`,
    ]);
  }

  if (version >= 4) {
    execAll(db, [
      `CREATE TABLE behavior_rules (
        id TEXT PRIMARY KEY,
        statement TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        applies_to_user_id TEXT,
        applies_to_channel TEXT,
        intent_types_json TEXT NOT NULL,
        contexts_json TEXT NOT NULL,
        category TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 50,
        reflection_ids_json TEXT NOT NULL,
        memory_ids_json TEXT NOT NULL,
        evidence_confidence REAL NOT NULL,
        recurrence_count INTEGER NOT NULL DEFAULT 1,
        active INTEGER NOT NULL DEFAULT 1,
        deprecated INTEGER NOT NULL DEFAULT 0,
        superseded_by TEXT
      )`,
    ]);
  }

  if (version >= 5) {
    execAll(db, [
      `CREATE TABLE semantic_index (
        memory_id TEXT PRIMARY KEY,
        updated_at TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        tokens_json TEXT NOT NULL,
        weights_json TEXT NOT NULL
      )`,
    ]);
  }

  if (version >= 6) {
    execAll(db, [
      `CREATE TABLE projected_profiles (
        user_id TEXT PRIMARY KEY,
        updated_at TEXT NOT NULL,
        stable_json TEXT NOT NULL,
        derived_json TEXT NOT NULL,
        behavior_hints_json TEXT NOT NULL
      )`,
    ]);
  }

  if (version >= 7) {
    execAll(db, [
      'ALTER TABLE behavior_rules ADD COLUMN level TEXT',
      'ALTER TABLE behavior_rules ADD COLUMN maturity TEXT',
      'ALTER TABLE behavior_rules ADD COLUMN apply_count INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE behavior_rules ADD COLUMN contradiction_count INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE behavior_rules ADD COLUMN last_applied_at TEXT',
      'ALTER TABLE behavior_rules ADD COLUMN last_contradicted_at TEXT',
      'ALTER TABLE behavior_rules ADD COLUMN last_reviewed_at TEXT',
      'ALTER TABLE behavior_rules ADD COLUMN stale INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE behavior_rules ADD COLUMN staleness TEXT',
      'ALTER TABLE behavior_rules ADD COLUMN decay_score REAL NOT NULL DEFAULT 0',
      'ALTER TABLE behavior_rules ADD COLUMN frozen_at TEXT',
      'ALTER TABLE behavior_rules ADD COLUMN freeze_reason TEXT',
      'ALTER TABLE behavior_rules ADD COLUMN expires_at TEXT',
      'ALTER TABLE behavior_rules ADD COLUMN frozen INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE behavior_rules ADD COLUMN status_reason TEXT',
      'ALTER TABLE behavior_rules ADD COLUMN status_source_reflection_id TEXT',
      'ALTER TABLE behavior_rules ADD COLUMN status_changed_at TEXT',
      'ALTER TABLE behavior_rules ADD COLUMN promoted_from_reflection_id TEXT',
      'ALTER TABLE behavior_rules ADD COLUMN promoted_reason TEXT',
      'ALTER TABLE behavior_rules ADD COLUMN promoted_at TEXT',
      'ALTER TABLE behavior_rules ADD COLUMN review_source_refs_json TEXT',
      'ALTER TABLE behavior_rules ADD COLUMN promotion_evidence_summary TEXT',
      'ALTER TABLE behavior_rules ADD COLUMN deactivated_by_rule_id TEXT',
      'ALTER TABLE behavior_rules ADD COLUMN deactivated_by_reflection_id TEXT',
      'ALTER TABLE behavior_rules ADD COLUMN deactivated_reason TEXT',
      'ALTER TABLE behavior_rules ADD COLUMN deactivated_at TEXT',
    ]);
  }

  if (version >= 8) {
    execAll(db, [
      'ALTER TABLE memory_items ADD COLUMN embedding_blob BLOB',
      'ALTER TABLE memory_items ADD COLUMN embedding_dim INTEGER DEFAULT 0',
      "ALTER TABLE memory_items ADD COLUMN embedding_model TEXT DEFAULT ''",
      `CREATE TABLE embedding_meta (
        memory_id TEXT PRIMARY KEY,
        model TEXT NOT NULL,
        dimensions INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    ]);
  }

  if (version >= 9) {
    execAll(db, [
      "ALTER TABLE behavior_rules ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]'",
    ]);
  }

  if (version >= 11) {
    execAll(db, [
      'ALTER TABLE behavior_rules ADD COLUMN duration TEXT',
    ]);
  }

  if (version >= 12) {
    execAll(db, [
      "ALTER TABLE memory_items ADD COLUMN source_grade TEXT NOT NULL DEFAULT 'primary'",
    ]);
  }

  if (version >= 14) {
    execAll(db, [
      `CREATE TABLE memory_relations (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        relation_type TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0.5,
        weight REAL NOT NULL DEFAULT 1.0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        created_by TEXT NOT NULL,
        metadata_json TEXT,
        active INTEGER NOT NULL DEFAULT 1
      )`,
      `CREATE TABLE graph_stats (
        memory_id TEXT PRIMARY KEY,
        in_degree INTEGER NOT NULL DEFAULT 0,
        out_degree INTEGER NOT NULL DEFAULT 0,
        strongest_relation_type TEXT,
        strongest_relation_id TEXT,
        cluster_id TEXT,
        updated_at TEXT NOT NULL
      )`,
    ]);
  }

  if (version >= 15) {
    const topFactorsColumn = includeRetrievalFeedbackTopFactors
      ? ",\n        top_factors TEXT NOT NULL DEFAULT '[]'"
      : '';
    execAll(db, [
      `CREATE TABLE retrieval_feedback (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        memory_id TEXT NOT NULL,
        query TEXT NOT NULL,
        strategy TEXT NOT NULL,
        recall_rank INTEGER NOT NULL,
        score REAL NOT NULL,
        signal TEXT NOT NULL,
        signal_source TEXT NOT NULL,
        created_at TEXT NOT NULL${topFactorsColumn}
      )`,
    ]);
  }

  if (version >= 16) {
    execAll(db, [
      'ALTER TABLE memory_items ADD COLUMN compressed_from_json TEXT',
      'ALTER TABLE memory_items ADD COLUMN compression_level INTEGER DEFAULT 0',
    ]);
  }

  if (version >= 17) {
    execAll(db, [
      `CREATE TABLE preference_drift_log (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        preference_key TEXT NOT NULL,
        old_value TEXT NOT NULL,
        new_value TEXT NOT NULL,
        drift_type TEXT NOT NULL,
        detected_at TEXT NOT NULL
      )`,
    ]);
  }

  if (version >= 18) {
    execAll(db, [
      `CREATE TABLE tuning_overrides (
        type_grade_key TEXT PRIMARY KEY,
        decay_multiplier REAL NOT NULL DEFAULT 1.0,
        sample_count INTEGER NOT NULL DEFAULT 0,
        last_updated TEXT NOT NULL
      )`,
    ]);
  }

  if (version >= 19) {
    execAll(db, [
      `CREATE TABLE butler_state (
        id TEXT PRIMARY KEY DEFAULT 'singleton',
        strategy_frame_json TEXT NOT NULL DEFAULT '{}',
        self_model_json TEXT NOT NULL DEFAULT '{}',
        working_memory_json TEXT NOT NULL DEFAULT '[]',
        mode TEXT NOT NULL DEFAULT 'reduced',
        last_cycle_at TEXT,
        last_cycle_version INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      )`,
    ]);
  }

  if (version >= 20) {
    execAll(db, [
      `CREATE TABLE butler_tasks (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 5,
        status TEXT NOT NULL DEFAULT 'queued',
        trigger TEXT,
        payload_json TEXT,
        budget_class TEXT NOT NULL DEFAULT 'low',
        scheduled_at TEXT,
        lease_until TEXT,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        idempotency_key TEXT UNIQUE,
        result_json TEXT,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    ]);
  }

  if (version >= 21) {
    execAll(db, [
      `CREATE TABLE narrative_threads (
        id TEXT PRIMARY KEY,
        theme TEXT NOT NULL,
        objective TEXT,
        current_phase TEXT NOT NULL DEFAULT 'exploring',
        momentum TEXT NOT NULL DEFAULT 'steady',
        recent_events_json TEXT NOT NULL DEFAULT '[]',
        blockers_json TEXT NOT NULL DEFAULT '[]',
        likely_next_turn TEXT,
        strategic_importance REAL NOT NULL DEFAULT 0.5,
        scope_json TEXT,
        started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        closed_at TEXT
      )`,
    ]);
  }

  if (version >= 22) {
    execAll(db, [
      `CREATE TABLE butler_insights (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        scope_json TEXT,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0.5,
        importance REAL NOT NULL DEFAULT 0.5,
        fresh_until TEXT,
        source_refs_json TEXT,
        model_used TEXT,
        cycle_trace_id TEXT,
        surfaced_count INTEGER NOT NULL DEFAULT 0,
        last_surfaced_at TEXT,
        created_at TEXT NOT NULL
      )`,
    ]);
  }

  if (version >= 23) {
    execAll(db, [
      `CREATE TABLE llm_invocations (
        id TEXT PRIMARY KEY,
        task_type TEXT NOT NULL,
        trace_id TEXT,
        provider TEXT,
        model TEXT,
        prompt_tokens INTEGER,
        completion_tokens INTEGER,
        latency_ms INTEGER,
        cache_hit INTEGER NOT NULL DEFAULT 0,
        success INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      )`,
    ]);
  }

  if (version >= 24) {
    execAll(db, [
      `CREATE TABLE butler_feedback (
        id TEXT PRIMARY KEY,
        insight_id TEXT NOT NULL,
        action TEXT NOT NULL,
        snooze_until TEXT,
        reason TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ]);
  }

  if (version >= 25) {
    execAll(db, [
      `CREATE TABLE butler_goals (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        scope_json TEXT,
        priority INTEGER NOT NULL DEFAULT 5,
        deadline TEXT,
        progress_notes TEXT,
        source_insight_ids TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT
      )`,
    ]);
  }

  if (includeBehaviorOverrideColumns) {
    execAll(db, [
      'ALTER TABLE behavior_rules ADD COLUMN override_count INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE behavior_rules ADD COLUMN last_overridden_at TEXT',
      'ALTER TABLE behavior_rules ADD COLUMN auto_suspended INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE behavior_rules ADD COLUMN auto_suspended_at TEXT',
    ]);
  }
}

const versionCheckpoints: Array<{
  name: string;
  seedVersion: number;
  seedOptions?: SeedOptions;
  assertSchema: (db: Database.Database) => void;
}> = [
  {
    name: 'v1 creates the base storage tables',
    seedVersion: 0,
    assertSchema: (db) => {
      assertHasTables(db, ['memory_items', 'boot_briefings', 'debug_events', 'schema_version']);
      assertHasColumns(db, 'memory_items', ['id', 'content', 'retrieval_count']);
    },
  },
  {
    name: 'v2 creates intent_records',
    seedVersion: 1,
    assertSchema: (db) => {
      assertHasTables(db, ['intent_records']);
      assertHasColumns(db, 'intent_records', ['intent_type', 'memory_need', 'retrieval_hints_json']);
    },
  },
  {
    name: 'v3 creates experience_logs and reflection_records',
    seedVersion: 2,
    assertSchema: (db) => {
      assertHasTables(db, ['experience_logs', 'reflection_records']);
      assertHasColumns(db, 'experience_logs', ['input_summary', 'indicators_json']);
      assertHasColumns(db, 'reflection_records', ['trigger_kind', 'analysis_json']);
    },
  },
  {
    name: 'v4 creates behavior_rules',
    seedVersion: 3,
    assertSchema: (db) => {
      assertHasTables(db, ['behavior_rules']);
      assertHasColumns(db, 'behavior_rules', ['statement', 'priority', 'superseded_by']);
    },
  },
  {
    name: 'v5 creates semantic_index',
    seedVersion: 4,
    assertSchema: (db) => {
      assertHasTables(db, ['semantic_index']);
      assertHasColumns(db, 'semantic_index', ['memory_id', 'content_hash', 'weights_json']);
    },
  },
  {
    name: 'v6 creates projected_profiles',
    seedVersion: 5,
    assertSchema: (db) => {
      assertHasTables(db, ['projected_profiles']);
      assertHasColumns(db, 'projected_profiles', ['user_id', 'stable_json', 'behavior_hints_json']);
    },
  },
  {
    name: 'v7 adds behavior lifecycle columns',
    seedVersion: 6,
    assertSchema: (db) => {
      assertHasColumns(db, 'behavior_rules', ['level', 'staleness', 'frozen', 'status_changed_at']);
    },
  },
  {
    name: 'v8 adds semantic vector columns and embedding_meta',
    seedVersion: 7,
    assertSchema: (db) => {
      assertHasTables(db, ['embedding_meta']);
      assertHasColumns(db, 'memory_items', ['embedding_blob', 'embedding_dim', 'embedding_model']);
      assertHasColumns(db, 'embedding_meta', ['memory_id', 'model', 'dimensions']);
    },
  },
  {
    name: 'v9 adds tags_json to behavior_rules',
    seedVersion: 8,
    assertSchema: (db) => {
      assertHasColumns(db, 'behavior_rules', ['tags_json']);
    },
  },
  {
    name: 'v11 adds duration to behavior_rules',
    seedVersion: 10,
    assertSchema: (db) => {
      assertHasColumns(db, 'behavior_rules', ['duration']);
    },
  },
  {
    name: 'v12 adds source_grade to memory_items',
    seedVersion: 11,
    assertSchema: (db) => {
      assertHasColumns(db, 'memory_items', ['source_grade']);
    },
  },
  {
    name: 'v14 creates memory_relations and graph_stats',
    seedVersion: 13,
    assertSchema: (db) => {
      assertHasTables(db, ['memory_relations', 'graph_stats']);
      assertHasColumns(db, 'memory_relations', ['source_id', 'target_id', 'relation_type']);
      assertHasColumns(db, 'graph_stats', ['memory_id', 'cluster_id', 'updated_at']);
    },
  },
  {
    name: 'v15 creates retrieval_feedback',
    seedVersion: 14,
    assertSchema: (db) => {
      assertHasTables(db, ['retrieval_feedback']);
      assertHasColumns(db, 'retrieval_feedback', ['memory_id', 'signal', 'created_at']);
    },
  },
  {
    name: 'v16 adds memory compression columns',
    seedVersion: 15,
    assertSchema: (db) => {
      assertHasColumns(db, 'memory_items', ['compressed_from_json', 'compression_level']);
    },
  },
  {
    name: 'v17 creates preference_drift_log',
    seedVersion: 16,
    assertSchema: (db) => {
      assertHasTables(db, ['preference_drift_log']);
      assertHasColumns(db, 'preference_drift_log', ['preference_key', 'drift_type', 'detected_at']);
    },
  },
  {
    name: 'v18 creates tuning_overrides',
    seedVersion: 17,
    assertSchema: (db) => {
      assertHasTables(db, ['tuning_overrides']);
      assertHasColumns(db, 'tuning_overrides', ['type_grade_key', 'decay_multiplier', 'last_updated']);
    },
  },
  {
    name: 'v19 creates butler_state',
    seedVersion: 18,
    assertSchema: (db) => {
      assertHasTables(db, ['butler_state']);
      assertHasColumns(db, 'butler_state', ['strategy_frame_json', 'mode', 'updated_at']);
    },
  },
  {
    name: 'v20 creates butler_tasks',
    seedVersion: 19,
    assertSchema: (db) => {
      assertHasTables(db, ['butler_tasks']);
      assertHasColumns(db, 'butler_tasks', ['type', 'status', 'idempotency_key']);
    },
  },
  {
    name: 'v21 creates narrative_threads',
    seedVersion: 20,
    assertSchema: (db) => {
      assertHasTables(db, ['narrative_threads']);
      assertHasColumns(db, 'narrative_threads', ['theme', 'current_phase', 'closed_at']);
    },
  },
  {
    name: 'v22 creates butler_insights',
    seedVersion: 21,
    assertSchema: (db) => {
      assertHasTables(db, ['butler_insights']);
      assertHasColumns(db, 'butler_insights', ['kind', 'summary', 'surfaced_count']);
    },
  },
  {
    name: 'v23 creates llm_invocations',
    seedVersion: 22,
    assertSchema: (db) => {
      assertHasTables(db, ['llm_invocations']);
      assertHasColumns(db, 'llm_invocations', ['task_type', 'latency_ms', 'success']);
    },
  },
  {
    name: 'v24 creates butler_feedback',
    seedVersion: 23,
    assertSchema: (db) => {
      assertHasTables(db, ['butler_feedback']);
      assertHasColumns(db, 'butler_feedback', ['insight_id', 'action', 'created_at']);
    },
  },
  {
    name: 'v25 creates butler_goals',
    seedVersion: 24,
    assertSchema: (db) => {
      assertHasTables(db, ['butler_goals']);
      assertHasColumns(db, 'butler_goals', ['title', 'status', 'updated_at']);
    },
  },
  {
    name: 'v26 adds top_factors to retrieval_feedback',
    seedVersion: 25,
    seedOptions: { includeRetrievalFeedbackTopFactors: false },
    assertSchema: (db) => {
      assertHasColumns(db, 'retrieval_feedback', ['top_factors']);
    },
  },
  {
    name: 'v27 adds override lifecycle columns to behavior_rules',
    seedVersion: 26,
    seedOptions: { includeBehaviorOverrideColumns: false },
    assertSchema: (db) => {
      assertHasColumns(db, 'behavior_rules', [
        'override_count',
        'last_overridden_at',
        'auto_suspended',
        'auto_suspended_at',
      ]);
    },
  },
  {
    name: 'v28 creates butler_actions',
    seedVersion: 27,
    assertSchema: (db) => {
      assertHasTables(db, ['butler_actions']);
      assertHasColumns(db, 'butler_actions', [
        'cycle_id',
        'action_type',
        'status',
        'budget_cost_ms',
        'completed_at',
      ]);
    },
  },
];

describe('storage migrations', () => {
  describe('per-version schema checkpoints', () => {
    for (const checkpoint of versionCheckpoints) {
      it(checkpoint.name, () => {
        const db = createDb();
        try {
          seedSchemaAtVersion(db, checkpoint.seedVersion, checkpoint.seedOptions);
          runMigrations(db);
          checkpoint.assertSchema(db);
        } finally {
          db.close();
        }
      });
    }
  });

  describe('full migration', () => {
    let db: Database.Database;

    before(() => {
      db = createDb();
      runMigrations(db);
    });

    it('migrates an empty database to CURRENT_SCHEMA_VERSION', () => {
      assert.equal(getSchemaVersion(db), CURRENT_SCHEMA_VERSION);
      assertHasTables(db, ['butler_actions']);
    });
  });

  it('is idempotent when run twice', () => {
    const db = createDb();
    try {
      const first = runMigrations(db);
      const second = runMigrations(db);

      assert.equal(first, CURRENT_SCHEMA_VERSION);
      assert.equal(second, CURRENT_SCHEMA_VERSION);
      assert.equal(getSchemaVersion(db), CURRENT_SCHEMA_VERSION);
    } finally {
      db.close();
    }
  });

  it('preserves a v1 memory row when migrating to current schema', () => {
    const db = createDb();
    try {
      seedSchemaAtVersion(db, 1);

      db.prepare(`
        INSERT INTO memory_items (
          id,
          content,
          type,
          lifecycle,
          source_kind,
          source_actor,
          session_id,
          message_id,
          channel,
          scope_user_id,
          scope_chat_id,
          scope_project,
          scope_global,
          confidence,
          importance,
          explicitness,
          created_at,
          updated_at,
          last_accessed_at,
          active,
          archived,
          superseded_by,
          evidence_excerpt,
          evidence_references_json,
          tags_json,
          related_entities_json,
          access_count,
          retrieval_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'memory-v1',
        'seeded at v1',
        'fact',
        'episodic',
        'manual',
        'user',
        'session-1',
        'message-1',
        'chat',
        'user-1',
        'chat-1',
        'evermemory',
        0,
        0.8,
        0.6,
        0.7,
        '2026-03-31T00:00:00.000Z',
        '2026-03-31T00:00:00.000Z',
        null,
        1,
        0,
        null,
        'evidence',
        '[]',
        '["tag-1"]',
        '[]',
        2,
        3,
      );

      runMigrations(db);

      const row = db.prepare(`
        SELECT id, content, source_grade, compressed_from_json, compression_level
        FROM memory_items
        WHERE id = ?
      `).get('memory-v1') as {
        id: string;
        content: string;
        source_grade: string;
        compressed_from_json: string | null;
        compression_level: number;
      } | undefined;

      assert.ok(row);
      assert.equal(row?.id, 'memory-v1');
      assert.equal(row?.content, 'seeded at v1');
      assert.equal(row?.source_grade, 'primary');
      assert.equal(row?.compressed_from_json, null);
      assert.equal(row?.compression_level, 0);
      assert.equal(getSchemaVersion(db), CURRENT_SCHEMA_VERSION);
    } finally {
      db.close();
    }
  });
});

it('adds backup guidance when database migrations fail', () => {
  const fakeDb = {
    prepare(sql: string) {
      if (sql.includes('SELECT version FROM schema_version')) {
        return {
          get() {
            return { version: 0 };
          },
        };
      }
      return {
        run() {
          if (sql.includes('UPDATE schema_version SET version = ?')) {
            return undefined;
          }
          throw new Error('migration statement failed');
        },
        get() {
          return { count: 1 };
        },
      };
    },
    transaction(fn: () => void) {
      return () => fn();
    },
  } as unknown as Database.Database;

  assert.throws(
    () => runMigrations(fakeDb),
    (error: unknown) => {
      assert.ok(error instanceof StorageError);
      assert.match(error.message, /Failed to run database migrations/);
      assert.match(error.message, /Back up the database/);
      return true;
    },
  );
});
