import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ActionExecutor, ActionPolicy, type ActionPlan } from '../../../src/core/butler/actions/index.js';
import type { GoalStore } from '../../../src/core/butler/ports/storage.js';
import type { HostPort } from '../../../src/core/butler/ports/host.js';

function createLogger() {
  return {
    info: (_message: string, _meta?: Record<string, unknown>) => undefined,
    warn: (_message: string, _meta?: Record<string, unknown>) => undefined,
    error: (_message: string, _meta?: Record<string, unknown>) => undefined,
    debug: (_message: string, _meta?: Record<string, unknown>) => undefined,
  };
}

function createClock(...values: number[]) {
  let index = 0;
  let current = values[0] ?? 0;
  function nextValue(): number {
    current = values[Math.min(index, values.length - 1)] ?? current;
    index += 1;
    return current;
  }
  return {
    now() {
      return nextValue();
    },
    isoNow() {
      return new Date(nextValue()).toISOString();
    },
  };
}

function createHost(): HostPort {
  return {
    injectContext: () => undefined,
  };
}

function createPolicy(clock: ReturnType<typeof createClock>) {
  return new ActionPolicy(
    {
      maxActionsPerDay: 20,
      maxActionsPerSession: 20,
      requireConfirmTiers: ['confirm'],
    },
    clock,
    createLogger(),
  );
}

describe('ActionExecutor update_goal', () => {
  it('calls goalStore.update with the goal id and patch', async () => {
    const clock = createClock(0, 1, 2, 3, 4, 5);
    const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
    const goalStore = {
      insert: () => {
        throw new Error('unused');
      },
      findById: () => null,
      findActive: () => [],
      findByStatus: () => [],
      update: (id, patch) => {
        updates.push({ id, patch });
        return {
          id,
          title: patch.title ?? 'Existing title',
          description: patch.description,
          status: 'active',
          priority: patch.priority ?? 4,
          deadline: patch.deadline,
          progressNotes: patch.progressNotes,
          sourceInsightIds: [],
          createdAt: '2026-04-06T00:00:00.000Z',
          updatedAt: '2026-04-06T00:00:00.000Z',
        };
      },
      setStatus: () => null,
      addProgressNote: () => null,
      deleteById: () => false,
    } as GoalStore;
    const executor = new ActionExecutor(createHost(), createPolicy(clock), clock, createLogger(), goalStore);
    const plan: ActionPlan = {
      budgetMs: 100,
      reason: 'update goal',
      steps: [
        {
          type: 'update_goal',
          goalId: 'goal-1',
          patch: {
            title: 'Ship Butler maintenance',
            priority: 2,
            progressNotes: 'Queued follow-up verification.',
          },
          tier: 'auto',
        },
      ],
    };

    const result = await executor.execute(plan);

    assert.equal(result.actionsExecuted, 1);
    assert.equal(result.actionsFailed, 0);
    assert.deepEqual(updates, [
      {
        id: 'goal-1',
        patch: {
          title: 'Ship Butler maintenance',
          priority: 2,
          progressNotes: 'Queued follow-up verification.',
        },
      },
    ]);
  });

  it('fails update_goal when no goal store is available', async () => {
    const clock = createClock(0, 1, 2, 3);
    const executor = new ActionExecutor(createHost(), createPolicy(clock), clock, createLogger());

    const result = await executor.execute({
      budgetMs: 100,
      reason: 'update goal without store',
      steps: [
        {
          type: 'update_goal',
          goalId: 'goal-1',
          patch: { title: 'Ship Butler maintenance' },
          tier: 'auto',
        },
      ],
    });

    assert.equal(result.actionsExecuted, 0);
    assert.equal(result.actionsFailed, 1);
    assert.equal(result.stepResults[0]?.error, 'Goal store not available');
  });
});
