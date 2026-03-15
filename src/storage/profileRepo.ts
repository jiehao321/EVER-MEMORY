import type Database from 'better-sqlite3';
import type { ProjectedProfile } from '../types.js';
import { safeJsonParse } from '../util/json.js';
import { StorageError } from '../errors.js';

interface ProjectedProfileRow {
  user_id: string;
  updated_at: string;
  stable_json: string;
  derived_json: string;
  behavior_hints_json: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim().length > 0);
}

function parseObject<T extends Record<string, unknown>>(value: string, fallback: T): T {
  const parsed = safeJsonParse<unknown>(value, fallback);
  if (!isRecord(parsed)) {
    return fallback;
  }
  return parsed as T;
}

function parseStringArray(value: string): string[] {
  const parsed = safeJsonParse<unknown>(value, []);
  return isStringArray(parsed) ? parsed : [];
}

function toProjectedProfile(row: ProjectedProfileRow): ProjectedProfile {
  const stable = parseObject<ProjectedProfile['stable']>(row.stable_json, {
    explicitPreferences: {},
    explicitConstraints: [],
  });
  const derived = parseObject<ProjectedProfile['derived']>(row.derived_json, {
    likelyInterests: [],
    workPatterns: [],
  });

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
    try {
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
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError('Failed to persist projected profile.', {
        code: 'STORAGE_PROFILE_UPSERT_FAILED',
        context: {
          userId: profile.userId,
          updatedAt: profile.updatedAt,
        },
        cause: error,
      });
    }
  }

  getByUserId(userId: string): ProjectedProfile | null {
    try {
      const row = this.db.prepare(`
        SELECT * FROM projected_profiles
        WHERE user_id = ?
        LIMIT 1
      `).get(userId) as ProjectedProfileRow | undefined;

      return row ? toProjectedProfile(row) : null;
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError('Failed to load projected profile.', {
        code: 'STORAGE_PROFILE_LOOKUP_FAILED',
        context: { userId },
        cause: error,
      });
    }
  }

  listRecent(limit = 20): ProjectedProfile[] {
    try {
      const rows = this.db.prepare(`
        SELECT * FROM projected_profiles
        ORDER BY updated_at DESC
        LIMIT ?
      `).all(limit) as ProjectedProfileRow[];

      return rows.map(toProjectedProfile);
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError('Failed to list projected profiles.', {
        code: 'STORAGE_PROFILE_LIST_FAILED',
        context: { limit },
        cause: error,
      });
    }
  }

  count(): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM projected_profiles
    `).get() as { count: number };

    return row.count;
  }
}
