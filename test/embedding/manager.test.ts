import assert from 'node:assert/strict';
import test from 'node:test';
import { EMBEDDING_QUEUE_LIMIT, EmbeddingManager } from '../../src/embedding/manager.js';
import type {
  EmbeddingProvider,
  EmbeddingProviderKind,
  EmbeddingVector,
} from '../../src/embedding/provider.js';

class FakeProvider implements EmbeddingProvider {
  readonly kind: EmbeddingProviderKind;
  readonly dimensions: number;
  ready = false;
  disposed = false;
  initializeCalls = 0;
  embedCalls: string[][] = [];
  embedImpl: (texts: string[]) => Promise<EmbeddingVector[]>;

  constructor(
    kind: EmbeddingProviderKind = 'openai',
    dimensions = 3,
    embedImpl?: (texts: string[]) => Promise<EmbeddingVector[]>
  ) {
    this.kind = kind;
    this.dimensions = dimensions;
    this.embedImpl =
      embedImpl ??
      (async (texts) =>
        texts.map((text, index) => ({
          values: new Float32Array([text.length, index + 1, dimensions]),
          dimensions,
        })));
  }

  isReady(): boolean {
    return this.ready;
  }

  async initialize(): Promise<void> {
    this.initializeCalls += 1;
    this.ready = true;
  }

  async embed(texts: string[]): Promise<EmbeddingVector[]> {
    this.embedCalls.push([...texts]);
    return this.embedImpl(texts);
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.ready = false;
  }
}

function setCreateProvider(manager: EmbeddingManager, factory: () => EmbeddingProvider): void {
  (
    manager as unknown as { _createProvider: () => EmbeddingProvider }
  )._createProvider = factory;
}

function setBatchDelay(manager: EmbeddingManager, delayMs: number): void {
  (manager as unknown as { _batchDelayMs: number })._batchDelayMs = delayMs;
}

test('EmbeddingManager configures a provider and becomes ready after initialization', async () => {
  const manager = new EmbeddingManager();
  const provider = new FakeProvider();
  setCreateProvider(manager, () => provider);
  setBatchDelay(manager, 0);

  manager.configure({ provider: 'openai', openaiApiKey: 'test-key' });

  assert.equal(manager.providerKind, 'none');
  assert.equal(manager.isReady(), false);

  const vector = await manager.embed('hello');

  assert.equal(provider.initializeCalls, 1);
  assert.equal(manager.providerKind, 'openai');
  assert.equal(manager.isReady(), true);
  assert.deepEqual(Array.from(vector?.values ?? []), [5, 1, 3]);

  await manager.dispose();
});

test('EmbeddingManager embedBatch returns vectors for multiple texts', async () => {
  const manager = new EmbeddingManager();
  const provider = new FakeProvider('openai', 2, async (texts) =>
    texts.map((text) => ({
      values: new Float32Array([text.length, text.length + 10]),
      dimensions: 2,
    }))
  );
  setCreateProvider(manager, () => provider);
  setBatchDelay(manager, 0);
  manager.configure({ provider: 'openai', openaiApiKey: 'test-key' });

  const vectors = await manager.embedBatch(['a', 'abcd']);

  assert.deepEqual(
    vectors.map((vector) => Array.from(vector?.values ?? [])),
    [
      [1, 11],
      [4, 14],
    ]
  );

  await manager.dispose();
});

test('EmbeddingManager falls back to NoOp when local provider initialization fails', async () => {
  const manager = new EmbeddingManager();
  const failingProvider = new FakeProvider('local');
  failingProvider.initialize = async () => {
    throw new Error('missing local dependency');
  };
  setCreateProvider(manager, () => failingProvider);
  setBatchDelay(manager, 0);
  manager.configure({ provider: 'local' });

  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((arg) => String(arg)).join(' '));
  };

  try {
    const vector = await manager.embed('hello');

    assert.equal(vector, null);
    assert.equal(manager.providerKind, 'none');
    assert.equal(manager.isReady(), false);
    assert.equal(failingProvider.disposed, true);
    assert.ok(
      warnings.some((message) =>
        message.includes('Local embedding provider failed to initialize')
      )
    );
  } finally {
    console.warn = originalWarn;
    await manager.dispose();
  }
});

test('EmbeddingManager dispose clears provider resources and readiness', async () => {
  const manager = new EmbeddingManager();
  const provider = new FakeProvider();
  setCreateProvider(manager, () => provider);
  setBatchDelay(manager, 0);
  manager.configure({ provider: 'openai', openaiApiKey: 'test-key' });

  await manager.embed('hello');
  await manager.dispose();

  assert.equal(provider.disposed, true);
  assert.equal(manager.providerKind, 'none');
  assert.equal(manager.isReady(), false);
});

test('EmbeddingManager batches concurrent embed calls into one provider request', async () => {
  const manager = new EmbeddingManager();
  const provider = new FakeProvider('openai', 2, async (texts) => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return texts.map((text, index) => ({
      values: new Float32Array([text.length, index + 1]),
      dimensions: 2,
    }));
  });
  setCreateProvider(manager, () => provider);
  setBatchDelay(manager, 1);
  manager.configure({ provider: 'openai', openaiApiKey: 'test-key' });

  const [first, second] = await Promise.all([
    manager.embed('alpha'),
    manager.embed('beta'),
  ]);

  assert.equal(provider.embedCalls.length, 1);
  assert.deepEqual(provider.embedCalls[0], ['alpha', 'beta']);
  assert.deepEqual(Array.from(first?.values ?? []), [5, 1]);
  assert.deepEqual(Array.from(second?.values ?? []), [4, 2]);

  await manager.dispose();
});

test('EmbeddingManager applies backpressure, drops oldest queued items, and reports queue depth', async () => {
  const manager = new EmbeddingManager();
  const provider = new FakeProvider('openai', 2, async (texts) =>
    texts.map((text, index) => ({
      values: new Float32Array([text.length, index + 1]),
      dimensions: 2,
    }))
  );
  const debugEvents: Record<string, unknown>[] = [];

  setCreateProvider(manager, () => provider);
  setBatchDelay(manager, 1);
  manager.configure({
    provider: 'openai',
    openaiApiKey: 'test-key',
    onDebugEvent: (payload) => {
      debugEvents.push(payload);
    },
  });

  const pending = Array.from({ length: EMBEDDING_QUEUE_LIMIT + 3 }, (_, index) =>
    manager.embed(`item-${index}`)
  );

  assert.equal(manager.getQueueDepth(), EMBEDDING_QUEUE_LIMIT);

  const results = await Promise.all(pending);

  assert.equal(results[0], null);
  assert.equal(results[1], null);
  assert.equal(results[2], null);
  assert.ok(results[3]);
  assert.equal(provider.embedCalls.length, 1);
  assert.equal(
    debugEvents.reduce((sum, event) => sum + Number(event.dropped ?? 0), 0),
    3,
  );
  assert.ok(debugEvents.every((event) => event.stage === 'queue_backpressure'));

  await manager.dispose();
});
