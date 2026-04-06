import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import type { LlmRequest } from '../../../src/core/butler/types.js';
import { OpenAiLlmGateway } from '../../../src/core/butler/adapters/openaiGateway.js';

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
    purpose: overrides.purpose ?? 'gateway-test',
    caller: overrides.caller ?? { pluginId: 'evermemory', component: 'openai-gateway-test' },
    timeoutMs: overrides.timeoutMs ?? 1_000,
    messages: overrides.messages ?? [{ role: 'user', content: 'hello' }],
    responseFormat: overrides.responseFormat,
    modelHint: overrides.modelHint,
    budget: overrides.budget,
    privacy: overrides.privacy,
    idempotencyKey: overrides.idempotencyKey,
    traceId: overrides.traceId,
  };
}

function writeAuthFile(payload: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'openai-gateway-test-'));
  const authFile = join(dir, 'auth.json');
  writeFileSync(authFile, JSON.stringify(payload), 'utf8');
  return authFile;
}

function createSuccessResponse(content = 'ok') {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      id: 'chatcmpl-test',
      model: 'gpt-4o-mini',
      choices: [
        {
          message: {
            role: 'assistant',
            content,
          },
        },
      ],
      usage: {
        prompt_tokens: 11,
        completion_tokens: 7,
        total_tokens: 18,
      },
    }),
  } as Response;
}

test('auth loading prefers config.apiKey over env and auth file', async (t) => {
  const authFile = writeAuthFile({
    OPENAI_API_KEY: 'auth-file-api-key',
    tokens: { access_token: 'auth-file-access-token' },
  });
  t.after(() => rmSync(dirname(authFile), { recursive: true, force: true }));

  const originalEnv = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = 'env-api-key';

  let authorization = '';
  globalThis.fetch = async (_input, init) => {
    authorization = new Headers(init?.headers).get('authorization') ?? '';
    return createSuccessResponse();
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalEnv;
    }
  });

  const gateway = new OpenAiLlmGateway({
    apiKey: 'config-api-key',
    authFile,
  }, createLogger());

  await gateway.invoke(createRequest());

  assert.equal(authorization, 'Bearer config-api-key');
});

test('auth loading uses env OPENAI_API_KEY when config.apiKey is absent', async (t) => {
  const authFile = writeAuthFile({
    OPENAI_API_KEY: 'auth-file-api-key',
    tokens: { access_token: 'auth-file-access-token' },
  });
  t.after(() => rmSync(dirname(authFile), { recursive: true, force: true }));

  const originalEnv = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = 'env-api-key';

  let authorization = '';
  globalThis.fetch = async (_input, init) => {
    authorization = new Headers(init?.headers).get('authorization') ?? '';
    return createSuccessResponse();
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalEnv;
    }
  });

  const gateway = new OpenAiLlmGateway({
    authFile,
  }, createLogger());

  await gateway.invoke(createRequest());

  assert.equal(authorization, 'Bearer env-api-key');
});

test('auth loading falls back to auth file access token and OPENAI_API_KEY', async (t) => {
  const originalEnv = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  delete process.env.OPENAI_API_KEY;

  const authorizations: string[] = [];
  globalThis.fetch = async (_input, init) => {
    authorizations.push(new Headers(init?.headers).get('authorization') ?? '');
    return createSuccessResponse();
  };

  const accessTokenFile = writeAuthFile({
    tokens: { access_token: 'auth-file-access-token' },
  });
  const apiKeyFile = writeAuthFile({
    OPENAI_API_KEY: 'auth-file-api-key',
  });

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalEnv;
    }
    rmSync(dirname(accessTokenFile), { recursive: true, force: true });
    rmSync(dirname(apiKeyFile), { recursive: true, force: true });
  });

  const accessTokenGateway = new OpenAiLlmGateway({ authFile: accessTokenFile }, createLogger());
  await accessTokenGateway.invoke(createRequest());

  const apiKeyGateway = new OpenAiLlmGateway({ authFile: apiKeyFile }, createLogger());
  await apiKeyGateway.invoke(createRequest());

  assert.deepEqual(authorizations, [
    'Bearer auth-file-access-token',
    'Bearer auth-file-api-key',
  ]);
});

