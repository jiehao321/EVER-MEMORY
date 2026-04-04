import type { ClockPort } from '../ports/clock.js';
import type { GoalStore } from '../ports/storage.js';
import type { NewButlerInsight } from '../types.js';
import type { InsightProducer } from './registry.js';

export class OpenLoopTracker implements InsightProducer {
  readonly kind = 'open_loop';

  constructor(
    private readonly goals: GoalStore | undefined,
    private readonly clock: ClockPort,
  ) {}

  produce(scope?: Record<string, unknown>): NewButlerInsight[] {
    if (!this.goals) {
      return [];
    }
    const activeGoals = this.goals.findActive(scope);
    const insights: NewButlerInsight[] = [];
    const now = this.clock.now();
    for (const goal of activeGoals) {
      const ageMs = now - Date.parse(goal.createdAt);
      const ageDays = ageMs / (24 * 60 * 60 * 1000);
      if (ageDays > 14 && !goal.progressNotes) {
        insights.push({
          kind: 'open_loop',
          scope,
          title: `Stalled goal: "${goal.title}"`,
          summary: `Goal has been active for ${Math.floor(ageDays)} days with no progress notes. Consider updating or closing.`,
          confidence: 0.7,
          importance: goal.priority <= 3 ? 0.8 : 0.5,
          freshUntil: new Date(now + 72 * 60 * 60 * 1000).toISOString(),
        });
      }
    }
    return insights.slice(0, 3);
  }
}
