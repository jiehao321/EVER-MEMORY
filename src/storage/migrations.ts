import { cpSync, existsSync } from 'node:fs';
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
export const PHASE8_COMPOSITE_INDEXES_SCHEMA_VERSION = 10;
export const PHASE9_BEHAVIOR_DURATION_SCHEMA_VERSION = 11;
export const PHASE10_SOURCE_GRADE_SCHEMA_VERSION = 12;
export const PHASE11_SAFE_SYSTEM_CLEANUP_SCHEMA_VERSION = 13;
export const PHASE12_KNOWLEDGE_GRAPH_SCHEMA_VERSION = 14;
export const PHASE13_RETRIEVAL_FEEDBACK_SCHEMA_VERSION = 15;
export const PHASE14_MEMORY_COMPRESSION_SCHEMA_VERSION = 16;
export const PHASE15_PREFERENCE_DRIFT_SCHEMA_VERSION = 17;
export const PHASE16_TUNING_OVERRIDES_SCHEMA_VERSION = 18;
export const PHASE17_BUTLER_STATE_SCHEMA_VERSION = 19;
export const PHASE18_BUTLER_TASKS_SCHEMA_VERSION = 20;
export const PHASE19_NARRATIVE_THREADS_SCHEMA_VERSION = 21;
export const PHASE20_BUTLER_INSIGHTS_SCHEMA_VERSION = 22;
export const PHASE21_LLM_INVOCATIONS_SCHEMA_VERSION = 23;
export const CURRENT_SCHEMA_VERSION = PHASE21_LLM_INVOCATIONS_SCHEMA_VERSION;

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

const CREATE_PHASE8_COMPOSITE_INDEXES_SQL = [
  'CREATE INDEX IF NOT EXISTS idx_memory_items_scope_active ON memory_items(scope_user_id, active, archived, updated_at)',
  'CREATE INDEX IF NOT EXISTS idx_behavior_rules_active_priority ON behavior_rules(active, deprecated, priority DESC)',
  'CREATE INDEX IF NOT EXISTS idx_debug_events_created_at ON debug_events(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_boot_briefings_user_generated ON boot_briefings(user_id, generated_at DESC)',
] as const;

const CREATE_PHASE9_BEHAVIOR_DURATION_SQL = [
  'ALTER TABLE behavior_rules ADD COLUMN duration TEXT',
] as const;

const CREATE_PHASE10_SOURCE_GRADE_SQL = [
  "ALTER TABLE memory_items ADD COLUMN source_grade TEXT NOT NULL DEFAULT 'primary'",
  // Backfill derived sources
  "UPDATE memory_items SET source_grade = 'derived' WHERE source_kind IN ('runtime_project', 'runtime_user', 'reflection_derived')",
  // Backfill inferred sources
  "UPDATE memory_items SET source_grade = 'inferred' WHERE source_kind IN ('summary', 'inference')",
  // Clean recursive pollution — scoped to auto-generated sources only to avoid deleting legitimate user content
  "DELETE FROM memory_items WHERE content LIKE '%Relevant memor%' AND content LIKE '%memory%' AND source_kind IN ('runtime_project', 'runtime_user', 'reflection_derived', 'summary', 'inference')",
] as const;

const CREATE_PHASE11_SAFE_SYSTEM_CLEANUP_SQL = [
  // Clean generic outcome-only content, but only for system-derived rows.
  "DELETE FROM memory_items WHERE content IN ('run_success', 'run_failed', 'success', 'failed', 'done', 'completed', '成功', '失败', '完成') AND source_kind IN ('runtime_project', 'runtime_user', 'reflection_derived', 'summary', 'inference') AND COALESCE(source_actor, 'system') = 'system'",
  // Clean orphaned semantic_index entries
  "DELETE FROM semantic_index WHERE memory_id NOT IN (SELECT id FROM memory_items)",
  // Clean orphaned embedding_meta entries
  "DELETE FROM embedding_meta WHERE memory_id NOT IN (SELECT id FROM memory_items)",
] as const;