test('invoke builds the expected chat completions request', async (t) => {
  const originalFetch = globalThis.fetch;
  let url = '';
  let method = '';
  let headers: Headers | undefined;
  let body: Record<string, unknown> | undefined;

  globalThis.fetch = async (input, init) => {
    url = String(input);
    method = init?.method ?? '';
    headers = new Headers(init?.headers);
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return createSuccessResponse();
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const gateway = new OpenAiLlmGateway({
    apiKey: 'request-key',
    baseUrl: 'https://example.test/v1/',
  }, createLogger());

  await gateway.invoke(createRequest({
    messages: [
      { role: 'system', content: 'be concise' },
      { role: 'user', content: 'hello world' },
    ],
    budget: { maxOutputTokens: 321 },
    responseFormat: { type: 'json_object' },
  }));

  assert.equal(url, 'https://example.test/v1/chat/completions');
  assert.equal(method, 'POST');
  assert.equal(headers?.get('authorization'), 'Bearer request-key');
  assert.equal(headers?.get('content-type'), 'application/json');
  assert.deepEqual(body, {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'be concise' },
      { role: 'user', content: 'hello world' },
    ],
    max_tokens: 321,
    response_format: { type: 'json_object' },
  });
});

test('model tier mapping routes cheap, balanced, and strong requests to the expected models', async (t) => {
  const originalFetch = globalThis.fetch;
  const models: string[] = [];

  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { model: string };
    models.push(body.model);
    return createSuccessResponse();
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const gateway = new OpenAiLlmGateway({
    apiKey: 'model-key',
  }, createLogger());

  await gateway.invoke(createRequest({ modelHint: { tier: 'cheap' } }));
  await gateway.invoke(createRequest({ modelHint: { tier: 'balanced' } }));
  await gateway.invoke(createRequest({ modelHint: { tier: 'strong' } }));

  assert.deepEqual(models, ['gpt-4o-mini', 'gpt-4o', 'gpt-4o']);
});

test('invoke parses content, usage, and readiness on success', async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => createSuccessResponse('{"ok":true}');

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const gateway = new OpenAiLlmGateway({
    apiKey: 'parse-key',
  }, createLogger());

  assert.equal(gateway.getReadiness(), 'untested');
  assert.equal(gateway.getProvider(), 'openai');

  const response = await gateway.invoke(createRequest({
    responseFormat: { type: 'json_object' },
  }));

  assert.equal(response.content, '{"ok":true}');
  assert.deepEqual(response.parsed, { ok: true });
  assert.deepEqual(response.usage, {
    inputTokens: 11,
    outputTokens: 7,
    totalTokens: 18,
  });
  assert.equal(response.model, 'gpt-4o-mini');
  assert.equal(response.provider, 'openai');
  assert.equal(gateway.getReadiness(), 'ready');
  assert.equal(gateway.getLastAuthError(), undefined);
});

test('network errors return an error-shaped response and mark readiness unavailable', async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('socket hang up');
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const gateway = new OpenAiLlmGateway({
    apiKey: 'error-key',
  }, createLogger());

  const response = await gateway.invoke(createRequest());

  assert.equal(response.provider, 'error');
  assert.equal(response.content, '');
  assert.equal(gateway.getReadiness(), 'unavailable');
  assert.match(gateway.getLastAuthError() ?? '', /socket hang up/);
});

test('timeout aborts the fetch via AbortController', async (t) => {
  const originalFetch = globalThis.fetch;
  let aborted = false;

  globalThis.fetch = async (_input, init) => {
    const signal = init?.signal;
    await new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => {
        aborted = true;
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      });
    });
    return createSuccessResponse();
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const gateway = new OpenAiLlmGateway({
    apiKey: 'timeout-key',
  }, createLogger());

  const response = await gateway.invoke(createRequest({ timeoutMs: 10 }));

  assert.equal(aborted, true);
  assert.equal(response.provider, 'error');
  assert.equal(gateway.getReadiness(), 'unavailable');
});
