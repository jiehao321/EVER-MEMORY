import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { nowIso } from '../util/time.js';

export type ButlerFeedbackAction = 'accepted' | 'rejected' | 'snoozed' | 'dismissed';

export interface NewButlerFeedback {
  insightId: string;
  action: ButlerFeedbackAction;
  snoozeUntil?: string;
  reason?: string;
}

export interface ButlerFeedback {
  id: string;
  insightId: string;
  action: ButlerFeedbackAction;
  snoozeUntil?: string;
  reason?: string;
  createdAt: string;
}

interface ButlerFeedbackRow {
  id: string;
  insight_id: string;
  action: string;
  snooze_until: string | null;
  reason: string | null;
  created_at: string;
}

interface ChangesRow {
  count: number;
}

interface StatsRow {
  accepted: number | null;
  rejected: number | null;
  total: number | null;
}

function toMs(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function toButlerFeedback(row: ButlerFeedbackRow): ButlerFeedback {
  return {
    id: row.id,
    insightId: row.insight_id,
    action: row.action as ButlerFeedbackAction,
    snoozeUntil: row.snooze_until ?? undefined,
    reason: row.reason ?? undefined,
    createdAt: row.created_at,
  };
}

function requireValidSnooze(feedback: NewButlerFeedback): void {
  if (feedback.action !== 'snoozed') {
    return;
  }
  if (!feedback.snoozeUntil || toMs(feedback.snoozeUntil) === null) {
    throw new Error('snoozeUntil is required and must be a valid ISO timestamp when action is snoozed.');
  }
}

export class ButlerFeedbackRepository {
  private readonly stmtInsert: Database.Statement;
  private readonly stmtFindByInsightId: Database.Statement;
  private readonly stmtFindLatest: Database.Statement;
  private readonly stmtStats: Database.Statement;
  private readonly stmtPruneExpired: Database.Statement;
  private readonly stmtChanges: Database.Statement;

  constructor(private readonly db: Database.Database) {
    this.stmtInsert = db.prepare(`
      INSERT INTO butler_feedback (id, insight_id, action, snooze_until, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    this.stmtFindByInsightId = db.prepare(`
      SELECT *
      FROM butler_feedback
      WHERE insight_id = ?
      ORDER BY created_at DESC, rowid DESC
    `);
    this.stmtFindLatest = db.prepare(`
      SELECT *
      FROM butler_feedback
      WHERE insight_id = ?
      ORDER BY created_at DESC, rowid DESC
      LIMIT 1
    `);
    this.stmtStats = db.prepare(`
      SELECT
        SUM(CASE WHEN action = 'accepted' THEN 1 ELSE 0 END) AS accepted,
        SUM(CASE WHEN action = 'rejected' THEN 1 ELSE 0 END) AS rejected,
        SUM(CASE WHEN action IN ('accepted', 'rejected') THEN 1 ELSE 0 END) AS total
      FROM butler_feedback
    `);
    this.stmtPruneExpired = db.prepare(`
      DELETE FROM butler_feedback
      WHERE action = 'snoozed'
        AND snooze_until IS NOT NULL
        AND snooze_until < ?
    `);
    this.stmtChanges = db.prepare('SELECT changes() AS count');
  }

  insert(feedback: NewButlerFeedback): ButlerFeedback {
    requireValidSnooze(feedback);
    const record: ButlerFeedback = {
      id: randomUUID(),
      insightId: feedback.insightId,
      action: feedback.action,
      snoozeUntil: feedback.snoozeUntil,
      reason: feedback.reason,
      createdAt: nowIso(),
    };
    this.stmtInsert.run(
      record.id,
      record.insightId,
      record.action,
      record.snoozeUntil ?? null,
      record.reason ?? null,
      record.createdAt,
    );
    return record;
  }

  findByInsightId(insightId: string): ButlerFeedback[] {
    const rows = this.stmtFindByInsightId.all(insightId) as ButlerFeedbackRow[];
    return rows.map(toButlerFeedback);
  }

  getLatestAction(insightId: string): ButlerFeedbackAction | null {
    return this.getLatestFeedback(insightId)?.action ?? null;
  }

  isSnoozed(insightId: string): boolean {
    const latest = this.getLatestFeedback(insightId);
    const snoozeUntilMs = toMs(latest?.snoozeUntil);
    return latest?.action === 'snoozed' && snoozeUntilMs !== null && snoozeUntilMs > Date.now();
  }

  isDismissed(insightId: string): boolean {
    return this.getLatestAction(insightId) === 'dismissed';
  }

  isBlocked(insightId: string): boolean {
    return this.isSnoozed(insightId) || this.isDismissed(insightId);
  }

  getAcceptanceStats(): { accepted: number; rejected: number; total: number } {
    const row = this.stmtStats.get() as StatsRow | undefined;
    return {
      accepted: row?.accepted ?? 0,
      rejected: row?.rejected ?? 0,
      total: row?.total ?? 0,
    };
  }

  pruneExpired(): number {
    this.stmtPruneExpired.run(nowIso());
    return (this.stmtChanges.get() as ChangesRow).count;
  }

  private getLatestFeedback(insightId: string): ButlerFeedback | null {
    const row = this.stmtFindLatest.get(insightId) as ButlerFeedbackRow | undefined;
    return row ? toButlerFeedback(row) : null;
  }
}
