import { randomUUID } from 'node:crypto';
import type { OpenClawLogger } from '../../openclaw/shared.js';
import type { ButlerGoalService } from './goals/service.js';
import { ButlerInsightRepository } from '../../storage/butlerInsightRepo.js';
import type { CognitiveEngine } from './cognition.js';
import { ButlerStateManager } from './state.js';
import { TaskQueueService } from './taskQueue.js';
import type {
  ButlerCycleTrace,
  ButlerPersistentState,
  ButlerTask,
  ButlerTrigger,
  DrainBudget,
} from './types.js';

interface ButlerAgentOptions {
  stateManager: ButlerStateManager;
  taskQueue: TaskQueueService;
  cognitiveEngine: CognitiveEngine;
  insightRepo: ButlerInsightRepository;
  goalService?: ButlerGoalService;
  logger?: OpenClawLogger;
}

interface CyclePhaseResult {
  state: ButlerPersistentState;
  observationSummary: string;
  decisions: Record<string, unknown>;
  actions: Record<string, unknown>;
  llmInvoked: boolean;
}

const MESSAGE_TTL_MS = 15 * 60 * 1000;
const AGENT_NOTE_TTL_MS = 10 * 60 * 1000;

function nowIso(): string {
  return new Date().toISOString();
}

function getCycleBudgetMs(trigger: ButlerTrigger['type']): number {
  switch (trigger) {
    case 'session_started':
      return 1500;
    case 'message_received':
      return 800;
    case 'session_ended':
      return 600;
    case 'agent_ended':
      return 600;
    case 'service_started':
      return 500;
  }
}

function hasTimeRemaining(startedAt: number, maxTimeMs: number): boolean {
  return Date.now() - startedAt < maxTimeMs;
}

function remainingTimeMs(startedAt: number, maxTimeMs: number): number {
  return Math.max(0, maxTimeMs - (Date.now() - startedAt));
}

function buildDrainBudget(startedAt: number, maxTimeMs: number): DrainBudget {
  return {
    maxTasks: 3,
    maxTimeMs: Math.min(1000, remainingTimeMs(startedAt, maxTimeMs)),
    priorityFilter: 'all',
  };
}

function toJson(value: unknown): string {
  return JSON.stringify(value);
}

