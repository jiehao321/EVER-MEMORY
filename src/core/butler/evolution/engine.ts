import { randomUUID } from 'node:crypto';
import type { ClockPort } from '../ports/clock.js';
import type { ButlerLogger, ButlerPersistentState } from '../types.js';
import { FeedbackLoop } from './feedbackLoop.js';
import { MetricsCollector } from './metrics.js';
import { ParameterTuner } from './parameterTuner.js';
import type { EvolutionLogEntry, EvolutionResult } from './types.js';

export interface EvolutionLogStore {
  insertLog(entry: EvolutionLogEntry): void;
  findRecent(limit: number): EvolutionLogEntry[];
  revertEntry(id: string): void;
}

export class EvolutionEngine {
  private lastEvolvedAt = 0;
  private readonly minIntervalMs = 24 * 60 * 60 * 1000;

  constructor(
    private readonly metricsCollector: MetricsCollector,
    private readonly parameterTuner: ParameterTuner,
    private readonly feedbackLoop: FeedbackLoop,
    private readonly clock: ClockPort,
    private readonly logger?: ButlerLogger,
    private readonly evolutionLog?: EvolutionLogStore,
  ) {}

  restoreFromLog(): void {
    if (!this.evolutionLog) {
      return;
    }

    const entries = this.evolutionLog.findRecent(100);
    this.parameterTuner.restoreFromEntries(entries);
    this.logger?.info('EvolutionEngine restored parameters from log', { entriesLoaded: entries.length });
  }

  canEvolve(): boolean {
    return this.clock.now() - this.lastEvolvedAt >= this.minIntervalMs;
  }

  evolve(state: ButlerPersistentState): EvolutionResult | null {
    if (!this.canEvolve()) {
      return null;
    }

    this.lastEvolvedAt = this.clock.now();
    const metrics = this.metricsCollector.collect(state);
    const adjustments = this.feedbackLoop.evaluate(metrics);
    const changes = this.parameterTuner.tune(metrics);

    if (changes.length === 0 && adjustments.length === 0) {
      this.logger?.info('EvolutionEngine: no changes needed');
      return null;
    }

    const evidence = JSON.stringify({ metrics, adjustments });
    const confidence = Math.min(0.9, 0.5 + (state.selfModel.totalCycles * 0.01));

    if (this.evolutionLog) {
      for (const change of changes) {
        this.evolutionLog.insertLog({
          id: randomUUID(),
          cycleType: 'parameter_tune',
          parameterKey: change.key,
          oldValueJson: JSON.stringify(change.oldValue),
          newValueJson: JSON.stringify(change.newValue),
          evidenceJson: evidence,
          confidence,
          status: 'active',
          createdAt: this.clock.isoNow(),
        });
      }
    }

    this.logger?.info('EvolutionEngine evolved', {
      parameterChanges: changes.length,
      feedbackAdjustments: adjustments.length,
    });
    return {
      cycleType: 'parameter_tune',
      changes,
      evidence,
      confidence,
    };
  }

  revert(entryId: string): boolean {
    if (!this.evolutionLog) {
      return false;
    }

    this.evolutionLog.revertEntry(entryId);
    this.restoreFromLog();
    return true;
  }

  getLastEvolvedAt(): number {
    return this.lastEvolvedAt;
  }

  getParameters(): ReturnType<ParameterTuner['getAllParameters']> {
    return this.parameterTuner.getAllParameters();
  }
}
