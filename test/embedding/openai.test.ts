import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { OpenAIEmbeddingProvider } from '../../src/embedding/openai.js';

type MockResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
  text(): Promise<string>;
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function createProvider() {
  const provider = new OpenAIEmbeddingProvider({
    apiKey: 'test-api-key',
    model: 'text-embedding-3-small',
  });
  (provider as unknown as { _transport: 'sdk' | 'http' })._transport = 'http';
  return provider;
}

function installFetchMock(
  handler: (input: unknown, init?: RequestInit) => Promise<MockResponse>
): void {
  globalThis.fetch = handler as typeof fetch;
}

test('OpenAIEmbeddingProvider returns embedding vectors from the HTTP API', async () => {
  const provider = createProvider();
  let requestBody: { model: string; input: string[] } | null = null;

  installFetchMock(async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as {
      model: string;
      input: string[];
    };
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      async json() {
        return {
          data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }],
        };
      },
      async text() {
        return '';
      },
    };
  });

  const vectors = await provider.embed(['alpha']);

  assert.deepEqual(requestBody, {
    model: 'text-embedding-3-small',
    input: ['alpha'],
  });
  assert.equal(vectors.length, 1);
  assert.equal(vectors[0]?.dimensions, 3);
  const values = Array.from(vectors[0]?.values ?? []);
  assert.equal(values.length, 3);
  assert.ok(Math.abs(values[0]! - 0.1) < 1e-6);
  assert.ok(Math.abs(values[1]! - 0.2) < 1e-6);
  assert.ok(Math.abs(values[2]! - 0.3) < 1e-6);
});

test('OpenAIEmbeddingProvider throws on non-OK HTTP responses', async () => {
  const provider = createProvider();

  installFetchMock(async () => ({
    ok: false,
    status: 429,
    statusText: 'Too Many Requests',
    async json() {
      return {};
    },
    async text() {
      return 'rate limited';
    },
  }));

  await assert.rejects(
    async () => provider.embed(['alpha']),
    /OpenAI HTTP API error: 429 Too Many Requests rate limited/
  );
});

test('OpenAIEmbeddingProvider returns an empty array without calling fetch for empty inputs', async () => {
  const provider = createProvider();
  let called = false;

  installFetchMock(async () => {
    called = true;
    throw new Error('fetch should not be called');
  });

  const vectors = await provider.embed([]);

  assert.deepEqual(vectors, []);
  assert.equal(called, false);
});

test('OpenAIEmbeddingProvider maps batched texts to the returned vectors', async () => {
  const provider = createProvider();
  const requests: Array<{ model: string; input: string[] }> = [];

  installFetchMock(async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      model: string;
      input: string[];
    };
    requests.push(body);
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      async json() {
        return {
          data: body.input.map((text, index) => ({
            index,
            embedding: [index + 1, text.length],
          })),
        };
      },
      async text() {
        return '';
      },
    };
  });

  const vectors = await provider.embed(['alpha', 'beta', 'gamma']);

  assert.deepEqual(requests, [
    {
      model: 'text-embedding-3-small',
      input: ['alpha', 'beta', 'gamma'],
    },
  ]);
  assert.deepEqual(
    vectors.map((vector) => Array.from(vector.values)),
    [
      [1, 5],
      [2, 4],
      [3, 5],
    ]
  );
});
