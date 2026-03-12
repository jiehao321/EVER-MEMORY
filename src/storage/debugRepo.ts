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
  constructor(private readonly db: Database.Database) {}

  log(kind: DebugEventKind, entityId: string | undefined, payload: Record<string, unknown>): void {
    this.db.prepare(`
      INSERT INTO debug_events (id, created_at, kind, entity_id, payload_json)
      VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?)
    `).run(
      randomUUID(),
      kind,
      entityId ?? null,
      JSON.stringify(payload),
    );
  }

  listRecent(kind?: DebugEventKind, limit = 20): DebugEvent[] {
    const rows = kind
      ? this.db.prepare(`
          SELECT * FROM debug_events
          WHERE kind = ?
          ORDER BY created_at DESC
          LIMIT ?
        `).all(kind, limit) as DebugEventRow[]
      : this.db.prepare(`
          SELECT * FROM debug_events
          ORDER BY created_at DESC
          LIMIT ?
        `).all(limit) as DebugEventRow[];

    return rows.map(toDebugEvent);
  }
}
