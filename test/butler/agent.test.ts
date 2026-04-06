import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { CognitiveEngine } from '../../src/core/butler/cognition.js';
import type { ClockPort } from '../../src/core/butler/ports/clock.js';
import type { KnowledgeGapDetector } from '../../src/core/butler/intelligence/gapDetector.js';
import type { KnowledgeGap } from '../../src/core/butler/intelligence/types.js';
import type { ButlerInsight, ButlerPersistentState } from '../../src/core/butler/types.js';
import { ButlerAgent } from '../../src/core/butler/agent.js';
import { ButlerStateManager } from '../../src/core/butler/state.js';
import { TaskQueueService } from '../../src/core/butler/taskQueue.js';
import { ButlerInsightRepository } from '../../src/storage/butlerInsightRepo.js';
import { ButlerStateRepository } from '../../src/storage/butlerStateRepo.js';
import { ButlerTaskRepository } from '../../src/storage/butlerTaskRepo.js';
import { createInMemoryDb } from '../storage/helpers.js';

function createLogger() {
  return {
    info: (_message: string, _meta?: Record<string, unknown>) => undefined,
    warn: (_message: string, _meta?: Record<string, unknown>) => undefined,
    error: (_message: string, _meta?: Record<string, unknown>) => undefined,
    debug: (_message: string, _meta?: Record<string, unknown>) => undefined,
  };
}

function createClock(initialNow: number): ClockPort & { set(now: number): void } {
  let now = initialNow;
  return {
    now: () => now,
    isoNow: () => new Date(now).toISOString(),
    set(value: number) {
      now = value;
    },
  };
}

function createStateManager(clock?: ClockPort) {
  const db = createInMemoryDb();
  const stateRepo = new ButlerStateRepository(db);
  const taskRepo = new ButlerTaskRepository(db);
  const insightRepo = new ButlerInsightRepository(db);
  return {
    db,
    stateManager: new ButlerStateManager({ stateRepo, clock, logger: createLogger() }),
    taskQueue: new TaskQueueService({ taskRepo, logger: createLogger() }),
    insightRepo,
    stateRepo,
  };
}

function createCognitiveStub(canAfford = false): CognitiveEngine {
  return {
    canAfford: () => canAfford,
    runTask: async () => ({
      output: {},
      confidence: 0,
      evidenceIds: [],
      fallbackUsed: true,
    }),
  } as unknown as CognitiveEngine;
}

