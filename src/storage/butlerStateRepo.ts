import type Database from 'better-sqlite3';
import type { ButlerMode, ButlerPersistentState } from '../core/butler/types.js';
import { safeJsonParse } from '../util/json.js';
import { nowIso } from '../util/time.js';

const SINGLETON_ID = 'singleton';

interface ButlerStateRow {
  strategy_frame_json: string;
  self_model_json: string;
  working_memory_json: string;
  mode: string;
  last_cycle_at: string | null;
  last_cycle_version: number;
  updated_at: string;
}

function toButlerPersistentState(row: ButlerStateRow): ButlerPersistentState {
  return {
    currentStrategyFrame: safeJsonParse(row.strategy_frame_json, {
      currentMode: 'exploring',
      likelyUserGoal: '',
      topPriorities: [],
      constraints: [],
      lastUpdatedAt: row.updated_at,
    }),
    selfModel: safeJsonParse(row.self_model_json, {
      overlayAcceptanceRate: 0,
      insightPrecision: 0,
      avgCycleLatencyMs: 0,
      totalCycles: 0,
      lastEvaluatedAt: row.updated_at,
    }),
    workingMemory: safeJsonParse(row.working_memory_json, []),
    mode: row.mode as ButlerMode,
    lastCycleAt: row.last_cycle_at ?? row.updated_at,
    lastCycleVersion: row.last_cycle_version,
  };
}

export class ButlerStateRepository {
  private readonly stmtLoad: Database.Statement;
  private readonly stmtSave: Database.Statement;
  private readonly stmtUpdateMode: Database.Statement;

  constructor(private readonly db: Database.Database) {
    this.stmtLoad = db.prepare(`
      SELECT strategy_frame_json, self_model_json, working_memory_json, mode, last_cycle_at, last_cycle_version, updated_at
      FROM butler_state
      WHERE id = ?
      LIMIT 1
    `);
    this.stmtSave = db.prepare(`
      INSERT INTO butler_state (
        id, strategy_frame_json, self_model_json, working_memory_json, mode, last_cycle_at, last_cycle_version, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        strategy_frame_json = excluded.strategy_frame_json,
        self_model_json = excluded.self_model_json,
        working_memory_json = excluded.working_memory_json,
        mode = excluded.mode,
        last_cycle_at = excluded.last_cycle_at,
        last_cycle_version = excluded.last_cycle_version,
        updated_at = excluded.updated_at
    `);
    this.stmtUpdateMode = db.prepare(`
      INSERT INTO butler_state (
        id, strategy_frame_json, self_model_json, working_memory_json, mode, last_cycle_at, last_cycle_version, updated_at
      ) VALUES (?, '{}', '{}', '[]', ?, NULL, 0, ?)
      ON CONFLICT(id) DO UPDATE SET
        mode = excluded.mode,
        updated_at = excluded.updated_at
    `);
  }

  load(): ButlerPersistentState | null {
    const row = this.stmtLoad.get(SINGLETON_ID) as ButlerStateRow | undefined;
    return row ? toButlerPersistentState(row) : null;
  }

  save(state: ButlerPersistentState): void {
    const updatedAt = nowIso();
    this.stmtSave.run(
      SINGLETON_ID,
      JSON.stringify(state.currentStrategyFrame),
      JSON.stringify(state.selfModel),
      JSON.stringify(state.workingMemory),
      state.mode,
      state.lastCycleAt,
      state.lastCycleVersion,
      updatedAt,
    );
  }

  updateMode(mode: ButlerMode): void {
    this.stmtUpdateMode.run(SINGLETON_ID, mode, nowIso());
  }
}
