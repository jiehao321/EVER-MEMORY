import type { AttentionService } from '../core/butler/attention/service.js';
import type { CognitiveEngine } from '../core/butler/cognition.js';
import type { ButlerGoalService } from '../core/butler/goals/service.js';
import type { NarrativeThreadService } from '../core/butler/narrative/service.js';
import type { TaskQueueService } from '../core/butler/taskQueue.js';
import type { ButlerAgent } from '../core/butler/agent.js';
import type { ButlerMode, SelfModelMetrics } from '../core/butler/types.js';

export interface ButlerStatusResult {
  mode: ButlerMode;
  llmAvailable: boolean;
  modeReason?: string;
  cycleVersion: number;
  lastCycleAt: string;
  selfModel: SelfModelMetrics;
  activeThreads: Array<{
    id: string;
    theme: string;
    phase: string;
    momentum: string;
    importance: number;
  }>;
  pendingTasks: number;
  llmUsage: {
    dailyTokens: number;
    sessionTokens: number;
    dailyBudget: number;
    sessionBudget: number;
  };
  topInsights: Array<{
    id: string;
    kind: string;
    title: string;
    confidence: number;
    importance: number;
  }>;
  goals: {
    active: number;
    paused: number;
    completed: number;
    topGoals: Array<{
      id: string;
      title: string;
      priority: number;
      deadline?: string;
    }>;
  };
}

function toScopedRecord(scope?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!scope) {
    return undefined;
  }
  const scoped = Object.fromEntries(
    ['userId', 'chatId', 'project']
      .map((key) => [key, scope[key]])
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0),
  );
  return Object.keys(scoped).length > 0 ? scoped : undefined;
}

function createDefaultSelfModel(): SelfModelMetrics {
  return {
    overlayAcceptanceRate: 0,
    insightPrecision: 0,
    avgCycleLatencyMs: 0,
    totalCycles: 0,
    lastEvaluatedAt: '',
  };
}

export function butlerStatus(input: {
  agent: ButlerAgent;
  narrativeService: NarrativeThreadService;
  taskQueue: TaskQueueService;
  cognitiveEngine: CognitiveEngine;
  attentionService: AttentionService;
  goalService: ButlerGoalService;
  scope?: Record<string, unknown>;
}): ButlerStatusResult {
  const scope = toScopedRecord(input.scope);
  const state = input.agent.getState();
  const mode = state?.mode ?? (input.agent.isReduced() ? 'reduced' : 'steward');
  const goals = input.goalService.getGoalSummary(scope);
  return {
    mode,
    llmAvailable: mode !== 'reduced',
    modeReason: mode === 'reduced' ? 'SDK host does not expose LLM gateway' : undefined,
    cycleVersion: state?.lastCycleVersion ?? 0,
    lastCycleAt: state?.lastCycleAt ?? '',
    selfModel: state?.selfModel ?? createDefaultSelfModel(),
    activeThreads: input.narrativeService.getActiveThreads(scope).map((thread) => ({
      id: thread.id,
      theme: thread.theme,
      phase: thread.currentPhase,
      momentum: thread.momentum,
      importance: thread.strategicImportance,
    })),
    pendingTasks: input.taskQueue.getPendingCount(),
    llmUsage: input.cognitiveEngine.getUsage(),
    topInsights: input.attentionService.getTopInsights().map((insight) => ({
      id: insight.id,
      kind: insight.kind,
      title: insight.title,
      confidence: insight.confidence,
      importance: insight.importance,
    })),
    goals: {
      active: goals.active,
      paused: goals.paused,
      completed: goals.completed,
      topGoals: goals.topGoals.map((goal) => ({
        id: goal.id,
        title: goal.title,
        priority: goal.priority,
        deadline: goal.deadline,
      })),
    },
  };
}
