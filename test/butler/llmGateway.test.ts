import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { LlmRequest } from '../../src/core/butler/types.js';
import { ProviderDirectLlmGateway } from '../../src/openclaw/llmGateway.js';
import type { PiAiModel, PiAiContext, PiAiAssistantMessage, ResolvedAuth } from '../../src/openclaw/llmGateway.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createLogger() {
  const logs: { level: string; message: string; meta?: Record<string, unknown> }[] = [];
  return {
    logger: {
      info: (msg: string, meta?: Record<string, unknown>) => { logs.push({ level: 'info', message: msg, meta }); },
      warn: (msg: string, meta?: Record<string, unknown>) => { logs.push({ level: 'warn', message: msg, meta }); },
      error: (msg: string, meta?: Record<string, unknown>) => { logs.push({ level: 'error', message: msg, meta }); },
    },
    logs,
  };
}

function createRequest(overrides: Partial<LlmRequest> = {}): LlmRequest {
  return {
    purpose: overrides.purpose ?? 'test-purpose',
    caller: overrides.caller ?? { pluginId: 'evermemory', component: 'gateway-test' },
    mode: overrides.mode ?? 'background',
    priority: overrides.priority ?? 'normal',
    timeoutMs: overrides.timeoutMs ?? 5000,
    messages: overrides.messages ?? [{ role: 'user', content: 'hello' }],
    responseFormat: overrides.responseFormat,
    modelHint: overrides.modelHint,
    budget: overrides.budget,
    privacy: overrides.privacy,
    idempotencyKey: overrides.idempotencyKey,
    traceId: overrides.traceId ?? `trace-${randomUUID()}`,
  };
}

function createMockModel(provider = 'anthropic', modelId = 'claude-sonnet-4-6'): PiAiModel {
  return {
    id: modelId,
    name: modelId,
    api: 'anthropic-messages',
    provider,
    baseUrl: 'https://api.anthropic.com',
    maxTokens: 4096,
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200000,
  };
}

