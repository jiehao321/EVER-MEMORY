import type Database from 'better-sqlite3';
import type { IntentRecord } from '../types.js';
import { safeJsonParse } from '../util/json.js';

interface IntentRecordRow {
  id: string;
  session_id: string | null;
  message_id: string | null;
  created_at: string;
  raw_text: string;
  intent_type: string;
  intent_subtype: string | null;
  intent_confidence: number;
  urgency: string;
  emotional_tone: string;
  action_need: string;
  memory_need: string;
  preference_relevance: number;
  correction_signal: number;
  entities_json: string;
  retrieval_hints_json: string;
}

function toIntentRecord(row: IntentRecordRow): IntentRecord {
  return {
    id: row.id,
    sessionId: row.session_id ?? undefined,
    messageId: row.message_id ?? undefined,
    createdAt: row.created_at,
    rawText: row.raw_text,
    intent: {
      type: row.intent_type as IntentRecord['intent']['type'],
      subtype: row.intent_subtype ?? undefined,
      confidence: row.intent_confidence,
    },
    signals: {
      urgency: row.urgency as IntentRecord['signals']['urgency'],
      emotionalTone: row.emotional_tone as IntentRecord['signals']['emotionalTone'],
      actionNeed: row.action_need as IntentRecord['signals']['actionNeed'],
      memoryNeed: row.memory_need as IntentRecord['signals']['memoryNeed'],
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
  constructor(private readonly db: Database.Database) {}

  insert(intent: IntentRecord): void {
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
    `).run(
      intent.id,
      intent.sessionId ?? null,
      intent.messageId ?? null,
      intent.createdAt,
      intent.rawText,
      intent.intent.type,
      intent.intent.subtype ?? null,
      intent.intent.confidence,
      intent.signals.urgency,
      intent.signals.emotionalTone,
      intent.signals.actionNeed,
      intent.signals.memoryNeed,
      intent.signals.preferenceRelevance,
      intent.signals.correctionSignal,
      JSON.stringify(intent.entities),
      JSON.stringify(intent.retrievalHints),
    );
  }

  findById(id: string): IntentRecord | null {
    const row = this.db.prepare('SELECT * FROM intent_records WHERE id = ? LIMIT 1').get(id) as
      | IntentRecordRow
      | undefined;
    return row ? toIntentRecord(row) : null;
  }

  listRecentBySession(sessionId: string, limit = 20): IntentRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM intent_records
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(sessionId, limit) as IntentRecordRow[];

    return rows.map(toIntentRecord);
  }
}
