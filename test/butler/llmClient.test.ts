import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { LlmGateway, LlmRequest, LlmResponse } from '../../src/core/butler/types.js';
import { ButlerLlmClient } from '../../src/core/butler/llmClient.js';

function createLogger() {
  return {
    info: (_message: string, _meta?: Record<string, unknown>) => undefined,
    warn: (_message: string, _meta?: Record<string, unknown>) => undefined,
    error: (_message: string, _meta?: Record<string, unknown>) => undefined,
    debug: (_message: string, _meta?: Record<string, unknown>) => undefined,
  };
}

function createRequest(overrides: Partial<LlmRequest> = {}): LlmRequest {
  return {
    purpose: overrides.purpose ?? 'butler-test',
    caller: overrides.caller ?? { pluginId: 'evermemory', component: 'llm-client-test' },
    mode: overrides.mode ?? 'background',
    priority: overrides.priority ?? 'normal',
    timeoutMs: overrides.timeoutMs ?? 1_000,
    messages: overrides.messages ?? [{ role: 'user', content: 'hello' }],
    responseFormat: overrides.responseFormat,
    modelHint: overrides.modelHint,
    budget: overrides.budget,
    privacy: overrides.privacy,
    idempotencyKey: overrides.idempotencyKey,
    traceId: overrides.traceId ?? 'trace-1',
  };
}

describe('ButlerLlmClient', () => {
  it('prefers explicit gateway readiness metadata methods when available', () => {
    const gateway = {
      invoke: async (_request: LlmRequest): Promise<LlmResponse> => ({ content: 'ok', provider: 'openai' }),
      getReadiness: () => 'untested' as const,
      getProvider: () => 'gateway-method',
      getLastAuthError: () => 'auth pending',
      authFailed: false,
      authVerified: true,
      defaultProvider: 'openai',
      lastAuthError: undefined,
    } satisfies LlmGateway & Record<string, unknown>;
    const client = new ButlerLlmClient({
      gateway,
      logger: createLogger(),
    });

    assert.equal(client.isAvailable(), true);
    assert.equal(client.getReadiness(), 'untested');
    assert.equal(client.getProvider(), 'gateway-method');
    assert.equal(client.getLastAuthError(), 'auth pending');
  });

  it('detects legacy bridge mode when no gateway is present', async () => {
    const client = new ButlerLlmClient({
      llmBridge: async (messages) => JSON.stringify({ count: messages.length }),
      logger: createLogger(),
    });

    const response = await client.invoke(createRequest({
      messages: [
        { role: 'system', content: 'behave' },
        { role: 'user', content: 'hello' },
      ],
    }));

    assert.equal(client.isAvailable(), true);
    assert.equal(client.getReadiness(), 'ready');
    assert.equal(client.getProvider(), undefined);
    assert.equal(response.provider, 'legacy_bridge');
    assert.equal(response.content, '{"count":2}');
    assert.deepEqual(response.usage, { inputTokens: 0, outputTokens: 0, totalTokens: 0 });
  });

  it('prefers the gateway transport when both gateway and legacy bridge are available', async () => {
    let gatewayCalls = 0;
    let bridgeCalls = 0;
    const client = new ButlerLlmClient({
      gateway: {
        invoke: async (_request): Promise<LlmResponse> => {
          gatewayCalls += 1;
          return { content: '{"source":"gateway"}', parsed: { source: 'gateway' }, provider: 'gateway' };
        },
      },
      llmBridge: async () => {
        bridgeCalls += 1;
        return 'bridge';
      },
      logger: createLogger(),
    });

    const response = await client.invoke(createRequest());

    assert.equal(client.isAvailable(), true);
    assert.equal(response.provider, 'gateway');
    assert.deepEqual(response.parsed, { source: 'gateway' });
    assert.equal(gatewayCalls, 1);
    assert.equal(bridgeCalls, 0);
  });

  it('returns an unavailable-shaped response when no transport exists', async () => {
    const client = new ButlerLlmClient({ logger: createLogger() });

    const response = await client.invoke(createRequest());

    assert.equal(client.isAvailable(), false);
    assert.equal(client.getReadiness(), 'unavailable');
    assert.equal(client.getProvider(), undefined);
    assert.equal(response.provider, 'unavailable');
    assert.equal(response.content, '');
  });

  it('reports auth failures from provider gateways as unavailable', () => {
    const gateway = {
      invoke: async (_request: LlmRequest): Promise<LlmResponse> => ({ content: '' }),
      authFailed: true,
      authVerified: false,
      defaultProvider: 'anthropic',
      lastAuthError: 'missing api key',
    } as LlmGateway & Record<string, unknown>;
    const client = new ButlerLlmClient({
      gateway,
      logger: createLogger(),
    });

    assert.equal(client.isAvailable(), true);
    assert.equal(client.getReadiness(), 'unavailable');
    assert.equal(client.getProvider(), 'anthropic');
    assert.equal(client.getLastAuthError(), 'missing api key');
  });

  it('returns an error-shaped response when the call fails', async () => {
    const client = new ButlerLlmClient({
      gateway: {
        invoke: async () => {
          throw new Error('boom');
        },
      },
      logger: createLogger(),
    });

    const response = await client.invoke(createRequest());

    assert.equal(response.provider, 'error');
    assert.equal(response.content, '');
    assert.deepEqual(response.usage, { inputTokens: 0, outputTokens: 0, totalTokens: 0 });
  });
});