function createMockComplete(response: Partial<PiAiAssistantMessage> = {}) {
  const calls: { model: PiAiModel; context: PiAiContext; options?: Record<string, unknown> }[] = [];
  const completeFn = async (model: PiAiModel, context: PiAiContext, options?: Record<string, unknown>): Promise<PiAiAssistantMessage> => {
    calls.push({ model, context, options });
    return {
      content: response.content ?? [{ type: 'text', text: 'ok' }],
      usage: response.usage ?? { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      model: response.model ?? model.id,
      stopReason: response.stopReason ?? 'stop',
    };
  };
  return { completeFn, calls };
}

function createGatewayDefaults(overrides: Partial<{
  resolveApiKey: (p: string) => Promise<ResolvedAuth>;
  applyAuth: (m: PiAiModel, a: ResolvedAuth) => PiAiModel;
  getModel: (p: string, id: string) => PiAiModel | undefined;
  complete: typeof createMockComplete extends (...a: never[]) => { completeFn: infer T } ? T : never;
  defaultProvider: string;
  defaultModel: string;
}> = {}) {
  const { completeFn, calls } = createMockComplete();
  return {
    options: {
      resolveApiKey: overrides.resolveApiKey ?? (async () => ({ apiKey: 'test-key' })),
      applyAuth: overrides.applyAuth ?? ((model: PiAiModel) => model),
      getModel: overrides.getModel ?? (() => createMockModel()),
      complete: overrides.complete ?? completeFn,
      defaultProvider: overrides.defaultProvider ?? 'anthropic',
      defaultModel: overrides.defaultModel ?? 'claude-sonnet-4-6',
    },
    calls,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('privacy intercept: local_only returns unavailable without calling resolveApiKey', async () => {
  let resolveApiKeyCalled = false;
  const { logger } = createLogger();
  const { options } = createGatewayDefaults({
    resolveApiKey: async () => { resolveApiKeyCalled = true; return { apiKey: 'should-not-reach' }; },
  });

  const gateway = new ProviderDirectLlmGateway({ ...options, logger });
  const response = await gateway.invoke(createRequest({ privacy: { level: 'local_only' } }));

  assert.equal(resolveApiKeyCalled, false, 'resolveApiKey must not be called for local_only');
  assert.equal(response.provider, 'unavailable');
  assert.equal(response.content, '');
});

test('pi-ai complete: passes messages and system content correctly', async () => {
  const { logger } = createLogger();
  const { completeFn, calls } = createMockComplete({
    content: [{ type: 'text', text: '{"answer":"yes"}' }],
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    model: 'claude-sonnet-4-6',
  });
  const { options } = createGatewayDefaults({ complete: completeFn });

  const gateway = new ProviderDirectLlmGateway({ ...options, logger });
  const request = createRequest({
    messages: [
      { role: 'system', content: 'you are helpful' },
      { role: 'user', content: 'hello world' },
    ],
  });
  await gateway.invoke(request);

  assert.equal(calls.length, 1);
  const ctx = calls[0].context;
  assert.equal((ctx as unknown as Record<string, unknown>).system, 'you are helpful');
  assert.equal(ctx.messages.length, 1);
  assert.equal(ctx.messages[0].role, 'user');
  assert.equal(ctx.messages[0].content, 'hello world');
});

test('result mapping: pi-ai response maps to correct LlmResponse fields', async () => {
  const { logger } = createLogger();
  const { completeFn } = createMockComplete({
    content: [{ type: 'text', text: '{"value":1}' }],
    usage: { inputTokens: 20, outputTokens: 8, totalTokens: 28 },
    model: 'claude-sonnet-4-6',
  });
  const { options } = createGatewayDefaults({ complete: completeFn });

  const gateway = new ProviderDirectLlmGateway({ ...options, logger });
  const response = await gateway.invoke(createRequest());

  assert.equal(response.content, '{"value":1}');
  assert.deepEqual(response.parsed, { value: 1 });
  assert.equal(response.provider, 'anthropic');
  assert.equal(response.model, 'claude-sonnet-4-6');
  assert.equal(response.usage?.inputTokens, 20);
  assert.equal(response.usage?.outputTokens, 8);
  assert.equal(response.usage?.totalTokens, 28);
  assert.ok(typeof response.latencyMs === 'number' && response.latencyMs >= 0);
});

test('applyAuth: auth is applied to model before calling complete', async () => {
  const { logger } = createLogger();
  let appliedAuth: ResolvedAuth | undefined;
  const { completeFn } = createMockComplete();
  const { options } = createGatewayDefaults({
    resolveApiKey: async () => ({ apiKey: 'oauth-key', source: 'profile', mode: 'token' }),
    applyAuth: (model, auth) => { appliedAuth = auth; return { ...model, headers: { authorization: `Bearer ${auth.apiKey}` } }; },
    complete: completeFn,
  });

  const gateway = new ProviderDirectLlmGateway({ ...options, logger });
  await gateway.invoke(createRequest());

  assert.ok(appliedAuth);
  assert.equal(appliedAuth.apiKey, 'oauth-key');
  assert.equal(appliedAuth.mode, 'token');
});

test('no API key: resolveApiKey returns empty object → unavailable with authFailed = true', async () => {
  const { logger } = createLogger();
  const { options } = createGatewayDefaults({
    resolveApiKey: async () => ({}),
  });

  const gateway = new ProviderDirectLlmGateway({ ...options, logger });
  const response = await gateway.invoke(createRequest());

  assert.equal(response.provider, 'unavailable');
  assert.equal(response.content, '');
  assert.equal(gateway.authFailed, true);
});

test('timeout: complete slower than timeoutMs → error response, no throw', async () => {
  const { logger } = createLogger();
  const slowComplete = async (_m: PiAiModel, _c: PiAiContext, opts?: Record<string, unknown>): Promise<PiAiAssistantMessage> => {
    const signal = opts?.signal as AbortSignal | undefined;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 500);
      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('The operation was aborted', 'AbortError'));
      });
    });
    return { content: [{ type: 'text', text: 'late' }] };
  };
  const { options } = createGatewayDefaults({ complete: slowComplete });

  const gateway = new ProviderDirectLlmGateway({ ...options, logger });
  const request = createRequest({ timeoutMs: 50 });
  const response = await gateway.invoke(request);

  assert.equal(response.provider, 'error');
  assert.equal(response.content, '');
});