describe('ButlerAgent', () => {
  it('runs a full queue and cycle flow with mocked collaborators, records a trace, and persists state', async () => {
    const ctx = createStateManager();
    const narrativeCalls: Array<Record<string, unknown>> = [];
    const commitmentCalls: Array<Record<string, unknown>> = [];
    const goalPayloads: Array<Record<string, unknown> | undefined> = [];
    const insightId = ctx.insightRepo.insert({
      kind: 'continuity',
      title: 'Resume butler module work',
      summary: 'The session should continue the pending test rollout.',
      confidence: 0.7,
      importance: 0.8,
      freshUntil: '2099-01-01T00:00:00.000Z',
    });
    const agent = new ButlerAgent({
      stateManager: ctx.stateManager,
      taskQueue: ctx.taskQueue,
      cognitiveEngine: createCognitiveStub(false),
      insightRepo: ctx.insightRepo,
      narrativeService: {
        updateOrCreateForSession: (payload: Record<string, unknown>) => {
          narrativeCalls.push(payload);
        },
      } as never,
      commitmentWatcher: {
        scanCommitments: async (scope?: Record<string, unknown>, options?: Record<string, unknown>) => {
          commitmentCalls.push({ scope, options });
        },
      } as never,
      goalService: {
        deriveGoalsFromInsights: (payload?: Record<string, unknown>) => {
          goalPayloads.push(payload);
        },
      } as never,
      logger: createLogger(),
    });

    const endTrace = await agent.runCycle({
      type: 'session_ended',
      sessionId: 'session-77',
      scope: { project: 'evermemory', chatId: 'chat-1' },
    });
    const startTrace = await agent.runCycle({ type: 'session_started', sessionId: 'session-77' });
    const savedState = ctx.stateRepo.load() as ButlerPersistentState;
    const startActions = JSON.parse(startTrace.actionsJson) as {
      drainedTaskTypes?: string[];
      surfacedInsightIds?: string[];
    };
    const endActions = JSON.parse(endTrace.actionsJson) as {
      queuedTaskTypes?: string[];
      queuedTaskIds?: string[];
    };

    assert.deepEqual(endActions.queuedTaskTypes, [
      'narrative_update',
      'commitment_scan',
      'insight_refresh',
      'goal_derivation',
      'knowledge_gap_scan',
    ]);
    assert.equal(endActions.queuedTaskIds?.length, 5);
    assert.deepEqual(startActions.drainedTaskTypes, ['narrative_update', 'commitment_scan', 'insight_refresh']);
    assert.deepEqual(startActions.surfacedInsightIds, [insightId]);
    assert.deepEqual(narrativeCalls, [{ project: 'evermemory', chatId: 'chat-1' }]);
    assert.deepEqual(commitmentCalls, [
      {
        scope: { project: 'evermemory', chatId: 'chat-1' },
        options: { forceHeuristic: true },
      },
      {
        scope: { project: 'evermemory', chatId: 'chat-1' },
        options: { forceHeuristic: true },
      },
    ]);
    assert.deepEqual(goalPayloads, []);
    assert.equal(startTrace.hook, 'session_started');
    assert.match(startTrace.observationSummary, /Session started/);
    assert.ok(startTrace.cycleId.length > 0);
    assert.equal(savedState.lastCycleVersion, 2);
    assert.equal(savedState.workingMemory.at(-1)?.key, 'session_started');
  });

  it('runs a session_started cycle, persists state, and reports timing in the trace', async () => {
    const ctx = createStateManager();
    const taskId = ctx.taskQueue.enqueue({ type: 'maintenance', priority: 2 });
    const insightId = ctx.insightRepo.insert({
      kind: 'recommendation',
      title: 'Check Butler tasks',
      summary: 'Run deferred work early in the session.',
      confidence: 0.8,
      importance: 0.9,
      freshUntil: '2099-01-01T00:00:00.000Z',
    });
    const agent = new ButlerAgent({
      stateManager: ctx.stateManager,
      taskQueue: ctx.taskQueue,
      cognitiveEngine: createCognitiveStub(false),
      insightRepo: ctx.insightRepo,
      logger: createLogger(),
    });

    const trace = await agent.runCycle({ type: 'session_started', sessionId: 'session-1' });
    const savedState = ctx.stateRepo.load() as ButlerPersistentState;
    const surfaced = ctx.insightRepo.findById(insightId) as ButlerInsight;
    const actions = JSON.parse(trace.actionsJson) as { drainedTaskTypes?: string[]; surfacedInsightIds?: string[] };

    assert.equal(trace.hook, 'session_started');
    assert.ok(trace.durationMs >= 0);
    assert.equal(savedState.lastCycleVersion, 1);
    assert.equal(savedState.workingMemory.at(-1)?.key, 'session_started');
    assert.deepEqual(actions.drainedTaskTypes, ['maintenance']);
    assert.deepEqual(actions.surfacedInsightIds, [insightId]);
    assert.equal(surfaced.surfacedCount, 1);
    assert.ok(surfaced.lastSurfacedAt);

    const followUpDrain = ctx.taskQueue.drain({ maxTasks: 1, maxTimeMs: 1_000, priorityFilter: 'all' });
    assert.deepEqual(followUpDrain, []);
    assert.equal(taskId.length > 0, true);
  });

  it('queues deferred tasks on session_ended and persists cycle state', async () => {
    const ctx = createStateManager();
    const agent = new ButlerAgent({
      stateManager: ctx.stateManager,
      taskQueue: ctx.taskQueue,
      cognitiveEngine: createCognitiveStub(false),
      insightRepo: ctx.insightRepo,
      logger: createLogger(),
    });

    const trace = await agent.runCycle({
      type: 'session_ended',
      sessionId: 'session-42',
      scope: { project: 'evermemory' },
    });
    const actions = JSON.parse(trace.actionsJson) as { queuedTaskIds?: string[]; queuedTaskTypes?: string[] };
    const drained = ctx.taskQueue.drain({ maxTasks: 5, maxTimeMs: 1_000, priorityFilter: 'all' });

    assert.deepEqual(actions.queuedTaskTypes, [
      'narrative_update',
      'commitment_scan',
      'insight_refresh',
      'goal_derivation',
      'knowledge_gap_scan',
    ]);
    assert.equal(actions.queuedTaskIds?.length, 5);
    assert.deepEqual(drained.map((task) => task.type), [
      'narrative_update',
      'commitment_scan',
      'insight_refresh',
      'goal_derivation',
      'knowledge_gap_scan',
    ]);
    assert.equal((ctx.stateRepo.load() as ButlerPersistentState).lastCycleVersion, 1);
  });

  it('handles deferred task failures gracefully during session start', async () => {
    const ctx = createStateManager();
    const failedTaskStatement = ctx.db.prepare('SELECT status, error FROM butler_tasks WHERE id = ?');
    const agent = new ButlerAgent({
      stateManager: ctx.stateManager,
      taskQueue: ctx.taskQueue,
      cognitiveEngine: createCognitiveStub(false),
      insightRepo: ctx.insightRepo,
      commitmentWatcher: {
        scanCommitments: async () => {
          throw new Error('scan failed');
        },
      } as never,
      logger: createLogger(),
    });
    const failedTaskId = ctx.taskQueue.enqueue({
      type: 'insight_refresh',
      priority: 2,
      payload: { project: 'evermemory' },
    });

    const trace = await agent.runCycle({ type: 'session_started', sessionId: 'session-error' });
    const actions = JSON.parse(trace.actionsJson) as { drainedTaskTypes?: string[] };
    const failedTask = failedTaskStatement.get(failedTaskId) as { status: string; error: string } | undefined;

    assert.deepEqual(actions.drainedTaskTypes, []);
    assert.equal(ctx.stateManager.getMode(), 'reduced');
    assert.ok(trace.durationMs >= 0);
    assert.equal(failedTask?.status, 'failed');
    assert.match(failedTask?.error ?? '', /scan failed/);
  });

  it('records a trace and persists state even when a non-action phase trigger is used', async () => {
    const ctx = createStateManager();
    const agent = new ButlerAgent({
      stateManager: ctx.stateManager,
      taskQueue: ctx.taskQueue,
      cognitiveEngine: createCognitiveStub(false),
      insightRepo: ctx.insightRepo,
      logger: createLogger(),
    });

    const trace = await agent.runCycle({
      type: 'message_received',
      sessionId: 'session-msg',
      payload: { text: 'test message' },
    });
    const savedState = ctx.stateRepo.load() as ButlerPersistentState;
    const decisions = JSON.parse(trace.decisionsJson) as {
      trigger?: string;
      orientation?: {
        urgency?: string;
        skipped?: boolean;
        reason?: string;
        recommendedAction?: string;
        pendingTasks?: number;
      };
    };

    assert.equal(trace.hook, 'message_received');
    assert.equal(decisions.trigger, 'message_received');
    assert.deepEqual(decisions.orientation, {
      urgency: 'normal',
      skipped: true,
      reason: 'reduced_mode',
      recommendedAction: 'defer',
      pendingTasks: 0,
    });
    assert.equal(savedState.lastCycleVersion, 1);
    assert.deepEqual(savedState.workingMemory.at(-1)?.value, { text: 'test message' });
  });

  it('knowledge_gap_scan converts detected gaps into anomaly/open-loop insights', async () => {
    const ctx = createStateManager();
    ctx.stateManager.save({
      ...ctx.stateManager.load(),
      mode: 'steward',
    });
    const gapsByType: Record<string, KnowledgeGap[]> = {
      stale: [
        {
          type: 'stale',
          description: 'Release note is stale.',
          importance: 0.9,
          memoryIds: ['memory-stale-1'],
        },
        {
          type: 'stale',
          description: 'Owner note is stale.',
          importance: 0.8,
          memoryIds: ['memory-stale-2'],
        },
      ],
      incomplete: [
        {
          type: 'incomplete',
          description: 'Commitment is unresolved.',
          importance: 0.7,
          memoryIds: ['memory-incomplete-1'],
        },
      ],
      unresolved_contradiction: [
        {
          type: 'unresolved_contradiction',
          description: 'Contradiction still needs resolution.',
          importance: 0.85,
          memoryIds: ['memory-contradiction-1'],
        },
        {
          type: 'unresolved_contradiction',
          description: 'Another contradiction still needs resolution.',
          importance: 0.75,
          memoryIds: ['memory-contradiction-2'],
        },
      ],
    };
    const gapDetector = {
      detectGaps: () => [],
      detectStaleMemories: () => gapsByType.stale,
      detectIncompleteCommitments: () => gapsByType.incomplete,
      detectUnresolvedContradictions: () => gapsByType.unresolved_contradiction,
    } as unknown as KnowledgeGapDetector;
    const agent = new ButlerAgent({
      stateManager: ctx.stateManager,
      taskQueue: ctx.taskQueue,
      cognitiveEngine: createCognitiveStub(false),
      insightRepo: ctx.insightRepo,
      gapDetector,
      logger: createLogger(),
    });
    ctx.taskQueue.enqueue({
      type: 'knowledge_gap_scan',
      priority: 2,
      payload: { project: 'evermemory' },
    });

    await agent.runCycle({ type: 'session_started', sessionId: 'session-gap' });

    const openLoops = ctx.insightRepo.findByKind('open_loop', 10);
    const anomalies = ctx.insightRepo.findByKind('anomaly', 10);

    assert.equal(openLoops.length, 3);
    assert.equal(anomalies.length, 2);
    assert.equal(openLoops[0]?.title, 'Knowledge gap: stale');
    assert.equal(anomalies[0]?.title, 'Knowledge gap: unresolved_contradiction');
    assert.match(anomalies[0]?.summary ?? '', /Contradiction still needs resolution/);
  });

  it('strategy_review adds strategy_stale working memory when the frame is older than two hours', async () => {
    const clock = createClock(Date.parse('2026-04-06T12:00:00.000Z'));
    const ctx = createStateManager(clock);
    const initial = ctx.stateManager.load();
    ctx.stateManager.save({
      ...initial,
      mode: 'steward',
      currentStrategyFrame: {
        ...initial.currentStrategyFrame,
        currentMode: 'planning',
        lastUpdatedAt: '2026-04-06T08:30:00.000Z',
      },
    });
    const agent = new ButlerAgent({
      stateManager: ctx.stateManager,
      taskQueue: ctx.taskQueue,
      cognitiveEngine: createCognitiveStub(false),
      insightRepo: ctx.insightRepo,
      clock,
      logger: createLogger(),
    });
    ctx.taskQueue.enqueue({ type: 'strategy_review', priority: 2 });

    await agent.runCycle({ type: 'session_started', sessionId: 'session-strategy' });

    const savedState = ctx.stateRepo.load() as ButlerPersistentState;
    const strategyEntry = savedState.workingMemory.find((entry) => entry.key === 'strategy_stale');

    assert.ok(strategyEntry);
    assert.deepEqual(strategyEntry?.value, {
      ageMs: 12_600_000,
      lastMode: 'planning',
    });
    assert.equal(savedState.workingMemory.some((entry) => entry.key === 'session_started'), true);
  });

  it('contradiction_check records unresolved contradiction count in working memory', async () => {
    const clock = createClock(Date.parse('2026-04-06T12:00:00.000Z'));
    const ctx = createStateManager(clock);
    ctx.stateManager.save({
      ...ctx.stateManager.load(),
      mode: 'steward',
    });
    ctx.insightRepo.insert({
      kind: 'anomaly',
      title: 'Plan mismatch',
      summary: 'contradiction detected between runtime and test expectations',
      importance: 0.8,
    });
    ctx.insightRepo.insert({
      kind: 'anomaly',
      title: 'Scope mismatch',
      summary: 'contradiction remains unresolved in current plan',
      importance: 0.7,
    });
    ctx.insightRepo.insert({
      kind: 'anomaly',
      title: 'Fresh anomaly',
      summary: 'unrelated issue',
      importance: 0.6,
    });
    const agent = new ButlerAgent({
      stateManager: ctx.stateManager,
      taskQueue: ctx.taskQueue,
      cognitiveEngine: createCognitiveStub(false),
      insightRepo: ctx.insightRepo,
      clock,
      logger: createLogger(),
    });
    ctx.taskQueue.enqueue({ type: 'contradiction_check', priority: 2 });

    await agent.runCycle({ type: 'session_started', sessionId: 'session-contradictions' });

    const savedState = ctx.stateRepo.load() as ButlerPersistentState;
    const pendingEntry = savedState.workingMemory.find((entry) => entry.key === 'pending_contradictions');

    assert.ok(pendingEntry);
    assert.deepEqual(pendingEntry?.value, { count: 2 });
    assert.equal(pendingEntry?.createdAt, '2026-04-06T12:00:00.000Z');
  });

  it('memory_consolidation deletes expired insights while preserving fresh ones', async () => {
    const ctx = createStateManager();
    ctx.stateManager.save({
      ...ctx.stateManager.load(),
      mode: 'steward',
    });
    const expiredId = ctx.insightRepo.insert({
      kind: 'open_loop',
      title: 'Expired loop',
      summary: 'Should be removed.',
      importance: 0.5,
      freshUntil: '2000-01-01T00:00:00.000Z',
    });
    const freshId = ctx.insightRepo.insert({
      kind: 'continuity',
      title: 'Fresh continuity',
      summary: 'Should remain.',
      importance: 0.6,
      freshUntil: '2099-01-01T00:00:00.000Z',
    });
    const agent = new ButlerAgent({
      stateManager: ctx.stateManager,
      taskQueue: ctx.taskQueue,
      cognitiveEngine: createCognitiveStub(false),
      insightRepo: ctx.insightRepo,
      logger: createLogger(),
    });
    ctx.taskQueue.enqueue({ type: 'memory_consolidation', priority: 2 });

    await agent.runCycle({ type: 'session_started', sessionId: 'session-memory' });

    assert.equal(ctx.insightRepo.findById(expiredId), null);
    assert.equal(ctx.insightRepo.findById(freshId)?.title, 'Fresh continuity');
  });
});
