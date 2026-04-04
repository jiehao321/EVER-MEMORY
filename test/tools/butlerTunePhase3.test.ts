import assert from 'node:assert/strict';
import test from 'node:test';
import type { ButlerConfig } from '../../src/core/butler/types.js';
import { butlerTune } from '../../src/tools/butlerTune.js';

function createConfig(): ButlerConfig {
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

test('butlerTune get can return evolution parameters', () => {
  const result = butlerTune({
    stateManager: { setMode() {} } as never,
    config: createConfig(),
    action: 'get',
    key: 'evolution.parameters',
    parameterTuner: {
      getAllParameters: () => [
        {
          key: 'overlay_confidence_threshold',
          currentValue: 0.33,
          minValue: 0.1,
          maxValue: 0.8,
          description: 'Min overlay confidence to surface',
        },
      ],
    },
  });

  assert.equal(result.action, 'get');
  assert.equal(result.parameters?.[0]?.key, 'overlay_confidence_threshold');
  assert.equal(result.parameters?.[0]?.currentValue, 0.33);
});
