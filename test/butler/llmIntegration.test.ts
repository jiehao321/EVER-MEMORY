import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type {
  CognitiveTask,
  LlmGateway,
  LlmMessage,
  LlmRequest,
  LlmResponse,
} from '../../src/core/butler/types.js';
import { ButlerLlmClient } from '../../src/core/butler/llmClient.js';
import { CognitiveEngine } from '../../src/core/butler/cognition.js';

function createLogger() {
  return {
    info: (..._args: unknown[]) => undefined,
    warn: (..._args: unknown[]) => undefined,
    error: (..._args: unknown[]) => undefined,
    debug: (..._args: unknown[]) => undefined,
  };
}

function createRequest(overrides: Partial<LlmRequest> = {}): LlmRequest {
  return {
    purpose: overrides.purpose ?? 'test-purpose',
    caller: overrides.caller ?? { pluginId: 'evermemory', component: 'butler-test' },
    mode: overrides.mode ?? 'background',
    priority: overrides.priority ?? 'normal',
    timeoutMs: overrides.timeoutMs ?? 1500,
    messages: overrides.messages ?? [{ role: 'user', content: 'hello' }],
    responseFormat: overrides.responseFormat,
    modelHint: overrides.modelHint,
    budget: overrides.budget,
    privacy: overrides.privacy,
    idempotencyKey: overrides.idempotencyKey,
    traceId: overrides.traceId ?? `trace-${randomUUID()}`,
  };
}

function createTask<T>(overrides: Partial<CognitiveTask<T>> = {}): CognitiveTask<T> {
  return {
    taskType: overrides.taskType ?? 'overlay-analysis',
    evidence: overrides.evidence ?? { summary: 'phase 2 is in progress', evidenceIds: ['ev-1'] },
    outputSchema: overrides.outputSchema,
    latencyClass: overrides.latencyClass ?? 'background',
    privacyClass: overrides.privacyClass ?? 'local_only',
    budgetClass: overrides.budgetClass ?? 'balanced',
  };
}

class InvocationRepoStub {
  public readonly inserted: Array<Record<string, unknown>> = [];
  public dailyUsage = { totalTokens: 0, count: 0 };
  public sessionUsage = new Map<string, { totalTokens: number; count: number }>();

  insert(invocation: Record<string, unknown>): string {
    const snapshot = { ...invocation };
    this.inserted.push(snapshot);
    const totalTokens = (
      (typeof snapshot.promptTokens === 'number' ? snapshot.promptTokens : 0) +
      (typeof snapshot.completionTokens === 'number' ? snapshot.completionTokens : 0)
    );
    this.dailyUsage = {
      totalTokens: this.dailyUsage.totalTokens + totalTokens,
      count: this.dailyUsage.count + 1,
    };
    if (typeof snapshot.traceId === 'string') {
      const previous = this.sessionUsage.get(snapshot.traceId) ?? { totalTokens: 0, count: 0 };
      this.sessionUsage.set(snapshot.traceId, {
        totalTokens: previous.totalTokens + totalTokens,
        count: previous.count + 1,
      });
    }
    return `inv-${this.inserted.length}`;
  }

  getDailyUsage(_date?: string): { totalTokens: number; count: number } {
    return this.dailyUsage;
  }

  getSessionUsage(sessionId: string): { totalTokens: number; count: number } {
    return this.sessionUsage.get(sessionId) ?? { totalTokens: 0, count: 0 };
  }
}

test('ButlerLlmClient delegates invoke to gateway', async () => {
  let seenRequest: LlmRequest | undefined;
  const gateway: LlmGateway = {
    async invoke(request) {
      seenRequest = request;
      return {
        content: '{"ok":true}',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        model: 'gateway-model',
        provider: 'test-provider',
      };
    },
  };

  const client = new ButlerLlmClient({ gateway, logger: createLogger() });
  const request = createRequest();
  const response = await client.invoke(request);

  assert.equal(client.available, true);
  assert.equal(client.isAvailable(), true);
  assert.deepEqual(seenRequest, request);
  assert.equal(response.content, '{"ok":true}');
  assert.equal(response.model, 'gateway-model');
});

test('ButlerLlmClient wraps legacy llmBridge callback', async () => {
  let bridgeMessages: LlmMessage[] | undefined;
  const client = new ButlerLlmClient({
    llmBridge: async (messages: LlmMessage[]) => {
      bridgeMessages = messages;
      return '{"wrapped":true}';
    },
    logger: createLogger(),
  });

  const request = createRequest({
    messages: [
      { role: 'system', content: 'system message' },
      { role: 'user', content: 'user message' },
    ],
  });
  const response = await client.invoke(request);

  assert.equal(client.available, true);
  assert.deepEqual(bridgeMessages, request.messages);
  assert.equal(response.content, '{"wrapped":true}');
  assert.equal(response.provider, 'legacy_bridge');
});

test('ButlerLlmClient reports unavailable state without transport', async () => {
  const client = new ButlerLlmClient({ logger: createLogger() });

  assert.equal(client.available, false);
  assert.equal(client.isAvailable(), false);

  const response = await client.invoke(createRequest());
  assert.equal(response.content, '');
  assert.equal(response.provider, 'unavailable');
  assert.equal(response.usage?.totalTokens ?? 0, 0);
});

