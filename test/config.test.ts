import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RETRIEVAL_HYBRID_WEIGHTS,
  DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS,
} from '../src/constants.js';
import { loadConfig } from '../src/config.js';
import {
  RETRIEVAL_PRESETS,
  resolvePresetWeights,
} from '../src/tuning/retrieval.js';

function sumWeights(weights: object): number {
  return Object.values(weights as Record<string, number>).reduce((sum, value) => sum + value, 0);
}

test('loadConfig exposes normalized default retrieval weights', () => {
  const config = loadConfig();

  assert.deepEqual(config.retrieval.keywordWeights, DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS);
  assert.deepEqual(config.retrieval.hybridWeights, DEFAULT_RETRIEVAL_HYBRID_WEIGHTS);
  assert.equal(sumWeights(config.retrieval.keywordWeights), 1);
  assert.equal(sumWeights(config.retrieval.hybridWeights), 1);
});

test('retrieval presets expose current default-aligned weights', () => {
  assert.deepEqual(RETRIEVAL_PRESETS.balanced, {
    keywordWeight: DEFAULT_RETRIEVAL_HYBRID_WEIGHTS.keyword,
    semanticWeight: DEFAULT_RETRIEVAL_HYBRID_WEIGHTS.semantic,
    recencyWeight: DEFAULT_RETRIEVAL_HYBRID_WEIGHTS.base,
  });
  assert.deepEqual(resolvePresetWeights('semantic-first'), RETRIEVAL_PRESETS['semantic-first']);
  assert.deepEqual(resolvePresetWeights('keyword-first'), RETRIEVAL_PRESETS['keyword-first']);
});

test('loadConfig accepts custom retrieval weights and keeps normalization', () => {
  const config = loadConfig({
    retrieval: {
      keywordWeights: {
        keyword: 0,
        recency: 0,
        importance: 0,
        confidence: 0,
        explicitness: 0,
        scopeMatch: 0,
        typePriority: 1,
        lifecyclePriority: 0,
      },
      hybridWeights: {
        keyword: 0,
        semantic: 1,
        base: 0,
      },
    },
  });

  assert.equal(config.retrieval.keywordWeights.typePriority, 1);
  assert.equal(config.retrieval.keywordWeights.keyword, 0);
  assert.equal(config.retrieval.hybridWeights.semantic, 1);
  assert.equal(config.retrieval.hybridWeights.keyword, 0);
  assert.equal(sumWeights(config.retrieval.keywordWeights), 1);
  assert.equal(sumWeights(config.retrieval.hybridWeights), 1);
});

test('loadConfig rejects zero-sum retrieval weights', () => {
  assert.throws(
    () => loadConfig({
      retrieval: {
        keywordWeights: {
          keyword: 0,
          recency: 0,
          importance: 0,
          confidence: 0,
          explicitness: 0,
          scopeMatch: 0,
          typePriority: 0,
          lifecyclePriority: 0,
        },
      },
    }),
    /retrieval\.keywordWeights must have a total weight greater than 0/,
  );
});

test('loadConfig rejects zero-sum hybrid retrieval weights', () => {
  assert.throws(
    () => loadConfig({
      retrieval: {
        hybridWeights: {
          keyword: 0,
          semantic: 0,
          base: 0,
        },
      },
    }),
    /retrieval\.hybridWeights must have a total weight greater than 0/,
  );
});

test('loadConfig exposes Butler worker defaults', () => {
  const config = loadConfig();

  assert.equal(config.butler?.workers.enabled, false);
  assert.equal(config.butler?.workers.maxWorkers, 2);
  assert.equal(config.butler?.workers.taskTimeoutMs, 10000);
});

test('loadConfig accepts custom Butler worker config', () => {
  const config = loadConfig({
    butler: {
      workers: {
        enabled: true,
        maxWorkers: 4,
        taskTimeoutMs: 2500,
      },
    },
  });

  assert.equal(config.butler?.workers.enabled, true);
  assert.equal(config.butler?.workers.maxWorkers, 4);
  assert.equal(config.butler?.workers.taskTimeoutMs, 2500);
});
