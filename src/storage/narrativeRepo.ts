import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { NarrativeThread } from '../core/butler/types.js';
import { safeJsonParse } from '../util/json.js';
import { nowIso } from '../util/time.js';

interface NarrativeThreadRow {
  id: string;
  theme: string;
  objective: string | null;
  current_phase: string;
  momentum: string;
  recent_events_json: string;
  blockers_json: string;
  likely_next_turn: string | null;
  strategic_importance: number;
  scope_json: string | null;
  started_at: string;
  updated_at: string;
  closed_at: string | null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function parseStringArray(value: string): string[] {
  const parsed = safeJsonParse<unknown>(value, []);
  return isStringArray(parsed) ? parsed : [];
}

function toNarrativeThread(row: NarrativeThreadRow): NarrativeThread {
  return {
    id: row.id,
    theme: row.theme,
    objective: row.objective ?? '',
    currentPhase: row.current_phase as NarrativeThread['currentPhase'],
    momentum: row.momentum as NarrativeThread['momentum'],
    recentEvents: parseStringArray(row.recent_events_json),
    blockers: parseStringArray(row.blockers_json),
    likelyNextTurn: row.likely_next_turn ?? '',
    strategicImportance: row.strategic_importance,
    scopeJson: row.scope_json ?? undefined,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at ?? undefined,
  };
}

function matchesScope(candidate: string | undefined, scope?: Record<string, unknown>): boolean {
  if (!scope) {
    return true;
  }

  const parsed = candidate ? safeJsonParse<Record<string, unknown> | null>(candidate, null) : null;
  if (!parsed) {
    return false;
  }

  return Object.entries(scope).every(([key, value]) => parsed[key] === value);
}

export class NarrativeRepository {
  private readonly stmtInsert: Database.Statement;
  private readonly stmtFindById: Database.Statement;
  private readonly stmtFindActive: Database.Statement;
  private readonly stmtUpdate: Database.Statement;
  private readonly stmtClose: Database.Statement;

  constructor(private readonly db: Database.Database) {
    this.stmtInsert = db.prepare(`
      INSERT INTO narrative_threads (
        id, theme, objective, current_phase, momentum, recent_events_json, blockers_json,
        likely_next_turn, strategic_importance, scope_json, started_at, updated_at, closed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.stmtFindById = db.prepare('SELECT * FROM narrative_threads WHERE id = ? LIMIT 1');
    this.stmtFindActive = db.prepare(`
      SELECT *
      FROM narrative_threads
      WHERE closed_at IS NULL
      ORDER BY strategic_importance DESC, updated_at DESC
    `);
    this.stmtUpdate = db.prepare(`
      UPDATE narrative_threads
      SET theme = ?, objective = ?, current_phase = ?, momentum = ?, recent_events_json = ?, blockers_json = ?,
          likely_next_turn = ?, strategic_importance = ?, scope_json = ?, started_at = ?, updated_at = ?, closed_at = ?
      WHERE id = ?
    `);
    this.stmtClose = db.prepare(`
      UPDATE narrative_threads
      SET closed_at = ?, updated_at = ?
      WHERE id = ?
    `);
  }

  insert(thread: Omit<NarrativeThread, 'id'>): string {
    const id = randomUUID();
    this.stmtInsert.run(
      id,
      thread.theme,
      thread.objective,
      thread.currentPhase,
      thread.momentum,
      JSON.stringify(thread.recentEvents),
      JSON.stringify(thread.blockers),
      thread.likelyNextTurn,
      thread.strategicImportance,
      thread.scopeJson ?? null,
      thread.startedAt,
      thread.updatedAt,
      thread.closedAt ?? null,
    );
    return id;
  }

  findById(id: string): NarrativeThread | null {
    const row = this.stmtFindById.get(id) as NarrativeThreadRow | undefined;
    return row ? toNarrativeThread(row) : null;
  }

  findActive(scope?: Record<string, unknown>): NarrativeThread[] {
    const rows = this.stmtFindActive.all() as NarrativeThreadRow[];
    return rows.map(toNarrativeThread).filter((thread) => matchesScope(thread.scopeJson, scope));
  }

  update(id: string, patch: Partial<NarrativeThread>): void {
    const current = this.findById(id);
    if (!current) {
      return;
    }

    const merged: NarrativeThread = {
      ...current,
      ...patch,
      updatedAt: patch.updatedAt ?? nowIso(),
    };

    this.stmtUpdate.run(
      merged.theme,
      merged.objective,
      merged.currentPhase,
      merged.momentum,
      JSON.stringify(merged.recentEvents),
      JSON.stringify(merged.blockers),
      merged.likelyNextTurn,
      merged.strategicImportance,
      merged.scopeJson ?? null,
      merged.startedAt,
      merged.updatedAt,
      merged.closedAt ?? null,
      id,
    );
  }

  close(id: string): void {
    const timestamp = nowIso();
    this.stmtClose.run(timestamp, timestamp, id);
  }
}
