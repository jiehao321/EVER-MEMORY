import type Database from 'better-sqlite3';
import { StorageError } from '../errors.js';

export const PHASE1_SCHEMA_VERSION = 1;
export const PHASE2_SCHEMA_VERSION = 2;
export const PHASE3_SCHEMA_VERSION = 3;
export const PHASE4_SCHEMA_VERSION = 4;
export const PHASE5_SCHEMA_VERSION = 5;
export const PHASE5_PROFILE_SCHEMA_VERSION = 6;
export const PHASE6_BEHAVIOR_LIFECYCLE_SCHEMA_VERSION = 7;
export const PHASE6_SEMANTIC_VECTOR_SCHEMA_VERSION = 8;
export const PHASE7_BEHAVIOR_TAGS_SCHEMA_VERSION = 9;
export const CURRENT_SCHEMA_VERSION = PHASE7_BEHAVIOR_TAGS_SCHEMA_VERSION;

const CREATE_PHASE1_SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS schema_version (\n    version INTEGER NOT NULL\n  )`,
  `CREATE TABLE IF NOT EXISTS memory_items (\n    id TEXT PRIMARY KEY,\n    content TEXT NOT NULL,\n    type TEXT NOT NULL,\n    lifecycle TEXT NOT NULL,\n    source_kind TEXT NOT NULL,\n    source_actor TEXT,\n    session_id TEXT,\n    message_id TEXT,\n    channel TEXT,\n    scope_user_id TEXT,\n    scope_chat_id TEXT,\n    scope_project TEXT,\n    scope_global INTEGER NOT NULL DEFAULT 0,\n    confidence REAL NOT NULL DEFAULT 0.5,\n    importance REAL NOT NULL DEFAULT 0.5,\n    explicitness REAL NOT NULL DEFAULT 0.5,\n    created_at TEXT NOT NULL,\n    updated_at TEXT NOT NULL,\n    last_accessed_at TEXT,\n    active INTEGER NOT NULL DEFAULT 1,\n    archived INTEGER NOT NULL DEFAULT 0,\n    superseded_by TEXT,\n    evidence_excerpt TEXT,\n    evidence_references_json TEXT,\n    tags_json TEXT NOT NULL,\n    related_entities_json TEXT NOT NULL,\n    access_count INTEGER NOT NULL DEFAULT 0,\n    retrieval_count INTEGER NOT NULL DEFAULT 0\n  )`,
  `CREATE TABLE IF NOT EXISTS boot_briefings (\n    id TEXT PRIMARY KEY,\n    session_id TEXT,\n    user_id TEXT,\n    generated_at TEXT NOT NULL,\n    sections_json TEXT NOT NULL,\n    token_target INTEGER NOT NULL,\n    actual_approx_tokens INTEGER NOT NULL\n  )`,
  `CREATE TABLE IF NOT EXISTS debug_events (\n    id TEXT PRIMARY KEY,\n    created_at TEXT NOT NULL,\n    kind TEXT NOT NULL,\n    entity_id TEXT,\n    payload_json TEXT NOT NULL\n  )`,
  'CREATE INDEX IF NOT EXISTS idx_memory_items_type ON memory_items(type)',
  'CREATE INDEX IF NOT EXISTS idx_memory_items_lifecycle ON memory_items(lifecycle)',
  'CREATE INDEX IF NOT EXISTS idx_memory_items_scope_user ON memory_items(scope_user_id)',
  'CREATE INDEX IF NOT EXISTS idx_memory_items_scope_chat ON memory_items(scope_chat_id)',
  'CREATE INDEX IF NOT EXISTS idx_memory_items_updated_at ON memory_items(updated_at)',
  'CREATE INDEX IF NOT EXISTS idx_debug_events_kind ON debug_events(kind)'
] as const;

const CREATE_PHASE2_SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS intent_records (\n    id TEXT PRIMARY KEY,\n    session_id TEXT,\n    message_id TEXT,\n    created_at TEXT NOT NULL,\n    raw_text TEXT NOT NULL,\n    intent_type TEXT NOT NULL,\n    intent_subtype TEXT,\n    intent_confidence REAL NOT NULL,\n    urgency TEXT NOT NULL,\n    emotional_tone TEXT NOT NULL,\n    action_need TEXT NOT NULL,\n    memory_need TEXT NOT NULL,\n    preference_relevance REAL NOT NULL,\n    correction_signal REAL NOT NULL,\n    entities_json TEXT NOT NULL,\n    retrieval_hints_json TEXT NOT NULL\n  )`,
  'CREATE INDEX IF NOT EXISTS idx_intent_records_session ON intent_records(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_intent_records_created_at ON intent_records(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_intent_records_intent_type ON intent_records(intent_type)',
  'CREATE INDEX IF NOT EXISTS idx_intent_records_memory_need ON intent_records(memory_need)',
] as const;

