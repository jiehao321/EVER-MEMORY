import { safeJsonParse } from '../util/json.js';
function toIntentRecord(row) {
    return {
        id: row.id,
        sessionId: row.session_id ?? undefined,
        messageId: row.message_id ?? undefined,
        createdAt: row.created_at,
        rawText: row.raw_text,
        intent: {
            type: row.intent_type,
            subtype: row.intent_subtype ?? undefined,
            confidence: row.intent_confidence,
        },
        signals: {
            urgency: row.urgency,
            emotionalTone: row.emotional_tone,
            actionNeed: row.action_need,
            memoryNeed: row.memory_need,
            preferenceRelevance: row.preference_relevance,
            correctionSignal: row.correction_signal,
        },
        entities: safeJsonParse(row.entities_json, []),
        retrievalHints: safeJsonParse(row.retrieval_hints_json, {
            preferredTypes: [],
            preferredScopes: [],
            preferredTimeBias: 'balanced',
        }),
    };
}
export class IntentRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    insert(intent) {
        this.db.prepare(`
      INSERT INTO intent_records (
        id, session_id, message_id, created_at, raw_text,
        intent_type, intent_subtype, intent_confidence,
        urgency, emotional_tone, action_need, memory_need,
        preference_relevance, correction_signal, entities_json, retrieval_hints_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        session_id = excluded.session_id,
        message_id = excluded.message_id,
        created_at = excluded.created_at,
        raw_text = excluded.raw_text,
        intent_type = excluded.intent_type,
        intent_subtype = excluded.intent_subtype,
        intent_confidence = excluded.intent_confidence,
        urgency = excluded.urgency,
        emotional_tone = excluded.emotional_tone,
        action_need = excluded.action_need,
        memory_need = excluded.memory_need,
        preference_relevance = excluded.preference_relevance,
        correction_signal = excluded.correction_signal,
        entities_json = excluded.entities_json,
        retrieval_hints_json = excluded.retrieval_hints_json
    `).run(intent.id, intent.sessionId ?? null, intent.messageId ?? null, intent.createdAt, intent.rawText, intent.intent.type, intent.intent.subtype ?? null, intent.intent.confidence, intent.signals.urgency, intent.signals.emotionalTone, intent.signals.actionNeed, intent.signals.memoryNeed, intent.signals.preferenceRelevance, intent.signals.correctionSignal, JSON.stringify(intent.entities), JSON.stringify(intent.retrievalHints));
    }
    findById(id) {
        const row = this.db.prepare('SELECT * FROM intent_records WHERE id = ? LIMIT 1').get(id);
        return row ? toIntentRecord(row) : null;
    }
    listRecentBySession(sessionId, limit = 20) {
        const rows = this.db.prepare(`
      SELECT * FROM intent_records
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(sessionId, limit);
        return rows.map(toIntentRecord);
    }
}
