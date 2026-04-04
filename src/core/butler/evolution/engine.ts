import type { ClockPort } from '../ports/clock.js';
import type { ButlerLogger, ButlerPersistentState } from '../types.js';
import { FeedbackLoop } from './feedbackLoop.js';
import { MetricsCollector } from './metrics.js';
import { ParameterTuner } from './parameterTuner.js';
import type { EvolutionResult } from './types.js';

export class EvolutionEngine {
  private lastEvolvedAt = 0;
  private readonly minIntervalMs = 24 * 60 * 60 * 1000;

  constructor(
    private readonly metricsCollector: MetricsCollector,
    private readonly parameterTuner: ParameterTuner,
    private readonly feedbackLoop: FeedbackLoop,
    private readonly clock: ClockPort,
    private readonly logger?: ButlerLogger,
  ) {}

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
    this.logger?.info('EvolutionEngine evolved', {
      parameterChanges: changes.length,
      feedbackAdjustments: adjustments.length,
    });
    return {
      cycleType: 'parameter_tune',
      changes,
      evidence,
      confidence: Math.min(0.9, 0.5 + (state.selfModel.totalCycles * 0.01)),
    };
  }

  getLastEvolvedAt(): number {
    return this.lastEvolvedAt;
  }

  getParameters(): ReturnType<ParameterTuner['getAllParameters']> {
    return this.parameterTuner.getAllParameters();
  }
}
