import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { DebugEvent, DebugEventKind } from '../types.js';
import { safeJsonParse } from '../util/json.js';

interface DebugEventRow {
  id: string;
  created_at: string;
  kind: string;
  entity_id: string | null;
  payload_json: string;
}

function toDebugEvent(row: DebugEventRow): DebugEvent {
  return {
    id: row.id,
    createdAt: row.created_at,
    kind: row.kind as DebugEventKind,
    entityId: row.entity_id ?? undefined,
    payload: safeJsonParse(row.payload_json, {}) as Record<string, unknown>,
  };
}

export class DebugRepository {
  // A10: Pre-compiled prepared statements for high-frequency operations
  private readonly stmtInsert: Database.Statement;
  private readonly stmtListRecentAll: Database.Statement;
  private readonly stmtListRecentByKind: Database.Statement;

  constructor(
    private readonly db: Database.Database,
    private readonly enabled = true,
  ) {
    this.stmtInsert = db.prepare(`
      INSERT INTO debug_events (id, created_at, kind, entity_id, payload_json)
      VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?)
    `);
    this.stmtListRecentAll = db.prepare(`
      SELECT * FROM debug_events
      ORDER BY created_at DESC
      LIMIT ?
    `);
    this.stmtListRecentByKind = db.prepare(`
      SELECT * FROM debug_events
      WHERE kind = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
  }

  log(kind: DebugEventKind, entityId: string | undefined, payload: Record<string, unknown>): void {
    if (!this.enabled) {
      return;
    }
    this.stmtInsert.run(randomUUID(), kind, entityId ?? null, JSON.stringify(payload));
  }

  listRecent(kind?: DebugEventKind, limit = 20): DebugEvent[] {
    const rows = kind
      ? this.stmtListRecentByKind.all(kind, limit) as DebugEventRow[]
      : this.stmtListRecentAll.all(limit) as DebugEventRow[];

    return rows.map(toDebugEvent);
  }
}
