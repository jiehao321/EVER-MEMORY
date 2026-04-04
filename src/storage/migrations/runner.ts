import { cpSync, existsSync } from 'node:fs';
import type Database from 'better-sqlite3';
import { StorageError } from '../../errors.js';
import {
  CREATE_PHASE1_SCHEMA_SQL,
  CREATE_PHASE2_SCHEMA_SQL,
  CREATE_PHASE3_SCHEMA_SQL,
  CREATE_PHASE4_SCHEMA_SQL,
  CREATE_PHASE5_PROFILE_SCHEMA_SQL,
  CREATE_PHASE5_SCHEMA_SQL,
  CREATE_PHASE6_BEHAVIOR_LIFECYCLE_SQL,
  CREATE_PHASE6_SEMANTIC_VECTOR_SQL,
  CREATE_PHASE7_BEHAVIOR_TAGS_SQL,
  CREATE_PHASE8_COMPOSITE_INDEXES_SQL,
  CREATE_PHASE9_BEHAVIOR_DURATION_SQL,
  CREATE_PHASE10_SOURCE_GRADE_SQL,
  CREATE_PHASE11_SAFE_SYSTEM_CLEANUP_SQL,
  CREATE_PHASE12_KNOWLEDGE_GRAPH_SQL,
  CREATE_PHASE13_RETRIEVAL_FEEDBACK_SQL,
  CREATE_PHASE14_MEMORY_COMPRESSION_SQL,
  CREATE_PHASE15_PREFERENCE_DRIFT_SQL,
  CREATE_PHASE16_TUNING_OVERRIDES_SQL,
  CREATE_PHASE17_BUTLER_STATE_SQL,
  CREATE_PHASE18_BUTLER_TASKS_SQL,
  CREATE_PHASE19_NARRATIVE_THREADS_SQL,
  CREATE_PHASE20_BUTLER_INSIGHTS_SQL,
  CREATE_PHASE21_LLM_INVOCATIONS_SQL,
  CREATE_PHASE22_BUTLER_FEEDBACK_SQL,
  CREATE_PHASE23_BUTLER_GOALS_SQL,
  CREATE_PHASE24_RETRIEVAL_FEEDBACK_FACTORS_SQL,
  CREATE_PHASE25_BEHAVIOR_OVERRIDE_LIFECYCLE_SQL,
  CREATE_PHASE28_BUTLER_ACTIONS_SQL,
  CREATE_PHASE29_BUTLER_QUESTIONS_SQL,
  CREATE_PHASE29_BUTLER_SEARCHES_SQL,
} from './schemas.js';
import {
  CURRENT_SCHEMA_VERSION,
  PHASE1_SCHEMA_VERSION,
  PHASE2_SCHEMA_VERSION,
  PHASE3_SCHEMA_VERSION,
  PHASE4_SCHEMA_VERSION,
  PHASE5_PROFILE_SCHEMA_VERSION,
  PHASE5_SCHEMA_VERSION,
  PHASE6_BEHAVIOR_LIFECYCLE_SCHEMA_VERSION,
  PHASE6_SEMANTIC_VECTOR_SCHEMA_VERSION,
  PHASE7_BEHAVIOR_TAGS_SCHEMA_VERSION,
  PHASE8_COMPOSITE_INDEXES_SCHEMA_VERSION,
  PHASE9_BEHAVIOR_DURATION_SCHEMA_VERSION,
  PHASE10_SOURCE_GRADE_SCHEMA_VERSION,
  PHASE11_SAFE_SYSTEM_CLEANUP_SCHEMA_VERSION,
  PHASE12_KNOWLEDGE_GRAPH_SCHEMA_VERSION,
  PHASE13_RETRIEVAL_FEEDBACK_SCHEMA_VERSION,
  PHASE14_MEMORY_COMPRESSION_SCHEMA_VERSION,
  PHASE15_PREFERENCE_DRIFT_SCHEMA_VERSION,
  PHASE16_TUNING_OVERRIDES_SCHEMA_VERSION,
  PHASE17_BUTLER_STATE_SCHEMA_VERSION,
  PHASE18_BUTLER_TASKS_SCHEMA_VERSION,
  PHASE19_NARRATIVE_THREADS_SCHEMA_VERSION,
  PHASE20_BUTLER_INSIGHTS_SCHEMA_VERSION,
  PHASE21_LLM_INVOCATIONS_SCHEMA_VERSION,
  PHASE22_BUTLER_FEEDBACK_SCHEMA_VERSION,
  PHASE23_BUTLER_GOALS_SCHEMA_VERSION,
  PHASE24_RETRIEVAL_FEEDBACK_FACTORS_SCHEMA_VERSION,
  PHASE25_BEHAVIOR_OVERRIDE_LIFECYCLE_SCHEMA_VERSION,
  PHASE28_BUTLER_ACTIONS_SCHEMA_VERSION,
  PHASE29_BUTLER_INTELLIGENCE_SCHEMA_VERSION,
} from './versions.js';

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
      if (/duplicate column name/i.test(message) || /no such table/i.test(message)) {
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
    const phase22ButlerFeedbackTx = db.transaction(() => {
      for (const sql of CREATE_PHASE22_BUTLER_FEEDBACK_SQL) {
        db.prepare(sql).run();
      }
      db.prepare('UPDATE schema_version SET version = ?').run(PHASE22_BUTLER_FEEDBACK_SCHEMA_VERSION);
    });
    const phase23ButlerGoalsTx = db.transaction(() => {
      for (const sql of CREATE_PHASE23_BUTLER_GOALS_SQL) {
        db.prepare(sql).run();
      }
      db.prepare('UPDATE schema_version SET version = ?').run(PHASE23_BUTLER_GOALS_SCHEMA_VERSION);
    });
    const phase24RetrievalFeedbackFactorsTx = db.transaction(() => {
      runStatementsIgnoreDuplicateColumns(db, CREATE_PHASE24_RETRIEVAL_FEEDBACK_FACTORS_SQL);
      db.prepare('UPDATE schema_version SET version = ?').run(PHASE24_RETRIEVAL_FEEDBACK_FACTORS_SCHEMA_VERSION);
    });
    const phase25BehaviorOverrideLifecycleTx = db.transaction(() => {
      runStatementsIgnoreDuplicateColumns(db, CREATE_PHASE25_BEHAVIOR_OVERRIDE_LIFECYCLE_SQL);
      db.prepare('UPDATE schema_version SET version = ?').run(PHASE25_BEHAVIOR_OVERRIDE_LIFECYCLE_SCHEMA_VERSION);
    });
    const phase28ButlerActionsTx = db.transaction(() => {
      for (const sql of CREATE_PHASE28_BUTLER_ACTIONS_SQL) {
        db.prepare(sql).run();
      }
      db.prepare('UPDATE schema_version SET version = ?').run(PHASE28_BUTLER_ACTIONS_SCHEMA_VERSION);
    });
    const phase29ButlerIntelligenceTx = db.transaction(() => {
      for (const sql of CREATE_PHASE29_BUTLER_QUESTIONS_SQL) {
        db.prepare(sql).run();
      }
      for (const sql of CREATE_PHASE29_BUTLER_SEARCHES_SQL) {
        db.prepare(sql).run();
      }
      db.prepare('UPDATE schema_version SET version = ?').run(PHASE29_BUTLER_INTELLIGENCE_SCHEMA_VERSION);
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

    if (currentVersion < PHASE22_BUTLER_FEEDBACK_SCHEMA_VERSION) {
      phase22ButlerFeedbackTx();
      currentVersion = PHASE22_BUTLER_FEEDBACK_SCHEMA_VERSION;
    }

    if (currentVersion < PHASE23_BUTLER_GOALS_SCHEMA_VERSION) {
      phase23ButlerGoalsTx();
      currentVersion = PHASE23_BUTLER_GOALS_SCHEMA_VERSION;
    }

    if (currentVersion < PHASE24_RETRIEVAL_FEEDBACK_FACTORS_SCHEMA_VERSION) {
      phase24RetrievalFeedbackFactorsTx();
      currentVersion = PHASE24_RETRIEVAL_FEEDBACK_FACTORS_SCHEMA_VERSION;
    }

    if (currentVersion < PHASE25_BEHAVIOR_OVERRIDE_LIFECYCLE_SCHEMA_VERSION) {
      phase25BehaviorOverrideLifecycleTx();
      currentVersion = PHASE25_BEHAVIOR_OVERRIDE_LIFECYCLE_SCHEMA_VERSION;
    }

    if (currentVersion < PHASE28_BUTLER_ACTIONS_SCHEMA_VERSION) {
      phase28ButlerActionsTx();
      currentVersion = PHASE28_BUTLER_ACTIONS_SCHEMA_VERSION;
    }

    if (currentVersion < PHASE29_BUTLER_INTELLIGENCE_SCHEMA_VERSION) {
      phase29ButlerIntelligenceTx();
      currentVersion = PHASE29_BUTLER_INTELLIGENCE_SCHEMA_VERSION;
    }

    return currentVersion;
  } catch (error) {
    if (error instanceof StorageError) {
      throw error;
    }
    throw new StorageError('Failed to run database migrations. Back up the database and verify the EverMemory DB path is writable before retrying.', {
      code: 'STORAGE_MIGRATION_FAILED',
      context: { currentVersion },
      cause: error,
    });
  }
}
