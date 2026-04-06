import Database from 'better-sqlite3';
import { SqliteButlerStorage } from '../../../butler-adapter/sqliteStorage.js';
import type { ButlerStoragePort } from '../ports/storage.js';
import { ButlerFeedbackRepository } from '../../../storage/butlerFeedbackRepo.js';
import { ButlerGoalRepository } from '../../../storage/butlerGoalRepo.js';
import { ButlerInsightRepository } from '../../../storage/butlerInsightRepo.js';
import { ButlerStateRepository } from '../../../storage/butlerStateRepo.js';
import { ButlerTaskRepository } from '../../../storage/butlerTaskRepo.js';
import { LlmInvocationRepository } from '../../../storage/llmInvocationRepo.js';
import {
  CREATE_PHASE17_BUTLER_STATE_SQL,
  CREATE_PHASE18_BUTLER_TASKS_SQL,
  CREATE_PHASE19_NARRATIVE_THREADS_SQL,
  CREATE_PHASE20_BUTLER_INSIGHTS_SQL,
  CREATE_PHASE21_LLM_INVOCATIONS_SQL,
  CREATE_PHASE22_BUTLER_FEEDBACK_SQL,
  CREATE_PHASE23_BUTLER_GOALS_SQL,
  CREATE_PHASE28_BUTLER_ACTIONS_SQL,
  CREATE_PHASE29_BUTLER_QUESTIONS_SQL,
  CREATE_PHASE29_BUTLER_SEARCHES_SQL,
  CREATE_PHASE30_BUTLER_EVOLUTION_SQL,
} from '../../../storage/migrations/schemas.js';
import { NarrativeRepository } from '../../../storage/narrativeRepo.js';

const BUTLER_SCHEMA_SQL = [
  ...CREATE_PHASE17_BUTLER_STATE_SQL,
  ...CREATE_PHASE18_BUTLER_TASKS_SQL,
  ...CREATE_PHASE19_NARRATIVE_THREADS_SQL,
  ...CREATE_PHASE20_BUTLER_INSIGHTS_SQL,
  ...CREATE_PHASE21_LLM_INVOCATIONS_SQL,
  ...CREATE_PHASE22_BUTLER_FEEDBACK_SQL,
  ...CREATE_PHASE23_BUTLER_GOALS_SQL,
  ...CREATE_PHASE28_BUTLER_ACTIONS_SQL,
  ...CREATE_PHASE29_BUTLER_QUESTIONS_SQL,
  ...CREATE_PHASE29_BUTLER_SEARCHES_SQL,
  ...CREATE_PHASE30_BUTLER_EVOLUTION_SQL,
];

export function createStandaloneStorage(dbPath: string): {
  storage: ButlerStoragePort;
  db: Database.Database;
} {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  for (const sql of BUTLER_SCHEMA_SQL) {
    db.exec(sql);
  }

  const storage = new SqliteButlerStorage({
    stateRepo: new ButlerStateRepository(db),
    taskRepo: new ButlerTaskRepository(db),
    insightRepo: new ButlerInsightRepository(db),
    feedbackRepo: new ButlerFeedbackRepository(db),
    goalRepo: new ButlerGoalRepository(db),
    narrativeRepo: new NarrativeRepository(db),
    invocationRepo: new LlmInvocationRepository(db),
  });

  return { storage, db };
}