const CREATE_PHASE12_KNOWLEDGE_GRAPH_SQL = [
  `CREATE TABLE IF NOT EXISTS memory_relations (
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
  'CREATE INDEX IF NOT EXISTS idx_rel_source ON memory_relations(source_id, active)',
  'CREATE INDEX IF NOT EXISTS idx_rel_target ON memory_relations(target_id, active)',
  'CREATE INDEX IF NOT EXISTS idx_rel_type ON memory_relations(relation_type, active)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_rel_pair ON memory_relations(source_id, target_id, relation_type)',
  `CREATE TABLE IF NOT EXISTS graph_stats (
    memory_id TEXT PRIMARY KEY,
    in_degree INTEGER NOT NULL DEFAULT 0,
    out_degree INTEGER NOT NULL DEFAULT 0,
    strongest_relation_type TEXT,
    strongest_relation_id TEXT,
    cluster_id TEXT,
    updated_at TEXT NOT NULL
  )`,
] as const;

const CREATE_PHASE13_RETRIEVAL_FEEDBACK_SQL = [
  `CREATE TABLE IF NOT EXISTS retrieval_feedback (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    memory_id TEXT NOT NULL,
    query TEXT NOT NULL,
    strategy TEXT NOT NULL,
    recall_rank INTEGER NOT NULL,
    score REAL NOT NULL,
    signal TEXT NOT NULL,
    signal_source TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_feedback_session ON retrieval_feedback(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_feedback_memory ON retrieval_feedback(memory_id)',
  'CREATE INDEX IF NOT EXISTS idx_feedback_signal ON retrieval_feedback(signal, created_at)',
] as const;

const CREATE_PHASE14_MEMORY_COMPRESSION_SQL = [
  'ALTER TABLE memory_items ADD COLUMN compressed_from_json TEXT',
  'ALTER TABLE memory_items ADD COLUMN compression_level INTEGER DEFAULT 0',
] as const;

const CREATE_PHASE15_PREFERENCE_DRIFT_SQL = [
  `CREATE TABLE IF NOT EXISTS preference_drift_log (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    preference_key TEXT NOT NULL,
    old_value TEXT NOT NULL,
    new_value TEXT NOT NULL,
    drift_type TEXT NOT NULL,
    detected_at TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_drift_user ON preference_drift_log(user_id, detected_at)',
] as const;

const CREATE_PHASE16_TUNING_OVERRIDES_SQL = [
  `CREATE TABLE IF NOT EXISTS tuning_overrides (
    type_grade_key TEXT PRIMARY KEY,
    decay_multiplier REAL NOT NULL DEFAULT 1.0,
    sample_count INTEGER NOT NULL DEFAULT 0,
    last_updated TEXT NOT NULL
  )`,
] as const;

const CREATE_PHASE17_BUTLER_STATE_SQL = [
  `CREATE TABLE IF NOT EXISTS butler_state (
    id TEXT PRIMARY KEY DEFAULT 'singleton',
    strategy_frame_json TEXT NOT NULL DEFAULT '{}',
    self_model_json TEXT NOT NULL DEFAULT '{}',
    working_memory_json TEXT NOT NULL DEFAULT '[]',
    mode TEXT NOT NULL DEFAULT 'steward',
    last_cycle_at TEXT,
    last_cycle_version INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  )`,
] as const;

const CREATE_PHASE18_BUTLER_TASKS_SQL = [
  `CREATE TABLE IF NOT EXISTS butler_tasks (
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
  'CREATE INDEX IF NOT EXISTS idx_butler_tasks_status ON butler_tasks(status, priority)',
] as const;

const CREATE_PHASE19_NARRATIVE_THREADS_SQL = [
  `CREATE TABLE IF NOT EXISTS narrative_threads (
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
] as const;

const CREATE_PHASE20_BUTLER_INSIGHTS_SQL = [
  `CREATE TABLE IF NOT EXISTS butler_insights (
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
  'CREATE INDEX IF NOT EXISTS idx_butler_insights_kind ON butler_insights(kind, importance DESC)',
] as const;

const CREATE_PHASE21_LLM_INVOCATIONS_SQL = [
  `CREATE TABLE IF NOT EXISTS llm_invocations (
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

export function runMigrations(db: Database.Database, dbPath?: string): number {
  let currentVersion = 0;
  try {
    ensureSchemaVersionTable(db);

    currentVersion = getSchemaVersion(db);
    if (currentVersion >= CURRENT_SCHEMA_VERSION) {
      return currentVersion;
    }

    // B7: Create a timestamped backup before applying any migrations
    if (dbPath && dbPath !== ':memory:' && existsSync(dbPath)) {
      const backupPath = `${dbPath}.bak.${Date.now()}`;
      try {
        cpSync(dbPath, backupPath);
      } catch {
        // Backup failure must not block migration — log and continue
      }
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
    const phase8CompositeIndexesTx = db.transaction(() => {
      for (const sql of CREATE_PHASE8_COMPOSITE_INDEXES_SQL) {
        db.prepare(sql).run();
      }

      db.prepare('UPDATE schema_version SET version = ?').run(PHASE8_COMPOSITE_INDEXES_SCHEMA_VERSION);
    });
    const phase9BehaviorDurationTx = db.transaction(() => {
      runStatementsIgnoreDuplicateColumns(db, CREATE_PHASE9_BEHAVIOR_DURATION_SQL);
      db.prepare('UPDATE schema_version SET version = ?').run(PHASE9_BEHAVIOR_DURATION_SCHEMA_VERSION);
    });
    const phase10SourceGradeTx = db.transaction(() => {
      runStatementsIgnoreDuplicateColumns(db, CREATE_PHASE10_SOURCE_GRADE_SQL);
      db.prepare('UPDATE schema_version SET version = ?').run(PHASE10_SOURCE_GRADE_SCHEMA_VERSION);
    });
    const phase11SafeSystemCleanupTx = db.transaction(() => {
      for (const sql of CREATE_PHASE11_SAFE_SYSTEM_CLEANUP_SQL) {
        db.prepare(sql).run();
      }
      db.prepare('UPDATE schema_version SET version = ?').run(PHASE11_SAFE_SYSTEM_CLEANUP_SCHEMA_VERSION);
    });
    const phase12KnowledgeGraphTx = db.transaction(() => {
      for (const sql of CREATE_PHASE12_KNOWLEDGE_GRAPH_SQL) {
        db.prepare(sql).run();
      }
      db.prepare('UPDATE schema_version SET version = ?').run(PHASE12_KNOWLEDGE_GRAPH_SCHEMA_VERSION);
    });
    const phase13RetrievalFeedbackTx = db.transaction(() => {
      for (const sql of CREATE_PHASE13_RETRIEVAL_FEEDBACK_SQL) {
        db.prepare(sql).run();
      }
      db.prepare('UPDATE schema_version SET version = ?').run(PHASE13_RETRIEVAL_FEEDBACK_SCHEMA_VERSION);
    });
    const phase14MemoryCompressionTx = db.transaction(() => {
      runStatementsIgnoreDuplicateColumns(db, CREATE_PHASE14_MEMORY_COMPRESSION_SQL);
      db.prepare('UPDATE schema_version SET version = ?').run(PHASE14_MEMORY_COMPRESSION_SCHEMA_VERSION);
    });
    const phase15PreferenceDriftTx = db.transaction(() => {
      for (const sql of CREATE_PHASE15_PREFERENCE_DRIFT_SQL) {
        db.prepare(sql).run();
      }
      db.prepare('UPDATE schema_version SET version = ?').run(PHASE15_PREFERENCE_DRIFT_SCHEMA_VERSION);
    });
    const phase16TuningOverridesTx = db.transaction(() => {
      for (const sql of CREATE_PHASE16_TUNING_OVERRIDES_SQL) {
        db.prepare(sql).run();
      }
      db.prepare('UPDATE schema_version SET version = ?').run(PHASE16_TUNING_OVERRIDES_SCHEMA_VERSION);
    });
    const phase17ButlerStateTx = db.transaction(() => {
      for (const sql of CREATE_PHASE17_BUTLER_STATE_SQL) {
        db.prepare(sql).run();
      }
      db.prepare('UPDATE schema_version SET version = ?').run(PHASE17_BUTLER_STATE_SCHEMA_VERSION);
    });
    const phase18ButlerTasksTx = db.transaction(() => {
      for (const sql of CREATE_PHASE18_BUTLER_TASKS_SQL) {
        db.prepare(sql).run();
      }
      db.prepare('UPDATE schema_version SET version = ?').run(PHASE18_BUTLER_TASKS_SCHEMA_VERSION);
    });
    const phase19NarrativeThreadsTx = db.transaction(() => {
      for (const sql of CREATE_PHASE19_NARRATIVE_THREADS_SQL) {
        db.prepare(sql).run();
      }
      db.prepare('UPDATE schema_version SET version = ?').run(PHASE19_NARRATIVE_THREADS_SCHEMA_VERSION);
    });
    const phase20ButlerInsightsTx = db.transaction(() => {
      for (const sql of CREATE_PHASE20_BUTLER_INSIGHTS_SQL) {
        db.prepare(sql).run();
      }
      db.prepare('UPDATE schema_version SET version = ?').run(PHASE20_BUTLER_INSIGHTS_SCHEMA_VERSION);
    });
    const phase21LlmInvocationsTx = db.transaction(() => {
      for (const sql of CREATE_PHASE21_LLM_INVOCATIONS_SQL) {
        db.prepare(sql).run();
      }
      db.prepare('UPDATE schema_version SET version = ?').run(PHASE21_LLM_INVOCATIONS_SCHEMA_VERSION);
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
    if (currentVersion < PHASE8_COMPOSITE_INDEXES_SCHEMA_VERSION) {
      phase8CompositeIndexesTx();
      currentVersion = PHASE8_COMPOSITE_INDEXES_SCHEMA_VERSION;
    }

    if (currentVersion < PHASE9_BEHAVIOR_DURATION_SCHEMA_VERSION) {
      phase9BehaviorDurationTx();
      currentVersion = PHASE9_BEHAVIOR_DURATION_SCHEMA_VERSION;
    }
    if (currentVersion < PHASE10_SOURCE_GRADE_SCHEMA_VERSION) {
      phase10SourceGradeTx();
      currentVersion = PHASE10_SOURCE_GRADE_SCHEMA_VERSION;
    }
    if (currentVersion < PHASE11_SAFE_SYSTEM_CLEANUP_SCHEMA_VERSION) {
      phase11SafeSystemCleanupTx();
      currentVersion = PHASE11_SAFE_SYSTEM_CLEANUP_SCHEMA_VERSION;
    }
    if (currentVersion < PHASE12_KNOWLEDGE_GRAPH_SCHEMA_VERSION) {
      phase12KnowledgeGraphTx();
      currentVersion = PHASE12_KNOWLEDGE_GRAPH_SCHEMA_VERSION;
    }
    if (currentVersion < PHASE13_RETRIEVAL_FEEDBACK_SCHEMA_VERSION) {
      phase13RetrievalFeedbackTx();
      currentVersion = PHASE13_RETRIEVAL_FEEDBACK_SCHEMA_VERSION;
    }
    if (currentVersion < PHASE14_MEMORY_COMPRESSION_SCHEMA_VERSION) {
      phase14MemoryCompressionTx();
      currentVersion = PHASE14_MEMORY_COMPRESSION_SCHEMA_VERSION;
    }
    if (currentVersion < PHASE15_PREFERENCE_DRIFT_SCHEMA_VERSION) {
      phase15PreferenceDriftTx();
      currentVersion = PHASE15_PREFERENCE_DRIFT_SCHEMA_VERSION;
    }
    if (currentVersion < PHASE16_TUNING_OVERRIDES_SCHEMA_VERSION) {
      phase16TuningOverridesTx();
      currentVersion = PHASE16_TUNING_OVERRIDES_SCHEMA_VERSION;
    }

    if (currentVersion < PHASE17_BUTLER_STATE_SCHEMA_VERSION) {
      phase17ButlerStateTx();
      currentVersion = PHASE17_BUTLER_STATE_SCHEMA_VERSION;
    }

    if (currentVersion < PHASE18_BUTLER_TASKS_SCHEMA_VERSION) {
      phase18ButlerTasksTx();
      currentVersion = PHASE18_BUTLER_TASKS_SCHEMA_VERSION;
    }

    if (currentVersion < PHASE19_NARRATIVE_THREADS_SCHEMA_VERSION) {
      phase19NarrativeThreadsTx();
      currentVersion = PHASE19_NARRATIVE_THREADS_SCHEMA_VERSION;
    }

    if (currentVersion < PHASE20_BUTLER_INSIGHTS_SCHEMA_VERSION) {
      phase20ButlerInsightsTx();
      currentVersion = PHASE20_BUTLER_INSIGHTS_SCHEMA_VERSION;
    }

    if (currentVersion < PHASE21_LLM_INVOCATIONS_SCHEMA_VERSION) {
      phase21LlmInvocationsTx();
      currentVersion = PHASE21_LLM_INVOCATIONS_SCHEMA_VERSION;
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
