import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ActionExecutor, ActionPolicy, type ActionPlan, type ActionStep } from '../../src/core/butler/actions/index.js';
import type { HostPort } from '../../src/core/butler/ports/host.js';

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

function createMutableClock(initialValue: number) {
  let current = initialValue;
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

function createHost(overrides: Partial<HostPort> = {}): HostPort & {
  toolCalls: Array<{ toolName: string; params: Record<string, unknown> }>;
  userCalls: Array<{ question: string; context?: string }>;
  knowledgeCalls: Array<{ query: string; sources?: string[] }>;
} {
  const toolCalls: Array<{ toolName: string; params: Record<string, unknown> }> = [];
  const userCalls: Array<{ question: string; context?: string }> = [];
  const knowledgeCalls: Array<{ query: string; sources?: string[] }> = [];
  return {
    injectContext: (_xml: string) => undefined,
    invokeTool: async (toolName, params) => {
      toolCalls.push({ toolName, params });
      return { ok: true, toolName, params };
    },
    askUser: async (question, options) => {
      userCalls.push({ question, context: options?.context });
      return 'ack';
    },
    searchKnowledge: async (query, sources) => {
      knowledgeCalls.push({ query, sources });
      return [{ content: 'result', source: 'test', relevance: 1 }];
    },
    ...overrides,
    toolCalls,
    userCalls,
    knowledgeCalls,
  };
}

describe('ActionPolicy', () => {
  it('enforces confirmation, session, and daily limits', () => {
    const clock = createMutableClock(Date.parse('2026-04-04T00:00:00.000Z'));
    const policy = new ActionPolicy(
      {
        maxActionsPerDay: 1,
        maxActionsPerSession: 1,
        requireConfirmTiers: ['confirm'],
      },
      clock,
      createLogger(),
    );
    const autoStep: ActionStep = { type: 'recall_memory', query: 'phase 1', tier: 'auto' };
    const confirmStep: ActionStep = { type: 'delete_memory', memoryId: 'mem-1', tier: 'confirm' };

    assert.deepEqual(policy.canExecute(confirmStep), {
      allowed: false,
      reason: 'requires user confirmation',
    });

    assert.deepEqual(policy.canExecute(autoStep), { allowed: true });
    policy.recordAction();

    assert.deepEqual(policy.canExecute(autoStep), {
      allowed: false,
      reason: 'daily action limit reached',
    });

    policy.resetSession();
    assert.deepEqual(policy.canExecute(autoStep), {
      allowed: false,
      reason: 'daily action limit reached',
    });

    clock.set(Date.parse('2026-04-05T00:00:00.000Z'));
    assert.deepEqual(policy.canExecute(autoStep), {
      allowed: true,
    });
    assert.equal(policy.getDailyActionCount(), 0);
    assert.equal(policy.getSessionActionCount(), 0);
  });

  it('enforces the session limit independently when daily budget remains', () => {
    const clock = createMutableClock(Date.parse('2026-04-04T00:00:00.000Z'));
    const policy = new ActionPolicy(
      {
        maxActionsPerDay: 2,
        maxActionsPerSession: 1,
        requireConfirmTiers: ['confirm'],
      },
      clock,
      createLogger(),
    );

    assert.deepEqual(policy.canExecute({ type: 'recall_memory', query: 'phase 1', tier: 'auto' }), { allowed: true });
    policy.recordAction();
    assert.deepEqual(policy.canExecute({ type: 'recall_memory', query: 'phase 1', tier: 'auto' }), {
      allowed: false,
      reason: 'session action limit reached',
    });
  });
});

describe('ActionExecutor', () => {
  it('routes host-backed action steps and records successful executions', async () => {
    const host = createHost();
    const clock = createClock(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12);
    const policy = new ActionPolicy(
      {
        maxActionsPerDay: 20,
        maxActionsPerSession: 20,
        requireConfirmTiers: ['confirm'],
      },
      clock,
      createLogger(),
    );
    const executor = new ActionExecutor(host, policy, clock, createLogger());
    const plan: ActionPlan = {
      budgetMs: 100,
      reason: 'test routing',
      steps: [
        { type: 'store_memory', content: 'remember this', memoryType: 'fact', tier: 'auto' },
        { type: 'recall_memory', query: 'remember', tier: 'auto' },
        { type: 'create_relation', fromId: 'm1', toId: 'm2', relationType: 'supports', tier: 'auto' },
        { type: 'ask_user', question: 'Need context?', context: 'phase 1', tier: 'auto' },
        { type: 'search_knowledge', query: 'sqlite', sources: ['docs'], tier: 'auto' },
      ],
    };

    const result = await executor.execute(plan);

    assert.equal(result.actionsExecuted, 5);
    assert.equal(result.actionsFailed, 0);
    assert.equal(host.toolCalls.length, 3);
    assert.deepEqual(host.toolCalls[0], {
      toolName: 'evermemory_store',
      params: { content: 'remember this', type: 'fact' },
    });
    assert.deepEqual(host.toolCalls[1], {
      toolName: 'evermemory_recall',
      params: { query: 'remember' },
    });
    assert.deepEqual(host.toolCalls[2], {
      toolName: 'evermemory_relations',
      params: { action: 'add', fromId: 'm1', toId: 'm2', relationType: 'supports' },
    });
    assert.deepEqual(host.userCalls, [{ question: 'Need context?', context: 'phase 1' }]);
    assert.deepEqual(host.knowledgeCalls, [{ query: 'sqlite', sources: ['docs'] }]);
  });

  it('reports unsupported and policy-blocked steps without aborting the plan', async () => {
    const host = createHost({ invokeTool: undefined });
    const clock = createClock(0, 1, 2, 3, 4, 5, 6, 7);
    const policy = new ActionPolicy(
      {
        maxActionsPerDay: 20,
        maxActionsPerSession: 20,
        requireConfirmTiers: ['confirm'],
      },
      clock,
      createLogger(),
    );
    const executor = new ActionExecutor(host, policy, clock, createLogger());
    const result = await executor.execute({
      budgetMs: 100,
      reason: 'unsupported host test',
      steps: [
        { type: 'delete_memory', memoryId: 'mem-1', tier: 'confirm' },
        { type: 'archive_memory', memoryId: 'mem-2', tier: 'confirm' },
        { type: 'store_memory', content: 'x', memoryType: 'fact', tier: 'auto' },
        { type: 'update_goal', goalId: 'goal-1', patch: { status: 'active' }, tier: 'auto' },
      ],
    });

    assert.equal(result.actionsExecuted, 0);
    assert.equal(result.actionsFailed, 4);
    assert.equal(result.stepResults[0]?.error, 'requires user confirmation');
    assert.equal(result.stepResults[1]?.error, 'requires user confirmation');
    assert.equal(result.stepResults[2]?.error, 'Host does not support tool invocation');
    assert.match(result.stepResults[3]?.error ?? '', /goal store not available/i);
  });

  it('stops when the plan budget is exhausted', async () => {
    const host = createHost();
    const clock = createClock(0, 0, 8, 10, 11);
    const policy = new ActionPolicy(
      {
        maxActionsPerDay: 20,
        maxActionsPerSession: 20,
        requireConfirmTiers: ['confirm'],
      },
      clock,
      createLogger(),
    );
    const executor = new ActionExecutor(host, policy, clock, createLogger());
    const result = await executor.execute({
      budgetMs: 5,
      reason: 'budget test',
      steps: [
        { type: 'ask_user', question: 'first', context: 'one', tier: 'auto' },
        { type: 'search_knowledge', query: 'second', sources: ['docs'], tier: 'auto' },
      ],
    });

    assert.equal(result.stepResults.length, 1);
    assert.equal(result.actionsExecuted, 1);
    assert.equal(host.userCalls.length, 1);
    assert.equal(host.knowledgeCalls.length, 0);
  });
});
