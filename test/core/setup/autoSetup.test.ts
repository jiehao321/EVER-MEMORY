import test from 'node:test';
import assert from 'node:assert/strict';
import { runAutoSetup } from '../../../src/core/setup/autoSetup.js';

test('runAutoSetup marks first run and suggests onboarding when memory count is zero', async () => {
  const result = await runAutoSetup(
    { count: () => 0 },
    { isReady: () => true, providerKind: 'local' },
  );

  assert.equal(result.databaseReady, true);
  assert.equal(result.memoryCount, 0);
  assert.equal(result.isFirstRun, true);
  assert.ok(result.suggestions.includes('运行 profile_onboard 开始个性化配置'));
});

test('runAutoSetup suggests transformer install when embedding provider is noop', async () => {
  const result = await runAutoSetup(
    { count: () => 12 },
    { isReady: () => false, providerKind: 'none' },
  );

  assert.equal(result.embeddingProvider, 'noop');
  assert.ok(result.suggestions.includes('安装 @xenova/transformers 以启用语义搜索'));
});

test('runAutoSetup reports database ready when count succeeds', async () => {
  const result = await runAutoSetup(
    { count: () => 3 },
    { isReady: () => true, providerKind: 'openai' },
  );

  assert.equal(result.databaseReady, true);
  assert.equal(result.memoryCount, 3);
  assert.equal(result.embeddingProvider, 'openai');
});