const CREATE_PHASE3_SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS experience_logs (\n    id TEXT PRIMARY KEY,\n    session_id TEXT,\n    message_id TEXT,\n    created_at TEXT NOT NULL,\n    input_summary TEXT NOT NULL,\n    action_summary TEXT NOT NULL,\n    outcome_summary TEXT,\n    indicators_json TEXT NOT NULL,\n    evidence_refs_json TEXT NOT NULL\n  )`,
  `CREATE TABLE IF NOT EXISTS reflection_records (\n    id TEXT PRIMARY KEY,\n    created_at TEXT NOT NULL,\n    trigger_kind TEXT NOT NULL,\n    experience_ids_json TEXT NOT NULL,\n    analysis_json TEXT NOT NULL,\n    evidence_json TEXT NOT NULL,\n    candidate_rules_json TEXT NOT NULL,\n    state_json TEXT NOT NULL\n  )`,
  'CREATE INDEX IF NOT EXISTS idx_experience_logs_session ON experience_logs(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_experience_logs_created_at ON experience_logs(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_reflection_records_trigger_kind ON reflection_records(trigger_kind)',
  'CREATE INDEX IF NOT EXISTS idx_reflection_records_created_at ON reflection_records(created_at)',
] as const;

const CREATE_PHASE4_SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS behavior_rules (\n    id TEXT PRIMARY KEY,\n    statement TEXT NOT NULL,\n    created_at TEXT NOT NULL,\n    updated_at TEXT NOT NULL,\n    applies_to_user_id TEXT,\n    applies_to_channel TEXT,\n    intent_types_json TEXT NOT NULL,\n    contexts_json TEXT NOT NULL,\n    category TEXT NOT NULL,\n    priority INTEGER NOT NULL DEFAULT 50,\n    reflection_ids_json TEXT NOT NULL,\n    memory_ids_json TEXT NOT NULL,\n    evidence_confidence REAL NOT NULL,\n    recurrence_count INTEGER NOT NULL DEFAULT 1,\n    active INTEGER NOT NULL DEFAULT 1,\n    deprecated INTEGER NOT NULL DEFAULT 0,\n    superseded_by TEXT\n  )`,
  'CREATE INDEX IF NOT EXISTS idx_behavior_rules_user ON behavior_rules(applies_to_user_id)',
  'CREATE INDEX IF NOT EXISTS idx_behavior_rules_channel ON behavior_rules(applies_to_channel)',
  'CREATE INDEX IF NOT EXISTS idx_behavior_rules_category ON behavior_rules(category)',
  'CREATE INDEX IF NOT EXISTS idx_behavior_rules_priority ON behavior_rules(priority)',
  'CREATE INDEX IF NOT EXISTS idx_behavior_rules_active ON behavior_rules(active, deprecated)',
] as const;

const CREATE_PHASE5_SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS semantic_index (\n    memory_id TEXT PRIMARY KEY,\n    updated_at TEXT NOT NULL,\n    content_hash TEXT NOT NULL,\n    tokens_json TEXT NOT NULL,\n    weights_json TEXT NOT NULL\n  )`,
  'CREATE INDEX IF NOT EXISTS idx_semantic_index_updated_at ON semantic_index(updated_at)',
  'CREATE INDEX IF NOT EXISTS idx_semantic_index_content_hash ON semantic_index(content_hash)',
] as const;

const CREATE_PHASE5_PROFILE_SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS projected_profiles (\n    user_id TEXT PRIMARY KEY,\n    updated_at TEXT NOT NULL,\n    stable_json TEXT NOT NULL,\n    derived_json TEXT NOT NULL,\n    behavior_hints_json TEXT NOT NULL\n  )`,
  'CREATE INDEX IF NOT EXISTS idx_projected_profiles_updated_at ON projected_profiles(updated_at)',
] as const;

