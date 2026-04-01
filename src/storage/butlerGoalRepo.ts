import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { nowIso } from '../util/time.js';

export type GoalStatus = 'active' | 'paused' | 'completed' | 'abandoned';

export interface NewButlerGoal {
  title: string;
  description?: string;
  scope?: Record<string, unknown>;
  priority?: number;
  deadline?: string;
  sourceInsightIds?: string[];
}

export interface ButlerGoal {
  id: string;
  title: string;
  description?: string;
  status: GoalStatus;
  scopeJson?: string;
  priority: number;
  deadline?: string;
  progressNotes?: string;
  sourceInsightIds: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

interface ButlerGoalRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  scope_json: string | null;
  priority: number;
  deadline: string | null;
  progress_notes: string | null;
  source_insight_ids: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface ChangesRow {
  count: number;
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseStringArray(value: string | null): string[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function parseScope(scopeJson: string | undefined): Record<string, unknown> | undefined {
  if (!scopeJson) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(scopeJson) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function matchesScope(scopeJson: string | undefined, scope: Record<string, unknown> | undefined): boolean {
  if (!scope || Object.keys(scope).length === 0) {
    return true;
  }
  const goalScope = parseScope(scopeJson);
  return Object.entries(scope).every(([key, value]) => goalScope?.[key] === value);
}

function normalizePriority(priority: number | undefined): number {
  const value = priority ?? 5;
  return Math.max(1, Math.min(10, Math.round(value)));
}

function toButlerGoal(row: ButlerGoalRow): ButlerGoal {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status as GoalStatus,
    scopeJson: row.scope_json ?? undefined,
    priority: row.priority,
    deadline: row.deadline ?? undefined,
    progressNotes: row.progress_notes ?? undefined,
    sourceInsightIds: parseStringArray(row.source_insight_ids),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
  };
}

export class ButlerGoalRepository {
  private readonly stmtInsert: Database.Statement;
  private readonly stmtFindById: Database.Statement;
  private readonly stmtFindActive: Database.Statement;
  private readonly stmtFindByStatus: Database.Statement;
  private readonly stmtUpdate: Database.Statement;
  private readonly stmtSetStatus: Database.Statement;
  private readonly stmtDelete: Database.Statement;
  private readonly stmtChanges: Database.Statement;

  constructor(private readonly db: Database.Database) {
    this.stmtInsert = db.prepare(`
      INSERT INTO butler_goals (
        id, title, description, status, scope_json, priority, deadline,
        progress_notes, source_insight_ids, created_at, updated_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.stmtFindById = db.prepare('SELECT * FROM butler_goals WHERE id = ? LIMIT 1');
    this.stmtFindActive = db.prepare(`
      SELECT *
      FROM butler_goals
      WHERE status = 'active'
      ORDER BY priority ASC, created_at ASC
    `);
    this.stmtFindByStatus = db.prepare(`
      SELECT *
      FROM butler_goals
      WHERE status = ?
      ORDER BY priority ASC, created_at ASC
    `);
    this.stmtUpdate = db.prepare(`
      UPDATE butler_goals
      SET title = ?,
          description = ?,
          priority = ?,
          deadline = ?,
          progress_notes = ?,
          updated_at = ?
      WHERE id = ?
    `);
    this.stmtSetStatus = db.prepare(`
      UPDATE butler_goals
      SET status = ?,
          updated_at = ?,
          completed_at = ?
      WHERE id = ?
    `);
    this.stmtDelete = db.prepare('DELETE FROM butler_goals WHERE id = ?');
    this.stmtChanges = db.prepare('SELECT changes() AS count');
  }

  insert(goal: NewButlerGoal): ButlerGoal {
    const timestamp = nowIso();
    const record: ButlerGoal = {
      id: randomUUID(),
      title: goal.title,
      description: goal.description,
      status: 'active',
      scopeJson: goal.scope === undefined ? undefined : JSON.stringify(goal.scope),
      priority: normalizePriority(goal.priority),
      deadline: goal.deadline,
      progressNotes: undefined,
      sourceInsightIds: goal.sourceInsightIds ?? [],
      createdAt: timestamp,
      updatedAt: timestamp,
      completedAt: undefined,
    };
    this.stmtInsert.run(
      record.id,
      record.title,
      record.description ?? null,
      record.status,
      record.scopeJson ?? null,
      record.priority,
      record.deadline ?? null,
      null,
      JSON.stringify(record.sourceInsightIds),
      record.createdAt,
      record.updatedAt,
      null,
    );
    return record;
  }

  findById(id: string): ButlerGoal | null {
    const row = this.stmtFindById.get(id) as ButlerGoalRow | undefined;
    return row ? toButlerGoal(row) : null;
  }

  findActive(scope?: Record<string, unknown>): ButlerGoal[] {
    const rows = this.stmtFindActive.all() as ButlerGoalRow[];
    return rows.map(toButlerGoal).filter((goal) => matchesScope(goal.scopeJson, scope));
  }

  findByStatus(status: GoalStatus): ButlerGoal[] {
    const rows = this.stmtFindByStatus.all(status) as ButlerGoalRow[];
    return rows.map(toButlerGoal);
  }

  update(
    id: string,
    patch: Partial<Pick<ButlerGoal, 'title' | 'description' | 'priority' | 'deadline' | 'progressNotes'>>,
  ): ButlerGoal | null {
    const current = this.findById(id);
    if (!current) {
      return null;
    }
    this.stmtUpdate.run(
      patch.title ?? current.title,
      patch.description ?? current.description ?? null,
      normalizePriority(patch.priority ?? current.priority),
      patch.deadline ?? current.deadline ?? null,
      patch.progressNotes ?? current.progressNotes ?? null,
      nowIso(),
      id,
    );
    return this.findById(id);
  }

  setStatus(id: string, status: GoalStatus): ButlerGoal | null {
    const completedAt = status === 'completed' ? nowIso() : null;
    this.stmtSetStatus.run(status, nowIso(), completedAt, id);
    return this.findById(id);
  }

  addProgressNote(id: string, note: string): ButlerGoal | null {
    const current = this.findById(id);
    if (!current) {
      return null;
    }
    const nextNotes = `${current.progressNotes ?? ''}[${todayStamp()}] ${note}\n`;
    return this.update(id, { progressNotes: nextNotes });
  }

  deleteById(id: string): boolean {
    this.stmtDelete.run(id);
    return (this.stmtChanges.get() as ChangesRow).count > 0;
  }
}
