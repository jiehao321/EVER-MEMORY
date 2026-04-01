import test from 'node:test';
import assert from 'node:assert/strict';
import { butlerTune } from '../../src/tools/butlerTune.js';
import { butlerBrief } from '../../src/tools/butlerBrief.js';
import type { ButlerConfig } from '../../src/core/butler/types.js';

function buildConfig(): ButlerConfig {
  return {
    enabled: true,
    mode: 'reduced',
    cognition: {
      dailyTokenBudget: 1000,
      sessionTokenBudget: 250,
      taskTimeoutMs: 30000,
      fallbackToHeuristics: true,
    },
    timeBudgets: {
      sessionStartMs: 500,
      beforeAgentMs: 500,
      agentEndMs: 500,
    },
    attention: {
      maxInsightsPerBriefing: 4,
      tokenBudgetPercent: 0.2,
      minConfidence: 0.4,
    },
    workers: {
      enabled: false,
      maxWorkers: 1,
      taskTimeoutMs: 1000,
    },
  };
}

test('tune mode update returns success', () => {
  const config = buildConfig();
  let modeSet: string | undefined;
  const stateManager = {
    setMode(mode: string) {
      modeSet = mode;
    },
  };

  const result = butlerTune({
    stateManager: stateManager as never,
    config,
    action: 'set',
    key: 'mode',
    value: 'reduced',
  });

  assert.equal(result.action, 'set');
  assert.equal(result.config.mode, 'reduced');
  assert.deepEqual(result.updated, { key: 'mode', value: 'reduced' });
  assert.equal(modeSet, 'reduced');
});

test('get action returns a cloned config', () => {
  const config = buildConfig();

  const result = butlerTune({
    stateManager: { setMode() {} } as never,
    config,
    action: 'get',
  });

  assert.equal(result.action, 'get');
  assert.notEqual(result.config, config);
  assert.deepEqual(result.config, config);
});

test('invalid mode returns error', () => {
  const config = buildConfig();

  assert.throws(() => butlerTune({
    stateManager: { setMode() {} } as never,
    config,
    action: 'set',
    key: 'mode',
    value: 'invalid',
  }), /Invalid Butler mode/);
});

test('invalid key returns error', () => {
  const config = buildConfig();

  assert.throws(() => butlerTune({
    stateManager: { setMode() {} } as never,
    config,
    action: 'set',
    key: 'unsupported.key',
    value: 1,
  }), /Invalid Butler tune key/);
});

test('butler mode validation includes config recovery hints', () => {
  const config = buildConfig();

  assert.throws(() => butlerTune({
    stateManager: { setMode() {} } as never,
    config,
    action: 'set',
    key: 'mode',
    value: 'invalid',
  }), /Invalid Butler mode.*butler config/);
});

test('butlerBrief surfaces butler config and database recovery hints when state is unavailable', async () => {
  await assert.rejects(
    () => butlerBrief({
      agent: {
        getState() {
          return null;
        },
        async runCycle() {},
      } as never,
      overlayGenerator: {} as never,
      narrativeService: {} as never,
      commitmentWatcher: {} as never,
      attentionService: {} as never,
    }),
    /Butler state unavailable.*butler is enabled in config.*database is accessible/,
  );
});
