import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ButlerAgent } from '../../../src/core/butler/agent.js';
import type { ClockPort } from '../../../src/core/butler/ports/clock.js';
import type { ButlerStoragePort } from '../../../src/core/butler/ports/storage.js';
import { ProtocolHandler } from '../../../src/core/butler/protocol/handler.js';
import type { ButlerMessage } from '../../../src/core/butler/protocol/types.js';
import type { ButlerPersistentState, ButlerTrigger } from '../../../src/core/butler/types.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
      getPendingCount: () => 2,
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

function createHandler(outbound: ButlerMessage[] = []): ProtocolHandler {
  return new ProtocolHandler(
    {
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
      onOutbound: (message: ButlerMessage) => outbound.push(message),
    } as unknown as ConstructorParameters<typeof ProtocolHandler>[0],
  );
}

describe('ProtocolHandler outbound flows', () => {
  it('emits a question and resolves when an answer arrives', async () => {
    const outbound: ButlerMessage[] = [];
    const handler = createHandler(outbound);
    const askUser = (handler as unknown as {
      askUser(question: string, options?: { context?: string; timeoutMs?: number }): Promise<string | null>;
    }).askUser;

    const pending = askUser.call(handler, 'Need approval?', {
      context: 'phase-5',
      timeoutMs: 100,
    });

    assert.equal(outbound.length, 1);
    assert.equal(outbound[0]?.type, 'question');
    assert.equal(outbound[0]?.questionText, 'Need approval?');
    assert.equal(outbound[0]?.context, 'phase-5');

    const question = outbound[0];
    await handler.handle({
      type: 'answer',
      id: 'answer-1',
      questionId: question.id,
      answer: 'approved',
    });

    assert.equal(await pending, 'approved');
  });

  it('returns null when a question times out', async () => {
    const handler = createHandler();
    const askUser = (handler as unknown as {
      askUser(question: string, options?: { context?: string; timeoutMs?: number }): Promise<string | null>;
    }).askUser;

    const pending = askUser.call(handler, 'Any answer?', { timeoutMs: 25 });

    await sleep(60);
    assert.equal(await pending, null);
  });

  it('emits a confirm action and resolves when an action result arrives', async () => {
    const outbound: ButlerMessage[] = [];
    const handler = createHandler(outbound);
    const requestActionConfirmation = (handler as unknown as {
      requestActionConfirmation(
        action: { type: string; params: Record<string, unknown> },
        options?: { timeoutMs?: number },
      ): Promise<{ success: boolean; result?: unknown; error?: string }>;
    }).requestActionConfirmation;

    const pending = requestActionConfirmation.call(
      handler,
      { type: 'evermemory_store', params: { content: 'x' } },
      { timeoutMs: 100 },
    );

    assert.equal(outbound.length, 1);
    assert.equal(outbound[0]?.type, 'action');
    assert.equal(outbound[0]?.tier, 'confirm');
    assert.deepEqual(outbound[0]?.action, {
      type: 'evermemory_store',
      params: { content: 'x' },
    });

    const action = outbound[0];
    await handler.handle({
      type: 'action_result',
      id: 'result-1',
      actionId: action.id,
      success: true,
      result: { stored: true },
    });

    assert.deepEqual(await pending, { success: true, result: { stored: true } });
  });

  it('returns a failed result when action confirmation times out', async () => {
    const handler = createHandler();
    const requestActionConfirmation = (handler as unknown as {
      requestActionConfirmation(
        action: { type: string; params: Record<string, unknown> },
        options?: { timeoutMs?: number },
      ): Promise<{ success: boolean; result?: unknown; error?: string }>;
    }).requestActionConfirmation;

    const pending = requestActionConfirmation.call(
      handler,
      { type: 'evermemory_store', params: { content: 'x' } },
      { timeoutMs: 25 },
    );

    await sleep(60);
    assert.deepEqual(await pending, {
      success: false,
      error: 'Confirmation timeout',
    });
  });

  it('clears pending questions and actions on shutdown', async () => {
    const outbound: ButlerMessage[] = [];
    const handler = createHandler(outbound);
    const protocolHandler = handler as unknown as {
      askUser(question: string, options?: { context?: string; timeoutMs?: number }): Promise<string | null>;
      requestActionConfirmation(
        action: { type: string; params: Record<string, unknown> },
        options?: { timeoutMs?: number },
      ): Promise<{ success: boolean; result?: unknown; error?: string }>;
    };

    const questionPending = protocolHandler.askUser('Still there?', { timeoutMs: 1_000 });
    const actionPending = protocolHandler.requestActionConfirmation(
      { type: 'evermemory_store', params: { content: 'pending' } },
      { timeoutMs: 1_000 },
    );

    assert.equal(outbound.length, 2);

    const response = await handler.handle({
      type: 'shutdown',
      id: 'shutdown-1',
      reason: 'test',
    });

    assert.equal(response?.type, 'status');
    assert.equal(await questionPending, null);
    assert.deepEqual(await actionPending, {
      success: false,
      error: 'Shutdown',
    });
  });

  it('keeps concurrent pending questions and actions isolated', async () => {
    const outbound: ButlerMessage[] = [];
    const handler = createHandler(outbound);
    const protocolHandler = handler as unknown as {
      askUser(question: string, options?: { context?: string; timeoutMs?: number }): Promise<string | null>;
      requestActionConfirmation(
        action: { type: string; params: Record<string, unknown> },
        options?: { timeoutMs?: number },
      ): Promise<{ success: boolean; result?: unknown; error?: string }>;
    };

    const questionOne = protocolHandler.askUser('Question 1', { timeoutMs: 500 });
    const questionTwo = protocolHandler.askUser('Question 2', { timeoutMs: 500 });
    const actionOne = protocolHandler.requestActionConfirmation(
      { type: 'tool-1', params: { index: 1 } },
      { timeoutMs: 500 },
    );
    const actionTwo = protocolHandler.requestActionConfirmation(
      { type: 'tool-2', params: { index: 2 } },
      { timeoutMs: 500 },
    );

    const [firstQuestion, secondQuestion, firstAction, secondAction] = outbound;
    assert.equal(firstQuestion?.type, 'question');
    assert.equal(secondQuestion?.type, 'question');
    assert.equal(firstAction?.type, 'action');
    assert.equal(secondAction?.type, 'action');

    await handler.handle({
      type: 'answer',
      id: 'answer-2',
      questionId: secondQuestion.id,
      answer: 'second',
    });
    await handler.handle({
      type: 'action_result',
      id: 'result-1',
      actionId: firstAction.id,
      success: true,
      result: { ok: 1 },
    });
    await handler.handle({
      type: 'answer',
      id: 'answer-1',
      questionId: firstQuestion.id,
      answer: 'first',
    });
    await handler.handle({
      type: 'action_result',
      id: 'result-2',
      actionId: secondAction.id,
      success: false,
      error: 'denied',
    });

    assert.equal(await questionOne, 'first');
    assert.equal(await questionTwo, 'second');
    assert.deepEqual(await actionOne, { success: true, result: { ok: 1 } });
    assert.deepEqual(await actionTwo, { success: false, error: 'denied' });
  });
});
