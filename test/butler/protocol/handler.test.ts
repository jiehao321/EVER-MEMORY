import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ButlerAgent } from '../../../src/core/butler/agent.js';
import type { ClockPort } from '../../../src/core/butler/ports/clock.js';
import type { ButlerStoragePort } from '../../../src/core/butler/ports/storage.js';
import { ProtocolHandler } from '../../../src/core/butler/protocol/handler.js';
import type { ButlerCycleTrace, ButlerPersistentState, ButlerTrigger } from '../../../src/core/butler/types.js';

function createTrace(hook: ButlerTrigger['type']): ButlerCycleTrace {
  return {
    cycleId: `cycle-${hook}`,
    hook,
    observedAt: '2026-04-04T00:00:00.000Z',
    observationSummary: `observed ${hook}`,
    decisionsJson: '{}',
    actionsJson: '{}',
    llmInvoked: false,
    durationMs: 5,
  };
}

function createClock(now = 1_000): ClockPort & { set(value: number): void } {
  let current = now;
  return {
    now() {
      return current;
    },
    isoNow() {
      return new Date(current).toISOString();
    },
    set(value: number) {
      current = value;
    },
  };
}

function createState(overrides: Partial<ButlerPersistentState> = {}): ButlerPersistentState {
  return {
    currentStrategyFrame: overrides.currentStrategyFrame ?? {
      currentMode: 'planning',
      likelyUserGoal: 'ship phase 4',
      topPriorities: ['runtime'],
      constraints: ['esm'],
      lastUpdatedAt: '2026-04-04T00:00:00.000Z',
    },
    selfModel: overrides.selfModel ?? {
      overlayAcceptanceRate: 0.5,
      insightPrecision: 0.6,
      avgCycleLatencyMs: 50,
      totalCycles: 7,
      lastEvaluatedAt: '2026-04-04T00:00:00.000Z',
    },
    workingMemory: overrides.workingMemory ?? [],
    mode: overrides.mode ?? 'steward',
    lastCycleAt: overrides.lastCycleAt ?? '2026-04-04T00:00:00.000Z',
    lastCycleVersion: overrides.lastCycleVersion ?? 7,
  };
}

