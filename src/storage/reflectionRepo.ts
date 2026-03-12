import type Database from 'better-sqlite3';
import type { ReflectionRecord, ReflectionTriggerKind } from '../types.js';
import { safeJsonParse } from '../util/json.js';

interface ReflectionRecordRow {
  id: string;
  created_at: string;
  trigger_kind: string;
  experience_ids_json: string;
  analysis_json: string;
  evidence_json: string;
  candidate_rules_json: string;
  state_json: string;
}

function toReflectionRecord(row: ReflectionRecordRow): ReflectionRecord {
  return {
    id: row.id,
    createdAt: row.created_at,
    trigger: {
      kind: row.trigger_kind as ReflectionTriggerKind,
      experienceIds: safeJsonParse(row.experience_ids_json, []),
    },
    analysis: safeJsonParse(row.analysis_json, {
      category: 'unknown',
      summary: '',
      patterns: [],
      concerns: [],
    }),
    evidence: safeJsonParse(row.evidence_json, {
      refs: [],
      confidence: 0,
      recurrenceCount: 0,
    }),
    candidateRules: safeJsonParse(row.candidate_rules_json, []),
    state: safeJsonParse(row.state_json, { promoted: false, rejected: false }),
  };
}

export class ReflectionRepository {
  constructor(private readonly db: Database.Database) {}

  insert(record: ReflectionRecord): void {
    this.db.prepare(`
      INSERT INTO reflection_records (
        id, created_at, trigger_kind, experience_ids_json,
        analysis_json, evidence_json, candidate_rules_json, state_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        created_at = excluded.created_at,
        trigger_kind = excluded.trigger_kind,
        experience_ids_json = excluded.experience_ids_json,
        analysis_json = excluded.analysis_json,
        evidence_json = excluded.evidence_json,
        candidate_rules_json = excluded.candidate_rules_json,
        state_json = excluded.state_json
    `).run(
      record.id,
      record.createdAt,
      record.trigger.kind,
      JSON.stringify(record.trigger.experienceIds),
      JSON.stringify(record.analysis),
      JSON.stringify(record.evidence),
      JSON.stringify(record.candidateRules),
      JSON.stringify(record.state),
    );
  }

  findById(id: string): ReflectionRecord | null {
    const row = this.db.prepare('SELECT * FROM reflection_records WHERE id = ? LIMIT 1').get(id) as
      | ReflectionRecordRow
      | undefined;
    return row ? toReflectionRecord(row) : null;
  }

  listRecent(limit = 20): ReflectionRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM reflection_records
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit) as ReflectionRecordRow[];

    return rows.map(toReflectionRecord);
  }

  listByTriggerKind(kind: ReflectionTriggerKind, limit = 20): ReflectionRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM reflection_records
      WHERE trigger_kind = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(kind, limit) as ReflectionRecordRow[];

    return rows.map(toReflectionRecord);
  }

  count(kind?: ReflectionTriggerKind): number {
    const row = kind
      ? this.db.prepare('SELECT COUNT(*) as count FROM reflection_records WHERE trigger_kind = ?').get(kind) as { count: number }
      : this.db.prepare('SELECT COUNT(*) as count FROM reflection_records').get() as { count: number };

    return row.count;
  }
}
