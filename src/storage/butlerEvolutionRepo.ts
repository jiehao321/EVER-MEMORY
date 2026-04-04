import type Database from 'better-sqlite3';
import type { EvolutionLogEntry } from '../core/butler/evolution/types.js';

interface EvolutionLogRow {
  id: string;
  cycle_type: string;
  parameter_key: string | null;
  old_value_json: string | null;
  new_value_json: string | null;
  evidence_json: string;
  confidence: number;
  status: EvolutionLogEntry['status'];
  created_at: string;
}

function toEvolutionLogEntry(row: EvolutionLogRow): EvolutionLogEntry {
  return {
    id: row.id,
    cycleType: row.cycle_type,
    parameterKey: row.parameter_key ?? undefined,
    oldValueJson: row.old_value_json ?? undefined,
    newValueJson: row.new_value_json ?? undefined,
    evidenceJson: row.evidence_json,
    confidence: row.confidence,
    status: row.status,
    createdAt: row.created_at,
  };
}

export class ButlerEvolutionRepository {
  private readonly stmtInsert: Database.Statement;
  private readonly stmtFindRecent: Database.Statement;
  private readonly stmtRevert: Database.Statement;

  constructor(private readonly db: Database.Database) {
    this.stmtInsert = db.prepare(`
      INSERT INTO butler_evolution_log (
        id, cycle_type, parameter_key, old_value_json, new_value_json,
        evidence_json, confidence, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.stmtFindRecent = db.prepare(`
      SELECT *
      FROM butler_evolution_log
      ORDER BY created_at DESC, rowid DESC
      LIMIT ?
    `);
    this.stmtRevert = db.prepare(`
      UPDATE butler_evolution_log
      SET status = 'reverted'
      WHERE id = ?
    `);
  }

  insertLog(entry: EvolutionLogEntry): void {
    this.stmtInsert.run(
      entry.id,
      entry.cycleType,
      entry.parameterKey ?? null,
      entry.oldValueJson ?? null,
      entry.newValueJson ?? null,
      entry.evidenceJson,
      entry.confidence,
      entry.status,
      entry.createdAt,
    );
  }

  findRecent(limit: number): EvolutionLogEntry[] {
    const rows = this.stmtFindRecent.all(limit) as EvolutionLogRow[];
    return rows.map(toEvolutionLogEntry);
  }

  revertEntry(id: string): void {
    this.stmtRevert.run(id);
  }
}
