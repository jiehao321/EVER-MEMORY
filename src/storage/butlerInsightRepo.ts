import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { ButlerInsight, InsightKind, NewButlerInsight } from '../core/butler/types.js';

interface ButlerInsightRow {
  id: string;
  kind: string;
  scope_json: string | null;
  title: string;
  summary: string;
  confidence: number;
  importance: number;
  fresh_until: string | null;
  source_refs_json: string | null;
  model_used: string | null;
  cycle_trace_id: string | null;
  surfaced_count: number;
  last_surfaced_at: string | null;
  created_at: string;
}

interface ChangesRow {
  count: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function toButlerInsight(row: ButlerInsightRow): ButlerInsight {
  return {
    id: row.id,
    kind: row.kind as InsightKind,
    scopeJson: row.scope_json ?? undefined,
    title: row.title,
    summary: row.summary,
    confidence: row.confidence,
    importance: row.importance,
    freshUntil: row.fresh_until ?? undefined,
    sourceRefsJson: row.source_refs_json ?? undefined,
    modelUsed: row.model_used ?? undefined,
    cycleTraceId: row.cycle_trace_id ?? undefined,
    surfacedCount: row.surfaced_count,
    lastSurfacedAt: row.last_surfaced_at ?? undefined,
    createdAt: row.created_at,
  };
}

export class ButlerInsightRepository {
  private readonly stmtInsert: Database.Statement;
  private readonly stmtFindById: Database.Statement;
  private readonly stmtFindByKind: Database.Statement;
  private readonly stmtFindFresh: Database.Statement;
  private readonly stmtMarkSurfaced: Database.Statement;
  private readonly stmtDeleteExpired: Database.Statement;
  private readonly stmtChanges: Database.Statement;

  constructor(private readonly db: Database.Database) {
    this.stmtInsert = db.prepare(`
      INSERT INTO butler_insights (
        id, kind, scope_json, title, summary, confidence, importance, fresh_until,
        source_refs_json, model_used, cycle_trace_id, surfaced_count, last_surfaced_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)
    `);
    this.stmtFindById = db.prepare('SELECT * FROM butler_insights WHERE id = ? LIMIT 1');
    this.stmtFindByKind = db.prepare(`
      SELECT *
      FROM butler_insights
      WHERE kind = ?
      ORDER BY importance DESC, created_at DESC
      LIMIT ?
    `);
    this.stmtFindFresh = db.prepare(`
      SELECT *
      FROM butler_insights
      WHERE fresh_until IS NOT NULL
        AND fresh_until > ?
      ORDER BY importance DESC, fresh_until ASC
      LIMIT ?
    `);
    this.stmtMarkSurfaced = db.prepare(`
      UPDATE butler_insights
      SET surfaced_count = surfaced_count + 1,
          last_surfaced_at = ?
      WHERE id = ?
    `);
    this.stmtDeleteExpired = db.prepare(`
      DELETE FROM butler_insights
      WHERE fresh_until IS NOT NULL
        AND fresh_until <= ?
    `);
    this.stmtChanges = db.prepare('SELECT changes() AS count');
  }

  insert(insight: NewButlerInsight): string {
    const id = randomUUID();
    this.stmtInsert.run(
      id,
      insight.kind,
      insight.scope === undefined ? null : JSON.stringify(insight.scope),
      insight.title,
      insight.summary,
      insight.confidence ?? 0.5,
      insight.importance ?? 0.5,
      insight.freshUntil ?? null,
      insight.sourceRefs === undefined ? null : JSON.stringify(insight.sourceRefs),
      insight.modelUsed ?? null,
      insight.cycleTraceId ?? null,
      nowIso(),
    );
    return id;
  }

  findById(id: string): ButlerInsight | null {
    const row = this.stmtFindById.get(id) as ButlerInsightRow | undefined;
    return row ? toButlerInsight(row) : null;
  }

  findByKind(kind: InsightKind, limit = 20): ButlerInsight[] {
    const rows = this.stmtFindByKind.all(kind, limit) as ButlerInsightRow[];
    return rows.map(toButlerInsight);
  }

  findFresh(limit = 20): ButlerInsight[] {
    const rows = this.stmtFindFresh.all(nowIso(), limit) as ButlerInsightRow[];
    return rows.map(toButlerInsight);
  }

  markSurfaced(id: string): void {
    this.stmtMarkSurfaced.run(nowIso(), id);
  }

  deleteExpired(): number {
    this.stmtDeleteExpired.run(nowIso());
    return (this.stmtChanges.get() as ChangesRow).count;
  }
}
