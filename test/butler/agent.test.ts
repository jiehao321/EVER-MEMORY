import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { CognitiveEngine } from '../../src/core/butler/cognition.js';
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

function createStateManager() {
  const db = createInMemoryDb();
  const stateRepo = new ButlerStateRepository(db);
  const taskRepo = new ButlerTaskRepository(db);
  const insightRepo = new ButlerInsightRepository(db);
  return {
    db,
    stateManager: new ButlerStateManager({ stateRepo, logger: createLogger() }),
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

    assert.deepEqual(endActions.queuedTaskTypes, ['narrative_update', 'insight_refresh', 'goal_derivation']);
    assert.equal(endActions.queuedTaskIds?.length, 3);
    assert.deepEqual(startActions.drainedTaskTypes, ['narrative_update', 'insight_refresh', 'goal_derivation']);
    assert.deepEqual(startActions.surfacedInsightIds, [insightId]);
    assert.deepEqual(narrativeCalls, [{ project: 'evermemory', chatId: 'chat-1' }]);
    assert.deepEqual(commitmentCalls, [{
      scope: { project: 'evermemory', chatId: 'chat-1' },
      options: { forceHeuristic: true },
    }]);
    assert.deepEqual(goalPayloads, [{ project: 'evermemory', chatId: 'chat-1' }]);
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

    assert.deepEqual(actions.queuedTaskTypes, ['narrative_update', 'insight_refresh', 'goal_derivation']);
    assert.equal(actions.queuedTaskIds?.length, 3);
    assert.deepEqual(drained.map((task) => task.type), ['narrative_update', 'insight_refresh', 'goal_derivation']);
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
    const decisions = JSON.parse(trace.decisionsJson) as { trigger?: string; orientation?: string };

    assert.equal(trace.hook, 'message_received');
    assert.equal(decisions.trigger, 'message_received');
    assert.match(decisions.orientation ?? '', /reduced mode skips orientation/);
    assert.equal(savedState.lastCycleVersion, 1);
    assert.deepEqual(savedState.workingMemory.at(-1)?.value, { text: 'test message' });
  });
});