test('ButlerLlmClient catches invoke errors and never throws', async () => {
  const client = new ButlerLlmClient({
    gateway: {
      async invoke() {
        throw new Error('gateway exploded');
      },
    },
    logger: createLogger(),
  });

  const response = await client.invoke(createRequest());

  assert.equal(response.content, '');
  assert.equal(response.provider, 'error');
  assert.equal(response.parsed, null);
});

test('CognitiveEngine.runTask returns parsed output and records invocation', async () => {
  const invocationRepo = new InvocationRepoStub();
  const client = new ButlerLlmClient({
    gateway: {
      async invoke(request: LlmRequest) {
        assert.equal(request.modelHint?.tier, 'strong');
        assert.equal(request.mode, 'foreground');
        assert.equal(request.privacy?.level, 'cloud_allowed');
        assert.equal(request.responseFormat?.type, 'json_schema');
        assert.equal(request.messages[0]?.role, 'system');
        assert.equal(request.messages[1]?.role, 'user');
        return {
          content: JSON.stringify({
            summary: 'Need to finish Step 2',
            confidence: 0.86,
            evidenceIds: ['ev-1'],
          }),
          usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
          model: 'strong-model',
          provider: 'gateway',
          latencyMs: 45,
          cacheHit: false,
        };
      },
    },
    logger: createLogger(),
  });
  const engine = new CognitiveEngine({
    llmClient: client,
    invocationRepo,
    config: {
      dailyTokenBudget: 100,
      sessionTokenBudget: 80,
      taskTimeoutMs: 2500,
      fallbackToHeuristics: true,
    },
    logger: createLogger(),
  });

  const result = await engine.runTask<{
    summary: string;
    confidence: number;
    evidenceIds: string[];
  }>(createTask({
    latencyClass: 'foreground',
    privacyClass: 'cloud_allowed',
    budgetClass: 'strong',
    outputSchema: {
      type: 'object',
      required: ['summary', 'confidence', 'evidenceIds'],
      properties: {
        summary: { type: 'string' },
        confidence: { type: 'number' },
        evidenceIds: { type: 'array' },
      },
    },
  }));

  assert.equal(result.fallbackUsed, false);
  assert.equal(result.output.summary, 'Need to finish Step 2');
  assert.equal(result.confidence, 0.86);
  assert.deepEqual(result.evidenceIds, ['ev-1']);
  assert.equal(result.usage?.totalTokens, 30);
  assert.equal(invocationRepo.inserted.length, 1);
  assert.equal(invocationRepo.inserted[0]?.success, true);
});

test('CognitiveEngine.runTask uses fallback when LLM is unavailable', async () => {
  const invocationRepo = new InvocationRepoStub();
  const engine = new CognitiveEngine({
    llmClient: new ButlerLlmClient({ logger: createLogger() }),
    invocationRepo,
    config: {
      dailyTokenBudget: 100,
      sessionTokenBudget: 50,
      taskTimeoutMs: 1000,
      fallbackToHeuristics: true,
    },
    logger: createLogger(),
  });

  const result = await engine.runTask<{ summary?: string }>(createTask());

  assert.equal(result.fallbackUsed, true);
  assert.deepEqual(result.output, {});
  assert.equal(result.confidence, 0);
  assert.deepEqual(result.evidenceIds, []);
  assert.equal(invocationRepo.inserted.length, 0);
});

test('CognitiveEngine.canAfford enforces budget limits', () => {
  const invocationRepo = new InvocationRepoStub();
  invocationRepo.dailyUsage = { totalTokens: 95, count: 2 };
  const engine = new CognitiveEngine({
    llmClient: new ButlerLlmClient({
      gateway: { invoke: async () => ({ content: '{}' }) },
      logger: createLogger(),
    }),
    invocationRepo,
    config: {
      dailyTokenBudget: 100,
      sessionTokenBudget: 50,
      taskTimeoutMs: 1000,
      fallbackToHeuristics: true,
    },
    logger: createLogger(),
  });

  assert.equal(engine.canAfford(createTask()), false);
});

test('CognitiveEngine tracks session and daily token usage', async () => {
  const invocationRepo = new InvocationRepoStub();
  invocationRepo.dailyUsage = { totalTokens: 12, count: 1 };
  const client = new ButlerLlmClient({
    gateway: {
      async invoke() {
        return {
          content: '{"confidence":0.5,"evidenceIds":[]}',
          usage: { inputTokens: 4, outputTokens: 6, totalTokens: 10 },
          model: 'balanced-model',
          provider: 'gateway',
        };
      },
    },
    logger: createLogger(),
  });
  const engine = new CognitiveEngine({
    llmClient: client,
    invocationRepo,
    config: {
      dailyTokenBudget: 100,
      sessionTokenBudget: 50,
      taskTimeoutMs: 1000,
      fallbackToHeuristics: true,
    },
    logger: createLogger(),
  });

  const before = engine.getUsage();
  assert.deepEqual(before, {
    dailyTokens: 12,
    sessionTokens: 0,
    dailyBudget: 100,
    sessionBudget: 50,
  });

  await engine.runTask(createTask());

  const after = engine.getUsage();
  assert.deepEqual(after, {
    dailyTokens: 22,
    sessionTokens: 10,
    dailyBudget: 100,
    sessionBudget: 50,
  });
});
