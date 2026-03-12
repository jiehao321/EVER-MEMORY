import type Database from 'better-sqlite3';
import type { BootBriefing } from '../types.js';
import { safeJsonParse } from '../util/json.js';

interface BootBriefingRow {
  id: string;
  session_id: string | null;
  user_id: string | null;
  generated_at: string;
  sections_json: string;
  token_target: number;
  actual_approx_tokens: number;
}

function toBootBriefing(row: BootBriefingRow): BootBriefing {
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
  constructor(private readonly db: Database.Database) {}

  save(briefing: BootBriefing): void {
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
    `).run(
      briefing.id,
      briefing.sessionId ?? null,
      briefing.userId ?? null,
      briefing.generatedAt,
      JSON.stringify(briefing.sections),
      briefing.tokenTarget,
      briefing.actualApproxTokens,
    );
  }

  getLatestByUser(userId: string): BootBriefing | null {
    const row = this.db.prepare(`
      SELECT * FROM boot_briefings
      WHERE user_id = ?
      ORDER BY generated_at DESC
      LIMIT 1
    `).get(userId) as BootBriefingRow | undefined;

    return row ? toBootBriefing(row) : null;
  }

  getLatestBySession(sessionId: string): BootBriefing | null {
    const row = this.db.prepare(`
      SELECT * FROM boot_briefings
      WHERE session_id = ?
      ORDER BY generated_at DESC
      LIMIT 1
    `).get(sessionId) as BootBriefingRow | undefined;

    return row ? toBootBriefing(row) : null;
  }
}
