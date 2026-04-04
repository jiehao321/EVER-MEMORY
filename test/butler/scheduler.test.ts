import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ButlerAgent } from '../../src/core/butler/agent.js';
import type { ClockPort } from '../../src/core/butler/ports/clock.js';
import type {
  GoalStore,
  InsightStore,
  NarrativeStore,
  TaskStore,
} from '../../src/core/butler/ports/storage.js';
import { ButlerScheduler, evaluateTriggers } from '../../src/core/butler/scheduler/index.js';

function createClock(now = 0): ClockPort & { set(value: number): void } {
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

function createTaskStore(pendingCount = 0): TaskStore {
  return {
    addTask: () => 'task-1',
    leaseTasks: () => [],
    completeTask: () => undefined,
    failTask: () => undefined,
    getPendingCount: () => pendingCount,
    getByIdempotencyKey: () => null,
  };
}

function createGoalStore(deadlines: string[]): GoalStore {
  return {
    insert: () => {
      throw new Error('not implemented');
    },
    findById: () => null,
    findActive: () => deadlines.map((deadline, index) => ({
      id: `goal-${index + 1}`,
      title: `Goal ${index + 1}`,
      status: 'active',
      priority: index + 1,
      deadline,
      sourceInsightIds: [],
      createdAt: '2026-04-04T00:00:00.000Z',
      updatedAt: '2026-04-04T00:00:00.000Z',
    })),
    findByStatus: () => [],
    update: () => null,
    setStatus: () => null,
    addProgressNote: () => null,
    deleteById: () => false,
  };
}

function createInsightStore(freshCount: number): InsightStore {
  return {
    insert: () => 'insight-1',
    findById: () => null,
    findByKind: () => [],
    findFresh: (limit = 5) => Array.from({ length: Math.min(limit, freshCount) }, (_, index) => ({
      id: `insight-${index + 1}`,
      kind: 'continuity',
      title: `Insight ${index + 1}`,
      summary: 'fresh insight',
      confidence: 0.8,
      importance: 0.7,
      surfacedCount: 0,
      createdAt: '2026-04-04T00:00:00.000Z',
    })),
    markSurfaced: () => undefined,
    deleteExpired: () => 0,
  };
}

function createNarrativeStore(): NarrativeStore {
  return {
    insert: () => 'thread-1',
    findById: () => null,
    findActive: () => [],
    update: () => undefined,
    close: () => undefined,
  };
}

function createAgentSpy() {
  const triggers: Array<Record<string, unknown>> = [];
  const agent = {
    async runCycle(trigger: Record<string, unknown>) {
      triggers.push(trigger);
      return {
        cycleId: 'cycle-1',
        hook: 'autonomous_tick',
        observedAt: '2026-04-04T00:00:00.000Z',
        observationSummary: 'autonomous tick',
        decisionsJson: '{}',
        actionsJson: '{}',
        llmInvoked: false,
        durationMs: 1,
      };
    },
  } as unknown as ButlerAgent;
  return { agent, triggers };
}

describe('evaluateTriggers', () => {
  it('returns task_due and housekeeping when pending tasks exist', () => {
    const triggers = evaluateTriggers({
      tasks: createTaskStore(3),
      clock: createClock(Date.parse('2026-04-04T00:00:00.000Z')),
    });

    assert.deepEqual(triggers, [
      { kind: 'task_due', priority: 'high', reason: '3 pending tasks' },
      { kind: 'periodic_housekeeping', priority: 'low', reason: 'Periodic maintenance' },
    ]);
  });

  it('returns goal_deadline and insight_expired when applicable', () => {
    const clock = createClock(Date.parse('2026-04-04T00:00:00.000Z'));
    const triggers = evaluateTriggers({
      tasks: createTaskStore(0),
      goals: createGoalStore(['2026-04-04T12:00:00.000Z', '2026-04-06T00:00:00.000Z']),
      insights: createInsightStore(0),
      narratives: createNarrativeStore(),
      clock,
    });

    assert.deepEqual(triggers, [
      { kind: 'goal_deadline', priority: 'high', reason: 'Goal "Goal 1" deadline approaching' },
      { kind: 'insight_expired', priority: 'medium', reason: 'No fresh insights remaining' },
      { kind: 'periodic_housekeeping', priority: 'low', reason: 'Periodic maintenance' },
    ]);
  });
});

describe('ButlerScheduler', () => {
  it('does not run a cycle when only housekeeping is present', async () => {
    const clock = createClock(Date.parse('2026-04-04T00:00:00.000Z'));
    const { agent, triggers: cycleTriggers } = createAgentSpy();
    const scheduler = new ButlerScheduler(
      agent,
      {
        tasks: createTaskStore(0),
        insights: createInsightStore(1),
        clock,
      },
      clock,
    );

    const result = await scheduler.tick();

    assert.equal(result.cycleRan, false);
    assert.deepEqual(result.triggers, [
      { kind: 'periodic_housekeeping', priority: 'low', reason: 'Periodic maintenance' },
    ]);
    assert.deepEqual(cycleTriggers, []);
    assert.equal(scheduler.getLastTickAt(), Date.parse('2026-04-04T00:00:00.000Z'));
  });

  it('runs an autonomous cycle when a high or medium trigger exists', async () => {
    const clock = createClock(Date.parse('2026-04-04T00:00:00.000Z'));
    const { agent, triggers } = createAgentSpy();
    const scheduler = new ButlerScheduler(
      agent,
      {
        tasks: createTaskStore(2),
        insights: createInsightStore(1),
        clock,
      },
      clock,
    );

    const result = await scheduler.tick();

    assert.equal(result.cycleRan, true);
    assert.equal(triggers.length, 1);
    assert.deepEqual(triggers[0], {
      type: 'autonomous_tick',
      payload: {
        autonomous: true,
        triggerKinds: ['task_due', 'periodic_housekeeping'],
      },
    });
  });

  it('only runs checkAndTick when the interval is overdue', async () => {
    const clock = createClock(0);
    const { agent, triggers } = createAgentSpy();
    const scheduler = new ButlerScheduler(
      agent,
      {
        tasks: createTaskStore(1),
        clock,
      },
      clock,
      undefined,
      { tickIntervalMs: 1_000 },
    );

    const first = await scheduler.checkAndTick();
    clock.set(999);
    const second = await scheduler.checkAndTick();
    clock.set(1_000);
    const third = await scheduler.checkAndTick();

    assert.equal(first, false);
    assert.equal(second, false);
    assert.equal(third, true);
    assert.equal(triggers.length, 1);
  });

  it('tracks running state through start and stop', () => {
    const clock = createClock(0);
    const { agent } = createAgentSpy();
    const scheduler = new ButlerScheduler(
      agent,
      {
        tasks: createTaskStore(0),
        clock,
      },
      clock,
      undefined,
      { tickIntervalMs: 10_000 },
    );

    assert.equal(scheduler.isRunning(), false);
    scheduler.start();
    assert.equal(scheduler.isRunning(), true);
    scheduler.stop();
    assert.equal(scheduler.isRunning(), false);
  });
});