const CREATE_PHASE6_BEHAVIOR_LIFECYCLE_SQL = [
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
  'CREATE INDEX IF NOT EXISTS idx_behavior_rules_staleness ON behavior_rules(staleness)',
  'CREATE INDEX IF NOT EXISTS idx_behavior_rules_level ON behavior_rules(level)',
] as const;

const CREATE_PHASE6_SEMANTIC_VECTOR_SQL = [
  'ALTER TABLE memory_items ADD COLUMN embedding_blob BLOB',
  'ALTER TABLE memory_items ADD COLUMN embedding_dim INTEGER DEFAULT 0',
  "ALTER TABLE memory_items ADD COLUMN embedding_model TEXT DEFAULT ''",
  `CREATE TABLE IF NOT EXISTS embedding_meta (
    memory_id TEXT PRIMARY KEY,
    model TEXT NOT NULL,
    dimensions INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (memory_id) REFERENCES memory_items(id) ON DELETE CASCADE
  )`,
  'CREATE INDEX IF NOT EXISTS idx_embedding_meta_model ON embedding_meta(model)',
] as const;

const CREATE_PHASE7_BEHAVIOR_TAGS_SQL = [
  "ALTER TABLE behavior_rules ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]'",
] as const;

function ensureSchemaVersionTable(db: Database.Database): void {
  db.prepare(CREATE_PHASE1_SCHEMA_SQL[0]).run();

  const row = db.prepare('SELECT COUNT(*) as count FROM schema_version').get() as { count: number };
  if (row.count === 0) {
    db.prepare('INSERT INTO schema_version(version) VALUES (0)').run();
  }
}

function runStatementsIgnoreDuplicateColumns(db: Database.Database, statements: readonly string[]): void {
  for (const sql of statements) {
    try {
      db.prepare(sql).run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/duplicate column name/i.test(message)) {
        continue;
      }
      throw new StorageError('Failed to apply migration statement.', {
        code: 'STORAGE_MIGRATION_STATEMENT_FAILED',
        context: { sql },
        cause: error,
      });
    }
  }
}

export function getSchemaVersion(db: Database.Database): number {
  try {
    ensureSchemaVersionTable(db);
    const row = db.prepare('SELECT version FROM schema_version LIMIT 1').get() as { version: number };
    return row.version;
  } catch (error) {
    if (error instanceof StorageError) {
      throw error;
    }
    throw new StorageError('Failed to read schema version.', {
      code: 'STORAGE_SCHEMA_VERSION_READ_FAILED',
      cause: error,
    });
  }
}