test('complete error with 401: marks authFailed', async () => {
  const { logger } = createLogger();
  const failingComplete = async (): Promise<PiAiAssistantMessage> => {
    throw new Error('401 Unauthorized: invalid api key');
  };
  const { options } = createGatewayDefaults({ complete: failingComplete });

  const gateway = new ProviderDirectLlmGateway({ ...options, logger });
  const response = await gateway.invoke(createRequest());

  assert.equal(response.provider, 'error');
  assert.equal(gateway.authFailed, true);
});

test('model not found: getModel returns undefined → unavailable response', async () => {
  const { logger } = createLogger();
  const { options } = createGatewayDefaults({
    getModel: () => undefined,
  });

  const gateway = new ProviderDirectLlmGateway({ ...options, logger });
  const response = await gateway.invoke(createRequest());

  assert.equal(response.provider, 'unavailable');
  assert.equal(response.content, '');
});

test('model tier routing: cheap/balanced/strong with custom modelTiers → correct model used', async () => {
  const { logger } = createLogger();
  const capturedModels: string[] = [];
  const trackingComplete = async (model: PiAiModel): Promise<PiAiAssistantMessage> => {
    capturedModels.push(model.id);
    return { content: [{ type: 'text', text: 'ok' }], usage: { inputTokens: 1, outputTokens: 1 } };
  };
  const { options } = createGatewayDefaults({
    getModel: (_provider, modelId) => createMockModel('anthropic', modelId),
    complete: trackingComplete,
  });

  const gateway = new ProviderDirectLlmGateway({
    ...options,
    modelTiers: {
      cheap: { provider: 'anthropic', model: 'claude-cheap-test' },
      balanced: { provider: 'anthropic', model: 'claude-balanced-test' },
      strong: { provider: 'anthropic', model: 'claude-strong-test' },
    },
    logger,
  });

  await gateway.invoke(createRequest({ modelHint: { tier: 'cheap' } }));
  await gateway.invoke(createRequest({ modelHint: { tier: 'balanced' } }));
  await gateway.invoke(createRequest({ modelHint: { tier: 'strong' } }));

  assert.deepEqual(capturedModels, [
    'claude-cheap-test',
    'claude-balanced-test',
    'claude-strong-test',
  ]);
});

test('defaultProvider getter: returns configured provider', () => {
  const { options } = createGatewayDefaults({ defaultProvider: 'openai' });
  const { logger } = createLogger();
  const gateway = new ProviderDirectLlmGateway({ ...options, logger });
  assert.equal(gateway.defaultProvider, 'openai');
});

test('authVerified: set to true after successful complete call', async () => {
  const { logger } = createLogger();
  const { options } = createGatewayDefaults();
  const gateway = new ProviderDirectLlmGateway({ ...options, logger });

  assert.equal(gateway.authVerified, false);
  await gateway.invoke(createRequest());
  assert.equal(gateway.authVerified, true);
});

test('authFailed recovery: after 401 then successful call → authFailed=false, authVerified=true', async () => {
  const { logger } = createLogger();
  let callCount = 0;
  const flippingComplete = async (model: PiAiModel): Promise<PiAiAssistantMessage> => {
    callCount++;
    if (callCount === 1) {
      throw new Error('401 Unauthorized: expired token');
    }
    return { content: [{ type: 'text', text: 'ok' }], usage: { inputTokens: 1, outputTokens: 1 } };
  };
  const { options } = createGatewayDefaults({ complete: flippingComplete });

  const gateway = new ProviderDirectLlmGateway({ ...options, logger });

  await gateway.invoke(createRequest());
  assert.equal(gateway.authFailed, true, 'authFailed should be true after 401');
  assert.ok(gateway.lastAuthError?.includes('401'), 'lastAuthError should contain 401');

  await gateway.invoke(createRequest());
  assert.equal(gateway.authFailed, false, 'authFailed should reset to false after success');
  assert.equal(gateway.authVerified, true, 'authVerified should be true after success');
  assert.equal(gateway.lastAuthError, undefined, 'lastAuthError should be cleared after success');
});