function createStorage(): ButlerStoragePort {
  return {
    state: {
      load: () => null,
      save: () => undefined,
      updateMode: () => undefined,
    },
    tasks: {
      addTask: () => 'task-1',
      leaseTasks: () => [],
      completeTask: () => undefined,
      failTask: () => undefined,
      getPendingCount: () => 2,
      getByIdempotencyKey: () => null,
    },
    insights: {
      insert: () => 'insight-1',
      findById: () => null,
      findByKind: () => [],
      findFresh: () => [
        {
          id: 'insight-1',
          kind: 'continuity',
          title: 'Fresh insight',
          summary: 'summary',
          confidence: 0.7,
          importance: 0.8,
          surfacedCount: 0,
          createdAt: '2026-04-04T00:00:00.000Z',
        },
      ],
      markSurfaced: () => undefined,
      deleteExpired: () => 0,
    },
    feedback: {
      insert: () => ({
        id: 'feedback-1',
        insightId: 'insight-1',
        action: 'accepted',
        createdAt: '2026-04-04T00:00:00.000Z',
      }),
      findByInsightId: () => [],
      getLatestAction: () => null,
      isSnoozed: () => false,
      isDismissed: () => false,
      isBlocked: () => false,
      getAcceptanceStats: () => ({ accepted: 0, rejected: 0, total: 0 }),
      pruneExpired: () => 0,
    },
    goals: {
      insert: () => ({
        id: 'goal-1',
        title: 'Goal',
        status: 'active',
        priority: 1,
        sourceInsightIds: [],
        createdAt: '2026-04-04T00:00:00.000Z',
        updatedAt: '2026-04-04T00:00:00.000Z',
      }),
      findById: () => null,
      findActive: () => [
        {
          id: 'goal-1',
          title: 'Phase 4',
          status: 'active',
          priority: 1,
          sourceInsightIds: [],
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      ],
      findByStatus: () => [],
      update: () => null,
      setStatus: () => null,
      addProgressNote: () => null,
      deleteById: () => false,
    },
    narrative: {
      insert: () => 'thread-1',
      findById: () => null,
      findActive: () => [],
      update: () => undefined,
      close: () => undefined,
    },
    invocations: {
      insert: () => 'invocation-1',
      getDailyUsage: () => ({ totalTokens: 0, count: 0 }),
      getSessionUsage: () => ({ totalTokens: 0, count: 0 }),
    },
  };
}

describe('ProtocolHandler', () => {
  it('maps session_started events to Butler triggers and returns a response message', async () => {
    const triggers: ButlerTrigger[] = [];
    const handler = new ProtocolHandler({
      agent: {
        async runCycle(trigger: ButlerTrigger) {
          triggers.push(trigger);
          return createTrace(trigger.type);
        },
        getState: () => createState(),
      } as unknown as ButlerAgent,
      scheduler: {
        stop: () => undefined,
      } as never,
      storage: createStorage(),
      clock: createClock(),
    });

    const response = await handler.handle({
      type: 'event',
      id: 'req-1',
      event: {
        kind: 'session_started',
        sessionId: 'session-1',
        scope: { project: 'evermemory' },
      },
    });

    assert.deepEqual(triggers, [
      {
        type: 'session_started',
        sessionId: 'session-1',
        scope: { project: 'evermemory' },
      },
    ]);
    assert.equal(response?.type, 'response');
    assert.equal(response?.requestId, 'req-1');
    assert.equal(response?.result.cycleTrace?.hook, 'session_started');
  });

  it('maps tick and session_ended events to the expected Butler triggers', async () => {
    const triggers: ButlerTrigger[] = [];
    const handler = new ProtocolHandler({
      agent: {
        async runCycle(trigger: ButlerTrigger) {
          triggers.push(trigger);
          return createTrace(trigger.type);
        },
        getState: () => createState(),
      } as unknown as ButlerAgent,
      scheduler: {
        stop: () => undefined,
      } as never,
      storage: createStorage(),
      clock: createClock(),
    });

    await handler.handle({
      type: 'event',
      id: 'req-tick',
      event: { kind: 'tick' },
    });
    await handler.handle({
      type: 'event',
      id: 'req-end',
      event: { kind: 'session_ended', sessionId: 'session-9' },
    });

    assert.deepEqual(triggers, [
      { type: 'autonomous_tick' },
      { type: 'session_ended', sessionId: 'session-9' },
    ]);
  });

  it('stops the scheduler on shutdown and returns a status message', async () => {
    const clock = createClock(500);
    let stopCalls = 0;
    const handler = new ProtocolHandler({
      agent: {
        async runCycle() {
          return createTrace('autonomous_tick');
        },
        getState: () => createState({ mode: 'reduced' }),
      } as unknown as ButlerAgent,
      scheduler: {
        stop: () => {
          stopCalls += 1;
        },
      } as never,
      storage: createStorage(),
      clock,
    });

    clock.set(2_000);
    const response = await handler.handle({
      type: 'shutdown',
      id: 'shutdown-1',
      reason: 'test',
    });

    assert.equal(stopCalls, 1);
    assert.equal(response?.type, 'status');
    assert.deepEqual(response?.status, {
      mode: 'reduced',
      uptime: 1_500,
      totalCycles: 7,
      pendingTasks: 2,
      activeGoals: 1,
      activeInsights: 1,
    });
  });

  it('returns null for answer and action_result messages', async () => {
    const handler = new ProtocolHandler({
      agent: {
        async runCycle() {
          return createTrace('autonomous_tick');
        },
        getState: () => createState(),
      } as unknown as ButlerAgent,
      scheduler: {
        stop: () => undefined,
      } as never,
      storage: createStorage(),
      clock: createClock(),
    });

    assert.equal(
      await handler.handle({
        type: 'answer',
        id: 'answer-1',
        questionId: 'question-1',
        answer: 'yes',
      }),
      null,
    );
    assert.equal(
      await handler.handle({
        type: 'action_result',
        id: 'action-result-1',
        actionId: 'action-1',
        success: true,
        result: { ok: true },
      }),
      null,
    );
  });
});
