import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { DebugRepository } from '../../storage/debugRepo.js';
import type { ProjectedProfile } from '../../types/profile.js';

export interface PreferenceDrift {
  key: string;
  oldValue: string;
  newValue: string;
  driftType: 'changed' | 'added' | 'removed' | 'reversed';
  detectedAt: string;
}

export interface DriftDetectionResult {
  drifts: PreferenceDrift[];
  totalChanges: number;
  reversals: number;
}

const REVERSAL_PAIRS: readonly [string, string][] = [
  ['dark', 'light'],
  ['concise', 'verbose'],
  ['simple', 'detailed'],
  ['minimal', 'comprehensive'],
  ['formal', 'casual'],
  ['strict', 'relaxed'],
  ['enabled', 'disabled'],
  ['on', 'off'],
  ['yes', 'no'],
  ['true', 'false'],
];

export class DriftDetectionService {
  private readonly driftLog: PreferenceDrift[] = [];

  constructor(
    private readonly db: Database.Database,
    private readonly debugRepo?: DebugRepository,
  ) {
    this.driftLog.push(...this.loadPersistedDrifts());
  }

  detectDrift(
    oldProfile: ProjectedProfile | null,
    newProfile: ProjectedProfile,
    userId: string,
  ): DriftDetectionResult {
    const now = new Date().toISOString();
    const drifts: PreferenceDrift[] = [];

    const oldPrefs = oldProfile?.stable.explicitPreferences ?? {};
    const newPrefs = newProfile.stable.explicitPreferences ?? {};

    for (const [key, newField] of Object.entries(newPrefs)) {
      const newValue = newField.value;
      const oldField = oldPrefs[key];

      if (oldField === undefined) {
        drifts.push({
          key,
          oldValue: '',
          newValue,
          driftType: 'added',
          detectedAt: now,
        });
        continue;
      }

      const oldValue = oldField.value;
      if (oldValue !== newValue) {
        drifts.push({
          key,
          oldValue,
          newValue,
          driftType: this.isReversal(oldValue, newValue) ? 'reversed' : 'changed',
          detectedAt: now,
        });
      }
    }

    for (const [key, oldField] of Object.entries(oldPrefs)) {
      if (!(key in newPrefs)) {
        drifts.push({
          key,
          oldValue: oldField.value,
          newValue: '',
          driftType: 'removed',
          detectedAt: now,
        });
      }
    }

    const reversals = drifts.filter((drift) => drift.driftType === 'reversed').length;

    if (drifts.length > 0) {
      this.driftLog.push(...drifts);
      for (const drift of drifts) {
        this.persistDrift(userId, drift);
      }
      this.debugRepo?.log('profile_recomputed', userId, {
        event: 'preference_drift',
        drifts: drifts.length,
        reversals,
        changes: drifts.map((drift) => ({ key: drift.key, type: drift.driftType })),
      });
    }

    return {
      drifts,
      totalChanges: drifts.length,
      reversals,
    };
  }

  getDriftLog(): PreferenceDrift[] {
    return [...this.driftLog];
  }

  getRecentDrifts(limit = 10): PreferenceDrift[] {
    return this.driftLog.slice(-limit);
  }

  private loadPersistedDrifts(): PreferenceDrift[] {
    const rows = this.db.prepare(`
      SELECT preference_key, old_value, new_value, drift_type, detected_at
      FROM preference_drift_log
      ORDER BY detected_at ASC
    `).all() as Array<{
      preference_key: string;
      old_value: string;
      new_value: string;
      drift_type: PreferenceDrift['driftType'];
      detected_at: string;
    }>;

    return rows.map((row) => ({
      key: row.preference_key,
      oldValue: row.old_value,
      newValue: row.new_value,
      driftType: row.drift_type,
      detectedAt: row.detected_at,
    }));
  }

  private persistDrift(userId: string, entry: PreferenceDrift): void {
    this.db.prepare(`
      INSERT INTO preference_drift_log (
        id, user_id, preference_key, old_value, new_value, drift_type, detected_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      userId,
      entry.key,
      entry.oldValue,
      entry.newValue,
      entry.driftType,
      entry.detectedAt,
    );
  }

  private isReversal(oldValue: string, newValue: string): boolean {
    const oldNormalized = oldValue.toLowerCase().trim();
    const newNormalized = newValue.toLowerCase().trim();

    for (const [a, b] of REVERSAL_PAIRS) {
      if (
        (oldNormalized.includes(a) && newNormalized.includes(b))
        || (oldNormalized.includes(b) && newNormalized.includes(a))
      ) {
        return true;
      }
    }

    return false;
  }
}
