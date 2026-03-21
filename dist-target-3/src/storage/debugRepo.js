import { randomUUID } from 'node:crypto';
import { safeJsonParse } from '../util/json.js';
function toDebugEvent(row) {
    return {
        id: row.id,
        createdAt: row.created_at,
        kind: row.kind,
        entityId: row.entity_id ?? undefined,
        payload: safeJsonParse(row.payload_json, {}),
    };
}
export class DebugRepository {
    db;
    // A10: Pre-compiled prepared statements for high-frequency operations
    stmtInsert;
    stmtListRecentAll;
    stmtListRecentByKind;
    constructor(db) {
        this.db = db;
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
    log(kind, entityId, payload) {
        this.stmtInsert.run(randomUUID(), kind, entityId ?? null, JSON.stringify(payload));
    }
    listRecent(kind, limit = 20) {
        const rows = kind
            ? this.stmtListRecentByKind.all(kind, limit)
            : this.stmtListRecentAll.all(limit);
        return rows.map(toDebugEvent);
    }
}
