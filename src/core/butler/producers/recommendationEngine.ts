import type { ClockPort } from '../ports/clock.js';
import type { GoalStore, InsightStore } from '../ports/storage.js';
import type { NewButlerInsight } from '../types.js';
import type { InsightProducer } from './registry.js';

export class RecommendationEngine implements InsightProducer {
  readonly kind = 'recommendation';

  constructor(
    private readonly goals: GoalStore | undefined,
    private readonly insights: InsightStore,
    private readonly clock: ClockPort,
  ) {}

  produce(scope?: Record<string, unknown>): NewButlerInsight[] {
    if (!this.goals) {
      return [];
    }
    const activeGoals = this.goals.findActive(scope);
    const results: NewButlerInsight[] = [];
    for (const goal of activeGoals) {
      if (!goal.deadline) {
        continue;
      }
      const deadlineMs = Date.parse(goal.deadline);
      const remainingDays = (deadlineMs - this.clock.now()) / (24 * 60 * 60 * 1000);
      if (remainingDays > 0 && remainingDays < 3) {
        results.push({
          kind: 'recommendation',
          scope,
          title: `Urgent: "${goal.title}" due in ${Math.ceil(remainingDays)} days`,
          summary: 'Goal deadline is approaching. Consider prioritizing or adjusting the deadline.',
          confidence: 0.8,
          importance: 0.9,
          freshUntil: new Date(this.clock.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
      }
    }
    return results.slice(0, 3);
  }
}
