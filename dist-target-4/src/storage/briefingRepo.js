import { safeJsonParse } from '../util/json.js';
import { StorageError } from '../errors.js';
function toBootBriefing(row) {
    return {
        id: row.id,
        sessionId: row.session_id ?? undefined,
        userId: row.user_id ?? undefined,
        generatedAt: row.generated_at,
        sections: safeJsonParse(row.sections_json, {
            identity: [],
            constraints: [],
            recentContinuity: [],
            activeProjects: [],
        }),
        tokenTarget: row.token_target,
        actualApproxTokens: row.actual_approx_tokens,
    };
}
export class BriefingRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    save(briefing) {
        try {
            this.db.prepare(`
        INSERT INTO boot_briefings (
          id, session_id, user_id, generated_at, sections_json, token_target, actual_approx_tokens
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          session_id = excluded.session_id,
          user_id = excluded.user_id,
          generated_at = excluded.generated_at,
          sections_json = excluded.sections_json,
          token_target = excluded.token_target,
          actual_approx_tokens = excluded.actual_approx_tokens
      `).run(briefing.id, briefing.sessionId ?? null, briefing.userId ?? null, briefing.generatedAt, JSON.stringify(briefing.sections), briefing.tokenTarget, briefing.actualApproxTokens);
        }
        catch (error) {
            if (error instanceof StorageError) {
                throw error;
            }
            throw new StorageError('Failed to persist boot briefing.', {
                code: 'STORAGE_BRIEFING_SAVE_FAILED',
                context: {
                    briefingId: briefing.id,
                    sessionId: briefing.sessionId,
                    userId: briefing.userId,
                },
                cause: error,
            });
        }
    }
    getLatestByUser(userId) {
        try {
            const row = this.db.prepare(`
        SELECT * FROM boot_briefings
        WHERE user_id = ?
        ORDER BY generated_at DESC
        LIMIT 1
      `).get(userId);
            return row ? toBootBriefing(row) : null;
        }
        catch (error) {
            if (error instanceof StorageError) {
                throw error;
            }
            throw new StorageError('Failed to load latest user briefing.', {
                code: 'STORAGE_BRIEFING_USER_LOOKUP_FAILED',
                context: { userId },
                cause: error,
            });
        }
    }
    getLatestBySession(sessionId) {
        try {
            const row = this.db.prepare(`
        SELECT * FROM boot_briefings
        WHERE session_id = ?
        ORDER BY generated_at DESC
        LIMIT 1
      `).get(sessionId);
            return row ? toBootBriefing(row) : null;
        }
        catch (error) {
            if (error instanceof StorageError) {
                throw error;
            }
            throw new StorageError('Failed to load latest session briefing.', {
                code: 'STORAGE_BRIEFING_SESSION_LOOKUP_FAILED',
                context: { sessionId },
                cause: error,
            });
        }
    }
}