export function runMigrations(db: Database.Database): number {
  let currentVersion = 0;
  try {
    ensureSchemaVersionTable(db);

    currentVersion = getSchemaVersion(db);
    if (currentVersion >= CURRENT_SCHEMA_VERSION) {
      return currentVersion;
    }

    const phase1Tx = db.transaction(() => {
      for (const sql of CREATE_PHASE1_SCHEMA_SQL.slice(1)) {
        db.prepare(sql).run();
      }

      db.prepare('UPDATE schema_version SET version = ?').run(PHASE1_SCHEMA_VERSION);
    });

    const phase2Tx = db.transaction(() => {
      for (const sql of CREATE_PHASE2_SCHEMA_SQL) {
        db.prepare(sql).run();
      }

      db.prepare('UPDATE schema_version SET version = ?').run(PHASE2_SCHEMA_VERSION);
    });

    const phase3Tx = db.transaction(() => {
      for (const sql of CREATE_PHASE3_SCHEMA_SQL) {
        db.prepare(sql).run();
      }

      db.prepare('UPDATE schema_version SET version = ?').run(PHASE3_SCHEMA_VERSION);
    });

    const phase4Tx = db.transaction(() => {
      for (const sql of CREATE_PHASE4_SCHEMA_SQL) {
        db.prepare(sql).run();
      }

      db.prepare('UPDATE schema_version SET version = ?').run(PHASE4_SCHEMA_VERSION);
    });

    const phase5Tx = db.transaction(() => {
      for (const sql of CREATE_PHASE5_SCHEMA_SQL) {
        db.prepare(sql).run();
      }

      db.prepare('UPDATE schema_version SET version = ?').run(PHASE5_SCHEMA_VERSION);
    });

    const phase5ProfileTx = db.transaction(() => {
      for (const sql of CREATE_PHASE5_PROFILE_SCHEMA_SQL) {
        db.prepare(sql).run();
      }

      db.prepare('UPDATE schema_version SET version = ?').run(PHASE5_PROFILE_SCHEMA_VERSION);
    });

    const phase6BehaviorLifecycleTx = db.transaction(() => {
      runStatementsIgnoreDuplicateColumns(db, CREATE_PHASE6_BEHAVIOR_LIFECYCLE_SQL);
      db.prepare('UPDATE schema_version SET version = ?').run(PHASE6_BEHAVIOR_LIFECYCLE_SCHEMA_VERSION);
    });
    const phase6SemanticVectorTx = db.transaction(() => {
      runStatementsIgnoreDuplicateColumns(db, CREATE_PHASE6_SEMANTIC_VECTOR_SQL);
      db.prepare('UPDATE schema_version SET version = ?').run(PHASE6_SEMANTIC_VECTOR_SCHEMA_VERSION);
    });
    const phase7BehaviorTagsTx = db.transaction(() => {
      runStatementsIgnoreDuplicateColumns(db, CREATE_PHASE7_BEHAVIOR_TAGS_SQL);
      db.prepare('UPDATE schema_version SET version = ?').run(PHASE7_BEHAVIOR_TAGS_SCHEMA_VERSION);
    });

    if (currentVersion < PHASE1_SCHEMA_VERSION) {
      phase1Tx();
      currentVersion = PHASE1_SCHEMA_VERSION;
    }

    if (currentVersion < PHASE2_SCHEMA_VERSION) {
      phase2Tx();
      currentVersion = PHASE2_SCHEMA_VERSION;
    }

    if (currentVersion < PHASE3_SCHEMA_VERSION) {
      phase3Tx();
      currentVersion = PHASE3_SCHEMA_VERSION;
    }

    if (currentVersion < PHASE4_SCHEMA_VERSION) {
      phase4Tx();
      currentVersion = PHASE4_SCHEMA_VERSION;
    }

    if (currentVersion < PHASE5_SCHEMA_VERSION) {
      phase5Tx();
      currentVersion = PHASE5_SCHEMA_VERSION;
    }

    if (currentVersion < PHASE5_PROFILE_SCHEMA_VERSION) {
      phase5ProfileTx();
      currentVersion = PHASE5_PROFILE_SCHEMA_VERSION;
    }

    if (currentVersion < PHASE6_BEHAVIOR_LIFECYCLE_SCHEMA_VERSION) {
      phase6BehaviorLifecycleTx();
      currentVersion = PHASE6_BEHAVIOR_LIFECYCLE_SCHEMA_VERSION;
    }
    if (currentVersion < PHASE6_SEMANTIC_VECTOR_SCHEMA_VERSION) {
      phase6SemanticVectorTx();
      currentVersion = PHASE6_SEMANTIC_VECTOR_SCHEMA_VERSION;
    }
    if (currentVersion < PHASE7_BEHAVIOR_TAGS_SCHEMA_VERSION) {
      phase7BehaviorTagsTx();
      currentVersion = PHASE7_BEHAVIOR_TAGS_SCHEMA_VERSION;
    }

    return currentVersion;
  } catch (error) {
    if (error instanceof StorageError) {
      throw error;
    }
    throw new StorageError('Failed to run database migrations.', {
      code: 'STORAGE_MIGRATION_FAILED',
      context: { currentVersion },
      cause: error,
    });
  }
}
