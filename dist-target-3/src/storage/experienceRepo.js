import { safeJsonParse } from '../util/json.js';
function toExperienceLog(row) {
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
    db;
    constructor(db) {
        this.db = db;
    }
    insert(log) {
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
    `).run(log.id, log.sessionId ?? null, log.messageId ?? null, log.createdAt, log.inputSummary, log.actionSummary, log.outcomeSummary ?? null, JSON.stringify(log.indicators), JSON.stringify(log.evidenceRefs));
    }
    findById(id) {
        const row = this.db.prepare('SELECT * FROM experience_logs WHERE id = ? LIMIT 1').get(id);
        return row ? toExperienceLog(row) : null;
    }
    listRecentBySession(sessionId, limit = 20) {
        const rows = this.db.prepare(`
      SELECT * FROM experience_logs
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(sessionId, limit);
        return rows.map(toExperienceLog);
    }
    listRecent(limit = 20) {
        const rows = this.db.prepare(`
      SELECT * FROM experience_logs
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit);
        return rows.map(toExperienceLog);
    }
    count(sessionId) {
        const row = sessionId
            ? this.db.prepare('SELECT COUNT(*) as count FROM experience_logs WHERE session_id = ?').get(sessionId)
            : this.db.prepare('SELECT COUNT(*) as count FROM experience_logs').get();
        return row.count;
    }
}
