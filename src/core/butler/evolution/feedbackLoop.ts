import type { ButlerLogger } from '../types.js';
import type { EvolutionMetrics } from './types.js';

export interface FeedbackAdjustment {
  dimension: string;
  direction: 'increase' | 'decrease' | 'maintain';
  magnitude: number;
  reason: string;
}

export class FeedbackLoop {
  constructor(private readonly logger?: ButlerLogger) {}

  evaluate(metrics: EvolutionMetrics): FeedbackAdjustment[] {
    const adjustments: FeedbackAdjustment[] = [];

    if (metrics.overlayAcceptanceRate < 0.3 && metrics.overlayAcceptanceRate > 0) {
      adjustments.push({
        dimension: 'overlay_frequency',
        direction: 'decrease',
        magnitude: 0.2,
        reason: `Overlay acceptance rate ${(metrics.overlayAcceptanceRate * 100).toFixed(0)}% is below threshold`,
      });
    }
    if (metrics.insightDismissalRate > 0.6) {
      adjustments.push({
        dimension: 'insight_confidence_threshold',
        direction: 'increase',
        magnitude: 0.15,
        reason: `Insight dismissal rate ${(metrics.insightDismissalRate * 100).toFixed(0)}% is high`,
      });
    }
    if (metrics.questionAnswerRate < 0.2 && metrics.questionAnswerRate > 0) {
      adjustments.push({
        dimension: 'question_frequency',
        direction: 'decrease',
        magnitude: 0.3,
        reason: `Question answer rate ${(metrics.questionAnswerRate * 100).toFixed(0)}% is low`,
      });
    }
    if (metrics.actionRollbackRate > 0.2) {
      adjustments.push({
        dimension: 'action_autonomy',
        direction: 'decrease',
        magnitude: 0.25,
        reason: `Action rollback rate ${(metrics.actionRollbackRate * 100).toFixed(0)}% suggests over-confidence`,
      });
    }

    this.logger?.debug?.('FeedbackLoop evaluated', { adjustments: adjustments.length });
    return adjustments;
  }
}
