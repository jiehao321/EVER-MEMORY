import type { ClockPort } from '../ports/clock.js';
import type {
  GoalStore,
  InsightStore,
  NarrativeStore,
  TaskStore,
} from '../ports/storage.js';

export type WakeUpTriggerKind =
  | 'task_due'
  | 'goal_deadline'
  | 'commitment_check'
  | 'narrative_stalling'
  | 'periodic_housekeeping'
  | 'insight_expired';

export interface WakeUpTrigger {
  kind: WakeUpTriggerKind;
  priority: 'high' | 'medium' | 'low';
  reason: string;
}

export interface TriggerEvaluatorDeps {
  tasks: TaskStore;
  goals?: GoalStore;
  insights?: InsightStore;
  narratives?: NarrativeStore;
  clock: ClockPort;
}

function evaluateGoalDeadlineTriggers(
  goals: GoalStore | undefined,
  now: number,
): WakeUpTrigger[] {
  if (!goals) {
    return [];
  }
  const within24h = 24 * 60 * 60 * 1000;
  for (const goal of goals.findActive()) {
    if (!goal.deadline) {
      continue;
    }
    const deadlineMs = Date.parse(goal.deadline);
    if (Number.isNaN(deadlineMs)) {
      continue;
    }
    if (deadlineMs > now && deadlineMs - now < within24h) {
      return [{
        kind: 'goal_deadline',
        priority: 'high',
        reason: `Goal "${goal.title}" deadline approaching`,
      }];
    }
  }
  return [];
}

function evaluateInsightTriggers(insights: InsightStore | undefined): WakeUpTrigger[] {
  if (!insights) {
    return [];
  }
  return insights.findFresh(1).length === 0
    ? [{ kind: 'insight_expired', priority: 'medium', reason: 'No fresh insights remaining' }]
    : [];
}

export function evaluateTriggers(deps: TriggerEvaluatorDeps): WakeUpTrigger[] {
  const pendingCount = deps.tasks.getPendingCount();
  const taskTriggers = pendingCount > 0
    ? [{ kind: 'task_due', priority: 'high', reason: `${pendingCount} pending tasks` } satisfies WakeUpTrigger]
    : [];
  const goalTriggers = evaluateGoalDeadlineTriggers(deps.goals, deps.clock.now());
  const insightTriggers = evaluateInsightTriggers(deps.insights);

  return [
    ...taskTriggers,
    ...goalTriggers,
    ...insightTriggers,
    { kind: 'periodic_housekeeping', priority: 'low', reason: 'Periodic maintenance' },
  ];
}
