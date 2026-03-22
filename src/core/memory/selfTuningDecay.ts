import type Database from 'better-sqlite3';
import type { DebugRepository } from '../../storage/debugRepo.js';
import type { FeedbackRepository } from '../../storage/feedbackRepo.js';

export interface TuningOverride {
  typeGradeKey: string;
  decayMultiplier: number;
  lastUpdated: string;
  sampleCount: number;
}

export interface SelfTuningResult {
  overrides: TuningOverride[];
  totalSamples: number;
  adjustmentsApplied: number;
}

const MIN_SAMPLES_PER_GROUP = 5;
const MAX_RETENTION_BOOST = 1.5;
const MAX_RETENTION_CUT = 0.7;
const RECOMPUTE_SESSION_INTERVAL = 10;

export class SelfTuningDecayService {
  private readonly overrides = new Map<string, TuningOverride>();
  // Bias toward recomputing on the first session after a restart rather than
  // waiting for a full new interval with an in-memory counter reset.
  private sessionsSinceLastCompute = RECOMPUTE_SESSION_INTERVAL - 1;

  constructor(
    private readonly feedbackRepo: FeedbackRepository,
    private readonly db: Database.Database,
    private readonly debugRepo?: DebugRepository,
  ) {
    for (const override of this.loadPersistedOverrides()) {
      this.overrides.set(override.typeGradeKey, override);
    }
  }

  /**
   * Check if recomputation is needed (every N sessions).
   */
  shouldRecompute(): boolean {
    this.sessionsSinceLastCompute++;
    return this.sessionsSinceLastCompute >= RECOMPUTE_SESSION_INTERVAL;
  }

  /**
   * Recompute decay adjustments based on retrieval feedback.
   * Groups feedback by strategy (as proxy for type+grade usage patterns).
   */
  recompute(): SelfTuningResult {
    this.sessionsSinceLastCompute = 0;
    const now = new Date().toISOString();
    const aggregations = this.feedbackRepo.aggregateByStrategy(30);

    let totalSamples = 0;
    let adjustmentsApplied = 0;

    for (const aggregation of aggregations) {
      const total = aggregation.totalUsed + aggregation.totalIgnored;
      totalSamples += total;

      if (total < MIN_SAMPLES_PER_GROUP) {
        continue;
      }

      const effectiveness = Number.isNaN(aggregation.effectiveness)
        ? 0.5
        : aggregation.effectiveness;

      let multiplier = 1.0;
      if (effectiveness > 0.6) {
        multiplier = Math.min(1 + (effectiveness - 0.6) * 1.25, MAX_RETENTION_BOOST);
      } else if (effectiveness < 0.3) {
        multiplier = Math.max(1 - (0.3 - effectiveness) * 1.0, MAX_RETENTION_CUT);
      }

      if (Math.abs(multiplier - 1.0) <= 0.01) {
        continue;
      }

      const key = aggregation.strategy;
      const override = {
        typeGradeKey: key,
        decayMultiplier: Number(multiplier.toFixed(3)),
        lastUpdated: now,
        sampleCount: total,
      };
      this.overrides.set(key, override);
      this.persistOverride(key, override);
      adjustmentsApplied++;
    }

    this.debugRepo?.log('retrieval_executed', undefined, {
      event: 'self_tuning_decay',
      totalSamples,
      adjustmentsApplied,
      overrides: Array.from(this.overrides.values()),
    });

    return {
      overrides: Array.from(this.overrides.values()),
      totalSamples,
      adjustmentsApplied,
    };
  }

  /**
   * Get the decay multiplier for a given strategy.
   * Returns 1.0 if no override exists.
   */
  getDecayMultiplier(strategy: string): number {
    return this.overrides.get(strategy)?.decayMultiplier ?? 1.0;
  }

  /**
   * Get all current overrides.
   */
  getOverrides(): TuningOverride[] {
    return Array.from(this.overrides.values());
  }

  private loadPersistedOverrides(): TuningOverride[] {
    const rows = this.db.prepare(`
      SELECT type_grade_key, decay_multiplier, sample_count, last_updated
      FROM tuning_overrides
      ORDER BY type_grade_key ASC
    `).all() as Array<{
      type_grade_key: string;
      decay_multiplier: number;
      sample_count: number;
      last_updated: string;
    }>;

    return rows.map((row) => ({
      typeGradeKey: row.type_grade_key,
      decayMultiplier: row.decay_multiplier,
      sampleCount: row.sample_count,
      lastUpdated: row.last_updated,
    }));
  }

  private persistOverride(key: string, override: TuningOverride): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO tuning_overrides (
        type_grade_key, decay_multiplier, sample_count, last_updated
      ) VALUES (?, ?, ?, ?)
    `).run(
      key,
      override.decayMultiplier,
      override.sampleCount,
      override.lastUpdated,
    );
  }
}
