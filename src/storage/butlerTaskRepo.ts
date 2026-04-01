import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { ButlerTask, NewButlerTask } from '../core/butler/types.js';
import { nowIso } from '../util/time.js';

interface ButlerTaskRow {
  id: string;
  type: string;
  priority: number;
  status: string;
  trigger: string | null;
  payload_json: string | null;
  budget_class: string;
  scheduled_at: string | null;
  lease_until: string | null;
  attempt_count: number;
  max_attempts: number;
  idempotency_key: string | null;
  result_json: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

interface CountRow {
  count: number;
}

function toButlerTask(row: ButlerTaskRow): ButlerTask {
  return {
    id: row.id,
    type: row.type,
    priority: row.priority,
    status: row.status as ButlerTask['status'],
    trigger: row.trigger ?? undefined,
    payloadJson: row.payload_json ?? undefined,
    budgetClass: row.budget_class,
    scheduledAt: row.scheduled_at ?? undefined,
    leaseUntil: row.lease_until ?? undefined,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    idempotencyKey: row.idempotency_key ?? undefined,
    resultJson: row.result_json ?? undefined,
    error: row.error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ButlerTaskRepository {
  private readonly stmtInsert: Database.Statement;
  private readonly stmtSelectLeaseable: Database.Statement;
  private readonly stmtMarkRunning: Database.Statement;
  private readonly stmtSelectById: Database.Statement;
  private readonly stmtComplete: Database.Statement;
  private readonly stmtFail: Database.Statement;
  private readonly stmtPendingCount: Database.Statement;
  private readonly stmtByIdempotencyKey: Database.Statement;

  constructor(private readonly db: Database.Database) {
    this.stmtInsert = db.prepare(`
      INSERT INTO butler_tasks (
        id, type, priority, status, trigger, payload_json, budget_class, scheduled_at,
        lease_until, attempt_count, max_attempts, idempotency_key, result_json, error, created_at, updated_at
      ) VALUES (?, ?, ?, 'queued', ?, ?, ?, ?, NULL, 0, ?, ?, NULL, NULL, ?, ?)
    `);
    this.stmtSelectLeaseable = db.prepare(`
      SELECT *
      FROM butler_tasks
      WHERE status = 'queued'
        AND priority <= ?
        AND (scheduled_at IS NULL OR scheduled_at <= ?)
        AND (lease_until IS NULL OR lease_until <= ?)
      ORDER BY priority ASC, created_at ASC
      LIMIT ?
    `);
    this.stmtMarkRunning = db.prepare(`
      UPDATE butler_tasks
      SET status = 'running',
          lease_until = ?,
          attempt_count = attempt_count + 1,
          updated_at = ?
      WHERE id = ?
    `);
    this.stmtSelectById = db.prepare('SELECT * FROM butler_tasks WHERE id = ? LIMIT 1');
    this.stmtComplete = db.prepare(`
      UPDATE butler_tasks
      SET status = 'completed',
          result_json = ?,
          error = NULL,
          lease_until = NULL,
          updated_at = ?
      WHERE id = ?
    `);
    this.stmtFail = db.prepare(`
      UPDATE butler_tasks
      SET status = 'failed',
          error = ?,
          lease_until = NULL,
          updated_at = ?
      WHERE id = ?
    `);
    this.stmtPendingCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM butler_tasks
      WHERE status = 'queued'
    `);
    this.stmtByIdempotencyKey = db.prepare(`
      SELECT *
      FROM butler_tasks
      WHERE idempotency_key = ?
      LIMIT 1
    `);
  }

  addTask(task: NewButlerTask): string {
    const id = randomUUID();
    const timestamp = nowIso();
    this.stmtInsert.run(
      id,
      task.type,
      task.priority ?? 5,
      task.trigger ?? null,
      task.payload === undefined ? null : JSON.stringify(task.payload),
      task.budgetClass ?? 'low',
      task.scheduledAt ?? null,
      task.maxAttempts ?? 3,
      task.idempotencyKey ?? null,
      timestamp,
      timestamp,
    );
    return id;
  }

  leaseTasks(limit: number, maxPriority = Number.MAX_SAFE_INTEGER): ButlerTask[] {
    const transaction = this.db.transaction(() => {
      const now = nowIso();
      const leaseUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      const rows = this.stmtSelectLeaseable.all(maxPriority, now, now, limit) as ButlerTaskRow[];

      for (const row of rows) {
        this.stmtMarkRunning.run(leaseUntil, now, row.id);
      }

      return rows
        .map((row) => {
          const updated = this.stmtSelectById.get(row.id) as ButlerTaskRow | undefined;
          return updated ? toButlerTask(updated) : null;
        })
        .filter((row): row is ButlerTask => row !== null);
    });

    return transaction();
  }

  completeTask(id: string, result: unknown): void {
    this.stmtComplete.run(JSON.stringify(result), nowIso(), id);
  }

  failTask(id: string, error: string): void {
    this.stmtFail.run(error, nowIso(), id);
  }

  getPendingCount(): number {
    return (this.stmtPendingCount.get() as CountRow).count;
  }

  getByIdempotencyKey(key: string): ButlerTask | null {
    const row = this.stmtByIdempotencyKey.get(key) as ButlerTaskRow | undefined;
    return row ? toButlerTask(row) : null;
  }
}
