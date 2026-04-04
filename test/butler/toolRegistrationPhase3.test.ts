import assert from 'node:assert/strict';
import test from 'node:test';
import type { ButlerConfig } from '../../src/core/butler/types.js';
import { registerButlerTools } from '../../src/openclaw/tools/butler.js';

type ToolRegistration = { tool: unknown; opts?: { name?: string; names?: string[] } };

function createConfig(): ButlerConfig {
  return {
    enabled: true,
    mode: 'reduced',
    cognition: {
      dailyTokenBudget: 100,
      sessionTokenBudget: 80,
      taskTimeoutMs: 1500,
      fallbackToHeuristics: true,
    },
    timeBudgets: {
      sessionStartMs: 1500,
      beforeAgentMs: 800,
      agentEndMs: 600,
    },
    attention: {
      maxInsightsPerBriefing: 3,
      tokenBudgetPercent: 0.2,
      minConfidence: 0.4,
    },
    workers: {
      enabled: false,
      maxWorkers: 2,
      taskTimeoutMs: 10000,
    },
  };
}

function resolveTool(registrations: ToolRegistration[], name: string): any {
  for (const registration of registrations) {
    const produced = typeof registration.tool === 'function'
      ? (registration.tool as (ctx: Record<string, unknown>) => unknown)({})
      : registration.tool;
    for (const tool of Array.isArray(produced) ? produced : [produced]) {
      if ((tool as { name?: string }).name === name || registration.opts?.name === name) {
        return tool;
      }
    }
  }
  return undefined;
}

test('registerButlerTools allows butler_tune evolution parameter inspection', async () => {
  const registrations: ToolRegistration[] = [];
  registerButlerTools({
    api: {
      registerTool(tool: unknown, opts?: { name?: string; names?: string[] }) {
        registrations.push({ tool, opts });
      },
    } as never,
    agent: {} as never,
    overlayGenerator: {} as never,
    narrativeService: {} as never,
    commitmentWatcher: {} as never,
    attentionService: {} as never,
    goalService: {} as never,
    stateManager: { setMode() {} } as never,
    taskQueue: {} as never,
    cognitiveEngine: {} as never,
    config: createConfig(),
    parameterTuner: {
      getAllParameters: () => [
        {
          key: 'task_drain_budget',
          currentValue: 3,
          minValue: 1,
          maxValue: 10,
          description: 'Max tasks drained per cycle',
        },
      ],
    } as never,
    getActiveQuestions: () => [],
  });

  const tool = resolveTool(registrations, 'butler_tune');
  const keySchema = tool.parameters.properties.key.anyOf.map((entry: { const: string }) => entry.const);
  const result = await tool.execute('tool-call-1', { action: 'get', key: 'evolution.parameters' });

  assert.ok(keySchema.includes('evolution.parameters'));
  assert.equal(result.details.parameters[0]?.key, 'task_drain_budget');
});
