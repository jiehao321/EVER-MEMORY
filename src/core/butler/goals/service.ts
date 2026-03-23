import type { OpenClawLogger } from '../../../openclaw/shared.js';
import type { ButlerInsight } from '../types.js';
import { ButlerInsightRepository } from '../../../storage/butlerInsightRepo.js';
import {
  ButlerGoalRepository,
  type ButlerGoal,
  type NewButlerGoal,
} from '../../../storage/butlerGoalRepo.js';

interface ButlerGoalServiceOptions {
  goalRepo: ButlerGoalRepository;
  insightRepo: ButlerInsightRepository;
  logger?: OpenClawLogger;
}

function parseScope(scopeJson: string | undefined): Record<string, unknown> | undefined {
  if (!scopeJson) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(scopeJson) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function matchesScope(scopeJson: string | undefined, scope: Record<string, unknown> | undefined): boolean {
  if (!scope || Object.keys(scope).length === 0) {
    return true;
  }
  const insightScope = parseScope(scopeJson);
  return Object.entries(scope).every(([key, value]) => insightScope?.[key] === value);
}

function priorityFromImportance(importance: number): number {
  if (importance >= 0.8) {
    return 2;
  }
  if (importance >= 0.6) {
    return 4;
  }
  if (importance >= 0.4) {
    return 6;
  }
  return 8;
}

function trimTitle(title: string): string {
  return title.trim();
}

function filterInsights(insights: ButlerInsight[], scope?: Record<string, unknown>): ButlerInsight[] {
  return insights.filter((insight) => matchesScope(insight.scopeJson, scope));
}

export class ButlerGoalService {
  private readonly goalRepo: ButlerGoalRepository;
  private readonly insightRepo: ButlerInsightRepository;
  private readonly logger?: OpenClawLogger;

  constructor(options: ButlerGoalServiceOptions) {
    this.goalRepo = options.goalRepo;
    this.insightRepo = options.insightRepo;
    this.logger = options.logger;
  }

  getActiveGoals(scope?: Record<string, unknown>): ButlerGoal[] {
    return this.goalRepo.findActive(scope);
  }

  createGoal(input: NewButlerGoal): ButlerGoal {
    if (trimTitle(input.title).length === 0) {
      throw new Error('Goal title must be non-empty.');
    }
    return this.goalRepo.insert({ ...input, title: trimTitle(input.title) });
  }

  updateGoal(
    id: string,
    patch: Partial<Pick<ButlerGoal, 'title' | 'description' | 'priority' | 'deadline' | 'progressNotes'>>,
  ): ButlerGoal | null {
    if (patch.title !== undefined && trimTitle(patch.title).length === 0) {
      throw new Error('Goal title must be non-empty.');
    }
    return this.goalRepo.update(id, {
      ...patch,
      title: patch.title === undefined ? undefined : trimTitle(patch.title),
    });
  }

  completeGoal(id: string, finalNote?: string): ButlerGoal | null {
    if (finalNote && this.goalRepo.addProgressNote(id, finalNote) === null) {
      return null;
    }
    return this.goalRepo.setStatus(id, 'completed');
  }

  deriveGoalsFromInsights(scope?: Record<string, unknown>): ButlerGoal[] {
    const activeGoals = this.goalRepo.findActive(scope);
    const seenInsightIds = new Set(activeGoals.flatMap((goal) => goal.sourceInsightIds));
    const candidates = filterInsights([
      ...this.insightRepo.findByKind('commitment', 20),
      ...this.insightRepo.findByKind('recommendation', 20),
    ], scope);
    const created: ButlerGoal[] = [];
    for (const insight of candidates) {
      if (seenInsightIds.has(insight.id)) {
        continue;
      }
      try {
        const goal = this.createGoal({
          title: insight.title,
          description: insight.summary,
          scope: parseScope(insight.scopeJson),
          priority: priorityFromImportance(insight.importance),
          sourceInsightIds: [insight.id],
        });
        created.push(goal);
        seenInsightIds.add(insight.id);
      } catch (error) {
        this.logger?.warn('ButlerGoalService failed to derive goal from insight.', error);
      }
    }
    return created;
  }

  getGoalSummary(scope?: Record<string, unknown>): {
    active: number;
    paused: number;
    completed: number;
    topGoals: ButlerGoal[];
  } {
    const activeGoals = this.goalRepo.findActive(scope);
    return {
      active: activeGoals.length,
      paused: this.goalRepo.findByStatus('paused').filter((goal) => matchesScope(goal.scopeJson, scope)).length,
      completed: this.goalRepo.findByStatus('completed').filter((goal) => matchesScope(goal.scopeJson, scope)).length,
      topGoals: activeGoals.slice(0, 3),
    };
  }
}
