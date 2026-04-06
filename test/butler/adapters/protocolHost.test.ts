import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ButlerAgent } from '../../../src/core/butler/agent.js';
import type { ClockPort } from '../../../src/core/butler/ports/clock.js';
import type { ButlerStoragePort } from '../../../src/core/butler/ports/storage.js';
import { ProtocolHandler } from '../../../src/core/butler/protocol/handler.js';
import type { ButlerPersistentState, ButlerTrigger } from '../../../src/core/butler/types.js';

function createClock(now = 1_000): ClockPort {
  return {
    now: () => now,
    isoNow: () => new Date(now).toISOString(),
  };
}

function createState(overrides: Partial<ButlerPersistentState> = {}): ButlerPersistentState {
  return {
    currentStrategyFrame: overrides.currentStrategyFrame ?? {
      currentMode: 'planning',
      likelyUserGoal: 'ship phase 5',
      topPriorities: ['protocol'],
      constraints: ['esm'],
      lastUpdatedAt: '2026-04-06T00:00:00.000Z',
    },
    selfModel: overrides.selfModel ?? {
      overlayAcceptanceRate: 0.5,
      insightPrecision: 0.6,
      avgCycleLatencyMs: 50,
      totalCycles: 7,
      lastEvaluatedAt: '2026-04-06T00:00:00.000Z',
    },
    workingMemory: overrides.workingMemory ?? [],
    mode: overrides.mode ?? 'steward',
    lastCycleAt: overrides.lastCycleAt ?? '2026-04-06T00:00:00.000Z',
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
      getPendingCount: () => 0,
      getByIdempotencyKey: () => null,
    },
    insights: {
      insert: () => 'insight-1',
      findById: () => null,
      findByKind: () => [],
      findFresh: () => [],
      markSurfaced: () => undefined,
      deleteExpired: () => 0,
    },
    feedback: {
      insert: () => ({
        id: 'feedback-1',
        insightId: 'insight-1',
        action: 'accepted',
        createdAt: '2026-04-06T00:00:00.000Z',
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
        createdAt: '2026-04-06T00:00:00.000Z',
        updatedAt: '2026-04-06T00:00:00.000Z',
      }),
      findById: () => null,
      findActive: () => [],
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

function createHandler(): ProtocolHandler {
  return new ProtocolHandler({
    agent: {
      async runCycle(trigger: ButlerTrigger) {
        return {
          cycleId: `cycle-${trigger.type}`,
          hook: trigger.type,
          observedAt: '2026-04-06T00:00:00.000Z',
          observationSummary: `observed ${trigger.type}`,
          decisionsJson: '{}',
          actionsJson: '{}',
          llmInvoked: false,
          durationMs: 5,
        };
      },
      getState: () => createState(),
    } as unknown as ButlerAgent,
    scheduler: {
      stop: () => undefined,
    } as never,
    storage: createStorage(),
    clock: createClock(),
  });
}

async function loadProtocolHostAdapter(): Promise<{
  ProtocolHostAdapter: new (
    handler: ProtocolHandler,
    logger?: { debug?: (message: string, meta?: Record<string, unknown>) => void },
    config?: { confirmTimeoutMs?: number; questionTimeoutMs?: number },
  ) => {
    injectContext(xml: string): void;
    invokeTool(toolName: string, params: Record<string, unknown>): Promise<unknown>;
    askUser(question: string, options?: { context?: string }): Promise<string | null>;
    searchKnowledge(
      query: string,
      sources?: string[],
    ): Promise<Array<{ content: string; source: string; relevance: number }>>;
  };
}> {
  return import(new URL('../../../src/core/butler/adapters/protocolHost.js', import.meta.url).href);
}

describe('ProtocolHostAdapter', () => {
  it('delegates askUser to the protocol handler', async () => {
    const { ProtocolHostAdapter } = await loadProtocolHostAdapter();
    const handler = createHandler() as unknown as {
      askUser(question: string, options?: { context?: string; timeoutMs?: number }): Promise<string | null>;
    };
    const calls: Array<{ question: string; options?: { context?: string; timeoutMs?: number } }> = [];

    handler.askUser = async (question, options) => {
      calls.push({ question, options });
      return 'answer';
    };

    const host = new ProtocolHostAdapter(handler as unknown as ProtocolHandler, undefined, {
      questionTimeoutMs: 456,
    });

    assert.equal(await host.askUser('Need context?', { context: 'ctx' }), 'answer');
    assert.deepEqual(calls, [
      {
        question: 'Need context?',
        options: { context: 'ctx', timeoutMs: 456 },
      },
    ]);
  });

  it('delegates invokeTool to requestActionConfirmation and returns the result', async () => {
    const { ProtocolHostAdapter } = await loadProtocolHostAdapter();
    const handler = createHandler() as unknown as {
      requestActionConfirmation(
        action: { type: string; params: Record<string, unknown> },
        options?: { timeoutMs?: number },
      ): Promise<{ success: boolean; result?: unknown; error?: string }>;
    };
    const calls: Array<{
      action: { type: string; params: Record<string, unknown> };
      options?: { timeoutMs?: number };
    }> = [];

    handler.requestActionConfirmation = async (action, options) => {
      calls.push({ action, options });
      return { success: true, result: { approved: true } };
    };

    const host = new ProtocolHostAdapter(handler as unknown as ProtocolHandler, undefined, {
      confirmTimeoutMs: 789,
    });

    assert.deepEqual(await host.invokeTool('evermemory_store', { content: 'x' }), {
      approved: true,
    });
    assert.deepEqual(calls, [
      {
        action: { type: 'evermemory_store', params: { content: 'x' } },
        options: { timeoutMs: 789 },
      },
    ]);
  });

  it('throws when action confirmation fails', async () => {
    const { ProtocolHostAdapter } = await loadProtocolHostAdapter();
    const handler = createHandler() as unknown as {
      requestActionConfirmation(): Promise<{ success: boolean; result?: unknown; error?: string }>;
    };

    handler.requestActionConfirmation = async () => ({
      success: false,
      error: 'not approved',
    });

    const host = new ProtocolHostAdapter(handler as unknown as ProtocolHandler);

    await assert.rejects(
      host.invokeTool('evermemory_store', { content: 'x' }),
      /not approved/,
    );
  });

  it('returns no external knowledge in standalone mode', async () => {
    const { ProtocolHostAdapter } = await loadProtocolHostAdapter();
    const host = new ProtocolHostAdapter(createHandler());

    assert.deepEqual(await host.searchKnowledge('query'), []);
  });

  it('accepts injectContext as a no-op', async () => {
    const { ProtocolHostAdapter } = await loadProtocolHostAdapter();
    const host = new ProtocolHostAdapter(createHandler(), {
      debug: () => undefined,
    });

    assert.doesNotThrow(() => host.injectContext('<context />'));
  });
});
