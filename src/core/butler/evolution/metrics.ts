import type { ClockPort } from '../ports/clock.js';
import type { FeedbackStore, InsightStore } from '../ports/storage.js';
import type { ButlerPersistentState } from '../types.js';
import type { EvolutionMetrics } from './types.js';

export class MetricsCollector {
  constructor(
    private readonly feedbackStore: FeedbackStore,
    private readonly insightStore: InsightStore,
    private readonly clock: ClockPort,
  ) {}

  collect(state: ButlerPersistentState): EvolutionMetrics {
    const stats = this.feedbackStore.getAcceptanceStats();
    const total = stats.total || 1;

    // Phase 3 keeps these collaborators wired even before question/action storage joins the port.
    this.insightStore.findFresh(1);
    this.clock.now();

    return {
      overlayAcceptanceRate: state.selfModel.overlayAcceptanceRate,
      insightDismissalRate: stats.rejected / total,
      questionAnswerRate: 0,
      actionSuccessRate: 0,
      actionRollbackRate: 0,
      avgCycleLatencyMs: state.selfModel.avgCycleLatencyMs,
    };
  }
}
