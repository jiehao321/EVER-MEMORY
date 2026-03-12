import type Database from 'better-sqlite3';
import type { ExperienceLog } from '../types.js';
import { safeJsonParse } from '../util/json.js';

interface ExperienceLogRow {
  id: string;
  session_id: string | null;
  message_id: string | null;
  created_at: string;
  input_summary: string;
  action_summary: string;
  outcome_summary: string | null;
  indicators_json: string;
  evidence_refs_json: string;
}

function toExperienceLog(row: ExperienceLogRow): ExperienceLog {
  return {
    id: row.id,
    sessionId: row.session_id ?? undefined,
    messageId: row.message_id ?? undefined,
    createdAt: row.created_at,
    inputSummary: row.input_summary,
    actionSummary: row.action_summary,
    outcomeSummary: row.outcome_summary ?? undefined,
    indicators: safeJsonParse(row.indicators_json, {
      userCorrection: false,
      userApproval: false,
      externalActionRisk: false,
      hesitation: false,
      repeatMistakeSignal: false,
    }),
    evidenceRefs: safeJsonParse(row.evidence_refs_json, []),
  };
}

export class ExperienceRepository {
  constructor(private readonly db: Database.Database) {}

  insert(log: ExperienceLog): void {
    this.db.prepare(`
      INSERT INTO experience_logs (
        id, session_id, message_id, created_at,
        input_summary, action_summary, outcome_summary,
        indicators_json, evidence_refs_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        session_id = excluded.session_id,
        message_id = excluded.message_id,
        created_at = excluded.created_at,
        input_summary = excluded.input_summary,
        action_summary = excluded.action_summary,
        outcome_summary = excluded.outcome_summary,
        indicators_json = excluded.indicators_json,
        evidence_refs_json = excluded.evidence_refs_json
    `).run(
      log.id,
      log.sessionId ?? null,
      log.messageId ?? null,
      log.createdAt,
      log.inputSummary,
      log.actionSummary,
      log.outcomeSummary ?? null,
      JSON.stringify(log.indicators),
      JSON.stringify(log.evidenceRefs),
    );
  }

  findById(id: string): ExperienceLog | null {
    const row = this.db.prepare('SELECT * FROM experience_logs WHERE id = ? LIMIT 1').get(id) as
      | ExperienceLogRow
      | undefined;
    return row ? toExperienceLog(row) : null;
  }

  listRecentBySession(sessionId: string, limit = 20): ExperienceLog[] {
    const rows = this.db.prepare(`
      SELECT * FROM experience_logs
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(sessionId, limit) as ExperienceLogRow[];

    return rows.map(toExperienceLog);
  }

  listRecent(limit = 20): ExperienceLog[] {
    const rows = this.db.prepare(`
      SELECT * FROM experience_logs
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit) as ExperienceLogRow[];

    return rows.map(toExperienceLog);
  }

  count(sessionId?: string): number {
    const row = sessionId
      ? this.db.prepare('SELECT COUNT(*) as count FROM experience_logs WHERE session_id = ?').get(sessionId) as { count: number }
      : this.db.prepare('SELECT COUNT(*) as count FROM experience_logs').get() as { count: number };

    return row.count;
  }
}