test('lastAuthError: no api key → lastAuthError contains provider and mode info', async () => {
  const { logger, logs } = createLogger();
  const { options } = createGatewayDefaults({
    resolveApiKey: async () => ({ mode: 'oauth', source: 'profile' }),
  });

  const gateway = new ProviderDirectLlmGateway({ ...options, logger });
  await gateway.invoke(createRequest());

  assert.equal(gateway.authFailed, true);
  assert.ok(gateway.lastAuthError?.includes('provider=anthropic'), 'lastAuthError should contain provider');
  assert.ok(gateway.lastAuthError?.includes('mode=oauth'), 'lastAuthError should contain mode');
  assert.ok(gateway.lastAuthError?.includes('source=profile'), 'lastAuthError should contain source');

  const warnLogs = logs.filter(l => l.level === 'warn' && l.message.includes('no api key'));
  assert.ok(warnLogs.length > 0, 'warn log should be emitted for missing api key');
});

test('applyAuth fallback: anthropic provider uses x-api-key header', async () => {
  const { logger } = createLogger();
  let capturedModel: PiAiModel | undefined;
  const capturingComplete = async (model: PiAiModel): Promise<PiAiAssistantMessage> => {
    capturedModel = model;
    return { content: [{ type: 'text', text: 'ok' }], usage: { inputTokens: 1, outputTokens: 1 } };
  };
  const { options } = createGatewayDefaults({
    resolveApiKey: async () => ({ apiKey: 'sk-ant-api-test-key' }),
    applyAuth: (model, auth) => {
      const headers = (model.headers ?? {}) as Record<string, string>;
      if (auth.apiKey?.startsWith('sk-ant-o')) {
        return { ...model, headers: { ...headers, authorization: `Bearer ${auth.apiKey}` } };
      }
      if (model.provider === 'anthropic') {
        return { ...model, headers: { ...headers, 'x-api-key': auth.apiKey! } };
      }
      return { ...model, headers: { ...headers, authorization: `Bearer ${auth.apiKey}` } };
    },
    complete: capturingComplete,
  });

  const gateway = new ProviderDirectLlmGateway({ ...options, logger });
  await gateway.invoke(createRequest());

  assert.ok(capturedModel);
  assert.equal(capturedModel.headers?.['x-api-key'], 'sk-ant-api-test-key');
  assert.equal(capturedModel.headers?.authorization, undefined);
});

test('applyAuth fallback: openai provider uses Bearer header', async () => {
  const { logger } = createLogger();
  let capturedModel: PiAiModel | undefined;
  const capturingComplete = async (model: PiAiModel): Promise<PiAiAssistantMessage> => {
    capturedModel = model;
    return { content: [{ type: 'text', text: 'ok' }], usage: { inputTokens: 1, outputTokens: 1 } };
  };
  const { options } = createGatewayDefaults({
    resolveApiKey: async () => ({ apiKey: 'sk-openai-test-key' }),
    getModel: (_p, _id) => createMockModel('openai', 'gpt-4o'),
    applyAuth: (model, auth) => {
      const headers = (model.headers ?? {}) as Record<string, string>;
      if (auth.apiKey?.startsWith('sk-ant-o')) {
        return { ...model, headers: { ...headers, authorization: `Bearer ${auth.apiKey}` } };
      }
      if (model.provider === 'anthropic') {
        return { ...model, headers: { ...headers, 'x-api-key': auth.apiKey! } };
      }
      return { ...model, headers: { ...headers, authorization: `Bearer ${auth.apiKey}` } };
    },
    complete: capturingComplete,
    defaultProvider: 'openai',
    defaultModel: 'gpt-4o',
  });

  const gateway = new ProviderDirectLlmGateway({ ...options, logger });
  await gateway.invoke(createRequest());

  assert.ok(capturedModel);
  assert.equal(capturedModel.headers?.authorization, 'Bearer sk-openai-test-key');
  assert.equal(capturedModel.headers?.['x-api-key'], undefined);
});

test('resolveApiKey throws: lastAuthError records the error message', async () => {
  const { logger } = createLogger();
  const { options } = createGatewayDefaults({
    resolveApiKey: async () => { throw new Error('Network timeout connecting to auth service'); },
  });

  const gateway = new ProviderDirectLlmGateway({ ...options, logger });
  const response = await gateway.invoke(createRequest());

  assert.equal(response.provider, 'unavailable');
  assert.equal(gateway.authFailed, true);
  assert.ok(gateway.lastAuthError?.includes('resolveApiKey threw'));
  assert.ok(gateway.lastAuthError?.includes('Network timeout'));
});
