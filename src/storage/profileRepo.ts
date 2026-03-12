import type Database from 'better-sqlite3';
import type { ProjectedProfile } from '../types.js';
import { safeJsonParse } from '../util/json.js';

interface ProjectedProfileRow {
  user_id: string;
  updated_at: string;
  stable_json: string;
  derived_json: string;
  behavior_hints_json: string;
}

function parseObject<T extends Record<string, unknown>>(value: string): T {
  const parsed = safeJsonParse(value, {}) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {} as T;
  }
  return parsed as T;
}

function parseStringArray(value: string): string[] {
  const parsed = safeJsonParse(value, []) as unknown;
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function toProjectedProfile(row: ProjectedProfileRow): ProjectedProfile {
  const stable = parseObject<ProjectedProfile['stable']>(row.stable_json);
  const derived = parseObject<ProjectedProfile['derived']>(row.derived_json);

  return {
    userId: row.user_id,
    updatedAt: row.updated_at,
    stable: {
      ...stable,
      explicitPreferences: stable.explicitPreferences ?? {},
      explicitConstraints: stable.explicitConstraints ?? [],
    },
    derived: {
      ...derived,
      likelyInterests: derived.likelyInterests ?? [],
      workPatterns: derived.workPatterns ?? [],
    },
    behaviorHints: parseStringArray(row.behavior_hints_json),
  };
}

export class ProfileRepository {
  constructor(private readonly db: Database.Database) {}

  upsert(profile: ProjectedProfile): void {
    this.db.prepare(`
      INSERT INTO projected_profiles (
        user_id,
        updated_at,
        stable_json,
        derived_json,
        behavior_hints_json
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        updated_at = excluded.updated_at,
        stable_json = excluded.stable_json,
        derived_json = excluded.derived_json,
        behavior_hints_json = excluded.behavior_hints_json
    `).run(
      profile.userId,
      profile.updatedAt,
      JSON.stringify(profile.stable),
      JSON.stringify(profile.derived),
      JSON.stringify(profile.behaviorHints),
    );
  }

  getByUserId(userId: string): ProjectedProfile | null {
    const row = this.db.prepare(`
      SELECT * FROM projected_profiles
      WHERE user_id = ?
      LIMIT 1
    `).get(userId) as ProjectedProfileRow | undefined;

    return row ? toProjectedProfile(row) : null;
  }

  listRecent(limit = 20): ProjectedProfile[] {
    const rows = this.db.prepare(`
      SELECT * FROM projected_profiles
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(limit) as ProjectedProfileRow[];

    return rows.map(toProjectedProfile);
  }

  count(): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM projected_profiles
    `).get() as { count: number };

    return row.count;
  }
}
