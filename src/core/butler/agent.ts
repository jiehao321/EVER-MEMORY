import { randomUUID } from 'node:crypto';
import type { ButlerGoalService } from './goals/service.js';
import type { CognitiveEngine } from './cognition.js';
import type { ButlerStateManager } from './state.js';
import type { TaskQueueService } from './taskQueue.js';
import type { WorkerThreadPool } from './worker/pool.js';
import type { NarrativeThreadService } from './narrative/service.js';
import type { CommitmentWatcher } from './commitments/watcher.js';
import type { ClockPort } from './ports/clock.js';
import type { InsightStore } from './ports/storage.js';
import type { InsightProducerRegistry } from './producers/registry.js';
import type {
  ButlerCycleTrace,
  ButlerLogger,
  ButlerPersistentState,
  ButlerTask,
  ButlerTrigger,
  DrainBudget,
} from './types.js';

interface ButlerAgentOptions {
  stateManager: ButlerStateManager;
  taskQueue: TaskQueueService;
  cognitiveEngine: CognitiveEngine;
  insightRepo: InsightStore;
  clock?: ClockPort;
  goalService?: ButlerGoalService;
  workerPool?: WorkerThreadPool;
  narrativeService?: NarrativeThreadService;
  commitmentWatcher?: CommitmentWatcher;
  producerRegistry?: InsightProducerRegistry;
  logger?: ButlerLogger;
}

interface CyclePhaseResult {
  state: ButlerPersistentState;
  observationSummary: string;
  decisions: Record<string, unknown>;
  actions: Record<string, unknown>;
  llmInvoked: boolean;
}

type OrientationUrgency = 'normal' | 'elevated' | 'critical';
type OrientationAction = 'advise' | 'act' | 'ask' | 'defer';

interface OrientationDecision {
  urgency: OrientationUrgency;
  recommendedAction: OrientationAction;
  pendingTasks: number;
  skipped?: boolean;
  reason?: 'reduced_mode' | 'no_time_remaining';
}

const MESSAGE_TTL_MS = 15 * 60 * 1000;
const AGENT_NOTE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_CLOCK: ClockPort = {
  now: () => Date.now(),
  isoNow: () => new Date().toISOString(),
};

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
    case 'autonomous_tick':
      return 3000;
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

type ButlerScope = { userId?: string; chatId?: string; project?: string };

function updateMetrics(
  state: ButlerPersistentState,
  durationMs: number,
  clock: ClockPort,
): ButlerPersistentState['selfModel'] {
  const totalCycles = state.selfModel.totalCycles + 1;
  const previousTotal = state.selfModel.avgCycleLatencyMs * state.selfModel.totalCycles;
  return {
    ...state.selfModel,
    totalCycles,
    avgCycleLatencyMs: totalCycles === 0 ? durationMs : (previousTotal + durationMs) / totalCycles,
    lastEvaluatedAt: clock.isoNow(),
  };
}

export class ButlerAgent {
  private readonly stateManager: ButlerStateManager;
  private readonly taskQueue: TaskQueueService;
  private readonly cognitiveEngine: CognitiveEngine;
  private readonly insightRepo: InsightStore;
  private readonly clock: ClockPort;
  private readonly goalService?: ButlerGoalService;
  private readonly workerPool?: WorkerThreadPool;
  private readonly narrativeService?: NarrativeThreadService;
  private readonly commitmentWatcher?: CommitmentWatcher;
  private readonly producerRegistry?: InsightProducerRegistry;
  private readonly logger?: ButlerLogger;
  private currentState: ButlerPersistentState | null = null;

