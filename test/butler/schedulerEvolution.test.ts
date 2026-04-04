import assert from 'node:assert/strict';
import test from 'node:test';
import type { ButlerAgent } from '../../src/core/butler/agent.js';
import type { ClockPort } from '../../src/core/butler/ports/clock.js';
import { ButlerScheduler } from '../../src/core/butler/scheduler/service.js';
import type { ButlerPersistentState } from '../../src/core/butler/types.js';

function createClock(now = 0): ClockPort {
  return {
    now: () => now,
    isoNow: () => new Date(now).toISOString(),
  };
}

function createState(): ButlerPersistentState {
  return {
    currentStrategyFrame: {
      currentMode: 'implementing',
      likelyUserGoal: 'Ship Butler evolution',
      topPriorities: ['Hook scheduler'],
      constraints: ['Keep it additive'],
      lastUpdatedAt: '2026-04-04T00:00:00.000Z',
    },
    selfModel: {
      overlayAcceptanceRate: 0.3,
      insightPrecision: 0.7,
      avgCycleLatencyMs: 500,
      totalCycles: 12,
      lastEvaluatedAt: '2026-04-04T00:00:00.000Z',
    },
    workingMemory: [],
    mode: 'reduced',
    lastCycleAt: '2026-04-04T00:00:00.000Z',
    lastCycleVersion: 1,
  };
}

test('scheduler invokes evolution after a completed cycle when evolution is due', async () => {
  const evolvedStates: ButlerPersistentState[] = [];
  const agent = {
    async runCycle() {
      return {
        cycleId: 'cycle-1',
        hook: 'autonomous_tick',
        observedAt: '2026-04-04T00:00:00.000Z',
        observationSummary: 'tick',
        decisionsJson: '{}',
        actionsJson: '{}',
        llmInvoked: false,
        durationMs: 1,
      };
    },
    getState() {
      return createState();
    },
  } as unknown as ButlerAgent;
  const scheduler = new ButlerScheduler(
    agent,
    {
      tasks: {
        addTask: () => 'task-1',
        leaseTasks: () => [],
        completeTask: () => undefined,
        failTask: () => undefined,
        getPendingCount: () => 1,
        getByIdempotencyKey: () => null,
      },
      clock: createClock(0),
    },
    createClock(0),
    undefined,
    undefined,
    {
      canEvolve: () => true,
      evolve: (state: ButlerPersistentState) => {
        evolvedStates.push(state);
        return null;
      },
    },
  );

  const result = await scheduler.tick();

  assert.equal(result.cycleRan, true);
  assert.equal(evolvedStates.length, 1);
  assert.equal(evolvedStates[0]?.selfModel.totalCycles, 12);
});