function parseTaskPayload(task: ButlerTask): Record<string, unknown> | undefined {
  if (!task.payloadJson) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(task.payloadJson) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function updateMetrics(
  state: ButlerPersistentState,
  durationMs: number,
): ButlerPersistentState['selfModel'] {
  const totalCycles = state.selfModel.totalCycles + 1;
  const previousTotal = state.selfModel.avgCycleLatencyMs * state.selfModel.totalCycles;
  return {
    ...state.selfModel,
    totalCycles,
    avgCycleLatencyMs: totalCycles === 0 ? durationMs : (previousTotal + durationMs) / totalCycles,
    lastEvaluatedAt: nowIso(),
  };
}

export class ButlerAgent {
  private readonly stateManager: ButlerStateManager;
  private readonly taskQueue: TaskQueueService;
  private readonly cognitiveEngine: CognitiveEngine;
  private readonly insightRepo: ButlerInsightRepository;
  private readonly goalService?: ButlerGoalService;
  private readonly logger?: OpenClawLogger;
  private currentState: ButlerPersistentState | null = null;

  constructor(options: ButlerAgentOptions) {
    this.stateManager = options.stateManager;
    this.taskQueue = options.taskQueue;
    this.cognitiveEngine = options.cognitiveEngine;
    this.insightRepo = options.insightRepo;
    this.goalService = options.goalService;
    this.logger = options.logger;
  }

  async runCycle(trigger: ButlerTrigger): Promise<ButlerCycleTrace> {
    const startedAt = Date.now();
    const maxTimeMs = getCycleBudgetMs(trigger.type);
    let state = this.prepareState();
    const cycleId = randomUUID();

    const observed = this.observe(trigger, state);
    state = observed.state;

    const oriented = this.orient(trigger, observed, state, startedAt, maxTimeMs);
    const executed = this.act(trigger, oriented, startedAt, maxTimeMs, cycleId);
    state = this.finishState(executed.state, startedAt);
    this.stateManager.save(state);
    this.currentState = state;

    return {
      cycleId,
      hook: trigger.type,
      observedAt: nowIso(),
      observationSummary: executed.observationSummary,
      decisionsJson: toJson(executed.decisions),
      actionsJson: toJson(executed.actions),
      llmInvoked: executed.llmInvoked,
      durationMs: Date.now() - startedAt,
    };
  }

  getState(): ButlerPersistentState | null {
    return this.currentState;
  }

  isReduced(): boolean {
    return (this.currentState ?? this.stateManager.load()).mode === 'reduced';
  }

  private prepareState(): ButlerPersistentState {
    const loaded = this.stateManager.load();
    const pruned = this.stateManager.pruneExpiredWorkingMemory(loaded);
    this.currentState = pruned;
    return pruned;
  }

  private observe(
    trigger: ButlerTrigger,
    state: ButlerPersistentState,
  ): CyclePhaseResult {
    switch (trigger.type) {
      case 'session_started':
        return this.observeSessionStarted(state);
      case 'message_received':
        return this.observeMessageReceived(trigger, state);
      case 'session_ended':
        return this.observeSessionEnded(trigger, state);
      case 'agent_ended':
        return this.observeAgentEnded(trigger, state);
      case 'service_started':
        return this.observeServiceStarted(state);
    }
  }

  private observeSessionStarted(state: ButlerPersistentState): CyclePhaseResult {
    this.insightRepo.deleteExpired();
    const pendingCount = this.taskQueue.getPendingCount();
    const freshInsights = this.insightRepo.findFresh(5);
    const nextState = this.stateManager.addWorkingMemoryEntry(
      state,
      'session_started',
      { pendingCount, freshInsightIds: freshInsights.map((item) => item.id) },
      MESSAGE_TTL_MS,
    );

    return {
      state: nextState,
      observationSummary: `Session started with ${pendingCount} pending tasks and ${freshInsights.length} fresh insights.`,
      decisions: { trigger: 'session_started' },
      actions: { surfacedInsightIds: [] as string[] },
      llmInvoked: false,
    };
  }

  private observeMessageReceived(
    trigger: ButlerTrigger,
    state: ButlerPersistentState,
  ): CyclePhaseResult {
    return {
      state: this.stateManager.addWorkingMemoryEntry(
        state,
        'message_received',
        trigger.payload ?? {},
        MESSAGE_TTL_MS,
      ),
      observationSummary: 'Message received and captured in working memory.',
      decisions: { trigger: 'message_received' },
      actions: {},
      llmInvoked: false,
    };
  }

  private observeSessionEnded(
    trigger: ButlerTrigger,
    state: ButlerPersistentState,
  ): CyclePhaseResult {
    return {
      state: this.stateManager.addWorkingMemoryEntry(
        state,
        'session_ended',
        trigger.scope ?? {},
        MESSAGE_TTL_MS,
      ),
      observationSummary: 'Session ended; deferred maintenance tasks will be queued.',
      decisions: { trigger: 'session_ended' },
      actions: {},
      llmInvoked: false,
    };
  }

  private observeAgentEnded(
    trigger: ButlerTrigger,
    state: ButlerPersistentState,
  ): CyclePhaseResult {
    return {
      state: this.stateManager.addWorkingMemoryEntry(
        state,
        'agent_ended',
        trigger.payload ?? {},
        AGENT_NOTE_TTL_MS,
      ),
      observationSummary: 'Nested agent completion recorded in working memory.',
      decisions: { trigger: 'agent_ended' },
      actions: {},
      llmInvoked: false,
    };
  }

  private observeServiceStarted(state: ButlerPersistentState): CyclePhaseResult {
    return {
      state: this.stateManager.addWorkingMemoryEntry(
        state,
        'service_started',
        { initialized: true },
        AGENT_NOTE_TTL_MS,
      ),
      observationSummary: 'Butler service startup recorded.',
      decisions: { trigger: 'service_started' },
      actions: {},
      llmInvoked: false,
    };
  }

  private orient(
    trigger: ButlerTrigger,
    result: CyclePhaseResult,
    state: ButlerPersistentState,
    startedAt: number,
    maxTimeMs: number,
  ): CyclePhaseResult {
    const reason = this.getOrientationReason(trigger, state, startedAt, maxTimeMs);
    return {
      ...result,
      decisions: {
        ...result.decisions,
        orientation: reason,
      },
      llmInvoked: false,
    };
  }

  private getOrientationReason(
    trigger: ButlerTrigger,
    state: ButlerPersistentState,
    startedAt: number,
    maxTimeMs: number,
  ): string {
    if (state.mode === 'reduced') {
      return 'reduced mode skips orientation';
    }
    if (!hasTimeRemaining(startedAt, maxTimeMs)) {
      return 'budget exhausted before orientation';
    }
    if (trigger.type !== 'session_started' && trigger.type !== 'message_received') {
      return 'orientation not needed for this trigger';
    }
    return this.cognitiveEngine.canAfford({
      taskType: 'butler-orientation',
      evidence: { trigger: trigger.type },
      latencyClass: 'background',
      privacyClass: 'local_only',
      budgetClass: 'cheap',
    })
      ? 'phase 1 orientation intentionally deferred'
      : 'orientation skipped because budget or llm availability is insufficient';
  }

  private act(
    trigger: ButlerTrigger,
    result: CyclePhaseResult,
    startedAt: number,
    maxTimeMs: number,
    cycleId: string,
  ): CyclePhaseResult {
    switch (trigger.type) {
      case 'session_started':
        return this.executeSessionStart(result, startedAt, maxTimeMs, cycleId);
      case 'session_ended':
        return this.executeSessionEnded(trigger, result);
      default:
        return result;
    }
  }

  private executeSessionStart(
    result: CyclePhaseResult,
    startedAt: number,
    maxTimeMs: number,
    cycleId: string,
  ): CyclePhaseResult {
    if (!hasTimeRemaining(startedAt, maxTimeMs)) {
      return result;
    }

    const drained = this.taskQueue.drain(buildDrainBudget(startedAt, maxTimeMs));
    const completedTaskTypes = this.completeTasks(drained, cycleId);
    const surfacedInsights = this.surfaceFreshInsights();

    return {
      ...result,
      actions: {
        drainedTaskTypes: completedTaskTypes,
        surfacedInsightIds: surfacedInsights,
      },
    };
  }

  private completeTasks(tasks: ButlerTask[], cycleId: string): string[] {
    const completedTaskTypes: string[] = [];
    for (const task of tasks) {
      try {
        this.runDeferredTask(task);
        this.taskQueue.complete(task.id, { completedBy: 'butler-agent', cycleId });
        completedTaskTypes.push(task.type);
      } catch (error) {
        this.logger?.error('ButlerAgent failed to complete task.', error);
        this.taskQueue.fail(task.id, error instanceof Error ? error.message : String(error));
      }
    }
    return completedTaskTypes;
  }

  private runDeferredTask(task: ButlerTask): void {
    if (task.type !== 'goal_derivation' || !this.goalService) {
      return;
    }
    this.goalService.deriveGoalsFromInsights(parseTaskPayload(task));
  }

  private surfaceFreshInsights(): string[] {
    const surfacedInsightIds: string[] = [];
    for (const insight of this.insightRepo.findFresh(3)) {
      this.insightRepo.markSurfaced(insight.id);
      surfacedInsightIds.push(insight.id);
    }
    return surfacedInsightIds;
  }

  private executeSessionEnded(
    trigger: ButlerTrigger,
    result: CyclePhaseResult,
  ): CyclePhaseResult {
    const sessionId = trigger.sessionId ?? 'unknown-session';
    const queuedTaskIds = [
      this.taskQueue.enqueue({
        type: 'narrative_update',
        priority: 4,
        trigger: trigger.type,
        payload: trigger.scope ?? {},
        budgetClass: 'medium',
        idempotencyKey: `session-ended:narrative:${sessionId}`,
      }),
      this.taskQueue.enqueue({
        type: 'insight_refresh',
        priority: 5,
        trigger: trigger.type,
        payload: trigger.scope ?? {},
        budgetClass: 'medium',
        idempotencyKey: `session-ended:insight:${sessionId}`,
      }),
      this.taskQueue.enqueue({
        type: 'goal_derivation',
        priority: 5,
        trigger: trigger.type,
        payload: trigger.scope ?? {},
        budgetClass: 'medium',
        idempotencyKey: `session-ended:goals:${sessionId}`,
      }),
    ];

    return {
      ...result,
      actions: {
        queuedTaskIds,
        queuedTaskTypes: ['narrative_update', 'insight_refresh', 'goal_derivation'],
      },
    };
  }

  private finishState(state: ButlerPersistentState, startedAt: number): ButlerPersistentState {
    const durationMs = Date.now() - startedAt;
    return {
      ...state,
      selfModel: updateMetrics(state, durationMs),
      lastCycleAt: nowIso(),
      lastCycleVersion: state.lastCycleVersion + 1,
    };
  }
}