  constructor(options: ButlerAgentOptions) {
    this.stateManager = options.stateManager;
    this.taskQueue = options.taskQueue;
    this.cognitiveEngine = options.cognitiveEngine;
    this.insightRepo = options.insightRepo;
    this.clock = options.clock ?? DEFAULT_CLOCK;
    this.goalService = options.goalService;
    this.workerPool = options.workerPool;
    this.narrativeService = options.narrativeService;
    this.commitmentWatcher = options.commitmentWatcher;
    this.producerRegistry = options.producerRegistry;
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
    const executed = await this.act(trigger, oriented, startedAt, maxTimeMs, cycleId);
    state = this.finishState(executed.state, startedAt);
    this.stateManager.save(state);
    this.currentState = state;

    return {
      cycleId,
      hook: trigger.type,
      observedAt: this.clock.isoNow(),
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
      case 'autonomous_tick':
        return this.observeAutonomousTick(trigger, state);
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

  private observeAutonomousTick(
    trigger: ButlerTrigger,
    state: ButlerPersistentState,
  ): CyclePhaseResult {
    return {
      state: this.stateManager.addWorkingMemoryEntry(
        state,
        'autonomous_tick',
        trigger.payload ?? { autonomous: true },
        AGENT_NOTE_TTL_MS,
      ),
      observationSummary: 'Autonomous scheduler tick recorded.',
      decisions: { trigger: 'autonomous_tick' },
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
    const orientation = this.getOrientationReason(trigger, state, startedAt, maxTimeMs);
    return {
      ...result,
      decisions: {
        ...result.decisions,
        orientation,
      },
      llmInvoked: false,
    };
  }

  private getOrientationReason(
    trigger: ButlerTrigger,
    state: ButlerPersistentState,
    startedAt: number,
    maxTimeMs: number,
  ): OrientationDecision {
    const pendingTasks = this.taskQueue.getPendingCount();
    if (state.mode === 'reduced') {
      return {
        urgency: 'normal',
        recommendedAction: 'defer',
        pendingTasks,
        skipped: true,
        reason: 'reduced_mode',
      };
    }
    if (!hasTimeRemaining(startedAt, maxTimeMs)) {
      return {
        urgency: 'normal',
        recommendedAction: 'defer',
        pendingTasks,
        skipped: true,
        reason: 'no_time_remaining',
      };
    }

    const urgency = this.assessUrgency(state, pendingTasks);

    if (trigger.type === 'session_ended') {
      return {
        urgency,
        recommendedAction: 'defer',
        pendingTasks,
      };
    }

    if (trigger.type === 'session_started') {
      return {
        urgency,
        recommendedAction: urgency === 'critical' || urgency === 'elevated' ? 'act' : 'defer',
        pendingTasks,
      };
    }

    if (trigger.type === 'message_received') {
      if (urgency === 'critical') {
        return { urgency, recommendedAction: 'act', pendingTasks };
      }
      if (urgency === 'elevated') {
        return { urgency, recommendedAction: 'advise', pendingTasks };
      }
      return { urgency, recommendedAction: 'defer', pendingTasks };
    }

    return {
      urgency,
      recommendedAction: 'defer',
      pendingTasks,
    };
  }

  private assessUrgency(
    state: ButlerPersistentState,
    pendingTasks: number,
  ): OrientationUrgency {
    const hasContradictionAlert = state.workingMemory.some((entry) => entry.key === 'contradiction_alert');
    const freshInsights = this.insightRepo.findFresh(6).length;

    if (hasContradictionAlert || pendingTasks > 10) {
      return 'critical';
    }
    if (pendingTasks > 3 || freshInsights > 5) {
      return 'elevated';
    }
    return 'normal';
  }

  private async act(
    trigger: ButlerTrigger,
    result: CyclePhaseResult,
    startedAt: number,
    maxTimeMs: number,
    cycleId: string,
  ): Promise<CyclePhaseResult> {
    switch (trigger.type) {
      case 'session_started':
        return await this.executeSessionStart(result, startedAt, maxTimeMs, cycleId);
      case 'session_ended':
        return this.executeSessionEnded(trigger, result);
      default:
        return result;
    }
  }

  private async executeSessionStart(
    result: CyclePhaseResult,
    startedAt: number,
    maxTimeMs: number,
    cycleId: string,
  ): Promise<CyclePhaseResult> {
    if (!hasTimeRemaining(startedAt, maxTimeMs)) {
      return result;
    }

    const drained = this.taskQueue.drain(buildDrainBudget(startedAt, maxTimeMs));
    const completedTaskTypes = await this.completeTasks(drained, cycleId);
    const surfacedInsights = this.surfaceFreshInsights();
    if (this.producerRegistry) {
      const produced = this.producerRegistry.runAll();
      this.logger?.info('ButlerAgent produced insights', { count: produced.length });
    }

    return {
      ...result,
      actions: {
        drainedTaskTypes: completedTaskTypes,
        surfacedInsightIds: surfacedInsights,
      },
    };
  }

  private async completeTasks(tasks: ButlerTask[], cycleId: string): Promise<string[]> {
    const completedTaskTypes: string[] = [];
    for (const task of tasks) {
      try {
        await this.runDeferredTask(task);
        this.taskQueue.complete(task.id, { completedBy: 'butler-agent', cycleId });
        completedTaskTypes.push(task.type);
      } catch (error) {
        this.logger?.error('ButlerAgent failed to complete task', { error: error instanceof Error ? error.message : String(error) });
        this.taskQueue.fail(task.id, error instanceof Error ? error.message : String(error));
      }
    }
    return completedTaskTypes;
  }

  private async runDeferredTask(task: ButlerTask): Promise<void> {
    if (task.type === 'narrative_update') {
      if (this.narrativeService) {
        this.narrativeService.updateOrCreateForSession(parseTaskPayload(task) ?? {});
      }
      return;
    }

    if (task.type === 'insight_refresh') {
      if (this.commitmentWatcher) {
        const payload = parseTaskPayload(task);
        await this.commitmentWatcher.scanCommitments(
          payload as ButlerScope | undefined,
          { forceHeuristic: true },
        );
      }
      return;
    }

    if (task.type === 'goal_derivation') {
      if (this.goalService) {
        this.goalService.deriveGoalsFromInsights(parseTaskPayload(task));
      }
      return;
    }

    if (task.type === 'commitment_scan') {
      if (this.commitmentWatcher) {
        const payload = parseTaskPayload(task);
        await this.commitmentWatcher.scanCommitments(
          payload as { userId?: string; chatId?: string; project?: string } | undefined,
          { forceHeuristic: true },
        );
      }
      return;
    }

    if (task.type === 'knowledge_gap_scan') {
      this.logger?.info('ButlerAgent: knowledge_gap_scan task acknowledged');
      return;
    }

    if (task.type === 'strategy_review') {
      this.logger?.info('ButlerAgent: strategy_review task acknowledged (implementation deferred)');
      return;
    }

    if (task.type === 'contradiction_check') {
      this.logger?.info('ButlerAgent: contradiction_check task acknowledged (implementation deferred)');
      return;
    }

    if (task.type === 'memory_consolidation') {
      this.logger?.info('ButlerAgent: memory_consolidation task acknowledged (implementation deferred)');
      return;
    }
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
        type: 'commitment_scan',
        priority: 4,
        trigger: trigger.type,
        payload: trigger.scope ?? {},
        budgetClass: 'medium',
        idempotencyKey: `session-ended:commitments:${sessionId}`,
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
      this.taskQueue.enqueue({
        type: 'knowledge_gap_scan',
        priority: 6,
        trigger: trigger.type,
        payload: trigger.scope ?? {},
        budgetClass: 'low',
        idempotencyKey: `session-ended:gap-scan:${sessionId}`,
      }),
    ];

    return {
      ...result,
      actions: {
        queuedTaskIds,
        queuedTaskTypes: [
          'narrative_update',
          'commitment_scan',
          'insight_refresh',
          'goal_derivation',
          'knowledge_gap_scan',
        ],
      },
    };
  }

  private finishState(state: ButlerPersistentState, startedAt: number): ButlerPersistentState {
    const durationMs = Date.now() - startedAt;
    return {
      ...state,
      selfModel: updateMetrics(state, durationMs, this.clock),
      lastCycleAt: this.clock.isoNow(),
      lastCycleVersion: state.lastCycleVersion + 1,
    };
  }
}
