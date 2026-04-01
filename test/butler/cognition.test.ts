import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ButlerConfig, CognitiveTask, LlmRequest, LlmResponse } from '../../src/core/butler/types.js';
import { CognitiveEngine } from '../../src/core/butler/cognition.js';
import { ButlerLlmClient } from '../../src/core/butler/llmClient.js';

function createLogger() {
  return {
    info: (_message: string, _meta?: Record<string, unknown>) => undefined,
    warn: (_message: string, _meta?: Record<string, unknown>) => undefined,
    error: (_message: string, _meta?: Record<string, unknown>) => undefined,
    debug: (_message: string, _meta?: Record<string, unknown>) => undefined,
  };
}

function createConfig(overrides: Partial<ButlerConfig['cognition']> = {}): ButlerConfig['cognition'] {
  return {
    dailyTokenBudget: overrides.dailyTokenBudget ?? 100,
    sessionTokenBudget: overrides.sessionTokenBudget ?? 80,
    taskTimeoutMs: overrides.taskTimeoutMs ?? 1_500,
    fallbackToHeuristics: overrides.fallbackToHeuristics ?? true,
  };
}

function createTask(overrides: Partial<CognitiveTask<Record<string, unknown>>> = {}): CognitiveTask<Record<string, unknown>> {
  return {
    taskType: overrides.taskType ?? 'butler-test',
    evidence: overrides.evidence ?? { item: 'test' },
    outputSchema: overrides.outputSchema ?? {
      type: 'object',
      properties: {
        answer: { type: 'string' },
        confidence: { type: 'number' },
        evidenceIds: { type: 'array' },
      },
      required: ['answer'],
    },
    latencyClass: overrides.latencyClass ?? 'background',
    privacyClass: overrides.privacyClass ?? 'local_only',
    budgetClass: overrides.budgetClass ?? 'cheap',
  };
}

function createInvocationRepo(options: {
  dailyTokens?: number;
  sessionUsageById?: Record<string, { totalTokens: number; count: number }>;
} = {}) {
  const inserts: Array<Record<string, unknown>> = [];
  return {
    repo: {
      insert: (invocation: Record<string, unknown>) => {
        inserts.push(invocation);
        return `invocation-${inserts.length}`;
      },
      getDailyUsage: (_date?: string) => ({ totalTokens: options.dailyTokens ?? 0, count: 0 }),
      getSessionUsage: (sessionId: string) => options.sessionUsageById?.[sessionId] ?? { totalTokens: 0, count: 0 },
    },
    inserts,
  };
}

function createLlmClient(
  handler?: (request: LlmRequest) => Promise<LlmResponse>,
): ButlerLlmClient {
  return new ButlerLlmClient({
    gateway: handler
      ? { invoke: handler }
      : undefined,
    logger: createLogger(),
  });
}

describe('CognitiveEngine', () => {
  it('tracks token usage after a successful task', async () => {
    const { repo, inserts } = createInvocationRepo();
    const engine = new CognitiveEngine({
      llmClient: createLlmClient(async () => ({
        content: JSON.stringify({
          answer: 'ok',
          confidence: 0.8,
          evidenceIds: ['ev-1'],
        }),
        usage: { inputTokens: 12, outputTokens: 8, totalTokens: 20 },
        provider: 'test',
        model: 'stub-model',
      })),
      invocationRepo: repo,
      config: createConfig(),
      logger: createLogger(),
    });

    const result = await engine.runTask(createTask());
    const usage = engine.getUsage();

    assert.equal(result.fallbackUsed, false);
    assert.equal(usage.sessionTokens, 20);
    assert.equal(usage.dailyTokens, 0);
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0]?.success, true);
  });

  it('returns a fallback result when the budget is exhausted', async () => {
    let invoked = false;
    const { repo } = createInvocationRepo({ dailyTokens: 90 });
    const engine = new CognitiveEngine({
      llmClient: createLlmClient(async () => {
        invoked = true;
        return {
          content: JSON.stringify({ answer: 'unexpected' }),
        };
      }),
      invocationRepo: repo,
      config: createConfig({ dailyTokenBudget: 100 }),
      logger: createLogger(),
    });

    const result = await engine.runTask(createTask({ budgetClass: 'cheap' }));

    assert.equal(result.fallbackUsed, true);
    assert.deepEqual(result.output, {});
    assert.equal(invoked, false);
  });

  it('enforces daily and session budgets independently', async () => {
    const { repo } = createInvocationRepo({ dailyTokens: 10 });
    const engine = new CognitiveEngine({
      llmClient: createLlmClient(async () => ({
        content: JSON.stringify({
          answer: 'ok',
          confidence: 0.6,
          evidenceIds: [],
        }),
        usage: { inputTokens: 15, outputTokens: 10, totalTokens: 25 },
      })),
      invocationRepo: repo,
      config: createConfig({ dailyTokenBudget: 100, sessionTokenBudget: 40 }),
      logger: createLogger(),
    });

    const first = await engine.runTask(createTask({ budgetClass: 'balanced' }));
    const second = await engine.runTask(createTask({ taskType: 'second-task', budgetClass: 'balanced' }));

    assert.equal(first.fallbackUsed, false);
    assert.equal(second.fallbackUsed, true);
    assert.equal(engine.getUsage().sessionTokens, 25);
  });

  it('uses heuristic fallback when the llm client is unavailable', async () => {
    const { repo } = createInvocationRepo();
    const engine = new CognitiveEngine({
      llmClient: createLlmClient(),
      invocationRepo: repo,
      config: createConfig(),
      logger: createLogger(),
    });

    const result = await engine.runTask(createTask());

    assert.equal(result.fallbackUsed, true);
    assert.deepEqual(result.evidenceIds, []);
    assert.equal(result.confidence, 0);
  });
});
