import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { ActionRecord } from '../core/butler/actions/types.js';

interface ActionRecordRow {
  id: string;
  cycle_id: string | null;
  action_type: string;
  params_json: string | null;
  result_json: string | null;
  status: ActionRecord['status'];
  rollback_json: string | null;
  budget_cost_ms: number | null;
  created_at: string;
  completed_at: string | null;
}

interface CountRow {
  count: number;
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function toActionRecord(row: ActionRecordRow): ActionRecord {
  return {
    id: row.id,
    cycleId: row.cycle_id ?? undefined,
    actionType: row.action_type,
    paramsJson: row.params_json ?? undefined,
    resultJson: row.result_json ?? undefined,
    status: row.status,
    rollbackJson: row.rollback_json ?? undefined,
    budgetCostMs: row.budget_cost_ms ?? undefined,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
  };
}

export class ButlerActionRepository {
  private readonly stmtInsert: Database.Statement;
  private readonly stmtUpdateStatus: Database.Statement;
  private readonly stmtFindByCycleId: Database.Statement;
  private readonly stmtDailyCount: Database.Statement;

  constructor(private readonly db: Database.Database) {
    this.stmtInsert = db.prepare(`
      INSERT INTO butler_actions (
        id, cycle_id, action_type, params_json, result_json, status,
        rollback_json, budget_cost_ms, created_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.stmtUpdateStatus = db.prepare(`
      UPDATE butler_actions
      SET status = ?,
          result_json = COALESCE(?, result_json),
          completed_at = COALESCE(?, completed_at)
      WHERE id = ?
    `);
    this.stmtFindByCycleId = db.prepare(`
      SELECT *
      FROM butler_actions
      WHERE cycle_id = ?
      ORDER BY created_at ASC, rowid ASC
    `);
    this.stmtDailyCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM butler_actions
      WHERE substr(created_at, 1, 10) = ?
    `);
  }

  insert(record: Omit<ActionRecord, 'id'>): string {
    const id = randomUUID();
    this.stmtInsert.run(
      id,
      record.cycleId ?? null,
      record.actionType,
      record.paramsJson ?? null,
      record.resultJson ?? null,
      record.status,
      record.rollbackJson ?? null,
      record.budgetCostMs ?? null,
      record.createdAt,
      record.completedAt ?? null,
    );
    return id;
  }

  updateStatus(
    id: string,
    status: string,
    resultJson?: string,
    completedAt?: string,
  ): void {
    this.stmtUpdateStatus.run(status, resultJson ?? null, completedAt ?? null, id);
  }

  findByCycleId(cycleId: string): ActionRecord[] {
    const rows = this.stmtFindByCycleId.all(cycleId) as ActionRecordRow[];
    return rows.map(toActionRecord);
  }

  getDailyCount(date = todayStamp()): number {
    return (this.stmtDailyCount.get(date) as CountRow).count;
  }
}
