import assert from 'node:assert/strict';
import test from 'node:test';
import { EmbeddingManager } from '../../src/embedding/manager.js';
import { initializeEverMemory } from '../../src/index.js';
import { embeddingManager } from '../../src/embedding/manager.js';
import { createTempDbPath } from '../helpers.js';

test('warmup returns ready=false when provider is none (default)', async () => {
  const manager = new EmbeddingManager();

  const result = await manager.warmup();

  assert.equal(result.ready, false);
  await manager.dispose();
});

test('warmup returns elapsedMs >= 0', async () => {
  const manager = new EmbeddingManager();

  const result = await manager.warmup();

  assert.equal(typeof result.elapsedMs, 'number');
  assert.ok(result.elapsedMs >= 0, `expected elapsedMs >= 0, got ${result.elapsedMs}`);
  await manager.dispose();
});

test('warmup returns provider kind string', async () => {
  const manager = new EmbeddingManager();

  const result = await manager.warmup();

  assert.equal(typeof result.provider, 'string');
  assert.equal(result.provider, 'none');
  await manager.dispose();
});

test('initializeEverMemory configures embedding manager using env default', async () => {
  const originalProvider = process.env.EVERMEMORY_EMBEDDING_PROVIDER;
  const originalConfigure = embeddingManager.configure.bind(embeddingManager);
  const calls: Array<{ provider: string }> = [];
  embeddingManager.configure = ((config: { provider: 'local' | 'openai' | 'none' }) => {
    calls.push({ provider: config.provider });
    return originalConfigure(config);
  }) as typeof embeddingManager.configure;
  delete process.env.EVERMEMORY_EMBEDDING_PROVIDER;

  const app = initializeEverMemory({ databasePath: createTempDbPath('init-embedding-default') });

  try {
    assert.equal(calls.at(-1)?.provider, 'local');
  } finally {
    app.database.connection.close();
    await embeddingManager.dispose();
    embeddingManager.configure = originalConfigure;
    if (originalProvider === undefined) {
      delete process.env.EVERMEMORY_EMBEDDING_PROVIDER;
    } else {
      process.env.EVERMEMORY_EMBEDDING_PROVIDER = originalProvider;
    }
  }
});

test('initializeEverMemory dispose waits for warmup before closing the database', async () => {
  const originalWarmup = embeddingManager.warmup.bind(embeddingManager);
  let releaseWarmup: (() => void) | undefined;
  let warmupStarted = false;
  embeddingManager.warmup = (async () => {
    warmupStarted = true;
    await new Promise<void>((resolve) => {
      releaseWarmup = resolve;
    });
    return {
      ready: false,
      provider: 'none',
      elapsedMs: 0,
    };
  }) as typeof embeddingManager.warmup;

  const app = initializeEverMemory({ databasePath: createTempDbPath('init-embedding-dispose') });
  const disposePromise = app.dispose();
  let settled = false;
  void disposePromise.then(() => {
    settled = true;
  });
  await Promise.resolve();

  try {
    assert.equal(warmupStarted, true);
    assert.equal(settled, false);
    releaseWarmup?.();
    await disposePromise;
    assert.equal(app.database.connection.open, false);
  } finally {
    embeddingManager.warmup = originalWarmup;
    await embeddingManager.dispose();
  }
});
