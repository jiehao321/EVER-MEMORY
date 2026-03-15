import assert from 'node:assert/strict';
import test from 'node:test';
import { NoOpEmbeddingProvider } from '../../src/embedding/provider.js';

test('NoOpEmbeddingProvider exposes the current fallback contract', async () => {
  const provider = new NoOpEmbeddingProvider();

  assert.equal(provider.kind, 'none');
  assert.equal(provider.dimensions, 0);
  assert.equal(provider.isReady(), false);
  assert.deepEqual(await provider.embed(['hello']), []);
  assert.deepEqual(await provider.embed([]), []);

  await assert.doesNotReject(async () => provider.dispose());
});
