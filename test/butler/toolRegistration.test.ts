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

function resolveTools(registrations: ToolRegistration[]) {
  const tools = new Map<string, any>();
  for (const registration of registrations) {
    const produced = typeof registration.tool === 'function'
      ? (registration.tool as (ctx: Record<string, unknown>) => unknown)({})
      : registration.tool;
    for (const tool of Array.isArray(produced) ? produced : [produced]) {
      if (!tool || typeof tool !== 'object') {
        continue;
      }
      const names = new Set<string>();
      if (typeof (tool as { name?: unknown }).name === 'string') {
        names.add((tool as { name: string }).name);
      }
      if (registration.opts?.name) {
        names.add(registration.opts.name);
      }
      for (const alias of registration.opts?.names ?? []) {
        names.add(alias);
      }
      for (const name of names) {
        tools.set(name, tool);
      }
    }
  }
  return tools;
}

test('registerButlerTools exposes butler_ask with no required params', async () => {
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
    stateManager: {} as never,
    taskQueue: {} as never,
    cognitiveEngine: {} as never,
    config: createConfig(),
    getActiveQuestions: () => [
      {
        id: 'question-1',
        questionText: 'Do you still want Butler to ask follow-up questions?',
        gapType: 'missing_preference',
        importance: 0.9,
      },
    ],
  });

  const tools = resolveTools(registrations);
  const tool = tools.get('butler_ask');

  assert.ok(tool);
  assert.equal(tool.description, "Get Butler's proactive questions about knowledge gaps");
  assert.deepEqual(Object.keys(tool.parameters.properties ?? {}), []);
  const result = await tool.execute('tool-call-1', {});
  assert.equal(result.details.count, 1);
  assert.equal(result.details.questions[0]?.id, 'question-1');
  assert.match(String(result.content[0]?.text ?? ''), /1 question/);
});
