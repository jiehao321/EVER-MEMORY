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
    private readonly debugRepo?: DebugRepository,
  ) {}

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
